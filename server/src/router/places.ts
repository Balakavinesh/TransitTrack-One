import { haversineMeters } from '../gtfs/index.js';
import { estimatedWalkSec } from './footpaths.js';
import type { Endpoint } from './raptor.js';
import type { Snapshot } from './types.js';

/** Where a journey starts or ends. */
export type Place =
  { kind: 'stop'; id: string } | { kind: 'point'; lat: number; lon: number; label?: string };

export class PlaceError extends Error {
  constructor(
    readonly code: 'unknown_stop' | 'not_boardable',
    message: string,
  ) {
    super(message);
  }
}

interface SpatialIndex {
  byId: Map<string, number>;
  cell: number;
  grid: Map<string, number[]>;
}

const indexes = new WeakMap<Snapshot, SpatialIndex>();
const CELL_DEG = 0.01; // ~1.1 km

function indexOf(snapshot: Snapshot): SpatialIndex {
  let idx = indexes.get(snapshot);
  if (idx) return idx;
  const byId = new Map(snapshot.header.strings.stopIds.map((id, i) => [id, i]));
  const grid = new Map<string, number[]>();
  for (let i = 0; i < snapshot.stopLat.length; i++) {
    if (snapshot.stopLocationType[i] !== 0 || Number.isNaN(snapshot.stopLat[i])) continue;
    const k = `${Math.floor(snapshot.stopLat[i] / CELL_DEG)}:${Math.floor(snapshot.stopLon[i] / CELL_DEG)}`;
    const list = grid.get(k) ?? [];
    list.push(i);
    grid.set(k, list);
  }
  idx = { byId, cell: CELL_DEG, grid };
  indexes.set(snapshot, idx);
  return idx;
}

export function stopIndexById(snapshot: Snapshot, id: string): number | undefined {
  return indexOf(snapshot).byId.get(id);
}

/** Boardable stops (location_type 0 with coordinates) within `maxMeters`, nearest first. */
export function stopsNear(
  snapshot: Snapshot,
  lat: number,
  lon: number,
  maxMeters: number,
): { stop: number; meters: number }[] {
  const idx = indexOf(snapshot);
  const reach = Math.ceil(maxMeters / 1000) + 1;
  const cx = Math.floor(lat / idx.cell);
  const cy = Math.floor(lon / idx.cell);
  const out: { stop: number; meters: number }[] = [];
  for (let dx = -reach; dx <= reach; dx++) {
    for (let dy = -reach; dy <= reach; dy++) {
      for (const i of idx.grid.get(`${cx + dx}:${cy + dy}`) ?? []) {
        const m = haversineMeters(lat, lon, snapshot.stopLat[i], snapshot.stopLon[i]);
        if (m <= maxMeters) out.push({ stop: i, meters: Math.round(m) });
      }
    }
  }
  return out.sort((a, b) => a.meters - b.meters || a.stop - b.stop);
}

/** Per agency, the nearest stops a point may walk to (SPEC: access/egress within the walk limit). */
export const ACCESS_STOPS_PER_AGENCY = 12;

export interface ResolvedPlace {
  endpoints: Endpoint[];
  /** For points: the nearest boardable stop of an allowed agency at any distance up to 5 km. */
  nearestMeters: number | null;
}

/**
 * A stop id: the stop itself (no walk), or the platforms of a station. A point: the nearest
 * boardable stops of the allowed agencies within `maxWalkM`, with an estimated walk.
 */
export function resolvePlace(
  snapshot: Snapshot,
  place: Place,
  maxWalkM: number,
  allowedAgencies: ReadonlySet<number>,
): ResolvedPlace {
  if (place.kind === 'stop') {
    const i = stopIndexById(snapshot, place.id);
    if (i === undefined)
      throw new PlaceError('unknown_stop', `No stop ${place.id} in the router snapshot.`);
    const type = snapshot.stopLocationType[i];
    if (type === 0) return { endpoints: [{ stop: i, sec: 0, meters: 0 }], nearestMeters: 0 };
    if (type === 1) {
      const children: Endpoint[] = [];
      for (let c = 0; c < snapshot.stopParent.length; c++) {
        if (snapshot.stopParent[c] === i && snapshot.stopLocationType[c] === 0) {
          children.push({ stop: c, sec: 0, meters: 0 });
        }
      }
      return { endpoints: children, nearestMeters: 0 };
    }
    throw new PlaceError(
      'not_boardable',
      `${place.id} is an entrance or station node, not a place where vehicles stop.`,
    );
  }
  const near = stopsNear(snapshot, place.lat, place.lon, 5000).filter((s) =>
    allowedAgencies.has(snapshot.stopAgency[s.stop]),
  );
  const perAgency = new Map<number, number>();
  const endpoints: Endpoint[] = [];
  for (const s of near) {
    if (s.meters > maxWalkM) break;
    const a = snapshot.stopAgency[s.stop];
    const used = perAgency.get(a) ?? 0;
    if (used >= ACCESS_STOPS_PER_AGENCY) continue;
    perAgency.set(a, used + 1);
    endpoints.push({ stop: s.stop, meters: s.meters, sec: estimatedWalkSec(s.meters) });
  }
  return { endpoints, nearestMeters: near[0]?.meters ?? null };
}
