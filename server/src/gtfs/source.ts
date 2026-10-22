import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { DEFAULT_ZIP_LIMITS, openSafeZip, type ZipInspection, type ZipLimits } from './zip.js';

/** A GTFS feed as a set of root-level `.txt` files, from a zip or a directory. */
export interface FeedSource {
  readonly label: string;
  readonly files: readonly string[];
  open(name: string): Promise<Readable>;
  close(): void;
}

export async function openDirectorySource(dir: string): Promise<FeedSource> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = entries.filter((e) => e.isFile() && e.name.endsWith('.txt')).map((e) => e.name);
  return {
    label: dir,
    files,
    open: (name) => Promise.resolve(createReadStream(join(dir, name))),
    close: () => undefined,
  };
}

export interface OpenedSource {
  source: FeedSource | null;
  /** Present for zip sources. If it lists violations, `source` is null. */
  zip?: ZipInspection;
}

/** Opens a directory or a zip. A zip that fails a safety check is not opened at all. */
export async function openFeedSource(
  path: string,
  limits: ZipLimits = DEFAULT_ZIP_LIMITS,
): Promise<OpenedSource> {
  if ((await stat(path)).isDirectory()) {
    return { source: await openDirectorySource(path) };
  }
  const { zip, inspection } = await openSafeZip(path, limits);
  if (!zip) return { source: null, zip: inspection };
  return {
    source: {
      label: path,
      files: zip.files.filter((f) => f.endsWith('.txt')),
      open: (name) => zip.open(name),
      close: () => zip.close(),
    },
    zip: inspection,
  };
}
