import type { z } from 'zod';
import type { DB } from '@/db/client';
import type { AiErrorClass, AiProvider } from './provider';

export interface StructuredRequest<T> {
  purpose: string;
  promptVersion: string;
  inputHash: string;
  policyHash: string;
  prompt: string;
  jsonSchema: Record<string, unknown>;
  schema: z.ZodType<T>;
  timeoutMs: number;
}

export type StructuredResult<T> =
  | { ok: true; output: T; receiptId: number; reused: boolean }
  | { ok: false; errorClass: AiErrorClass; receiptId: number | null };

/**
 * Run a structured model call with a versioned receipt. A succeeded receipt for
 * the same purpose/input/policy/prompt/provider/model/adapter is reused without
 * another model call. No model call happens inside a write transaction.
 */
export async function runStructured<T>(db: DB, provider: AiProvider, req: StructuredRequest<T>, now: () => Date): Promise<StructuredResult<T>> {
  const prior = db
    .prepare(
      `SELECT id, output_json FROM ai_jobs WHERE status = 'SUCCEEDED' AND purpose = ? AND input_hash = ? AND policy_hash = ?
       AND prompt_version = ? AND provider = ? AND model = ? AND adapter_version = ?`,
    )
    .get(req.purpose, req.inputHash, req.policyHash, req.promptVersion, provider.name, provider.model, provider.adapterVersion) as
    | { id: number; output_json: string }
    | undefined;
  if (prior) {
    const parsed = req.schema.safeParse(JSON.parse(prior.output_json));
    if (parsed.success) return { ok: true, output: parsed.data, receiptId: prior.id, reused: true };
  }
  const avail = provider.availability();
  if (!avail.ok) return { ok: false, errorClass: 'UNAVAILABLE', receiptId: null };
  const receiptId = Number(
    db
      .prepare(
        `INSERT INTO ai_jobs (purpose, input_hash, policy_hash, prompt_version, provider, model, adapter_version, status, started_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'STARTED', ?)`,
      )
      .run(req.purpose, req.inputHash, req.policyHash, req.promptVersion, provider.name, provider.model, provider.adapterVersion, now().toISOString())
      .lastInsertRowid,
  );
  const res = await provider.complete(req.prompt, req.jsonSchema, req.timeoutMs);
  const finish = (status: string, output: string | null, errorClass: string | null, usage: object) =>
    db
      .prepare('UPDATE ai_jobs SET status = ?, output_json = ?, error_class = ?, usage_json = ?, finished_at = ? WHERE id = ?')
      .run(status, output, errorClass, JSON.stringify(usage), now().toISOString(), receiptId);
  if (!res.ok) {
    finish('FAILED', null, res.errorClass, { durationMs: res.durationMs });
    return { ok: false, errorClass: res.errorClass, receiptId };
  }
  let json: unknown;
  try {
    json = JSON.parse(res.text);
  } catch {
    finish('INVALID_OUTPUT', null, 'INVALID_OUTPUT', res.usage);
    return { ok: false, errorClass: 'INVALID_OUTPUT', receiptId };
  }
  const parsed = req.schema.safeParse(json);
  if (!parsed.success) {
    finish('INVALID_OUTPUT', null, 'INVALID_OUTPUT', res.usage);
    return { ok: false, errorClass: 'INVALID_OUTPUT', receiptId };
  }
  try {
    finish('SUCCEEDED', JSON.stringify(parsed.data), null, res.usage);
  } catch {
    // A concurrent identical success already exists; reuse semantics still hold.
    finish('FAILED', null, 'DUPLICATE_RECEIPT', res.usage);
  }
  return { ok: true, output: parsed.data, receiptId, reused: false };
}
