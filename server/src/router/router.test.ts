import { parseGtfsDate, parseGtfsTime, type ServiceCalendar } from '../gtfs/index.js';
import { describe, expect, it } from 'vitest';
import { buildFootpaths } from './footpaths.js';
import { PlaceError, type Place } from './places.js';
import { planJourneys, type PlanRequest, type TransitLegView, type WalkLegView } from './plan.js';
import { HorizonError, raptor } from './raptor.js';
import { raptorArriveBy } from './reverse.js';
import { deserializeSnapshot, serializeSnapshot } from './serialize.js';
import { buildSnapshot } from './snapshot.js';
import type { RouterInput, Snapshot } from './types.js';
import { validateJourney } from './validate.js';

const T = (hhmmss: string) => parseGtfsTime(hhmmss)!;
const T_ = T;
const D = (yyyymmdd: string) => parseGtfsDate(yyyymmdd)!;

function calendar(
  serviceId: string,
  days: string,
  start: string,
  end: string,
  removed: string[] = [],
): ServiceCalendar {
  return {
    serviceId,
    weekly: { days: [...days].map((c) => c === '1'), start: D(start), end: D(end) },
    added: new Set(),
    removed: new Set(removed.map(D)),
  };
}

/**
 * A small network:
 *   bus 1  A → B             (MTC, daily; 08:00, 08:20, and 24:30 past midnight)
 *   bus 2  A → E             (MTC, slow direct; 08:05 → 09:30); E is next to R2
 *   metro  M1 → M2           (CMRL, Mon–Sat calendar that ended 2021-12-31 → projected)
 *   rail   R1 → R2           (SRR, daily; 08:30, 08:50, and 23:50 → 24:20)
 * B–M1 (~24 m) and M2–R1 (~39 m) are walkable; A and C are 77 m apart.
 * MTC has reliable update evidence; CMRL and SRR do not.
 */
function network(
  opts: { forbidBtoM1?: boolean; overtaking?: boolean; decreasing?: boolean } = {},
): RouterInput {
  const stops: RouterInput['stops'] = [
    {
      gtfsId: 'MTC-A',
      name: 'Alpha',
      lat: 13.0,
      lon: 80.2,
      agency: 'MTC',
      parentGtfsId: null,
      locationType: 0,
    },
    {
      gtfsId: 'MTC-B',
      name: 'Beta',
      lat: 13.01,
      lon: 80.2,
      agency: 'MTC',
      parentGtfsId: null,
      locationType: 0,
    },
    {
      gtfsId: 'MTC-C',
      name: 'Gamma',
      lat: 13.0005,
      lon: 80.2005,
      agency: 'MTC',
      parentGtfsId: null,
      locationType: 0,
    },
    {
      gtfsId: 'MTC-E',
      name: 'Epsilon',
      lat: 13.0601,
      lon: 80.2001,
      agency: 'MTC',
      parentGtfsId: null,
      locationType: 0,
    },
    {
      gtfsId: 'CMRL-MS1',
      name: 'Metro One',
      lat: 13.0101,
      lon: 80.2002,
      agency: 'CMRL',
      parentGtfsId: null,
      locationType: 1,
    },
    {
      gtfsId: 'CMRL-M1',
      name: 'Metro One P1',
      lat: 13.0101,
      lon: 80.2002,
      agency: 'CMRL',
      parentGtfsId: 'CMRL-MS1',
      locationType: 0,
    },
    {
      gtfsId: 'CMRL-MS2',
      name: 'Metro Two',
      lat: 13.03,
      lon: 80.2,
      agency: 'CMRL',
      parentGtfsId: null,
      locationType: 1,
    },
    {
      gtfsId: 'CMRL-M2',
      name: 'Metro Two P1',
      lat: 13.03,
      lon: 80.2,
      agency: 'CMRL',
      parentGtfsId: 'CMRL-MS2',
      locationType: 0,
    },
    {
      gtfsId: 'SRR-RS1',
      name: 'RAIL ONE',
      lat: 13.0302,
      lon: 80.2003,
      agency: 'SRR',
      parentGtfsId: null,
      locationType: 1,
    },
    {
      gtfsId: 'SRR-R1',
      name: 'RAIL ONE',
      lat: 13.0302,
      lon: 80.2003,
      agency: 'SRR',
      parentGtfsId: 'SRR-RS1',
      locationType: 0,
    },
    {
      gtfsId: 'SRR-RS2',
      name: 'RAIL TWO',
      lat: 13.06,
      lon: 80.2,
      agency: 'SRR',
      parentGtfsId: null,
      locationType: 1,
    },
    {
      gtfsId: 'SRR-R2',
      name: 'RAIL TWO',
      lat: 13.06,
      lon: 80.2,
      agency: 'SRR',
      parentGtfsId: 'SRR-RS2',
      locationType: 0,
    },
    {
      gtfsId: 'SRR-ENT',
      name: 'RAIL ONE entrance',
      lat: 13.0303,
      lon: 80.2004,
      agency: 'SRR',
      parentGtfsId: 'SRR-RS1',
      locationType: 2,
    },
  ];
  const at = (id: string) => stops.findIndex((s) => s.gtfsId === id);
  const routes: RouterInput['routes'] = [
    { gtfsId: 'MTC-1', agency: 'MTC', shortName: '1', longName: 'Alpha - Beta', routeType: 3 },
    { gtfsId: 'MTC-2', agency: 'MTC', shortName: '2', longName: 'Alpha - Epsilon', routeType: 3 },
    { gtfsId: 'CMRL-M', agency: 'CMRL', shortName: 'Blue', longName: 'One - Two', routeType: 1 },
    { gtfsId: 'SRR-R', agency: 'SRR', shortName: 'R', longName: 'One - Two', routeType: 1 },
  ];
  const trip = (
    gtfsId: string,
    route: number,
    serviceId: string,
    calls: [string, string][],
    hasShape = false,
  ): RouterInput['trips'][number] => ({
    gtfsId,
    route,
    serviceId,
    headsign: null,
    directionId: 0,
    hasShape,
    stops: calls.map(([s]) => at(s)),
    arrival: calls.map(([, t]) => T(t)),
    departure: calls.map(([, t]) => T(t)),
  });
  const trips = [
    trip('MTC-t1', 0, 'MTC-DAILY', [
      ['MTC-A', '08:00:00'],
      ['MTC-B', '08:10:00'],
    ]),
    trip('MTC-t2', 0, 'MTC-DAILY', [
      ['MTC-A', '08:20:00'],
      ['MTC-B', '08:30:00'],
    ]),
    trip('MTC-night', 0, 'MTC-DAILY', [
      ['MTC-A', '24:30:00'],
      ['MTC-B', '24:40:00'],
    ]),
    trip('MTC-slow', 1, 'MTC-DAILY', [
      ['MTC-A', '08:05:00'],
      ['MTC-E', '09:30:00'],
    ]),
    trip(
      'CMRL-m1',
      2,
      'CMRL-WD',
      [
        ['CMRL-M1', '08:15:00'],
        ['CMRL-M2', '08:25:00'],
      ],
      true,
    ),
    trip(
      'CMRL-m2',
      2,
      'CMRL-WD',
      [
        ['CMRL-M1', '08:30:00'],
        ['CMRL-M2', '08:40:00'],
      ],
      true,
    ),
    trip('SRR-r1', 3, 'SRR-D', [
      ['SRR-R1', '08:30:00'],
      ['SRR-R2', '08:45:00'],
    ]),
    trip('SRR-r2', 3, 'SRR-D', [
      ['SRR-R1', '08:50:00'],
      ['SRR-R2', '09:05:00'],
    ]),
    trip('SRR-night', 3, 'SRR-D', [
      ['SRR-R1', '23:50:00'],
      ['SRR-R2', '24:20:00'],
    ]),
  ];
  if (opts.overtaking) {
    // An express that leaves later and arrives earlier than t1.
    trips.push(
      trip('MTC-slowlocal', 0, 'MTC-DAILY', [
        ['MTC-A', '07:58:00'],
        ['MTC-B', '08:40:00'],
      ]),
    );
  }
  if (opts.decreasing) {
    trips.push(
      trip('MTC-broken', 0, 'MTC-DAILY', [
        ['MTC-A', '09:00:00'],
        ['MTC-B', '08:50:00'],
      ]),
    );
  }
  return {
    feedVersionId: 1,
    buildId: 'tt-test',
    contentHash: 'test',
    agencies: [
      {
        code: 'MTC',
        prefix: 'MTC-',
        sourceId: 'mtc',
        commit: 'a'.repeat(40),
        evidence: { kind: 'source_update', date: '2026-10-01', reliable: true, basis: 'test' },
      },
      {
        code: 'CMRL',
        prefix: 'CMRL-',
        sourceId: 'cmrl',
        commit: 'b'.repeat(40),
        evidence: {
          kind: 'snapshot',
          date: '2026-10-04',
          reliable: false,
          basis: 'mirror date only',
        },
      },
      {
        code: 'SRR',
        prefix: 'SRR-',
        sourceId: 'srr',
        commit: 'c'.repeat(40),
        evidence: {
          kind: 'snapshot',
          date: '2026-10-04',
          reliable: false,
          basis: 'mirror date only',
        },
      },
    ],
    stops,
    routes,
    trips,
    calendars: new Map([
      [
        'MTC',
        new Map([
          ['MTC-DAILY', calendar('MTC-DAILY', '1111111', '20240101', '20301231', ['20261022'])],
        ]),
      ],
      ['CMRL', new Map([['CMRL-WD', calendar('CMRL-WD', '1111110', '20210420', '20211231')]])],
      ['SRR', new Map([['SRR-D', calendar('SRR-D', '1111111', '20250101', '20301231')]])],
    ]),
    transfers: opts.forbidBtoM1
      ? [{ from: at('MTC-B'), to: at('CMRL-M1'), type: 3, minTime: null }]
      : [],
    pathways: [{ from: at('SRR-ENT'), to: at('SRR-R1'), bidirectional: true, traversalTime: 60 }],
  };
}

const snap = (input = network(), horizonStart = '2026-10-15') =>
  buildSnapshot(input, {
    horizonStart,
    horizonDays: 30,
    footpathMaxM: 400,
    builtAt: '2026-10-15T00:00:00Z',
  });

const base: Omit<PlanRequest, 'from' | 'to'> = {
  date: '2026-10-20', // a Tuesday
  departAt: T('07:55:00'),
  windowMin: 60,
  maxTransfers: 3,
  minTransferSec: 120,
  maxWalkM: 1000,
  modes: ['bus', 'metro', 'suburban_rail'],
  includeProjected: true,
  projectionEnabledForFeed: true,
  preference: 'fastest',
  limit: 10,
  thresholds: { currentMaxAgeDays: 30, agingMaxAgeDays: 180 },
};
const stop = (id: string): Place => ({ kind: 'stop', id });
const R2_POINT: Place = { kind: 'point', lat: 13.06, lon: 80.2, label: 'Near Rail Two' };
const plan = (s: Snapshot, from: Place, to: Place, extra: Partial<PlanRequest> = {}) =>
  planJourneys(s, { ...base, from, to, ...extra });
const transitLegs = (legs: (TransitLegView | WalkLegView)[]) =>
  legs.filter((l): l is TransitLegView => l.type === 'transit');

describe('snapshot', () => {
  it('builds patterns, footpaths and per-agency service-day tables', () => {
    const s = snap();
    expect(s.header.stats).toMatchObject({ trips: 9, routableTrips: 9, patterns: 4 });
    // B ↔ M1 and M2 ↔ R1 proximity links, both ways.
    expect(s.header.stats['footpaths_proximity']).toBeGreaterThanOrEqual(4);
    // Tuesday: CMRL projected from 2021-12-31 (Friday, the last in-range weekday).
    const day = (iso: string) => D(iso.replaceAll('-', '')) - D('20261015');
    expect(s.agencyDayStatus[1 * 30 + day('2026-10-20')]).toBe(2);
    expect(
      new Date(s.agencyDayProjectedFrom[1 * 30 + day('2026-10-20')] * 86_400_000)
        .toISOString()
        .slice(0, 10),
    ).toBe('2021-12-31');
    // Sunday: no verified Sunday schedule, nothing projected.
    expect(s.agencyDayStatus[1 * 30 + day('2026-10-25')]).toBe(11);
  });

  it('splits overtaking trips into separate patterns so RAPTOR finds the faster one', () => {
    const s = snap(network({ overtaking: true }));
    expect(s.header.stats['patternsSplitForOvertaking']).toBe(1);
    const r = plan(s, stop('MTC-A'), stop('MTC-B'), { departAt: T('07:55:00'), windowMin: 10 });
    expect(r.journeys[0].legs[0]).toMatchObject({ type: 'transit', trip: { id: 'MTC-t1' } });
  });

  it('leaves out trips whose times go backwards, and counts them', () => {
    const s = snap(network({ decreasing: true }));
    expect(s.header.stats['tripsExcludedDecreasingTimes']).toBe(1);
    expect(s.header.stats['routableTrips']).toBe(9);
  });

  it('round-trips through the binary format without changing any answer', () => {
    const s = snap();
    const back = deserializeSnapshot(serializeSnapshot(s));
    expect(back.header).toEqual(s.header);
    expect(plan(back, stop('MTC-A'), R2_POINT)).toEqual(plan(s, stop('MTC-A'), R2_POINT));
  });

  it('rejects a file that is not a snapshot', () => {
    expect(() => deserializeSnapshot(Buffer.from('not a snapshot at all'))).toThrow(
      /not a TransitTrack/,
    );
  });
});

describe('footpaths', () => {
  it('uses a published traversal time and never links non-boardable nodes', () => {
    const input = network();
    const s = snap(input);
    const ent = input.stops.findIndex((x) => x.gtfsId === 'SRR-ENT');
    // The entrance (location_type 2) gets no footpath even though a pathway names it.
    expect(s.footOffset[ent + 1] - s.footOffset[ent]).toBe(0);
  });

  it('honours transfers.txt type 3 (transfer not possible)', () => {
    const input = network({ forbidBtoM1: true });
    const at = (id: string) => input.stops.findIndex((x) => x.gtfsId === id);
    const parent = new Int32Array(input.stops.length).fill(-1);
    const f = buildFootpaths(input.stops, parent, input.transfers, [], 400);
    const b = at('MTC-B');
    const targets = [...f.to.subarray(f.offset[b], f.offset[b + 1])];
    expect(targets).not.toContain(at('CMRL-M1'));
    const r = plan(snap(input), stop('MTC-A'), R2_POINT);
    expect(r.journeys.every((j) => j.modes.every((m) => m === 'bus'))).toBe(true);
  });

  it('estimates walking time as haversine × 1.3 / 1.2 m/s', () => {
    const input = network();
    const at = (id: string) => input.stops.findIndex((x) => x.gtfsId === id);
    const f = buildFootpaths(input.stops, new Int32Array(input.stops.length).fill(-1), [], [], 400);
    const b = at('MTC-B');
    const e = [...f.to.subarray(f.offset[b], f.offset[b + 1])].indexOf(at('CMRL-M1')) + f.offset[b];
    expect(f.sec[e]).toBe(Math.round((f.meters[e] * 1.3) / 1.2));
    expect(f.published[e]).toBe(0);
  });
});

describe('planJourneys', () => {
  const s = snap();

  it('finds direct journeys, each labelled and scheduled', () => {
    const r = plan(s, stop('MTC-A'), stop('MTC-B'));
    expect(r.empty).toBeNull();
    expect(r.journeys.map((j) => [j.departure, j.arrival, j.transfers])).toEqual([
      ['2026-10-20T08:00:00+05:30', '2026-10-20T08:10:00+05:30', 0],
      ['2026-10-20T08:20:00+05:30', '2026-10-20T08:30:00+05:30', 0],
    ]);
    const leg = r.journeys[0].legs[0] as TransitLegView;
    expect(leg).toMatchObject({
      timeKind: 'scheduled',
      mode: 'bus',
      route: { id: 'MTC-1' },
      trust: { label: 'current', projectedFrom: null, checks: { realtime: 'not_available' } },
      geometry: { quality: 'straight-line' },
      source: { agency: 'MTC', sourceId: 'mtc' },
    });
    expect(r.journeys[0].trust).toEqual({
      label: 'current',
      worstLeg: 0,
      confidence: 'normal',
      freshness: 'current',
      projection: 'none',
      walking: 'none',
      scope: 'timetable_data_only',
    });
  });

  it('finds multimodal journeys with walking transfers and labels the worst leg', () => {
    const r = plan(s, stop('MTC-A'), R2_POINT);
    const fast = r.journeys[0];
    expect(fast.transfers).toBe(2);
    expect(fast.arrival).toBe('2026-10-20T08:45:00+05:30');
    expect(
      fast.legs.map((l) =>
        l.type === 'walk' ? `walk:${l.role}:${l.link}` : `${l.mode}:${l.trust.label}`,
      ),
    ).toEqual([
      'bus:current',
      'walk:transfer:proximity',
      'metro:projected',
      'walk:transfer:proximity',
      'suburban_rail:unknown',
    ]);
    // Projected (metro) is more severe than unknown age (suburban): the label names the metro leg,
    // while the freshness and projection dimensions are reported separately.
    expect(fast.trust).toEqual({
      label: 'projected',
      worstLeg: 2,
      confidence: 'low',
      freshness: 'unknown',
      projection: 'some_legs',
      walking: 'estimated',
      scope: 'timetable_data_only',
    });
    expect(fast.warnings.map((w) => w.code)).toEqual(
      expect.arrayContaining(['projected_schedule', 'freshness_unknown', 'estimated_walking']),
    );
    const walk = fast.legs[1] as WalkLegView;
    expect(walk).toMatchObject({
      method: 'estimated',
      trust: { kind: 'walk', category: 'estimated' },
    });
    expect(walk.meters).toBeGreaterThan(15);
    expect(walk.meters).toBeLessThan(35);
    const metro = fast.legs[2] as TransitLegView;
    expect(metro.trust).toMatchObject({ label: 'projected', projectedFrom: '2021-12-31' });
    expect(metro.trust.reason).toBe('Projected from the timetable valid until 2021-12-31');
    expect(metro.geometry.quality).toBe('track');
  });

  it('ranks by the preset without hiding low-confidence journeys, and points to the reliable one', () => {
    const fastest = plan(s, stop('MTC-A'), R2_POINT, { preference: 'fastest' });
    expect(fastest.journeys.map((j) => [j.transfers, j.trust.label, j.tags])).toEqual([
      [2, 'projected', []],
      [0, 'current', ['most_reliable']],
    ]);
    expect(fastest.journeys[0].rankReason).toContain('low confidence: projected timetable data');
    expect(fastest.journeys[0].rankReason).toContain('option 2 uses more reliable timetable data');
    const fewer = plan(s, stop('MTC-A'), R2_POINT, { preference: 'fewest_transfers' });
    expect(fewer.journeys[0].transfers).toBe(0);
    expect(fewer.journeys[0].tags).toEqual([]);
    expect(fewer.ranking.weights).toEqual({ arrival: 0.2, transfers: 1, walk: 0 });
  });

  it('breaks equal scores by trust: the more reliable journey ranks first', () => {
    // least_walking with both journeys walking ~0 m to the destination stop itself.
    const r = plan(s, stop('MTC-A'), stop('SRR-RS2'), { preference: 'least_walking' });
    expect(r.journeys.length).toBeGreaterThan(0);
    for (let i = 1; i < r.journeys.length; i++) {
      const a = r.journeys[i - 1];
      const b = r.journeys[i];
      if (a.walkMeters === b.walkMeters && a.arrival === b.arrival) {
        expect(
          ['current', 'aging'].includes(a.trust.label) || a.trust.label === b.trust.label,
        ).toBe(true);
      }
    }
  });

  it('applies the transfer buffer to every re-boarding', () => {
    const r = plan(s, stop('MTC-A'), R2_POINT, { minTransferSec: 300 });
    const viaMetro = r.journeys.find((j) => j.modes.includes('metro'))!;
    expect(transitLegs(viaMetro.legs).map((l) => l.scheduledDepartureTime)).toEqual([
      '08:00:00',
      '08:30:00',
      '08:50:00',
    ]);
    expect(viaMetro.arrival).toBe('2026-10-20T09:05:00+05:30');
  });

  it('respects the transfer limit', () => {
    const r = plan(s, stop('MTC-A'), R2_POINT, { maxTransfers: 0 });
    expect(r.journeys.map((j) => j.transfers)).toEqual([0]);
  });

  it('never uses projected metro times when projection is off, and explains the empty result', () => {
    const off = plan(s, stop('MTC-A'), R2_POINT, { includeProjected: false });
    expect(off.journeys.every((j) => !j.modes.includes('metro'))).toBe(true);
    expect(off.projection).toEqual({ requested: false, enabledForFeed: true, applied: false });
    const metroOnly = plan(s, stop('CMRL-MS1'), stop('CMRL-MS2'), { includeProjected: false });
    expect(metroOnly.empty?.reason).toBe('only_projected_schedules_available');
    const admin = plan(s, stop('CMRL-MS1'), stop('CMRL-MS2'), { projectionEnabledForFeed: false });
    expect(admin.empty?.reason).toBe('only_projected_schedules_available');
    expect(admin.empty?.message).toContain('administrator');
  });

  it('never projects weekday metro service onto a Sunday', () => {
    const r = plan(s, stop('CMRL-MS1'), stop('CMRL-MS2'), { date: '2026-10-25' });
    expect(r.journeys).toEqual([]);
    expect(r.empty).toEqual({
      reason: 'no_service_on_date',
      message: 'CMRL: No verified Sunday schedule available',
    });
    const bus = plan(s, stop('MTC-A'), R2_POINT, { date: '2026-10-25' });
    expect(bus.journeys.length).toBeGreaterThan(0);
    expect(bus.journeys.every((j) => !j.modes.includes('metro'))).toBe(true);
  });

  it('carries trips past midnight on their own service day', () => {
    const rail = plan(s, stop('SRR-RS1'), stop('SRR-RS2'), { departAt: T('23:40:00') });
    const leg = transitLegs(rail.journeys[0].legs)[0];
    expect(leg).toMatchObject({
      serviceDate: '2026-10-20',
      scheduledDepartureTime: '23:50:00',
      scheduledArrivalTime: '24:20:00',
      scheduledArrival: '2026-10-21T00:20:00+05:30',
    });
    // Asking on the next calendar date just after midnight finds the previous service day's bus.
    const bus = plan(s, stop('MTC-A'), stop('MTC-B'), {
      date: '2026-10-21',
      departAt: T('00:00:00'),
    });
    expect(transitLegs(bus.journeys[0].legs)[0]).toMatchObject({
      trip: { id: 'MTC-night' },
      serviceDate: '2026-10-20',
      scheduledDepartureTime: '24:30:00',
      scheduledDeparture: '2026-10-21T00:30:00+05:30',
    });
  });

  it('respects calendar exceptions at service-day boundaries', () => {
    // 2026-10-22 is removed from MTC's calendar.
    const removed = plan(s, stop('MTC-A'), stop('MTC-B'), {
      date: '2026-10-22',
      departAt: T('07:00:00'),
    });
    expect(removed.empty).toEqual({
      reason: 'no_service_on_date',
      message: 'MTC: No scheduled service on this date',
    });
    // Just after midnight on the 22nd, the 21st's night bus still runs (its service day is the 21st).
    const early = plan(s, stop('MTC-A'), stop('MTC-B'), {
      date: '2026-10-22',
      departAt: T('00:00:00'),
    });
    expect(transitLegs(early.journeys[0].legs)[0].serviceDate).toBe('2026-10-21');
    // Just after midnight on the 23rd, the 22nd's night bus does not.
    const none = plan(s, stop('MTC-A'), stop('MTC-B'), {
      date: '2026-10-23',
      departAt: T('00:00:00'),
    });
    expect(none.journeys).toEqual([]);
    expect(none.empty?.reason).toBe('no_connection');
  });

  it('labels the last calendar day covered and the next Saturday projected from the last Saturday', () => {
    const old = snap(network(), '2021-12-20');
    const fri = plan(old, stop('CMRL-MS1'), stop('CMRL-MS2'), {
      date: '2021-12-31',
      departAt: T('08:00:00'),
    });
    expect(transitLegs(fri.journeys[0].legs)[0].trust).toMatchObject({
      label: 'unknown',
      projectedFrom: null,
    });
    const sat = plan(old, stop('CMRL-MS1'), stop('CMRL-MS2'), {
      date: '2022-01-01',
      departAt: T('08:00:00'),
    });
    expect(transitLegs(sat.journeys[0].legs)[0].trust).toMatchObject({
      label: 'projected',
      projectedFrom: '2021-12-25',
    });
    const sun = plan(old, stop('CMRL-MS1'), stop('CMRL-MS2'), {
      date: '2022-01-02',
      departAt: T('08:00:00'),
    });
    expect(sun.empty?.message).toBe('CMRL: No verified Sunday schedule available');
  });

  it('walks from a point to nearby stops with an estimated, unverified walk', () => {
    const r = plan(s, { kind: 'point', lat: 13.0003, lon: 80.2002 }, stop('MTC-B'));
    const access = r.journeys[0].legs[0] as WalkLegView;
    expect(access).toMatchObject({
      type: 'walk',
      role: 'access',
      method: 'estimated',
      trust: { kind: 'walk', category: 'estimated' },
    });
    expect(access.note).toContain('not verified');
    expect(r.search.originStops).toBe(2);
  });

  it('explains when stops are too far, and when origin and destination are the same', () => {
    const far = plan(s, { kind: 'point', lat: 13.3, lon: 80.2 }, stop('MTC-B'));
    expect(far.empty?.reason).toBe('origin_too_far');
    expect(plan(s, stop('MTC-A'), stop('MTC-A')).empty?.reason).toBe('same_place');
  });

  it('rejects unknown stops, entrances and dates outside the snapshot horizon', () => {
    expect(() => plan(s, stop('MTC-NOPE'), stop('MTC-B'))).toThrow(PlaceError);
    expect(() => plan(s, stop('SRR-ENT'), stop('MTC-B'))).toThrow(PlaceError);
    expect(() => plan(s, stop('MTC-A'), stop('MTC-B'), { date: '2027-01-01' })).toThrow(
      HorizonError,
    );
  });

  it('only uses the selected modes', () => {
    const r = plan(s, stop('MTC-A'), R2_POINT, { modes: ['bus'] });
    expect(r.journeys.every((j) => j.modes.every((m) => m === 'bus'))).toBe(true);
  });
});

describe('journey properties on every OD pair', () => {
  it('every returned journey is valid against the snapshot', () => {
    const s = snap();
    const boardable = s.header.strings.stopIds.filter((_, i) => s.stopLocationType[i] === 0);
    let journeys = 0;
    for (const date of ['2026-10-20', '2026-10-21', '2026-10-25']) {
      for (const departAt of [T('00:00:00'), T('07:50:00'), T('08:20:00'), T('23:30:00')]) {
        for (const includeProjected of [true, false]) {
          for (const from of boardable) {
            for (const to of boardable) {
              if (from === to) continue;
              const id = (x: string) => s.header.strings.stopIds.indexOf(x);
              const q = {
                date,
                departAt,
                windowSec: 3600,
                maxTransfers: 3,
                minTransferSec: 120,
                includeProjected,
                allowedAgencies: new Set([0, 1, 2]),
                origins: [{ stop: id(from), sec: 0, meters: 0 }],
                destinations: [{ stop: id(to), sec: 0, meters: 0 }],
              };
              for (const j of raptor(s, q)) {
                journeys++;
                expect(
                  validateJourney(s, j, { date, minTransferSec: 120, includeProjected }),
                ).toEqual([]);
              }
            }
          }
        }
      }
    }
    expect(journeys).toBeGreaterThan(20);
  });

  it('every journey between points (with access and egress walks) is valid and starts with its first leg', () => {
    const s = snap();
    const points: Place[] = [
      { kind: 'point', lat: 13.0003, lon: 80.2002 },
      { kind: 'point', lat: 13.0099, lon: 80.2001 },
      { kind: 'point', lat: 13.0301, lon: 80.2001 },
      R2_POINT,
    ];
    let checked = 0;
    for (const from of points) {
      for (const to of points) {
        if (from === to) continue;
        for (const departAt of [T('07:50:00'), T('08:20:00'), T('23:30:00')]) {
          const r = plan(s, from, to, { departAt });
          for (const j of r.journeys) {
            checked++;
            expect(j.departure).toBe(
              j.legs[0].type === 'walk' ? j.legs[0].departure : j.legs[0].scheduledDeparture,
            );
            for (let i = 1; i < j.legs.length; i++) {
              const prev = j.legs[i - 1];
              const cur = j.legs[i];
              const end = prev.type === 'walk' ? prev.arrival : prev.scheduledArrival;
              const start = cur.type === 'walk' ? cur.departure : cur.scheduledDeparture;
              expect(start >= end).toBe(true);
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(5);
    // And the raw journeys pass the full property check.
    const at = (id: string) => s.header.strings.stopIds.indexOf(id);
    for (const j of raptor(s, {
      date: '2026-10-20',
      departAt: T('07:50:00'),
      windowSec: 3600,
      maxTransfers: 3,
      minTransferSec: 120,
      includeProjected: true,
      allowedAgencies: new Set([0, 1, 2]),
      origins: [{ stop: at('MTC-A'), sec: 40, meters: 35 }],
      destinations: [{ stop: at('SRR-R2'), sec: 10, meters: 9 }],
    })) {
      expect(
        validateJourney(s, j, { date: '2026-10-20', minTransferSec: 120, includeProjected: true }),
      ).toEqual([]);
      expect(j.departure).toBe(j.legs[0].departure);
      expect(j.legs[1].departure).toBe(j.legs[0].arrival);
    }
  });
});

describe('arrive-by (reverse RAPTOR)', () => {
  const WINDOW = 3600;
  /**
   * The independent check: the forward range search over every departure that could arrive in
   * [T − window, T]. The latest departure among its journeys arriving in that interval must be
   * the latest departure the reverse search finds (the forward Pareto set always contains it).
   */
  function forwardLatest(
    s: Snapshot,
    q: Omit<Parameters<typeof raptorArriveBy>[1], 'arriveBy'>,
    T: number,
  ): number | null {
    const journeys = raptor(s, {
      ...q,
      departAt: T - WINDOW - 6 * 3600,
      windowSec: 6 * 3600 + WINDOW,
      maxDepartureRuns: 100_000,
    }).filter((j) => j.arrival <= T && j.arrival >= T - WINDOW);
    return journeys.length ? Math.max(...journeys.map((j) => j.departure)) : null;
  }

  it('matches the forward search and returns only valid journeys, on every OD pair', () => {
    const s = snap();
    const boardable = s.header.strings.stopIds.filter((_, i) => s.stopLocationType[i] === 0);
    const id = (x: string) => s.header.strings.stopIds.indexOf(x);
    let compared = 0;
    let journeys = 0;
    for (const date of ['2026-10-20', '2026-10-21', '2026-10-25']) {
      for (const T of [T_('08:30:00'), T_('09:00:00'), T_('09:45:00'), T_('24:40:00')]) {
        for (const includeProjected of [true, false]) {
          for (const from of boardable) {
            for (const to of boardable) {
              if (from === to) continue;
              const q = {
                date,
                windowSec: WINDOW,
                maxTransfers: 3,
                minTransferSec: 120,
                includeProjected,
                allowedAgencies: new Set([0, 1, 2]),
                origins: [{ stop: id(from), sec: 0, meters: 0 }],
                destinations: [{ stop: id(to), sec: 0, meters: 0 }],
              };
              const rev = raptorArriveBy(s, { ...q, arriveBy: T });
              for (const j of rev) {
                journeys++;
                expect(j.arrival).toBeLessThanOrEqual(T);
                expect(j.arrival).toBeGreaterThanOrEqual(T - WINDOW);
                expect(
                  validateJourney(s, j, { date, minTransferSec: 120, includeProjected }),
                ).toEqual([]);
              }
              const fwd = forwardLatest(s, q, T);
              const latest = rev.length ? Math.max(...rev.map((j) => j.departure)) : null;
              expect(
                latest,
                `${from} → ${to} by ${T} on ${date} (projected ${includeProjected})`,
              ).toBe(fwd);
              if (fwd !== null) compared++;
            }
          }
        }
      }
    }
    expect(compared).toBeGreaterThan(20);
    expect(journeys).toBeGreaterThan(20);
  });

  it('plans with access and egress walks from points, like the forward search', () => {
    const s = snap();
    const at = (x: string) => s.header.strings.stopIds.indexOf(x);
    const q = {
      date: '2026-10-20',
      windowSec: WINDOW,
      maxTransfers: 3,
      minTransferSec: 120,
      includeProjected: true,
      allowedAgencies: new Set([0, 1, 2]),
      origins: [{ stop: at('MTC-A'), sec: 40, meters: 35 }],
      destinations: [{ stop: at('SRR-R2'), sec: 10, meters: 9 }],
    };
    const T = T_('09:30:00');
    const rev = raptorArriveBy(s, { ...q, arriveBy: T });
    expect(rev.length).toBeGreaterThan(0);
    for (const j of rev) {
      expect(
        validateJourney(s, j, { date: q.date, minTransferSec: 120, includeProjected: true }),
      ).toEqual([]);
      expect(j.legs[0]).toMatchObject({ kind: 'walk', role: 'access', sec: 40 });
      expect(j.legs.at(-1)).toMatchObject({ kind: 'walk', role: 'egress', sec: 10 });
      expect(j.arrival).toBeLessThanOrEqual(T);
    }
    expect(Math.max(...rev.map((j) => j.departure))).toBe(forwardLatest(s, q, T));
  });

  it('honours excluded stops and routes, and is empty when nothing arrives in time', () => {
    const s = snap();
    const at = (x: string) => s.header.strings.stopIds.indexOf(x);
    const q = {
      date: '2026-10-20',
      windowSec: WINDOW,
      maxTransfers: 3,
      minTransferSec: 120,
      includeProjected: true,
      allowedAgencies: new Set([0, 1, 2]),
      origins: [{ stop: at('MTC-A'), sec: 0, meters: 0 }],
      destinations: [{ stop: at('SRR-R2'), sec: 0, meters: 0 }],
    };
    const all = raptorArriveBy(s, { ...q, arriveBy: T_('09:30:00') });
    const used = new Set(
      all.flatMap((j) =>
        j.legs.map((l) => (l.kind === 'transit' ? s.patternRoute[l.pattern] : -1)),
      ),
    );
    const route = [...used].find((r) => r >= 0)!;
    const without = raptorArriveBy(s, {
      ...q,
      arriveBy: T_('09:30:00'),
      excludedRoutes: new Set([route]),
    });
    for (const j of without) {
      expect(j.legs.some((l) => l.kind === 'transit' && s.patternRoute[l.pattern] === route)).toBe(
        false,
      );
      expect(
        validateJourney(s, j, {
          date: q.date,
          minTransferSec: 120,
          includeProjected: true,
          excludedRoutes: new Set([route]),
        }),
      ).toEqual([]);
    }
    // Long before the first departure nothing can arrive.
    expect(raptorArriveBy(s, { ...q, arriveBy: T_('04:00:00') })).toEqual([]);
  });

  it('plans arrive-by journeys with the same labels and warnings, ranked by latest departure', () => {
    const s = snap();
    const r = plan(s, stop('MTC-A'), R2_POINT, { arriveBy: T_('09:00:00'), preference: 'fastest' });
    expect(r.search).toMatchObject({
      timeMode: 'arrive',
      departureWindow: null,
      arrivalWindow: { from: '2026-10-20T08:00:00+05:30', to: '2026-10-20T09:00:00+05:30' },
    });
    expect(r.ranking.timeCriterion).toBe('departure');
    expect(r.journeys.length).toBeGreaterThan(0);
    for (const j of r.journeys) expect(j.arrival <= '2026-10-20T09:00:00+05:30').toBe(true);
    for (let i = 1; i < r.journeys.length; i++)
      expect(r.journeys[i - 1].departure >= r.journeys[i].departure).toBe(true);
    expect(r.journeys[0].rankReason).toContain('Ranked 1st by latest departure');
    const viaMetro = r.journeys.find((j) => j.modes.includes('metro'));
    if (viaMetro) {
      expect(viaMetro.trust.label).toBe('projected');
      expect(viaMetro.warnings.map((w) => w.code)).toContain('projected_schedule');
      const metro = transitLegs(viaMetro.legs).find((l) => l.mode === 'metro')!;
      expect(metro.trust.reason).toBe('Projected from the timetable valid until 2021-12-31');
    }
    // A journey that arrives by 09:00 and leaves later than every leave-at answer from 07:00
    // that also arrives by 09:00 cannot exist: the arrive-by answer is that latest one.
    const leaveAt = plan(s, stop('MTC-A'), R2_POINT, { departAt: T_('07:00:00'), windowMin: 120 });
    const latestLeaveAt = leaveAt.journeys
      .filter((j) => j.arrival <= '2026-10-20T09:00:00+05:30')
      .map((j) => j.departure)
      .sort()
      .at(-1);
    expect(r.journeys[0].departure).toBe(latestLeaveAt);
  });

  it('arrive-by explains empty results like leave-at searches', () => {
    const s = snap();
    const metroOff = plan(s, stop('CMRL-MS1'), stop('CMRL-MS2'), {
      arriveBy: T_('09:00:00'),
      includeProjected: false,
    });
    expect(metroOff.empty?.reason).toBe('only_projected_schedules_available');
    const sunday = plan(s, stop('CMRL-MS1'), stop('CMRL-MS2'), {
      arriveBy: T_('09:00:00'),
      date: '2026-10-25',
    });
    expect(sunday.empty).toEqual({
      reason: 'no_service_on_date',
      message: 'CMRL: No verified Sunday schedule available',
    });
    const early = plan(s, stop('MTC-A'), R2_POINT, { arriveBy: T_('05:00:00') });
    expect(early.empty?.reason).toBe('no_connection');
    expect(early.empty?.message).toContain('arriving between 04:00 and 05:00');
  });

  it('arrive-by never uses a route closed by a verified report', () => {
    const s = snap();
    const open = plan(s, stop('MTC-A'), R2_POINT, { arriveBy: T_('09:30:00') });
    const metro = open.journeys.flatMap((j) => transitLegs(j.legs)).find((l) => l.mode === 'metro');
    expect(metro).toBeDefined();
    const closed = plan(s, stop('MTC-A'), R2_POINT, {
      arriveBy: T_('09:30:00'),
      excluded: { stopIds: [], routeIds: [metro!.route.id] },
    });
    expect(
      closed.journeys
        .flatMap((j) => transitLegs(j.legs))
        .some((l) => l.route.id === metro!.route.id),
    ).toBe(false);
  });

  it('assigns evidenceBand to legs and journeys', () => {
    const s = snap();
    const result = plan(s, stop('MTC-A'), stop('MTC-B'), { departAt: T_('08:00:00') });
    expect(result.journeys.length).toBeGreaterThan(0);
    const j = result.journeys[0];
    expect(j.evidenceBand).toBeDefined();
    expect(['verified', 'likely', 'uncertain', 'unknown']).toContain(j.evidenceBand);
    for (const leg of j.legs) {
      expect(leg.evidenceBand).toBeDefined();
      expect(['verified', 'likely', 'uncertain', 'unknown']).toContain(leg.evidenceBand);
    }
  });

  it('ranks journeys by most_verified preference', () => {
    const s = snap();
    const result = plan(s, stop('MTC-A'), R2_POINT, {
      departAt: T_('08:00:00'),
      preference: 'most_verified',
    });
    expect(result.ranking.preference).toBe('most_verified');
    if (result.journeys.length > 0) {
      expect(result.journeys[0].rankReason).toContain('Ranked 1st by highest evidence quality');
      expect(result.journeys[0].tags).toContain('most_verified');
    }
  });

  it('evaluates wheelchair access profile without assuming unknown is accessible', () => {
    const s = snap();
    // A bus route where MTC wheelchair boarding is unknown
    const busResult = plan(s, stop('MTC-A'), stop('MTC-B'), {
      departAt: T_('08:00:00'),
      profile: 'wheelchair',
    });
    expect(busResult.journeys.length).toBeGreaterThan(0);
    const busJourney = busResult.journeys[0];
    expect(busJourney.accessibility.profile).toBe('wheelchair');
    // Bus with unconfirmed ramp must NOT be confirmed step free!
    expect(busJourney.accessibility.confirmedStepFree).toBe(false);
    expect(busJourney.accessibility.stepFreeBand).toBe('unknown');
    expect(busJourney.accessibility.limitations.length).toBeGreaterThan(0);
    expect(busJourney.warnings.some((w) => w.code === 'accessibility_unconfirmed')).toBe(true);

    // Metro route (CMRL stations have lifts)
    const metroResult = plan(s, stop('CMRL-MS1'), stop('CMRL-MS2'), {
      departAt: T_('08:00:00'),
      profile: 'wheelchair',
    });
    expect(metroResult.journeys.length).toBeGreaterThan(0);
    const metroJourney = metroResult.journeys[0];
    expect(metroJourney.accessibility.confirmedStepFree).toBe(true);
    expect(metroJourney.tags).toContain('step_free_confirmed');
  });
});
