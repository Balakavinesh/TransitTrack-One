import { describe, expect, it } from 'vitest';
import { buildServiceCalendars, serviceDateStatus } from './calendar.js';
import { formatIsoDate, parseIsoDate } from './date.js';
import { classifyFreshness, type FreshnessEvidence } from './freshness.js';
import type { GtfsFeed } from './model.js';

const t = { currentMaxAgeDays: 30, agingMaxAgeDays: 180 };
const evidence = (date: string, extra: Partial<FreshnessEvidence> = {}): FreshnessEvidence => ({
  kind: 'snapshot',
  date,
  reliable: true,
  basis: 'test',
  ...extra,
});

describe('classifyFreshness', () => {
  it.each([
    ['2026-10-19', 'current', 0],
    ['2026-09-19', 'current', 30],
    ['2026-09-18', 'aging', 31],
    ['2026-04-22', 'aging', 180],
    ['2026-04-21', 'stale', 181],
    ['2026-03-25', 'stale', 208],
  ])('evidence dated %s → %s (%i days)', (date, label, age) => {
    expect(classifyFreshness(evidence(date), '2026-10-19', t)).toMatchObject({
      label,
      ageDays: age,
    });
  });

  it('never says current when the evidence is unreliable', () => {
    expect(
      classifyFreshness(evidence('2026-10-18', { reliable: false }), '2026-10-19', t).label,
    ).toBe('unknown');
  });

  it('honours a forced stale label (fallback snapshot)', () => {
    expect(
      classifyFreshness(evidence('2026-10-18', { override: 'stale' }), '2026-10-19', t).label,
    ).toBe('stale');
  });

  it('is unknown without evidence, with a bad date, or with a date in the future', () => {
    expect(classifyFreshness(undefined, '2026-10-19', t).label).toBe('unknown');
    expect(classifyFreshness(evidence('not-a-date'), '2026-10-19', t).label).toBe('unknown');
    expect(classifyFreshness(evidence('2026-11-01'), '2026-10-19', t).label).toBe('unknown');
  });
});

describe('serviceDateStatus (CMRL-like Monday–Saturday calendar ending 2021-12-31)', () => {
  const rec = (v: Record<string, string>) => ({ row: 2, v });
  const feed: GtfsFeed = {
    label: 'cmrl-like',
    files: {},
    stopTimes: null,
    tables: {
      'calendar.txt': {
        file: 'calendar.txt',
        columns: [],
        records: [
          rec({
            service_id: 'WD',
            monday: '1',
            tuesday: '1',
            wednesday: '1',
            thursday: '1',
            friday: '1',
            saturday: '1',
            sunday: '0',
            start_date: '20210420',
            end_date: '20211231',
          }),
        ],
      },
      'calendar_dates.txt': {
        file: 'calendar_dates.txt',
        columns: [],
        records: [rec({ service_id: 'WD', date: '20210815', exception_type: '2' })],
      },
    },
  };
  const services = buildServiceCalendars(feed);
  const status = (iso: string, allowProjection = true) =>
    serviceDateStatus(services, parseIsoDate(iso)!, { allowProjection });

  it('projects a 2026 weekday from 2021-12-31, saying so', () => {
    const s = status('2026-10-19');
    expect(s.kind).toBe('projected');
    if (s.kind === 'projected') {
      expect(formatIsoDate(s.from)).toBe('2021-12-31');
      expect(s.message).toBe('Projected from the timetable valid until 2021-12-31');
    }
  });

  it('returns "No verified Sunday schedule available" instead of projecting a weekday', () => {
    expect(status('2026-10-25')).toEqual({
      kind: 'unavailable',
      reason: 'no_verified_schedule_for_day_type',
      dayType: 'sunday',
      message: 'No verified Sunday schedule available',
    });
  });

  it('returns unavailable (not projected) when projection is switched off', () => {
    expect(status('2026-10-19', false)).toMatchObject({
      kind: 'unavailable',
      reason: 'projection_disabled',
    });
  });

  it('distinguishes covered dates from in-range dates without service', () => {
    expect(status('2021-06-01')).toMatchObject({ kind: 'covered', services: ['WD'] });
    expect(status('2021-08-15')).toMatchObject({ kind: 'unavailable', reason: 'no_service' });
  });
});
