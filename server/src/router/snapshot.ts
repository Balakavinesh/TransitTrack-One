import { parseIsoDate, serviceDateStatus, type ServiceCalendar } from '../gtfs/index.js';
import { modeOfAgency } from '../shared/index.js';
import { WALK_DETOUR_FACTOR, WALK_SPEED_MPS, buildFootpaths } from './footpaths.js';
import { buildTransferRules, isRoutedType, isSpecific } from './transfer-rules.js';
import { DAY_STATUS, type RouterInput, type Snapshot, type SnapshotOptions } from './types.js';

/**
 * 2: same-stop transfer rules (stopMinTransferSec, stopTransferForbidden).
 * 3: route-aware transfer rules (rule* arrays); in-seat transfers are not walking links.
 * 4: ruleConservative (trip-specific rows and rows with import issues) replaces ruleConservative.
 */
export const SNAPSHOT_FORMAT = 4;
export const SNAPSHOT_BUILDER_VERSION = 4;

interface TimedTrip {
  index: number;
  stops: number[];
  arr: number[];
  dep: number[];
}

/**
 * Builds the routing timetable from a feed version (SPEC §7.1):
 *  - trips with identical (route, stop sequence) form a pattern; patterns are split further so
 *    that no trip overtakes another (RAPTOR needs FIFO patterns);
 *  - only stop times with both arrival and departure are routable; trips whose times decrease
 *    along the sequence, or with fewer than two timed stops, are left out and counted;
 *  - service-day tables over the horizon, per agency: which services run on each day by their
 *    own calendar, and which are used to project a day (same day type only, SPEC §3.2). Days
 *    with no verified schedule for their day type (e.g. CMRL Sundays) have no services at all.
 */
export function buildSnapshot(input: RouterInput, options: SnapshotOptions): Snapshot {
  const stats: Record<string, number> = {};
  const count = (k: string, n = 1) => (stats[k] = (stats[k] ?? 0) + n);
  const horizonStart = parseIsoDate(options.horizonStart);
  if (horizonStart === null) throw new Error(`invalid horizonStart ${options.horizonStart}`);

  const agencyIndex = new Map(input.agencies.map((a, i) => [a.code, i]));
  const agencyOf = (code: string) => agencyIndex.get(code) ?? -1;

  // Stops
  const nStops = input.stops.length;
  const stopIndex = new Map(input.stops.map((s, i) => [s.gtfsId, i]));
  const stopLat = new Float64Array(nStops).fill(Number.NaN);
  const stopLon = new Float64Array(nStops).fill(Number.NaN);
  const stopAgency = new Int16Array(nStops);
  const stopParent = new Int32Array(nStops).fill(-1);
  const stopLocationType = new Int8Array(nStops);
  input.stops.forEach((s, i) => {
    if (s.lat !== null && s.lon !== null) {
      stopLat[i] = s.lat;
      stopLon[i] = s.lon;
    }
    stopAgency[i] = agencyOf(s.agency);
    stopParent[i] = s.parentGtfsId !== null ? (stopIndex.get(s.parentGtfsId) ?? -1) : -1;
    stopLocationType[i] = s.locationType;
  });

  // Routes
  const routeAgency = new Int16Array(input.routes.map((r) => agencyOf(r.agency)));
  const routeType = new Int32Array(input.routes.map((r) => r.routeType));

  // Services
  const serviceIds: string[] = [];
  const serviceIndex = new Map<string, number>();
  const serviceAgencyList: number[] = [];
  const addService = (id: string, agency: number) => {
    if (!serviceIndex.has(id)) {
      serviceIndex.set(id, serviceIds.length);
      serviceIds.push(id);
      serviceAgencyList.push(agency);
    }
  };
  for (const [agency, services] of input.calendars) {
    for (const id of services.keys()) addService(id, agencyOf(agency));
  }

  // Trips: keep timed stops; drop trips whose times go backwards.
  const nTrips = input.trips.length;
  const tripRoute = new Int32Array(nTrips);
  const tripService = new Int32Array(nTrips);
  const tripHasShape = new Uint8Array(nTrips);
  const tripDirection = new Int8Array(nTrips).fill(-1);
  const groups = new Map<string, TimedTrip[]>();
  input.trips.forEach((t, i) => {
    tripRoute[i] = t.route;
    addService(t.serviceId, routeAgency[t.route]);
    tripService[i] = serviceIndex.get(t.serviceId)!;
    tripHasShape[i] = t.hasShape ? 1 : 0;
    if (t.directionId !== null) tripDirection[i] = t.directionId;
    const timed: TimedTrip = { index: i, stops: [], arr: [], dep: [] };
    for (let j = 0; j < t.stops.length; j++) {
      const a = t.arrival[j];
      const d = t.departure[j];
      if (a === null || a === undefined || d === null || d === undefined) {
        count('untimedStopTimesSkipped');
        continue;
      }
      timed.stops.push(t.stops[j]);
      timed.arr.push(a);
      timed.dep.push(d);
    }
    if (timed.stops.length < 2) {
      count('tripsExcludedFewerThanTwoTimedStops');
      return;
    }
    for (let j = 0; j < timed.stops.length; j++) {
      if (timed.dep[j] < timed.arr[j] || (j > 0 && timed.arr[j] < timed.dep[j - 1])) {
        count('tripsExcludedDecreasingTimes');
        return;
      }
    }
    const k = `${t.route}|${timed.stops.join(',')}`;
    const list = groups.get(k) ?? [];
    list.push(timed);
    groups.set(k, list);
  });

  // Patterns, split so that trips never overtake each other.
  const patterns: { route: number; stops: number[]; trips: TimedTrip[] }[] = [];
  for (const trips of groups.values()) {
    trips.sort((a, b) => a.dep[0] - b.dep[0] || a.arr[a.arr.length - 1] - b.arr[b.arr.length - 1]);
    const split: TimedTrip[][] = [];
    for (const trip of trips) {
      const fits = (list: TimedTrip[]) => {
        const last = list[list.length - 1];
        for (let j = 0; j < trip.stops.length; j++) {
          if (trip.arr[j] < last.arr[j] || trip.dep[j] < last.dep[j]) return false;
        }
        return true;
      };
      const target = split.find(fits);
      if (target) target.push(trip);
      else split.push([trip]);
    }
    if (split.length > 1) count('patternsSplitForOvertaking', split.length - 1);
    for (const list of split) {
      patterns.push({ route: input.trips[list[0].index].route, stops: list[0].stops, trips: list });
    }
  }

  const nPatterns = patterns.length;
  const patternRoute = new Int32Array(nPatterns);
  const patternStopOffset = new Int32Array(nPatterns + 1);
  const patternTripOffset = new Int32Array(nPatterns + 1);
  const patternTimeOffset = new Int32Array(nPatterns + 1);
  let stopTotal = 0;
  let tripTotal = 0;
  let timeTotal = 0;
  patterns.forEach((p, i) => {
    patternRoute[i] = p.route;
    patternStopOffset[i] = stopTotal;
    patternTripOffset[i] = tripTotal;
    patternTimeOffset[i] = timeTotal;
    stopTotal += p.stops.length;
    tripTotal += p.trips.length;
    timeTotal += p.stops.length * p.trips.length;
  });
  patternStopOffset[nPatterns] = stopTotal;
  patternTripOffset[nPatterns] = tripTotal;
  patternTimeOffset[nPatterns] = timeTotal;
  const patternStops = new Int32Array(stopTotal);
  const patternTrips = new Int32Array(tripTotal);
  const arrival = new Int32Array(timeTotal);
  const departure = new Int32Array(timeTotal);
  patterns.forEach((p, i) => {
    patternStops.set(p.stops, patternStopOffset[i]);
    const len = p.stops.length;
    p.trips.forEach((t, j) => {
      patternTrips[patternTripOffset[i] + j] = t.index;
      arrival.set(t.arr, patternTimeOffset[i] + j * len);
      departure.set(t.dep, patternTimeOffset[i] + j * len);
    });
  });

  // Stop → (pattern, position); a stop can occur twice in a looping pattern.
  const occurrences: number[][] = Array.from({ length: nStops }, () => []);
  for (let p = 0; p < nPatterns; p++) {
    for (let pos = 0; pos < patterns[p].stops.length; pos++) {
      occurrences[patterns[p].stops[pos]].push(p, pos);
    }
  }
  const stopPatternOffset = new Int32Array(nStops + 1);
  let occTotal = 0;
  for (let s = 0; s < nStops; s++) {
    stopPatternOffset[s] = occTotal;
    occTotal += occurrences[s].length / 2;
  }
  stopPatternOffset[nStops] = occTotal;
  const stopPatterns = new Int32Array(occTotal);
  const stopPatternPos = new Int32Array(occTotal);
  for (let s = 0; s < nStops; s++) {
    const o = occurrences[s];
    for (let j = 0; j < o.length; j += 2) {
      stopPatterns[stopPatternOffset[s] + j / 2] = o[j];
      stopPatternPos[stopPatternOffset[s] + j / 2] = o[j + 1];
    }
  }

  // Transfer rules. A station id stands for its platforms.
  const children = new Map<number, number[]>();
  for (let c = 0; c < nStops; c++) {
    if (stopParent[c] < 0) continue;
    const list = children.get(stopParent[c]) ?? [];
    list.push(c);
    children.set(stopParent[c], list);
  }
  const platformsOf = (i: number) => (stopLocationType[i] === 1 ? (children.get(i) ?? []) : [i]);
  const rules = buildTransferRules(nStops, input.transfers, platformsOf);
  const foot = buildFootpaths(
    input.stops,
    stopParent,
    input.transfers,
    input.pathways,
    options.footpathMaxM,
    rules.specificPairs,
  );
  Object.assign(stats, foot.stats);

  // Same-stop, stop-level rules (route- and trip-specific ones are in the rule table).
  const stopMinTransferSec = new Int32Array(nStops);
  const stopTransferForbidden = new Uint8Array(nStops);
  for (const t of input.transfers) {
    if (!isRoutedType(t.type)) {
      count('transfersInSeatIgnored');
      continue;
    }
    if (t.tripSpecific) count('transfersTripSpecificAppliedConservatively');
    if (t.issue) count('transfersWithIssueAppliedConservatively');
    else if (isSpecific(t)) count('transfersRouteSpecific');
    if (t.from !== t.to || isSpecific(t)) continue;
    for (const s of platformsOf(t.from)) {
      if (t.type === 3) {
        stopTransferForbidden[s] = 1;
        count('stopsWithProhibitedTransfer');
      } else if (t.type === 2 && t.minTime !== null && t.minTime > stopMinTransferSec[s]) {
        stopMinTransferSec[s] = t.minTime;
        count('stopsWithPublishedMinTransferTime');
      }
    }
  }

  let ruleStops = 0;
  for (let s = 0; s < nStops; s++) if (rules.ruleOffset[s + 1] > rules.ruleOffset[s]) ruleStops++;
  stats['stopsWithRouteSpecificTransferRules'] = ruleStops;

  // Service-day tables per agency.
  const days = options.horizonDays;
  const nServices = serviceIds.length;
  const nAgencies = input.agencies.length;
  const serviceCovered = new Uint8Array(nServices * days);
  const serviceProjected = new Uint8Array(nServices * days);
  const agencyDayStatus = new Uint8Array(nAgencies * days);
  const agencyDayProjectedFrom = new Int32Array(nAgencies * days).fill(-1);
  input.agencies.forEach((agency, a) => {
    const services = input.calendars.get(agency.code) ?? new Map<string, ServiceCalendar>();
    for (let d = 0; d < days; d++) {
      const status = serviceDateStatus(services, horizonStart + d, { allowProjection: true });
      const cell = a * days + d;
      if (status.kind === 'covered') {
        agencyDayStatus[cell] = DAY_STATUS.covered;
        for (const id of status.services) serviceCovered[serviceIndex.get(id)! * days + d] = 1;
      } else if (status.kind === 'projected') {
        agencyDayStatus[cell] = DAY_STATUS.projected;
        agencyDayProjectedFrom[cell] = status.from;
        for (const id of status.services) serviceProjected[serviceIndex.get(id)! * days + d] = 1;
      } else {
        agencyDayStatus[cell] =
          status.reason === 'no_verified_schedule_for_day_type'
            ? DAY_STATUS.noVerifiedDayType
            : DAY_STATUS.noService;
      }
    }
  });

  stats['stops'] = nStops;
  stats['routes'] = input.routes.length;
  stats['trips'] = nTrips;
  stats['routableTrips'] = tripTotal;
  stats['patterns'] = nPatterns;
  stats['stopTimes'] = timeTotal;
  stats['services'] = nServices;

  return {
    header: {
      format: SNAPSHOT_FORMAT,
      builderVersion: SNAPSHOT_BUILDER_VERSION,
      feedVersionId: input.feedVersionId,
      buildId: input.buildId,
      contentHash: input.contentHash,
      builtAt: options.builtAt,
      horizonStart: options.horizonStart,
      horizonDays: days,
      footpathMaxM: options.footpathMaxM,
      walk: { detourFactor: WALK_DETOUR_FACTOR, speedMps: WALK_SPEED_MPS },
      agencies: input.agencies.map((a) => ({
        code: a.code,
        prefix: a.prefix,
        mode: modeOfAgency(a.code),
        sourceId: a.sourceId,
        commit: a.commit,
        evidence: a.evidence,
      })),
      stats,
      strings: {
        stopIds: input.stops.map((s) => s.gtfsId),
        stopNames: input.stops.map((s) => s.name),
        routeIds: input.routes.map((r) => r.gtfsId),
        routeShortNames: input.routes.map((r) => r.shortName),
        routeLongNames: input.routes.map((r) => r.longName),
        tripIds: input.trips.map((t) => t.gtfsId),
        tripHeadsigns: input.trips.map((t) => t.headsign),
        serviceIds,
      },
    },
    stopLat,
    stopLon,
    stopAgency,
    stopParent,
    stopLocationType,
    routeAgency,
    routeType,
    tripRoute,
    tripService,
    tripHasShape,
    tripDirection,
    patternRoute,
    patternStopOffset,
    patternStops,
    patternTripOffset,
    patternTrips,
    patternTimeOffset,
    arrival,
    departure,
    stopPatternOffset,
    stopPatterns,
    stopPatternPos,
    footOffset: foot.offset,
    footTo: foot.to,
    footSec: foot.sec,
    footMeters: foot.meters,
    footKind: foot.kind,
    footPublished: foot.published,
    stopMinTransferSec,
    stopTransferForbidden,
    ruleOffset: rules.ruleOffset,
    ruleFromStop: rules.ruleFromStop,
    ruleFromRoute: rules.ruleFromRoute,
    ruleToRoute: rules.ruleToRoute,
    ruleType: rules.ruleType,
    ruleMinSec: rules.ruleMinSec,
    ruleConservative: rules.ruleConservative,
    serviceAgency: new Int16Array(serviceAgencyList),
    serviceCovered,
    serviceProjected,
    agencyDayStatus,
    agencyDayProjectedFrom,
  };
}
