import 'server-only';
import { cache } from 'react';
import { connection } from 'next/server';
import { config } from '@/config/env';
import { databaseReady, getDb } from '@/db/client';
import { approvedLogo } from '@/domain/assets';
import { listComparisons, readComparison } from '@/domain/comparisons';
import { evidenceStats, readAccounts, readDirectory, readFees, readProfile, readSources, type ReadOptions } from '@/domain/read';
import { latestRates } from '@/domain/rates';

/** One clock reading per request so every read check in a render agrees. */
export const requestNow = cache(() => new Date());

export const readOptions = cache(async (): Promise<ReadOptions> => {
  await connection();
  return { now: requestNow(), publicationEnabled: config().publicationEnabled };
});

export const getDirectory = cache(async () => readDirectory(getDb(), await readOptions()));
export const getProfile = cache(async (slug: string) => readProfile(getDb(), slug, await readOptions()));
export const getFees = cache(async (slug: string) => readFees(getDb(), slug, await readOptions()));
export const getAccounts = cache(async (slug: string) => readAccounts(getDb(), slug, await readOptions()));
export const getSources = cache(async () => readSources(getDb(), await readOptions()));
export const getStats = cache(async () => evidenceStats(await getDirectory()));
export const getComparisons = cache(async () => listComparisons(getDb(), await readOptions()));
export const getComparison = cache(async (slug: string) => readComparison(getDb(), slug, await readOptions()));
export const getLogo = cache(async (brokerId: number) => {
  await connection();
  return approvedLogo(getDb(), brokerId);
});
export const comparisonsFor = async (slug: string) => (await getComparisons()).filter((c) => c.slug.split('-vs-').includes(slug));
export const getRates = cache(async () => {
  await connection();
  const db = getDb();
  return databaseReady(db) ? latestRates(db) : null;
});
