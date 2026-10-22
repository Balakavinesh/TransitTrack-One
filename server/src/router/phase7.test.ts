import { parseGtfsDate, parseGtfsTime, type ServiceCalendar } from '../gtfs/index.js';
import { describe, expect, it } from 'vitest';
import {
  emissionsComparable,
  estimateJourneyEmissions,
  type EmissionFactorRef,
} from './emissions.js';
import { planJourneys, planReachability, type PlanRequest, type TransitLegView } from './plan.js';
import { reachableStops } from './raptor.js';
import { buildSnapshot } from './snapshot.js';
import type { Mode } from '../shared/index.js';
import type { RouterInput } from './types.js';
import { validateJourney } from './validate.js';

const T = (hhmm: string) => parseGtfsTime(`${hhmm}:00`)!;
const daily = (id: string, end = '20301231'): ServiceCalendar => ({
  serviceId: id,
  weekly: {
    days: [true, true, true, true, true, true, true],
    start: parseGtfsDate('20200101')!,
    end: parseGtfsDate(end)!,
  },
  added: new Set(),
  removed: new Set(),
});

/**
 * Bus A → B (08:05 → 08:15) → C (08:30). Metro M1 → M2 (08:20 → 08:28), M1 ≈ 30 m from B,
 * CMRL calendar expired (projected). Suburban S1 → S2 (08:00 → 08:20).
 */
function network(): RouterInput {
  const stop = (gtfsId: string, agency: string, lat: number, lon: number) => ({
    gtfsId,
    name: gtfsId,
    lat,
    lon,
    agency,
    parentGtfsId: null,
    locationType: 0,
  });
  const stops = [
    stop('MTC-A', 'MTC', 13.0, 80.2),
    stop('MTC-B', 'MTC', 13.01, 80.2),
    stop('MTC-C', 'MTC', 13.03, 80.2),
    stop('CMRL-M1', 'CMRL', 13.0102, 80.2001),
    stop('CMRL-M2', 'CMRL', 13.03, 80.22),
    stop('SRR-S1', 'SRR', 13.1, 80.25),
    stop('SRR-S2', 'SRR', 13.15, 80.25),
  ];
  const at = (id: string) => stops.findIndex((s) => s.gtfsId === id);
  const trip = (id: string, route: number, service: string, calls: [string, string][]) => ({
    gtfsId: id,
    route,
    serviceId: service,
    headsign: null,
    directionId: 0,
    hasShape: false,
    stops: calls.map(([s]) => at(s)),
    arrival: calls.map(([, t]) => T(t)),
    departure: calls.map(([, t]) => T(t)),
  });
  const ev = (reliable: boolean) => ({
    kind: 'source_update' as const,
    date: '2026-10-01',
    reliable,
    basis: 'test',
  });
  return {
    feedVersionId: 1,
    buildId: 'tt-test',
    contentHash: 'test',
    agencies: [
      { code: 'MTC', prefix: 'MTC-', sourceId: 'mtc', commit: 'a'.repeat(40), evidence: ev(true) },
      {
        code: 'CMRL',
        prefix: 'CMRL-',
        sourceId: 'cmrl',
        commit: 'b'.repeat(40),
        evidence: ev(false),
      },
      { code: 'SRR', prefix: 'SRR-', sourceId: 'srr', commit: 'c'.repeat(40), evidence: ev(false) },
    ],
    stops,
    routes: [
      { gtfsId: 'MTC-1', agency: 'MTC', shortName: '1', longName: null, routeType: 3 },
      { gtfsId: 'CMRL-B', agency: 'CMRL', shortName: 'Blue', longName: null, routeType: 1 },
      { gtfsId: 'SRR-1', agency: 'SRR', shortName: '1', longName: null, routeType: 1 },
    ],
    trips: [
      trip('MTC-t', 0, 'MTC-D', [
        ['MTC-A', '08:05'],
        ['MTC-B', '08:15'],
        ['MTC-C', '08:30'],
      ]),
      trip('CMRL-t', 1, 'CMRL-D', [
        ['CMRL-M1', '08:20'],
        ['CMRL-M2', '08:28'],
      ]),
      trip('SRR-t', 2, 'SRR-D', [
        ['SRR-S1', '08:00'],
        ['SRR-S2', '08:20'],
      ]),
    ],
    calendars: new Map([
      ['MTC', new Map([['MTC-D', daily('MTC-D')]])],
      ['CMRL', new Map([['CMRL-D', daily('CMRL-D', '20211231')]])],
      ['SRR', new Map([['SRR-D', daily('SRR-D')]])],
    ]),
    transfers: [],
    pathways: [],
  };
}

const snap = buildSnapshot(network(), {
  horizonStart: '2026-10-15',
  horizonDays: 30,
  footpathMaxM: 400,
  builtAt: '2026-10-15T00:00:00Z',
});
const thresholds = { currentMaxAgeDays: 30, agingMaxAgeDays: 180 };
const reach = (extra: Partial<Parameters<typeof planReachability>[1]> = {}) =>
  planReachability(snap, {
    from: { kind: 'stop', id: 'MTC-A' },
    date: '2026-10-20',
    departAt: T('08:00'),
    maxDurationMin: 30,
    maxTransfers: 2,
    minTransferSec: 120,
    maxWalkM: 1000,
    modes: ['bus', 'metro', 'suburban_rail'],
    includeProjected: true,
    projectionEnabledForFeed: true,
    thresholds,
    ...extra,
  });

describe('reachability (SPEC F10)', () => {
  it('finds every stop within the limit, with the label of the journey that reaches it', () => {
    const r = reach();
    const byId = Object.fromEntries(r.stops.map((s) => [s.id, s]));
    expect(Object.keys(byId).sort()).toEqual(['CMRL-M1', 'CMRL-M2', 'MTC-A', 'MTC-B', 'MTC-C']);
    expect(byId['MTC-A']).toMatchObject({ minutes: 0, vehicles: 0, label: null });
    expect(byId['MTC-B']).toMatchObject({ minutes: 15, vehicles: 1, label: 'current' });
    // Bus + walk + projected metro: the journey label is projected.
    expect(byId['CMRL-M2']).toMatchObject({ minutes: 28, vehicles: 2, label: 'projected' });
    // Walking budget = remaining seconds × 1.2 / 1.3, capped by the walking limit.
    expect(byId['MTC-B'].walkBudgetM).toBe(Math.floor((15 * 60 * 1.2) / 1.3));
    expect(byId['MTC-C'].minutes).toBe(30);
  });

  it('respects the time limit, the projection switch and exclusions', () => {
    expect(
      reach({ maxDurationMin: 20 })
        .stops.map((s) => s.id)
        .sort(),
    ).toEqual(['CMRL-M1', 'MTC-A', 'MTC-B']);
    expect(reach({ includeProjected: false }).stops.map((s) => s.id)).not.toContain('CMRL-M2');
    expect(
      reach({ excluded: { stopIds: [], routeIds: ['MTC-1'] } }).stops.map((s) => s.id),
    ).toEqual(['MTC-A']);
  });

  it('every reconstructed journey passes the property checks', () => {
    const reached = reachableStops(snap, {
      date: '2026-10-20',
      departAt: T('08:00'),
      maxDurationSec: 1800,
      maxTransfers: 2,
      minTransferSec: 120,
      includeProjected: true,
      allowedAgencies: new Set([0, 1, 2]),
      origins: [{ stop: 0, sec: 0, meters: 0 }],
    });
    expect(reached.length).toBeGreaterThan(2);
    for (const r of reached) {
      if (!r.journey) continue;
      expect(
        validateJourney(snap, r.journey, {
          date: '2026-10-20',
          minTransferSec: 120,
          includeProjected: true,
        }),
      ).toEqual([]);
      expect(r.journey.arrival).toBe(r.arrival);
    }
  });
});

describe('reachability from a stop is reachability from a point (SPEC F10)', () => {
  // MTC-X: a stop with no service of its own, ≈ 200 m from MTC-A.
  const withDeadStop = (): RouterInput => {
    const n = network();
    n.stops.push({
      gtfsId: 'MTC-X',
      name: 'MTC-X',
      lat: 13.0018,
      lon: 80.2,
      agency: 'MTC',
      parentGtfsId: null,
      locationType: 0,
    });
    return n;
  };
  const snap2 = buildSnapshot(withDeadStop(), {
    horizonStart: '2026-10-15',
    horizonDays: 30,
    footpathMaxM: 400,
    builtAt: '2026-10-15T00:00:00Z',
  });
  const reachX = (
    maxDurationMin: number,
    extra: Partial<Parameters<typeof planReachability>[1]> = {},
  ) =>
    planReachability(snap2, {
      from: { kind: 'stop', id: 'MTC-X' },
      date: '2026-10-20',
      departAt: T('08:00'),
      maxDurationMin,
      maxTransfers: 2,
      minTransferSec: 120,
      maxWalkM: 1000,
      modes: ['bus', 'metro', 'suburban_rail'],
      includeProjected: true,
      projectionEnabledForFeed: true,
      thresholds,
      ...extra,
    });

  it('walks from a stop without service to nearby stops and continues from there', () => {
    const r = reachX(30);
    const byId = Object.fromEntries(r.stops.map((s) => [s.id, s]));
    // On foot to MTC-A (≈ 200 m), then the 08:05 bus.
    expect(byId['MTC-A']).toMatchObject({ vehicles: 0, label: null });
    expect(byId['MTC-A'].elapsedSec).toBeGreaterThan(0);
    expect(byId['MTC-B']).toMatchObject({ minutes: 15, vehicles: 1, label: 'current' });
    // MTC-B is also within the 1 km walking limit (≈ 912 m, 17 min on foot), but the bus is
    // faster and wins; MTC-X, MTC-A, MTC-B and CMRL-M1 are all possible starts.
    expect(r.originStops).toBe(4);
    expect(r.origin).toEqual({ lat: 13.0018, lon: 80.2 });
    // Journey planning from the same stop still means "board here": it finds nothing.
    const journeys = planJourneys(snap2, {
      from: { kind: 'stop', id: 'MTC-X' },
      to: { kind: 'stop', id: 'MTC-B' },
      date: '2026-10-20',
      departAt: T('08:00'),
      windowMin: 60,
      maxTransfers: 2,
      minTransferSec: 120,
      maxWalkM: 1000,
      modes: ['bus', 'metro', 'suburban_rail'],
      includeProjected: true,
      projectionEnabledForFeed: true,
      preference: 'balanced',
      limit: 3,
      thresholds,
    });
    expect(journeys.journeys).toEqual([]);
  });

  it('gives nested results: what is reachable in 30 min is reachable in 45 and 60, at the same time', () => {
    const runs = [30, 45, 60].map((m) => new Map(reachX(m).stops.map((s) => [s.id, s.elapsedSec])));
    const [r30, r45, r60] = runs as [Map<string, number>, Map<string, number>, Map<string, number>];
    for (const [id, sec] of r30) {
      expect(r45.get(id)).toBe(sec);
      expect(r60.get(id)).toBe(sec);
    }
    for (const [id, sec] of r45) expect(r60.get(id)).toBe(sec);
    expect(r30.size).toBeLessThanOrEqual(r45.size);
  });

  it('returns valid ids and coordinates, no duplicates, and keeps projected legs projected', () => {
    const r = reachX(60);
    const ids = r.stops.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of r.stops) {
      expect(snap2.header.strings.stopIds).toContain(s.id);
      expect(Number.isFinite(s.location.lat) && Number.isFinite(s.location.lon)).toBe(true);
      expect(s.elapsedSec).toBeLessThanOrEqual(60 * 60);
      expect(s.minutes).toBe(Math.ceil(s.elapsedSec / 60));
      expect(['MTC', 'CMRL', 'SRR']).toContain(s.agency);
    }
    const metro = r.stops.find((s) => s.id === 'CMRL-M2');
    expect(metro).toMatchObject({ label: 'projected', mode: 'metro', agency: 'CMRL' });
    expect(reachX(60, { includeProjected: false }).stops.map((s) => s.id)).not.toContain('CMRL-M2');
  });
});

describe('emissions (SPEC F11)', () => {
  const factors = new Map<Mode, EmissionFactorRef>([
    [
      'bus',
      {
        id: 'bus',
        mode: 'bus',
        value: 0.015161,
        source: 's',
        tableRef: 't',
        year: 'y',
        notApplicableTo: null,
      },
    ],
    [
      'suburban_rail',
      {
        id: 'sub',
        mode: 'suburban_rail',
        value: 0.007976,
        source: 's',
        tableRef: 't',
        year: 'y',
        notApplicableTo: 'MRTS',
      },
    ],
  ]);
  const base: Omit<PlanRequest, 'from' | 'to'> = {
    date: '2026-10-20',
    departAt: T('07:55'),
    windowMin: 30,
    maxTransfers: 2,
    minTransferSec: 120,
    maxWalkM: 1000,
    modes: ['bus', 'metro', 'suburban_rail'],
    includeProjected: true,
    projectionEnabledForFeed: true,
    preference: 'fastest',
    limit: 5,
    thresholds,
  };
  const first = (from: string, to: string) =>
    planJourneys(snap, { ...base, from: { kind: 'stop', id: from }, to: { kind: 'stop', id: to } })
      .journeys[0];

  it('bus: stop-to-stop distance × detour × factor, labelled coarse', () => {
    const e = estimateJourneyEmissions(first('MTC-A', 'MTC-C'), { factors, busDetourFactor: 1.3 });
    expect(e.status).toBe('estimated');
    expect(e.quality).toBe('coarse');
    const leg = e.legs[0];
    expect(leg.distanceMethod).toBe('stop_to_stop_with_detour');
    // 0.03° of latitude ≈ 3.336 km straight; × 1.3 ≈ 4.34 km.
    expect(leg.distanceKm).toBeCloseTo(4.34, 1);
    expect(e.kgCo2).toBeCloseTo(4.337 * 0.015161, 2);
  });

  it('metro has no documented factor: the journey is partial, with no total', () => {
    const e = estimateJourneyEmissions(first('MTC-A', 'CMRL-M2'), {
      factors,
      busDetourFactor: 1.3,
    });
    expect(e.status).toBe('partial');
    expect(e.kgCo2).toBeNull();
    const metro = e.legs.find((l) => l.mode === 'metro')!;
    expect(metro).toMatchObject({ status: 'unavailable', kgCo2: null });
    expect(metro.reason).toMatch(/No documented emission factor for metro/);
  });

  it('a factor that does not apply (e.g. MRTS) makes the leg unavailable, never guessed', () => {
    const e = estimateJourneyEmissions(first('SRR-S1', 'SRR-S2'), {
      factors,
      busDetourFactor: 1.3,
      notApplicable: (l: TransitLegView) =>
        l.route.id === 'SRR-1' ? 'Not applicable to MRTS.' : null,
    });
    expect(e).toMatchObject({
      status: 'unavailable',
      kgCo2: null,
      reason: 'Not applicable to MRTS.',
    });
    const ok = estimateJourneyEmissions(first('SRR-S1', 'SRR-S2'), {
      factors,
      busDetourFactor: 1.3,
    });
    expect(ok.legs[0]).toMatchObject({ status: 'estimated', distanceMethod: 'stop_to_stop' });
  });

  it('compares journeys only when every one has a full estimate', () => {
    const bus = estimateJourneyEmissions(first('MTC-A', 'MTC-C'), {
      factors,
      busDetourFactor: 1.3,
    });
    const metro = estimateJourneyEmissions(first('MTC-A', 'CMRL-M2'), {
      factors,
      busDetourFactor: 1.3,
    });
    expect(emissionsComparable([bus, bus])).toBe(true);
    expect(emissionsComparable([bus, metro])).toBe(false);
    expect(emissionsComparable([bus])).toBe(false);
  });
});
