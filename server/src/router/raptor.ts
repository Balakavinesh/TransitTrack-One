import { formatIsoDate, parseIsoDate } from '../gtfs/index.js';
import { estimatedWalkSec } from './footpaths.js';
import { hasTransferRules, resolveTransfer } from './transfer-rules.js';
import { FOOTPATH_KINDS, type Snapshot } from './types.js';

export const SECONDS_PER_DAY = 86_400;
const INF = 0x3fffffff;

/** A stop where a journey can start or end, with the walk to/from the exact origin/destination. */
export interface Endpoint {
  stop: number;
  /** Walking seconds between the origin/destination and the stop (0 when it *is* the stop). */
  sec: number;
  meters: number;
}

export interface RaptorQuery {
  /** Service date YYYY-MM-DD (Asia/Kolkata). Times are seconds from that date's midnight. */
  date: string;
  departAt: number;
  windowSec: number;
  maxTransfers: number;
  /** Added after every vehicle arrival before boarding again (SPEC: min transfer buffer). */
  minTransferSec: number;
  includeProjected: boolean;
  /** Agency indices (snapshot header order) that may be used. */
  allowedAgencies: ReadonlySet<number>;
  origins: Endpoint[];
  destinations: Endpoint[];
  /** Upper bound on range-query iterations (distinct departure minutes). */
  maxDepartureRuns?: number;
  /** Journeys may not arrive later than this many seconds after the window ends (default 6 h). */
  maxJourneySec?: number;
  /**
   * Stops that may not be used to board, alight or walk to, and routes that may not be used
   * (verified disruption reports, SPEC §7.4). A vehicle may still pass through an excluded stop.
   */
  excludedStops?: ReadonlySet<number>;
  excludedRoutes?: ReadonlySet<number>;
}

export interface RawTransitLeg {
  kind: 'transit';
  pattern: number;
  /** Trip index, and its slot (row) within the pattern's time table. */
  trip: number;
  slot: number;
  /** Service day relative to the query date: -1, 0 or +1. */
  dayOffset: number;
  boardPos: number;
  alightPos: number;
  /** Absolute seconds from the query date's midnight. */
  departure: number;
  arrival: number;
  /** 'covered' by its own calendar, or 'projected' (SPEC §3.2). */
  service: 'covered' | 'projected';
}

export interface RawWalkLeg {
  kind: 'walk';
  role: 'access' | 'transfer' | 'egress';
  /** -1 for the origin/destination point itself. */
  fromStop: number;
  toStop: number;
  sec: number;
  meters: number;
  /** Footpath edge index for transfer walks; -1 for access/egress. */
  edge: number;
  departure: number;
  arrival: number;
}

export type RawLeg = RawTransitLeg | RawWalkLeg;

export interface RawJourney {
  departure: number;
  arrival: number;
  transfers: number;
  legs: RawLeg[];
}

export class HorizonError extends Error {
  constructor(
    readonly first: string,
    readonly last: string,
  ) {
    super(`date is outside the router snapshot horizon (${first} – ${last})`);
  }
}

/** First and last date that can be queried (the day before and after must be in the tables). */
export function plannableRange(snapshot: Snapshot): { first: string; last: string } {
  const start = parseIsoDate(snapshot.header.horizonStart)!;
  return {
    first: formatIsoDate(start + 1),
    last: formatIsoDate(start + snapshot.header.horizonDays - 2),
  };
}

/** Label sources for the "ready to board" times. */
const SRC_ACCESS = 0;
const SRC_VEHICLE = 1;
const SRC_WALK = 2;
const KIND_TRANSFER = FOOTPATH_KINDS.indexOf('transfer');

/**
 * Earliest boarding after a vehicle arriving at `vehicleArrival` and the transfer walk along
 * edge `e` reaching its end at `walkArrival`. A published min_transfer_time (a transfers.txt
 * link) is the operator's minimum between arrival and departure: it is honoured, and so is the
 * estimated walk plus the buffer, whichever is later. Any other walk is followed by the buffer.
 */
export function walkReadyAt(
  s: Snapshot,
  e: number,
  vehicleArrival: number,
  walkArrival: number,
  bufferSec: number,
): number {
  if (s.footPublished[e] && s.footKind[e] === KIND_TRANSFER) {
    return Math.max(walkArrival, vehicleArrival + estimatedWalkSec(s.footMeters[e]) + bufferSec);
  }
  return walkArrival + bufferSec;
}

/**
 * Range RAPTOR (SPEC §7.3): rounds = maxTransfers + 1, run once per distinct departure minute
 * in the window, latest first, reusing labels (rRAPTOR), so an earlier departure is reported
 * only if it arrives strictly earlier. Returns the Pareto set over
 * (departure, arrival, transfers).
 *
 * - Round k uses only labels of rounds < k, so a journey found in round k has exactly k
 *   vehicles.
 * - Trips of the previous and next service day are included (times past 24:00, windows
 *   crossing midnight). A trip is usable only if its service runs on that service day by its
 *   own calendar or, with `includeProjected`, if that day is projected for its agency.
 * - At most one footpath between two vehicles; never a walk straight after a walk. Every
 *   boarding after a vehicle waits at least `minTransferSec` after arrival (plus any walk).
 *   At the same stop the wait is max(minTransferSec, the published minimum transfer time), and
 *   re-boarding is impossible where transfers.txt prohibits transfers (type 3). Between two
 *   stops see walkReadyAt. Route-specific rules (transfer-rules.ts) are resolved at boarding,
 *   for the arriving and the departing route, at the stops that have them. Labels keep one
 *   arrival per stop and round, so where a rule prohibits the earliest arriving route a
 *   connection via a later route can be missed; a returned journey never breaks a rule.
 */
export function raptor(snapshot: Snapshot, q: RaptorQuery): RawJourney[] {
  return search(snapshot, q, false).journeys;
}

/** A stop reached by a one-to-all search, with the fastest journey found to it. */
export interface ReachedStop {
  stop: number;
  /** Seconds from the query date's midnight. */
  arrival: number;
  /** null when the stop is reached by walking from the origin only. */
  journey: RawJourney | null;
  /** Walking metres from the origin when reached on foot only. */
  accessMeters: number;
}

/**
 * One-to-all search (SPEC F10): every stop reachable from the origins when leaving at exactly
 * `departAt`, arriving no later than `departAt + maxDurationSec`, with the same rules as journey
 * planning (calendars, projection, transfer buffer and rules, exclusions). Each stop carries the
 * reconstructed fastest journey, so its legs can be labelled and validated.
 */
export function reachableStops(
  snapshot: Snapshot,
  q: Omit<RaptorQuery, 'destinations' | 'windowSec' | 'maxJourneySec'> & { maxDurationSec: number },
): ReachedStop[] {
  return search(
    snapshot,
    { ...q, destinations: [], windowSec: 0, maxJourneySec: q.maxDurationSec },
    true,
  ).reached;
}

function search(
  snapshot: Snapshot,
  q: RaptorQuery,
  collect: boolean,
): { journeys: RawJourney[]; reached: ReachedStop[] } {
  const s = snapshot;
  const n = s.stopLat.length;
  const nPatterns = s.patternRoute.length;
  const days = s.header.horizonDays;
  const day0 = parseIsoDate(q.date)! - parseIsoDate(s.header.horizonStart)!;
  if (day0 < 1 || day0 > days - 2) {
    const r = plannableRange(snapshot);
    throw new HorizonError(r.first, r.last);
  }
  const K = q.maxTransfers + 1;
  const rows = K + 1;

  // Round 0: access labels.
  const accArr = new Int32Array(n).fill(INF);
  const accIdx = new Int32Array(n).fill(-1);
  // Rounds 1..K, vehicle labels.
  const vArr = new Int32Array(rows * n).fill(INF);
  const vStamp = new Int32Array(rows * n);
  const vPattern = new Int32Array(rows * n);
  const vSlot = new Int32Array(rows * n);
  const vDay = new Int8Array(rows * n);
  const vBoardPos = new Int32Array(rows * n);
  const vAlightPos = new Int32Array(rows * n);
  const vBoardRow = new Int8Array(rows * n);
  const vBoardSrc = new Int8Array(rows * n);
  // Rounds 1..K, walk labels (one footpath after a vehicle of the same round).
  const wArr = new Int32Array(rows * n).fill(INF);
  const wStamp = new Int32Array(rows * n);
  const wFrom = new Int32Array(rows * n);
  const wEdge = new Int32Array(rows * n);
  // Earliest boarding time per round and stop, and which label it came from.
  const ready = new Int32Array(rows * n).fill(INF);
  const readySrc = new Int8Array(rows * n);

  const bestV = new Int32Array(n).fill(INF);
  const bestAny = new Int32Array(n).fill(INF);
  const destBest = new Int32Array(rows).fill(INF);
  let destBound = INF;

  const egressByStop = new Map<number, Endpoint>();
  for (const e of q.destinations) {
    const cur = egressByStop.get(e.stop);
    if (!cur || e.sec < cur.sec) egressByStop.set(e.stop, e);
  }
  // Journeys never come back to a stop they start from. A one-to-all search (SPEC F10) blocks
  // only the true start: a stop first reached by walking from the origin may be reached sooner
  // by a vehicle, and that earlier arrival (and what follows from it) must count.
  const originBlocked = new Uint8Array(n);
  for (const o of q.origins) if (!collect || o.sec === 0) originBlocked[o.stop] = 1;
  const excludedStop = new Uint8Array(n);
  for (const stop of q.excludedStops ?? []) excludedStop[stop] = 1;

  const patternAllowed = new Uint8Array(nPatterns);
  for (let p = 0; p < nPatterns; p++) {
    const route = s.patternRoute[p];
    patternAllowed[p] =
      q.allowedAgencies.has(s.routeAgency[route]) && !q.excludedRoutes?.has(route) ? 1 : 0;
  }

  /** 1 covered, 2 projected, 0 not running. */
  const tripState = (trip: number, dayIdx: number): number => {
    const cell = s.tripService[trip] * days + dayIdx;
    if (s.serviceCovered[cell]) return 1;
    if (q.includeProjected && s.serviceProjected[cell]) return 2;
    return 0;
  };

  const windowEnd = q.departAt + q.windowSec;
  const latest = windowEnd + (q.maxJourneySec ?? 6 * 3600);

  /**
   * Earliest usable trip of `pattern` departing position `pos` at or after `from` and no later
   * than `until` (so the next service day is used only within the time actually asked for).
   */
  const findTrip = (pattern: number, pos: number, from: number, until: number = latest) => {
    const len = s.patternStopOffset[pattern + 1] - s.patternStopOffset[pattern];
    const t0 = s.patternTripOffset[pattern];
    const nt = s.patternTripOffset[pattern + 1] - t0;
    const base = s.patternTimeOffset[pattern];
    let bestSlot = -1;
    let bestDay = 0;
    let bestDep = INF;
    for (let off = -1; off <= 1; off++) {
      const dayIdx = day0 + off;
      const target = from - off * SECONDS_PER_DAY;
      let lo = 0;
      let hi = nt;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (s.departure[base + mid * len + pos] < target) lo = mid + 1;
        else hi = mid;
      }
      for (let j = lo; j < nt; j++) {
        const dep = s.departure[base + j * len + pos] + off * SECONDS_PER_DAY;
        if (dep >= bestDep || dep > until) break;
        if (tripState(s.patternTrips[t0 + j], dayIdx)) {
          bestSlot = j;
          bestDay = off;
          bestDep = dep;
          break;
        }
      }
    }
    return bestSlot < 0 ? null : { slot: bestSlot, day: bestDay, dep: bestDep };
  };

  // Latest first boarding per origin stop: the departure must leave within the window.
  const firstBoardBy = new Map<number, number>();
  for (const o of q.origins) {
    // One-to-all: the traveller may wait at the origin until the time limit.
    const by = collect ? latest : windowEnd + o.sec;
    firstBoardBy.set(o.stop, Math.max(firstBoardBy.get(o.stop) ?? -INF, by));
  }

  // Candidate departures: every usable departure from an access stop within the window,
  // shifted back by the access walk, at minute resolution.
  const candidates = new Set<number>([q.departAt]);
  for (const o of q.origins) {
    for (let k = s.stopPatternOffset[o.stop]; k < s.stopPatternOffset[o.stop + 1]; k++) {
      const p = s.stopPatterns[k];
      if (!patternAllowed[p]) continue;
      const pos = s.stopPatternPos[k];
      let from = q.departAt + o.sec;
      for (;;) {
        const t = findTrip(p, pos, from);
        if (!t || t.dep - o.sec > windowEnd) break;
        candidates.add(Math.max(q.departAt, Math.floor((t.dep - o.sec) / 60) * 60));
        from = t.dep + 1;
      }
    }
  }
  let departures = [...candidates].filter((t) => t >= q.departAt && t <= windowEnd);
  departures.sort((a, b) => b - a);
  const maxRuns = q.maxDepartureRuns ?? 120;
  if (departures.length > maxRuns) {
    // Thin evenly, always keeping the latest and the requested departure time.
    const step = (departures.length - 1) / (maxRuns - 1);
    departures = Array.from({ length: maxRuns }, (_, i) => departures[Math.round(i * step)]);
  }

  const found: RawJourney[] = [];
  const isMarked = new Uint8Array(n);
  const qPos = new Int32Array(nPatterns).fill(INF);
  let run = 0;

  for (const t0 of departures) {
    run++;
    let marked: number[] = [];
    for (let i = 0; i < q.origins.length; i++) {
      const o = q.origins[i];
      const a = t0 + o.sec;
      if (a < accArr[o.stop]) {
        accArr[o.stop] = a;
        accIdx[o.stop] = i;
      }
      if (a < bestAny[o.stop]) bestAny[o.stop] = a;
      if (a < ready[o.stop]) {
        ready[o.stop] = a;
        readySrc[o.stop] = SRC_ACCESS;
      }
      if (!isMarked[o.stop]) {
        isMarked[o.stop] = 1;
        marked.push(o.stop);
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
          if (qPos[p] === INF) touched.push(p);
          if (pos < qPos[p]) qPos[p] = pos;
        }
      }
      const improved: number[] = [];
      const nextMarked: number[] = [];
      const mark = (stop: number) => {
        if (!isMarked[stop]) {
          isMarked[stop] = 1;
          nextMarked.push(stop);
        }
      };

      for (const p of touched) {
        const start = qPos[p];
        qPos[p] = INF;
        const so = s.patternStopOffset[p];
        const len = s.patternStopOffset[p + 1] - so;
        const base = s.patternTimeOffset[p];
        let slot = -1;
        let dayOff = 0;
        let boardPos = -1;
        let boardRow = -1;
        let boardSrc = 0;
        for (let i = start; i < len; i++) {
          const stop = s.patternStops[so + i];
          if (slot >= 0) {
            const a = s.arrival[base + slot * len + i] + dayOff * SECONDS_PER_DAY;
            const cell = row + stop;
            if (
              a < bestV[stop] &&
              a < destBound &&
              a < vArr[cell] &&
              !originBlocked[stop] &&
              !excludedStop[stop]
            ) {
              vArr[cell] = a;
              vStamp[cell] = run;
              vPattern[cell] = p;
              vSlot[cell] = slot;
              vDay[cell] = dayOff;
              vBoardPos[cell] = boardPos;
              vAlightPos[cell] = i;
              vBoardRow[cell] = boardRow;
              vBoardSrc[cell] = boardSrc;
              bestV[stop] = a;
              if (a < bestAny[stop]) bestAny[stop] = a;
              improved.push(stop);
              mark(stop);
              // Re-boarding here needs the larger of the default buffer and the stop's published
              // minimum transfer time, and is impossible where transfers.txt prohibits it. At a
              // stop with route-specific rules this is only a lower bound (resolved at boarding).
              const ruled = hasTransferRules(s, stop);
              if (ruled || !s.stopTransferForbidden[stop]) {
                const r = a + Math.max(q.minTransferSec, ruled ? 0 : s.stopMinTransferSec[stop]);
                if (r < ready[cell]) {
                  ready[cell] = r;
                  readySrc[cell] = SRC_VEHICLE;
                }
              }
              const egress = egressByStop.get(stop);
              if (egress && a + egress.sec < destBound) destBound = a + egress.sec;
            }
          }
          if (i === len - 1) break;
          if (excludedStop[stop]) continue;
          // Earliest boarding with fewer than k vehicles so far.
          let r = INF;
          let rRow = -1;
          let rSrc = 0;
          if (hasTransferRules(s, stop)) {
            [r, rRow, rSrc] = ruledReady(stop, k, s.patternRoute[p]);
          } else {
            for (let j = 0; j < k; j++) {
              if (ready[j * n + stop] < r) {
                r = ready[j * n + stop];
                rRow = j;
              }
            }
            if (rRow >= 0) rSrc = readySrc[rRow * n + stop];
          }
          if (r === INF) continue;
          const current =
            slot >= 0 ? s.departure[base + slot * len + i] + dayOff * SECONDS_PER_DAY : INF;
          if (r >= current) continue;
          const until = rRow === 0 ? (firstBoardBy.get(stop) ?? -INF) : latest;
          const t = findTrip(p, i, r, until);
          if (t && t.dep < current) {
            slot = t.slot;
            dayOff = t.day;
            boardPos = i;
            boardRow = rRow;
            boardSrc = rSrc;
          }
        }
      }

      for (const stop of improved) {
        const from = row + stop;
        const a0 = vArr[from];
        for (let e = s.footOffset[stop]; e < s.footOffset[stop + 1]; e++) {
          const to = s.footTo[e];
          const a = a0 + s.footSec[e];
          const cell = row + to;
          if (
            a < bestAny[to] &&
            a < destBound &&
            a < wArr[cell] &&
            !originBlocked[to] &&
            !excludedStop[to]
          ) {
            wArr[cell] = a;
            wStamp[cell] = run;
            wFrom[cell] = stop;
            wEdge[cell] = e;
            bestAny[to] = a;
            mark(to);
            const r = walkReadyAt(s, e, a0, a, q.minTransferSec);
            if (r < ready[cell]) {
              ready[cell] = r;
              readySrc[cell] = SRC_WALK;
            }
            const egress = egressByStop.get(to);
            if (egress && egress.sec === 0 && a < destBound) destBound = a;
          }
        }
      }

      // Journeys with exactly k vehicles found in this run.
      let bestHere = INF;
      let bestStop = -1;
      let bestWalked = false;
      for (const [stop, egress] of egressByStop) {
        const cell = row + stop;
        if (vStamp[cell] === run && vArr[cell] + egress.sec < bestHere) {
          bestHere = vArr[cell] + egress.sec;
          bestStop = stop;
          bestWalked = false;
        }
        // A walked-to stop ends the journey only if it is the destination stop itself.
        if (egress.sec === 0 && wStamp[cell] === run && wArr[cell] < bestHere) {
          bestHere = wArr[cell];
          bestStop = stop;
          bestWalked = true;
        }
      }
      let fewer = INF;
      for (let j = 1; j < k; j++) fewer = Math.min(fewer, destBest[j]);
      if (bestStop >= 0 && bestHere < destBest[k] && bestHere < fewer) {
        destBest[k] = bestHere;
        const journey = reconstruct(k, bestStop, bestWalked, egressByStop.get(bestStop)!);
        if (journey) found.push(journey);
      }

      marked = nextMarked;
      if (marked.length === 0) break;
    }
    for (let i = 0; i < n; i++) isMarked[i] = 0;
  }

  /**
   * Earliest boarding of `toRoute` at a stop with route-specific transfer rules, over the labels
   * of rounds < k: [time, round, source].
   */
  function ruledReady(stop: number, k: number, toRoute: number): [number, number, number] {
    let best = ready[stop];
    let bestRow = best < INF ? 0 : -1;
    let bestSrc = SRC_ACCESS;
    for (let j = 1; j < k; j++) {
      const cell = j * n + stop;
      if (vArr[cell] < INF) {
        const d = resolveTransfer(s, stop, stop, s.patternRoute[vPattern[cell]], toRoute);
        const r = vArr[cell] + Math.max(q.minTransferSec, d.minSec);
        if (!d.forbidden && r < best) [best, bestRow, bestSrc] = [r, j, SRC_VEHICLE];
      }
      if (wArr[cell] < INF) {
        const from = wFrom[cell];
        const a0 = vArr[j * n + from];
        const d = resolveTransfer(s, from, stop, s.patternRoute[vPattern[j * n + from]], toRoute);
        const r = Math.max(
          walkReadyAt(s, wEdge[cell], a0, wArr[cell], q.minTransferSec),
          a0 + d.minSec,
        );
        if (!d.forbidden && r < best) [best, bestRow, bestSrc] = [r, j, SRC_WALK];
      }
    }
    return [best, bestRow, bestSrc];
  }

  function reconstruct(
    k: number,
    stop: number,
    walked: boolean,
    egress: Endpoint,
  ): RawJourney | null {
    const legs: RawLeg[] = [];
    let row = k;
    let at = stop;
    let src = walked ? SRC_WALK : SRC_VEHICLE;
    if (egress.sec > 0) {
      const a = vArr[row * n + at];
      legs.push({
        kind: 'walk',
        role: 'egress',
        fromStop: at,
        toStop: -1,
        sec: egress.sec,
        meters: egress.meters,
        edge: -1,
        departure: a,
        arrival: a + egress.sec,
      });
    }
    for (let guard = 0; guard < 3 * rows + 3; guard++) {
      if (src === SRC_ACCESS) {
        const o = q.origins[accIdx[at]];
        // Legs are collected backwards: the chronologically first transit leg is the last one pushed.
        let first: RawTransitLeg | undefined;
        for (let i = legs.length - 1; i >= 0 && !first; i--) {
          const l = legs[i];
          if (l.kind === 'transit') first = l;
        }
        if (!o || o.stop !== at || !first) return null;
        if (o.sec > 0) {
          legs.push({
            kind: 'walk',
            role: 'access',
            fromStop: -1,
            toStop: at,
            sec: o.sec,
            meters: o.meters,
            edge: -1,
            departure: first.departure - o.sec,
            arrival: first.departure,
          });
        }
        legs.reverse();
        const transit = legs.filter((l) => l.kind === 'transit').length;
        return {
          departure: legs[0].departure,
          arrival: legs[legs.length - 1].arrival,
          transfers: transit - 1,
          legs,
        };
      }
      const cell = row * n + at;
      if (src === SRC_WALK) {
        const e = wEdge[cell];
        const from = wFrom[cell];
        legs.push({
          kind: 'walk',
          role: 'transfer',
          fromStop: from,
          toStop: at,
          sec: s.footSec[e],
          meters: s.footMeters[e],
          edge: e,
          departure: wArr[cell] - s.footSec[e],
          arrival: wArr[cell],
        });
        at = from;
        src = SRC_VEHICLE;
        continue;
      }
      // Vehicle label.
      if (vArr[cell] === INF) return null;
      const p = vPattern[cell];
      const slot = vSlot[cell];
      const len = s.patternStopOffset[p + 1] - s.patternStopOffset[p];
      const base = s.patternTimeOffset[p] + slot * len;
      const trip = s.patternTrips[s.patternTripOffset[p] + slot];
      const off = vDay[cell];
      legs.push({
        kind: 'transit',
        pattern: p,
        trip,
        slot,
        dayOffset: off,
        boardPos: vBoardPos[cell],
        alightPos: vAlightPos[cell],
        departure: s.departure[base + vBoardPos[cell]] + off * SECONDS_PER_DAY,
        arrival: s.arrival[base + vAlightPos[cell]] + off * SECONDS_PER_DAY,
        service: tripState(trip, day0 + off) === 2 ? 'projected' : 'covered',
      });
      at = s.patternStops[s.patternStopOffset[p] + vBoardPos[cell]];
      row = vBoardRow[cell];
      src = vBoardSrc[cell];
      if (row === 0) src = SRC_ACCESS;
    }
    return null;
  }

  const journeys = paretoFilter(
    dedupe(found).filter((j) => j.departure >= q.departAt && j.departure <= windowEnd),
  );
  if (!collect) return { journeys, reached: [] };

  // One-to-all: the best label of every stop within the time limit, with its journey.
  const reached: ReachedStop[] = [];
  const limit = q.departAt + (q.maxJourneySec ?? 0);
  for (let stop = 0; stop < n; stop++) {
    let best = accArr[stop] <= limit ? accArr[stop] : INF;
    let bestRow = -1;
    let walked = false;
    for (let k = 1; k <= K; k++) {
      const cell = k * n + stop;
      if (vArr[cell] < best) [best, bestRow, walked] = [vArr[cell], k, false];
      if (wArr[cell] < best) [best, bestRow, walked] = [wArr[cell], k, true];
    }
    if (best > limit) continue;
    if (bestRow < 0) {
      const o = q.origins[accIdx[stop]];
      reached.push({ stop, arrival: best, journey: null, accessMeters: o?.meters ?? 0 });
      continue;
    }
    const journey = reconstruct(bestRow, stop, walked, { stop, sec: 0, meters: 0 });
    if (journey) reached.push({ stop, arrival: best, journey, accessMeters: 0 });
  }
  return { journeys, reached };
}

function signature(j: RawJourney): string {
  return j.legs
    .filter((l): l is RawTransitLeg => l.kind === 'transit')
    .map((l) => `${l.trip}@${l.dayOffset}:${l.boardPos}-${l.alightPos}`)
    .join('|');
}

/** Same vehicles, boarding and alighting: keep the one leaving latest (least waiting). */
function dedupe(journeys: RawJourney[]): RawJourney[] {
  const bySig = new Map<string, RawJourney>();
  for (const j of journeys) {
    const key = signature(j);
    const cur = bySig.get(key);
    if (
      !cur ||
      j.departure > cur.departure ||
      (j.departure === cur.departure && j.arrival < cur.arrival)
    ) {
      bySig.set(key, j);
    }
  }
  return [...bySig.values()];
}

/** Keeps journeys not dominated on (later departure, earlier arrival, fewer transfers). */
export function paretoFilter(journeys: RawJourney[]): RawJourney[] {
  return journeys.filter(
    (a) =>
      !journeys.some(
        (b) =>
          b !== a &&
          b.departure >= a.departure &&
          b.arrival <= a.arrival &&
          b.transfers <= a.transfers &&
          (b.departure > a.departure || b.arrival < a.arrival || b.transfers < a.transfers),
      ),
  );
}
