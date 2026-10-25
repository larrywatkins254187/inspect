/**
 * Secure launcher: loads the protected configuration file (parsed, never shell-
 * sourced) into the child environment and starts Next. Prints names/counts only.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { loadSecretsInto, resolveSecretsFile } from '../src/config/secrets-file';

const mode = process.argv[2];
if (!mode || !['dev', 'start', 'build'].includes(mode)) {
  console.error('usage: tsx scripts/secure.ts dev|start|build');
  process.exit(1);
}
const env = { ...process.env };
const file = resolveSecretsFile(env);
const res = loadSecretsInto(env, file);
if (res.errors.length) {
  console.error(`protected configuration not loaded (${res.skipped}): ${res.errors.join('; ')}`);
  process.exit(1);
}
console.log(
  res.skipped === 'absent'
    ? `no protected configuration at ${file}; starting safe base mode (integrations and publication off)`
    : `loaded ${res.loaded.length} configuration names from ${file}${res.unknown.length ? `; ignored unknown names: ${res.unknown.join(', ')}` : ''}`,
);
const port = env.PORT ?? '3417';
const host = env.HOSTNAME_BIND ?? '127.0.0.1';
const args = mode === 'build' ? ['build'] : [mode, '--hostname', host, '--port', port];
const require = createRequire(import.meta.url);
const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), ...args], {
  env,
  stdio: 'inherit',
});
child.on('exit', (code) => process.exit(code ?? 1));
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => child.kill(sig));
