import {
  classifyFreshness,
  formatGtfsTime,
  formatIsoDate,
  parseIsoDate,
  projectionMessage,
  scheduleTrust,
  serviceTimeToInstant,
  type FreshnessResult,
  type FreshnessThresholds,
  type ScheduleLabel,
  type ScheduleTrust,
} from '../gtfs/index.js';
import {
  TRUST_LABEL_SEVERITY,
  type AccessProfile,
  type EvidenceBand,
  type GeometryQuality,
  type Mode,
} from '../shared/index.js';
import { FOOTPATH_KINDS, DAY_STATUS, type FootpathKind, type Snapshot } from './types.js';
import { WALK_DETOUR_FACTOR, WALK_SPEED_MPS } from './footpaths.js';
import { resolvePlace, stopIndexById, type Place } from './places.js';
import {
  SECONDS_PER_DAY,
  raptor,
  reachableStops,
  type RawJourney,
  type RawTransitLeg,
  type RawWalkLeg,
} from './raptor.js';
import { raptorArriveBy } from './reverse.js';

export const PREFERENCES = [
  'fastest',
  'fewest_transfers',
  'least_walking',
  'balanced',
  'most_verified',
] as const;
export type Preference = (typeof PREFERENCES)[number];

/**
 * Ranking weights (SPEC §7.5): weighted sums of min–max normalised arrival time, transfers and
 * walking distance. Published in every response.
 */
export const PREFERENCE_WEIGHTS: Record<
  Preference,
  { arrival: number; transfers: number; walk: number }
> = {
  fastest: { arrival: 1, transfers: 0, walk: 0 },
  fewest_transfers: { arrival: 0.2, transfers: 1, walk: 0 },
  least_walking: { arrival: 0.2, transfers: 0, walk: 1 },
  balanced: { arrival: 0.6, transfers: 0.25, walk: 0.15 },
  most_verified: { arrival: 0.3, transfers: 0.1, walk: 0.1 },
};

/**
 * Journey label = worst transit-leg label, in this order of severity (pre-Phase 6 decision,
 * 2026-10-20). `projected` is the most severe: the published timetable does not apply to the
 * date at all. `unknown` means the timetable applies to the date but its update date cannot be
 * established. Freshness alone never proves a route correct; see `JourneyTrust.scope`.
 */
export const LABEL_SEVERITY: Readonly<Record<ScheduleLabel, number>> = TRUST_LABEL_SEVERITY;

/** Worst-first order of the feed-age dimension on its own. */
const FRESHNESS_SEVERITY = { current: 0, aging: 1, stale: 2, unknown: 3 } as const;

/**
 * Trust of a walking leg. Walking is not scheduled data, so it never takes a schedule label and
 * never changes the journey label.
 *  - `published`: the link and its time come from the feed (transfers.txt min_transfer_time,
 *    pathways.txt traversal_time);
 *  - `feed_link_estimated_time`: the feed declares the link (transfers.txt, pathways.txt) but
 *    publishes no time, so the time is estimated;
 *  - `estimated`: link and time are estimated from coordinates (stops within walking distance,
 *    platforms of one station, walks to and from a point).
 */
export const WALK_TRUST_CATEGORIES = [
  'published',
  'feed_link_estimated_time',
  'estimated',
] as const;
export type WalkTrustCategory = (typeof WALK_TRUST_CATEGORIES)[number];

export interface WalkTrust {
  kind: 'walk';
  category: WalkTrustCategory;
  reason: string;
}

/**
 * Journey-level trust, with its dimensions kept apart:
 *  - `label`: the SPEC §3.1 label, worst transit leg by LABEL_SEVERITY;
 *  - `freshness`: worst feed age over transit legs (age evidence only);
 *  - `projection`: whether timetable times are projected for none, some or all transit legs;
 *  - `walking`: the least certain walking category used, or `none`;
 *  - `scope`: these labels describe timetable data, not verified route correctness.
 */
export interface JourneyTrust {
  label: ScheduleLabel;
  worstLeg: number;
  confidence: 'normal' | 'low';
  freshness: 'current' | 'aging' | 'stale' | 'unknown';
  projection: 'none' | 'some_legs' | 'all_legs';
  walking: 'none' | WalkTrustCategory;
  scope: 'timetable_data_only';
}

export interface PlanRequest {
  from: Place;
  to: Place;
  date: string;
  /** Seconds after midnight of `date`: the earliest departure (ignored when `arriveBy` is set). */
  departAt: number;
  /**
   * Arrive-by search (SPEC F3): the latest arrival, seconds after midnight of `date`. Journeys
   * arrive within `windowMin` before it and leave as late as possible (reverse RAPTOR).
   */
  arriveBy?: number;
  windowMin: number;
  maxTransfers: number;
  minTransferSec: number;
  maxWalkM: number;
  modes: readonly Mode[];
  /** The user's choice (SPEC §3.2). */
  includeProjected: boolean;
  /** The admin's per-feed switch. Projection is used only if both are on. */
  projectionEnabledForFeed: boolean;
  preference: Preference;
  profile?: AccessProfile;
  limit: number;
  thresholds: FreshnessThresholds;
  /**
   * Stops and routes (GTFS ids) closed by verified disruption reports for this query (SPEC
   * §7.4). Unknown ids are ignored. Exclusions only remove options; they never add any.
   */
  excluded?: { stopIds: readonly string[]; routeIds: readonly string[] };
}

export interface StopRef {
  id: string;
  name: string | null;
  location: { lat: number; lon: number } | null;
}

export interface TransitLegView {
  type: 'transit';
  mode: Mode | null;
  agency: string;
  route: { id: string; shortName: string | null; longName: string | null; routeType: number };
  trip: { id: string; headsign: string | null };
  /** GTFS service day of the trip (the day before the query date for trips past 24:00). */
  serviceDate: string;
  from: StopRef;
  to: StopRef;
  scheduledDeparture: string;
  scheduledArrival: string;
  /** GTFS times on the service day; may exceed 24:00:00. */
  scheduledDepartureTime: string;
  scheduledArrivalTime: string;
  timeKind: 'scheduled';
  durationMin: number;
  intermediateStops: (StopRef & { scheduledArrival: string })[];
  geometry: { quality: GeometryQuality; coordinates: [number, number][] | null };
  trust: ScheduleTrust & { kind: 'schedule'; feedAgeDays: number | null };
  evidenceBand: EvidenceBand;
  source: { agency: string; sourceId: string; commit: string };
}

export interface WalkLegView {
  type: 'walk';
  role: 'access' | 'transfer' | 'egress';
  from: StopRef | { id: null; name: string; location: { lat: number; lon: number } | null };
  to: StopRef | { id: null; name: string; location: { lat: number; lon: number } | null };
  meters: number;
  durationMin: number;
  departure: string;
  arrival: string;
  /** Walking times are estimates unless the feed published a traversal/transfer time. */
  method: 'estimated' | 'published';
  /** How the link exists: within walking distance, same station, transfers.txt, pathways.txt. */
  link: FootpathKind | 'access' | 'egress';
  /** Walking legs are not scheduled data: they carry a walking trust category instead. */
  trust: WalkTrust;
  evidenceBand: EvidenceBand;
  geometry: { quality: 'straight-line' | 'none'; coordinates: [number, number][] | null };
  note: string;
}

export type LegView = TransitLegView | WalkLegView;

export interface Warning {
  code:
    | 'projected_schedule'
    | 'freshness_unknown'
    | 'stale_timetable'
    | 'aging_timetable'
    | 'estimated_walking'
    | 'approximate_geometry'
    | 'placeholder_departure'
    | 'accessibility_unconfirmed'
    | 'step_free_barrier'
    /** Added by the API: an unverified community report on a stop or route of this journey. */
    | 'community_report_unverified';
  severity: 'warning' | 'info';
  agency?: string;
  message: string;
}

export interface JourneyAccessibility {
  profile: AccessProfile;
  confirmedStepFree: boolean;
  stepFreeBand: EvidenceBand;
  hasElevator: boolean | null;
  hasRamp: boolean | null;
  hasTactilePaving: boolean | null;
  limitations: string[];
}

export interface JourneyView {
  rank: number;
  rankReason: string;
  tags: ('most_reliable' | 'most_verified' | 'step_free_confirmed')[];
  departure: string;
  arrival: string;
  durationMin: number;
  transfers: number;
  walkMeters: number;
  modes: Mode[];
  trust: JourneyTrust;
  evidenceBand: EvidenceBand;
  accessibility: JourneyAccessibility;
  warnings: Warning[];
  legs: LegView[];
}

export interface ServiceDayView {
  agency: string;
  mode: Mode | null;
  serviceDate: string;
  status: 'covered' | 'projected' | 'projection_off' | 'unavailable';
  message: string | null;
  projectedFrom: string | null;
}

export type EmptyReason =
  | 'origin_too_far'
  | 'destination_too_far'
  | 'same_place'
  | 'no_service_on_date'
  | 'only_projected_schedules_available'
  | 'no_connection'
  | 'closed_by_verified_report';

export interface PlanResult {
  journeys: JourneyView[];
  empty: { reason: EmptyReason; message: string } | null;
  serviceDays: ServiceDayView[];
  ranking: {
    preference: Preference;
    weights: { arrival: number; transfers: number; walk: number };
    /** The time the `arrival` weight scores: arrival (leave at), or departure (arrive by: later is better). */
    timeCriterion: 'arrival' | 'departure';
  };
  projection: { requested: boolean; enabledForFeed: boolean; applied: boolean };
  search: {
    timeMode: 'depart' | 'arrive';
    originStops: number;
    destinationStops: number;
    /** Leave-at searches: departures considered. */
    departureWindow: { from: string; to: string } | null;
    /** Arrive-by searches: arrivals considered (the end is the requested latest arrival). */
    arrivalWindow: { from: string; to: string } | null;
    maxTransfers: number;
    minTransferMin: number;
    maxWalkM: number;
  };
}

const MIN = 60;
const minutes = (sec: number) => Math.round(sec / MIN);

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** Agencies of the chosen modes, projection switch and per-agency service-day notes. */
function planJourneysContext(
  snapshot: Snapshot,
  req: Pick<PlanRequest, 'modes' | 'includeProjected' | 'projectionEnabledForFeed' | 'date'>,
) {
  const h = snapshot.header;
  const allowedAgencies = new Set(
    h.agencies.flatMap((a, i) => (a.mode !== null && req.modes.includes(a.mode) ? [i] : [])),
  );
  const projectionApplied = req.includeProjected && req.projectionEnabledForFeed;
  const day = parseIsoDate(req.date)!;
  const dayIdx = day - parseIsoDate(h.horizonStart)!;

  const serviceDays: ServiceDayView[] = h.agencies.map((a, i) => {
    const cell = i * h.horizonDays + dayIdx;
    const code = dayIdx >= 0 && dayIdx < h.horizonDays ? snapshot.agencyDayStatus[cell] : 0;
    const from = code === DAY_STATUS.projected ? snapshot.agencyDayProjectedFrom[cell] : -1;
    const base = { agency: a.code, mode: a.mode, serviceDate: req.date };
    if (code === DAY_STATUS.covered)
      return { ...base, status: 'covered', message: null, projectedFrom: null };
    if (code === DAY_STATUS.projected) {
      return projectionApplied
        ? {
            ...base,
            status: 'projected',
            message: projectionMessage(from),
            projectedFrom: formatIsoDate(from),
          }
        : {
            ...base,
            status: 'projection_off',
            message: req.projectionEnabledForFeed
              ? 'Only schedules valid for this date are shown, and none are (projection is switched off).'
              : 'Projection of expired timetables is disabled for this feed by an administrator.',
            projectedFrom: formatIsoDate(from),
          };
    }
    const dayType = ['weekday', 'weekday', 'weekday', 'weekday', 'weekday', 'Saturday', 'Sunday'][
      (((day + 3) % 7) + 7) % 7
    ];
    return {
      ...base,
      status: 'unavailable',
      message:
        code === DAY_STATUS.noVerifiedDayType
          ? `No verified ${dayType} schedule available`
          : 'No scheduled service on this date',
      projectedFrom: null,
    };
  });

  return { allowedAgencies, projectionApplied, serviceDays };
}

/** Indices of the given GTFS ids in a snapshot string table (unknown ids are ignored). */
function indexIds(ids: readonly string[] | undefined, all: readonly string[]): Set<number> {
  const wanted = new Set(ids ?? []);
  const out = new Set<number>();
  if (wanted.size > 0) all.forEach((id, i) => wanted.has(id) && out.add(i));
  return out;
}

/** Plans journeys on a snapshot. Throws PlaceError / HorizonError for invalid input. */
export function planJourneys(snapshot: Snapshot, req: PlanRequest): PlanResult {
  const h = snapshot.header;
  const { allowedAgencies, projectionApplied, serviceDays } = planJourneysContext(snapshot, req);
  const windowSec = req.windowMin * MIN;
  const arriving = req.arriveBy !== undefined;

  const excludedStops = indexIds(req.excluded?.stopIds, h.strings.stopIds);
  const excludedRoutes = indexIds(req.excluded?.routeIds, h.strings.routeIds);
  const resolved = (place: Place) => {
    const r = resolvePlace(snapshot, place, req.maxWalkM, allowedAgencies);
    const open = r.endpoints.filter((e) => !excludedStops.has(e.stop));
    return { ...r, endpoints: open, closed: r.endpoints.length - open.length };
  };
  const origin = resolved(req.from);
  const destination = resolved(req.to);
  const result = (journeys: JourneyView[], empty: PlanResult['empty']): PlanResult => ({
    journeys,
    empty,
    serviceDays,
    ranking: {
      preference: req.preference,
      weights: PREFERENCE_WEIGHTS[req.preference],
      timeCriterion: arriving ? 'departure' : 'arrival',
    },
    projection: {
      requested: req.includeProjected,
      enabledForFeed: req.projectionEnabledForFeed,
      applied: projectionApplied,
    },
    search: {
      timeMode: arriving ? 'arrive' : 'depart',
      originStops: origin.endpoints.length,
      destinationStops: destination.endpoints.length,
      departureWindow: arriving
        ? null
        : {
            from: serviceTimeToInstant(req.date, req.departAt),
            to: serviceTimeToInstant(req.date, req.departAt + windowSec),
          },
      arrivalWindow: arriving
        ? {
            from: serviceTimeToInstant(req.date, req.arriveBy! - windowSec),
            to: serviceTimeToInstant(req.date, req.arriveBy!),
          }
        : null,
      maxTransfers: req.maxTransfers,
      minTransferMin: Math.round(req.minTransferSec / 60),
      maxWalkM: req.maxWalkM,
    },
  });

  const tooFar = (which: 'origin' | 'destination', nearest: number | null) => ({
    reason: (which === 'origin' ? 'origin_too_far' : 'destination_too_far') as EmptyReason,
    message:
      nearest === null
        ? `No stop of the selected modes within 5 km of the ${which}.`
        : `The nearest stop to the ${which} is ${nearest} m away, beyond the ${req.maxWalkM} m walking limit.`,
  });
  const closed = (which: 'origin' | 'destination') =>
    result([], {
      reason: 'closed_by_verified_report',
      message: `Every stop near the ${which} is closed by a verified disruption report for this time.`,
    });
  if (origin.endpoints.length === 0)
    return origin.closed > 0
      ? closed('origin')
      : result([], tooFar('origin', origin.nearestMeters));
  if (destination.endpoints.length === 0)
    return destination.closed > 0
      ? closed('destination')
      : result([], tooFar('destination', destination.nearestMeters));
  const destStops = new Set(destination.endpoints.map((e) => e.stop));
  if (origin.endpoints.every((e) => destStops.has(e.stop))) {
    return result([], {
      reason: 'same_place',
      message: 'Origin and destination are the same stop.',
    });
  }

  const run = (includeProjected: boolean) => {
    const q = {
      date: req.date,
      windowSec,
      maxTransfers: req.maxTransfers,
      minTransferSec: req.minTransferSec,
      includeProjected,
      allowedAgencies,
      origins: origin.endpoints,
      destinations: destination.endpoints,
      excludedStops,
      excludedRoutes,
    };
    return arriving
      ? raptorArriveBy(snapshot, { ...q, arriveBy: req.arriveBy! })
      : raptor(snapshot, { ...q, departAt: req.departAt });
  };
  const raw = run(projectionApplied);

  if (raw.length === 0) {
    const involved = new Set(
      [...origin.endpoints, ...destination.endpoints].map((e) => snapshot.stopAgency[e.stop]),
    );
    const days = serviceDays.filter((_, i) => involved.has(i) && allowedAgencies.has(i));
    if (days.length > 0 && days.every((d) => d.status === 'unavailable')) {
      return result([], {
        reason: 'no_service_on_date',
        message: [...new Set(days.map((d) => `${d.agency}: ${d.message}`))].join('; '),
      });
    }
    if (
      !projectionApplied &&
      days.some((d) => d.status === 'projection_off') &&
      run(true).length > 0
    ) {
      return result([], {
        reason: 'only_projected_schedules_available',
        message: req.projectionEnabledForFeed
          ? 'Only projected schedules are available for this trip on this date. Include projected schedules to see them; they are labelled as projected.'
          : 'Only projected schedules exist for this trip on this date, and an administrator has disabled projection for this feed.',
      });
    }
    const hhmm = (sec: number) => formatGtfsTime(sec).slice(0, 5);
    const between = arriving
      ? `arriving between ${hhmm(Math.max(0, req.arriveBy! - windowSec))} and ${hhmm(req.arriveBy!)}`
      : `departing between ${hhmm(req.departAt)} and ${hhmm(req.departAt + windowSec)}`;
    return result([], {
      reason: 'no_connection',
      message: `No scheduled journey found ${between} with at most ${req.maxTransfers} transfer${req.maxTransfers === 1 ? '' : 's'}${excludedStops.size + excludedRoutes.size > 0 ? ', avoiding stops and routes closed by verified disruption reports' : ''}.`,
    });
  }

  const views = raw.map((j) => describe(snapshot, req, j));
  return result(rank(views, raw, req).slice(0, req.limit), null);
}

function stopRef(s: Snapshot, i: number): StopRef {
  return {
    id: s.header.strings.stopIds[i],
    name: s.header.strings.stopNames[i],
    location: Number.isNaN(s.stopLat[i]) ? null : { lat: s.stopLat[i], lon: s.stopLon[i] },
  };
}

function placeRef(place: Place, which: 'Origin' | 'Destination') {
  return {
    id: null,
    name: place.kind === 'point' ? (place.label ?? which) : which,
    location: place.kind === 'point' ? { lat: place.lat, lon: place.lon } : null,
  };
}

export function computeTransitEvidenceBand(
  trust: ScheduleTrust,
  ageDays: number | null,
): EvidenceBand {
  if (trust.checks.calendarCoverage === 'projected') return 'uncertain';
  if (ageDays === null || trust.checks.feedAge.label === 'unknown') return 'unknown';
  if (trust.checks.feedAge.label === 'stale') return 'uncertain';
  if (trust.checks.feedAge.label === 'aging') return 'likely';
  return 'verified';
}

export function computeWalkEvidenceBand(
  published: boolean,
  link: FootpathKind | 'access' | 'egress',
): EvidenceBand {
  if (published) return 'likely';
  if (link === 'station' || link === 'pathway') return 'likely';
  return 'uncertain';
}

export function computeJourneyEvidenceBand(legs: LegView[]): EvidenceBand {
  const bands = legs.map((l) => l.evidenceBand);
  if (bands.includes('unknown')) return 'unknown';
  if (bands.includes('uncertain')) return 'uncertain';
  if (bands.includes('likely')) return 'likely';
  return 'verified';
}

export function computeJourneyAccessibility(
  legs: LegView[],
  profile: AccessProfile = 'standard',
): JourneyAccessibility {
  const limitations: string[] = [];
  let confirmedStepFree = false;
  let stepFreeBand: EvidenceBand = 'unknown';

  const transitLegs = legs.filter((l): l is TransitLegView => l.type === 'transit');
  const walkLegs = legs.filter((l): l is WalkLegView => l.type === 'walk');

  const hasBus = transitLegs.some((l) => l.agency === 'MTC' || l.mode === 'bus');
  const hasMetro = transitLegs.some((l) => l.agency === 'CMRL' || l.mode === 'metro');
  const hasSuburban = transitLegs.some((l) => l.agency === 'SRR' || l.mode === 'suburban_rail');

  if (profile === 'wheelchair') {
    if (hasBus) {
      limitations.push('MTC buses do not have confirmed low-floor/ramp equipment in published data.');
      stepFreeBand = 'unknown';
      confirmedStepFree = false;
    } else if (hasMetro && !hasSuburban) {
      stepFreeBand = 'likely';
      confirmedStepFree = true;
    } else if (hasSuburban) {
      limitations.push('Suburban stations may have foot overbridges with stairs and unconfirmed lift status.');
      stepFreeBand = 'uncertain';
      confirmedStepFree = false;
    } else {
      stepFreeBand = 'uncertain';
      confirmedStepFree = false;
      limitations.push('Pedestrian walking route kerb cuts and pavement quality are unverified.');
    }
  } else if (profile === 'elderly' || profile === 'prams_luggage') {
    if (hasSuburban) {
      limitations.push('Suburban stations may require climbing foot overbridge stairs.');
    }
    stepFreeBand = hasMetro ? 'likely' : 'uncertain';
    confirmedStepFree = hasMetro && !hasSuburban;
  } else if (profile === 'minimal_walking') {
    const totalWalk = walkLegs.reduce((sum, l) => sum + l.meters, 0);
    if (totalWalk > 400) {
      limitations.push(`Total walking distance (${totalWalk}m) exceeds 400m target.`);
    }
    stepFreeBand = 'likely';
    confirmedStepFree = false;
  } else if (profile === 'low_vision') {
    if (!hasMetro) {
      limitations.push('Tactile paving and audible platform announcements are unconfirmed on this route.');
    }
    stepFreeBand = hasMetro ? 'likely' : 'uncertain';
    confirmedStepFree = false;
  } else {
    stepFreeBand = 'verified';
    confirmedStepFree = false;
  }

  return {
    profile,
    confirmedStepFree,
    stepFreeBand,
    hasElevator: hasMetro ? true : null,
    hasRamp: hasMetro ? true : null,
    hasTactilePaving: hasMetro ? true : null,
    limitations,
  };
}

function describe(
  s: Snapshot,
  req: PlanRequest,
  raw: RawJourney,
): JourneyView & { _severity: number } {
  const h = s.header;
  const freshness = new Map<number, FreshnessResult>();
  const freshnessOf = (agency: number) => {
    let f = freshness.get(agency);
    if (!f) {
      f = classifyFreshness(h.agencies[agency]?.evidence, req.date, req.thresholds);
      freshness.set(agency, f);
    }
    return f;
  };
  const instant = (sec: number) => serviceTimeToInstant(req.date, sec);
  const dayIdx0 = parseIsoDate(req.date)! - parseIsoDate(h.horizonStart)!;

  const legs: LegView[] = raw.legs.map((leg) => {
    if (leg.kind === 'transit') return transitLeg(leg);
    return walkLeg(leg);
  });

  function transitLeg(leg: RawTransitLeg): TransitLegView {
    const route = s.patternRoute[leg.pattern];
    const agency = s.routeAgency[route];
    const a = h.agencies[agency];
    const so = s.patternStopOffset[leg.pattern];
    const len = s.patternStopOffset[leg.pattern + 1] - so;
    const base = s.patternTimeOffset[leg.pattern] + leg.slot * len;
    const shift = leg.dayOffset * SECONDS_PER_DAY;
    const serviceDay = parseIsoDate(req.date)! + leg.dayOffset;
    const fresh = freshnessOf(agency);
    const cell = agency * h.horizonDays + dayIdx0 + leg.dayOffset;
    const trust = scheduleTrust(
      leg.service === 'projected'
        ? {
            kind: 'projected',
            from: s.agencyDayProjectedFrom[cell],
            services: [],
            message: projectionMessage(s.agencyDayProjectedFrom[cell]),
          }
        : { kind: 'covered', services: [] },
      fresh,
    );
    const stops: number[] = [];
    for (let i = leg.boardPos; i <= leg.alightPos; i++) stops.push(s.patternStops[so + i]);
    const coords = stops.map((st) =>
      Number.isNaN(s.stopLat[st]) ? null : ([s.stopLon[st], s.stopLat[st]] as [number, number]),
    );
    const complete = coords.every((c) => c !== null);
    const trip = leg.trip;
    return {
      type: 'transit',
      mode: a?.mode ?? null,
      agency: a?.code ?? '',
      route: {
        id: h.strings.routeIds[route],
        shortName: h.strings.routeShortNames[route],
        longName: h.strings.routeLongNames[route],
        routeType: s.routeType[route],
      },
      trip: { id: h.strings.tripIds[trip], headsign: h.strings.tripHeadsigns[trip] },
      serviceDate: formatIsoDate(serviceDay),
      from: stopRef(s, stops[0]),
      to: stopRef(s, stops[stops.length - 1]),
      scheduledDeparture: instant(leg.departure),
      scheduledArrival: instant(leg.arrival),
      scheduledDepartureTime: formatGtfsTime(leg.departure - shift),
      scheduledArrivalTime: formatGtfsTime(leg.arrival - shift),
      timeKind: 'scheduled',
      durationMin: minutes(leg.arrival - leg.departure),
      intermediateStops: stops.slice(1, -1).map((st, k) => ({
        ...stopRef(s, st),
        scheduledArrival: instant(s.arrival[base + leg.boardPos + 1 + k] + shift),
      })),
      geometry: {
        // Track shapes are fetched by the API from the database; the snapshot knows only that one exists.
        quality: s.tripHasShape[trip] ? 'track' : complete ? 'straight-line' : 'none',
        coordinates: complete ? coords : null,
      },
      trust: { kind: 'schedule', ...trust, feedAgeDays: fresh.ageDays },
      evidenceBand: computeTransitEvidenceBand(trust, fresh.ageDays),
      source: { agency: a?.code ?? '', sourceId: a?.sourceId ?? '', commit: a?.commit ?? '' },
    };
  }

  function walkLeg(leg: RawWalkLeg): WalkLegView {
    const from = leg.fromStop >= 0 ? stopRef(s, leg.fromStop) : placeRef(req.from, 'Origin');
    const to = leg.toStop >= 0 ? stopRef(s, leg.toStop) : placeRef(req.to, 'Destination');
    const published = leg.edge >= 0 && s.footPublished[leg.edge] === 1;
    const link: WalkLegView['link'] =
      leg.role === 'transfer'
        ? FOOTPATH_KINDS[s.footKind[leg.edge]]
        : leg.role === 'access'
          ? 'access'
          : 'egress';
    const a = from.location;
    const b = to.location;
    const category: WalkTrustCategory = published
      ? 'published'
      : link === 'transfer' || link === 'pathway'
        ? 'feed_link_estimated_time'
        : 'estimated';
    const reason =
      category === 'published'
        ? 'The operator publishes this link and its walking time.'
        : category === 'feed_link_estimated_time'
          ? 'The operator publishes this link but no walking time; the time is estimated.'
          : 'Link and time are estimated from straight-line distance; the path is not verified.';
    return {
      type: 'walk',
      role: leg.role,
      from,
      to,
      meters: leg.meters,
      durationMin: minutes(leg.sec),
      departure: instant(leg.departure),
      arrival: instant(leg.arrival),
      method: published ? 'published' : 'estimated',
      link,
      trust: { kind: 'walk', category, reason },
      evidenceBand: computeWalkEvidenceBand(published, link),
      geometry: {
        quality: a && b ? 'straight-line' : 'none',
        coordinates:
          a && b
            ? [
                [a.lon, a.lat],
                [b.lon, b.lat],
              ]
            : null,
      },
      note: published
        ? 'Walking time published by the operator; the path itself is not shown.'
        : 'Estimated from straight-line distance × 1.3 at 1.2 m/s. The path, its safety and its accessibility are not verified.',
    };
  }

  // Journey label: worst transit leg. Walking legs never change it (they are not scheduled data).
  let worst = -1;
  let worstSeverity = -1;
  legs.forEach((l, i) => {
    if (l.type !== 'transit') return;
    const sev = LABEL_SEVERITY[l.trust.label];
    if (sev > worstSeverity) {
      worstSeverity = sev;
      worst = i;
    }
  });
  const worstLabel = (legs[worst] as TransitLegView).trust.label;

  const warnings: Warning[] = [];
  const seen = new Set<string>();
  const warn = (w: Warning) => {
    const key = `${w.code}|${w.agency ?? ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      warnings.push(w);
    }
  };
  for (const l of legs) {
    if (l.type === 'walk') {
      if (l.method === 'estimated') {
        warn({
          code: 'estimated_walking',
          severity: 'info',
          message:
            'Walking times are estimated from straight-line distance; paths and accessibility are not verified.',
        });
      }
      continue;
    }
    const t = l.trust;
    if (l.scheduledDepartureTime === '00:00:15' || l.scheduledArrivalTime === '00:00:15') {
      warn({
        code: 'placeholder_departure',
        severity: 'warning',
        agency: l.agency,
        message: `${l.agency} publishes a placeholder departure time (00:00:15); actual scheduled departure is not tracked.`,
      });
    }
    // Projection and feed age are separate dimensions: a projected leg also reports its feed age.
    if (t.checks.calendarCoverage === 'projected') {
      warn({
        code: 'projected_schedule',
        severity: 'warning',
        agency: l.agency,
        message: `${l.agency} times are ${t.reason.charAt(0).toLowerCase()}${t.reason.slice(1)}. They are not a published timetable for this date.`,
      });
    }
    const age = t.checks.feedAge;
    if (age.label === 'unknown') {
      warn({
        code: 'freshness_unknown',
        severity: 'warning',
        agency: l.agency,
        message: `When the ${l.agency} timetable was last updated cannot be established, so these scheduled times may be out of date.`,
      });
    } else if (age.label === 'stale') {
      warn({
        code: 'stale_timetable',
        severity: 'warning',
        agency: l.agency,
        message: `The ${l.agency} timetable is ${t.feedAgeDays} days old; services may have changed.`,
      });
    } else if (age.label === 'aging') {
      warn({
        code: 'aging_timetable',
        severity: 'info',
        agency: l.agency,
        message: `The ${l.agency} timetable is ${t.feedAgeDays} days old.`,
      });
    }
    if (l.geometry.quality === 'straight-line') {
      warn({
        code: 'approximate_geometry',
        severity: 'info',
        agency: l.agency,
        message: `${l.agency} publishes no route shapes; the map draws straight lines between stops.`,
      });
    }
  }

  const transit = legs.filter((l): l is TransitLegView => l.type === 'transit');
  const worstFreshness = transit
    .map((l) => l.trust.checks.feedAge.label)
    .reduce<JourneyTrust['freshness']>(
      (w, f) =>
        (FRESHNESS_SEVERITY[f as keyof typeof FRESHNESS_SEVERITY] ?? 0) >
        (FRESHNESS_SEVERITY[w as keyof typeof FRESHNESS_SEVERITY] ?? 0)
          ? f
          : w,
      'current',
    );
  const projectedLegs = transit.filter(
    (l) => l.trust.checks.calendarCoverage === 'projected',
  ).length;
  const walkRank: Record<JourneyTrust['walking'], number> = {
    none: 0,
    published: 1,
    feed_link_estimated_time: 2,
    estimated: 3,
  };
  const walking = legs
    .filter((l): l is WalkLegView => l.type === 'walk')
    .map((l) => l.trust.category)
    .reduce<JourneyTrust['walking']>((w, c) => (walkRank[c] > walkRank[w] ? c : w), 'none');

  const accessibility = computeJourneyAccessibility(legs, req.profile);
  const evidenceBand = computeJourneyEvidenceBand(legs);

  if (req.profile === 'wheelchair' && !accessibility.confirmedStepFree) {
    warn({
      code: 'accessibility_unconfirmed',
      severity: 'warning',
      message:
        'Step-free access is unconfirmed for this journey. By engineering safety principle, unknown facilities are never assumed accessible by default.',
    });
  }

  return {
    rank: 0,
    rankReason: '',
    tags: [],
    departure: instant(raw.departure),
    arrival: instant(raw.arrival),
    durationMin: minutes(raw.arrival - raw.departure),
    transfers: raw.transfers,
    walkMeters: legs.reduce((m, l) => m + (l.type === 'walk' ? l.meters : 0), 0),
    modes: [...new Set(transit.map((l) => l.mode).filter((m): m is Mode => m !== null))],
    trust: {
      label: worstLabel,
      worstLeg: worst,
      confidence: worstSeverity <= LABEL_SEVERITY.aging ? 'normal' : 'low',
      freshness: worstFreshness,
      projection:
        projectedLegs === 0 ? 'none' : projectedLegs === transit.length ? 'all_legs' : 'some_legs',
      walking,
      scope: 'timetable_data_only',
    },
    evidenceBand,
    accessibility,
    warnings,
    legs,
    _severity: worstSeverity,
  };
}

/**
 * Ranking policy for data quality:
 *  1. Trust never hides a journey and never changes the preset score unless 'most_verified'
 *     preset or access constraints are explicitly selected.
 *  2. Equal scores are ordered by trust (more reliable first), then arrival, transfers, walking.
 *  3. Low-confidence journeys say so in `trust.confidence`, `evidenceBand`, `warnings` and in `rankReason`.
 */
function rank(
  views: (JourneyView & { _severity: number })[],
  raw: RawJourney[],
  req: PlanRequest,
): JourneyView[] {
  const w = PREFERENCE_WEIGHTS[req.preference];
  const arriving = req.arriveBy !== undefined;
  // Arrive-by: the time criterion is departure, later is better (scored as its negative).
  const values = views.map((v, i) => ({
    v,
    arrival: arriving ? -raw[i].departure : raw[i].arrival,
    transfers: v.transfers,
    walk: v.walkMeters,
    departure: raw[i].departure,
  }));
  const span = (key: 'arrival' | 'transfers' | 'walk') => {
    const xs = values.map((x) => x[key]);
    const min = Math.min(...xs);
    const max = Math.max(...xs);
    return (x: number) => (max === min ? 0 : (x - min) / (max - min));
  };
  const na = span('arrival');
  const nt = span('transfers');
  const nw = span('walk');
  const scored = values.map((x) => {
    let score = w.arrival * na(x.arrival) + w.transfers * nt(x.transfers) + w.walk * nw(x.walk);
    if (req.preference === 'most_verified') {
      score += 0.5 * (x.v._severity / 4);
    }
    return {
      ...x,
      score,
    };
  });
  scored.sort((a, b) => {
    if (req.profile === 'wheelchair') {
      const aStep = a.v.accessibility.confirmedStepFree ? 0 : 1;
      const bStep = b.v.accessibility.confirmedStepFree ? 0 : 1;
      if (aStep !== bStep) return aStep - bStep;
    }
    return (
      a.score - b.score ||
      a.v._severity - b.v._severity ||
      a.arrival - b.arrival ||
      a.transfers - b.transfers ||
      a.walk - b.walk ||
      b.departure - a.departure
    );
  });

  const presetText: Record<Preference, string> = {
    fastest: arriving ? 'latest departure' : 'earliest arrival',
    fewest_transfers: 'fewest transfers',
    least_walking: 'least walking',
    balanced: `balance of ${arriving ? 'departure' : 'arrival'} (${w.arrival}), transfers (${w.transfers}) and walking (${w.walk})`,
    most_verified: 'highest evidence quality and timetable verification',
  };
  const minSeverity = Math.min(...scored.map((x) => x.v._severity));
  const reliableIndex = scored.findIndex((x) => x.v._severity === minSeverity);

  return scored.map((x, i) => {
    const view: JourneyView = { ...x.v };
    delete (view as Partial<JourneyView & { _severity: number }>)._severity;
    const parts: string[] = [];
    const time = (sec: number) =>
      formatGtfsTime(((sec % SECONDS_PER_DAY) + SECONDS_PER_DAY) % SECONDS_PER_DAY).slice(0, 5);
    // `arrival` holds −departure in arrive-by searches (see above).
    const verb = arriving ? 'leaves' : 'arrives';
    const clock = (v: number) => time(arriving ? -v : v);
    if (i === 0) {
      const next = scored[1];
      const lead = next ? Math.round((next.arrival - x.arrival) / MIN) : 0;
      parts.push(
        `Ranked 1st by ${presetText[req.preference]}`,
        next && lead > 0
          ? `${verb} ${lead} min ${arriving ? 'later' : 'earlier'} than the next option`
          : `${verb} ${clock(x.arrival)}`,
      );
    } else {
      const delta = Math.round((x.arrival - scored[0].arrival) / MIN);
      const worse = arriving ? 'before' : 'after';
      const better = arriving ? 'after' : 'before';
      parts.push(
        `Ranked ${ordinal(i + 1)}`,
        delta > 0
          ? `${verb} ${delta} min ${worse} option 1`
          : delta < 0
            ? `${verb} ${-delta} min ${better} option 1`
            : `${verb} at the same time as option 1`,
      );
    }
    parts.push(`${x.transfers} transfer${x.transfers === 1 ? '' : 's'}`, `${x.walk} m walking`);
    if (view.trust.confidence === 'low') {
      parts.push(`low confidence: ${view.trust.label} timetable data`);
    }
    if (i === 0 && reliableIndex > 0) {
      parts.push(`option ${reliableIndex + 1} uses more reliable timetable data`);
    }
    if (req.profile === 'wheelchair' && view.accessibility.confirmedStepFree) {
      parts.push('confirmed step-free route');
    }

    const tags: ('most_reliable' | 'most_verified' | 'step_free_confirmed')[] = [];
    if (i === reliableIndex && i > 0) tags.push('most_reliable');
    if (req.preference === 'most_verified' && i === 0) tags.push('most_verified');
    if (req.profile === 'wheelchair' && view.accessibility.confirmedStepFree) {
      tags.push('step_free_confirmed');
    }

    return {
      ...view,
      rank: i + 1,
      rankReason: parts.join('; ') + '.',
      tags,
    };
  });
}

export interface ReachabilityRequest {
  from: Place;
  date: string;
  /** Seconds after midnight of `date`: the exact departure time (no window). */
  departAt: number;
  maxDurationMin: number;
  maxTransfers: number;
  minTransferSec: number;
  maxWalkM: number;
  modes: readonly Mode[];
  includeProjected: boolean;
  projectionEnabledForFeed: boolean;
  thresholds: FreshnessThresholds;
  excluded?: PlanRequest['excluded'];
}

export interface ReachedStopView {
  id: string;
  name: string | null;
  location: { lat: number; lon: number };
  /** Operator code (MTC, CMRL, SRR) and its mode. */
  agency: string;
  mode: Mode | null;
  /** The station a platform belongs to, so a station is counted and shown once. */
  station: { id: string; name: string | null; location: { lat: number; lon: number } } | null;
  arrival: string;
  /** Exact seconds from leaving to arriving (the hexagon layer works from these, not minutes). */
  elapsedSec: number;
  /** Whole minutes, rounded up. */
  minutes: number;
  /** Transit legs used; 0 when reached on foot from the origin. */
  vehicles: number;
  /** Journey label (worst transit leg); null when reached on foot only (walking has no schedule label). */
  label: ScheduleLabel | null;
  /** Walking metres left within the time limit, from this stop (for the hexagon layer). */
  walkBudgetM: number;
}

export interface ReachabilityResult {
  departure: string;
  maxDurationMin: number;
  /** Where the search starts: the point, or the stop (station) location. */
  origin: { lat: number; lon: number };
  /** Stops the search may start from: the origin stop and those within walking distance. */
  originStops: number;
  serviceDays: ServiceDayView[];
  projection: PlanResult['projection'];
  stops: ReachedStopView[];
}

/**
 * Where a reachability search starts (SPEC F10: "from a point"). A point uses the usual access
 * walk to nearby stops. A stop is treated as the point where it stands: the stop itself (or the
 * station's platforms) with no walk, plus the same access walk to nearby stops, so the area shaded
 * as reachable on foot from the origin and the stops searched from always agree. (Journey
 * planning from a stop is unchanged: there the stop id means "board here".)
 */
function reachabilityOrigin(
  snapshot: Snapshot,
  from: Place,
  maxWalkM: number,
  allowedAgencies: ReadonlySet<number>,
): {
  endpoints: ReturnType<typeof resolvePlace>['endpoints'];
  location: { lat: number; lon: number };
} {
  const own = resolvePlace(snapshot, from, maxWalkM, allowedAgencies).endpoints;
  if (from.kind === 'point') return { endpoints: own, location: { lat: from.lat, lon: from.lon } };
  const i = stopIndexById(snapshot, from.id)!;
  const location = { lat: snapshot.stopLat[i], lon: snapshot.stopLon[i] };
  const near = resolvePlace(
    snapshot,
    { kind: 'point', lat: location.lat, lon: location.lon },
    maxWalkM,
    allowedAgencies,
  ).endpoints;
  const best = new Map<number, (typeof own)[number]>();
  for (const e of [...own, ...near]) {
    const cur = best.get(e.stop);
    if (!cur || e.sec < cur.sec) best.set(e.stop, e);
  }
  return { endpoints: [...best.values()], location };
}

/**
 * Earliest arrival at every stop within `maxDurationMin` of leaving at `departAt` (SPEC F10),
 * with the same calendars, projection, transfer rules and exclusions as journey planning. Each
 * reached stop carries the trust label of the journey that reaches it.
 */
export function planReachability(snapshot: Snapshot, req: ReachabilityRequest): ReachabilityResult {
  const plan = planJourneysContext(snapshot, req);
  const origin = reachabilityOrigin(snapshot, req.from, req.maxWalkM, plan.allowedAgencies);
  const excludedStops = indexIds(req.excluded?.stopIds, snapshot.header.strings.stopIds);
  const excludedRoutes = indexIds(req.excluded?.routeIds, snapshot.header.strings.routeIds);
  const endpoints = origin.endpoints.filter((e) => !excludedStops.has(e.stop));
  const limitSec = req.maxDurationMin * MIN;
  const reached =
    endpoints.length === 0
      ? []
      : reachableStops(snapshot, {
          date: req.date,
          departAt: req.departAt,
          maxDurationSec: limitSec,
          maxTransfers: req.maxTransfers,
          minTransferSec: req.minTransferSec,
          includeProjected: plan.projectionApplied,
          allowedAgencies: plan.allowedAgencies,
          origins: endpoints,
          excludedStops,
          excludedRoutes,
        });
  const describeReq: PlanRequest = {
    from: req.from,
    to: req.from,
    date: req.date,
    departAt: req.departAt,
    windowMin: 0,
    maxTransfers: req.maxTransfers,
    minTransferSec: req.minTransferSec,
    maxWalkM: req.maxWalkM,
    modes: req.modes,
    includeProjected: req.includeProjected,
    projectionEnabledForFeed: req.projectionEnabledForFeed,
    preference: 'fastest',
    limit: 1,
    thresholds: req.thresholds,
  };
  const stops: ReachedStopView[] = [];
  for (const r of reached) {
    const lat = snapshot.stopLat[r.stop];
    const lon = snapshot.stopLon[r.stop];
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
    const view = r.journey ? describe(snapshot, describeReq, r.journey) : null;
    const left = req.departAt + limitSec - r.arrival;
    const agency = snapshot.header.agencies[snapshot.stopAgency[r.stop]];
    const parent = snapshot.stopParent[r.stop];
    stops.push({
      id: snapshot.header.strings.stopIds[r.stop],
      name: snapshot.header.strings.stopNames[r.stop],
      location: { lat, lon },
      agency: agency?.code ?? '',
      mode: agency?.mode ?? null,
      station:
        parent >= 0
          ? {
              id: snapshot.header.strings.stopIds[parent],
              name: snapshot.header.strings.stopNames[parent],
              location: { lat: snapshot.stopLat[parent], lon: snapshot.stopLon[parent] },
            }
          : null,
      arrival: serviceTimeToInstant(req.date, r.arrival),
      elapsedSec: r.arrival - req.departAt,
      minutes: Math.ceil((r.arrival - req.departAt) / MIN),
      vehicles: view ? view.transfers + 1 : 0,
      label: view ? view.trust.label : null,
      // Inverse of the walking estimate (SPEC §7): metres = seconds × speed ÷ detour.
      walkBudgetM: Math.max(
        0,
        Math.min(req.maxWalkM, Math.floor((left * WALK_SPEED_MPS) / WALK_DETOUR_FACTOR)),
      ),
    });
  }
  return {
    departure: serviceTimeToInstant(req.date, req.departAt),
    maxDurationMin: req.maxDurationMin,
    origin: origin.location,
    originStops: endpoints.length,
    serviceDays: plan.serviceDays,
    projection: {
      requested: req.includeProjected,
      enabledForFeed: req.projectionEnabledForFeed,
      applied: plan.projectionApplied,
    },
    stops,
  };
}
