import { SNAPSHOT_FORMAT } from './snapshot.js';
import type { Snapshot, SnapshotHeader } from './types.js';

/**
 * File layout (little-endian):
 *   8 bytes  magic "TTSNAP01"
 *   4 bytes  header length H
 *   H bytes  UTF-8 JSON: SnapshotHeader + `arrays` [{ name, type, offset, length }]
 *   …        zero padding to a multiple of 8, then each typed array's bytes, each 8-aligned
 */
const MAGIC = Buffer.from('TTSNAP01', 'ascii');

const ARRAY_TYPES = {
  Float64Array,
  Int32Array,
  Int16Array,
  Int8Array,
  Uint8Array,
} as const;
type ArrayTypeName = keyof typeof ARRAY_TYPES;
type AnyTypedArray = InstanceType<(typeof ARRAY_TYPES)[ArrayTypeName]>;

const ARRAY_FIELDS = [
  'stopLat',
  'stopLon',
  'stopAgency',
  'stopParent',
  'stopLocationType',
  'routeAgency',
  'routeType',
  'tripRoute',
  'tripService',
  'tripHasShape',
  'tripDirection',
  'patternRoute',
  'patternStopOffset',
  'patternStops',
  'patternTripOffset',
  'patternTrips',
  'patternTimeOffset',
  'arrival',
  'departure',
  'stopPatternOffset',
  'stopPatterns',
  'stopPatternPos',
  'footOffset',
  'footTo',
  'footSec',
  'footMeters',
  'footKind',
  'footPublished',
  'stopMinTransferSec',
  'stopTransferForbidden',
  'ruleOffset',
  'ruleFromStop',
  'ruleFromRoute',
  'ruleToRoute',
  'ruleType',
  'ruleMinSec',
  'ruleConservative',
  'serviceAgency',
  'serviceCovered',
  'serviceProjected',
  'agencyDayStatus',
  'agencyDayProjectedFrom',
] as const satisfies readonly (keyof Snapshot)[];

interface ArrayEntry {
  name: (typeof ARRAY_FIELDS)[number];
  type: ArrayTypeName;
  offset: number;
  length: number;
}

const pad8 = (n: number) => (n + 7) & ~7;

export function serializeSnapshot(snapshot: Snapshot): Buffer {
  const entries: ArrayEntry[] = [];
  let offset = 0;
  for (const name of ARRAY_FIELDS) {
    const array = snapshot[name] as AnyTypedArray;
    entries.push({
      name,
      type: array.constructor.name as ArrayTypeName,
      offset,
      length: array.length,
    });
    offset = pad8(offset + array.byteLength);
  }
  const header = Buffer.from(JSON.stringify({ ...snapshot.header, arrays: entries }), 'utf8');
  const dataStart = pad8(MAGIC.length + 4 + header.length);
  const out = Buffer.alloc(dataStart + offset);
  MAGIC.copy(out, 0);
  out.writeUInt32LE(header.length, MAGIC.length);
  header.copy(out, MAGIC.length + 4);
  for (const entry of entries) {
    const array = snapshot[entry.name] as AnyTypedArray;
    Buffer.from(array.buffer, array.byteOffset, array.byteLength).copy(
      out,
      dataStart + entry.offset,
    );
  }
  return out;
}

export class SnapshotFormatError extends Error {}

/** Reads a snapshot file; copies each array so alignment never depends on the Buffer pool. */
export function deserializeSnapshot(buffer: Buffer): Snapshot {
  if (buffer.length < 12 || !buffer.subarray(0, 8).equals(MAGIC)) {
    throw new SnapshotFormatError('not a TransitTrack router snapshot');
  }
  const headerLength = buffer.readUInt32LE(8);
  if (12 + headerLength > buffer.length) throw new SnapshotFormatError('truncated header');
  const parsed = JSON.parse(
    buffer.subarray(12, 12 + headerLength).toString('utf8'),
  ) as SnapshotHeader & {
    arrays: ArrayEntry[];
  };
  if (parsed.format !== SNAPSHOT_FORMAT) {
    throw new SnapshotFormatError(`snapshot format ${parsed.format}, expected ${SNAPSHOT_FORMAT}`);
  }
  const dataStart = pad8(12 + headerLength);
  const { arrays, ...header } = parsed;
  const out: Record<string, unknown> = { header };
  for (const name of ARRAY_FIELDS) {
    const entry = arrays.find((a) => a.name === name);
    const Type = entry && ARRAY_TYPES[entry.type];
    if (!entry || !Type) throw new SnapshotFormatError(`missing array ${name}`);
    const bytes = entry.length * Type.BYTES_PER_ELEMENT;
    const start = dataStart + entry.offset;
    if (start + bytes > buffer.length) throw new SnapshotFormatError(`truncated array ${name}`);
    const copy = new Uint8Array(bytes);
    copy.set(buffer.subarray(start, start + bytes));
    out[name] = new Type(copy.buffer);
  }
  return out as unknown as Snapshot;
}

/** Parses only the JSON header from the first bytes of a snapshot file (no arrays). */
export function parseSnapshotHeader(
  prefix: Buffer,
  readMore?: (length: number) => Buffer,
): SnapshotHeader {
  if (prefix.length < 12 || !prefix.subarray(0, 8).equals(MAGIC)) {
    throw new SnapshotFormatError('not a TransitTrack router snapshot');
  }
  const length = prefix.readUInt32LE(8);
  const bytes = prefix.length >= 12 + length ? prefix : readMore?.(12 + length);
  if (!bytes || bytes.length < 12 + length) throw new SnapshotFormatError('truncated header');
  const header = JSON.parse(bytes.subarray(12, 12 + length).toString('utf8')) as SnapshotHeader & {
    arrays?: unknown;
  };
  delete header.arrays;
  return header;
}
