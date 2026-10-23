/**
 * Boots the real AppModule against the THROWAWAY Postgres (TEST_DB_PORT) with
 * Google mocked at `fetch`, and drives the Milestone 1 endpoints over HTTP.
 *
 *   TEST_DB_PORT=55431 npm run test:db
 */
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { testDataSource } from './test-data-source';

// Never talk to Firebase from tests (the push worker is off here anyway).
jest.mock('firebase-admin', () => {
  const app = {
    messaging: () => ({ sendEachForMulticast: jest.fn() }),
  };
  return {
    apps: [],
    app: () => app,
    initializeApp: () => app,
    credential: { cert: () => ({}), applicationDefault: () => ({}) },
  };
});

const describeDb = process.env.TEST_DB_PORT ? describe : describe.skip;

const ORIGIN = { lat: 33.7222, lng: -116.3745 };
const PLACE_ID = 'ChIJ_test_place_0001';
const PHOTO_REF = 'AUGGfZtestPhotoReference_0001';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3]);
const STORAGE = path.resolve(__dirname, '..', '..', 'storage');

const googlePlace = {
  place_id: PLACE_ID,
  name: 'Trattoria Test',
  rating: 4.6,
  user_ratings_total: 120,
  vicinity: '1226 University Dr, Palm Desert',
  geometry: { location: { lat: ORIGIN.lat + 0.002, lng: ORIGIN.lng } },
  types: ['restaurant', 'food'],
  photos: [{ photo_reference: PHOTO_REF, width: 1600, height: 1200 }],
  opening_hours: { open_now: true },
};

function fakeGoogle(url: string): Response {
  const u = new URL(url);
  const json = (body: unknown) =>
    ({
      ok: true,
      status: 200,
      json: async () => body,
      headers: new Headers(),
    }) as any;
  if (u.searchParams.get('key') !== 'test-places-key')
    throw new Error('missing key');
  switch (u.pathname) {
    case '/maps/api/place/nearbysearch/json':
      return json({ status: 'OK', results: [googlePlace] });
    case '/maps/api/place/details/json':
      return json({
        status: 'OK',
        result: {
          ...googlePlace,
          formatted_address: '1226 University Dr, Palm Desert, CA 92211, USA',
          opening_hours: {
            periods: [
              {
                open: { day: 1, time: '1100' },
                close: { day: 1, time: '2200' },
              },
            ],
            weekday_text: ['Monday: 11:00 AM – 10:00 PM'],
          },
          utc_offset: -420,
          formatted_phone_number: '(760) 555-0100',
          website: 'https://example.com',
          url: 'https://maps.google.com/?cid=1',
        },
      });
    case '/maps/api/place/textsearch/json':
      return json({ status: 'OK', results: [googlePlace] });
    case '/maps/api/place/autocomplete/json':
      return json({
        status: 'OK',
        predictions: [
          {
            place_id: PLACE_ID,
            structured_formatting: {
              main_text: 'Trattoria Test',
              secondary_text: 'Palm Desert',
            },
          },
        ],
      });
    case '/maps/api/geocode/json':
      return json({
        status: 'OK',
        results: [
          {
            types: ['street_address'],
            address_components: [
              {
                long_name: '1226',
                short_name: '1226',
                types: ['street_number'],
              },
              {
                long_name: 'University Drive',
                short_name: 'University Dr',
                types: ['route'],
              },
              {
                long_name: 'Palm Desert',
                short_name: 'Palm Desert',
                types: ['locality'],
              },
            ],
          },
        ],
      });
    case '/maps/api/place/photo':
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'image/jpeg' }),
        arrayBuffer: async () =>
          JPEG.buffer.slice(JPEG.byteOffset, JPEG.byteOffset + JPEG.length),
      } as any;
  }
  throw new Error(`unexpected Google call ${u.pathname}`);
}

describeDb(
  'Milestone 1 HTTP endpoints (AppModule + throwaway Postgres)',
  () => {
    let app: NestExpressApplication;
    let ds: DataSource;
    let fetchMock: jest.SpyInstance;
    let http: ReturnType<typeof request>;
    const storageBefore = new Set<string>();
    const env = { ...process.env };

    const register = async (email: string, name: string) => {
      const res = await http
        .post('/api/register')
        .send({
          email,
          password: 'secret123',
          full_name: name,
          user_name: name.toLowerCase(),
        })
        .expect(201);
      return {
        token: res.body.token as string,
        id: res.body.user.id as number,
      };
    };

    let alice: { token: string; id: number };
    let bob: { token: string; id: number };

    beforeAll(async () => {
      // Schema from scratch with every migration.
      ds = testDataSource();
      await ds.initialize();
      await ds.query('DROP SCHEMA public CASCADE');
      await ds.query('CREATE SCHEMA public');
      await ds.runMigrations({ transaction: 'each' });
      await ds.query(
        `INSERT INTO categories (id, name, icon) VALUES (1, 'Italian', 'italian.jpg'), (2, 'Mexican/Latin', NULL)`,
      );
      await ds.query(
        `INSERT INTO advertisements (id, title, image_url, type, file_name, link_url)
       VALUES (1, 'Promo', '/storage/video/ad-1.mp4', 'mp4', 'ad-1.mp4', 'https://promo.example')`,
      );

      process.env.GOOGLE_PLACES_API_KEY = 'test-places-key';
      process.env.PUBLIC_BASE_URL = 'https://api.test';
      process.env.PUSH_WORKER_ENABLED = 'false';
      delete process.env.ALLOW_LEGACY_SOCIAL_LOGIN;

      fetchMock = jest
        .spyOn(global, 'fetch')
        .mockImplementation(async (url: any) => fakeGoogle(String(url)));

      if (fs.existsSync(STORAGE)) {
        for (const f of fs.readdirSync(STORAGE, {
          recursive: true,
        }) as string[])
          storageBefore.add(f);
      }

      const { AppModule } = await import('../../src/app.module');
      const { configureApp } = await import('../../src/app.setup');
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider('TypeOrmModuleOptions')
        .useValue({
          ...ds.options,
          synchronize: false,
          migrationsRun: false,
          autoLoadEntities: false,
        })
        .compile();
      app = moduleRef.createNestApplication<NestExpressApplication>();
      configureApp(app);
      await app.init();
      http = request(app.getHttpServer());

      alice = await register('alice@example.com', 'Alice');
      bob = await register('bob@example.com', 'Bob');
    });

    afterAll(async () => {
      await app?.close();
      await ds?.destroy();
      fetchMock?.mockRestore();
      process.env = env;
      // Remove only what this test wrote under storage/.
      if (fs.existsSync(STORAGE)) {
        const created = (
          fs.readdirSync(STORAGE, { recursive: true }) as string[]
        )
          .filter((f) => !storageBefore.has(f))
          .sort((a, b) => b.length - a.length);
        for (const f of created)
          fs.rmSync(path.join(STORAGE, f), { recursive: true, force: true });
      }
    });

    it('builds a Swagger document that lists the new endpoints', () => {
      const doc = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().build(),
      );
      for (const p of [
        '/api/feed',
        '/api/bootstrap',
        '/api/bootstrap/guest',
        '/api/places/{placeId}',
        '/api/places/{placeId}/posts',
        '/api/places/photo/{ref}',
        '/api/places/search',
        '/api/places/autocomplete',
        '/api/geocode/reverse',
      ]) {
        expect(doc.paths[p]).toBeDefined();
      }
    });

    describe('bootstrap', () => {
      it('guest: categories, ads and default adRules', async () => {
        const res = await http.get('/api/bootstrap/guest').expect(200);
        expect(res.body).toEqual({
          success: true,
          data: {
            categories: [
              {
                id: '1',
                name: 'Italian',
                imageUrl: 'https://api.test/storage/category/italian.jpg',
                googleType: 'restaurant',
                keyword: 'italian',
                isSelected: false,
              },
              {
                id: '2',
                name: 'Mexican/Latin',
                imageUrl: null,
                googleType: 'restaurant',
                keyword: 'mexican',
                isSelected: false,
              },
            ],
            ads: [
              {
                adId: '1',
                mediaUrl: 'https://api.test/storage/video/ad-1.mp4',
                mediaType: 'video',
                linkUrl: 'https://promo.example',
                title: 'Promo',
              },
            ],
            adRules: { adEvery: 8, bannerEvery: 0 },
          },
        });
      });

      it('requires a token (401 envelope)', async () => {
        const res = await http.get('/api/bootstrap').expect(401);
        expect(res.body).toEqual(
          expect.objectContaining({
            success: false,
            message: 'Invalid or expired token',
          }),
        );
      });

      it('returns the user, settings, favourites and counts', async () => {
        await http
          .post('/api/user-setting')
          .set('Authorization', `Bearer ${alice.token}`)
          .send({ favorite_categories: [2], notifications_enabled: false })
          .expect(201);
        await http
          .post('/api/app-setting')
          .set('Authorization', `Bearer ${alice.token}`)
          .send({ dark: 'true', toggle: 'false' })
          .expect(201);
        await http
          .post('/api/favoriteplace')
          .set('Authorization', `Bearer ${alice.token}`)
          .send({ google_place_id: PLACE_ID, name: 'Trattoria Test' })
          .expect(201);
        await http
          .post('/api/user-follows')
          .set('Authorization', `Bearer ${bob.token}`)
          .send({ user_id: alice.id })
          .expect(201);

        const res = await http
          .get('/api/bootstrap')
          .set('Authorization', `Bearer ${alice.token}`)
          .expect(200);
        const d = res.body.data;
        expect(d.user).toEqual({
          id: String(alice.id),
          userName: 'alice',
          fullName: 'Alice',
          avatarUrl: null,
          bio: null,
          followersCount: 1,
          followingCount: 0,
          postsCount: 0,
        });
        expect(d.settings).toEqual({
          notificationsEnabled: false,
          darkMode: 'dark',
        });
        expect(d.categories.map((c) => [c.id, c.isSelected])).toEqual([
          ['1', false],
          ['2', true],
        ]);
        expect(d.favoritePlaceIds).toEqual([PLACE_ID]);
        expect(d.likedPlaceIds).toEqual([PLACE_ID]);
        expect(d.unreadNotifications).toBe(1); // Bob followed Alice
        expect(d.adRules).toEqual({ adEvery: 8, bannerEvery: 0 });
        expect(JSON.stringify(res.body)).not.toContain('alice@example.com');
      });
    });

    describe('feed and places', () => {
      let postId: number;

      beforeAll(async () => {
        const res = await http
          .post('/api/post-save')
          .set('Authorization', `Bearer ${bob.token}`)
          .send({
            description: 'Great carbonara',
            images: ['image-u2-1-a.jpg'],
            category_id: 1,
            rating: 5,
            latitude: ORIGIN.lat,
            longitude: ORIGIN.lng,
            restaurant: 'Trattoria Test',
            restaurant_id: PLACE_ID,
          })
          .expect(201);
        postId = res.body.post.id;
        await http
          .post('/api/post_like')
          .set('Authorization', `Bearer ${alice.token}`)
          .send({ post_id: postId })
          .expect(201);
      });

      it('GET /api/feed validates its query (400 envelope with field errors)', async () => {
        const res = await http.get('/api/feed?lng=1').expect(400);
        expect(res.body.success).toBe(false);
        expect(res.body.errors.lat).toBeDefined();
      });

      it('GET /api/feed merges places and posts for a user', async () => {
        const res = await http
          .get(
            `/api/feed?lat=${ORIGIN.lat}&lng=${ORIGIN.lng}&categories=1,2&limit=10`,
          )
          .set('Authorization', `Bearer ${alice.token}`)
          .expect(200);
        const items = res.body.data.items;
        expect(items.map((i) => i.id)).toEqual([
          `place:${PLACE_ID}`,
          `post:${postId}`,
        ]);
        expect(items[0].place).toEqual(
          expect.objectContaining({
            placeId: PLACE_ID,
            isLiked: true,
            isFavorite: true,
            likesCount: 1,
            categoryLabel: 'Italian',
          }),
        );
        expect(items[0].place.photos[0].url).toBe(
          `https://api.test/api/places/photo/${PHOTO_REF}?w=800`,
        );
        expect(items[1].post).toEqual(
          expect.objectContaining({
            postId: String(postId),
            description: 'Great carbonara',
            rating: 5,
            likesCount: 1,
            commentsCount: 0,
            isLiked: true,
            distanceM: 0,
            media: [
              {
                url: 'https://api.test/storage/image-u2-1-a.jpg',
                type: 'image',
                thumbnailUrl: null,
              },
            ],
            user: {
              id: String(bob.id),
              userName: 'bob',
              fullName: 'Bob',
              avatarUrl: null,
            },
          }),
        );
        expect(res.body.data.nextCursor).toBeNull();
        expect(JSON.stringify(res.body)).not.toMatch(
          /@example\.com|password|test-places-key/,
        );
      });

      it('GET /api/feed works for guests', async () => {
        const res = await http
          .get(`/api/feed?lat=${ORIGIN.lat}&lng=${ORIGIN.lng}`)
          .expect(200);
        expect(res.body.data.items[0].place.isLiked).toBe(false);
      });

      it('GET /api/places/:placeId returns details and stores the hours', async () => {
        const res = await http
          .get(`/api/places/${PLACE_ID}?lat=${ORIGIN.lat}&lng=${ORIGIN.lng}`)
          .set('Authorization', `Bearer ${alice.token}`)
          .expect(200);
        expect(res.body.data).toEqual(
          expect.objectContaining({
            placeId: PLACE_ID,
            city: 'Palm Desert',
            phone: '(760) 555-0100',
            website: 'https://example.com',
            mapsUrl: 'https://maps.google.com/?cid=1',
            crunchiiReviewsCount: 1,
            utcOffsetMinutes: -420,
            isFavorite: true,
          }),
        );
        const [row] = await ds.query(
          `SELECT opening_periods, utc_offset_minutes FROM restaurants WHERE google_place_id = $1 LIMIT 1`,
          [PLACE_ID],
        );
        expect(row.utc_offset_minutes).toBe(-420);
        expect(row.opening_periods.weekdayText).toEqual([
          'Monday: 11:00 AM – 10:00 PM',
        ]);
      });

      it('the feed now back-fills opening hours from the details cache', async () => {
        const res = await http
          .get(`/api/feed?lat=${ORIGIN.lat}&lng=${ORIGIN.lng}`)
          .expect(200);
        expect(res.body.data.items[0].place.openingHours.periods).toHaveLength(
          1,
        );
        expect(res.body.data.items[0].place.utcOffsetMinutes).toBe(-420);
      });

      it('GET /api/places/:placeId/posts lists Crunchii reviews', async () => {
        const res = await http.get(`/api/places/${PLACE_ID}/posts`).expect(200);
        expect(res.body.data.items.map((p) => p.postId)).toEqual([
          String(postId),
        ]);
        expect(res.body.data.items[0].place.openingHours).not.toBeNull();
        expect(res.body.data.nextCursor).toBeNull();
      });

      it('GET /api/places/photo/:ref returns image bytes with a clamped width', async () => {
        const res = await http
          .get(`/api/places/photo/${PHOTO_REF}?w=500`)
          .expect(200);
        expect(res.headers['content-type']).toBe('image/jpeg');
        expect(res.headers['cache-control']).toBe('public, max-age=86400');
        expect(Buffer.compare(res.body, JPEG)).toBe(0);
        const photoCall = fetchMock.mock.calls
          .map(([u]) => new URL(String(u)))
          .find((u) => u.pathname.endsWith('/photo'));
        expect(photoCall.searchParams.get('maxwidth')).toBe('800');
        await http.get('/api/places/photo/..%2F..%2Fetc%2Fpasswd').expect(400);
      });

      it('search, autocomplete and reverse geocode', async () => {
        const search = await http
          .get(
            `/api/places/search?query=Pasta&lat=${ORIGIN.lat}&lng=${ORIGIN.lng}`,
          )
          .expect(200);
        expect(search.body.data.items[0].placeId).toBe(PLACE_ID);

        const ac = await http
          .get('/api/places/autocomplete?input=trat')
          .expect(200);
        expect(ac.body.data).toEqual([
          {
            placeId: PLACE_ID,
            primaryText: 'Trattoria Test',
            secondaryText: 'Palm Desert',
          },
        ]);

        const geo = await http
          .get(`/api/geocode/reverse?lat=${ORIGIN.lat}&lng=${ORIGIN.lng}`)
          .expect(200);
        expect(geo.body.data).toEqual({
          label: '1226 University Dr',
          city: 'Palm Desert',
        });
      });

      it('legacy index-distance keeps its shape and hides PII', async () => {
        const res = await http
          .post('/api/index-distance')
          .send({ latitude: ORIGIN.lat, longitude: ORIGIN.lng, radius: 10 })
          .expect(201);
        expect(res.body.success).toBe(true);
        expect(res.body.post[0]).toEqual(
          expect.objectContaining({
            id: postId,
            review: 'Great carbonara',
            restaurant: 'Trattoria Test',
          }),
        );
        expect(res.body.post[0].likes).toHaveLength(1);
        expect(JSON.stringify(res.body)).not.toMatch(
          /@example\.com|"password"|device_token/,
        );
      });
    });

    describe('security', () => {
      it('imageupload requires login and names files after the owner', async () => {
        await http
          .post('/api/imageupload')
          .attach('image', JPEG, 'a.jpg')
          .expect(401);
        const res = await http
          .post('/api/imageupload')
          .set('Authorization', `Bearer ${alice.token}`)
          .attach('image', JPEG, {
            filename: 'a.jpg',
            contentType: 'image/jpeg',
          })
          .expect(201);
        expect(res.body.url).toMatch(
          new RegExp(`^image-u${alice.id}-\\d+-\\d+\\.jpg$`),
        );

        // removeImage: login, owner only, no traversal
        await http
          .post('/api/removeImage')
          .send({ image: res.body.url })
          .expect(401);
        await http
          .post('/api/removeImage')
          .set('Authorization', `Bearer ${bob.token}`)
          .send({ image: res.body.url })
          .expect(403);
        await http
          .post('/api/removeImage')
          .set('Authorization', `Bearer ${alice.token}`)
          .send({ filename: '../package.json' })
          .expect(400);
        const ok = await http
          .post('/api/removeImage')
          .set('Authorization', `Bearer ${alice.token}`)
          .send({ image: res.body.url })
          .expect(201);
        expect(ok.body.success).toBe(true);
        expect(fs.existsSync(path.join(STORAGE, res.body.url))).toBe(false);
      });

      it('advertisement-view requires login and counts atomically', async () => {
        await http
          .post('/api/advertisement-view')
          .send({ advertisement_id: 1 })
          .expect(401);
        await Promise.all(
          Array.from({ length: 5 }, () =>
            http
              .post('/api/advertisement-view')
              .set('Authorization', `Bearer ${alice.token}`)
              .send({ advertisement_id: 1, user_id: bob.id, clicked: true })
              .expect(201),
          ),
        );
        const [view] = await ds.query(
          `SELECT user_id, view_count, click_count FROM advertisement_views`,
        );
        expect(view).toEqual({
          user_id: alice.id,
          view_count: 5,
          click_count: 5,
        });
        const [ad] = await ds.query(
          `SELECT views_count, clicks_count FROM advertisements WHERE id = 1`,
        );
        expect(ad).toEqual({ views_count: 5, clicks_count: 5 });
      });

      it('search/:query matches names only and never returns emails', async () => {
        await ds.query(
          `INSERT INTO users (email, password, full_name, is_active) VALUES ('zed@example.com', 'h', 'Alicia Gone', false)`,
        );
        const byName = await http.get('/api/search/ali').expect(200);
        expect(byName.body.users.map((u) => u.full_name)).toEqual(['Alice']);
        expect(byName.body.users[0].email).toBeUndefined();
        const byEmail = await http.get('/api/search/example.com').expect(200);
        expect(byEmail.body.users).toEqual([]);
      });

      it('other_get_user hides email, password hash, tokens and social ids', async () => {
        const res = await http
          .get(`/api/other_get_user/${alice.id}`)
          .expect(200);
        expect(res.body.user.full_name).toBe('Alice');
        expect(JSON.stringify(res.body)).not.toMatch(
          /@example\.com|password|device_token|social_id/,
        );
      });

      it('socialLogin: legacy body works by default and is refused when the flag is off', async () => {
        const legacy = {
          provider: 'google',
          social_id: 'g-legacy',
          email: 'legacy@example.com',
          name: 'Leg',
        };
        const ok = await http.post('/api/socialLogin').send(legacy).expect(201);
        expect(ok.body.success).toBe(true);

        process.env.ALLOW_LEGACY_SOCIAL_LOGIN = 'false';
        const refused = await http
          .post('/api/socialLogin')
          .send(legacy)
          .expect(400);
        expect(refused.body.success).toBe(false);
        delete process.env.ALLOW_LEGACY_SOCIAL_LOGIN;
      });

      it('rate-limits forgot to 10 requests per minute per IP', async () => {
        for (let i = 0; i < 10; i++) {
          await http
            .post('/api/forgot')
            .send({ email: 'nobody@example.com' })
            .expect(201);
        }
        const res = await http
          .post('/api/forgot')
          .send({ email: 'nobody@example.com' })
          .expect(429);
        expect(res.body.success).toBe(false);
      });

      it('deleting a user cascades (account deletion works)', async () => {
        await ds.query('DELETE FROM users WHERE id = $1', [bob.id]);
        const [{ n }] = await ds.query('SELECT COUNT(*)::int n FROM posts');
        expect(n).toBe(0);
      });
    });
  },
);
