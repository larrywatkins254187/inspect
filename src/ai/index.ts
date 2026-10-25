import { config } from '@/config/env';
import { codexProvider } from './codex';
import type { AiProvider } from './provider';

/** The configured runtime provider. Credential presence never enables it. */
export function runtimeProvider(): AiProvider {
  const cfg = config();
  return codexProvider(cfg.codex);
}
