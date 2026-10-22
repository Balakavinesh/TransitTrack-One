import { describe, expect, it } from 'vitest';
import {
  activeServicesOn,
  buildServiceCalendars,
  isServiceActive,
  projectionReferenceDate,
} from './calendar.js';
import {
  dayOfWeek,
  formatIsoDate,
  parseGtfsDate,
  parseIsoDate,
  todayInKolkata,
  weekdayOf,
} from './date.js';
import type { GtfsFeed } from './model.js';
import { formatGtfsTime, parseGtfsTime } from './time.js';

describe('parseGtfsTime', () => {
  it.each([
    ['00:00:00', 0],
    ['06:30:15', 23_415],
    ['5:03:00', 18_180], // single-digit hour is valid GTFS
    ['23:59:59', 86_399],
    ['24:00:00', 86_400],
    ['25:10:00', 90_600], // past midnight on the same service day
    ['47:59:59', 172_799],
  ])('parses %s as %i seconds', (input, seconds) => {
    expect(parseGtfsTime(input)).toBe(seconds);
  });

  it.each([
    '',
    '12:00',
    '12:60:00',
    '12:00:60',
    '-1:00:00',
    ' 08:00:00',
    '08:00:00 ',
    'ab:cd:ef',
    '6:1O:00',
    '1234:00:00',
  ])('rejects %j', (input) => {
    expect(parseGtfsTime(input)).toBeNull();
  });

  it('round-trips through formatGtfsTime, keeping hours above 23', () => {
    expect(formatGtfsTime(90_600)).toBe('25:10:00');
    expect(formatGtfsTime(parseGtfsTime('07:05:09')!)).toBe('07:05:09');
  });
});

describe('dates', () => {
  it('parses YYYYMMDD and rejects impossible dates', () => {
    expect(formatIsoDate(parseGtfsDate('20240229')!)).toBe('2024-02-29');
    expect(parseGtfsDate('20230229')).toBeNull();
    expect(parseGtfsDate('20260230')).toBeNull();
    expect(parseGtfsDate('2026-10-19')).toBeNull();
    expect(parseIsoDate('20261019')).toBeNull();
  });

  it('knows 2026-10-19 is a Monday and 2021-12-31 a Friday', () => {
    expect(weekdayOf(parseIsoDate('2026-10-19')!)).toBe('monday');
    expect(weekdayOf(parseIsoDate('2021-12-31')!)).toBe('friday');
    expect(dayOfWeek(parseIsoDate('1969-12-28')!)).toBe(6); // Sunday, negative day number
  });

  it('gives the Asia/Kolkata date, which can differ from UTC', () => {
    // 2026-10-19 20:00 UTC is 2026-10-20 01:30 in India.
    expect(todayInKolkata(new Date('2026-10-19T20:00:00Z'))).toBe('2026-10-20');
  });
});

describe('service calendars', () => {
  const rec = (row: number, v: Record<string, string>) => ({ row, v });
  const feed: GtfsFeed = {
    label: 'test',
    files: {},
    stopTimes: null,
    tables: {
      'calendar.txt': {
        file: 'calendar.txt',
        columns: [],
        records: [
          rec(2, {
            service_id: 'WD',
            monday: '1',
            tuesday: '1',
            wednesday: '1',
            thursday: '1',
            friday: '1',
            saturday: '1',
            sunday: '0',
            start_date: '20260101',
            end_date: '20261231',
          }),
        ],
      },
      'calendar_dates.txt': {
        file: 'calendar_dates.txt',
        columns: [],
        records: [
          rec(2, { service_id: 'WD', date: '20261019', exception_type: '2' }),
          rec(3, { service_id: 'HOLIDAY', date: '20261025', exception_type: '1' }),
        ],
      },
    },
  };
  const services = buildServiceCalendars(feed);
  const day = (iso: string) => parseIsoDate(iso)!;

  it('applies weekday flags inside the range', () => {
    expect(isServiceActive(services.get('WD')!, day('2026-10-20'))).toBe(true); // Tuesday
    expect(isServiceActive(services.get('WD')!, day('2026-10-25'))).toBe(false); // Sunday
    expect(isServiceActive(services.get('WD')!, day('2027-01-04'))).toBe(false); // after end
  });

  it('applies calendar_dates removals and additions', () => {
    expect(isServiceActive(services.get('WD')!, day('2026-10-19'))).toBe(false);
    expect(activeServicesOn(services, day('2026-10-25'))).toEqual(['HOLIDAY']);
  });
});

describe('projectionReferenceDate', () => {
  const rec = (row: number, v: Record<string, string>) => ({ row, v });
  // Like CMRL: Monday–Saturday service that ended on Friday 2021-12-31, no Sunday service.
  const feed: GtfsFeed = {
    label: 'cmrl-like',
    files: {},
    stopTimes: null,
    tables: {
      'calendar.txt': {
        file: 'calendar.txt',
        columns: [],
        records: [
          rec(2, {
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
    },
  };
  const services = buildServiceCalendars(feed);
  const ref = (iso: string) => {
    const d = projectionReferenceDate(services, parseIsoDate(iso)!);
    return d === null ? null : formatIsoDate(d);
  };

  it('projects a 2026 weekday from the last in-range weekday', () => {
    expect(ref('2026-10-19')).toBe('2021-12-31'); // Monday → Friday 2021-12-31
  });

  it('projects a Saturday from the last in-range Saturday', () => {
    expect(ref('2026-10-24')).toBe('2021-12-25');
  });

  it('finds no reference for Sunday when the feed never ran on Sundays', () => {
    expect(ref('2026-10-25')).toBeNull();
  });

  it('needs no projection for a covered date', () => {
    expect(ref('2021-06-01')).toBeNull();
  });
});
