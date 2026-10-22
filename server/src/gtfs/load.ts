import { readCsv } from './csv.js';
import type { FindingCollector } from './findings.js';
import {
  SEQUENCE_INVALID,
  TIME_EMPTY,
  TIME_INVALID,
  type GtfsFeed,
  type GtfsRecord,
  type StopTimes,
} from './model.js';
import type { FeedSource } from './source.js';
import { GTFS_FILES, isKnownFile, type GtfsFileName } from './spec.js';
import { parseGtfsTime } from './time.js';

class GrowableInt32 {
  private data = new Int32Array(4096);
  length = 0;

  push(value: number): void {
    if (this.length === this.data.length) {
      const next = new Int32Array(this.data.length * 2);
      next.set(this.data);
      this.data = next;
    }
    this.data[this.length++] = value;
  }

  toArray(): Int32Array {
    return this.data.slice(0, this.length);
  }
}

class Interner {
  readonly ids: string[] = [];
  private readonly index = new Map<string, number>();

  key(id: string): number {
    let k = this.index.get(id);
    if (k === undefined) {
      k = this.ids.length;
      this.ids.push(id);
      this.index.set(id, k);
    }
    return k;
  }
}

const NON_NEGATIVE_INTEGER = /^\d+$/;

const isEmptyRow = (row: string[]) => row.every((value) => value.trim() === '');

function missingColumns(file: GtfsFileName, columns: string[]): string[] {
  return GTFS_FILES[file].requiredColumns.filter((c) => !columns.includes(c));
}

function reportMissingColumns(file: string, missing: string[], findings: FindingCollector): void {
  for (const column of missing) {
    findings.add('E_MISSING_COLUMN', { file, row: 1, message: `${file} has no ${column} column` });
  }
}

function makeTimeParser(findings: FindingCollector) {
  return (raw: string, column: string, line: number): number => {
    if (raw === '') return TIME_EMPTY;
    const seconds = parseGtfsTime(raw);
    if (seconds !== null) return seconds;
    findings.add('E_UNPARSABLE_TIME', {
      file: 'stop_times.txt',
      row: line,
      message: `${column} "${raw}" is not H:MM:SS`,
    });
    return TIME_INVALID;
  };
}

async function loadStopTimes(
  source: FeedSource,
  findings: FindingCollector,
): Promise<{ columns: string[]; rowCount: number; stopTimes: StopTimes | null }> {
  const trips = new Interner();
  const stops = new Interner();
  const lines = new GrowableInt32();
  const tripKey = new GrowableInt32();
  const stopKey = new GrowableInt32();
  const sequence = new GrowableInt32();
  const arrival = new GrowableInt32();
  const departure = new GrowableInt32();
  const parseTime = makeTimeParser(findings);

  let usable = false;
  let iTrip = 0;
  let iStop = 0;
  let iSeq = 0;
  let iArr = 0;
  let iDep = 0;

  const { columns, rowCount } = await readCsv(await source.open('stop_times.txt'), {
    onHeader: (cols) => {
      const missing = missingColumns('stop_times.txt', cols);
      reportMissingColumns('stop_times.txt', missing, findings);
      usable = missing.length === 0;
      [iTrip, iStop, iSeq, iArr, iDep] = [
        'trip_id',
        'stop_id',
        'stop_sequence',
        'arrival_time',
        'departure_time',
      ].map((c) => cols.indexOf(c)) as [number, number, number, number, number];
    },
    onRow: (row, line) => {
      if (!usable) return;
      if (isEmptyRow(row)) {
        findings.add('W_EMPTY_ROW', {
          file: 'stop_times.txt',
          row: line,
          message: 'row has only empty values; skipped',
        });
        return;
      }
      lines.push(line);
      tripKey.push(trips.key(row[iTrip] ?? ''));
      stopKey.push(stops.key(row[iStop] ?? ''));
      const seq = row[iSeq] ?? '';
      if (NON_NEGATIVE_INTEGER.test(seq)) {
        sequence.push(Number(seq));
      } else {
        sequence.push(SEQUENCE_INVALID);
        findings.add('E_INVALID_FIELD', {
          file: 'stop_times.txt',
          row: line,
          message: `stop_sequence "${seq}" is not a non-negative integer`,
        });
      }
      arrival.push(parseTime(row[iArr] ?? '', 'arrival_time', line));
      departure.push(parseTime(row[iDep] ?? '', 'departure_time', line));
    },
  });

  if (!usable) return { columns, rowCount, stopTimes: null };
  return {
    columns,
    rowCount,
    stopTimes: {
      count: tripKey.length,
      line: lines.toArray(),
      tripKey: tripKey.toArray(),
      stopKey: stopKey.toArray(),
      sequence: sequence.toArray(),
      arrival: arrival.toArray(),
      departure: departure.toArray(),
      tripIds: trips.ids,
      stopIds: stops.ids,
    },
  };
}

async function loadRecords(
  source: FeedSource,
  name: string,
  findings: FindingCollector,
): Promise<{ columns: string[]; rowCount: number; records: GtfsRecord[] }> {
  const recordsOut: GtfsRecord[] = [];
  let columns: string[] = [];
  const result = await readCsv(await source.open(name), {
    onHeader: (cols) => {
      columns = cols;
    },
    onRow: (row, line) => {
      if (isEmptyRow(row)) {
        findings.add('W_EMPTY_ROW', {
          file: name,
          row: line,
          message: 'row has only empty values; skipped',
        });
        return;
      }
      const v: Record<string, string> = {};
      for (let i = 0; i < columns.length; i++) {
        const column = columns[i];
        if (column !== undefined && column !== '') v[column] = row[i] ?? '';
      }
      recordsOut.push({ row: line, v });
    },
  });
  return { ...result, records: recordsOut };
}

async function countRows(
  source: FeedSource,
  name: string,
): Promise<{ columns: string[]; rowCount: number }> {
  return readCsv(await source.open(name), { onRow: () => undefined });
}

/**
 * Loads every root-level .txt file in the source. Load-time problems (missing files or
 * columns, malformed CSV, unparsable stop times) go into `findings`. A known table with a
 * missing required column is not loaded, so rules that depend on it are skipped rather than
 * producing a cascade of follow-on errors.
 */
export async function loadFeed(source: FeedSource, findings: FindingCollector): Promise<GtfsFeed> {
  const feed: GtfsFeed = { label: source.label, files: {}, tables: {}, stopTimes: null };
  const present = new Set(source.files);

  for (const [name, spec] of Object.entries(GTFS_FILES)) {
    if (spec.required && !present.has(name)) {
      findings.add('E_MISSING_FILE', { file: name, message: `${name} is missing` });
    }
  }
  if (!present.has('calendar.txt') && !present.has('calendar_dates.txt')) {
    findings.add('E_MISSING_FILE', {
      file: 'calendar.txt',
      message: 'neither calendar.txt nor calendar_dates.txt is present',
    });
  }

  for (const name of [...source.files].sort()) {
    try {
      if (name === 'stop_times.txt') {
        const { columns, rowCount, stopTimes } = await loadStopTimes(source, findings);
        feed.files[name] = { columns, rowCount };
        feed.stopTimes = stopTimes;
      } else if (isKnownFile(name)) {
        const { columns, rowCount, records } = await loadRecords(source, name, findings);
        feed.files[name] = { columns, rowCount };
        const missing = missingColumns(name, columns);
        reportMissingColumns(name, missing, findings);
        if (missing.length === 0) {
          feed.tables[name as Exclude<GtfsFileName, 'stop_times.txt'>] = {
            file: name,
            columns,
            records,
          };
        }
      } else {
        feed.files[name] = await countRows(source, name);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Byte-budget overruns and yauzl's declared-size mismatches both mean an unsafe archive.
      if (message.startsWith('zip safety:') || /bytes in the stream/.test(message)) {
        findings.add('E_ZIP_UNSAFE', { file: name, message });
      } else {
        findings.add('E_MALFORMED_CSV', { file: name, message });
      }
    }
  }

  return feed;
}
