import type { DayNumber } from '../date.js';
import type { FindingCollector } from '../findings.js';
import { CHENNAI_BBOX, type BBox } from '../geo.js';
import type { GtfsFeed } from '../model.js';
import type { TripIndex } from '../trip-index.js';

export interface ValidationContext {
  /** The date the feed is being imported/audited, `YYYY-MM-DD` (Asia/Kolkata). */
  importDate: string;
  bbox: BBox;
  /** When the source last changed, `YYYY-MM-DD`. Feed-age checks are skipped if absent. */
  feedUpdatedAt?: string;
  trust: { currentMaxAgeDays: number; agingMaxAgeDays: number };
  /** Calendars ending more than this many years after the import date are flagged. */
  farFutureYears: number;
  /** Share of trips that must share a first departure to flag it as a placeholder (0.01 = 1 %). */
  placeholderMinShare: number;
  duplicateStopMeters: number;
}

export const DEFAULT_VALIDATION_OPTIONS: Omit<ValidationContext, 'importDate'> = {
  bbox: CHENNAI_BBOX,
  trust: { currentMaxAgeDays: 30, agingMaxAgeDays: 180 },
  farFutureYears: 2,
  placeholderMinShare: 0.01,
  duplicateStopMeters: 30,
};

export interface RuleInput {
  feed: GtfsFeed;
  ctx: ValidationContext;
  importDay: DayNumber;
  /** Null when stop_times.txt could not be loaded. */
  tripIndex: TripIndex | null;
  findings: FindingCollector;
}

/** Source line of an in-memory stop_times row (rows are 0-based; the header is line 1). */
export function stopTimesLine(st: { line: Int32Array }, rowIndex: number): number {
  return st.line[rowIndex] ?? rowIndex + 2;
}

export function idSet(values: Iterable<string | undefined>): Set<string> {
  const set = new Set<string>();
  for (const value of values) if (value !== undefined) set.add(value);
  return set;
}
