import { buildMediaUrl } from './public-url';

/**
 * Fields of a `users` row that may be shown to other people. Everything else
 * (email, password hash, reset tokens, device token, social id/provider,
 * app_settings) is dropped. A whitelist, so new columns stay private by
 * default.
 */
const SAFE_USER_FIELDS = [
  'id',
  'full_name',
  'user_name',
  'profile_picture',
  'bio',
  'location',
  'is_active',
  'is_verified',
  'created_at',
  'updated_at',
] as const;

/**
 * Legacy-shaped user for responses about other people (feed, posts, search,
 * other profiles). Keeps the `image` alias the old app reads.
 */
export function toSafeUser<T extends Record<string, any>>(
  user: T | null | undefined,
): Record<string, any> | null | undefined {
  if (!user) return user;
  const safe: Record<string, any> = {};
  for (const key of SAFE_USER_FIELDS) {
    if (key in user) safe[key] = user[key];
  }
  if ('profile_picture' in user || 'image' in user) {
    safe.image = user.profile_picture ?? user.image ?? null;
  }
  return safe;
}

/** Contract `PublicUser`. Never contains email, password, tokens or social ids. */
export interface PublicUser {
  id: string;
  userName: string;
  fullName: string;
  avatarUrl: string | null;
}

export function toPublicUser(
  user: {
    id: number;
    user_name?: string | null;
    full_name?: string | null;
    profile_picture?: string | null;
  },
  baseUrl: string,
): PublicUser {
  return {
    id: String(user.id),
    userName: user.user_name ?? '',
    fullName: user.full_name ?? '',
    avatarUrl: buildMediaUrl(baseUrl, 'user', user.profile_picture),
  };
}
