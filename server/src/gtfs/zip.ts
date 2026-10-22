import { stat } from 'node:fs/promises';
import { Transform, type Readable, type TransformCallback } from 'node:stream';
import yauzl from 'yauzl';

export interface ZipLimits {
  maxCompressedBytes: number;
  maxUncompressedBytes: number;
  maxEntries: number;
  /** Uncompressed ÷ compressed, checked for the whole archive and for large entries. */
  maxRatio: number;
  /** Entries smaller than this are exempt from the per-entry ratio check (tiny files compress oddly). */
  ratioCheckMinBytes: number;
}

/** SPEC §5 zip safety: 200 MB compressed, 1.5 GB uncompressed, 100 entries, ratio ≤ 100×. */
export const DEFAULT_ZIP_LIMITS: ZipLimits = {
  maxCompressedBytes: 200 * 1024 * 1024,
  maxUncompressedBytes: 1.5 * 1024 * 1024 * 1024,
  maxEntries: 100,
  maxRatio: 100,
  ratioCheckMinBytes: 1024 * 1024,
};

export interface ZipEntryInfo {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  isDirectory: boolean;
}

export interface ZipInspection {
  compressedBytes: number;
  uncompressedBytes: number;
  entries: ZipEntryInfo[];
  violations: string[];
}

function decodeName(raw: Buffer, flags: number): string {
  // Bit 11 marks UTF-8 names; otherwise CP437, which matches latin1 for the ASCII range GTFS uses.
  return raw.toString((flags & 0x800) !== 0 ? 'utf8' : 'latin1');
}

/** Returns a reason if the entry name could escape the extraction directory. */
export function unsafeEntryNameReason(name: string): string | undefined {
  if (name.includes('\0')) return 'contains a NUL byte';
  if (name.startsWith('/') || name.startsWith('\\')) return 'is an absolute path';
  if (/^[A-Za-z]:/.test(name)) return 'has a drive letter';
  if (name.split(/[/\\]/).includes('..')) return 'contains a ".." path segment';
  return undefined;
}

function openZip(path: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(
      path,
      { lazyEntries: true, decodeStrings: false, autoClose: false, validateEntrySizes: true },
      (error, zipfile) => (error ? reject(error) : resolve(zipfile)),
    );
  });
}

function readEntries(zip: yauzl.ZipFile): Promise<yauzl.Entry[]> {
  return new Promise((resolve, reject) => {
    const entries: yauzl.Entry[] = [];
    zip.on('entry', (entry: yauzl.Entry) => {
      entries.push(entry);
      zip.readEntry();
    });
    zip.once('end', () => resolve(entries));
    zip.once('error', reject);
    zip.readEntry();
  });
}

function checkLimits(inspection: Omit<ZipInspection, 'violations'>, limits: ZipLimits): string[] {
  const violations: string[] = [];
  const { compressedBytes, uncompressedBytes, entries } = inspection;

  if (compressedBytes > limits.maxCompressedBytes) {
    violations.push(`archive is ${compressedBytes} bytes; limit is ${limits.maxCompressedBytes}`);
  }
  if (entries.length > limits.maxEntries) {
    violations.push(`archive has ${entries.length} entries; limit is ${limits.maxEntries}`);
  }
  if (uncompressedBytes > limits.maxUncompressedBytes) {
    violations.push(
      `archive expands to ${uncompressedBytes} bytes; limit is ${limits.maxUncompressedBytes}`,
    );
  }
  if (compressedBytes > 0 && uncompressedBytes / compressedBytes > limits.maxRatio) {
    violations.push(
      `archive compression ratio ${(uncompressedBytes / compressedBytes).toFixed(1)}× exceeds ${limits.maxRatio}×`,
    );
  }
  for (const entry of entries) {
    const reason = unsafeEntryNameReason(entry.name);
    if (reason) violations.push(`entry "${entry.name}" ${reason}`);
    if (entry.uncompressedSize >= limits.ratioCheckMinBytes) {
      const ratio = entry.uncompressedSize / Math.max(entry.compressedSize, 1);
      if (ratio > limits.maxRatio) {
        violations.push(
          `entry "${entry.name}" compression ratio ${ratio.toFixed(1)}× exceeds ${limits.maxRatio}×`,
        );
      }
    }
  }
  return violations;
}

/** Counts bytes as they stream and fails once the archive-wide uncompressed budget is exceeded. */
class ByteBudget extends Transform {
  constructor(
    private readonly budget: { remaining: number },
    private readonly entryName: string,
  ) {
    super();
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, done: TransformCallback): void {
    this.budget.remaining -= chunk.length;
    if (this.budget.remaining < 0) {
      done(
        new Error(`zip safety: uncompressed size limit exceeded while reading ${this.entryName}`),
      );
      return;
    }
    done(null, chunk);
  }
}

export interface SafeZip {
  inspection: ZipInspection;
  /** Root-level file names, e.g. `stops.txt`. */
  files: string[];
  open(name: string): Promise<Readable>;
  close(): void;
}

/**
 * Opens a zip only if it passes every safety check. The central directory is checked first
 * (sizes, entry count, names, ratios); actual bytes are also counted while streaming, since
 * declared sizes can lie. If any check fails, `zip` is null and `violations` says why.
 */
export async function openSafeZip(
  path: string,
  limits: ZipLimits = DEFAULT_ZIP_LIMITS,
): Promise<{ zip: SafeZip | null; inspection: ZipInspection }> {
  const compressedBytes = (await stat(path)).size;
  if (compressedBytes > limits.maxCompressedBytes) {
    const inspection = {
      compressedBytes,
      uncompressedBytes: 0,
      entries: [],
      violations: [`archive is ${compressedBytes} bytes; limit is ${limits.maxCompressedBytes}`],
    };
    return { zip: null, inspection };
  }

  let zipfile: yauzl.ZipFile;
  let rawEntries: yauzl.Entry[];
  try {
    zipfile = await openZip(path);
    rawEntries = await readEntries(zipfile);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      zip: null,
      inspection: {
        compressedBytes,
        uncompressedBytes: 0,
        entries: [],
        violations: [`not a readable zip archive: ${message}`],
      },
    };
  }

  const byName = new Map<string, yauzl.Entry>();
  const entries: ZipEntryInfo[] = rawEntries.map((entry) => {
    const name = decodeName(entry.fileName as unknown as Buffer, entry.generalPurposeBitFlag);
    byName.set(name, entry);
    return {
      name,
      compressedSize: entry.compressedSize,
      uncompressedSize: entry.uncompressedSize,
      isDirectory: name.endsWith('/'),
    };
  });
  const uncompressedBytes = entries.reduce((sum, e) => sum + e.uncompressedSize, 0);
  const base = { compressedBytes, uncompressedBytes, entries };
  const violations = checkLimits(base, limits);
  const inspection: ZipInspection = { ...base, violations };

  if (violations.length > 0) {
    zipfile.close();
    return { zip: null, inspection };
  }

  const budget = { remaining: limits.maxUncompressedBytes };
  const zip: SafeZip = {
    inspection,
    files: entries.filter((e) => !e.isDirectory && !/[/\\]/.test(e.name)).map((e) => e.name),
    open: (name) =>
      new Promise((resolve, reject) => {
        const entry = byName.get(name);
        if (!entry) {
          reject(new Error(`no entry named ${name}`));
          return;
        }
        zipfile.openReadStream(entry, (error, stream) => {
          if (error) {
            reject(error);
            return;
          }
          // pipe() does not forward errors; without this a size mismatch would hang the reader.
          const counted = new ByteBudget(budget, name);
          stream.on('error', (streamError) => counted.destroy(streamError));
          resolve(stream.pipe(counted));
        });
      }),
    close: () => zipfile.close(),
  };
  return { zip, inspection };
}
