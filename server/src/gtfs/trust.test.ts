import { describe, expect, it } from 'vitest';
import { parseIsoDate } from './date.js';
import type { FreshnessResult } from './freshness.js';
import { scheduleTrust } from './trust.js';

const fresh = (label: FreshnessResult['label']): FreshnessResult => ({
  label,
  ageDays: label === 'unknown' ? null : 10,
  reason: `test ${label}`,
});

describe('scheduleTrust', () => {
  it('labels a projected date projected, with the reference date, whatever the feed age', () => {
    const trust = scheduleTrust(
      {
        kind: 'projected',
        from: parseIsoDate('2021-12-31')!,
        services: ['CMRL-WK'],
        message: 'Projected from the timetable valid until 2021-12-31',
      },
      fresh('current'),
    );
    expect(trust.label).toBe('projected');
    expect(trust.projectedFrom).toBe('2021-12-31');
    expect(trust.reason).toBe('Projected from the timetable valid until 2021-12-31');
    expect(trust.checks.calendarCoverage).toBe('projected');
  });

  it.each(['current', 'aging', 'stale'] as const)(
    'uses the feed-age label %s when the calendar covers the date',
    (label) => {
      const trust = scheduleTrust({ kind: 'covered', services: ['X'] }, fresh(label));
      expect(trust.label).toBe(label);
      expect(trust.projectedFrom).toBeNull();
    },
  );

  it('is unknown, never current, when freshness evidence is unreliable', () => {
    const trust = scheduleTrust({ kind: 'covered', services: ['X'] }, fresh('unknown'));
    expect(trust.label).toBe('unknown');
    expect(trust.reason).toContain('update date is unknown');
  });

  it('always reports realtime as not available', () => {
    expect(
      scheduleTrust({ kind: 'covered', services: ['X'] }, fresh('current')).checks.realtime,
    ).toBe('not_available');
  });
});
