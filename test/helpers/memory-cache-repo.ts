/* Test helper only (not part of the build). */
/**
 * In-memory stand-in for Repository<PlaceCacheEntry> that understands the
 * MoreThan / LessThan / In operators PlaceCacheService uses.
 */
export function memoryCacheRepo() {
  const rows = new Map<string, any>();
  const live = (row: any, where: any) =>
    row && row.expires_at.getTime() > where.expires_at.value.getTime();
  return {
    rows,
    findOne: jest.fn(async ({ where }) => {
      const row = rows.get(where.key);
      return live(row, where) ? row : null;
    }),
    find: jest.fn(async ({ where }) =>
      (where.key.value as string[])
        .map((k) => rows.get(k))
        .filter((r) => live(r, where)),
    ),
    upsert: jest.fn(async (row: any) => {
      rows.set(
        row.key,
        JSON.parse(JSON.stringify({ ...row, expires_at: undefined })),
      );
      rows.get(row.key).expires_at = row.expires_at;
    }),
    delete: jest.fn(async ({ expires_at }) => {
      for (const [k, r] of rows) {
        if (r.expires_at.getTime() < expires_at.value.getTime()) rows.delete(k);
      }
    }),
  };
}
