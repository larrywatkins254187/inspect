import type { DirectoryEntry } from '@/domain/read';
import type { FinderEntry } from '@/ui/client/BrokerFinder';

/** Compact client payload: only displayed values, no locators or private fields. */
export const toFinder = (e: DirectoryEntry): FinderEntry => ({
  slug: e.slug,
  name: e.name,
  platforms: e.platforms,
  regulatorCodes: e.regulatorCodes,
  deposit: e.deposit,
  leverage: e.leverage,
  covered: e.coverage.filter((c) => c.covered).map((c) => c.label),
  missing: e.coverage.filter((c) => !c.covered).map((c) => c.label),
  hasFees: e.hasFees,
  hasAccounts: e.hasAccounts,
});
