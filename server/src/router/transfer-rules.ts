import type { RouterInput } from './types.js';

/**
 * GTFS transfers.txt semantics used by the router:
 *  - 0 recommended, 1 timed: a possible transfer (no relaxation of our buffer: a "timed" vehicle
 *    is not assumed to wait);
 *  - 2 needs at least min_transfer_time between arrival and departure;
 *  - 3 not possible;
 *  - 4, 5 in-seat transfers (staying on the vehicle between trips): not walking transfers and
 *    not routed; ignored and counted.
 * A rule names a stop pair (a station id stands for its platforms) and optionally routes. GTFS
 * precedence: the most specific matching rule wins (from+to route > one route > stop pair only).
 * Among equally specific rules, a prohibition wins, then the largest minimum time.
 *
 * Conservative-only rows: trip-specific rows (from_trip_id / to_trip_id; trips are not matched)
 * and rows with an import issue (unknown route or trip, type 2 without a minimum time). Such a
 * row never relaxes another rule and never adds a walking link; its prohibition or minimum time
 * is applied to its whole route / stop pair instead (an unknown route counts as any route).
 */
export const ROUTE_ANY = -1;

export interface TransferRuleTable {
  /** CSR by boarding (to) stop; only stops with a route- or trip-specific rule have entries. */
  ruleOffset: Int32Array;
  ruleFromStop: Int32Array;
  /** Route index, or ROUTE_ANY. */
  ruleFromRoute: Int32Array;
  ruleToRoute: Int32Array;
  ruleType: Uint8Array;
  /** min_transfer_time in seconds (type 2), or -1. */
  ruleMinSec: Int32Array;
  /** 1 for a conservative-only row (see above). */
  ruleConservative: Uint8Array;
}

export interface TransferDecision {
  forbidden: boolean;
  /** Published minimum seconds between arrival and departure (0 = none). */
  minSec: number;
}

export type TransferRow = RouterInput['transfers'][number];

/** A row applied conservatively only: trip-specific or with an import issue. */
export const isConservativeOnly = (t: TransferRow) =>
  t.tripSpecific === true || (t.issue ?? null) !== null;

/** A row that names routes or trips (not just a stop pair), or is conservative-only. */
export const isSpecific = (t: TransferRow) =>
  (t.fromRoute ?? null) !== null || (t.toRoute ?? null) !== null || isConservativeOnly(t);

/** Types the router applies (in-seat transfers 4 and 5 are not walking transfers). */
export const isRoutedType = (type: number) => type >= 0 && type <= 3;

/**
 * Builds the rule table for every boarding stop that has at least one route- or trip-specific
 * rule. Such a stop gets *all* its rules (stop-pair ones too), so a decision there is resolved
 * from this table alone. `expand` maps a station to its platforms.
 */
export function buildTransferRules(
  nStops: number,
  transfers: RouterInput['transfers'],
  expand: (stop: number) => number[],
): TransferRuleTable & { specificPairs: Set<string> } {
  const byTo: TransferRow[][] = Array.from({ length: nStops }, () => []);
  const ruleStops = new Uint8Array(nStops);
  const specificPairs = new Set<string>();
  for (const t of transfers) {
    if (!isRoutedType(t.type)) continue;
    for (const a of expand(t.from)) {
      for (const b of expand(t.to)) {
        byTo[b].push({ ...t, from: a, to: b });
        if (isSpecific(t)) {
          ruleStops[b] = 1;
          specificPairs.add(`${a}:${b}`);
        }
      }
    }
  }
  const ruleOffset = new Int32Array(nStops + 1);
  let total = 0;
  for (let s = 0; s < nStops; s++) {
    ruleOffset[s] = total;
    if (ruleStops[s]) total += byTo[s].length;
  }
  ruleOffset[nStops] = total;
  const table: TransferRuleTable = {
    ruleOffset,
    ruleFromStop: new Int32Array(total),
    ruleFromRoute: new Int32Array(total),
    ruleToRoute: new Int32Array(total),
    ruleType: new Uint8Array(total),
    ruleMinSec: new Int32Array(total),
    ruleConservative: new Uint8Array(total),
  };
  for (let s = 0; s < nStops; s++) {
    if (!ruleStops[s]) continue;
    byTo[s].forEach((t, i) => {
      const j = ruleOffset[s] + i;
      table.ruleFromStop[j] = t.from;
      table.ruleFromRoute[j] = t.fromRoute ?? ROUTE_ANY;
      table.ruleToRoute[j] = t.toRoute ?? ROUTE_ANY;
      table.ruleType[j] = t.type;
      table.ruleMinSec[j] = t.type === 2 && t.minTime !== null ? t.minTime : -1;
      table.ruleConservative[j] = isConservativeOnly(t) ? 1 : 0;
    });
  }
  return { ...table, specificPairs };
}

/** True when boarding at `stop` is decided by the rule table (see buildTransferRules). */
export const hasTransferRules = (t: TransferRuleTable, stop: number) =>
  t.ruleOffset[stop + 1] > t.ruleOffset[stop];

/**
 * The rule for arriving by `fromRoute` at `fromStop` and boarding `toRoute` at `toStop`, from
 * the table at `toStop` (call only where hasTransferRules). No matching rule → allowed, no
 * published minimum.
 */
export function resolveTransfer(
  t: TransferRuleTable,
  fromStop: number,
  toStop: number,
  fromRoute: number,
  toRoute: number,
): TransferDecision {
  let best = -1;
  let forbidden = false;
  let minSec = 0;
  let tripForbidden = false;
  let tripMin = 0;
  for (let j = t.ruleOffset[toStop]; j < t.ruleOffset[toStop + 1]; j++) {
    if (t.ruleFromStop[j] !== fromStop) continue;
    const fr = t.ruleFromRoute[j];
    const tr = t.ruleToRoute[j];
    if ((fr !== ROUTE_ANY && fr !== fromRoute) || (tr !== ROUTE_ANY && tr !== toRoute)) continue;
    const type = t.ruleType[j];
    const min = t.ruleMinSec[j];
    if (t.ruleConservative[j]) {
      if (type === 3) tripForbidden = true;
      if (min > tripMin) tripMin = min;
      continue;
    }
    const specificity = (fr !== ROUTE_ANY ? 1 : 0) + (tr !== ROUTE_ANY ? 1 : 0);
    if (specificity > best) {
      best = specificity;
      forbidden = false;
      minSec = 0;
    }
    if (specificity === best) {
      if (type === 3) forbidden = true;
      if (min > minSec) minSec = min;
    }
  }
  return { forbidden: forbidden || tripForbidden, minSec: Math.max(minSec, tripMin) };
}
