import { haversineMeters } from '../geo.js';
import { records } from '../model.js';
import { formatGtfsTime } from '../time.js';
import { tripRows } from '../trip-index.js';
import type { RuleInput } from './context.js';

/** First departure (or arrival) of every trip that has stop times, in seconds. */
export function firstDepartures(input: Pick<RuleInput, 'feed' | 'tripIndex'>): Int32Array {
  const st = input.feed.stopTimes;
  const index = input.tripIndex;
  if (!st || !index) return new Int32Array(0);
  const out: number[] = [];
  for (let k = 0; k < st.tripIds.length; k++) {
    const first = tripRows(index, k)[0];
    if (first === undefined) continue;
    const dep = st.departure[first]!;
    const t = dep >= 0 ? dep : st.arrival[first]!;
    if (t >= 0) out.push(t);
  }
  return Int32Array.from(out);
}

/** W_PLACEHOLDER_TIMES: a first-departure value shared by ≥ placeholderMinShare of trips (and ≥ 2). */
export function checkPlaceholderTimes(input: RuleInput): void {
  const firsts = firstDepartures(input);
  if (firsts.length === 0) return;
  const counts = new Map<number, number>();
  for (const t of firsts) counts.set(t, (counts.get(t) ?? 0) + 1);
  const threshold = Math.max(2, Math.ceil(input.ctx.placeholderMinShare * firsts.length));

  const clusters = [...counts].filter(([, n]) => n >= threshold).sort((a, b) => b[1] - a[1]);
  for (const [time, n] of clusters) {
    input.findings.add(
      'W_PLACEHOLDER_TIMES',
      {
        file: 'stop_times.txt',
        message: `${n} of ${firsts.length} trips (${((100 * n) / firsts.length).toFixed(1)} %) start at ${formatGtfsTime(time)}`,
      },
      n,
    );
  }
}

/** W_SHAPE_QUALITY: zero-length shapes and stop-to-stop straight-line shapes. */
export function checkShapes(input: RuleInput): void {
  const { feed, findings } = input;
  const shapes = feed.tables['shapes.txt'];
  if (!shapes) return;

  const points = new Map<string, { seq: number; lat: number; lon: number }[]>();
  for (const { v } of shapes.records) {
    const id = v['shape_id'] ?? '';
    const lat = Number(v['shape_pt_lat']);
    const lon = Number(v['shape_pt_lon']);
    const seq = Number(v['shape_pt_sequence']);
    if (![lat, lon, seq].every(Number.isFinite)) continue;
    let list = points.get(id);
    if (!list) points.set(id, (list = []));
    list.push({ seq, lat, lon });
  }

  // Largest stop count among trips using each shape.
  const maxStops = new Map<string, number>();
  const st = feed.stopTimes;
  const index = input.tripIndex;
  if (st && index) {
    const keyOf = new Map(st.tripIds.map((id, k) => [id, k]));
    for (const { v } of records(feed, 'trips.txt')) {
      const shapeId = v['shape_id'];
      const k = keyOf.get(v['trip_id'] ?? '');
      if (!shapeId || k === undefined) continue;
      maxStops.set(shapeId, Math.max(maxStops.get(shapeId) ?? 0, tripRows(index, k).length));
    }
  }

  for (const [id, list] of points) {
    list.sort((a, b) => a.seq - b.seq);
    let length = 0;
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1]!;
      const b = list[i]!;
      length += haversineMeters(a.lat, a.lon, b.lat, b.lon);
    }
    if (list.length < 2 || length < 1) {
      findings.add('W_SHAPE_QUALITY', {
        file: 'shapes.txt',
        message: `shape ${id} is zero-length (${list.length} points, ${length.toFixed(1)} m)`,
      });
      continue;
    }
    const stops = maxStops.get(id) ?? 0;
    if (stops >= 2 && list.length <= Math.ceil(stops * 1.1)) {
      findings.add('W_SHAPE_QUALITY', {
        file: 'shapes.txt',
        message: `shape ${id} looks straight-line: ${list.length} points for trips with ${stops} stops`,
      });
    }
  }
}

/** W_STOP_WITHOUT_TRIPS for boarding stops (location_type 0 or empty) absent from stop_times. */
export function checkUnusedStops(input: RuleInput): void {
  const st = input.feed.stopTimes;
  if (!st) return;
  const used = new Set(st.stopIds);
  for (const { row, v } of records(input.feed, 'stops.txt')) {
    const type = v['location_type'] ?? '';
    if (type !== '' && type !== '0') continue;
    const id = v['stop_id'] ?? '';
    if (!used.has(id)) {
      input.findings.add('W_STOP_WITHOUT_TRIPS', {
        file: 'stops.txt',
        row,
        message: `stop ${id} "${v['stop_name'] ?? ''}" is not used by any trip`,
      });
    }
  }
}

export function normaliseStopName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** W_DUPLICATE_STOPS: boarding stops with the same normalised name within duplicateStopMeters. */
export function checkDuplicateStops(input: RuleInput): void {
  const byName = new Map<
    string,
    { id: string; row: number; lat: number; lon: number; name: string }[]
  >();
  for (const { row, v } of records(input.feed, 'stops.txt')) {
    const type = v['location_type'] ?? '';
    if (type !== '' && type !== '0') continue;
    const lat = Number(v['stop_lat']);
    const lon = Number(v['stop_lon']);
    const name = v['stop_name'] ?? '';
    const key = normaliseStopName(name);
    if (key === '' || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    let group = byName.get(key);
    if (!group) byName.set(key, (group = []));
    group.push({ id: v['stop_id'] ?? '', row, lat, lon, name });
  }

  for (const group of byName.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]!;
        const b = group[j]!;
        const d = haversineMeters(a.lat, a.lon, b.lat, b.lon);
        if (d <= input.ctx.duplicateStopMeters) {
          input.findings.add('W_DUPLICATE_STOPS', {
            file: 'stops.txt',
            row: b.row,
            message: `${a.id} and ${b.id} are both "${a.name}" and ${d.toFixed(0)} m apart`,
          });
        }
      }
    }
  }
}

const MARKUP = /<\s*\/?\s*[a-z!][^>]*>|javascript:/i;

/** W_MARKUP_IN_TEXT and W_ID_WHITESPACE across all loaded tables and stop_times IDs. */
export function checkText(input: RuleInput): void {
  const { feed, findings } = input;
  const isIdColumn = (c: string) => c.endsWith('_id') || c === 'parent_station';

  for (const table of Object.values(feed.tables)) {
    for (const { row, v } of table.records) {
      for (const [column, value] of Object.entries(v)) {
        if (MARKUP.test(value)) {
          findings.add('W_MARKUP_IN_TEXT', {
            file: table.file,
            row,
            message: `${column} contains markup: ${JSON.stringify(value)}`,
          });
        }
        if (isIdColumn(column) && value !== value.trim()) {
          findings.add('W_ID_WHITESPACE', {
            file: table.file,
            row,
            message: `${column} ${JSON.stringify(value)} has leading/trailing whitespace`,
          });
        }
      }
    }
  }

  const st = feed.stopTimes;
  if (!st) return;
  for (const [column, ids] of [
    ['trip_id', st.tripIds],
    ['stop_id', st.stopIds],
  ] as const) {
    for (const id of ids) {
      if (MARKUP.test(id)) {
        findings.add('W_MARKUP_IN_TEXT', {
          file: 'stop_times.txt',
          message: `${column} contains markup: ${JSON.stringify(id)}`,
        });
      }
      if (id !== id.trim()) {
        findings.add('W_ID_WHITESPACE', {
          file: 'stop_times.txt',
          message: `${column} ${JSON.stringify(id)} has leading/trailing whitespace`,
        });
      }
    }
  }
}
