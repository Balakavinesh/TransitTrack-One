import type { FreshnessEvidence, ServiceCalendar } from '../gtfs/index.js';
import type { Mode } from '../shared/index.js';

/** Everything the snapshot builder needs, as plain data (packages/db loads it). */
export interface RouterInput {
  feedVersionId: number;
  buildId: string;
  contentHash: string;
  agencies: {
    code: string;
    prefix: string;
    sourceId: string;
    commit: string;
    evidence: FreshnessEvidence;
  }[];
  stops: {
    gtfsId: string;
    name: string | null;
    lat: number | null;
    lon: number | null;
    agency: string;
    parentGtfsId: string | null;
    locationType: number;
  }[];
  routes: {
    gtfsId: string;
    agency: string;
    shortName: string | null;
    longName: string | null;
    routeType: number;
  }[];
  trips: {
    gtfsId: string;
    /** Index into `routes`. */
    route: number;
    serviceId: string;
    headsign: string | null;
    directionId: number | null;
    /** True when the trip references a stored shape (geometry `track`). */
    hasShape: boolean;
    /** Indices into `stops`, in stop_sequence order, with times in seconds (null = untimed). */
    stops: number[];
    arrival: (number | null)[];
    departure: (number | null)[];
  }[];
  /** Per agency code: service calendars. */
  calendars: Map<string, Map<string, ServiceCalendar>>;
  /**
   * GTFS transfers.txt (indices into `stops`; routes into `routes`, null = any route). Semantics
   * and precedence: transfer-rules.ts. `tripSpecific` rows (from_trip_id / to_trip_id set) and
   * rows with an `issue` (unknown route or trip, type 2 without a minimum time; see
   * packages/db/src/transfers.ts) are applied conservatively only.
   */
  transfers: {
    from: number;
    to: number;
    type: number;
    minTime: number | null;
    fromRoute?: number | null;
    toRoute?: number | null;
    tripSpecific?: boolean;
    issue?: string | null;
  }[];
  /** GTFS pathways.txt (indices into `stops`). */
  pathways: { from: number; to: number; bidirectional: boolean; traversalTime: number | null }[];
}

export interface SnapshotOptions {
  /** First day of the service-day tables (YYYY-MM-DD); normally the build date minus one day. */
  horizonStart: string;
  /** Number of days in the service-day tables (SPEC: 120). */
  horizonDays: number;
  /** Max straight-line metres for stop-to-stop footpaths (FOOTPATH_MAX_M). */
  footpathMaxM: number;
  builtAt: string;
}

/** Footpath kinds. All walking times are estimates unless `traversal_time` was published. */
export const FOOTPATH_KINDS = ['proximity', 'station', 'transfer', 'pathway'] as const;
export type FootpathKind = (typeof FOOTPATH_KINDS)[number];

/** Per agency and service day. */
export const DAY_STATUS = {
  covered: 1,
  projected: 2,
  noService: 10,
  noVerifiedDayType: 11,
} as const;

export interface SnapshotHeader {
  format: number;
  builderVersion: number;
  feedVersionId: number;
  buildId: string;
  contentHash: string;
  builtAt: string;
  horizonStart: string;
  horizonDays: number;
  footpathMaxM: number;
  /** Walking model for estimated footpaths (SPEC §7): haversine × detour / speed. */
  walk: { detourFactor: number; speedMps: number };
  agencies: {
    code: string;
    prefix: string;
    mode: Mode | null;
    sourceId: string;
    commit: string;
    evidence: FreshnessEvidence;
  }[];
  stats: Record<string, number>;
  strings: {
    stopIds: string[];
    stopNames: (string | null)[];
    routeIds: string[];
    routeShortNames: (string | null)[];
    routeLongNames: (string | null)[];
    tripIds: string[];
    tripHeadsigns: (string | null)[];
    serviceIds: string[];
  };
}

/** The in-memory routing timetable. Typed arrays; see snapshot.ts for their layout. */
export interface Snapshot {
  header: SnapshotHeader;
  stopLat: Float64Array;
  stopLon: Float64Array;
  stopAgency: Int16Array;
  stopParent: Int32Array;
  stopLocationType: Int8Array;
  routeAgency: Int16Array;
  routeType: Int32Array;
  tripRoute: Int32Array;
  tripService: Int32Array;
  tripHasShape: Uint8Array;
  tripDirection: Int8Array;
  patternRoute: Int32Array;
  patternStopOffset: Int32Array;
  patternStops: Int32Array;
  patternTripOffset: Int32Array;
  patternTrips: Int32Array;
  /** Index of the first time of pattern p in `arrival`/`departure` (trip-major). */
  patternTimeOffset: Int32Array;
  arrival: Int32Array;
  departure: Int32Array;
  stopPatternOffset: Int32Array;
  stopPatterns: Int32Array;
  stopPatternPos: Int32Array;
  footOffset: Int32Array;
  footTo: Int32Array;
  footSec: Int32Array;
  footMeters: Int32Array;
  footKind: Uint8Array;
  /**
   * Same-stop, stop-level transfer rules from transfers.txt (from_stop_id = to_stop_id, no route
   * or trip): a published minimum transfer time (0 = none) and whether re-boarding there after a
   * vehicle is prohibited (type 3). Not used at stops that have a rule table (below).
   */
  stopMinTransferSec: Int32Array;
  stopTransferForbidden: Uint8Array;
  /** Route-aware transfer rules by boarding stop (TransferRuleTable in transfer-rules.ts). */
  ruleOffset: Int32Array;
  ruleFromStop: Int32Array;
  ruleFromRoute: Int32Array;
  ruleToRoute: Int32Array;
  ruleType: Uint8Array;
  ruleMinSec: Int32Array;
  ruleConservative: Uint8Array;
  /** 1 when the walking time was published in the feed (transfers.txt / pathways.txt), 0 when estimated. */
  footPublished: Uint8Array;
  serviceAgency: Int16Array;
  /** [service × horizonDays]: 1 when the service runs on that day by its own calendar. */
  serviceCovered: Uint8Array;
  /** [service × horizonDays]: 1 when the service is used to project that day (SPEC §3.2). */
  serviceProjected: Uint8Array;
  /** [agency × horizonDays]: DAY_STATUS code. */
  agencyDayStatus: Uint8Array;
  /** [agency × horizonDays]: projection reference day number, or -1. */
  agencyDayProjectedFrom: Int32Array;
}
