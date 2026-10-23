import { FcmMessage } from '../fcm.service';
import { PushPayload, PushType } from '../../entities/push-outbox.entity';

export const DEFAULT_PUSH_TITLE = 'Crunchii';

/** Android channels the app creates (contract: "Push and device tokens"). */
export const ANDROID_CHANNELS = {
  activity: 'activity',
  promotions: 'promotions',
} as const;

export function androidChannelFor(type: PushType | string): string {
  return type === 'broadcast'
    ? ANDROID_CHANNELS.promotions
    : ANDROID_CHANNELS.activity;
}

const present = (v: unknown) => v !== null && v !== undefined && v !== '';

/**
 * In-app path for a notification: `/p/:postId`, `/r/:placeId` or
 * `/u/:userId`. Follows open the follower's profile.
 */
export function linkFor(
  type: string,
  ids: { postId?: unknown; userId?: unknown; placeId?: unknown },
): string | null {
  if (type === 'follow' && present(ids.userId)) return `/u/${ids.userId}`;
  if (present(ids.postId)) return `/p/${ids.postId}`;
  if (present(ids.placeId))
    return `/r/${encodeURIComponent(String(ids.placeId))}`;
  if (present(ids.userId)) return `/u/${ids.userId}`;
  return null;
}

/** FCM data must be a flat map of strings; null/undefined keys are dropped. */
export function toFcmData(
  input: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    if (value === null || value === undefined) continue;
    out[key] =
      typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
  return out;
}

/**
 * The FCM message for one outbox job. `badge` is the user's real unread
 * count, read when the job is sent.
 */
export function buildFcmMessage(
  type: PushType | string,
  payload: PushPayload,
  badge: number,
): FcmMessage {
  return {
    notification: {
      title: payload.title || DEFAULT_PUSH_TITLE,
      body: payload.body,
    },
    data: toFcmData(payload.data),
    android: {
      priority: 'high',
      notification: { channelId: androidChannelFor(type), sound: 'default' },
    },
    apns: {
      payload: { aps: { sound: 'default', badge: Math.max(0, badge) } },
    },
  };
}
