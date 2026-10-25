import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AiProvider, ProviderResult } from './provider';

export const CODEX_ADAPTER_VERSION = 'codex-exec-v2';

/**
 * Local Codex CLI adapter: one ephemeral, read-only, structured `codex exec`
 * invocation in an empty temporary directory. Account login is an external
 * prerequisite (`codex login` as the app user); no token is passed here.
 */
export function codexProvider(opts: { enabled: boolean; model: string | null; bin: string }): AiProvider {
  const model = opts.model ?? 'unset';
  return {
    name: 'codex-cli',
    model,
    adapterVersion: CODEX_ADAPTER_VERSION,
    availability() {
      if (!opts.enabled) return { ok: false, reason: 'CODEX_ENABLED is not true' };
      if (!opts.model) return { ok: false, reason: 'CODEX_MODEL is not set' };
      return { ok: true };
    },
    async complete(prompt, jsonSchema, timeoutMs): Promise<ProviderResult> {
      const started = Date.now();
      if (!opts.enabled || !opts.model) return { ok: false, errorClass: 'UNAVAILABLE', durationMs: 0 };
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fi-codex-'));
      const schemaFile = path.join(dir, 'schema.json');
      const outFile = path.join(dir, 'out.json');
      const work = path.join(dir, 'work');
      fs.mkdirSync(work, { mode: 0o700 });
      fs.writeFileSync(schemaFile, JSON.stringify(jsonSchema), { mode: 0o600 });
      const args = [
        'exec',
        '--ephemeral',
        '--sandbox',
        'read-only',
        '--skip-git-repo-check',
        '--cd',
        work,
        '--output-schema',
        schemaFile,
        '--output-last-message',
        outFile,
        '-m',
        opts.model,
        '-',
      ];
      const env: Record<string, string | undefined> = {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        LANG: 'C.UTF-8',
      };
      if (process.env.CODEX_HOME) env.CODEX_HOME = process.env.CODEX_HOME;
      try {
        const code = await new Promise<{ code: number | null; timedOut: boolean; stderr: string }>(
          (resolve) => {
            let timedOut = false;
            let stderr = '';
            const child = spawn(opts.bin, args, {
              cwd: work,
              env: env as NodeJS.ProcessEnv,
              stdio: ['pipe', 'ignore', 'pipe'],
            });
            const timer = setTimeout(() => {
              timedOut = true;
              child.kill('SIGKILL');
            }, timeoutMs);
            child.stderr.on('data', (c: Buffer) => {
              if (stderr.length < 8192) stderr += c.toString('utf8');
            });
            child.on('error', () => {
              clearTimeout(timer);
              resolve({ code: -1, timedOut, stderr });
            });
            child.on('close', (c) => {
              clearTimeout(timer);
              resolve({ code: c, timedOut, stderr });
            });
            child.stdin.end(prompt);
          },
        );
        const durationMs = Date.now() - started;
        if (code.timedOut) return { ok: false, errorClass: 'TIMEOUT', durationMs };
        if (code.code !== 0) {
          // stderr is inspected for a coarse class only and never returned.
          const cls = /quota|rate.?limit|429|usage limit/i.test(code.stderr)
            ? 'QUOTA'
            : /login|auth|unauthori/i.test(code.stderr)
              ? 'UNAVAILABLE'
              : 'PROVIDER_ERROR';
          return { ok: false, errorClass: cls, durationMs };
        }
        const text = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').slice(0, 256 * 1024) : '';
        if (!text.trim()) return { ok: false, errorClass: 'INVALID_OUTPUT', durationMs };
        return { ok: true, text, usage: { units: 1, durationMs } };
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}
