import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { readCsv } from './csv.js';

async function read(text: string) {
  const rows: { row: string[]; line: number }[] = [];
  let header: string[] = [];
  const result = await readCsv(Readable.from([Buffer.from(text, 'utf8')]), {
    onHeader: (cols) => {
      header = cols;
    },
    onRow: (row, line) => rows.push({ row, line }),
  });
  return { header, rows, result };
}

describe('readCsv', () => {
  it('strips a UTF-8 BOM and trims header names', async () => {
    const { header } = await read('﻿stop_id , stop_name\nA,Alpha\n');
    expect(header).toEqual(['stop_id', 'stop_name']);
  });

  it('handles CRLF, quoted commas and escaped quotes', async () => {
    const { rows } = await read('id,name\r\n1,"Beach, North"\r\n2,"Say ""hi"""\r\n');
    expect(rows.map((r) => r.row)).toEqual([
      ['1', 'Beach, North'],
      ['2', 'Say "hi"'],
    ]);
  });

  it('reads a last row without a trailing newline', async () => {
    const { rows, result } = await read('a,b\n1,2\n3,4');
    expect(rows.at(-1)?.row).toEqual(['3', '4']);
    expect(result.rowCount).toBe(2);
  });

  it('pads short rows and reports 1-based line numbers (header is line 1)', async () => {
    const { rows } = await read('a,b,c\n1\n\n2,3,4\n');
    expect(rows).toEqual([
      { row: ['1', '', ''], line: 2 },
      { row: ['2', '3', '4'], line: 3 },
    ]);
  });

  it('keeps non-ASCII text intact', async () => {
    const { rows } = await read('stop_name\nசென்னை கடற்கரை\n');
    expect(rows[0]?.row).toEqual(['சென்னை கடற்கரை']);
  });

  it('rejects an unterminated quote', async () => {
    await expect(read('a,b\n1,"oops\n')).rejects.toThrow();
  });
});
