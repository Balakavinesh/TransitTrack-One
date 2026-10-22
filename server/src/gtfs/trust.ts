import { formatIsoDate } from './date.js';
import type { ServiceDateStatus } from './calendar.js';
import type { FreshnessResult } from './freshness.js';

/** SPEC §3.1 schedule labels (same vocabulary as `TRUST_LABELS` in @transittrack/shared). */
export type ScheduleLabel = 'current' | 'aging' | 'stale' | 'projected' | 'unknown';

export interface ScheduleTrust {
  label: ScheduleLabel;
  /** One line for the "Why this label?" panel. */
  reason: string;
  /** SPEC §3.2: the date whose timetable was used, when projected. */
  projectedFrom: string | null;
  checks: {
    calendarCoverage: 'covered' | 'projected';
    feedAge: FreshnessResult;
    realtime: 'not_available';
  };
}

/**
 * The trust label of a scheduled departure (or journey leg) of one agency on one service date.
 *
 * - The agency's calendar does not cover the date but projection applies → `projected`, with
 *   "Projected from the timetable valid until <date>" (SPEC §3.2). Projection is never mixed
 *   into the age labels.
 * - The calendar covers the date → the agency's feed-age label (`current` | `aging` | `stale`),
 *   or `unknown` when the freshness evidence is unreliable or missing (maintainer decision 2,
 *   2026-10-19: never `current` without reliable evidence).
 *
 * Unavailable dates have no departures to label; callers report them instead.
 */
export function scheduleTrust(
  status: Exclude<ServiceDateStatus, { kind: 'unavailable' }>,
  freshness: FreshnessResult,
): ScheduleTrust {
  if (status.kind === 'projected') {
    return {
      label: 'projected',
      reason: status.message,
      projectedFrom: formatIsoDate(status.from),
      checks: { calendarCoverage: 'projected', feedAge: freshness, realtime: 'not_available' },
    };
  }
  const reason =
    freshness.label === 'unknown'
      ? `Timetable covers this date, but its update date is unknown (${freshness.reason})`
      : `Timetable covers this date; feed age: ${freshness.reason}`;
  return {
    label: freshness.label,
    reason,
    projectedFrom: null,
    checks: { calendarCoverage: 'covered', feedAge: freshness, realtime: 'not_available' },
  };
}
