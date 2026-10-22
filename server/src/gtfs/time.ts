/** GTFS times are `H:MM:SS` or `HH:MM:SS`; hours may exceed 23 for trips that run past midnight. */
const GTFS_TIME = /^(\d{1,3}):([0-5]\d):([0-5]\d)$/;

export const SECONDS_PER_DAY = 86_400;

/**
 * Parses a GTFS time into integer seconds since the start of the service day
 * (`25:10:00` → 90 600). Returns `null` for anything else, including surrounding whitespace.
 */
export function parseGtfsTime(value: string): number | null {
  const match = GTFS_TIME.exec(value);
  if (!match) return null;
  const [, h = '0', m = '0', s = '0'] = match;
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

/** Formats seconds since service-day start as `HH:MM:SS` (hours may exceed 23). */
export function formatGtfsTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

/**
 * The wall-clock instant of a GTFS time on a service day, in Asia/Kolkata (UTC+05:30, no DST).
 * `24:10:00` on service day 2026-10-19 is 2026-10-20T00:10:00+05:30: the trip still belongs to
 * the 2026-10-19 service day, it just runs past midnight.
 */
export function serviceTimeToInstant(serviceDateIso: string, seconds: number): string {
  const [y, m, d] = serviceDateIso.split('-').map(Number) as [number, number, number];
  // Do the arithmetic on a UTC clock, then label the result with the fixed +05:30 offset.
  const local = new Date(Date.UTC(y, m - 1, d) + seconds * 1000).toISOString().slice(0, 19);
  return `${local}+05:30`;
}
