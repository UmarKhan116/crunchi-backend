/**
 * Cache area cell: lat/lng rounded to 2 decimals (~1.1 km). Google is always
 * queried at the cell centre so everyone in the cell shares cached results;
 * distances are still measured from the caller's real position.
 */
export interface AreaCell {
  lat: number;
  lng: number;
  key: string;
}

export function areaCell(lat: number, lng: number): AreaCell {
  const rLat = Math.round(lat * 100) / 100;
  const rLng = Math.round(lng * 100) / 100;
  // + 0 turns -0 into 0 so the key is stable.
  return {
    lat: rLat + 0,
    lng: rLng + 0,
    key: `${(rLat + 0).toFixed(2)},${(rLng + 0).toFixed(2)}`,
  };
}

const RADIUS_BUCKETS_M = [1000, 2000, 5000, 8000, 16000, 24000, 32000, 48000];

/** Smallest bucket that covers the radius (max 48 km). */
export function radiusBucket(radiusM: number): number {
  return (
    RADIUS_BUCKETS_M.find((b) => b >= radiusM) ??
    RADIUS_BUCKETS_M[RADIUS_BUCKETS_M.length - 1]
  );
}

/** Lower-cased, trimmed, single-spaced, capped: one cache entry per query. */
export function normaliseQuery(text: string, max = 100): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, max);
}
