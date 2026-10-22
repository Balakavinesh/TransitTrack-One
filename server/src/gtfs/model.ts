import type { GtfsFileName } from './spec.js';

export interface GtfsRecord {
  /** 1-based line number in the source file. */
  row: number;
  /** Raw string values keyed by (trimmed) column name. Missing columns are absent. */
  v: Record<string, string>;
}

export interface GtfsTable {
  file: string;
  columns: string[];
  records: GtfsRecord[];
}

/** Sentinels in `StopTimes.arrival` / `departure`. Real values are ≥ 0. */
export const TIME_EMPTY = -1;
export const TIME_INVALID = -2;
/** Sentinel in `StopTimes.sequence` for a non-integer stop_sequence. */
export const SEQUENCE_INVALID = -1;

/**
 * stop_times.txt in column form: ~1.4 M rows fit in a few tens of MB instead of hundreds.
 * `tripKey`/`stopKey` index into `tripIds`/`stopIds`, the distinct IDs seen in this file
 * (whether or not they exist in trips.txt/stops.txt — rules check that).
 */
export interface StopTimes {
  count: number;
  /** Source line of each row (header = 1); rows that were skipped leave gaps. */
  line: Int32Array;
  tripKey: Int32Array;
  stopKey: Int32Array;
  sequence: Int32Array;
  /** Seconds since service-day start, or TIME_EMPTY / TIME_INVALID. */
  arrival: Int32Array;
  departure: Int32Array;
  tripIds: string[];
  stopIds: string[];
}

export interface FileMeta {
  columns: string[];
  rowCount: number;
}

export interface GtfsFeed {
  label: string;
  /** Every root-level .txt file present, including ones TransitTrack does not load. */
  files: Record<string, FileMeta>;
  tables: Partial<Record<Exclude<GtfsFileName, 'stop_times.txt'>, GtfsTable>>;
  stopTimes: StopTimes | null;
}

export function records(
  feed: GtfsFeed,
  file: Exclude<GtfsFileName, 'stop_times.txt'>,
): GtfsRecord[] {
  return feed.tables[file]?.records ?? [];
}

export function hasColumn(feed: GtfsFeed, file: GtfsFileName, column: string): boolean {
  return feed.files[file]?.columns.includes(column) ?? false;
}
