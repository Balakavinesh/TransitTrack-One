import type { StopTimes } from './model.js';

/**
 * Groups stop_times rows by trip and orders each group by stop_sequence (compressed-row
 * layout). Rows of trip key `k` are `order[start[k]] … order[start[k + 1] - 1]`.
 */
export interface TripIndex {
  order: Int32Array;
  start: Int32Array;
}

export function buildTripIndex(st: StopTimes): TripIndex {
  const trips = st.tripIds.length;
  const start = new Int32Array(trips + 1);
  for (let i = 0; i < st.count; i++) start[(st.tripKey[i] ?? 0) + 1]! += 1;
  for (let k = 0; k < trips; k++) start[k + 1]! += start[k]!;

  const cursor = start.slice(0, trips);
  const order = new Int32Array(st.count);
  for (let i = 0; i < st.count; i++) {
    const k = st.tripKey[i] ?? 0;
    order[cursor[k]!++] = i;
  }

  const seq = st.sequence;
  for (let k = 0; k < trips; k++) {
    order.subarray(start[k], start[k + 1]).sort((a, b) => seq[a]! - seq[b]!);
  }
  return { order, start };
}

/** Row indices of one trip, in stop_sequence order. */
export function tripRows(index: TripIndex, tripKey: number): Int32Array {
  return index.order.subarray(index.start[tripKey], index.start[tripKey + 1]);
}
