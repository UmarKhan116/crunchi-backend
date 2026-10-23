import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  ContractPost,
  PlaceSummary,
  UserProfile,
  UserSearchItem,
} from '../common/contract/types';
import { Paginated } from '../common/http/api-envelope';
import {
  decodeCursor,
  encodeCursor,
  isNonNegativeInt,
} from '../common/utils/cursor';
import { toPublicUser } from '../common/utils/user-sanitizer';
import { returnedRows } from '../common/utils/sql';
import { PostQueryService } from '../posts/post-query.service';
import {
  POST_PRESENTER_RELATIONS,
  PostPresenter,
} from '../posts/post-presenter.service';
import { PlacesService, detailsCacheKey } from '../places/places.service';
import { PlaceCacheService } from '../places/place-cache.service';
import { GooglePlace } from '../places/google/google-places.types';
import { cityOf, photoProxyUrl, toPlaceSummary } from '../places/place-mapper';
import { FEED_PHOTOS } from '../places/places.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { displayName } from '../engagement/post-likes.service';

type OffsetCursor = { o: number };
const isOffsetCursor = (c: any): c is OffsetCursor =>
  c && isNonNegativeInt(c.o);

const num = (v: unknown): number | null =>
  v === null || v === undefined || v === '' ? null : Number(v);

/** Counts shared by search and profile (followers, posts, isFollowing). */
const COUNT_COLUMNS = `
  (SELECT COUNT(*)::int FROM follows f WHERE f.following_id = u.id) AS followers_count,
  (SELECT COUNT(*)::int FROM posts p WHERE p.user_id = u.id AND p.is_active) AS posts_count,
  EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = $1 AND f.following_id = u.id) AS is_following`;

/** Public user endpoints: search, profiles, a user's posts and saved places, follow. */
@Injectable()
export class UsersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly postQuery: PostQueryService,
    private readonly presenter: PostPresenter,
    private readonly places: PlacesService,
    private readonly cache: PlaceCacheService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Active user row or 404. */
  private async activeUser(userId: number) {
    const [user] = await this.dataSource.query(
      `SELECT id FROM users WHERE id = $1 AND is_active`,
      [userId],
    );
    if (!user) throw new NotFoundException('User not found');
  }

  async search(
    viewerId: number,
    q: string | undefined,
    cursor: string | undefined,
    limit: number,
    baseUrl: string,
  ): Promise<Paginated<UserSearchItem>> {
    const state = decodeCursor(cursor, isOffsetCursor) ?? { o: 0 };
    const term = (q ?? '').trim();
    if (!term) return { items: [], nextCursor: null };
    const escaped = term.replace(/[\\%_]/g, '\\$&');
    // userName / fullName only (never email); prefix matches first.
    const rows = await this.dataSource.query(
      `SELECT u.id, u.user_name, u.full_name, u.profile_picture, ${COUNT_COLUMNS},
              (u.user_name ILIKE $3 OR u.full_name ILIKE $3) AS prefix_match
         FROM users u
        WHERE u.is_active
          AND (u.user_name ILIKE $2 OR u.full_name ILIKE $2)
        ORDER BY prefix_match DESC, u.id ASC
        OFFSET $4 LIMIT $5`,
      [viewerId, `%${escaped}%`, `${escaped}%`, state.o, limit + 1],
    );
    return {
      items: rows.slice(0, limit).map((r) => ({
        ...toPublicUser(r, baseUrl),
        followersCount: r.followers_count,
        postsCount: r.posts_count,
        isFollowing: r.is_following,
      })),
      nextCursor:
        rows.length > limit ? encodeCursor({ o: state.o + limit }) : null,
    };
  }

  async profile(
    userId: number,
    viewerId: number | null | undefined,
    baseUrl: string,
  ): Promise<UserProfile> {
    const [r] = await this.dataSource.query(
      `SELECT u.id, u.user_name, u.full_name, u.profile_picture, u.bio, ${COUNT_COLUMNS},
              (SELECT COUNT(*)::int FROM follows f WHERE f.follower_id = u.id) AS following_count
         FROM users u
        WHERE u.id = $2 AND u.is_active`,
      [viewerId ?? null, userId],
    );
    if (!r) throw new NotFoundException('User not found');
    return {
      ...toPublicUser(r, baseUrl),
      bio: r.bio || null,
      followersCount: r.followers_count,
      followingCount: r.following_count,
      postsCount: r.posts_count,
      isFollowing: !!viewerId && r.is_following,
      isMe: !!viewerId && viewerId === userId,
    };
  }

  async posts(
    userId: number,
    viewerId: number | null | undefined,
    cursor: string | undefined,
    limit: number,
    baseUrl: string,
  ): Promise<Paginated<ContractPost>> {
    await this.activeUser(userId);
    const state = decodeCursor(cursor, isOffsetCursor) ?? { o: 0 };
    const rows = await this.dataSource.query(
      `SELECT id FROM posts WHERE user_id = $1 AND is_active
        ORDER BY created_at DESC, id DESC OFFSET $2 LIMIT $3`,
      [userId, state.o, limit + 1],
    );
    const ids = rows.slice(0, limit).map((r) => Number(r.id));
    const posts = await this.postQuery.loadInOrder(
      ids,
      POST_PRESENTER_RELATIONS,
    );
    const placeIds = posts
      .map((p) => p.restaurant?.google_place_id)
      .filter(Boolean);
    const items = await this.presenter.present(posts, {
      baseUrl,
      userId: viewerId,
      placeById: await this.places.cachedPostPlaces(placeIds, baseUrl),
    });
    return {
      items,
      nextCursor:
        rows.length > limit ? encodeCursor({ o: state.o + limit }) : null,
    };
  }

  /**
   * Saved restaurants, most recently saved first. Built from the
   * restaurants table, upgraded with the details cache when it has the
   * place; never calls Google.
   */
  async favorites(
    userId: number,
    viewerId: number | null | undefined,
    cursor: string | undefined,
    limit: number,
    baseUrl: string,
  ): Promise<Paginated<PlaceSummary>> {
    await this.activeUser(userId);
    const state = decodeCursor(cursor, isOffsetCursor) ?? { o: 0 };
    const rows: any[] = await this.dataSource.query(
      `SELECT DISTINCT ON (s.place_id) s.place_id, s.saved_at, r.*
         FROM (SELECT r.google_place_id AS place_id, MAX(f.created_at) AS saved_at,
                      MIN(r.id) AS rid
                 FROM favorites f JOIN restaurants r ON r.id = f.restaurant_id
                WHERE f.user_id = $1 AND COALESCE(r.google_place_id, '') <> ''
                GROUP BY r.google_place_id
                ORDER BY saved_at DESC, place_id
               OFFSET $2 LIMIT $3) s
         JOIN restaurants r ON r.id = s.rid`,
      [userId, state.o, limit + 1],
    );
    rows.sort(
      (a, b) =>
        new Date(b.saved_at).getTime() - new Date(a.saved_at).getTime() ||
        String(a.place_id).localeCompare(String(b.place_id)),
    );
    const page = rows.slice(0, limit);
    const cached = await this.cache.getMany<{ place: GooglePlace | null }>(
      page.map((r) => detailsCacheKey(r.place_id)),
    );

    const summaries = page.map((r): PlaceSummary => {
      const place = cached.get(detailsCacheKey(r.place_id))?.place;
      if (place) {
        return {
          ...toPlaceSummary(place, { baseUrl, maxPhotos: FEED_PHOTOS }),
          placeId: r.place_id,
        };
      }
      const address: string | null = r.address ?? null;
      const parts = address?.split(',') ?? [];
      return {
        placeId: r.place_id,
        name: r.name ?? '',
        rating: num(r.google_rating),
        userRatingsTotal: null,
        address,
        city: address
          ? cityOf(
              (parts.length >= 3
                ? { formatted_address: address }
                : { vicinity: address }) as GooglePlace,
            )
          : null,
        lat: num(r.latitude) ?? 0,
        lng: num(r.longitude) ?? 0,
        categoryLabel: null,
        priceLevel: num(r.price_level),
        photos: r.google_photo_reference
          ? [
              {
                ref: r.google_photo_reference,
                url: photoProxyUrl(baseUrl, r.google_photo_reference),
                width: null,
                height: null,
              },
            ]
          : [],
        openingHours: r.opening_periods ?? null,
        utcOffsetMinutes: r.utc_offset_minutes ?? null,
        distanceM: null,
        likesCount: 0,
        isLiked: false,
        isFavorite: false,
      };
    });
    return {
      items: await this.places.enrich(summaries, viewerId),
      nextCursor:
        rows.length > limit ? encodeCursor({ o: state.o + limit }) : null,
    };
  }

  /** PUT /api/users/:userId/follow: set state; notify only on a new follow. */
  async setFollowing(
    viewerId: number,
    userId: number,
    following: boolean,
  ): Promise<{ following: boolean; followersCount: number }> {
    if (viewerId === userId) {
      throw new BadRequestException("You can't follow yourself");
    }
    await this.activeUser(userId);
    const changed = following
      ? returnedRows(
          await this.dataSource.query(
            `INSERT INTO follows (follower_id, following_id) VALUES ($1, $2)
             ON CONFLICT (follower_id, following_id) DO NOTHING RETURNING id`,
            [viewerId, userId],
          ),
        ).length > 0
      : false;
    if (!following) {
      await this.dataSource.query(
        `DELETE FROM follows WHERE follower_id = $1 AND following_id = $2`,
        [viewerId, userId],
      );
    }
    if (changed) {
      const [me] = await this.dataSource.query(
        `SELECT full_name, user_name FROM users WHERE id = $1`,
        [viewerId],
      );
      await this.notifications.createNotification(
        userId,
        'follow',
        `${displayName(me)} started following you`,
        { follower_id: viewerId, actor_user_id: viewerId },
        viewerId,
      );
    }
    const [{ n }] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS n FROM follows WHERE following_id = $1`,
      [userId],
    );
    return { following, followersCount: n };
  }
}
