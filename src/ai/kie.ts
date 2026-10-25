import { unavailableProvider, type AiProvider } from './provider';

/**
 * Historical Kie.ai requirement (PRD §1, §19). No Kie adapter is implemented:
 * endpoint, model availability, terms and pricing have not been verified for
 * this rebuild, so this provider is permanently unavailable rather than guessed.
 */
export function kieProvider(): AiProvider {
  return unavailableProvider(
    'Kie adapter not implemented: requires verified official endpoint, model, terms and authorized configuration',
  );
}
