/**
 * The legacy feature modules register JwtModule with
 * `process.env.JWT_SECRET || '<fallback>'` while their files are being
 * imported, which happens before ConfigModule.forRoot() loads `.env`.
 * Tokens they sign therefore use the JWT_SECRET from the real process
 * environment, or the hardcoded fallback when there is none.
 *
 * This file is imported first by app.module.ts so the snapshot below is taken
 * in the same phase. The shared guard accepts exactly what the legacy
 * endpoints accept, so switching an endpoint to the guard never logs anyone
 * out. Secret rotation (and fixing the load order) is a separate task.
 */
export const LEGACY_JWT_FALLBACK_SECRET =
  'crunchy-super-secret-jwt-key-change-in-production-2024';

export const LEGACY_JWT_SECRET =
  process.env.JWT_SECRET || LEGACY_JWT_FALLBACK_SECRET;
