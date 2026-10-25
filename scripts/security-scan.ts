/**
 * Security/bundle exposure scan: secret-like values or server-only names must not appear in client
 * bundles or prerendered HTML; no forbidden patterns in source. Prints names/paths only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG_NAMES } from '../src/config/names';
import { loadSecretsInto } from '../src/config/secrets-file';

const root = process.cwd();
const problems: string[] = [];
const walk = (d: string, out: string[] = []): string[] => {
  if (!fs.existsSync(d)) return out;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) {
      if (!['node_modules', '.git', 'cache'].includes(e.name)) walk(p, out);
    } else out.push(p);
  }
  return out;
};

// 1. Source: no eval, no shell-sourcing of env files, no dangerouslySetInnerHTML outside the audited helpers.
const src = walk(path.join(root, 'src')).concat(walk(path.join(root, 'app')), walk(path.join(root, 'scripts')));
for (const f of src.filter((x) => /\.(ts|tsx)$/.test(x))) {
  const t = fs.readFileSync(f, 'utf8');
  const rel = path.relative(root, f);
  if (/\beval\(|new Function\(/.test(t)) problems.push(`${rel}: eval/new Function`);
  if (/source\s+\/etc\/forexinspect|\.\s+\/etc\/forexinspect/.test(t)) problems.push(`${rel}: shell-sources the secrets file`);
  if (t.includes('dangerouslySetInnerHTML') && !/src\/ui\/primitives\.tsx|app\/layout\.tsx/.test(rel)) problems.push(`${rel}: dangerouslySetInnerHTML outside audited helpers`);
  if (/['"]use client['"]/.test(t) && /from ['"]@\/(db|server|domain\/(?!.*-client))/.test(t)) problems.push(`${rel}: client component imports server modules`);
}

// 2. Client bundles: no server secret NAMES referenced, and no loaded secret VALUES.
const env = { ...process.env };
loadSecretsInto(env);
const secretValues = CONFIG_NAMES.filter((n) => n.secret).map((n) => [n.name, env[n.name]] as const).filter(([, v]) => v && v.length >= 8);
const clientFiles = walk(path.join(root, '.next', 'static')).filter((f) => /\.(js|css|html)$/.test(f));
const htmlFiles = walk(path.join(root, '.next', 'server', 'app')).filter((f) => /\.(html|rsc|body)$/.test(f));
if (!clientFiles.length) problems.push('no .next/static output found — run pnpm build first');
for (const f of [...clientFiles, ...htmlFiles]) {
  const t = fs.readFileSync(f, 'utf8');
  for (const n of CONFIG_NAMES.filter((x) => x.secret)) if (t.includes(n.name)) problems.push(`${path.relative(root, f)}: references server secret name ${n.name}`);
  for (const [name, v] of secretValues) if (t.includes(v!)) problems.push(`${path.relative(root, f)}: contains the value of ${name}`);
  if (/better-sqlite3|\/etc\/forexinspect/.test(t) && f.includes('static')) problems.push(`${path.relative(root, f)}: server-only module in client bundle`);
}

// 3. Repository: no committed env files with values, no private keys.
for (const f of walk(root).filter((x) => !x.includes(`${path.sep}.next${path.sep}`) && !x.includes(`${path.sep}data${path.sep}`))) {
  const rel = path.relative(root, f);
  if (/\.env($|\.)/.test(rel) && !rel.endsWith('.example')) problems.push(`${rel}: env file in working tree`);
  if (/\.(ts|tsx|md|json|toml|conf|service|timer|sql|example)$/.test(rel)) {
    const t = fs.readFileSync(f, 'utf8');
    if (/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(t)) problems.push(`${rel}: private key material`);
  }
}

console.log(`scanned ${src.length} source files, ${clientFiles.length} client assets, ${htmlFiles.length} prerendered files; secret values checked: ${secretValues.length}`);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('security scan: OK');
