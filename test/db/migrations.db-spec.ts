/**
 * Runs against a THROWAWAY Postgres only (TEST_DB_PORT, see
 * test-data-source.ts). Builds the schema from scratch with every migration,
 * then checks the Milestone 1 repair migrations up and down, cascades,
 * the SQL-paginated distance query and atomic counters.
 *
 *   TEST_DB_PORT=55431 npm run test:db
 */
import { DataSource, QueryRunner } from 'typeorm';
import { testDataSource } from './test-data-source';
import { PostQueryService } from '../../src/posts/post-query.service';
import { Post } from '../../src/entities/post.entity';
import { PostsService } from '../../src/posts/posts.service';
import { Like } from '../../src/entities/like.entity';
import { Comment } from '../../src/entities/comment.entity';
import { User } from '../../src/entities/user.entity';
import { Category } from '../../src/entities/category.entity';
import { Restaurant } from '../../src/entities/restaurant.entity';
import { PlaceCacheEntry } from '../../src/entities/place-cache.entity';
import { PlaceCacheService } from '../../src/places/place-cache.service';
import { PlacesService } from '../../src/places/places.service';

const describeDb = process.env.TEST_DB_PORT ? describe : describe.skip;

const RESTORED_INDEXES = [
  'idx_comments_post_id',
  'idx_likes_user_id',
  'idx_likes_post_id',
  'idx_favorites_user_id',
  'idx_restaurants_google_place_id',
  'idx_posts_user_id',
  'idx_posts_category_id',
  'idx_posts_restaurant_id',
  'idx_posts_created_at',
  'idx_follows_follower_id',
  'idx_follows_following_id',
  'idx_sessions_user_id',
  'idx_notifications_user_id',
  'idx_notifications_actor_user_id',
];

async function indexNames(ds: DataSource): Promise<string[]> {
  const rows = await ds.query(
    `SELECT indexname FROM pg_indexes WHERE schemaname = current_schema()`,
  );
  return rows.map((r) => r.indexname);
}

/** confdeltype: 'c' = CASCADE, 'a' = NO ACTION. */
async function deleteRules(ds: DataSource): Promise<Record<string, string>> {
  const rows = await ds.query(
    `SELECT rel.relname AS tbl, att.attname AS col, con.confdeltype AS rule
       FROM pg_constraint con
       JOIN pg_class rel ON rel.oid = con.conrelid
       JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
      WHERE con.contype = 'f'`,
  );
  return Object.fromEntries(rows.map((r) => [`${r.tbl}.${r.col}`, r.rule]));
}

async function schemaDrift(ds: DataSource): Promise<string[]> {
  const log = await ds.driver.createSchemaBuilder().log();
  return log.upQueries.map((q) => q.query);
}

async function seed(ds: DataSource) {
  const q = (sql: string, params?: any[]) => ds.query(sql, params);
  await q(
    `INSERT INTO categories (id, name) VALUES (1, 'Italian'), (2, 'Mexican/Latin')`,
  );
  await q(
    `INSERT INTO users (id, email, password, full_name) VALUES
       (1, 'a@x.com', 'h', 'A'), (2, 'b@x.com', 'h', 'B')`,
  );
  await q(
    `INSERT INTO restaurants (id, name, google_place_id) VALUES (1, 'R', 'ChIJ_place')`,
  );
  // Palm Desert centre ~ (33.7222, -116.3745)
  const posts: [
    number,
    number,
    number | null,
    number | null,
    number,
    string,
  ][] = [
    [1, 1, 33.7222, -116.3745, 1, '2026-01-01'], // 0 m
    [2, 1, 33.73, -116.3745, 2, '2026-01-02'], // ~870 m
    [3, 2, 33.8, -116.3745, 1, '2026-01-03'], // ~8.7 km
    [4, 2, 34.5, -116.3745, 1, '2026-01-04'], // ~86 km
    [5, 2, null, null, 1, '2026-01-05'], // no coordinates
  ];
  for (const [id, userId, lat, lng, cat, created] of posts) {
    await q(
      `INSERT INTO posts (id, description, user_id, category_id, restaurant_id, latitude, longitude, created_at)
       VALUES ($1, 'd', $2, $3, 1, $4, $5, $6)`,
      [id, userId, cat, lat, lng, created],
    );
  }
  await q(`INSERT INTO likes (user_id, post_id) VALUES (2, 1), (1, 3)`);
  await q(
    `INSERT INTO comments (comment, user_id, post_id) VALUES ('hi', 2, 1), ('yo', 1, 3)`,
  );
  await q(`INSERT INTO favorites (user_id, restaurant_id) VALUES (1, 1)`);
  await q(
    `INSERT INTO follows (follower_id, following_id) VALUES (1, 2), (2, 1)`,
  );
  await q(`INSERT INTO sessions (session_id, user_id) VALUES ('s1', 1)`);
  await q(`INSERT INTO user_settings (user_id) VALUES (1)`);
  await q(
    `INSERT INTO notifications (user_id, type, message, actor_user_id) VALUES (1, 'like', 'm', 2)`,
  );
  await q(
    `INSERT INTO advertisements (id, title, image_url) VALUES (1, 'Ad', '/x')`,
  );
  await q(
    `INSERT INTO advertisement_views (advertisement_id, user_id) VALUES (1, 1)`,
  );
}

describeDb('Milestone 1 migrations (throwaway Postgres)', () => {
  let ds: DataSource;

  beforeAll(async () => {
    ds = testDataSource();
    await ds.initialize();
    // Fresh database: every migration from the first one.
    await ds.query('DROP SCHEMA public CASCADE');
    await ds.query('CREATE SCHEMA public');
    await ds.runMigrations({ transaction: 'each' });
  });

  afterAll(async () => {
    await ds?.destroy();
  });

  it('builds the whole schema from scratch and matches the entities', async () => {
    expect(await schemaDrift(ds)).toEqual([]);
  });

  it('restores the 14 indexes plus the lat/lng index', async () => {
    const names = await indexNames(ds);
    for (const name of [...RESTORED_INDEXES, 'idx_posts_lat_lng']) {
      expect(names).toContain(name);
    }
  });

  it('makes user- and post-owned foreign keys ON DELETE CASCADE', async () => {
    const rules = await deleteRules(ds);
    for (const key of [
      'posts.user_id',
      'likes.user_id',
      'likes.post_id',
      'comments.user_id',
      'comments.post_id',
      'favorites.user_id',
      'follows.follower_id',
      'follows.following_id',
      'sessions.user_id',
      'user_settings.user_id',
      'notifications.user_id',
      'advertisement_views.user_id',
    ]) {
      expect([key, rules[key]]).toEqual([key, 'c']);
    }
    // Not owned by a user or post: unchanged.
    expect(rules['posts.category_id']).toBe('a');
    expect(rules['posts.restaurant_id']).toBe('a');
  });

  describe('with data', () => {
    beforeEach(async () => {
      await ds.query(
        `TRUNCATE users, categories, restaurants, posts, likes, comments, favorites,
                  follows, sessions, user_settings, notifications, advertisements,
                  advertisement_views RESTART IDENTITY CASCADE`,
      );
      await seed(ds);
    });

    it('deleting a user removes everything they own', async () => {
      await ds.query('DELETE FROM users WHERE id = 1');
      const count = async (sql: string) => Number((await ds.query(sql))[0].n);
      expect(
        await count('SELECT COUNT(*) n FROM posts WHERE user_id = 1'),
      ).toBe(0);
      expect(
        await count('SELECT COUNT(*) n FROM likes WHERE user_id = 1'),
      ).toBe(0);
      // user 2's like/comment on user 1's post went with the post
      expect(
        await count('SELECT COUNT(*) n FROM likes WHERE post_id = 1'),
      ).toBe(0);
      expect(
        await count('SELECT COUNT(*) n FROM comments WHERE post_id = 1'),
      ).toBe(0);
      expect(await count('SELECT COUNT(*) n FROM favorites')).toBe(0);
      expect(await count('SELECT COUNT(*) n FROM follows')).toBe(0);
      expect(await count('SELECT COUNT(*) n FROM sessions')).toBe(0);
      expect(await count('SELECT COUNT(*) n FROM user_settings')).toBe(0);
      expect(await count('SELECT COUNT(*) n FROM notifications')).toBe(0);
      expect(await count('SELECT COUNT(*) n FROM advertisement_views')).toBe(0);
      expect(await count('SELECT COUNT(*) n FROM users')).toBe(1);
    });

    describe('PostQueryService (SQL pagination)', () => {
      let service: PostQueryService;
      beforeEach(() => {
        service = new PostQueryService(ds.getRepository(Post));
      });

      it('filters by radius, newest first, with distances', async () => {
        const rows = await service.findNearbyIds({
          lat: 33.7222,
          lng: -116.3745,
          radiusM: 10_000,
          offset: 0,
          limit: 10,
        });
        expect(rows.map((r) => r.id)).toEqual([3, 2, 1]);
        expect(rows[2].distanceM).toBe(0);
        expect(rows[1].distanceM).toBeGreaterThan(800);
        expect(rows[1].distanceM).toBeLessThan(950);
      });

      it('paginates with LIMIT/OFFSET', async () => {
        const base = { lat: 33.7222, lng: -116.3745, radiusM: 10_000 };
        const p1 = await service.findNearbyIds({
          ...base,
          offset: 0,
          limit: 2,
        });
        const p2 = await service.findNearbyIds({
          ...base,
          offset: 2,
          limit: 2,
        });
        expect(p1.map((r) => r.id)).toEqual([3, 2]);
        expect(p2.map((r) => r.id)).toEqual([1]);
      });

      it('keeps legacy posts without coordinates when asked', async () => {
        const rows = await service.findNearbyIds({
          lat: 33.7222,
          lng: -116.3745,
          radiusM: 500,
          includeUnlocated: true,
          offset: 0,
          limit: 10,
        });
        expect(rows.map((r) => r.id)).toEqual([5, 1]);
      });

      it('filters by category', async () => {
        const rows = await service.findNearbyIds({
          lat: 33.7222,
          lng: -116.3745,
          radiusM: 100_000,
          categoryIds: [2],
          offset: 0,
          limit: 10,
        });
        expect(rows.map((r) => r.id)).toEqual([2]);
      });

      it('uses the lat/lng index for the bounding box', async () => {
        await ds.query('SET enable_seqscan = off');
        const plan = await ds.query(
          `EXPLAIN SELECT id FROM posts WHERE latitude BETWEEN 33.6 AND 33.8 AND longitude BETWEEN -116.5 AND -116.2`,
        );
        await ds.query('SET enable_seqscan = on');
        expect(JSON.stringify(plan)).toContain('idx_posts_lat_lng');
      });

      it('recounts likes and comments atomically under concurrency', async () => {
        await ds.query(`INSERT INTO users (id, email, password)
          SELECT g, 'u' || g || '@x.com', 'h' FROM generate_series(10, 39) g`);
        await Promise.all(
          Array.from({ length: 30 }, (_, i) =>
            ds
              .query('INSERT INTO likes (user_id, post_id) VALUES ($1, 2)', [
                i + 10,
              ])
              .then(() => service.refreshCounts(2)),
          ),
        );
        const counts = await service.refreshCounts(2);
        expect(counts.likesCount).toBe(30);
        const [row] = await ds.query(
          'SELECT likes_count FROM posts WHERE id = 2',
        );
        expect(row.likes_count).toBe(30);
      });

      it('index-distance keeps its legacy shape, paginates and hides PII', async () => {
        const posts = new PostsService(
          ds.getRepository(Post),
          ds.getRepository(Like),
          ds.getRepository(Comment),
          ds.getRepository(User),
          ds.getRepository(Category),
          ds.getRepository(Restaurant),
          null,
          service,
        );
        const res: any = await posts.getPostsByLocation({
          latitude: 33.7222,
          longitude: -116.3745,
          radius: 10,
          limit: 2,
        });
        expect(res.success).toBe(true);
        expect(res.post.map((p) => p.id)).toEqual([5, 3]);
        expect(res.pagination).toEqual({
          page: 1,
          offset: 0,
          limit: 2,
          hasMore: true,
        });
        const third: any = await posts.getPostsByLocation({
          latitude: 33.7222,
          longitude: -116.3745,
          radius: 10,
          limit: 2,
          page: 2,
        });
        expect(third.post.map((p) => p.id)).toEqual([2, 1]);
        expect(third.pagination.hasMore).toBe(false);

        const first = third.post[1];
        expect(first).toEqual(
          expect.objectContaining({
            review: 'd',
            restaurant: 'R',
            file: [],
            likes: [expect.objectContaining({ user_id: 2 })],
            comments: [expect.objectContaining({ comment: 'hi' })],
          }),
        );
        const json = JSON.stringify(third);
        expect(json).not.toContain('@x.com');
        expect(json).not.toContain('"password"');
        expect(first.user).toEqual(
          expect.objectContaining({ id: 1, full_name: 'A', image: null }),
        );
      });

      it('finds posts for a Google place id', async () => {
        expect(await service.findIdsByPlaceId('ChIJ_place', 0, 2)).toEqual([
          5, 4,
        ]);
        expect(await service.countByPlaceId('ChIJ_place')).toBe(5);
      });
    });
  });

  describe('Places cache and enrichment (real SQL)', () => {
    beforeEach(async () => {
      await ds.query(
        `TRUNCATE users, restaurants, favorites, place_cache RESTART IDENTITY CASCADE`,
      );
    });

    it('PlaceCacheService stores jsonb, honours the TTL and upserts', async () => {
      let clock = Date.UTC(2026, 9, 23, 12);
      const cache = new PlaceCacheService(ds.getRepository(PlaceCacheEntry));
      cache.now = () => new Date(clock);
      const fetcher = jest
        .fn()
        .mockResolvedValueOnce({ a: 1 })
        .mockResolvedValueOnce({ a: 2 });

      expect(
        await cache.getOrFetch('nearby:k', 'nearby', 60 * 60_000, fetcher),
      ).toEqual({ a: 1 });
      expect(
        await cache.getOrFetch('nearby:k', 'nearby', 60 * 60_000, fetcher),
      ).toEqual({ a: 1 });
      clock += 60 * 60_000 + 1;
      expect(
        await cache.getOrFetch('nearby:k', 'nearby', 60 * 60_000, fetcher),
      ).toEqual({ a: 2 });
      expect(fetcher).toHaveBeenCalledTimes(2);

      const rows = await ds.query(`SELECT key, kind, payload FROM place_cache`);
      expect(rows).toEqual([
        { key: 'nearby:k', kind: 'nearby', payload: { a: 2 } },
      ]);
      expect(
        (await cache.getMany(['nearby:k', 'missing'])).get('nearby:k'),
      ).toEqual({ a: 2 });
    });

    it('enrich: likes, favourites and stored hours from restaurants/favorites', async () => {
      await ds.query(
        `INSERT INTO users (id, email, password) VALUES (1, 'a@x.com', 'h'), (2, 'b@x.com', 'h')`,
      );
      // two rows for the same Google place (no unique constraint in prod)
      await ds.query(
        `INSERT INTO restaurants (id, name, google_place_id, opening_periods, utc_offset_minutes) VALUES
           (1, 'R', 'gp1', NULL, NULL),
           (2, 'R dup', 'gp1', '{"periods":[{"open":{"day":1,"time":"0900"}}],"weekdayText":[]}', -420),
           (3, 'Other', 'gp2', NULL, NULL)`,
      );
      await ds.query(
        `INSERT INTO favorites (user_id, restaurant_id) VALUES (1, 1), (2, 2), (2, 3)`,
      );
      const places = new PlacesService(
        null,
        new PlaceCacheService(ds.getRepository(PlaceCacheEntry)),
        null,
        null,
        ds.getRepository(Restaurant),
      );
      const base = {
        name: 'x',
        rating: null,
        userRatingsTotal: null,
        address: null,
        city: null,
        lat: 0,
        lng: 0,
        categoryLabel: null,
        priceLevel: null,
        photos: [],
        openingHours: null,
        utcOffsetMinutes: null,
        distanceM: null,
        likesCount: 0,
        isLiked: false,
        isFavorite: false,
      };
      const [a, b, c] = await places.enrich(
        [
          { ...base, placeId: 'gp1' },
          { ...base, placeId: 'gp2' },
          { ...base, placeId: 'gp3' },
        ],
        1,
      );
      expect(a).toEqual(
        expect.objectContaining({
          likesCount: 2,
          isLiked: true,
          isFavorite: true,
          utcOffsetMinutes: -420,
          openingHours: {
            periods: [{ open: { day: 1, time: '0900' } }],
            weekdayText: [],
          },
        }),
      );
      expect(b).toEqual(
        expect.objectContaining({ likesCount: 1, isLiked: false }),
      );
      expect(c).toEqual(
        expect.objectContaining({ likesCount: 0, isLiked: false }),
      );

      const [guest] = await places.enrich([{ ...base, placeId: 'gp1' }], null);
      expect(guest.isLiked).toBe(false);
      expect(guest.likesCount).toBe(2);
    });
  });

  it('reverts cleanly (down) to the 1777064415555 state and re-applies (up)', async () => {
    const runner: QueryRunner = ds.createQueryRunner();
    try {
      const repairs = ds.migrations
        .filter((m) =>
          /^(RepairIndexesAndCascades|PlacesCache)/.test(
            m.name ?? m.constructor.name,
          ),
        )
        .reverse();
      for (const migration of repairs) {
        await migration.down(runner);
      }
      const names = await indexNames(ds);
      for (const name of [...RESTORED_INDEXES, 'idx_posts_lat_lng']) {
        expect(names).not.toContain(name);
      }
      expect((await deleteRules(ds))['posts.user_id']).toBe('a');

      for (const migration of repairs.reverse()) {
        await migration.up(runner);
      }
      expect((await deleteRules(ds))['posts.user_id']).toBe('c');
      expect(await schemaDrift(ds)).toEqual([]);
    } finally {
      await runner.release();
    }
  });
});
