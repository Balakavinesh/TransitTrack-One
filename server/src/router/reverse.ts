import { parseIsoDate } from '../gtfs/index.js';
import {
  HorizonError,
  SECONDS_PER_DAY,
  paretoFilter,
  plannableRange,
  walkReadyAt,
  type Endpoint,
  type RaptorQuery,
  type RawJourney,
  type RawLeg,
  type RawTransitLeg,
} from './raptor.js';
import { hasTransferRules, resolveTransfer } from './transfer-rules.js';
import type { Snapshot } from './types.js';

const INF = 0x3fffffff;
const NEG = -INF;

/** Arrive-by query (SPEC F3, P1): `arriveBy` replaces `departAt`. */
export interface ArriveByQuery extends Omit<RaptorQuery, 'departAt'> {
  /** Latest arrival, seconds from the query date's midnight. */
  arriveBy: number;
  /** Arrivals are considered in [arriveBy − windowSec, arriveBy]. */
  windowSec: number;
}

/** What the label at the alighting stop continues with. */
const SRC_EGRESS = 0;
const SRC_VEHICLE = 1;
const SRC_WALK = 2;

/** Incoming footpaths (CSR by the stop walked to) and each edge's source, once per snapshot. */
const incomingCache = new WeakMap<
  Snapshot,
  { inOffset: Int32Array; inEdge: Int32Array; edgeFrom: Int32Array }
>();
function incoming(s: Snapshot) {
  let c = incomingCache.get(s);
  if (c) return c;
  const n = s.stopLat.length;
  const inOffset = new Int32Array(n + 1);
  for (let e = 0; e < s.footTo.length; e++) inOffset[s.footTo[e] + 1]++;
  for (let i = 0; i < n; i++) inOffset[i + 1] += inOffset[i];
  const fill = inOffset.slice(0, n);
  const inEdge = new Int32Array(s.footTo.length);
  const edgeFrom = new Int32Array(s.footTo.length);
  for (let from = 0; from < n; from++) {
    for (let e = s.footOffset[from]; e < s.footOffset[from + 1]; e++) {
      inEdge[fill[s.footTo[e]]++] = e;
      edgeFrom[e] = from;
    }
  }
  c = { inOffset, inEdge, edgeFrom };
  incomingCache.set(s, c);
  return c;
}

/**
 * Arrive-by search: reverse range RAPTOR (SPEC F3). The mirror of `raptor` with the same rules,
 * so that every journey it returns is one the forward search accepts (`validateJourney`):
 *
 * - Labels are the latest boarding time per stop and round, found by scanning each pattern from
 *   its last stop to its first and "alighting" the latest usable trip that still reaches the
 *   rest of the journey in time. Round k uses only labels of rounds < k (k vehicles).
 * - Before a vehicle boarded at time d, the previous vehicle must arrive by d − max(buffer, the
 *   stop's published minimum) at the same stop (never where transfers.txt prohibits it), or by
 *   d − (the walkReadyAt offset of the footpath) at a neighbouring stop. Route-specific rules
 *   are resolved for the arriving and departing route, as in the forward search.
 * - Journey shapes are the forward ones: the only walk before the first vehicle is the access
 *   walk from a point; a journey may end with a walk onto the destination stop itself.
 * - Range query over arrival deadlines in the window, earliest first, reusing labels; returns
 *   the Pareto set over (departure later, arrival earlier, fewer transfers).
 * - Trips of the previous and next service day, calendars and projection, excluded stops and
 *   routes: as in `raptor`.
 */
export function raptorArriveBy(snapshot: Snapshot, q: ArriveByQuery): RawJourney[] {
  const s = snapshot;
  const n = s.stopLat.length;
  const nPatterns = s.patternRoute.length;
  const days = s.header.horizonDays;
  const day0 = parseIsoDate(q.date)! - parseIsoDate(s.header.horizonStart)!;
  if (day0 < 1 || day0 > days - 2) {
    const r = plannableRange(snapshot);
    throw new HorizonError(r.first, r.last);
  }
  const { inOffset, inEdge, edgeFrom } = incoming(s);
  const K = q.maxTransfers + 1;
  const rows = K + 1;
  const buffer = q.minTransferSec;
  const windowStart = q.arriveBy - q.windowSec;
  const earliest = windowStart - (q.maxJourneySec ?? 6 * 3600);

  // Vehicle labels: latest boarding time at a stop with k vehicles to go.
  const vDep = new Int32Array(rows * n).fill(NEG);
  const vStamp = new Int32Array(rows * n);
  const vPattern = new Int32Array(rows * n);
  const vSlot = new Int32Array(rows * n);
  const vDay = new Int8Array(rows * n);
  const vBoardPos = new Int32Array(rows * n);
  const vAlightPos = new Int32Array(rows * n);
  const vAlightRow = new Int8Array(rows * n);
  const vAlightSrc = new Int8Array(rows * n);
  const vAlightEdge = new Int32Array(rows * n);
  // Latest vehicle arrival at a stop that still makes the rest (row = vehicles after it).
  const latest = new Int32Array(rows * n).fill(NEG);
  const latestSrc = new Int8Array(rows * n);
  const latestEdge = new Int32Array(rows * n).fill(-1);

  const bestV = new Int32Array(n).fill(NEG);
  const originBest = new Int32Array(rows).fill(NEG);
  let originBound = NEG;

  const egressByStop = new Map<number, Endpoint>();
  for (const e of q.destinations) {
    const cur = egressByStop.get(e.stop);
    if (!cur || e.sec < cur.sec) egressByStop.set(e.stop, e);
  }
  const accessByStop = new Map<number, Endpoint>();
  for (const o of q.origins) {
    const cur = accessByStop.get(o.stop);
    if (!cur || o.sec < cur.sec) accessByStop.set(o.stop, o);
  }
  const destStops = new Set(egressByStop.keys());
  const excludedStop = new Uint8Array(n);
  for (const stop of q.excludedStops ?? []) excludedStop[stop] = 1;

  const patternAllowed = new Uint8Array(nPatterns);
  for (let p = 0; p < nPatterns; p++) {
    const route = s.patternRoute[p];
    patternAllowed[p] =
      q.allowedAgencies.has(s.routeAgency[route]) && !q.excludedRoutes?.has(route) ? 1 : 0;
  }

  // Stops whose latest-arrival bound depends on the arriving route (rules here or at a
  // neighbour walked to): resolved while scanning, like ruledReady in the forward search.
  const ruled = new Uint8Array(n);
  for (let stop = 0; stop < n; stop++) {
    if (hasTransferRules(s, stop)) ruled[stop] = 1;
    for (let e = s.footOffset[stop]; e < s.footOffset[stop + 1]; e++) {
      if (hasTransferRules(s, s.footTo[e])) ruled[stop] = 1;
    }
  }
  /** The fixed part of walking edge e before boarding (walkReadyAt is affine in the arrival). */
  const walkOffset = (e: number) => walkReadyAt(s, e, 0, s.footSec[e], buffer);

  const tripState = (trip: number, dayIdx: number): number => {
    const cell = s.tripService[trip] * days + dayIdx;
    if (s.serviceCovered[cell]) return 1;
    if (q.includeProjected && s.serviceProjected[cell]) return 2;
    return 0;
  };

  /** Latest usable trip of `pattern` arriving at `pos` at or before `by`, and not before `since`. */
  const findTripBack = (pattern: number, pos: number, by: number, since: number = earliest) => {
    const len = s.patternStopOffset[pattern + 1] - s.patternStopOffset[pattern];
    const t0 = s.patternTripOffset[pattern];
    const nt = s.patternTripOffset[pattern + 1] - t0;
    const base = s.patternTimeOffset[pattern];
    let bestSlot = -1;
    let bestDay = 0;
    let bestArr = NEG;
    for (let off = -1; off <= 1; off++) {
      const dayIdx = day0 + off;
      const target = by - off * SECONDS_PER_DAY;
      // First slot whose arrival is after the target; candidates are below it.
      let lo = 0;
      let hi = nt;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (s.arrival[base + mid * len + pos] <= target) lo = mid + 1;
        else hi = mid;
      }
      for (let j = lo - 1; j >= 0; j--) {
        const arr = s.arrival[base + j * len + pos] + off * SECONDS_PER_DAY;
        if (arr <= bestArr || arr < since) break;
        if (tripState(s.patternTrips[t0 + j], dayIdx)) {
          bestSlot = j;
          bestDay = off;
          bestArr = arr;
          break;
        }
      }
    }
    return bestSlot < 0 ? null : { slot: bestSlot, day: bestDay, arr: bestArr };
  };

  // The last vehicle must reach the destination within the window (mirror of firstBoardBy).
  const lastAlightSince = new Map<number, number>();
  const sinceAt = (stop: number, offset: number) =>
    lastAlightSince.set(stop, Math.min(lastAlightSince.get(stop) ?? INF, windowStart - offset));
  for (const [stop, e] of egressByStop) sinceAt(stop, e.sec);
  for (const [stop, e] of egressByStop) {
    if (e.sec !== 0) continue;
    for (let k = inOffset[stop]; k < inOffset[stop + 1]; k++) {
      const edge = inEdge[k];
      sinceAt(edgeFrom[edge], s.footSec[edge]);
    }
  }

  // Candidate deadlines: arrivals at the destination stops within the window, at minute
  // resolution (rounded up), plus the requested deadline.
  const candidates = new Set<number>([q.arriveBy]);
  for (const [stop, e] of egressByStop) {
    for (let k = s.stopPatternOffset[stop]; k < s.stopPatternOffset[stop + 1]; k++) {
      const p = s.stopPatterns[k];
      if (!patternAllowed[p]) continue;
      const pos = s.stopPatternPos[k];
      let by = q.arriveBy - e.sec;
      for (;;) {
        const t = findTripBack(p, pos, by, windowStart - e.sec);
        if (!t) break;
        candidates.add(Math.min(q.arriveBy, Math.ceil((t.arr + e.sec) / 60) * 60));
        by = t.arr - 1;
      }
    }
  }
  let deadlines = [...candidates].filter((t) => t >= windowStart && t <= q.arriveBy);
  deadlines.sort((a, b) => a - b);
  const maxRuns = q.maxDepartureRuns ?? 120;
  if (deadlines.length > maxRuns) {
    const step = (deadlines.length - 1) / (maxRuns - 1);
    deadlines = Array.from({ length: maxRuns }, (_, i) => deadlines[Math.round(i * step)]);
  }

  const found: RawJourney[] = [];
  const isMarked = new Uint8Array(n);
  const qPos = new Int32Array(nPatterns).fill(-1);
  let run = 0;

  const setLatest = (row: number, stop: number, r: number, src: number, edge: number) => {
    const cell = row * n + stop;
    if (r <= latest[cell]) return false;
    latest[cell] = r;
    latestSrc[cell] = src;
    latestEdge[cell] = edge;
    return true;
  };

  for (const t0 of deadlines) {
    run++;
    let marked: number[] = [];
    const mark = (stop: number, into: number[]) => {
      if (!isMarked[stop]) {
        isMarked[stop] = 1;
        into.push(stop);
      }
    };
    // Round 0: alight at a destination stop (then the egress walk), or walk onto a
    // destination stop that is the destination itself.
    for (const [stop, e] of egressByStop) {
      if (excludedStop[stop]) continue;
      if (setLatest(0, stop, t0 - e.sec, SRC_EGRESS, -1)) mark(stop, marked);
      if (e.sec !== 0) continue;
      for (let k = inOffset[stop]; k < inOffset[stop + 1]; k++) {
        const edge = inEdge[k];
        const from = edgeFrom[edge];
        if (excludedStop[from] || destStops.has(from)) continue;
        if (setLatest(0, from, t0 - s.footSec[edge], SRC_WALK, edge)) mark(from, marked);
      }
    }

    for (let k = 1; k <= K; k++) {
      const row = k * n;
      const touched: number[] = [];
      for (const stop of marked) {
        isMarked[stop] = 0;
        for (let j = s.stopPatternOffset[stop]; j < s.stopPatternOffset[stop + 1]; j++) {
          const p = s.stopPatterns[j];
          if (!patternAllowed[p]) continue;
          const pos = s.stopPatternPos[j];
          if (qPos[p] < 0) touched.push(p);
          if (pos > qPos[p]) qPos[p] = pos;
        }
      }
      const improved: number[] = [];
      const nextMarked: number[] = [];

      for (const p of touched) {
        const start = qPos[p];
        qPos[p] = -1;
        const so = s.patternStopOffset[p];
        const len = s.patternStopOffset[p + 1] - so;
        const base = s.patternTimeOffset[p];
        const route = s.patternRoute[p];
        let slot = -1;
        let dayOff = 0;
        let alightPos = -1;
        let alightRow = -1;
        let alightSrc = 0;
        let alightEdge = -1;
        for (let i = start; i >= 0; i--) {
          const stop = s.patternStops[so + i];
          if (slot >= 0) {
            const d = s.departure[base + slot * len + i] + dayOff * SECONDS_PER_DAY;
            const cell = row + stop;
            if (
              d > bestV[stop] &&
              d > originBound &&
              d > vDep[cell] &&
              d >= earliest &&
              !destStops.has(stop) &&
              !excludedStop[stop]
            ) {
              vDep[cell] = d;
              vStamp[cell] = run;
              vPattern[cell] = p;
              vSlot[cell] = slot;
              vDay[cell] = dayOff;
              vBoardPos[cell] = i;
              vAlightPos[cell] = alightPos;
              vAlightRow[cell] = alightRow;
              vAlightSrc[cell] = alightSrc;
              vAlightEdge[cell] = alightEdge;
              bestV[stop] = d;
              improved.push(stop);
              const o = accessByStop.get(stop);
              if (o && d - o.sec > originBound) originBound = d - o.sec;
            }
          }
          if (i === 0) break;
          if (excludedStop[stop]) continue;
          // Latest arrival here that still makes the rest of the journey (rounds < k).
          let r = NEG;
          let rRow = -1;
          let rSrc = 0;
          let rEdge = -1;
          for (let j = 0; j < k; j++) {
            const c = j * n + stop;
            if (latest[c] > r) [r, rRow, rSrc, rEdge] = [latest[c], j, latestSrc[c], latestEdge[c]];
          }
          if (ruled[stop]) {
            const x = ruledLatest(stop, k, route);
            if (x[0] > r) [r, rRow, rSrc, rEdge] = x;
          }
          if (r === NEG) continue;
          const current =
            slot >= 0 ? s.arrival[base + slot * len + i] + dayOff * SECONDS_PER_DAY : NEG;
          if (r <= current) continue;
          const since = rRow === 0 ? (lastAlightSince.get(stop) ?? INF) : earliest;
          const t = findTripBack(p, i, r, since);
          if (t && t.arr > current) {
            slot = t.slot;
            dayOff = t.day;
            alightPos = i;
            alightRow = rRow;
            alightSrc = rSrc;
            alightEdge = rEdge;
          }
        }
      }

      // Before boarding at X (label d): arrive at X, or walk to X from a neighbour.
      for (const stop of improved) {
        const d = vDep[row + stop];
        if (!hasTransferRules(s, stop) && !s.stopTransferForbidden[stop]) {
          const r = d - Math.max(buffer, s.stopMinTransferSec[stop]);
          if (setLatest(k, stop, r, SRC_VEHICLE, -1)) mark(stop, nextMarked);
        } else if (hasTransferRules(s, stop)) {
          // Resolved per arriving route while scanning; still worth scanning from here.
          mark(stop, nextMarked);
        }
        for (let j = inOffset[stop]; j < inOffset[stop + 1]; j++) {
          const edge = inEdge[j];
          const from = edgeFrom[edge];
          if (excludedStop[from] || destStops.has(from)) continue;
          if (hasTransferRules(s, stop)) {
            mark(from, nextMarked);
            continue;
          }
          if (setLatest(k, from, d - walkOffset(edge), SRC_WALK, edge)) mark(from, nextMarked);
        }
      }

      // Journeys with exactly k vehicles found in this run: latest departure from the origin.
      let bestHere = NEG;
      let bestStop = -1;
      for (const [stop, o] of accessByStop) {
        const cell = row + stop;
        if (vStamp[cell] === run && vDep[cell] - o.sec > bestHere) {
          bestHere = vDep[cell] - o.sec;
          bestStop = stop;
        }
      }
      let fewer = NEG;
      for (let j = 1; j < k; j++) fewer = Math.max(fewer, originBest[j]);
      if (bestStop >= 0 && bestHere > originBest[k] && bestHere > fewer) {
        originBest[k] = bestHere;
        const journey = reconstruct(k, bestStop);
        if (journey) found.push(journey);
      }

      marked = nextMarked;
      if (marked.length === 0) break;
    }
    for (let i = 0; i < n; i++) isMarked[i] = 0;
  }

  /**
   * Latest arrival at `stop` by `fromRoute` for rows < k where a transfer rule decides it:
   * boarding again here, or walking to a neighbour with rules. [time, row, source, edge].
   */
  function ruledLatest(
    stop: number,
    k: number,
    fromRoute: number,
  ): [number, number, number, number] {
    let best = NEG;
    let bestRow = -1;
    let bestSrc = 0;
    let bestEdge = -1;
    for (let j = 1; j < k; j++) {
      if (hasTransferRules(s, stop)) {
        const cell = j * n + stop;
        if (vDep[cell] > NEG) {
          const dd = resolveTransfer(s, stop, stop, fromRoute, s.patternRoute[vPattern[cell]]);
          const r = vDep[cell] - Math.max(buffer, dd.minSec);
          if (!dd.forbidden && r > best)
            [best, bestRow, bestSrc, bestEdge] = [r, j, SRC_VEHICLE, -1];
        }
      }
      for (let e = s.footOffset[stop]; e < s.footOffset[stop + 1]; e++) {
        const to = s.footTo[e];
        if (!hasTransferRules(s, to) || excludedStop[to]) continue;
        const cell = j * n + to;
        if (vDep[cell] === NEG) continue;
        const dd = resolveTransfer(s, stop, to, fromRoute, s.patternRoute[vPattern[cell]]);
        const r = Math.min(vDep[cell] - walkOffset(e), vDep[cell] - dd.minSec);
        if (!dd.forbidden && r > best) [best, bestRow, bestSrc, bestEdge] = [r, j, SRC_WALK, e];
      }
    }
    return [best, bestRow, bestSrc, bestEdge];
  }

  function reconstruct(k: number, originStop: number): RawJourney | null {
    const legs: RawLeg[] = [];
    let row = k;
    let at = originStop;
    for (let guard = 0; guard < 3 * rows + 3; guard++) {
      const cell = row * n + at;
      if (vDep[cell] === NEG) return null;
      const p = vPattern[cell];
      const slot = vSlot[cell];
      const so = s.patternStopOffset[p];
      const len = s.patternStopOffset[p + 1] - so;
      const base = s.patternTimeOffset[p] + slot * len;
      const trip = s.patternTrips[s.patternTripOffset[p] + slot];
      const off = vDay[cell];
      const boardPos = vBoardPos[cell];
      const alightPos = vAlightPos[cell];
      if (alightPos <= boardPos) return null;
      const arrival = s.arrival[base + alightPos] + off * SECONDS_PER_DAY;
      const leg: RawTransitLeg = {
        kind: 'transit',
        pattern: p,
        trip,
        slot,
        dayOffset: off,
        boardPos,
        alightPos,
        departure: s.departure[base + boardPos] + off * SECONDS_PER_DAY,
        arrival,
        service: tripState(trip, day0 + off) === 2 ? 'projected' : 'covered',
      };
      legs.push(leg);
      const alightStop = s.patternStops[so + alightPos];
      const src = vAlightSrc[cell];
      const edge = vAlightEdge[cell];
      const next = vAlightRow[cell];
      if (src === SRC_WALK) {
        const to = s.footTo[edge];
        legs.push({
          kind: 'walk',
          role: 'transfer',
          fromStop: alightStop,
          toStop: to,
          sec: s.footSec[edge],
          meters: s.footMeters[edge],
          edge,
          departure: arrival,
          arrival: arrival + s.footSec[edge],
        });
        at = to;
      } else {
        at = alightStop;
      }
      if (next === 0) {
        if (src === SRC_EGRESS) {
          const e = egressByStop.get(alightStop);
          if (!e) return null;
          if (e.sec > 0)
            legs.push({
              kind: 'walk',
              role: 'egress',
              fromStop: alightStop,
              toStop: -1,
              sec: e.sec,
              meters: e.meters,
              edge: -1,
              departure: arrival,
              arrival: arrival + e.sec,
            });
        } else if (!destStops.has(at)) return null;
        break;
      }
      if (src === SRC_EGRESS) return null;
      row = next;
    }
    const first = legs[0];
    if (!first || first.kind !== 'transit') return null;
    const o = accessByStop.get(originStop)!;
    if (o.sec > 0)
      legs.unshift({
        kind: 'walk',
        role: 'access',
        fromStop: -1,
        toStop: originStop,
        sec: o.sec,
        meters: o.meters,
        edge: -1,
        departure: first.departure - o.sec,
        arrival: first.departure,
      });
    const transit = legs.filter((l) => l.kind === 'transit').length;
    return {
      departure: legs[0].departure,
      arrival: legs[legs.length - 1].arrival,
      transfers: transit - 1,
      legs,
    };
  }

  return paretoFilter(
    dedupe(found).filter((j) => j.arrival >= windowStart && j.arrival <= q.arriveBy),
  );
}

/** Same vehicles, boarding and alighting: keep the one arriving earliest, then leaving latest. */
function dedupe(journeys: RawJourney[]): RawJourney[] {
  const bySig = new Map<string, RawJourney>();
  for (const j of journeys) {
    const key = j.legs
      .filter((l): l is RawTransitLeg => l.kind === 'transit')
      .map((l) => `${l.trip}@${l.dayOffset}:${l.boardPos}-${l.alightPos}`)
      .join('|');
    const cur = bySig.get(key);
    if (
      !cur ||
      j.arrival < cur.arrival ||
      (j.arrival === cur.arrival && j.departure > cur.departure)
    )
      bySig.set(key, j);
  }
  return [...bySig.values()];
}
