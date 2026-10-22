import { parseIsoDate } from '../gtfs/index.js';
import { SECONDS_PER_DAY, walkReadyAt, type RawJourney } from './raptor.js';
import { hasTransferRules, resolveTransfer } from './transfer-rules.js';
import type { Snapshot } from './types.js';

/**
 * Property checks for a routed journey (SPEC §9 golden-set properties). Returns the list of
 * violations; empty means the journey is consistent with the snapshot:
 *  - each transit leg boards before it alights, at the pattern's stops, with the trip's times;
 *  - legs are in time order and every time is monotonic;
 *  - after a vehicle, the next boarding is where the journey is, and waits at least the walk
 *    plus `minTransferSec` (at the same stop: max(buffer, the published minimum transfer time);
 *    after a transfers.txt link with a published time: see walkReadyAt), honours route-specific
 *    minimum times, and never happens where transfers.txt prohibits it for those routes;
 *  - each trip runs on its service day by its own calendar, or is flagged projected for a day
 *    that the snapshot projects (and only when projection was allowed);
 *  - transfer walks follow a published or estimated footpath of the snapshot.
 */
export function validateJourney(
  s: Snapshot,
  j: RawJourney,
  opts: {
    date: string;
    minTransferSec: number;
    includeProjected: boolean;
    excludedStops?: ReadonlySet<number>;
    excludedRoutes?: ReadonlySet<number>;
  },
): string[] {
  const errors: string[] = [];
  const days = s.header.horizonDays;
  const day0 = parseIsoDate(opts.date)! - parseIsoDate(s.header.horizonStart)!;
  let t = j.departure;
  let lastVehicleArrival: number | null = null;
  let lastVehicleStop = -1;
  let lastPattern = -1;
  let walkSinceVehicle = 0;
  let walkEdge = -1;
  let walkTo = -1;
  let transit = 0;
  j.legs.forEach((leg, i) => {
    if (leg.departure < t) errors.push(`leg ${i} departs before the previous leg ends`);
    if (leg.arrival < leg.departure) errors.push(`leg ${i} arrives before it departs`);
    if (leg.kind === 'walk') {
      if (leg.arrival - leg.departure !== leg.sec) errors.push(`walk leg ${i} duration mismatch`);
      if (leg.role === 'transfer') {
        if (opts.excludedStops?.has(leg.toStop))
          errors.push(`walk leg ${i} walks to a stop closed by a verified report`);
        let edge = -1;
        for (let e = s.footOffset[leg.fromStop]; e < s.footOffset[leg.fromStop + 1]; e++) {
          if (s.footTo[e] === leg.toStop && s.footSec[e] === leg.sec) edge = e;
        }
        if (edge < 0) errors.push(`walk leg ${i} is not a footpath of the snapshot`);
        if (lastVehicleArrival !== null && leg.fromStop !== lastVehicleStop)
          errors.push(`walk leg ${i} does not start where the vehicle stopped`);
        walkSinceVehicle += leg.sec;
        walkEdge = edge;
        walkTo = leg.toStop;
      }
      t = leg.arrival;
      return;
    }
    transit++;
    const so = s.patternStopOffset[leg.pattern];
    const len = s.patternStopOffset[leg.pattern + 1] - so;
    if (!(leg.boardPos >= 0 && leg.boardPos < leg.alightPos && leg.alightPos < len)) {
      errors.push(`leg ${i} has an invalid stop order (${leg.boardPos} → ${leg.alightPos})`);
      return;
    }
    if (s.patternTrips[s.patternTripOffset[leg.pattern] + leg.slot] !== leg.trip) {
      errors.push(`leg ${i} trip does not belong to its pattern slot`);
    }
    if (opts.excludedRoutes?.has(s.patternRoute[leg.pattern]))
      errors.push(`leg ${i} uses a route closed by a verified report`);
    for (const pos of [leg.boardPos, leg.alightPos]) {
      if (opts.excludedStops?.has(s.patternStops[so + pos]))
        errors.push(`leg ${i} boards or alights at a stop closed by a verified report`);
    }
    const base = s.patternTimeOffset[leg.pattern] + leg.slot * len;
    const shift = leg.dayOffset * SECONDS_PER_DAY;
    if (s.departure[base + leg.boardPos] + shift !== leg.departure)
      errors.push(`leg ${i} departure mismatch`);
    if (s.arrival[base + leg.alightPos] + shift !== leg.arrival)
      errors.push(`leg ${i} arrival mismatch`);
    for (let p = leg.boardPos; p < leg.alightPos; p++) {
      if (s.departure[base + p] > s.arrival[base + p + 1])
        errors.push(`leg ${i} times not monotonic`);
    }
    if (lastVehicleArrival !== null) {
      const sameStop = walkTo < 0;
      const boardStop = s.patternStops[so + leg.boardPos];
      if (boardStop !== (sameStop ? lastVehicleStop : walkTo))
        errors.push(`leg ${i} boards at a stop the journey has not reached`);
      // Route-specific rules where the boarding stop has them; otherwise the same-stop rules (a
      // stop-pair prohibition removes the footpath itself).
      let forbidden = false;
      let minSec = 0;
      if (hasTransferRules(s, boardStop)) {
        const d = resolveTransfer(
          s,
          lastVehicleStop,
          boardStop,
          s.patternRoute[lastPattern],
          s.patternRoute[leg.pattern],
        );
        forbidden = d.forbidden;
        minSec = d.minSec;
      } else if (sameStop) {
        forbidden = s.stopTransferForbidden[lastVehicleStop] === 1;
        minSec = s.stopMinTransferSec[lastVehicleStop];
      }
      if (forbidden) errors.push(`leg ${i} transfers where transfers.txt prohibits it`);
      const walked = lastVehicleArrival + walkSinceVehicle;
      const needed = Math.max(
        lastVehicleArrival + minSec,
        sameStop
          ? lastVehicleArrival + opts.minTransferSec
          : walkEdge >= 0
            ? walkReadyAt(s, walkEdge, lastVehicleArrival, walked, opts.minTransferSec)
            : walked + opts.minTransferSec,
      );
      if (leg.departure < needed) {
        errors.push(
          `leg ${i} boards ${needed - leg.departure} s before the transfer buffer allows`,
        );
      }
    }
    const cell = s.tripService[leg.trip] * days + day0 + leg.dayOffset;
    const covered = s.serviceCovered[cell] === 1;
    const projected = s.serviceProjected[cell] === 1;
    if (leg.service === 'covered' && !covered)
      errors.push(`leg ${i} trip does not run on its service day`);
    if (leg.service === 'projected') {
      if (!projected) errors.push(`leg ${i} is flagged projected but the day is not projected`);
      if (!opts.includeProjected) errors.push(`leg ${i} is projected although projection was off`);
    }
    lastVehicleArrival = leg.arrival;
    lastVehicleStop = s.patternStops[so + leg.alightPos];
    lastPattern = leg.pattern;
    walkSinceVehicle = 0;
    walkEdge = -1;
    walkTo = -1;
    t = leg.arrival;
  });
  if (transit === 0) errors.push('journey has no transit leg');
  if (j.legs.length && j.departure !== j.legs[0].departure) errors.push('departure mismatch');
  const access = j.legs[0];
  if (
    access?.kind === 'walk' &&
    access.role === 'access' &&
    j.legs[1] &&
    access.arrival !== j.legs[1].departure
  ) {
    errors.push('access walk does not end when the first vehicle departs');
  }
  if (j.transfers !== transit - 1) errors.push(`transfers ${j.transfers} ≠ transit legs − 1`);
  if (j.legs.length && j.arrival !== j.legs[j.legs.length - 1].arrival)
    errors.push('arrival mismatch');
  return errors;
}
