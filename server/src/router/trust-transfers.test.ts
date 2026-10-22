import { parseGtfsDate, parseGtfsTime, type ServiceCalendar } from '../gtfs/index.js';
import { describe, expect, it } from 'vitest';
import { buildFootpaths } from './footpaths.js';
import { planJourneys, type PlanRequest, type TransitLegView, type WalkLegView } from './plan.js';
import { raptor } from './raptor.js';
import { raptorArriveBy } from './reverse.js';
import { buildSnapshot } from './snapshot.js';
import { buildTransferRules, resolveTransfer } from './transfer-rules.js';
import type { RouterInput } from './types.js';
import { validateJourney } from './validate.js';

const T = (hhmm: string) => parseGtfsTime(`${hhmm}:00`)!;
const daily = (id: string, start = '20240101'): ServiceCalendar => ({
  serviceId: id,
  weekly: {
    days: [true, true, true, true, true, true, true],
    start: parseGtfsDate(start)!,
    end: parseGtfsDate('20301231')!,
  },
  added: new Set(),
  removed: new Set(),
});

/**
 * Bus r1 X → Y arrives 08:10. From Y: bus r2 to Z (same stop) at 08:12, 08:15, 08:25; or walk
 * ~24 m to Y2 for bus r3 to Z at 08:14 and 08:20. Suburban rail P → Q stands alone.
 * MTC has reliable, recent update evidence (current); SRR's evidence is unreliable (unknown).
 */
function network(transfers: RouterInput['transfers'] = []): RouterInput {
  const stops: RouterInput['stops'] = [
    {
      gtfsId: 'MTC-X',
      name: 'X',
      lat: 13.0,
      lon: 80.2,
      agency: 'MTC',
      parentGtfsId: null,
      locationType: 0,
    },
    {
      gtfsId: 'MTC-Y',
      name: 'Y',
      lat: 13.01,
      lon: 80.2,
      agency: 'MTC',
      parentGtfsId: null,
      locationType: 0,
    },
    {
      gtfsId: 'MTC-Y2',
      name: 'Y2',
      lat: 13.0101,
      lon: 80.2002,
      agency: 'MTC',
      parentGtfsId: null,
      locationType: 0,
    },
    {
      gtfsId: 'MTC-Z',
      name: 'Z',
      lat: 13.02,
      lon: 80.2,
      agency: 'MTC',
      parentGtfsId: null,
      locationType: 0,
    },
    {
      gtfsId: 'SRR-P',
      name: 'P',
      lat: 13.03,
      lon: 80.2,
      agency: 'SRR',
      parentGtfsId: null,
      locationType: 0,
    },
    {
      gtfsId: 'SRR-Q',
      name: 'Q',
      lat: 13.05,
      lon: 80.2,
      agency: 'SRR',
      parentGtfsId: null,
      locationType: 0,
    },
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
        code: 'SRR',
        prefix: 'SRR-',
        sourceId: 'srr',
        commit: 'b'.repeat(40),
        evidence: {
          kind: 'snapshot',
          date: '2026-10-04',
          reliable: false,
          basis: 'mirror date only',
        },
      },
    ],
    stops,
    routes: [
      { gtfsId: 'MTC-r1', agency: 'MTC', shortName: 'r1', longName: null, routeType: 3 },
      { gtfsId: 'MTC-r2', agency: 'MTC', shortName: 'r2', longName: null, routeType: 3 },
      { gtfsId: 'MTC-r3', agency: 'MTC', shortName: 'r3', longName: null, routeType: 3 },
      { gtfsId: 'SRR-r4', agency: 'SRR', shortName: 'r4', longName: null, routeType: 1 },
    ],
    trips: [
      trip('MTC-t1', 0, 'MTC-D', [
        ['MTC-X', '08:00'],
        ['MTC-Y', '08:10'],
      ]),
      trip('MTC-a', 1, 'MTC-D', [
        ['MTC-Y', '08:12'],
        ['MTC-Z', '08:20'],
      ]),
      trip('MTC-b', 1, 'MTC-D', [
        ['MTC-Y', '08:15'],
        ['MTC-Z', '08:23'],
      ]),
      trip('MTC-c', 1, 'MTC-D', [
        ['MTC-Y', '08:25'],
        ['MTC-Z', '08:33'],
      ]),
      trip('MTC-d', 2, 'MTC-D', [
        ['MTC-Y2', '08:14'],
        ['MTC-Z', '08:30'],
      ]),
      trip('MTC-e', 2, 'MTC-D', [
        ['MTC-Y2', '08:20'],
        ['MTC-Z', '08:32'],
      ]),
      trip('SRR-s1', 3, 'SRR-D', [
        ['SRR-P', '08:30'],
        ['SRR-Q', '08:45'],
      ]),
    ],
    calendars: new Map([
      ['MTC', new Map([['MTC-D', daily('MTC-D')]])],
      ['SRR', new Map([['SRR-D', daily('SRR-D', '20250101')]])],
    ]),
    transfers: transfers.map((t) => ({
      ...t,
      from: at(stops[t.from].gtfsId),
      to: at(stops[t.to].gtfsId),
    })),
    pathways: [],
  };
}
const Y = 1;
const Y2 = 2;
/** Route indices: r1 X → Y, r2 Y → Z, r3 Y2 → Z. */
const R1 = 0;
const R2 = 1;
const R3 = 2;

const snap = (transfers: RouterInput['transfers'] = []) =>
  buildSnapshot(network(transfers), {
    horizonStart: '2026-10-15',
    horizonDays: 30,
    footpathMaxM: 400,
    builtAt: '2026-10-15T00:00:00Z',
  });

const base: Omit<PlanRequest, 'from' | 'to'> = {
  date: '2026-10-20',
  departAt: T('07:55'),
  windowMin: 10,
  maxTransfers: 2,
  minTransferSec: 120,
  maxWalkM: 1000,
  modes: ['bus', 'metro', 'suburban_rail'],
  includeProjected: true,
  projectionEnabledForFeed: true,
  preference: 'fastest',
  limit: 10,
  thresholds: { currentMaxAgeDays: 30, agingMaxAgeDays: 180 },
};
const plan = (
  s: ReturnType<typeof snap>,
  from: string,
  to: string,
  extra: Partial<PlanRequest> = {},
) =>
  planJourneys(s, {
    ...base,
    from: { kind: 'stop', id: from },
    to: { kind: 'stop', id: to },
    ...extra,
  });
const secondBoarding = (legs: (TransitLegView | WalkLegView)[]) =>
  legs.filter((l): l is TransitLegView => l.type === 'transit')[1];

/** Every raw journey X → Z must pass the property checks, including same-stop rules. */
function checkAll(s: ReturnType<typeof snap>, minTransferSec: number) {
  const journeys = rawJourneys(s, minTransferSec);
  for (const j of journeys) {
    expect(
      validateJourney(s, j, { date: '2026-10-20', minTransferSec, includeProjected: true }),
    ).toEqual([]);
  }
  return journeys;
}

function rawJourneys(s: ReturnType<typeof snap>, minTransferSec = 120) {
  const at = (id: string) => s.header.strings.stopIds.indexOf(id);
  return raptor(s, {
    date: '2026-10-20',
    departAt: T('07:55'),
    windowSec: 600,
    maxTransfers: 2,
    minTransferSec,
    includeProjected: true,
    allowedAgencies: new Set([0, 1]),
    origins: [{ stop: at('MTC-X'), sec: 0, meters: 0 }],
    destinations: [{ stop: at('MTC-Z'), sec: 0, meters: 0 }],
  });
}

/** Second boardings (stop id, departure) of every journey X → Z. */
const secondBoardings = (s: ReturnType<typeof snap>) =>
  plan(s, 'MTC-X', 'MTC-Z').journeys.map((j) => {
    const second = secondBoarding(j.legs);
    return `${second.from.id} ${second.scheduledDepartureTime}`;
  });

describe('journey trust semantics', () => {
  it('an estimated walk does not change the journey label (bus + walk + bus stays current)', () => {
    // Force the walk: prohibit re-boarding at Y.
    const s = snap([{ from: Y, to: Y, type: 3, minTime: null }]);
    const j = plan(s, 'MTC-X', 'MTC-Z').journeys[0];
    expect(j.legs.map((l) => l.type)).toEqual(['transit', 'walk', 'transit']);
    expect(j.trust).toEqual({
      label: 'current',
      worstLeg: 0,
      confidence: 'normal',
      freshness: 'current',
      projection: 'none',
      walking: 'estimated',
      scope: 'timetable_data_only',
    });
    expect((j.legs[1] as WalkLegView).trust).toMatchObject({ kind: 'walk', category: 'estimated' });
    expect(j.warnings.map((w) => w.code)).toContain('estimated_walking');
  });

  it('suburban rail alone: label unknown because its update date cannot be established, not projected', () => {
    const j = plan(snap(), 'SRR-P', 'SRR-Q', { departAt: T('08:25') }).journeys[0];
    expect(j.trust).toMatchObject({
      label: 'unknown',
      confidence: 'low',
      freshness: 'unknown',
      projection: 'none',
      walking: 'none',
    });
    const leg = j.legs[0] as TransitLegView;
    expect(leg.trust).toMatchObject({
      kind: 'schedule',
      label: 'unknown',
      checks: { calendarCoverage: 'covered', feedAge: { label: 'unknown' } },
    });
    expect(j.warnings.map((w) => w.code)).toEqual(['freshness_unknown', 'approximate_geometry']);
  });

  it('a walk declared in transfers.txt without a time is a feed link with an estimated time', () => {
    const s = snap([
      { from: Y, to: Y, type: 3, minTime: null },
      { from: Y, to: Y2, type: 0, minTime: null },
    ]);
    const walk = plan(s, 'MTC-X', 'MTC-Z').journeys[0].legs[1] as WalkLegView;
    expect(walk).toMatchObject({
      link: 'transfer',
      method: 'estimated',
      trust: { category: 'feed_link_estimated_time' },
    });
  });

  it('a walk with a published min_transfer_time is published, and the minimum is honoured', () => {
    const s = snap([
      { from: Y, to: Y, type: 3, minTime: null },
      { from: Y, to: Y2, type: 2, minTime: 300 },
    ]);
    const j = plan(s, 'MTC-X', 'MTC-Z').journeys[0];
    const walk = j.legs[1] as WalkLegView;
    expect(walk).toMatchObject({
      method: 'published',
      trust: { category: 'published' },
      durationMin: 5,
    });
    // GTFS: min_transfer_time is the time needed between arrival and departure. 08:10 + 300 s =
    // 08:15 (later than the ~26 s estimated walk + 120 s buffer): the 08:14 bus is missed.
    expect(secondBoarding(j.legs).scheduledDepartureTime).toBe('08:20:00');
    expect(j.trust.walking).toBe('published');
    checkAll(s, 120);
  });

  it('a published min_transfer_time is not added to the buffer, but never undercuts walk + buffer', () => {
    // 08:10 + 200 s = 08:13:20 → the 08:14 bus is reachable (not 08:10 + 200 + 120 = 08:15:20).
    const s = snap([
      { from: Y, to: Y, type: 3, minTime: null },
      { from: Y, to: Y2, type: 2, minTime: 200 },
    ]);
    expect(secondBoardings(s)[0]).toBe('MTC-Y2 08:14:00');
    checkAll(s, 120);
    // A 10 s minimum is shorter than the estimated walk + buffer: walk + buffer still applies
    // (08:10 + ~26 s + 300 s > 08:14).
    const short = snap([
      { from: Y, to: Y, type: 3, minTime: null },
      { from: Y, to: Y2, type: 2, minTime: 10 },
    ]);
    expect(
      plan(short, 'MTC-X', 'MTC-Z', { minTransferSec: 300 }).journeys.map(
        (j) => secondBoarding(j.legs).scheduledDepartureTime,
      ),
    ).not.toContain('08:14:00');
    checkAll(short, 300);
  });

  it('a pathway traversal_time shorter than the published min_transfer_time never undercuts it', () => {
    const input = network([{ from: Y, to: Y2, type: 2, minTime: 300 }]);
    const parent = new Int32Array(input.stops.length).fill(-1);
    const f = buildFootpaths(
      input.stops,
      parent,
      input.transfers,
      [{ from: Y, to: Y2, bidirectional: false, traversalTime: 30 }],
      400,
    );
    const e = [...f.to.keys()].find(
      (i) => i >= f.offset[Y] && i < f.offset[Y + 1] && f.to[i] === Y2,
    )!;
    expect(f.sec[e]).toBe(300);
  });
});

describe('transfer rules', () => {
  it('accepts a connection exactly at the buffer and rejects one second short', () => {
    expect(
      secondBoarding(plan(snap(), 'MTC-X', 'MTC-Z').journeys[0].legs).scheduledDepartureTime,
    ).toBe('08:12:00');
    const tight = plan(snap(), 'MTC-X', 'MTC-Z', { minTransferSec: 121 });
    expect(secondBoarding(tight.journeys[0].legs).scheduledDepartureTime).toBe('08:15:00');
    checkAll(snap(), 121);
  });

  it('a published same-stop minimum transfer time wins over a smaller default buffer', () => {
    const s = snap([{ from: Y, to: Y, type: 2, minTime: 600 }]);
    expect(s.header.stats['stopsWithPublishedMinTransferTime']).toBe(1);
    for (const j of plan(s, 'MTC-X', 'MTC-Z').journeys) {
      const second = secondBoarding(j.legs);
      if (second.from.id === 'MTC-Y')
        expect(second.scheduledDepartureTime >= '08:20:00').toBe(true);
    }
    // The 08:12 and 08:15 departures from Y are gone; walking to Y2 (a different stop) is fine.
    const first = plan(s, 'MTC-X', 'MTC-Z').journeys[0];
    expect(secondBoarding(first.legs).from.id).toBe('MTC-Y2');
    checkAll(s, 120);
  });

  it('never re-boards at a stop where transfers.txt prohibits transfers', () => {
    const s = snap([{ from: Y, to: Y, type: 3, minTime: null }]);
    expect(s.header.stats['stopsWithProhibitedTransfer']).toBe(1);
    const journeys = plan(s, 'MTC-X', 'MTC-Z').journeys;
    expect(journeys.length).toBeGreaterThan(0);
    for (const j of journeys) expect(secondBoarding(j.legs).from.id).not.toBe('MTC-Y');
    checkAll(s, 120);
  });

  it('a route-specific prohibition applies only to its route pair', () => {
    // r1 → r2 prohibited at Y: the 08:12 r2 is not boarded; walking to r3 at Y2 is unaffected.
    const s = snap([{ from: Y, to: Y, type: 3, minTime: null, fromRoute: R1, toRoute: R2 }]);
    expect(s.header.stats['transfersRouteSpecific']).toBe(1);
    expect(s.header.stats['stopsWithRouteSpecificTransferRules']).toBe(1);
    expect(s.stopTransferForbidden[Y]).toBe(0);
    const boardings = secondBoardings(s);
    expect(boardings.length).toBeGreaterThan(0);
    expect(boardings.every((b) => b.startsWith('MTC-Y2'))).toBe(true);
    checkAll(s, 120);
    // The same rule for another route pair (r1 → r3 at Y) does not touch r1 → r2.
    const other = snap([{ from: Y, to: Y, type: 3, minTime: null, fromRoute: R1, toRoute: R3 }]);
    expect(secondBoardings(other)[0]).toBe('MTC-Y 08:12:00');
    checkAll(other, 120);
  });

  it('a route-specific minimum transfer time holds for that route pair only', () => {
    // r1 → r2 needs 400 s at Y: 08:16:40, so the 08:12 and 08:15 r2 are out; 08:25 is fine.
    const s = snap([{ from: Y, to: Y, type: 2, minTime: 400, fromRoute: R1, toRoute: R2 }]);
    expect(s.stopMinTransferSec[Y]).toBe(0);
    for (const b of secondBoardings(s)) {
      if (b.startsWith('MTC-Y ')) expect(b).toBe('MTC-Y 08:25:00');
    }
    const at = (id: string) => s.header.strings.stopIds.indexOf(id);
    expect(
      rawJourneys(s).some((j) =>
        j.legs.some((l) => l.kind === 'walk' && l.toStop === at('MTC-Y2')),
      ),
    ).toBe(true);
    checkAll(s, 120);
  });

  it('a rule naming only one route applies to every route on the other side', () => {
    for (const rule of [
      { fromRoute: R1, toRoute: null },
      { fromRoute: null, toRoute: R2 },
    ]) {
      const s = snap([{ from: Y, to: Y, type: 3, minTime: null, ...rule }]);
      expect(secondBoardings(s).every((b) => b.startsWith('MTC-Y2'))).toBe(true);
      checkAll(s, 120);
    }
  });

  it('the most specific rule wins (GTFS precedence): a route pair rule overrides the stop rule', () => {
    // Stop-level: no transfers at Y; r1 → r2 explicitly allowed (type 0).
    const s = snap([
      { from: Y, to: Y, type: 3, minTime: null },
      { from: Y, to: Y, type: 0, minTime: null, fromRoute: R1, toRoute: R2 },
    ]);
    expect(secondBoardings(s)[0]).toBe('MTC-Y 08:12:00');
    checkAll(s, 120);
    // Stop-level 600 s minimum; r1 → r2 with 60 s: the route rule wins, the buffer still applies.
    const min = snap([
      { from: Y, to: Y, type: 2, minTime: 600 },
      { from: Y, to: Y, type: 2, minTime: 60, fromRoute: R1, toRoute: R2 },
    ]);
    expect(secondBoardings(min)[0]).toBe('MTC-Y 08:12:00');
    checkAll(min, 120);
    // Equally specific rules: a prohibition wins over a recommendation.
    const tie = snap([
      { from: Y, to: Y, type: 0, minTime: null, fromRoute: R1, toRoute: R2 },
      { from: Y, to: Y, type: 3, minTime: null, fromRoute: R1, toRoute: R2 },
    ]);
    expect(secondBoardings(tie).every((b) => b.startsWith('MTC-Y2'))).toBe(true);
    checkAll(tie, 120);
  });

  it('resolves specificity: both routes > one route > stop pair', () => {
    const t = buildTransferRules(
      3,
      [
        { from: 0, to: 1, type: 2, minTime: 600 },
        { from: 0, to: 1, type: 2, minTime: 300, fromRoute: 5 },
        { from: 0, to: 1, type: 2, minTime: 120, fromRoute: 5, toRoute: 7 },
        { from: 0, to: 1, type: 3, minTime: null, toRoute: 9 },
      ],
      (i) => [i],
    );
    expect(resolveTransfer(t, 0, 1, 5, 7)).toEqual({ forbidden: false, minSec: 120 });
    expect(resolveTransfer(t, 0, 1, 5, 8)).toEqual({ forbidden: false, minSec: 300 });
    expect(resolveTransfer(t, 0, 1, 4, 8)).toEqual({ forbidden: false, minSec: 600 });
    expect(resolveTransfer(t, 0, 1, 4, 9)).toEqual({ forbidden: true, minSec: 0 });
    // A rule for another origin stop does not apply.
    expect(resolveTransfer(t, 2, 1, 5, 7)).toEqual({ forbidden: false, minSec: 0 });
  });

  it('a route-specific prohibition between two stops blocks only that route pair', () => {
    // No re-boarding at Y; walking Y → Y2 and boarding r3 after r1 is prohibited: no journey.
    const blocked = snap([
      { from: Y, to: Y, type: 3, minTime: null },
      { from: Y, to: Y2, type: 3, minTime: null, fromRoute: R1, toRoute: R3 },
    ]);
    expect(plan(blocked, 'MTC-X', 'MTC-Z').journeys).toEqual([]);
    expect(rawJourneys(blocked)).toEqual([]);
    // The same prohibition for r2 → r3 leaves r1 → r3 alone.
    const open = snap([
      { from: Y, to: Y, type: 3, minTime: null },
      { from: Y, to: Y2, type: 3, minTime: null, fromRoute: R2, toRoute: R3 },
    ]);
    expect(secondBoardings(open)[0]).toBe('MTC-Y2 08:14:00');
    checkAll(open, 120);
  });

  it('in-seat transfers (types 4 and 5) are not walking links and are counted', () => {
    const s = snap([
      { from: Y, to: Y, type: 3, minTime: null },
      { from: Y, to: Y2, type: 4, minTime: null },
      { from: Y, to: Y2, type: 5, minTime: null },
    ]);
    expect(s.header.stats['transfersInSeatIgnored']).toBe(2);
    expect(s.header.stats['footpaths_transfer']).toBeUndefined();
    const walk = plan(s, 'MTC-X', 'MTC-Z').journeys[0].legs[1] as WalkLegView;
    expect(walk).toMatchObject({ link: 'proximity', trust: { category: 'estimated' } });
  });

  it('a trip-specific row never relaxes a rule, and its prohibition is applied conservatively', () => {
    // Trips are not matched: an allowing trip-specific row does not override the stop rule …
    const allow = snap([
      { from: Y, to: Y, type: 3, minTime: null },
      { from: Y, to: Y, type: 0, minTime: null, fromRoute: R1, toRoute: R2, tripSpecific: true },
    ]);
    expect(allow.header.stats['transfersTripSpecificAppliedConservatively']).toBe(1);
    expect(secondBoardings(allow).every((b) => b.startsWith('MTC-Y2'))).toBe(true);
    checkAll(allow, 120);
    // … and a trip-specific prohibition holds for the whole route pair.
    const forbid = snap([
      { from: Y, to: Y, type: 3, minTime: null, fromRoute: R1, toRoute: R2, tripSpecific: true },
    ]);
    expect(secondBoardings(forbid).every((b) => b.startsWith('MTC-Y2'))).toBe(true);
    checkAll(forbid, 120);
  });

  it('a row with an import issue (unknown route, missing minimum) never relaxes a rule or adds a link', () => {
    // Stop-level prohibition at Y; a malformed "allowed" row for r1 → r2 must not override it.
    const s = snap([
      { from: Y, to: Y, type: 3, minTime: null },
      {
        from: Y,
        to: Y,
        type: 2,
        minTime: null,
        fromRoute: R1,
        toRoute: R2,
        issue: 'missing_min_transfer_time',
      },
    ]);
    expect(s.header.stats['transfersWithIssueAppliedConservatively']).toBe(1);
    expect(secondBoardings(s).every((b) => b.startsWith('MTC-Y2'))).toBe(true);
    checkAll(s, 120);
    // A prohibition naming an unknown route (stored as any route) holds for every route.
    const unknownRoute = snap([
      {
        from: Y,
        to: Y,
        type: 3,
        minTime: null,
        fromRoute: null,
        toRoute: null,
        issue: 'unknown_from_route',
      },
    ]);
    expect(secondBoardings(unknownRoute).every((b) => b.startsWith('MTC-Y2'))).toBe(true);
    // A malformed row declares no walking link: the walk Y → Y2 stays a proximity estimate.
    const noLink = snap([
      { from: Y, to: Y, type: 3, minTime: null },
      { from: Y, to: Y2, type: 0, minTime: null, issue: 'unknown_trip', tripSpecific: true },
    ]);
    expect(noLink.header.stats['footpaths_transfer']).toBeUndefined();
    const walk = plan(noLink, 'MTC-X', 'MTC-Z').journeys[0].legs[1] as WalkLegView;
    expect(walk).toMatchObject({ link: 'proximity' });
  });

  it('the validator rejects journeys that break route-specific rules', () => {
    const [j] = rawJourneys(snap());
    expect(
      validateJourney(snap(), j, {
        date: '2026-10-20',
        minTransferSec: 120,
        includeProjected: true,
      }),
    ).toEqual([]);
    const opts = { date: '2026-10-20', minTransferSec: 120, includeProjected: true };
    expect(
      validateJourney(
        snap([{ from: Y, to: Y, type: 3, minTime: null, fromRoute: R1, toRoute: R2 }]),
        j,
        opts,
      ),
    ).toEqual([expect.stringContaining('transfers.txt prohibits')]);
    expect(
      validateJourney(
        snap([{ from: Y, to: Y, type: 2, minTime: 400, fromRoute: R1, toRoute: R2 }]),
        j,
        opts,
      ),
    ).toEqual([expect.stringContaining('before the transfer buffer allows')]);
    expect(
      validateJourney(
        snap([{ from: Y, to: Y, type: 3, minTime: null, fromRoute: R2, toRoute: R1 }]),
        j,
        opts,
      ),
    ).toEqual([]);
  });

  it('the validator rejects a journey that ignores a same-stop minimum time', () => {
    const lenient = snap();
    const strict = snap([{ from: Y, to: Y, type: 2, minTime: 600 }]);
    const at = (id: string) => lenient.header.strings.stopIds.indexOf(id);
    const [j] = raptor(lenient, {
      date: '2026-10-20',
      departAt: T('07:55'),
      windowSec: 600,
      maxTransfers: 1,
      minTransferSec: 120,
      includeProjected: true,
      allowedAgencies: new Set([0]),
      origins: [{ stop: at('MTC-X'), sec: 0, meters: 0 }],
      destinations: [{ stop: at('MTC-Z'), sec: 0, meters: 0 }],
    });
    expect(
      validateJourney(strict, j, {
        date: '2026-10-20',
        minTransferSec: 120,
        includeProjected: true,
      }),
    ).toEqual([expect.stringContaining('before the transfer buffer allows')]);
  });
});

describe('verified disruption exclusions (SPEC §7.4)', () => {
  const at = (s: ReturnType<typeof snap>, id: string) => s.header.strings.stopIds.indexOf(id);

  it('an excluded stop is never boarded, alighted at or walked to', () => {
    const s = snap();
    const r = plan(s, 'MTC-X', 'MTC-Z', { excluded: { stopIds: ['MTC-Y2'], routeIds: [] } });
    expect(r.journeys.length).toBeGreaterThan(0);
    for (const j of r.journeys) {
      expect(j.legs.some((l) => l.type === 'walk' && l.to.id === 'MTC-Y2')).toBe(false);
    }
    const raw = raptor(s, {
      date: '2026-10-20',
      departAt: T('07:55'),
      windowSec: 600,
      maxTransfers: 2,
      minTransferSec: 120,
      includeProjected: true,
      allowedAgencies: new Set([0, 1]),
      origins: [{ stop: at(s, 'MTC-X'), sec: 0, meters: 0 }],
      destinations: [{ stop: at(s, 'MTC-Z'), sec: 0, meters: 0 }],
      excludedStops: new Set([at(s, 'MTC-Y2')]),
    });
    for (const j of raw) {
      expect(
        validateJourney(s, j, {
          date: '2026-10-20',
          minTransferSec: 120,
          includeProjected: true,
          excludedStops: new Set([at(s, 'MTC-Y2')]),
        }),
      ).toEqual([]);
    }
  });

  it('an excluded route is never used, and exclusions only remove options', () => {
    const s = snap();
    const all = plan(s, 'MTC-X', 'MTC-Z').journeys.length;
    const r = plan(s, 'MTC-X', 'MTC-Z', { excluded: { stopIds: [], routeIds: ['MTC-r2'] } });
    expect(r.journeys.length).toBeLessThanOrEqual(all);
    for (const j of r.journeys)
      expect(j.legs.some((l) => l.type === 'transit' && l.route.id === 'MTC-r2')).toBe(false);
  });

  it('a closed origin is explained, not hidden', () => {
    const r = plan(snap(), 'MTC-X', 'MTC-Z', { excluded: { stopIds: ['MTC-X'], routeIds: [] } });
    expect(r.journeys).toEqual([]);
    expect(r.empty?.reason).toBe('closed_by_verified_report');
  });

  it('the validator rejects a journey that uses an excluded route or stop', () => {
    const s = snap();
    const [j] = rawJourneys(s);
    const opts = { date: '2026-10-20', minTransferSec: 120, includeProjected: true };
    expect(validateJourney(s, j, { ...opts, excludedRoutes: new Set([R2]) }).join(' ')).toContain(
      'route closed by a verified report',
    );
    expect(validateJourney(s, j, { ...opts, excludedStops: new Set([Y]) }).join(' ')).toContain(
      'stop closed by a verified report',
    );
  });
});

describe('arrive-by under transfers.txt rules (reverse RAPTOR)', () => {
  /** Rule sets from the cases above: none, stop-level, route-specific, walk link, conservative. */
  const RULES: RouterInput['transfers'][] = [
    [],
    [{ from: Y, to: Y, type: 3, minTime: null }],
    [{ from: Y, to: Y, type: 2, minTime: 600 }],
    [{ from: Y, to: Y, type: 3, minTime: null, fromRoute: R1, toRoute: R2 }],
    [{ from: Y, to: Y, type: 3, minTime: null, fromRoute: R1, toRoute: R3 }],
    [{ from: Y, to: Y, type: 2, minTime: 400, fromRoute: R1, toRoute: R2 }],
    [{ from: Y, to: Y, type: 3, minTime: null, fromRoute: R2, toRoute: R1 }],
    [{ from: Y, to: Y2, type: 2, minTime: 300 }],
    [
      { from: Y, to: Y, type: 3, minTime: null },
      { from: Y, to: Y2, type: 3, minTime: null, fromRoute: R1, toRoute: R3 },
    ],
    [
      { from: Y, to: Y, type: 3, minTime: null },
      {
        from: Y,
        to: Y,
        type: 2,
        minTime: null,
        fromRoute: R1,
        toRoute: R2,
        issue: 'missing_min_transfer_time',
      },
    ],
  ];

  it('returns only rule-abiding journeys and the forward search’s latest departure, for every rule set', () => {
    let compared = 0;
    for (const rules of RULES) {
      const s = snap(rules);
      const at = (id: string) => s.header.strings.stopIds.indexOf(id);
      for (const minTransferSec of [0, 120, 300]) {
        for (const deadline of ['08:20', '08:30', '08:45', '09:10', '10:00']) {
          const T_ = T(deadline);
          const q = {
            date: '2026-10-20',
            windowSec: 3600,
            maxTransfers: 2,
            minTransferSec,
            includeProjected: true,
            allowedAgencies: new Set([0, 1]),
            origins: [{ stop: at('MTC-X'), sec: 0, meters: 0 }],
            destinations: [{ stop: at('MTC-Z'), sec: 0, meters: 0 }],
          };
          const rev = raptorArriveBy(s, { ...q, arriveBy: T_ });
          for (const j of rev) {
            expect(
              validateJourney(s, j, { date: q.date, minTransferSec, includeProjected: true }),
            ).toEqual([]);
            expect(j.arrival).toBeLessThanOrEqual(T_);
          }
          const fwd = raptor(s, {
            ...q,
            departAt: T_ - 3600 - 6 * 3600,
            windowSec: 6 * 3600 + 3600,
            maxDepartureRuns: 100_000,
          }).filter((j) => j.arrival <= T_ && j.arrival >= T_ - 3600);
          const latest = (js: { departure: number }[]) =>
            js.length ? Math.max(...js.map((j) => j.departure)) : null;
          expect(
            latest(rev),
            `${JSON.stringify(rules)} by ${deadline}, buffer ${minTransferSec}`,
          ).toBe(latest(fwd));
          if (fwd.length) compared++;
        }
      }
    }
    expect(compared).toBeGreaterThan(30);
  });
});
