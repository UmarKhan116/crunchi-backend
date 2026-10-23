import { FeedService } from './feed.service';
import { PlacesService } from '../places.service';
import { PlaceCacheService } from '../place-cache.service';
import { PostPresenter } from '../../posts/post-presenter.service';
import { memoryCacheRepo } from '../../../test/helpers/memory-cache-repo';
import { GooglePlace } from '../google/google-places.types';
import { FeedItem } from '../../common/contract/types';

const ORIGIN = { lat: 33.7222, lng: -116.3745 };
const BASE = 'https://api.test';

/** A Google place ~`metres` north of ORIGIN. */
function gPlace(
  id: string,
  metres = 500,
  extra: Partial<GooglePlace> = {},
): GooglePlace {
  return {
    place_id: id,
    name: `Place ${id}`,
    rating: 4.5,
    user_ratings_total: 100,
    vicinity: '1226 University Dr, Palm Desert',
    geometry: {
      location: { lat: ORIGIN.lat + metres / 111320, lng: ORIGIN.lng },
    },
    types: ['restaurant', 'food', 'point_of_interest'],
    price_level: 2,
    photos: [
      { photo_reference: `ref_${id}_0123456789`, width: 1000, height: 800 },
    ],
    opening_hours: { open_now: true },
    ...extra,
  };
}

// keyword -> pages of results
const GOOGLE_PAGES: Record<string, GooglePlace[][]> = {
  italian: [
    ['i1', 'i2', 'shared', 'i3'].map((id) => gPlace(id)),
    ['i4', 'i5'].map((id) => gPlace(id)),
  ],
  mexican: [
    [
      gPlace('m1'),
      gPlace('shared'),
      gPlace('far', 20_000), // outside the 8 km radius
      gPlace('hotel', 300, { types: ['lodging'] }),
      gPlace('nophoto', 300, { photos: [] }),
      gPlace('m2'),
    ],
  ],
};

function googleMock() {
  return {
    nearbySearch: jest.fn(async ({ keyword }) => ({
      results: GOOGLE_PAGES[keyword]?.[0] ?? [],
      nextPageToken: GOOGLE_PAGES[keyword]?.[1] ? `tok:${keyword}:2` : null,
    })),
    nextPage: jest.fn(async (_endpoint: string, token: string) => {
      const [, keyword, page] = token.split(':');
      const n = Number(page);
      return {
        results: GOOGLE_PAGES[keyword]?.[n - 1] ?? [],
        nextPageToken: GOOGLE_PAGES[keyword]?.[n]
          ? `tok:${keyword}:${n + 1}`
          : null,
      };
    }),
  };
}

// Posts within the radius, newest first.
const POSTS = [11, 12, 13, 14, 15].map((id, i) => ({
  id,
  description: `post ${id}`,
  images: [`image-${id}.jpg`, `clip-${id}.mp4`],
  rating: '4.0',
  likes_count: id,
  comments_count: 1,
  created_at: new Date(Date.UTC(2026, 0, 30 - i)),
  latitude: '33.72220000',
  longitude: '-116.37450000',
  user: {
    id: 100 + i,
    user_name: `u${i}`,
    full_name: `User ${i}`,
    profile_picture: 'me.jpg',
    email: 'secret@example.com',
    password: 'hash',
    device_token: 'fcm',
    social_id: 'sid',
  },
  restaurant: {
    google_place_id: 'i1',
    name: 'Place i1',
    opening_periods: null,
  },
  category: { name: 'Italian' },
}));

function setup(opts: { userId?: number; favoriteCategories?: number[] } = {}) {
  const google = googleMock();
  const cacheRepo = memoryCacheRepo();
  const cache = new PlaceCacheService(cacheRepo as any);

  const postQuery = {
    findNearbyIds: jest.fn(async ({ offset, limit }) =>
      POSTS.slice(offset, offset + limit).map((p) => ({
        id: p.id,
        distanceM: 10,
      })),
    ),
    loadInOrder: jest.fn(async (ids: number[]) =>
      ids.map((id) => POSTS.find((p) => p.id === id)),
    ),
    countByPlaceId: jest.fn(),
  };
  const likeRepository = {
    find: jest.fn(async () => (opts.userId ? [{ post_id: 12 }] : [])),
  };
  const presenter = new PostPresenter(likeRepository as any);
  const restaurants = {
    query: jest.fn(
      async (_sql: string, [ids, userId]: [string[], number | null]) =>
        ids.includes('i2')
          ? [
              {
                place_id: 'i2',
                likes_count: 7,
                mine: userId === 1,
                opening_periods: null,
                utc_offset_minutes: -420,
              },
            ]
          : [],
    ),
  };
  const places = new PlacesService(
    google as any,
    cache,
    postQuery as any,
    presenter,
    restaurants as any,
  );
  const categories = {
    find: jest.fn(async ({ where }) => {
      const all = [
        { id: 1, name: 'Italian' },
        { id: 2, name: 'Mexican/Latin' },
      ];
      const wanted = where.id?.value as number[] | undefined;
      return wanted ? all.filter((c) => wanted.includes(c.id)) : all;
    }),
  };
  const userSettings = {
    findOne: jest.fn(async () =>
      opts.favoriteCategories
        ? { favorite_categories: opts.favoriteCategories }
        : null,
    ),
  };
  const feed = new FeedService(
    places,
    postQuery as any,
    presenter,
    categories as any,
    userSettings as any,
  );
  return { feed, google, cache, postQuery, restaurants };
}

const ctx = (userId?: number) => ({ userId, baseUrl: BASE });
const kinds = (items: FeedItem[]) =>
  items.map((i) => (i.kind === 'place' ? 'P' : 'Q')).join('');

async function pageAll(feed: FeedService, userId?: number, limit = 5) {
  const pages: FeedItem[][] = [];
  let cursor: string | undefined;
  do {
    const res = await feed.feed({ ...ORIGIN, limit, cursor }, ctx(userId));
    pages.push(res.items);
    cursor = res.nextCursor ?? undefined;
  } while (cursor && pages.length < 20);
  return { pages, all: pages.flat() };
}

describe('FeedService', () => {
  it('interleaves 1 post after every 2 places', async () => {
    const { feed } = setup();
    const res = await feed.feed({ ...ORIGIN, limit: 9 }, ctx());
    expect(kinds(res.items)).toBe('PPQPPQPPQ');
    expect(res.items[0].id).toMatch(/^place:/);
    expect(res.items[2].id).toBe('post:11');
  });

  it('dedupes places across categories and drops far, lodging and photo-less places', async () => {
    const { feed } = setup();
    const { all } = await pageAll(feed);
    const placeIds = all
      .filter((i) => i.kind === 'place')
      .map((i) => (i as any).place.placeId);
    expect(new Set(placeIds).size).toBe(placeIds.length);
    expect(placeIds.sort()).toEqual([
      'i1',
      'i2',
      'i3',
      'i4',
      'i5',
      'm1',
      'm2',
      'shared',
    ]);
  });

  it('round-trips the cursor: every place and post exactly once, then null', async () => {
    const { feed } = setup();
    const { pages, all } = await pageAll(feed, undefined, 4);
    const itemIds = all.map((i) => i.id);
    expect(new Set(itemIds).size).toBe(itemIds.length);
    expect(itemIds.filter((id) => id.startsWith('post:'))).toEqual([
      'post:11',
      'post:12',
      'post:13',
      'post:14',
      'post:15',
    ]);
    expect(all).toHaveLength(13);
    // the 2:1 pattern continues across page boundaries
    expect(kinds(all)).toBe('PPQPPQPPQPPQQ');
    expect(pages.length).toBeGreaterThan(1);
  });

  it('calls Nearby Search once per (category, area cell) and reuses the cache', async () => {
    const { feed, google } = setup();
    await feed.feed({ ...ORIGIN, limit: 3 }, ctx());
    // same cell, slightly different position
    await feed.feed(
      { lat: ORIGIN.lat + 0.001, lng: ORIGIN.lng + 0.001, limit: 3 },
      ctx(),
    );
    expect(google.nearbySearch).toHaveBeenCalledTimes(2); // italian + mexican
    const calls = google.nearbySearch.mock.calls.map(([p]) => p);
    expect(calls.map((c) => c.keyword).sort()).toEqual(['italian', 'mexican']);
    // queried at the cell centre, not the raw position
    expect(calls[0]).toEqual(
      expect.objectContaining({ lat: 33.72, lng: -116.37, type: 'restaurant' }),
    );
  });

  it('follows next_page_token lazily, only when a later page needs it', async () => {
    const { feed, google } = setup();
    const first = await feed.feed({ ...ORIGIN, limit: 3 }, ctx());
    expect(google.nextPage).not.toHaveBeenCalled();
    await pageAll(feed);
    expect(google.nextPage).toHaveBeenCalledTimes(1);
    expect(google.nextPage).toHaveBeenCalledWith(
      'nearbysearch',
      'tok:italian:2',
    );
    expect(first.nextCursor).not.toBeNull();
  });

  it('uses the user’s selected categories when none are given', async () => {
    const { feed, google } = setup({ userId: 1, favoriteCategories: [2] });
    await feed.feed({ ...ORIGIN, limit: 3 }, ctx(1));
    expect(google.nearbySearch.mock.calls.map(([p]) => p.keyword)).toEqual([
      'mexican',
    ]);
  });

  it('explicit categories win and also filter posts', async () => {
    const { feed, google, postQuery } = setup({
      userId: 1,
      favoriteCategories: [2],
    });
    await feed.feed({ ...ORIGIN, limit: 3, categories: [1] }, ctx(1));
    expect(google.nearbySearch.mock.calls.map(([p]) => p.keyword)).toEqual([
      'italian',
    ]);
    expect(postQuery.findNearbyIds).toHaveBeenCalledWith(
      expect.objectContaining({ categoryIds: [1], radiusM: 8000 }),
    );
  });

  it('fills isLiked/isFavorite/likesCount for the user and leaves guests false', async () => {
    const asUser = (
      await setup({ userId: 1 }).feed.feed({ ...ORIGIN, limit: 9 }, ctx(1))
    ).items;
    const i2 = asUser.find((i) => i.id === 'place:i2') as any;
    expect(i2.place).toEqual(
      expect.objectContaining({
        likesCount: 7,
        isLiked: true,
        isFavorite: true,
        utcOffsetMinutes: -420,
      }),
    );
    const post12 = asUser.find((i) => i.id === 'post:12') as any;
    expect(post12.post.isLiked).toBe(true);

    const asGuest = (await setup().feed.feed({ ...ORIGIN, limit: 9 }, ctx()))
      .items;
    const g2 = asGuest.find((i) => i.id === 'place:i2') as any;
    expect(g2.place).toEqual(
      expect.objectContaining({
        likesCount: 7,
        isLiked: false,
        isFavorite: false,
      }),
    );
  });

  it('back-fills opening hours and utc offset from the details cache', async () => {
    const { feed, cache } = setup();
    const periods = [
      { open: { day: 1, time: '1100' }, close: { day: 1, time: '2200' } },
    ];
    await cache.set(
      'details:v1:i1',
      'details',
      {
        place: {
          ...gPlace('i1'),
          opening_hours: { periods, weekday_text: ['Monday: 11 AM – 10 PM'] },
          utc_offset: -420,
        },
      },
      60_000,
    );
    const res = await feed.feed({ ...ORIGIN, limit: 9 }, ctx());
    const i1 = res.items.find((i) => i.id === 'place:i1') as any;
    expect(i1.place.openingHours).toEqual({
      periods,
      weekdayText: ['Monday: 11 AM – 10 PM'],
    });
    expect(i1.place.utcOffsetMinutes).toBe(-420);
    // Nearby gives no periods, so others stay null (the app shows no badge)
    const i3 = res.items.find((i) => i.id === 'place:i3') as any;
    expect(i3.place.openingHours).toBeNull();
  });

  it('returns contract shapes with absolute URLs and no PII', async () => {
    const res = await setup().feed.feed({ ...ORIGIN, limit: 3 }, ctx());
    const place = (res.items[0] as any).place;
    expect(place.photos[0].url).toMatch(
      /^https:\/\/api\.test\/api\/places\/photo\/ref_.+\?w=800$/,
    );
    expect(place.distanceM).toBeGreaterThan(450);
    expect(place.distanceM).toBeLessThan(550);
    expect(place.city).toBe('Palm Desert');
    expect(place.categoryLabel).toBe('Italian');

    const post = (res.items[2] as any).post;
    expect(post.user).toEqual({
      id: '100',
      userName: 'u0',
      fullName: 'User 0',
      avatarUrl: `${BASE}/storage/user/me.jpg`,
    });
    expect(post.media).toEqual([
      {
        url: `${BASE}/storage/image-11.jpg`,
        type: 'image',
        thumbnailUrl: null,
      },
      { url: `${BASE}/storage/clip-11.mp4`, type: 'video', thumbnailUrl: null },
    ]);
    expect(post.rating).toBe(4);
    const json = JSON.stringify(res);
    for (const secret of ['secret@example.com', 'hash', 'fcm', 'sid', 'key=']) {
      expect(json).not.toContain(secret);
    }
  });
});
