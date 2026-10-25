import { z } from 'zod';
import type { DB } from '@/db/client';
import { runStructured } from '@/ai/receipts';
import { untrustedBlock, type AiProvider } from '@/ai/provider';
import { sha256 } from '@/lib/hash';
import { validateReading, type Reading, type ValidatedReading } from './fields';
import { currentPolicy, evaluateUse, getSource } from './policy';
import { PARSER_VERSION } from './text';

export const EXTRACT_PROMPT_VERSION = 'extract-v4';
export const OPERATOR_PROMPT_VERSION = 'operator-v1';
export const EXTRACT_TIMEOUT_MS = 90_000;

const scopeSchema = z
  .object({
    account: z.string().max(80).nullable(),
    platform: z.string().max(40).nullable(),
    entity: z.string().max(160).nullable(),
    jurisdiction: z.string().max(60).nullable(),
    instrument: z.string().max(20).nullable(),
    qualifier: z.string().max(80).nullable(),
    clientClass: z.string().max(40).nullable(),
    spreadBasis: z.string().max(40).nullable(),
    commissionSide: z.enum(['PER_SIDE', 'ROUND_TURN']).nullable(),
    commissionVolume: z.string().max(60).nullable(),
  })
  .strict();

export const readingSchema = z
  .object({
    field: z.string().max(40),
    value: z.string().max(200),
    unit: z.string().max(20).nullable(),
    currency: z.string().max(3).nullable(),
    scope: scopeSchema,
    quote: z.string().max(600),
    locator: z.string().max(300),
    effectiveDate: z.string().max(10).nullable(),
  })
  .strict();

export const extractionSchema = z.object({ readings: z.array(readingSchema).max(60) }).strict();
export type ExtractionOutput = z.infer<typeof extractionSchema>;

const nullableString = { type: ['string', 'null'] };
/** JSON schema mirror for providers that require it (all properties required, no extras). */
export const extractionJsonSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['readings'],
  properties: {
    readings: {
      type: 'array',
      maxItems: 60,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['field', 'value', 'unit', 'currency', 'scope', 'quote', 'locator', 'effectiveDate'],
        properties: {
          field: { type: 'string' },
          value: { type: 'string' },
          unit: nullableString,
          currency: nullableString,
          quote: { type: 'string' },
          locator: { type: 'string' },
          effectiveDate: nullableString,
          scope: {
            type: 'object',
            additionalProperties: false,
            required: ['account', 'platform', 'entity', 'jurisdiction', 'instrument', 'qualifier', 'clientClass', 'spreadBasis', 'commissionSide', 'commissionVolume'],
            properties: {
              account: nullableString,
              platform: nullableString,
              entity: nullableString,
              jurisdiction: nullableString,
              instrument: nullableString,
              qualifier: nullableString,
              clientClass: nullableString,
              spreadBasis: nullableString,
              commissionSide: { type: ['string', 'null'], enum: ['PER_SIDE', 'ROUND_TURN', null] },
              commissionVolume: nullableString,
            },
          },
        },
      },
    },
  },
};

const FIELD_HELP = `Fields: account_type (value = literal account name), minimum_deposit (exact decimal, ISO currency),
minimum_lot_size (decimal, unit "lots"), demo_account / islamic_account / mt4_supported / mt5_supported / ctrader_supported /
tradingview_supported / copy_trading (value "true" or "false"; "false" only with explicit negative wording),
eurusd_spread (decimal, unit "pips" or "points", scope.instrument "EUR/USD", spreadBasis as written e.g. "from", "average"),
trading_commission (decimal, ISO currency, commissionSide PER_SIDE or ROUND_TURN only if written, commissionVolume literal e.g. "per lot"),
maximum_leverage (value "1:N"), legal_entity_name (company name exactly as shown, with legal form).`;

/** Two deliberately different pass prompts; agreement is still one source (two readings). */
export function extractionPrompt(pass: 'A' | 'B', brokerName: string, documentText: string): string {
  const instructions =
    pass === 'A'
      ? 'Read the page top to bottom and list every reading that states one of the fields below.'
      : 'Work field by field: for each field below, search the page for explicit statements and list each one separately.';
  return [
    `You extract literal facts about the broker brand "${brokerName}" from one official web page.`,
    instructions,
    FIELD_HELP,
    'Rules: copy `quote` verbatim from the page (≤ 300 characters) containing the value; `locator` names the nearest heading or table.',
    'Scope labels must be literally written near the value; otherwise null. Never infer account, platform, entity or jurisdiction from other pages, URLs or brand.',
    'Never output regulation, licences, protection, eligibility or country availability. A bare "$" is not a currency.',
    'If nothing qualifies return {"readings": []}.',
    untrustedBlock('official-page-text', documentText.slice(0, 60_000)),
  ].join('\n\n');
}

export function operatorPrompt(brokerName: string, documentText: string): string {
  return [
    `Find statements that name the company that operates the "${brokerName}" website or provides its services.`,
    'Only report a legal_entity_name or operating_entity reading when the page literally says "operated by", "services are provided by" or "is a trading name of" that company.',
    'Group-company lists, payment providers and regulator names are not operators. Use field "operating_entity" for operator statements.',
    'Return {"readings": []} when no such statement exists.',
    untrustedBlock('official-page-text', documentText.slice(0, 60_000)),
  ].join('\n\n');
}

export interface ExtractionRunResult {
  documentId: number;
  pass: 'A' | 'B' | 'OPERATOR';
  status: 'RECORDED' | 'REUSED_NO_CHANGE' | 'SKIPPED_POLICY' | 'PROVIDER_FAILED';
  observations: number;
  rejected: { field: string; problems: string[] }[];
  reasons?: string[];
}

interface DocRow {
  id: number;
  source_id: number;
  policy_id: number;
  normalized_hash: string;
  fetched_at: string;
}

/**
 * Run one extraction pass over a fetched document. The document text is passed
 * in (bodies are only retained where licensed). Same source/hash/prompt/pass
 * reuses the receipt; validated readings become immutable observations.
 */
export async function runExtractionPass(
  db: DB,
  provider: AiProvider,
  documentId: number,
  documentText: string,
  pass: 'A' | 'B' | 'OPERATOR',
  now: () => Date,
): Promise<ExtractionRunResult> {
  const doc = db.prepare('SELECT id, source_id, policy_id, normalized_hash, fetched_at FROM source_documents WHERE id = ?').get(documentId) as DocRow | undefined;
  if (!doc) throw new Error('unknown document');
  const source = getSource(db, doc.source_id)!;
  const policy = currentPolicy(db, doc.source_id);
  const gate = evaluateUse(source, policy, 'FACT_REFERENCE', now(), 'PUBLISH');
  if (!gate.allowed) return { documentId, pass, status: 'SKIPPED_POLICY', observations: 0, rejected: [], reasons: gate.reasons };
  const broker = db.prepare('SELECT id, name FROM brokers WHERE id = ?').get(source.broker_id) as { id: number; name: string };
  const promptVersion = pass === 'OPERATOR' ? OPERATOR_PROMPT_VERSION : EXTRACT_PROMPT_VERSION;
  const already = db
    .prepare("SELECT count(*) AS n FROM fact_observations WHERE document_id = ? AND pass_label = ? AND prompt_version = ?")
    .get(documentId, pass, promptVersion) as { n: number };
  const prompt = pass === 'OPERATOR' ? operatorPrompt(broker.name, documentText) : extractionPrompt(pass, broker.name, documentText);
  const res = await runStructured(
    db,
    provider,
    {
      purpose: `extract:${pass}`,
      promptVersion,
      inputHash: sha256(`${doc.source_id}:${doc.normalized_hash}:${pass}`),
      policyHash: sha256(String(policy!.evidence_hash)),
      prompt,
      jsonSchema: extractionJsonSchema,
      schema: extractionSchema,
      timeoutMs: EXTRACT_TIMEOUT_MS,
    },
    now,
  );
  if (!res.ok) return { documentId, pass, status: 'PROVIDER_FAILED', observations: 0, rejected: [], reasons: [res.errorClass] };
  if (res.reused && already.n > 0) return { documentId, pass, status: 'REUSED_NO_CHANGE', observations: 0, rejected: [] };
  const rejected: { field: string; problems: string[] }[] = [];
  const valid: ValidatedReading[] = [];
  for (const r of res.output.readings) {
    if (pass === 'OPERATOR' && r.field !== 'operating_entity' && r.field !== 'legal_entity_name') {
      rejected.push({ field: r.field, problems: ['FIELD_NOT_IN_OPERATOR_CONTRACT'] });
      continue;
    }
    if (pass !== 'OPERATOR' && r.field === 'operating_entity') {
      rejected.push({ field: r.field, problems: ['OPERATOR_REQUIRES_OPERATOR_PASS'] });
      continue;
    }
    const v = validateReading(r as Reading, documentText);
    if (v.ok) valid.push(v.reading);
    else rejected.push({ field: r.field, problems: v.problems });
  }
  recordObservations(db, {
    brokerId: broker.id,
    documentId,
    policyId: policy!.id,
    observedAt: doc.fetched_at,
    pass,
    promptVersion,
    receiptId: res.receiptId,
    readings: valid,
    now: now(),
  });
  return { documentId, pass, status: 'RECORDED', observations: valid.length, rejected };
}

export function recordObservations(
  db: DB,
  p: {
    brokerId: number;
    documentId: number;
    policyId: number;
    observedAt: string;
    pass: 'A' | 'B' | 'OPERATOR' | 'FIXTURE';
    promptVersion: string;
    receiptId: number | null;
    readings: ValidatedReading[];
    now: Date;
  },
): number[] {
  const ins = db.prepare(
    `INSERT INTO fact_observations (broker_id, field_key, value_text, normalized_value, unit, currency, scope_key, scope_json,
      document_id, policy_id, locator, quote_hash, literal_check, observed_at, effective_at, parser, prompt_version, pass_label,
      ai_receipt_id, validation_json, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?)`,
  );
  const evid = db.prepare('INSERT INTO fact_evidence (observation_id, document_id, locator, quote_hash, created_at) VALUES (?,?,?,?,?)');
  return db.transaction(() =>
    p.readings.map((r) => {
      const id = Number(
        ins.run(
          p.brokerId,
          r.field,
          r.valueText,
          r.normalizedValue,
          r.unit,
          r.currency,
          r.scopeKey,
          JSON.stringify(r.scope),
          p.documentId,
          p.policyId,
          r.locator,
          sha256(r.quote),
          p.observedAt,
          r.effectiveDate,
          PARSER_VERSION,
          p.promptVersion,
          p.pass,
          p.receiptId,
          JSON.stringify(r.operatorWording ? [{ operatorWording: r.operatorWording }] : []),
          p.now.toISOString(),
        ).lastInsertRowid,
      );
      evid.run(id, p.documentId, r.locator, sha256(r.quote), p.now.toISOString());
      return id;
    }),
  )();
}
