import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Restaurant } from '../entities/restaurant.entity';
import {
  ContractPost,
  OpeningHours,
  PlaceDetails,
  PlaceSummary,
  PostPlace,
} from '../common/contract/types';
import { Paginated } from '../common/http/api-envelope';
import {
  decodeCursor,
  encodeCursor,
  isNonNegativeInt,
} from '../common/utils/cursor';
import { PostQueryService } from '../posts/post-query.service';
import {
  POST_PRESENTER_RELATIONS,
  PostPresenter,
} from '../posts/post-presenter.service';
import { GooglePlacesClient } from './google/google-places.client';
import { GooglePage, GooglePlace } from './google/google-places.types';
import { PlaceCacheService } from './place-cache.service';
import { AreaCell, areaCell, normaliseQuery, radiusBucket } from './area-cell';
import { GoogleCategoryQuery } from './category-mapping';
import {
  DETAILS_FIELDS,
  DETAILS_PHOTOS,
  FEED_PHOTOS,
  GOOGLE_MAX_PAGES,
  TTL,
} from './places.constants';
import {
  mapOpeningHours,
  mapUtcOffset,
  toPlaceSummary,
  toPostPlace,
} from './place-mapper';

const PLACE_ID_PATTERN = /^[A-Za-z0-9_-]{4,512}$/;

export interface Origin {
  lat: number;
  lng: number;
}

export interface RequestContext {
  userId?: number | null;
  baseUrl: string;
}

interface DetailsPayload {
  place: GooglePlace | null;
}

export const detailsCacheKey = (placeId: string) => `details:v1:${placeId}`;

/** Only the fields we map; keeps cache rows small. */
function slimPlace(p: GooglePlace): GooglePlace {
  return {
    place_id: p.place_id,
    name: p.name,
    rating: p.rating,
    user_ratings_total: p.user_ratings_total,
    vicinity: p.vicinity,
    formatted_address: p.formatted_address,
    geometry: p.geometry?.location
      ? { location: p.geometry.location }
      : undefined,
    types: p.types,
    price_level: p.price_level,
    photos: p.photos?.slice(0, 1),
    opening_hours: p.opening_hours,
    business_status: p.business_status,
  };
}

const slimPage = (page: GooglePage): GooglePage => ({
  results: page.results.map(slimPlace),
  nextPageToken: page.nextPageToken,
});

/**
 * Places proxy: everything that needs Google goes through the Postgres cache
 * and GooglePlacesClient. Also adds the Crunchii side of a place (likes,
 * favourites, stored opening hours).
 */
@Injectable()
export class PlacesService {
  constructor(
    private readonly google: GooglePlacesClient,
    private readonly cache: PlaceCacheService,
    private readonly postQuery: PostQueryService,
    private readonly presenter: PostPresenter,
    @InjectRepository(Restaurant)
    private readonly restaurants: Repository<Restaurant>,
  ) {}

  assertPlaceId(placeId: string) {
    if (!PLACE_ID_PATTERN.test(placeId ?? '')) {
      throw new BadRequestException('Invalid place id');
    }
  }

  // ---------------------------------------------------------------- nearby

  /**
   * One Nearby Search page for (category, area cell, radius bucket, openNow).
   * Page n>1 follows page n-1's next_page_token, so it is only fetched when a
   * later feed page needs it. Cached 60 min.
   */
  nearbyPage(
    query: GoogleCategoryQuery,
    cell: AreaCell,
    bucketM: number,
    openNow: boolean,
    page: number,
  ): Promise<GooglePage> {
    const base =
      `nearby:v1:${query.googleType ?? ''}|${query.keyword ?? ''}:` +
      `${cell.key}:${bucketM}:${openNow ? 1 : 0}`;
    return this.pagedSearch('nearby', 'nearbysearch', base, page, () =>
      this.google.nearbySearch({
        lat: cell.lat,
        lng: cell.lng,
        radiusM: bucketM,
        type: query.googleType,
        keyword: query.keyword,
        openNow,
      }),
    );
  }

  private pagedSearch(
    kind: 'nearby' | 'text',
    endpoint: 'nearbysearch' | 'textsearch',
    baseKey: string,
    page: number,
    first: () => Promise<GooglePage>,
  ): Promise<GooglePage> {
    return this.cache.getOrFetch(
      `${baseKey}:p${page}`,
      kind,
      TTL[kind],
      async () => {
        if (page <= 1) return slimPage(await first());
        const previous = await this.pagedSearch(
          kind,
          endpoint,
          baseKey,
          page - 1,
          first,
        );
        if (!previous.nextPageToken)
          return { results: [], nextPageToken: null };
        return slimPage(
          await this.google.nextPage(endpoint, previous.nextPageToken),
        );
      },
    );
  }

  // --------------------------------------------------------------- details

  /** Place Details (explicit field list), cached 24 h. Null if Google has no such place. */
  async detailsRaw(placeId: string): Promise<GooglePlace | null> {
    this.assertPlaceId(placeId);
    const payload = await this.cache.getOrFetch<DetailsPayload>(
      detailsCacheKey(placeId),
      'details',
      TTL.details,
      async () => {
        const place = await this.google.details(placeId, DETAILS_FIELDS);
        if (place) await this.storeHours(placeId, place);
        return { place };
      },
    );
    return payload.place;
  }

  async details(
    placeId: string,
    ctx: RequestContext,
    origin?: Origin | null,
  ): Promise<PlaceDetails> {
    const place = await this.detailsRaw(placeId);
    if (!place) throw new NotFoundException('Place not found');
    const summary = toPlaceSummary(place, {
      baseUrl: ctx.baseUrl,
      maxPhotos: DETAILS_PHOTOS,
      origin,
    });
    const [enriched] = await this.enrich([summary], ctx.userId);
    return {
      ...enriched,
      phone: place.formatted_phone_number ?? null,
      website: place.website ?? null,
      mapsUrl: place.url ?? null,
      crunchiiReviewsCount: await this.postQuery.countByPlaceId(placeId),
    };
  }

  /** Keep the latest hours on our restaurant rows (for feeds after the cache expires). */
  private async storeHours(placeId: string, place: GooglePlace) {
    const hours = mapOpeningHours(place);
    const offset = mapUtcOffset(place);
    if (!hours && offset === null) return;
    await this.restaurants.query(
      `UPDATE restaurants
          SET opening_periods = $2::jsonb, utc_offset_minutes = $3, hours_updated_at = now()
        WHERE google_place_id = $1`,
      [placeId, hours ? JSON.stringify(hours) : null, offset],
    );
  }

  // ----------------------------------------------------------- place posts

  async placePosts(
    placeId: string,
    cursor: string | undefined,
    limit: number,
    ctx: RequestContext,
  ): Promise<Paginated<ContractPost>> {
    this.assertPlaceId(placeId);
    const state = decodeCursor<{ o: number }>(
      cursor,
      (c): c is { o: number } => c && isNonNegativeInt(c.o),
    ) ?? { o: 0 };
    const ids = await this.postQuery.findIdsByPlaceId(
      placeId,
      state.o,
      limit + 1,
    );
    const pageIds = ids.slice(0, limit);
    const posts = await this.postQuery.loadInOrder(
      pageIds,
      POST_PRESENTER_RELATIONS,
    );
    const items = await this.presenter.present(posts, {
      baseUrl: ctx.baseUrl,
      userId: ctx.userId,
      placeById: await this.cachedPostPlaces([placeId], ctx.baseUrl),
    });
    return {
      items,
      nextCursor:
        ids.length > limit ? encodeCursor({ o: state.o + limit }) : null,
    };
  }

  /** PostPlace from the details cache only (never calls Google). */
  async cachedPostPlaces(
    placeIds: string[],
    baseUrl: string,
  ): Promise<Map<string, PostPlace>> {
    const unique = [
      ...new Set(placeIds.filter((id) => PLACE_ID_PATTERN.test(id))),
    ];
    const cached = await this.cache.getMany<DetailsPayload>(
      unique.map(detailsCacheKey),
    );
    const out = new Map<string, PostPlace>();
    for (const id of unique) {
      const place = cached.get(detailsCacheKey(id))?.place;
      if (place) {
        out.set(
          id,
          toPostPlace(toPlaceSummary(place, { baseUrl, maxPhotos: 0 })),
        );
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- search

  async search(
    params: {
      query: string;
      lat?: number | null;
      lng?: number | null;
      radiusM?: number | null;
      openNow?: boolean;
      cursor?: string;
    },
    ctx: RequestContext,
  ): Promise<Paginated<PlaceSummary>> {
    const state = decodeCursor<{ p: number }>(
      params.cursor,
      (c): c is { p: number } =>
        c && Number.isInteger(c.p) && c.p >= 1 && c.p <= GOOGLE_MAX_PAGES,
    ) ?? { p: 1 };
    const query = normaliseQuery(params.query);
    if (!query) throw new BadRequestException('query is required');

    const hasLocation =
      Number.isFinite(params.lat) && Number.isFinite(params.lng);
    const cell = hasLocation ? areaCell(params.lat, params.lng) : null;
    const bucket =
      hasLocation && params.radiusM ? radiusBucket(params.radiusM) : null;
    const base =
      `text:v1:${query}:${cell?.key ?? 'none'}:${bucket ?? 'any'}:` +
      `${params.openNow ? 1 : 0}`;

    const page = await this.pagedSearch(
      'text',
      'textsearch',
      base,
      state.p,
      () =>
        this.google.textSearch({
          query,
          lat: cell?.lat,
          lng: cell?.lng,
          radiusM: bucket ?? undefined,
          openNow: params.openNow,
        }),
    );
    const origin = hasLocation ? { lat: params.lat, lng: params.lng } : null;
    const items = await this.enrich(
      page.results
        .filter((p) => p.place_id && p.geometry?.location)
        .map((p) =>
          toPlaceSummary(p, {
            baseUrl: ctx.baseUrl,
            maxPhotos: FEED_PHOTOS,
            origin,
          }),
        ),
      ctx.userId,
    );
    const more = !!page.nextPageToken && state.p < GOOGLE_MAX_PAGES;
    return {
      items,
      nextCursor: more ? encodeCursor({ p: state.p + 1 }) : null,
    };
  }

  async autocomplete(params: {
    input: string;
    lat?: number | null;
    lng?: number | null;
    sessionToken?: string | null;
  }): Promise<
    { placeId: string; primaryText: string; secondaryText: string }[]
  > {
    const input = normaliseQuery(params.input);
    if (!input) return [];
    const hasLocation =
      Number.isFinite(params.lat) && Number.isFinite(params.lng);
    const cell = hasLocation ? areaCell(params.lat, params.lng) : null;
    return this.cache.getOrFetch(
      `autocomplete:v1:${input}:${cell?.key ?? 'none'}`,
      'autocomplete',
      TTL.autocomplete,
      async () => {
        const predictions = await this.google.autocomplete({
          input,
          lat: cell?.lat,
          lng: cell?.lng,
          sessionToken: params.sessionToken,
        });
        return predictions
          .filter((p) => p.place_id)
          .map((p) => ({
            placeId: p.place_id,
            primaryText:
              p.structured_formatting?.main_text ?? p.description ?? '',
            secondaryText: p.structured_formatting?.secondary_text ?? '',
          }));
      },
    );
  }

  /** Street label + city for the area cell (cell centre), cached 24 h. */
  async reverseGeocode(
    lat: number,
    lng: number,
  ): Promise<{ label: string; city: string | null }> {
    const cell = areaCell(lat, lng);
    return this.cache.getOrFetch(
      `geocode:v1:${cell.key}`,
      'geocode',
      TTL.geocode,
      async () => {
        const results = await this.google.reverseGeocode(cell.lat, cell.lng);
        const best =
          results.find((r) =>
            r.types?.some((t) => ['street_address', 'premise'].includes(t)),
          ) ??
          results.find((r) => r.types?.includes('route')) ??
          results[0];
        if (!best) return { label: '', city: null };
        const find = (...types: string[]) =>
          types
            .map((t) =>
              best.address_components?.find((c) => c.types?.includes(t)),
            )
            .find(Boolean);
        const street = [
          find('street_number')?.long_name,
          find('route')?.short_name,
        ]
          .filter(Boolean)
          .join(' ');
        const city =
          find(
            'locality',
            'postal_town',
            'sublocality',
            'administrative_area_level_2',
          )?.long_name ?? null;
        const label =
          street || best.formatted_address?.split(',')[0]?.trim() || city || '';
        return { label, city };
      },
    );
  }

  // ------------------------------------------------------------ enrichment

  /**
   * Fills the Crunchii side of each place: likesCount, isLiked/isFavorite
   * (the legacy `favoriteplace` and `googlelike` endpoints both write the
   * favorites table, so both flags come from it), and back-fills opening
   * hours and utc offset from the details cache, then from restaurants.
   */
  async enrich(
    items: PlaceSummary[],
    userId?: number | null,
  ): Promise<PlaceSummary[]> {
    if (!items.length) return items;
    const ids = [...new Set(items.map((i) => i.placeId))];

    const missingHours = items.filter(
      (i) => !i.openingHours || i.utcOffsetMinutes === null,
    );
    const details = await this.cache.getMany<DetailsPayload>(
      [...new Set(missingHours.map((i) => i.placeId))].map(detailsCacheKey),
    );

    const rows: {
      place_id: string;
      likes_count: number;
      mine: boolean;
      opening_periods: OpeningHours;
      utc_offset_minutes: number | null;
    }[] = await this.restaurants.query(
      `SELECT r.google_place_id AS place_id,
              COUNT(DISTINCT f.user_id)::int AS likes_count,
              COALESCE(BOOL_OR(f.user_id = $2), false) AS mine,
              (ARRAY_AGG(r.opening_periods) FILTER (WHERE r.opening_periods IS NOT NULL))[1] AS opening_periods,
              (ARRAY_AGG(r.utc_offset_minutes) FILTER (WHERE r.utc_offset_minutes IS NOT NULL))[1] AS utc_offset_minutes
         FROM restaurants r
         LEFT JOIN favorites f ON f.restaurant_id = r.id
        WHERE r.google_place_id = ANY($1::text[])
        GROUP BY r.google_place_id`,
      [ids, userId ?? null],
    );
    const byId = new Map(rows.map((r) => [r.place_id, r]));

    return items.map((item) => {
      const place = details.get(detailsCacheKey(item.placeId))?.place;
      const row = byId.get(item.placeId);
      const openingHours =
        item.openingHours ??
        (place ? mapOpeningHours(place) : null) ??
        row?.opening_periods ??
        null;
      const utcOffsetMinutes =
        item.utcOffsetMinutes ??
        (place ? mapUtcOffset(place) : null) ??
        row?.utc_offset_minutes ??
        null;
      const mine = !!userId && !!row?.mine;
      return {
        ...item,
        openingHours,
        utcOffsetMinutes,
        likesCount: row?.likes_count ?? 0,
        isLiked: mine,
        isFavorite: mine,
      };
    });
  }
}
