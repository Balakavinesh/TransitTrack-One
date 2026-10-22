import { haversineMeters } from '../gtfs/index.js';
import type { Mode } from '../shared/index.js';
import type { JourneyView, TransitLegView } from './plan.js';

/**
 * Coarse CO₂ estimates (SPEC F11). Only documented factors are used; a mode or a leg without one
 * is "unavailable", never guessed. Distances:
 *  - metro: the published track shape when the leg has one, otherwise stop to stop;
 *  - suburban rail: stop to stop (straight lines between consecutive stops);
 *  - bus: stop to stop × a detour factor (MTC publishes no shapes), always labelled coarse.
 * Walking legs emit nothing and are not counted.
 */
export interface EmissionFactorRef {
  id: string;
  mode: Mode;
  /** kg CO₂ per passenger-km. */
  value: number;
  source: string;
  tableRef: string;
  year: string;
  notApplicableTo: string | null;
}

export type DistanceMethod = 'track' | 'stop_to_stop' | 'stop_to_stop_with_detour';

export interface LegEmission {
  /** Index into journey.legs. */
  leg: number;
  mode: Mode | null;
  distanceKm: number | null;
  distanceMethod: DistanceMethod | null;
  status: 'estimated' | 'unavailable';
  kgCo2: number | null;
  factorId: string | null;
  reason: string | null;
}

export interface JourneyEmissions {
  /** estimated: every transit leg has an estimate; partial: some; unavailable: none. */
  status: 'estimated' | 'partial' | 'unavailable';
  /** Sum over transit legs, only when every leg has an estimate. */
  kgCo2: number | null;
  quality: 'coarse';
  legs: LegEmission[];
  reason: string | null;
}

export interface EmissionOptions {
  factors: ReadonlyMap<Mode, EmissionFactorRef>;
  /** Multiplier for bus stop-to-stop distance (an assumption, documented with the result). */
  busDetourFactor: number;
  /** A reason the leg's factor does not apply (e.g. Chennai MRTS for the suburban factor), or null. */
  notApplicable?: (leg: TransitLegView) => string | null;
}

const km = (meters: number) => Math.round(meters / 10) / 100;

function pathMeters(points: { lat: number; lon: number }[]): number {
  let m = 0;
  for (let i = 1; i < points.length; i++) {
    m += haversineMeters(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
  }
  return m;
}

function legDistance(
  leg: TransitLegView,
  busDetour: number,
): { meters: number; method: DistanceMethod } | null {
  if (leg.mode === 'metro' && leg.geometry.quality === 'track' && leg.geometry.coordinates) {
    return {
      meters: pathMeters(leg.geometry.coordinates.map(([lon, lat]) => ({ lat, lon }))),
      method: 'track',
    };
  }
  const stops = [leg.from, ...leg.intermediateStops, leg.to].map((s) => s.location);
  if (stops.some((s) => s === null)) return null;
  const straight = pathMeters(stops as { lat: number; lon: number }[]);
  return leg.mode === 'bus'
    ? { meters: straight * busDetour, method: 'stop_to_stop_with_detour' }
    : { meters: straight, method: 'stop_to_stop' };
}

export function estimateJourneyEmissions(
  journey: JourneyView,
  opts: EmissionOptions,
): JourneyEmissions {
  const legs: LegEmission[] = [];
  journey.legs.forEach((leg, i) => {
    if (leg.type !== 'transit') return;
    const d = legDistance(leg, opts.busDetourFactor);
    const base = {
      leg: i,
      mode: leg.mode,
      distanceKm: d ? km(d.meters) : null,
      distanceMethod: d?.method ?? null,
    };
    const factor = leg.mode ? opts.factors.get(leg.mode) : undefined;
    const notApplicable = factor ? (opts.notApplicable?.(leg) ?? null) : null;
    if (!factor || !d || notApplicable) {
      legs.push({
        ...base,
        status: 'unavailable',
        kgCo2: null,
        factorId: null,
        reason: !factor
          ? `No documented emission factor for ${leg.mode ?? 'this mode'}.`
          : !d
            ? 'Stop coordinates are missing, so the distance is unknown.'
            : notApplicable,
      });
      return;
    }
    legs.push({
      ...base,
      status: 'estimated',
      kgCo2: Math.round((d.meters / 1000) * factor.value * 1000) / 1000,
      factorId: factor.id,
      reason: null,
    });
  });
  const estimated = legs.filter((l) => l.status === 'estimated');
  const status =
    legs.length > 0 && estimated.length === legs.length
      ? 'estimated'
      : estimated.length > 0
        ? 'partial'
        : 'unavailable';
  return {
    status,
    kgCo2:
      status === 'estimated'
        ? Math.round(estimated.reduce((sum, l) => sum + l.kgCo2!, 0) * 1000) / 1000
        : null,
    quality: 'coarse',
    legs,
    reason:
      status === 'estimated'
        ? null
        : (legs.find((l) => l.status === 'unavailable')?.reason ?? 'No transit legs.'),
  };
}

/**
 * Journeys can be compared by CO₂ only when every one of them has a full estimate (SPEC F11).
 */
export function emissionsComparable(all: JourneyEmissions[]): boolean {
  return all.length > 1 && all.every((e) => e.status === 'estimated');
}
