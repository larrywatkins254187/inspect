import fs from 'node:fs';
import path from 'node:path';
import { CONFIG_NAME_SET } from './names';

/**
 * Protected configuration file parser (PRD §18.2). Each line is
 * `NAME="JSON-quoted string"`. The file is parsed, never shell-sourced; unknown
 * names are rejected; values are never echoed in errors.
 */
export interface ParseResult {
  values: Record<string, string>;
  errors: string[];
  unknown: string[];
}

const LINE = /^([A-Z][A-Z0-9_]{1,63})=(".*")\s*$/;

export function parseSecretsText(text: string): ParseResult {
  const values: Record<string, string> = {};
  const errors: string[] = [];
  const unknown: string[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) return;
    const m = LINE.exec(line);
    if (!m) {
      errors.push(`line ${i + 1}: expected NAME="JSON string" (value not shown)`);
      return;
    }
    const name = m[1]!;
    if (!CONFIG_NAME_SET.has(name)) {
      unknown.push(name);
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(m[2]!);
    } catch {
      errors.push(`line ${i + 1}: ${name} is not a valid JSON-quoted string`);
      return;
    }
    if (typeof parsed !== 'string') {
      errors.push(`line ${i + 1}: ${name} must be a JSON string`);
      return;
    }
    if (/[\0\r\n]/.test(parsed)) {
      errors.push(`line ${i + 1}: ${name} contains control characters`);
      return;
    }
    if (name in values) {
      errors.push(`line ${i + 1}: duplicate ${name}`);
      return;
    }
    values[name] = parsed;
  });
  return { values, errors, unknown };
}

export interface PermissionReport {
  ok: boolean;
  problems: string[];
  mode?: string;
}

/** File must not be world-accessible or group-writable; directory must not be world-writable. */
export function checkSecretsPermissions(file: string): PermissionReport {
  const problems: string[] = [];
  let st: fs.Stats;
  try {
    st = fs.statSync(file);
  } catch {
    return { ok: false, problems: ['file is missing or unreadable'] };
  }
  if (!st.isFile()) problems.push('not a regular file');
  const mode = st.mode & 0o777;
  if (mode & 0o007) problems.push('file is accessible to other users (expected 0640 or 0600)');
  if (mode & 0o020) problems.push('file is group-writable');
  try {
    const dst = fs.statSync(path.dirname(file));
    if (dst.mode & 0o002) problems.push('directory is world-writable');
  } catch {
    problems.push('directory is unreadable');
  }
  if (typeof process.getuid === 'function' && st.uid !== 0 && st.uid !== process.getuid()) {
    problems.push('file is owned by an unexpected user');
  }
  return { ok: problems.length === 0, problems, mode: mode.toString(8).padStart(4, '0') };
}

export const DEFAULT_SECRETS_FILE = '/etc/forexinspect/production.env';

export function resolveSecretsFile(env: NodeJS.ProcessEnv = process.env): string {
  return env.FOREXINSPECT_SECRETS_FILE || DEFAULT_SECRETS_FILE;
}

/**
 * Load the protected file into an env object (without overriding explicit
 * process values). Returns names loaded, never values.
 */
export function loadSecretsInto(
  env: NodeJS.ProcessEnv,
  file = resolveSecretsFile(env),
): { loaded: string[]; skipped: string; errors: string[]; unknown: string[] } {
  if (!fs.existsSync(file)) return { loaded: [], skipped: 'absent', errors: [], unknown: [] };
  const perm = checkSecretsPermissions(file);
  if (!perm.ok) return { loaded: [], skipped: 'unsafe permissions', errors: perm.problems, unknown: [] };
  const res = parseSecretsText(fs.readFileSync(file, 'utf8'));
  if (res.errors.length) return { loaded: [], skipped: 'parse errors', errors: res.errors, unknown: res.unknown };
  const loaded: string[] = [];
  for (const [k, v] of Object.entries(res.values)) {
    if (env[k] === undefined) {
      env[k] = v;
      loaded.push(k);
    }
  }
  return { loaded, skipped: '', errors: [], unknown: res.unknown };
}
