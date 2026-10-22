import { buildServiceCalendars } from './calendar.js';
import { readCsv } from './csv.js';
import { formatIsoDate } from './date.js';
import { haversineMeters } from './geo.js';
import { records, TIME_EMPTY, type GtfsFeed } from './model.js';
import type { FeedSource } from './source.js';
import { DEFAULT_VALIDATION_OPTIONS } from './rules/context.js';
import { formatGtfsTime, parseGtfsTime } from './time.js';

/**
 * Timetable Changelog (SPEC F9): what a published feed contains, and what changed between two
 * versions. Counts come only from the published files:
 *  - trips per day of week use calendar.txt's weekday flags (calendar_dates.txt exceptions are
 *    not counted);
 *  - frequency-based trips (frequencies.txt) count each departure they generate;
 *  - first/last departure and the peak headway use Monday service; the peak is 08:00–10:00 at
 *    each trip's first stop, in the direction with more departures, as the median gap;
 *  - trips whose first departure is a placeholder time (a value shared by ≥ 1 % of trips and not
 *    on a whole minute) are counted as trips but left out of departure times and headways.
 */
export interface RouteSummary {
  routeId: string;
  shortName: string | null;
  longName: string | null;
  /** Monday … Sunday. */
  tripsByDay: number[];
  firstDepartureSec: number | null;
  lastDepartureSec: number | null;
  peakHeadwayMin: number | null;
}

export interface StopSummary {
  stopId: string;
  name: string | null;
  lat: number | null;
  lon: number | null;
}

export interface FeedSummary {
  routes: RouteSummary[];
  stops: StopSummary[];
  stats: {
    routes: number;
    stops: number;
    trips: number;
    stopTimes: number;
    frequencyBasedTrips: number;
    /** Trips whose service has no calendar.txt row (only calendar_dates): not in tripsByDay. */
    tripsWithoutWeeklyCalendar: number;
    /** Trips starting at a placeholder time: counted, but not used for departure times or headways. */
    tripsWithPlaceholderTimes: number;
    /** The placeholder first-departure values found (HH:MM:SS). */
    placeholderTimes: string[];
    calendarStart: string | null;
    calendarEnd: string | null;
  };
}

const PEAK_START = 8 * 3600;
const PEAK_END = 10 * 3600;

interface Frequency {
  start: number;
  end: number;
  headway: number;
}

/** frequencies.txt is not part of the validated feed model; it is read here for counting only. */
async function readFrequencies(source: FeedSource): Promise<Map<string, Frequency[]>> {
  const out = new Map<string, Frequency[]>();
  if (!source.files.includes('frequencies.txt')) return out;
  let columns: string[] = [];
  await readCsv(await source.open('frequencies.txt'), {
    onHeader: (cols) => {
      columns = cols;
    },
    onRow: (row) => {
      const v = Object.fromEntries(columns.map((c, i) => [c, row[i] ?? '']));
      const start = parseGtfsTime(v['start_time'] ?? '');
      const end = parseGtfsTime(v['end_time'] ?? '');
      const headway = Number(v['headway_secs']);
      if (start === null || end === null || !(headway > 0) || end <= start) return;
      const list = out.get(v['trip_id'] ?? '') ?? [];
      list.push({ start, end, headway });
      out.set(v['trip_id'] ?? '', list);
    },
  });
  return out;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

const iso = (day: number | null) => (day === null ? null : formatIsoDate(day));

export async function summarizeFeed(feed: GtfsFeed, source: FeedSource): Promise<FeedSummary> {
  const frequencies = await readFrequencies(source);
  const calendars = buildServiceCalendars(feed);

  // First departure of each trip (lowest stop_sequence with a time).
  const firstDep = new Map<string, number>();
  const firstSeq = new Map<string, number>();
  const st = feed.stopTimes;
  if (st) {
    for (let i = 0; i < st.count; i++) {
      const trip = st.tripIds[st.tripKey[i]!]!;
      const dep = st.departure[i]! >= 0 ? st.departure[i]! : st.arrival[i]!;
      if (dep === TIME_EMPTY || dep < 0) continue;
      const seq = st.sequence[i]!;
      if (!firstSeq.has(trip) || seq < firstSeq.get(trip)!) {
        firstSeq.set(trip, seq);
        firstDep.set(trip, dep);
      }
    }
  }

  // Placeholder first departures: the W_PLACEHOLDER_TIMES rule (one value shared by ≥ 1 % of
  // trips), narrowed as the dataset audit recommends: only values that are not on a whole minute
  // (e.g. 00:00:15). Clusters at round clock times are plausible real departures, and the 1 %
  // rule fires on very few trips in small feeds. Frequency-based trips are not considered.
  const counts = new Map<number, number>();
  let timed = 0;
  for (const [trip, t] of firstDep) {
    if (frequencies.has(trip)) continue;
    timed++;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const threshold = Math.max(2, Math.ceil(DEFAULT_VALIDATION_OPTIONS.placeholderMinShare * timed));
  const placeholder = new Set(
    [...counts].filter(([t, n]) => n >= threshold && t % 60 !== 0).map(([t]) => t),
  );
  let placeholderTrips = 0;

  interface Acc {
    days: number[];
    monday: { dep: number; direction: string }[];
  }
  const byRoute = new Map<string, Acc>();
  let trips = 0;
  let frequencyBasedTrips = 0;
  let withoutWeekly = 0;
  for (const { v } of records(feed, 'trips.txt')) {
    trips++;
    const routeId = v['route_id'] ?? '';
    const acc = byRoute.get(routeId) ?? { days: [0, 0, 0, 0, 0, 0, 0], monday: [] };
    byRoute.set(routeId, acc);
    const weekly = calendars.get(v['service_id'] ?? '')?.weekly;
    if (!weekly) {
      withoutWeekly++;
      continue;
    }
    const tripId = v['trip_id'] ?? '';
    const freq = frequencies.get(tripId);
    let departures: number[];
    if (freq) {
      frequencyBasedTrips++;
      departures = freq.flatMap((f) =>
        Array.from(
          { length: Math.ceil((f.end - f.start) / f.headway) },
          (_, k) => f.start + k * f.headway,
        ),
      );
    } else {
      const d = firstDep.get(tripId);
      departures = d === undefined ? [] : [d];
    }
    if (departures.length === 0) continue;
    weekly.days.forEach((on, day) => {
      if (on) acc.days[day]! += departures.length;
    });
    const isPlaceholder = !freq && placeholder.has(departures[0]!);
    if (isPlaceholder) placeholderTrips++;
    if (weekly.days[0] && !isPlaceholder) {
      for (const dep of departures) acc.monday.push({ dep, direction: v['direction_id'] ?? '' });
    }
  }

  const routes: RouteSummary[] = records(feed, 'routes.txt').map(({ v }) => {
    const routeId = v['route_id'] ?? '';
    const acc = byRoute.get(routeId) ?? { days: [0, 0, 0, 0, 0, 0, 0], monday: [] };
    const deps = acc.monday.map((m) => m.dep);
    const byDirection = new Map<string, number[]>();
    for (const m of acc.monday) {
      if (m.dep < PEAK_START || m.dep >= PEAK_END) continue;
      byDirection.set(m.direction, [...(byDirection.get(m.direction) ?? []), m.dep]);
    }
    const busiest = [...byDirection.values()].sort((a, b) => b.length - a.length)[0] ?? [];
    const sorted = [...busiest].sort((a, b) => a - b);
    const gaps = sorted.slice(1).map((d, i) => (d - sorted[i]!) / 60);
    return {
      routeId,
      shortName: v['route_short_name'] || null,
      longName: v['route_long_name'] || null,
      tripsByDay: acc.days,
      firstDepartureSec: deps.length ? Math.min(...deps) : null,
      lastDepartureSec: deps.length ? Math.max(...deps) : null,
      peakHeadwayMin: gaps.length ? Math.round(median(gaps) * 10) / 10 : null,
    };
  });

  const stops: StopSummary[] = records(feed, 'stops.txt').map(({ v }) => {
    const lat = Number(v['stop_lat']);
    const lon = Number(v['stop_lon']);
    return {
      stopId: v['stop_id'] ?? '',
      name: v['stop_name'] || null,
      lat: v['stop_lat'] && Number.isFinite(lat) ? lat : null,
      lon: v['stop_lon'] && Number.isFinite(lon) ? lon : null,
    };
  });

  let start: number | null = null;
  let end: number | null = null;
  for (const c of calendars.values()) {
    if (!c.weekly) continue;
    start = start === null ? c.weekly.start : Math.min(start, c.weekly.start);
    end = end === null ? c.weekly.end : Math.max(end, c.weekly.end);
  }

  return {
    routes,
    stops,
    stats: {
      routes: routes.length,
      stops: stops.length,
      trips,
      stopTimes: st?.count ?? 0,
      frequencyBasedTrips,
      tripsWithoutWeeklyCalendar: withoutWeekly,
      tripsWithPlaceholderTimes: placeholderTrips,
      placeholderTimes: [...placeholder].sort((a, b) => a - b).map(formatGtfsTime),
      calendarStart: iso(start),
      calendarEnd: iso(end),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------------------------

/** A stop is "moved" when it is more than this far from its previous position. */
export const STOP_MOVED_M = 50;

export interface RouteNumberSummary {
  /** route_short_name, or the route_id when there is none. */
  number: string;
  routeIds: string[];
  tripsByDay: number[];
  firstDepartureSec: number | null;
  lastDepartureSec: number | null;
  /** Smallest peak headway over the route's variants. */
  peakHeadwayMin: number | null;
}

/**
 * Routes grouped by their published number. ChennaiGTFS's MTC route_ids change between weekly
 * scrapes, so comparisons by number are the meaningful ones; changes by route_id are reported too.
 */
export function groupByNumber(routes: RouteSummary[]): Map<string, RouteNumberSummary> {
  const out = new Map<string, RouteNumberSummary>();
  for (const r of routes) {
    const number = (r.shortName ?? r.routeId).trim();
    const g = out.get(number) ?? {
      number,
      routeIds: [],
      tripsByDay: [0, 0, 0, 0, 0, 0, 0],
      firstDepartureSec: null,
      lastDepartureSec: null,
      peakHeadwayMin: null,
    };
    g.routeIds.push(r.routeId);
    r.tripsByDay.forEach((n, i) => (g.tripsByDay[i]! += n));
    const min = (a: number | null, b: number | null) =>
      a === null ? b : b === null ? a : Math.min(a, b);
    const max = (a: number | null, b: number | null) =>
      a === null ? b : b === null ? a : Math.max(a, b);
    g.firstDepartureSec = min(g.firstDepartureSec, r.firstDepartureSec);
    g.lastDepartureSec = max(g.lastDepartureSec, r.lastDepartureSec);
    g.peakHeadwayMin = min(g.peakHeadwayMin, r.peakHeadwayMin);
    out.set(number, g);
  }
  return out;
}

export interface RouteChange {
  number: string;
  before: RouteNumberSummary;
  after: RouteNumberSummary;
  /** Monday trips after − before. */
  mondayTripsDelta: number;
  firstDepartureDeltaMin: number | null;
  lastDepartureDeltaMin: number | null;
  peakHeadwayDeltaMin: number | null;
}

export interface FeedDiff {
  routesById: { added: string[]; removed: string[]; kept: number };
  routesByNumber: { added: string[]; removed: string[]; kept: number };
  stops: {
    added: StopSummary[];
    removed: StopSummary[];
    moved: { before: StopSummary; after: StopSummary; meters: number }[];
    kept: number;
  };
  /** Route numbers in both versions whose service changed, largest change first. */
  changedRoutes: RouteChange[];
  totals: {
    before: { mondayTrips: number; routes: number; stops: number };
    after: { mondayTrips: number; routes: number; stops: number };
  };
}

const deltaMin = (a: number | null, b: number | null) =>
  a === null || b === null ? null : Math.round((b - a) / 60);

export function diffSummaries(
  a: { routes: RouteSummary[]; stops: StopSummary[] },
  b: { routes: RouteSummary[]; stops: StopSummary[] },
): FeedDiff {
  const idsA = new Set(a.routes.map((r) => r.routeId));
  const idsB = new Set(b.routes.map((r) => r.routeId));
  const numA = groupByNumber(a.routes);
  const numB = groupByNumber(b.routes);
  const stopsA = new Map(a.stops.map((s) => [s.stopId, s]));
  const stopsB = new Map(b.stops.map((s) => [s.stopId, s]));

  const moved: FeedDiff['stops']['moved'] = [];
  let keptStops = 0;
  for (const [id, after] of stopsB) {
    const before = stopsA.get(id);
    if (!before) continue;
    keptStops++;
    if (before.lat !== null && before.lon !== null && after.lat !== null && after.lon !== null) {
      const meters = Math.round(haversineMeters(before.lat, before.lon, after.lat, after.lon));
      if (meters > STOP_MOVED_M) moved.push({ before, after, meters });
    }
  }

  const changedRoutes: RouteChange[] = [];
  for (const [number, after] of numB) {
    const before = numA.get(number);
    if (!before) continue;
    const change: RouteChange = {
      number,
      before,
      after,
      mondayTripsDelta: after.tripsByDay[0]! - before.tripsByDay[0]!,
      firstDepartureDeltaMin: deltaMin(before.firstDepartureSec, after.firstDepartureSec),
      lastDepartureDeltaMin: deltaMin(before.lastDepartureSec, after.lastDepartureSec),
      peakHeadwayDeltaMin:
        before.peakHeadwayMin === null || after.peakHeadwayMin === null
          ? null
          : Math.round((after.peakHeadwayMin - before.peakHeadwayMin) * 10) / 10,
    };
    // A value that appears or disappears is a change; two missing values are not.
    const differs = (d: number | null, x: number | null, y: number | null) =>
      (x === null) !== (y === null) || (d !== null && d !== 0);
    const changed =
      after.tripsByDay.some((n, i) => n !== before.tripsByDay[i]) ||
      differs(change.firstDepartureDeltaMin, before.firstDepartureSec, after.firstDepartureSec) ||
      differs(change.lastDepartureDeltaMin, before.lastDepartureSec, after.lastDepartureSec) ||
      differs(change.peakHeadwayDeltaMin, before.peakHeadwayMin, after.peakHeadwayMin);
    if (changed) changedRoutes.push(change);
  }
  changedRoutes.sort(
    (x, y) =>
      Math.abs(y.mondayTripsDelta) - Math.abs(x.mondayTripsDelta) ||
      x.number.localeCompare(y.number),
  );

  const mondayTrips = (routes: RouteSummary[]) => routes.reduce((s, r) => s + r.tripsByDay[0]!, 0);
  const sortStr = (xs: Iterable<string>) => [...xs].sort((x, y) => x.localeCompare(y));
  return {
    routesById: {
      added: sortStr([...idsB].filter((id) => !idsA.has(id))),
      removed: sortStr([...idsA].filter((id) => !idsB.has(id))),
      kept: [...idsB].filter((id) => idsA.has(id)).length,
    },
    routesByNumber: {
      added: sortStr([...numB.keys()].filter((n) => !numA.has(n))),
      removed: sortStr([...numA.keys()].filter((n) => !numB.has(n))),
      kept: [...numB.keys()].filter((n) => numA.has(n)).length,
    },
    stops: {
      added: b.stops.filter((s) => !stopsA.has(s.stopId)),
      removed: a.stops.filter((s) => !stopsB.has(s.stopId)),
      moved: moved.sort((x, y) => y.meters - x.meters),
      kept: keptStops,
    },
    changedRoutes,
    totals: {
      before: {
        mondayTrips: mondayTrips(a.routes),
        routes: a.routes.length,
        stops: a.stops.length,
      },
      after: { mondayTrips: mondayTrips(b.routes), routes: b.routes.length, stops: b.stops.length },
    },
  };
}
