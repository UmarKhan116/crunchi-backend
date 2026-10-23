import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Category } from '../../entities/category.entity';
import { UserSetting } from '../../entities/user-setting.entity';
import { FeedItem, PlaceSummary } from '../../common/contract/types';
import { Paginated } from '../../common/http/api-envelope';
import { haversineMetres } from '../../common/utils/geo';
import { PostQueryService } from '../../posts/post-query.service';
import {
  POST_PRESENTER_RELATIONS,
  PostPresenter,
} from '../../posts/post-presenter.service';
import { GooglePlace } from '../google/google-places.types';
import { areaCell, radiusBucket } from '../area-cell';
import {
  ALL_RESTAURANTS,
  GoogleCategoryQuery,
  googleQueryForCategory,
} from '../category-mapping';
import { isFeedWorthy, toPlaceSummary } from '../place-mapper';
import { PlacesService, RequestContext } from '../places.service';
import {
  FEED_DEFAULT_LIMIT,
  FEED_DEFAULT_RADIUS_M,
  FEED_MAX_LIMIT,
  FEED_MAX_RADIUS_M,
  FEED_PHOTOS,
  GOOGLE_MAX_PAGES,
} from '../places.constants';
import {
  decodeFeedCursor,
  encodeFeedCursor,
  interleave,
  Labelled,
  mergePlaces,
} from './feed-merge';

export interface FeedQuery {
  lat: number;
  lng: number;
  radiusM?: number;
  /** Category ids; undefined/empty = the user's selected categories, or all. */
  categories?: number[];
  openNow?: boolean;
  cursor?: string;
  limit?: number;
}

interface FeedCategory extends GoogleCategoryQuery {
  label: string | null;
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), max);

/**
 * GET /api/feed: Google places (one cached Nearby Search per category and
 * area cell, deduped, round-robin across categories) interleaved with
 * Crunchii posts (SQL distance filter, newest first): 1 post after every
 * 2 places. Ads are inserted by the app.
 */
@Injectable()
export class FeedService {
  constructor(
    private readonly places: PlacesService,
    private readonly postQuery: PostQueryService,
    private readonly presenter: PostPresenter,
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
    @InjectRepository(UserSetting)
    private readonly userSettings: Repository<UserSetting>,
  ) {}

  async feed(q: FeedQuery, ctx: RequestContext): Promise<Paginated<FeedItem>> {
    const limit = clamp(
      Math.trunc(q.limit ?? FEED_DEFAULT_LIMIT),
      1,
      FEED_MAX_LIMIT,
    );
    const radiusM = clamp(
      q.radiusM ?? FEED_DEFAULT_RADIUS_M,
      100,
      FEED_MAX_RADIUS_M,
    );
    const cursor = decodeFeedCursor(q.cursor);
    const openNow = !!q.openNow;
    const explicitCategories = !!q.categories?.length;
    const categories = await this.resolveCategories(q.categories, ctx.userId);

    // ---- places: merged pool, loading further Google pages only if needed
    const cell = areaCell(q.lat, q.lng);
    const bucket = radiusBucket(radiusM);
    const origin = { lat: q.lat, lng: q.lng };
    const keep = (p: GooglePlace) =>
      isFeedWorthy(p) &&
      !!p.photos?.length &&
      haversineMetres(
        q.lat,
        q.lng,
        p.geometry.location.lat,
        p.geometry.location.lng,
      ) <= radiusM;

    const levels: {
      results: GooglePlace[];
      label: string | null;
      next: boolean;
    }[][] = [];
    const loadLevel = async (page: number) => {
      const pages = await Promise.all(
        categories.map((c) =>
          page === 1 || levels[page - 2]?.[categories.indexOf(c)]?.next
            ? this.places.nearbyPage(c, cell, bucket, openNow, page)
            : Promise.resolve({ results: [], nextPageToken: null }),
        ),
      );
      levels.push(
        pages.map((p, i) => ({
          results: p.results,
          label: categories[i].label,
          next: !!p.nextPageToken,
        })),
      );
    };
    const canLoadMore = () =>
      levels.length < GOOGLE_MAX_PAGES &&
      levels[levels.length - 1].some((c) => c.next);

    for (let page = 1; page <= cursor.d; page++) await loadLevel(page);
    let pool: Labelled<GooglePlace>[] = mergePlaces(
      levels,
      (p) => p.place_id,
      keep,
    );
    while (pool.length < cursor.pl + limit && canLoadMore()) {
      await loadLevel(levels.length + 1);
      pool = mergePlaces(levels, (p) => p.place_id, keep);
    }
    const placeWindow = pool.slice(cursor.pl, cursor.pl + limit);

    // ---- posts: SQL distance filter, newest first, one extra row = "more"
    const postRows = await this.postQuery.findNearbyIds({
      lat: q.lat,
      lng: q.lng,
      radiusM,
      categoryIds: explicitCategories ? q.categories : undefined,
      offset: cursor.po,
      limit: limit + 1,
    });
    const postWindow = postRows.slice(0, limit);

    const mixed = interleave(placeWindow, postWindow, limit, cursor.sp);

    // ---- hydrate only what is shown
    const shownPlaces = mixed.items
      .filter((i) => i.kind === 'place')
      .map((i) => i.value as Labelled<GooglePlace>);
    const summaries = await this.places.enrich(
      shownPlaces.map(({ item, label }) =>
        toPlaceSummary(item, {
          baseUrl: ctx.baseUrl,
          maxPhotos: FEED_PHOTOS,
          categoryLabel: label,
          origin,
        }),
      ),
      ctx.userId,
    );
    const summaryById = new Map<string, PlaceSummary>(
      summaries.map((s) => [s.placeId, s]),
    );

    const shownPostRows = mixed.items
      .filter((i) => i.kind === 'post')
      .map((i) => i.value as { id: number; distanceM: number | null });
    const posts = await this.postQuery.loadInOrder(
      shownPostRows.map((r) => r.id),
      POST_PRESENTER_RELATIONS,
    );
    const contractPosts = await this.presenter.present(posts, {
      baseUrl: ctx.baseUrl,
      userId: ctx.userId,
      distanceById: new Map(shownPostRows.map((r) => [r.id, r.distanceM])),
      placeById: await this.places.cachedPostPlaces(
        posts.map((p) => p.restaurant?.google_place_id).filter(Boolean),
        ctx.baseUrl,
      ),
    });
    const postById = new Map(contractPosts.map((p) => [p.postId, p]));

    const items: FeedItem[] = [];
    for (const entry of mixed.items) {
      if (entry.kind === 'place') {
        const place = summaryById.get(
          (entry.value as Labelled<GooglePlace>).item.place_id,
        );
        if (place)
          items.push({ kind: 'place', id: `place:${place.placeId}`, place });
      } else {
        const post = postById.get(String((entry.value as { id: number }).id));
        // A post can vanish between the id query and the load; skip it.
        if (post) items.push({ kind: 'post', id: `post:${post.postId}`, post });
      }
    }

    // ---- next cursor
    const next = {
      v: 1 as const,
      pl: cursor.pl + mixed.usedPlaces,
      po: cursor.po + mixed.usedPosts,
      sp: mixed.placesSincePost,
      d: Math.max(levels.length, 1),
    };
    const placesLeft = pool.length > next.pl || canLoadMore();
    const postsLeft = postRows.length > mixed.usedPosts;
    return {
      items,
      nextCursor: placesLeft || postsLeft ? encodeFeedCursor(next) : null,
    };
  }

  /**
   * Explicit ids win; otherwise the user's selected categories
   * (user_settings.favorite_categories); otherwise every active category.
   */
  private async resolveCategories(
    ids: number[] | undefined,
    userId?: number | null,
  ): Promise<FeedCategory[]> {
    let wanted = ids?.length ? ids : null;
    if (!wanted && userId) {
      const settings = await this.userSettings.findOne({
        where: { user_id: userId },
      });
      const selected = (settings?.favorite_categories ?? [])
        .map(Number)
        .filter((n) => Number.isInteger(n));
      if (selected.length) wanted = selected;
    }
    const rows = await this.categories.find({
      where: wanted ? { id: In(wanted), is_active: true } : { is_active: true },
      order: { id: 'ASC' },
    });
    const list = rows.map((c) => ({
      ...googleQueryForCategory(c.name),
      label: c.name,
    }));
    // Same Google query twice would only cost twice; keep the first label.
    const unique = new Map<string, FeedCategory>();
    for (const c of list) {
      const key = `${c.googleType}|${c.keyword}`;
      if (!unique.has(key)) unique.set(key, c);
    }
    return unique.size
      ? [...unique.values()]
      : [{ ...ALL_RESTAURANTS, label: null }];
  }
}
