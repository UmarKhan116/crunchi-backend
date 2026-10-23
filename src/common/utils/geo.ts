const EARTH_RADIUS_M = 6371000;
const METRES_PER_DEGREE_LAT = 111320;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversineMetres(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(Math.min(1, a)));
}

/**
 * Lat/lng box that contains the circle; a cheap, indexable prefilter before
 * the exact haversine check. Does not handle the ±180° meridian.
 */
export function boundingBox(lat: number, lng: number, radiusM: number) {
  const dLat = radiusM / METRES_PER_DEGREE_LAT;
  const cos = Math.max(Math.cos(toRad(lat)), 0.01);
  const dLng = radiusM / (METRES_PER_DEGREE_LAT * cos);
  return {
    minLat: lat - dLat,
    maxLat: lat + dLat,
    minLng: lng - dLng,
    maxLng: lng + dLng,
  };
}

/**
 * SQL haversine distance (metres) from (:lat, :lng) to the given columns.
 * The columns are DECIMAL, hence the float8 casts.
 */
export function haversineSql(latColumn: string, lngColumn: string): string {
  return (
    `(${2 * EARTH_RADIUS_M} * ASIN(SQRT(LEAST(1, ` +
    `POWER(SIN(RADIANS(${latColumn}::float8 - CAST(:lat AS float8)) / 2), 2) + ` +
    `COS(RADIANS(CAST(:lat AS float8))) * COS(RADIANS(${latColumn}::float8)) * ` +
    `POWER(SIN(RADIANS(${lngColumn}::float8 - CAST(:lng AS float8)) / 2), 2)))))`
  );
}
