import { WEEKDAY_COLUMNS, parseGtfsDate } from '../date.js';
import { inBBox } from '../geo.js';
import { SEQUENCE_INVALID, TIME_EMPTY, records } from '../model.js';
import { GTFS_FILES, type GtfsFileName } from '../spec.js';
import { formatGtfsTime } from '../time.js';
import { tripRows } from '../trip-index.js';
import { idSet, stopTimesLine, type RuleInput } from './context.js';

type TableFile = Exclude<GtfsFileName, 'stop_times.txt'>;

function checkEnum(
  input: RuleInput,
  file: TableFile,
  column: string,
  allowed: readonly string[],
  allowEmpty: boolean,
): void {
  for (const { row, v } of records(input.feed, file)) {
    const value = v[column];
    if (value === undefined || (allowEmpty && value === '')) continue;
    if (!allowed.includes(value)) {
      input.findings.add('E_INVALID_FIELD', {
        file,
        row,
        message: `${column} "${value}" is not one of ${allowed.join(', ')}`,
      });
    }
  }
}

const isNumber = (value: string | undefined): boolean =>
  value !== undefined && value.trim() !== '' && Number.isFinite(Number(value));

/** E_UNPARSABLE_DATE and E_INVALID_FIELD for typed columns in the small tables. */
export function checkFieldValues(input: RuleInput): void {
  const { feed, findings } = input;

  for (const { row, v } of records(feed, 'calendar.txt')) {
    for (const day of WEEKDAY_COLUMNS) {
      if (v[day] !== '0' && v[day] !== '1') {
        findings.add('E_INVALID_FIELD', {
          file: 'calendar.txt',
          row,
          message: `${day} "${v[day] ?? ''}" must be 0 or 1`,
        });
      }
    }
    const start = parseGtfsDate(v['start_date'] ?? '');
    const end = parseGtfsDate(v['end_date'] ?? '');
    for (const [column, parsed] of [
      ['start_date', start],
      ['end_date', end],
    ] as const) {
      if (parsed === null) {
        findings.add('E_UNPARSABLE_DATE', {
          file: 'calendar.txt',
          row,
          message: `${column} "${v[column] ?? ''}" is not a valid YYYYMMDD date`,
        });
      }
    }
    if (start !== null && end !== null && start > end) {
      findings.add('E_INVALID_FIELD', {
        file: 'calendar.txt',
        row,
        message: `start_date ${v['start_date']} is after end_date ${v['end_date']}`,
      });
    }
  }

  for (const { row, v } of records(feed, 'calendar_dates.txt')) {
    if (parseGtfsDate(v['date'] ?? '') === null) {
      findings.add('E_UNPARSABLE_DATE', {
        file: 'calendar_dates.txt',
        row,
        message: `date "${v['date'] ?? ''}" is not a valid YYYYMMDD date`,
      });
    }
  }
  checkEnum(input, 'calendar_dates.txt', 'exception_type', ['1', '2'], false);
  checkEnum(input, 'stops.txt', 'location_type', ['0', '1', '2', '3', '4'], true);
  checkEnum(input, 'pathways.txt', 'pathway_mode', ['1', '2', '3', '4', '5', '6', '7'], false);
  checkEnum(input, 'pathways.txt', 'is_bidirectional', ['0', '1'], false);
  checkEnum(input, 'transfers.txt', 'transfer_type', ['0', '1', '2', '3', '4', '5'], true);
  // A minimum time that is missing (type 2) or unusable: the row is applied conservatively only.
  for (const { row, v } of records(feed, 'transfers.txt')) {
    const min = (v['min_transfer_time'] ?? '').trim();
    const usable = /^\d+$/.test(min);
    if ((min !== '' && !usable) || (v['transfer_type']?.trim() === '2' && !usable)) {
      findings.add('W_TRANSFER_INCOMPLETE_RULE', {
        file: 'transfers.txt',
        row,
        message:
          min === ''
            ? 'transfer_type 2 without min_transfer_time'
            : `min_transfer_time "${min}" is not a non-negative integer`,
      });
    }
  }

  for (const { row, v } of records(feed, 'routes.txt')) {
    if (!/^\d+$/.test(v['route_type'] ?? '')) {
      findings.add('E_INVALID_FIELD', {
        file: 'routes.txt',
        row,
        message: `route_type "${v['route_type'] ?? ''}" is not an integer`,
      });
    }
  }
  for (const { row, v } of records(feed, 'shapes.txt')) {
    if (!isNumber(v['shape_pt_lat']) || !isNumber(v['shape_pt_lon'])) {
      findings.add('E_INVALID_FIELD', {
        file: 'shapes.txt',
        row,
        message: `shape point "${v['shape_pt_lat'] ?? ''}, ${v['shape_pt_lon'] ?? ''}" is not numeric`,
      });
    }
    if (!/^\d+$/.test(v['shape_pt_sequence'] ?? '')) {
      findings.add('E_INVALID_FIELD', {
        file: 'shapes.txt',
        row,
        message: `shape_pt_sequence "${v['shape_pt_sequence'] ?? ''}" is not a non-negative integer`,
      });
    }
  }
  for (const { row, v } of records(feed, 'pathways.txt')) {
    const t = v['traversal_time'];
    if (t !== undefined && t !== '' && !/^[1-9]\d*$/.test(t)) {
      findings.add('E_INVALID_FIELD', {
        file: 'pathways.txt',
        row,
        message: `traversal_time "${t}" is not a positive integer`,
      });
    }
  }
}

/** E_MISSING_AGENCY_ID: with several agencies, routes and fares must say whose they are. */
export function checkAgencyIds(input: RuleInput): void {
  if (records(input.feed, 'agency.txt').length < 2) return;
  for (const file of ['routes.txt', 'fare_attributes.txt'] as const) {
    for (const { row, v } of records(input.feed, file)) {
      if ((v['agency_id'] ?? '').trim() === '') {
        const id =
          file === 'routes.txt' ? `route ${v['route_id'] ?? ''}` : `fare ${v['fare_id'] ?? ''}`;
        input.findings.add('E_MISSING_AGENCY_ID', { file, row, message: `${id} has no agency_id` });
      }
    }
  }
}

/** E_COORD_OUTSIDE_BBOX, plus E_INVALID_FIELD for missing/non-numeric stop coordinates. */
export function checkCoordinates(input: RuleInput): void {
  const { bbox } = input.ctx;
  for (const { row, v } of records(input.feed, 'stops.txt')) {
    const type = v['location_type'] ?? '';
    const lat = v['stop_lat'];
    const lon = v['stop_lon'];
    // Coordinates are required for stops, stations and entrances; optional for nodes (3, 4).
    const required = type === '' || type === '0' || type === '1' || type === '2';
    if (!isNumber(lat) || !isNumber(lon)) {
      if (required || (lat ?? '') !== '' || (lon ?? '') !== '') {
        input.findings.add('E_INVALID_FIELD', {
          file: 'stops.txt',
          row,
          message: `stop ${v['stop_id'] ?? ''} coordinates "${lat ?? ''}, ${lon ?? ''}" are missing or not numeric`,
        });
      }
      continue;
    }
    if (!inBBox(Number(lat), Number(lon), bbox)) {
      input.findings.add('E_COORD_OUTSIDE_BBOX', {
        file: 'stops.txt',
        row,
        message: `stop ${v['stop_id'] ?? ''} at ${lat}, ${lon} is outside ${bbox.minLat}–${bbox.maxLat}, ${bbox.minLon}–${bbox.maxLon}`,
      });
    }
  }
}

/** E_DUPLICATE_ID for every file with a primary key. */
export function checkDuplicates(input: RuleInput): void {
  const { feed, findings } = input;
  for (const [file, spec] of Object.entries(GTFS_FILES) as [
    GtfsFileName,
    (typeof GTFS_FILES)[GtfsFileName],
  ][]) {
    if (file === 'stop_times.txt' || !('primaryKey' in spec)) continue;
    const table = feed.tables[file];
    if (!table) continue;
    const key = spec.primaryKey;
    if (!key.every((c) => table.columns.includes(c))) continue;

    const firstSeen = new Map<string, number>();
    for (const { row, v } of table.records) {
      const value = key.map((c) => v[c] ?? '').join('\u0000');
      if (key.length === 1 && value === '') continue;
      const first = firstSeen.get(value);
      if (first === undefined) {
        firstSeen.set(value, row);
      } else {
        findings.add('E_DUPLICATE_ID', {
          file,
          row,
          message: `${key.join(' + ')} "${key.map((c) => v[c] ?? '').join(' + ')}" duplicates row ${first}`,
        });
      }
    }
  }

  const st = feed.stopTimes;
  const index = input.tripIndex;
  if (!st || !index) return;
  for (let k = 0; k < st.tripIds.length; k++) {
    const rows = tripRows(index, k);
    for (let j = 1; j < rows.length; j++) {
      const prev = rows[j - 1]!;
      const cur = rows[j]!;
      const seq = st.sequence[cur]!;
      if (seq !== SEQUENCE_INVALID && seq === st.sequence[prev]) {
        findings.add('E_DUPLICATE_ID', {
          file: 'stop_times.txt',
          row: stopTimesLine(st, cur),
          message: `trip_id + stop_sequence "${st.tripIds[k]} + ${seq}" duplicates row ${stopTimesLine(st, prev)}`,
        });
      }
    }
  }
}

function checkRefs(
  input: RuleInput,
  file: TableFile,
  column: string,
  target: Set<string> | null,
  targetFile: string,
  code: 'E_DANGLING_REFERENCE' | 'W_DANGLING_OPTIONAL_REFERENCE',
  allowEmpty: boolean,
): void {
  if (!target) return;
  for (const { row, v } of records(input.feed, file)) {
    const value = v[column];
    if (value === undefined || (allowEmpty && value === '')) continue;
    if (!target.has(value)) {
      input.findings.add(code, {
        file,
        row,
        message: `${column} "${value}" is not in ${targetFile}`,
      });
    }
  }
}

/** E_DANGLING_REFERENCE (required links) and W_DANGLING_OPTIONAL_REFERENCE (optional links). */
export function checkReferences(input: RuleInput): void {
  const { feed, findings } = input;
  const ids = (file: TableFile, column: string): Set<string> | null => {
    const table = feed.tables[file];
    if (!table || !table.columns.includes(column)) return null;
    return idSet(table.records.map((r) => r.v[column]));
  };

  const routeIds = ids('routes.txt', 'route_id');
  const stopIds = ids('stops.txt', 'stop_id');
  const tripIds = ids('trips.txt', 'trip_id');
  const serviceIds =
    feed.tables['calendar.txt'] || feed.tables['calendar_dates.txt']
      ? new Set([
          ...(ids('calendar.txt', 'service_id') ?? []),
          ...(ids('calendar_dates.txt', 'service_id') ?? []),
        ])
      : null;

  const E = 'E_DANGLING_REFERENCE';
  const W = 'W_DANGLING_OPTIONAL_REFERENCE';
  checkRefs(input, 'trips.txt', 'route_id', routeIds, 'routes.txt', E, false);
  checkRefs(
    input,
    'trips.txt',
    'service_id',
    serviceIds,
    'calendar.txt/calendar_dates.txt',
    E,
    false,
  );
  checkRefs(input, 'stops.txt', 'parent_station', stopIds, 'stops.txt', E, true);

  checkRefs(
    input,
    'trips.txt',
    'shape_id',
    ids('shapes.txt', 'shape_id') ?? new Set(),
    'shapes.txt',
    W,
    true,
  );
  checkRefs(
    input,
    'routes.txt',
    'agency_id',
    ids('agency.txt', 'agency_id'),
    'agency.txt',
    W,
    true,
  );
  for (const column of ['from_stop_id', 'to_stop_id']) {
    checkRefs(input, 'transfers.txt', column, stopIds, 'stops.txt', W, true);
    checkRefs(input, 'pathways.txt', column, stopIds, 'stops.txt', W, false);
  }
  for (const column of ['from_route_id', 'to_route_id']) {
    checkRefs(input, 'transfers.txt', column, routeIds, 'routes.txt', W, true);
  }
  for (const column of ['from_trip_id', 'to_trip_id']) {
    checkRefs(input, 'transfers.txt', column, tripIds, 'trips.txt', W, true);
  }
  checkRefs(
    input,
    'fare_rules.txt',
    'fare_id',
    ids('fare_attributes.txt', 'fare_id'),
    'fare_attributes.txt',
    W,
    false,
  );
  checkRefs(input, 'fare_rules.txt', 'route_id', routeIds, 'routes.txt', W, true);

  // stop_times → trips / stops, reported once per distinct missing ID with its row count.
  const st = feed.stopTimes;
  const index = input.tripIndex;
  if (!st || !index) return;
  if (tripIds) {
    for (let k = 0; k < st.tripIds.length; k++) {
      const id = st.tripIds[k]!;
      if (tripIds.has(id)) continue;
      const rows = tripRows(index, k);
      findings.add(
        E,
        {
          file: 'stop_times.txt',
          row: stopTimesLine(st, rows[0] ?? 0),
          message: `trip_id "${id}" (${rows.length} rows) is not in trips.txt`,
        },
        rows.length,
      );
    }
  }
  if (stopIds) {
    const rowsPerStop = new Int32Array(st.stopIds.length);
    const firstRow = new Int32Array(st.stopIds.length).fill(-1);
    for (let i = 0; i < st.count; i++) {
      const k = st.stopKey[i]!;
      rowsPerStop[k]! += 1;
      if (firstRow[k] === -1) firstRow[k] = i;
    }
    for (let k = 0; k < st.stopIds.length; k++) {
      const id = st.stopIds[k]!;
      if (stopIds.has(id)) continue;
      findings.add(
        E,
        {
          file: 'stop_times.txt',
          row: stopTimesLine(st, firstRow[k]!),
          message: `stop_id "${id}" (${rowsPerStop[k]} rows) is not in stops.txt`,
        },
        rowsPerStop[k],
      );
    }
  }
}

/**
 * E_UNPARSABLE_TIME for empty times at a trip's first/last stop, W_NON_INCREASING_TIMES
 * (counted per trip), and W_TRIP_TOO_FEW_STOP_TIMES.
 */
export function checkTripTimes(input: RuleInput): void {
  const { feed, findings } = input;
  const st = feed.stopTimes;
  const index = input.tripIndex;
  if (!st || !index) return;

  for (let k = 0; k < st.tripIds.length; k++) {
    const rows = tripRows(index, k);
    const tripId = st.tripIds[k]!;

    for (const terminal of new Set([rows[0], rows[rows.length - 1]])) {
      if (terminal === undefined) continue;
      if (st.arrival[terminal] === TIME_EMPTY || st.departure[terminal] === TIME_EMPTY) {
        findings.add('E_UNPARSABLE_TIME', {
          file: 'stop_times.txt',
          row: stopTimesLine(st, terminal),
          message: `trip ${tripId}: arrival_time and departure_time are required at the first and last stop`,
        });
      }
    }

    let previous = -1;
    for (const i of rows) {
      const arr = st.arrival[i]!;
      const dep = st.departure[i]!;
      const timeIn = arr >= 0 ? arr : dep;
      const timeOut = dep >= 0 ? dep : arr;
      const backwards = (arr >= 0 && dep >= 0 && dep < arr) || (timeIn >= 0 && timeIn < previous);
      if (backwards) {
        findings.add('W_NON_INCREASING_TIMES', {
          file: 'stop_times.txt',
          row: stopTimesLine(st, i),
          message: `trip ${tripId} at stop_sequence ${st.sequence[i]}: ${formatGtfsTime(Math.max(timeIn, 0))} is before the previous ${formatGtfsTime(Math.max(previous, 0))}`,
        });
        break; // count each trip once
      }
      if (timeOut >= 0) previous = timeOut;
    }
  }

  const trips = feed.tables['trips.txt'];
  if (!trips) return;
  const keyOf = new Map(st.tripIds.map((id, k) => [id, k]));
  for (const { row, v } of trips.records) {
    const k = keyOf.get(v['trip_id'] ?? '');
    const n = k === undefined ? 0 : tripRows(index, k).length;
    if (n < 2) {
      findings.add('W_TRIP_TOO_FEW_STOP_TIMES', {
        file: 'trips.txt',
        row,
        message: `trip ${v['trip_id'] ?? ''} has ${n} stop time${n === 1 ? '' : 's'}`,
      });
    }
  }
}
