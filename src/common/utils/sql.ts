/**
 * Rows from a raw `query()` with RETURNING. TypeORM's Postgres driver
 * returns plain rows for INSERT but `[rows, rowCount]` for UPDATE/DELETE.
 */
export function returnedRows<T = any>(result: any): T[] {
  if (
    Array.isArray(result) &&
    result.length === 2 &&
    Array.isArray(result[0]) &&
    typeof result[1] === 'number'
  ) {
    return result[0];
  }
  return Array.isArray(result) ? result : [];
}

/** Positive integer id from a route param, or null. */
export function parseId(value: unknown): number | null {
  const s = String(value ?? '');
  if (!/^\d{1,10}$/.test(s)) return null;
  const n = Number(s);
  return n > 0 && n <= 2147483647 ? n : null;
}
