/**
 * Protected configuration setup and diagnostics.
 *   pnpm setup:secrets --check            presence/format/permission diagnostics (no values)
 *   pnpm setup:secrets --import <file>    validate an existing protected file and install it to the target
 * Target: FOREXINSPECT_SECRETS_FILE or /etc/forexinspect/production.env. This does not transfer files
 * between machines and does not authorize any external account.
 */
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG_NAMES } from '../src/config/names';
import { checkSecretsPermissions, parseSecretsText, resolveSecretsFile } from '../src/config/secrets-file';

const argv = process.argv.slice(2);
const target = resolveSecretsFile(process.env);

function diagnose(file: string) {
  const out: string[] = [`file: ${file}`];
  if (!fs.existsSync(file)) {
    out.push('status: ABSENT — the app runs in safe base mode (publication and integrations off).');
    out.push(
      'next: place the protected file there (root:forexinspect 0640) or set FOREXINSPECT_SECRETS_FILE, then re-run --check.',
    );
    return { ok: false, out };
  }
  const perm = checkSecretsPermissions(file);
  out.push(`mode: ${perm.mode ?? '?'} ${perm.ok ? 'OK' : `PROBLEM: ${perm.problems.join('; ')}`}`);
  const res = parseSecretsText(fs.readFileSync(file, 'utf8'));
  if (res.errors.length) out.push(`parse errors: ${res.errors.join('; ')}`);
  if (res.unknown.length) out.push(`unknown names (ignored): ${res.unknown.join(', ')}`);
  const groups = [...new Set(CONFIG_NAMES.map((n) => n.group))];
  for (const g of groups) {
    const names = CONFIG_NAMES.filter((n) => n.group === g);
    const present = names.filter((n) => n.name in res.values);
    const bad = present.filter((n) => {
      const v = res.values[n.name]!;
      if (n.format === 'boolean') return v !== 'true' && v !== 'false';
      if (n.format === 'integer') return !/^\d+$/.test(v);
      if (n.format === 'url') return !/^https?:\/\//.test(v);
      if (n.format === 'token') return v.length < 4 || /\s/.test(v);
      return false;
    });
    out.push(
      `${g}: ${present.length}/${names.length} present${
        present.length < names.length
          ? ` (missing: ${names
              .filter((n) => !(n.name in res.values))
              .map((n) => n.name)
              .join(', ')})`
          : ''
      }${bad.length ? ` · format problems: ${bad.map((b) => b.name).join(', ')}` : ''}`,
    );
  }
  const publicNames = CONFIG_NAMES.filter((n) => n.public).map((n) => n.name);
  out.push(`browser-safe names: ${publicNames.join(', ')} (all others stay server-side)`);
  return { ok: perm.ok && !res.errors.length, out };
}

if (argv[0] === '--import') {
  const src = argv[1];
  if (!src) {
    console.error('usage: --import <existing protected file>');
    process.exit(1);
  }
  const res = parseSecretsText(fs.readFileSync(src, 'utf8'));
  if (res.errors.length) {
    console.error(`refusing to install: ${res.errors.join('; ')}`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o750 });
  const tmp = `${target}.tmp-${process.pid}`;
  fs.copyFileSync(src, tmp);
  fs.chmodSync(tmp, typeof process.getuid === 'function' && process.getuid() === 0 ? 0o640 : 0o600);
  fs.renameSync(tmp, target);
  console.log(
    `installed ${Object.keys(res.values).length} allowlisted names to ${target}${res.unknown.length ? `; unknown names ignored: ${res.unknown.join(', ')}` : ''}`,
  );
  console.log('If running as root, set ownership: chown root:forexinspect ' + target);
}
const d = diagnose(target);
console.log(d.out.join('\n'));
process.exitCode = argv.includes('--strict') && !d.ok ? 1 : 0;
