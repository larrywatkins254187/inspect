/** Clock injection so tests can control time. All timestamps are ISO-8601 UTC. */
export type Clock = () => Date;
export const systemClock: Clock = () => new Date();
export const iso = (d: Date): string => d.toISOString();
export const addHours = (d: Date, h: number): Date => new Date(d.getTime() + h * 3_600_000);
export const addMs = (d: Date, ms: number): Date => new Date(d.getTime() + ms);
export const utcDay = (d: Date): string => d.toISOString().slice(0, 10);
/** Human date such as "25 October 2026" (UTC, deterministic). */
export function formatDate(isoText: string | null | undefined): string {
  if (!isoText) return 'Not recorded';
  const d = new Date(isoText);
  if (Number.isNaN(d.getTime())) return 'Not recorded';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
