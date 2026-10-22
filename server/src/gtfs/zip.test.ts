import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_VALIDATION_OPTIONS } from './rules/context.js';
import { buildZip, materializeFixture, zipDirectory, type ZipEntrySpec } from './testing.js';
import { validateGtfs } from './validate.js';
import { DEFAULT_ZIP_LIMITS, unsafeEntryNameReason, type ZipLimits } from './zip.js';

const ctx = { ...DEFAULT_VALIDATION_OPTIONS, importDate: '2026-10-19' };
let dir: string;
let validZip: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gtfs-zip-'));
  const fixture = await materializeFixture('valid-minimal');
  validZip = join(dir, 'valid.zip');
  await zipDirectory(fixture.dir, validZip);
  await fixture.cleanup();
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function zipWith(entries: ZipEntrySpec[], name: string): Promise<string> {
  const path = join(dir, name);
  await writeFile(path, buildZip(entries));
  return path;
}

async function unsafeMessages(path: string, limits: Partial<ZipLimits> = {}) {
  const result = await validateGtfs(path, ctx, { zipLimits: { ...DEFAULT_ZIP_LIMITS, ...limits } });
  const finding = result.findings.find((f) => f.code === 'E_ZIP_UNSAFE');
  return { result, messages: finding?.samples.map((s) => s.message) ?? [] };
}

describe('zip sources', () => {
  it('validates a safe zip exactly like the directory it came from', async () => {
    const result = await validateGtfs(validZip, ctx);
    expect(result.findings).toEqual([]);
    expect(result.zip?.entries.length).toBe(11);
  });

  it.each([
    ['../evil.txt', 'contains a ".." path segment'],
    ['gtfs/../../evil.txt', 'contains a ".." path segment'],
    ['/etc/passwd', 'is an absolute path'],
    ['\\windows\\evil.txt', 'is an absolute path'],
    ['C:/evil.txt', 'has a drive letter'],
  ])('rejects entry %j (%s) without opening the feed', async (name, reason) => {
    const path = await zipWith(
      [{ name, data: 'x' }],
      `traversal-${reason.length}-${name.length}.zip`,
    );
    const { result, messages } = await unsafeMessages(path);
    expect(messages.join(' ')).toContain(reason);
    expect(result.feed).toBeNull();
    expect(result.status).toBe('failed');
  });

  it('accepts ordinary nested names (they are just not root-level files)', () => {
    expect(unsafeEntryNameReason('gtfs/stops.txt')).toBeUndefined();
    expect(unsafeEntryNameReason('stops..txt')).toBeUndefined();
  });

  it('rejects too many entries', async () => {
    const { messages } = await unsafeMessages(validZip, { maxEntries: 3 });
    expect(messages.join(' ')).toMatch(/11 entries; limit is 3/);
  });

  it('rejects an archive over the compressed size limit', async () => {
    const { messages } = await unsafeMessages(validZip, { maxCompressedBytes: 100 });
    expect(messages.join(' ')).toMatch(/limit is 100/);
  });

  it('rejects an archive whose declared expansion exceeds the limit', async () => {
    const { messages } = await unsafeMessages(validZip, { maxUncompressedBytes: 500 });
    expect(messages.join(' ')).toMatch(/expands to \d+ bytes; limit is 500/);
  });

  it('rejects a compression bomb (ratio > 100×)', async () => {
    const path = await zipWith(
      [{ name: 'stops.txt', data: Buffer.alloc(2 * 1024 * 1024) }],
      'bomb.zip',
    );
    const { messages } = await unsafeMessages(path);
    expect(messages.join(' ')).toMatch(/compression ratio [\d.]+× exceeds 100×/);
  });

  it('catches entries that expand beyond their declared size while streaming', async () => {
    const path = await zipWith(
      [
        {
          name: 'agency.txt',
          data: 'agency_name,agency_url,agency_timezone\n' + 'x,y,z\n'.repeat(5000),
          declaredUncompressedSize: 10,
        },
      ],
      'liar.zip',
    );
    const { result } = await unsafeMessages(path);
    expect(result.findings.map((f) => f.code)).toContain('E_ZIP_UNSAFE');
  });

  it('reports a file that is not a zip at all', async () => {
    const path = join(dir, 'garbage.zip');
    await writeFile(path, 'this is not a zip');
    const { messages } = await unsafeMessages(path);
    expect(messages.join(' ')).toMatch(/not a readable zip archive/);
  });
});
