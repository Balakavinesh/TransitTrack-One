import { parseIsoDate } from './date.js';

/**
 * Evidence for "how fresh is this agency's data". Kept separate from GTFS service-coverage
 * dates (calendar ranges, feed_info.feed_start_date): a calendar running to 2170 says nothing
 * about when the timetable was last updated.
 */
export interface FreshnessEvidence {
  /**
   * source_update: the date the source itself last changed its data.
   * snapshot: the date a copy of the source was taken (the upstream issue date may be older).
   */
  kind: 'source_update' | 'snapshot';
  /** YYYY-MM-DD */
  date: string;
  /** False when the date cannot be trusted; the label is then `unknown`, never `current`. */
  reliable: boolean;
  /** Human-readable basis, shown in the trust panel. */
  basis: string;
  /** Forces a label regardless of age (e.g. a fallback snapshot is always `stale`). */
  override?: 'stale' | 'unknown';
}

export type FreshnessLabel = 'current' | 'aging' | 'stale' | 'unknown';

export interface FreshnessThresholds {
  currentMaxAgeDays: number;
  agingMaxAgeDays: number;
}

export interface FreshnessResult {
  label: FreshnessLabel;
  ageDays: number | null;
  reason: string;
}

/** SPEC §3.1 feed-age bands, applied to per-agency evidence only. */
export function classifyFreshness(
  evidence: FreshnessEvidence | undefined,
  queryDate: string,
  t: FreshnessThresholds,
): FreshnessResult {
  if (!evidence) return { label: 'unknown', ageDays: null, reason: 'no freshness evidence' };
  const from = parseIsoDate(evidence.date);
  const to = parseIsoDate(queryDate);
  if (from === null || to === null) {
    return { label: 'unknown', ageDays: null, reason: `unparsable date ${evidence.date}` };
  }
  const ageDays = to - from;
  if (!evidence.reliable) {
    return { label: 'unknown', ageDays, reason: `evidence marked unreliable: ${evidence.basis}` };
  }
  if (evidence.override) {
    return {
      label: evidence.override,
      ageDays,
      reason: `forced ${evidence.override}: ${evidence.basis}`,
    };
  }
  if (ageDays < 0) {
    return { label: 'unknown', ageDays, reason: 'evidence date is after the query date' };
  }
  const label =
    ageDays <= t.currentMaxAgeDays ? 'current' : ageDays <= t.agingMaxAgeDays ? 'aging' : 'stale';
  return { label, ageDays, reason: `${evidence.kind} ${evidence.date}, ${ageDays} days old` };
}
