import { parse } from 'csv-parse';
import type { Readable } from 'node:stream';

export interface CsvHandlers {
  /** Called once with the trimmed header names, before any row. */
  onHeader?: (columns: string[]) => void;
  /** Called per data row with its 1-based line number (the header is line 1). */
  onRow: (row: string[], line: number) => void;
}

/** Reads only the header row (trimmed names, BOM removed) and stops. */
export async function readCsvHeader(input: Readable): Promise<string[]> {
  const parser = parse({ bom: true, to_line: 1 });
  input.on('error', (error) => parser.destroy(error));
  input.pipe(parser);
  let columns: string[] = [];
  for await (const record of parser as AsyncIterable<string[]>)
    columns = record.map((c) => c.trim());
  input.unpipe(parser);
  input.destroy();
  return columns;
}

export interface CsvReadResult {
  columns: string[];
  rowCount: number;
}

/**
 * Streams a GTFS CSV file. A UTF-8 BOM is removed, empty lines are skipped, and short rows
 * are padded with empty strings so callers can index by column position.
 */
export async function readCsv(input: Readable, handlers: CsvHandlers): Promise<CsvReadResult> {
  const parser = parse({ bom: true, relax_column_count: true, skip_empty_lines: true });
  input.on('error', (error) => parser.destroy(error));
  input.pipe(parser);

  let columns: string[] | undefined;
  let rowCount = 0;
  let line = 1;

  for await (const record of parser as AsyncIterable<string[]>) {
    if (columns === undefined) {
      columns = record.map((name) => name.trim());
      handlers.onHeader?.(columns);
      continue;
    }
    line += 1;
    rowCount += 1;
    while (record.length < columns.length) record.push('');
    handlers.onRow(record, line);
  }

  if (columns === undefined) {
    columns = [];
    handlers.onHeader?.(columns);
  }
  return { columns, rowCount };
}
