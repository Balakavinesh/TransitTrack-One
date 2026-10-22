const EARTH_RADIUS_M = 6_371_008.8;

/** Great-circle distance in metres. */
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

export interface BBox {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

/** SPEC §5 default: the Chennai region. */
export const CHENNAI_BBOX: BBox = { minLat: 12.4, minLon: 79.6, maxLat: 13.6, maxLon: 80.6 };

export function inBBox(lat: number, lon: number, box: BBox): boolean {
  return lat >= box.minLat && lat <= box.maxLat && lon >= box.minLon && lon <= box.maxLon;
}

/** Parses `minLat,minLon,maxLat,maxLon`. */
export function parseBBox(value: string): BBox | null {
  const parts = value.split(',').map((p) => Number(p.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [minLat = 0, minLon = 0, maxLat = 0, maxLon = 0] = parts;
  if (minLat >= maxLat || minLon >= maxLon) return null;
  return { minLat, minLon, maxLat, maxLon };
}
