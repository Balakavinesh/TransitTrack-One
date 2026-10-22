/**
 * Calendar dates as day numbers: whole days since 1970-01-01. Service dates are local
 * calendar dates (Asia/Kolkata has no DST), so plain UTC date arithmetic is exact.
 */
export type DayNumber = number;

const MS_PER_DAY = 86_400_000;
const GTFS_DATE = /^(\d{4})(\d{2})(\d{2})$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const WEEKDAY_COLUMNS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type Weekday = (typeof WEEKDAY_COLUMNS)[number];

function toDayNumber(match: RegExpExecArray | null): DayNumber | null {
  if (!match) return null;
  const [, y = '', m = '', d = ''] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.getTime() / MS_PER_DAY;
}

/** Parses GTFS `YYYYMMDD`. Returns `null` for malformed or impossible dates (e.g. 20260230). */
export function parseGtfsDate(value: string): DayNumber | null {
  return toDayNumber(GTFS_DATE.exec(value));
}

/** Parses ISO `YYYY-MM-DD`. */
export function parseIsoDate(value: string): DayNumber | null {
  return toDayNumber(ISO_DATE.exec(value));
}

export function formatIsoDate(day: DayNumber): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday (1970-01-01 was a Thursday). */
export function dayOfWeek(day: DayNumber): number {
  return (((day + 3) % 7) + 7) % 7;
}

export function weekdayOf(day: DayNumber): Weekday {
  return WEEKDAY_COLUMNS[dayOfWeek(day)] ?? 'monday';
}

/** Today's date in Asia/Kolkata as `YYYY-MM-DD`. */
export function todayInKolkata(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
