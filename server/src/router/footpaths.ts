import { haversineMeters } from '../gtfs/index.js';
import type { FootpathKind, RouterInput } from './types.js';
import { isConservativeOnly, isRoutedType, isSpecific } from './transfer-rules.js';
import { FOOTPATH_KINDS } from './types.js';

/** SPEC §7: walk_sec = haversine_m × 1.3 / 1.2 m/s. Straight line × detour; not a verified path. */
export const WALK_DETOUR_FACTOR = 1.3;
export const WALK_SPEED_MPS = 1.2;

export function estimatedWalkSec(meters: number): number {
  return Math.round((meters * WALK_DETOUR_FACTOR) / WALK_SPEED_MPS);
}

export interface FootpathTable {
  offset: Int32Array;
  to: Int32Array;
  sec: Int32Array;
  meters: Int32Array;
  kind: Uint8Array;
  published: Uint8Array;
  stats: Record<string, number>;
}

interface Edge {
  to: number;
  sec: number;
  meters: number;
  kind: FootpathKind;
  /** True when the time was published (transfers.txt min_transfer_time, pathways traversal_time). */
  published: boolean;
}

/**
 * Directed stop-to-stop walking links between boardable stops (location_type 0):
 *  - proximity: stops within `maxMeters` (estimated);
 *  - station: platforms of the same parent station (estimated from their coordinates);
 *  - transfer: transfers.txt types 0–2. A stop-pair rule's min_transfer_time is the published
 *    time; a route- or trip-specific row only declares the link (estimated time) and its own
 *    minimum or prohibition is applied per route at boarding (transfer-rules.ts). A stop-pair
 *    type 3 ("not possible") removes the link unless more specific rules exist for the pair.
 *    Conservative-only rows (transfer-rules.ts) add no link. In-seat transfers (types 4, 5) are
 *    not walking links;
 *  - pathway: pathways.txt between boardable stops (traversal_time if published, else estimated).
 * A published time wins over an estimate, and a link the feed declares over one inferred from
 * coordinates; otherwise the shortest estimate is kept.
 */
export function buildFootpaths(
  stops: RouterInput['stops'],
  parent: Int32Array,
  transfers: RouterInput['transfers'],
  pathways: RouterInput['pathways'],
  maxMeters: number,
  /** "from:to" platform pairs that have route- or trip-specific rules. */
  specificPairs: ReadonlySet<string> = new Set(),
): FootpathTable {
  const n = stops.length;
  const edges: Map<number, Edge>[] = Array.from({ length: n }, () => new Map<number, Edge>());
  const boardable = (i: number) =>
    stops[i].locationType === 0 && stops[i].lat !== null && stops[i].lon !== null;
  const meters = (a: number, b: number) =>
    Math.round(haversineMeters(stops[a].lat!, stops[a].lon!, stops[b].lat!, stops[b].lon!));
  const stats: Record<string, number> = {};
  const add = (from: number, to: number, kind: FootpathKind, publishedSec: number | null) => {
    if (from === to || !boardable(from) || !boardable(to)) return;
    const m = meters(from, to);
    const edge: Edge = {
      to,
      meters: m,
      sec: publishedSec ?? estimatedWalkSec(m),
      kind,
      published: publishedSec !== null,
    };
    // Precedence: a published min_transfer_time (the operator's minimum for the whole transfer,
    // so a shorter pathway traversal_time never undercuts it), then another published time, then
    // a link the feed declares (transfers.txt, pathways.txt), then a link inferred from
    // coordinates; within the same rank the shorter time.
    const rank = (e: Edge) =>
      e.published
        ? e.kind === 'transfer'
          ? 3
          : 2
        : e.kind === 'transfer' || e.kind === 'pathway'
          ? 1
          : 0;
    const existing = edges[from].get(to);
    if (
      !existing ||
      rank(edge) > rank(existing) ||
      (rank(edge) === rank(existing) && edge.sec < existing.sec)
    ) {
      edges[from].set(to, edge);
    }
  };

  // Proximity, with a grid of ~0.005° cells (≥ 540 m at Chennai's latitude, so 3×3 cells suffice
  // for maxMeters ≤ 500).
  const cell = Math.max(0.005, maxMeters / 100_000);
  const grid = new Map<string, number[]>();
  const key = (x: number, y: number) => `${x}:${y}`;
  for (let i = 0; i < n; i++) {
    if (!boardable(i)) continue;
    const k = key(Math.floor(stops[i].lat! / cell), Math.floor(stops[i].lon! / cell));
    const list = grid.get(k) ?? [];
    list.push(i);
    grid.set(k, list);
  }
  for (let i = 0; i < n; i++) {
    if (!boardable(i)) continue;
    const cx = Math.floor(stops[i].lat! / cell);
    const cy = Math.floor(stops[i].lon! / cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const j of grid.get(key(cx + dx, cy + dy)) ?? []) {
          if (j !== i && meters(i, j) <= maxMeters) add(i, j, 'proximity', null);
        }
      }
    }
  }

  // Platforms of the same station.
  const children = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    if (parent[i] >= 0) {
      const list = children.get(parent[i]) ?? [];
      list.push(i);
      children.set(parent[i], list);
    }
  }
  for (const list of children.values()) {
    for (const a of list) for (const b of list) add(a, b, 'station', null);
  }

  // transfers.txt: a station id stands for its platforms.
  const expand = (i: number) => (stops[i].locationType === 1 ? (children.get(i) ?? []) : [i]);
  const forbidden: [number, number][] = [];
  for (const t of transfers) {
    if (!isRoutedType(t.type)) continue;
    const specific = isSpecific(t);
    for (const a of expand(t.from)) {
      for (const b of expand(t.to)) {
        if (t.type === 3) {
          if (!specific && !specificPairs.has(`${a}:${b}`)) forbidden.push([a, b]);
        } else if (!isConservativeOnly(t)) {
          add(a, b, 'transfer', t.type === 2 && !specific ? t.minTime : null);
        }
      }
    }
  }
  for (const p of pathways) {
    add(p.from, p.to, 'pathway', p.traversalTime);
    if (p.bidirectional) add(p.to, p.from, 'pathway', p.traversalTime);
  }
  for (const [a, b] of forbidden) edges[a].delete(b);
  stats['footpathsForbiddenByTransfers'] = forbidden.length;

  const offset = new Int32Array(n + 1);
  let total = 0;
  for (let i = 0; i < n; i++) {
    offset[i] = total;
    total += edges[i].size;
  }
  offset[n] = total;
  const to = new Int32Array(total);
  const sec = new Int32Array(total);
  const metersOut = new Int32Array(total);
  const kind = new Uint8Array(total);
  const published = new Uint8Array(total);
  for (let i = 0; i < n; i++) {
    let j = offset[i];
    for (const e of [...edges[i].values()].sort((a, b) => a.to - b.to)) {
      to[j] = e.to;
      sec[j] = e.sec;
      metersOut[j] = e.meters;
      kind[j] = FOOTPATH_KINDS.indexOf(e.kind);
      published[j] = e.published ? 1 : 0;
      stats[`footpaths_${e.kind}`] = (stats[`footpaths_${e.kind}`] ?? 0) + 1;
      if (e.published)
        stats['footpathsWithPublishedTime'] = (stats['footpathsWithPublishedTime'] ?? 0) + 1;
      j++;
    }
  }
  stats['footpaths'] = total;
  return { offset, to, sec, meters: metersOut, kind, published, stats };
}
