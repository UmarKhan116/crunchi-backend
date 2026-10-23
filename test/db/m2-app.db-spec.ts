/**
 * Boots the real AppModule against the THROWAWAY Postgres (TEST_DB_PORT) with
 * Google mocked at `fetch` and firebase-admin mocked, and drives the
 * Milestone 2 endpoints over HTTP.
 *
 *   docker run -d --rm --name be-m2-pg -e POSTGRES_PASSWORD=test \
 *     -e POSTGRES_DB=crunchy_test -p 55432:5432 postgres:16
 *   TEST_DB_PORT=55432 npm run test:db
 */
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { testDataSource } from './test-data-source';
import {
  JPEG,
  ORIGIN,
  PHOTO_REF,
  PLACE_ID,
  STORAGE,
  fakeGoogle,
} from './google-fake';

// firebase-admin is never reached for real: every send goes to this mock.
const mockSendEach = jest.fn();
jest.mock('firebase-admin', () => {
  const app = {
    messaging: () => ({
      sendEachForMulticast: (...args: any[]) => mockSendEach(...args),
    }),
  };
  return {
    apps: [],
    app: () => app,
    initializeApp: () => app,
    credential: { cert: () => ({}), applicationDefault: () => ({}) },
  };
});

const describeDb = process.env.TEST_DB_PORT ? describe : describe.skip;

type Who = { token: string; id: number };

const PLACE_2 = 'ChIJ_test_place_0002';

describeDb(
  'Milestone 2 HTTP endpoints (AppModule + throwaway Postgres)',
  () => {
    let app: NestExpressApplication;
    let ds: DataSource;
    let fetchMock: jest.SpyInstance;
    let http: ReturnType<typeof request>;
    let worker: { runOnce: () => Promise<number> };
    const storageBefore = new Set<string>();
    const env = { ...process.env };

    let alice: Who;
    let bob: Who;
    let carol: Who;

    const auth = (who: Who) => ({ Authorization: `Bearer ${who.token}` });

    const register = async (email: string, name: string): Promise<Who> => {
      const res = await http
        .post('/api/register')
        .send({
          email,
          password: 'secret123',
          full_name: name,
          user_name: name.toLowerCase(),
        })
        .expect(201);
      return { token: res.body.token, id: res.body.user.id };
    };

    const outbox = () =>
      ds.query(
        `SELECT id, user_id, type, payload, status, attempts FROM push_outbox ORDER BY id`,
      );

    /** Sends everything queued, with FCM answering `responses` per token. */
    const drain = async () => {
      let n = 0;
      while ((await worker.runOnce()) > 0) n++;
      return n;
    };

    beforeAll(async () => {
      ds = testDataSource();
      await ds.initialize();
      await ds.query('DROP SCHEMA public CASCADE');
      await ds.query('CREATE SCHEMA public');
      await ds.runMigrations({ transaction: 'each' });
      await ds.query(
        `INSERT INTO categories (id, name, icon) VALUES (1, 'Italian', 'italian.jpg'), (2, 'Mexican/Latin', NULL)`,
      );

      process.env.GOOGLE_PLACES_API_KEY = 'test-places-key';
      process.env.PUBLIC_BASE_URL = 'https://api.test';
      process.env.PUSH_WORKER_ENABLED = 'false';
      process.env.SHARE_BASE_URL = 'https://share.test';
      process.env.IOS_APP_STORE_ID = '1234567890';
      process.env.ANDROID_PACKAGE = 'com.crunchii';
      process.env.APPLE_TEAM_ID = 'TEAM123456';
      process.env.APPLE_BUNDLE_ID = 'com.crunchy,com.crunchy.web';
      process.env.ANDROID_SHA256_FINGERPRINTS = 'aa:bb:cc, DD:EE:FF ,';
      delete process.env.ALLOW_LEGACY_SOCIAL_LOGIN;

      fetchMock = jest
        .spyOn(global, 'fetch')
        .mockImplementation(async (url: any) => fakeGoogle(String(url)));
      mockSendEach.mockImplementation(async ({ tokens }) => ({
        responses: tokens.map(() => ({ success: true })),
      }));

      if (fs.existsSync(STORAGE)) {
        for (const f of fs.readdirSync(STORAGE, {
          recursive: true,
        }) as string[])
          storageBefore.add(f);
      }

      const { AppModule } = await import('../../src/app.module');
      const { configureApp, configureStaticAssets } = await import(
        '../../src/app.setup'
      );
      const { PushOutboxWorker } = await import(
        '../../src/notifications/push/push-outbox.worker'
      );
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
      configureStaticAssets(app);
      await app.init();
      http = request(app.getHttpServer());
      worker = app.get(PushOutboxWorker);

      alice = await register('alice@example.com', 'Alice');
      bob = await register('bob@example.com', 'Bob');
      carol = await register('carol@example.com', 'Carol');
    });

    afterAll(async () => {
      await app?.close();
      await ds?.destroy();
      fetchMock?.mockRestore();
      process.env = env;
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

    // ------------------------------------------------------------- push

    describe('device tokens and push', () => {
      it('POST /api/device-tokens validates, requires login and upserts', async () => {
        await http
          .post('/api/device-tokens')
          .send({ token: 't', platform: 'ios' })
          .expect(401);
        const bad = await http
          .post('/api/device-tokens')
          .set(auth(alice))
          .send({ token: 'tok-alice-ios', platform: 'windows' })
          .expect(400);
        expect(bad.body.errors.platform).toBeDefined();

        const res = await http
          .post('/api/device-tokens')
          .set(auth(alice))
          .send({
            token: 'tok-alice-ios',
            platform: 'ios',
            appVersion: '2.0.0',
          })
          .expect(201);
        expect(res.body).toEqual({ success: true, data: { ok: true } });
        await http
          .post('/api/device-tokens')
          .set(auth(alice))
          .send({ token: 'tok-alice-android', platform: 'android' })
          .expect(201);
        // Same token again: one row, refreshed.
        await http
          .post('/api/device-tokens')
          .set(auth(alice))
          .send({ token: 'tok-alice-ios', platform: 'ios' })
          .expect(201);
        const rows = await ds.query(
          `SELECT user_id, token, platform, app_version FROM device_tokens ORDER BY token`,
        );
        expect(rows).toEqual([
          {
            user_id: alice.id,
            token: 'tok-alice-android',
            platform: 'android',
            app_version: null,
          },
          {
            user_id: alice.id,
            token: 'tok-alice-ios',
            platform: 'ios',
            app_version: '2.0.0',
          },
        ]);
      });

      it('a token registered by another user moves to them (shared phone)', async () => {
        await http
          .post('/api/device-tokens')
          .set(auth(carol))
          .send({ token: 'tok-shared', platform: 'android' })
          .expect(201);
        await http
          .post('/api/device-tokens')
          .set(auth(bob))
          .send({ token: 'tok-shared', platform: 'android' })
          .expect(201);
        const [row] = await ds.query(
          `SELECT user_id FROM device_tokens WHERE token = 'tok-shared'`,
        );
        expect(row.user_id).toBe(bob.id);
      });

      it('legacy update-device-token writes the users column and the table', async () => {
        const res = await http
          .post('/api/update-device-token')
          .set(auth(carol))
          .send({ fcm_token: 'tok-carol-legacy', extra: 'ignored' })
          .expect(201);
        expect(res.body.success).toBe(true);
        const [user] = await ds.query(
          `SELECT device_token FROM users WHERE id = $1`,
          [carol.id],
        );
        expect(user.device_token).toBe('tok-carol-legacy');
        const [row] = await ds.query(
          `SELECT user_id, platform FROM device_tokens WHERE token = 'tok-carol-legacy'`,
        );
        expect(row).toEqual({ user_id: carol.id, platform: null });
      });

      it('login with a device token (old builds) also registers it', async () => {
        await http
          .post('/api/login')
          .send({
            email: 'carol@example.com',
            password: 'secret123',
            device_token: 'tok-carol-login',
          })
          .expect(201);
        const rows = await ds.query(
          `SELECT token FROM device_tokens WHERE user_id = $1 ORDER BY token`,
          [carol.id],
        );
        expect(rows.map((r) => r.token)).toEqual([
          'tok-carol-legacy',
          'tok-carol-login',
        ]);
      });

      it('DELETE /api/device-tokens/:token removes only your own token', async () => {
        await http
          .delete('/api/device-tokens/tok-carol-login')
          .set(auth(bob))
          .expect(200);
        expect(
          await ds.query(
            `SELECT 1 FROM device_tokens WHERE token = 'tok-carol-login'`,
          ),
        ).toHaveLength(1);
        const res = await http
          .delete(`/api/device-tokens/${encodeURIComponent('tok-carol-login')}`)
          .set(auth(carol))
          .expect(200);
        expect(res.body).toEqual({ success: true, data: { ok: true } });
        expect(
          await ds.query(
            `SELECT 1 FROM device_tokens WHERE token = 'tok-carol-login'`,
          ),
        ).toHaveLength(0);
        // idempotent
        await http
          .delete('/api/device-tokens/tok-carol-login')
          .set(auth(carol))
          .expect(200);
      });

      it('a follow queues one push; the worker sends it to every device of the user', async () => {
        await ds.query(`TRUNCATE push_outbox RESTART IDENTITY`);
        mockSendEach.mockClear();
        // Legacy toggle endpoint: Bob follows Alice.
        await http
          .post('/api/user-follows')
          .set(auth(bob))
          .send({ user_id: alice.id })
          .expect(201);
        const [job] = await outbox();
        expect(job).toEqual(
          expect.objectContaining({
            user_id: alice.id,
            type: 'follow',
            status: 'pending',
            attempts: 0,
          }),
        );
        // Nothing was sent during the request.
        expect(mockSendEach).not.toHaveBeenCalled();

        expect(await drain()).toBe(1);
        expect(mockSendEach).toHaveBeenCalledTimes(1);
        const message = mockSendEach.mock.calls[0][0];
        expect([...message.tokens].sort()).toEqual([
          'tok-alice-android',
          'tok-alice-ios',
        ]);
        const [notification] = await ds.query(
          `SELECT id FROM notifications WHERE user_id = $1 ORDER BY id DESC LIMIT 1`,
          [alice.id],
        );
        expect(message.data).toEqual(
          expect.objectContaining({
            type: 'follow',
            notificationId: String(notification.id),
            userId: String(bob.id),
            link: `/u/${bob.id}`,
          }),
        );
        expect(
          Object.values(message.data).every((v) => typeof v === 'string'),
        ).toBe(true);
        expect(message.android.notification.channelId).toBe('activity');
        expect(message.apns.payload.aps.badge).toBe(1);
        expect(message.notification.body).toBe('Bob started following you');
        expect((await outbox())[0].status).toBe('sent');
      });

      it('dead tokens are deleted; temporary failures are retried', async () => {
        await ds.query(`TRUNCATE push_outbox RESTART IDENTITY`);
        mockSendEach.mockImplementation(async ({ tokens }) => ({
          responses: tokens.map((t: string) =>
            t === 'tok-alice-android'
              ? {
                  success: false,
                  error: {
                    code: 'messaging/registration-token-not-registered',
                  },
                }
              : { success: false, error: { code: 'messaging/internal-error' } },
          ),
        }));
        await http
          .post('/api/user-follows')
          .set(auth(carol))
          .send({ user_id: alice.id })
          .expect(201);
        await worker.runOnce();
        expect(
          await ds.query(`SELECT token FROM device_tokens WHERE user_id = $1`, [
            alice.id,
          ]),
        ).toEqual([{ token: 'tok-alice-ios' }]);
        const [job] = await outbox();
        expect(job).toEqual(
          expect.objectContaining({ status: 'pending', attempts: 1 }),
        );
        mockSendEach.mockImplementation(async ({ tokens }) => ({
          responses: tokens.map(() => ({ success: true })),
        }));
      });

      it('users with notifications off get the notification but no push', async () => {
        await ds.query(`TRUNCATE push_outbox RESTART IDENTITY`);
        await http
          .post('/api/user-setting')
          .set(auth(carol))
          .send({ notifications_enabled: false })
          .expect(201);
        await http
          .post('/api/user-follows')
          .set(auth(alice))
          .send({ user_id: carol.id })
          .expect(201);
        expect(await outbox()).toEqual([]);
        const [{ n }] = await ds.query(
          `SELECT COUNT(*)::int n FROM notifications WHERE user_id = $1`,
          [carol.id],
        );
        expect(n).toBe(1);
        await http
          .post('/api/user-setting')
          .set(auth(carol))
          .send({ notifications_enabled: true })
          .expect(201);
      });
    });

    // ----------------------------------------------------- notifications

    describe('notifications', () => {
      it('GET /api/notifications pages newest first with the contract shape', async () => {
        await http.get('/api/notifications').expect(401);
        const first = await http
          .get('/api/notifications?limit=1')
          .set(auth(alice))
          .expect(200);
        expect(first.body.data.items).toHaveLength(1);
        const n = first.body.data.items[0];
        expect(n).toEqual({
          id: expect.any(String),
          type: 'follow',
          message: 'Carol started following you',
          actor: {
            id: String(carol.id),
            userName: 'carol',
            fullName: 'Carol',
            avatarUrl: null,
          },
          postId: null,
          placeId: null,
          link: `/u/${carol.id}`,
          isRead: false,
          createdAt: expect.stringMatching(/Z$/),
          thumbnailUrl: null,
        });
        expect(first.body.data.nextCursor).toEqual(expect.any(String));
        const second = await http
          .get(
            `/api/notifications?limit=1&cursor=${first.body.data.nextCursor}`,
          )
          .set(auth(alice))
          .expect(200);
        expect(second.body.data.items[0].message).toBe(
          'Bob started following you',
        );
        expect(second.body.data.nextCursor).toBeNull();
        await http
          .get('/api/notifications?cursor=garbage')
          .set(auth(alice))
          .expect(400);
        // Bob's notifications are not Alice's.
        const bobs = await http
          .get('/api/notifications')
          .set(auth(bob))
          .expect(200);
        expect(
          bobs.body.data.items.every((i) => i.actor?.id !== String(bob.id)),
        ).toBe(true);
      });

      it('unread-count and read ({ ids } and { all: true })', async () => {
        const count = await http
          .get('/api/notifications/unread-count')
          .set(auth(alice))
          .expect(200);
        expect(count.body).toEqual({ success: true, data: { count: 2 } });

        const list = await http
          .get('/api/notifications')
          .set(auth(alice))
          .expect(200);
        const res = await http
          .post('/api/notifications/read')
          .set(auth(alice))
          .send({ ids: [list.body.data.items[0].id] })
          .expect(200);
        expect(res.body.data).toEqual({ count: 1 });

        // Someone else's ids are ignored.
        const bobList = await http
          .get('/api/notifications')
          .set(auth(bob))
          .expect(200);
        if (bobList.body.data.items.length) {
          await http
            .post('/api/notifications/read')
            .set(auth(alice))
            .send({ ids: bobList.body.data.items.map((i) => i.id) })
            .expect(200);
          const [{ n }] = await ds.query(
            `SELECT COUNT(*)::int n FROM notifications WHERE user_id = $1 AND is_read`,
            [bob.id],
          );
          expect(n).toBe(0);
        }

        await http
          .post('/api/notifications/read')
          .set(auth(alice))
          .send({})
          .expect(400);
        await http
          .post('/api/notifications/read')
          .set(auth(alice))
          .send({ ids: ['1; DROP TABLE users'] })
          .expect(400);
        const all = await http
          .post('/api/notifications/read')
          .set(auth(alice))
          .send({ all: true })
          .expect(200);
        expect(all.body.data).toEqual({ count: 0 });
      });

      it('legacy getUserNotification still works', async () => {
        const res = await http
          .get('/api/getUserNotification')
          .set(auth(alice))
          .expect(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.length).toBeGreaterThanOrEqual(2);
        expect(JSON.stringify(res.body)).not.toMatch(/"password"/);
      });
    });

    // ------------------------------------------------- set-state likes

    describe('set-state likes and favourites', () => {
      let postId: number;

      beforeAll(async () => {
        const res = await http
          .post('/api/post-save')
          .set(auth(bob))
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
        await ds.query(`TRUNCATE push_outbox RESTART IDENTITY`);
      });

      it('PUT /api/posts/:postId/like validates and needs login', async () => {
        await http
          .put(`/api/posts/${postId}/like`)
          .send({ liked: true })
          .expect(401);
        await http
          .put(`/api/posts/${postId}/like`)
          .set(auth(alice))
          .send({ liked: 'yes' })
          .expect(400);
        await http
          .put(`/api/posts/abc/like`)
          .set(auth(alice))
          .send({ liked: true })
          .expect(404);
        await http
          .put(`/api/posts/999999/like`)
          .set(auth(alice))
          .send({ liked: true })
          .expect(404);
      });

      it('is idempotent, counts atomically and pushes once on false → true', async () => {
        // Five replays at once (an offline queue flushing).
        const results = await Promise.all(
          Array.from({ length: 5 }, () =>
            http
              .put(`/api/posts/${postId}/like`)
              .set(auth(alice))
              .send({ liked: true })
              .expect(200),
          ),
        );
        for (const r of results) expect(r.body.data.liked).toBe(true);
        const again = await http
          .put(`/api/posts/${postId}/like`)
          .set(auth(alice))
          .send({ liked: true })
          .expect(200);
        expect(again.body).toEqual({
          success: true,
          data: { liked: true, likesCount: 1 },
        });
        const jobs = await outbox();
        expect(jobs).toHaveLength(1);
        expect(jobs[0]).toEqual(
          expect.objectContaining({ user_id: bob.id, type: 'like' }),
        );
        expect(jobs[0].payload.data).toEqual(
          expect.objectContaining({
            type: 'like',
            postId: String(postId),
            userId: String(alice.id),
            link: `/p/${postId}`,
          }),
        );

        const off = await http
          .put(`/api/posts/${postId}/like`)
          .set(auth(alice))
          .send({ liked: false })
          .expect(200);
        expect(off.body.data).toEqual({ liked: false, likesCount: 0 });
        await http
          .put(`/api/posts/${postId}/like`)
          .set(auth(alice))
          .send({ liked: false })
          .expect(200);
        const [{ likes_count }] = await ds.query(
          `SELECT likes_count FROM posts WHERE id = $1`,
          [postId],
        );
        expect(likes_count).toBe(0);
        expect(await outbox()).toHaveLength(1);
      });

      it('liking your own post never pushes', async () => {
        await http
          .put(`/api/posts/${postId}/like`)
          .set(auth(bob))
          .send({ liked: true })
          .expect(200);
        expect(await outbox()).toHaveLength(1);
        await http
          .put(`/api/posts/${postId}/like`)
          .set(auth(bob))
          .send({ liked: false })
          .expect(200);
      });

      it('the legacy post_like toggle still works', async () => {
        const on = await http
          .post('/api/post_like')
          .set(auth(carol))
          .send({ post_id: postId })
          .expect(201);
        expect(on.body.liked).toBe(true);
        const off = await http
          .post('/api/post_like')
          .set(auth(carol))
          .send({ post_id: postId })
          .expect(201);
        expect(off.body.liked).toBe(false);
      });

      it('PUT /api/places/:placeId/favorite fills the restaurant row and is idempotent', async () => {
        const res = await http
          .put(`/api/places/${PLACE_2}/favorite`)
          .set(auth(alice))
          .send({ favorite: true })
          .expect(200);
        expect(res.body).toEqual({ success: true, data: { favorite: true } });
        await http
          .put(`/api/places/${PLACE_2}/favorite`)
          .set(auth(alice))
          .send({ favorite: true })
          .expect(200);
        const rows = await ds.query(
          `SELECT r.name, r.address, r.google_photo_reference, r.utc_offset_minutes,
                  r.opening_periods IS NOT NULL AS has_hours
             FROM restaurants r WHERE r.google_place_id = $1`,
          [PLACE_2],
        );
        expect(rows).toEqual([
          {
            name: 'Trattoria Test',
            address: '1226 University Dr, Palm Desert, CA 92211, USA',
            google_photo_reference: PHOTO_REF,
            utc_offset_minutes: -420,
            has_hours: true,
          },
        ]);
        const [{ n }] = await ds.query(
          `SELECT COUNT(*)::int n FROM favorites f JOIN restaurants r ON r.id = f.restaurant_id
            WHERE r.google_place_id = $1`,
          [PLACE_2],
        );
        expect(n).toBe(1);
      });

      it('a place like and a favourite are one saved state', async () => {
        const like = await http
          .put(`/api/places/${PLACE_2}/like`)
          .set(auth(alice))
          .send({ liked: true })
          .expect(200);
        expect(like.body.data).toEqual({ liked: true, likesCount: 1 });
        await http
          .put(`/api/places/${PLACE_2}/like`)
          .set(auth(bob))
          .send({ liked: true })
          .expect(200);

        const details = await http
          .get(`/api/places/${PLACE_2}`)
          .set(auth(alice))
          .expect(200);
        expect(details.body.data).toEqual(
          expect.objectContaining({
            isLiked: true,
            isFavorite: true,
            likesCount: 2,
          }),
        );
        const boot = await http
          .get('/api/bootstrap')
          .set(auth(alice))
          .expect(200);
        expect(boot.body.data.likedPlaceIds).toEqual(
          boot.body.data.favoritePlaceIds,
        );
        expect(boot.body.data.favoritePlaceIds).toContain(PLACE_2);

        // Un-liking removes the favourite too.
        const unlike = await http
          .put(`/api/places/${PLACE_2}/like`)
          .set(auth(alice))
          .send({ liked: false })
          .expect(200);
        expect(unlike.body.data).toEqual({ liked: false, likesCount: 1 });
        const after = await http
          .get(`/api/places/${PLACE_2}`)
          .set(auth(alice))
          .expect(200);
        expect(after.body.data.isFavorite).toBe(false);
        await http
          .put(`/api/places/${PLACE_2}/favorite`)
          .set(auth(alice))
          .send({ favorite: false })
          .expect(200);
        // No pushes for places (they have no owner).
        expect(
          (await outbox()).every(
            (j) => j.type !== 'like' || j.user_id === bob.id,
          ),
        ).toBe(true);
      });

      it('concurrent first saves create one restaurant row', async () => {
        const PLACE_3 = 'ChIJ_test_place_0003';
        await Promise.all(
          [alice, bob, carol].map((who) =>
            http
              .put(`/api/places/${PLACE_3}/favorite`)
              .set(auth(who))
              .send({ favorite: true })
              .expect(200),
          ),
        );
        const rows = await ds.query(
          `SELECT id FROM restaurants WHERE google_place_id = $1`,
          [PLACE_3],
        );
        expect(rows).toHaveLength(1);
        const res = await http
          .put(`/api/places/${PLACE_3}/like`)
          .set(auth(alice))
          .send({ liked: true })
          .expect(200);
        expect(res.body.data.likesCount).toBe(3);
      });

      it('unknown places 404; a Google outage still saves (placeholder row)', async () => {
        await http
          .put('/api/places/ChIJ_MISSING_place/favorite')
          .set(auth(alice))
          .send({ favorite: true })
          .expect(404);
        await http
          .put('/api/places/bad%20id!/favorite')
          .set(auth(alice))
          .send({ favorite: true })
          .expect(400);
        const res = await http
          .put('/api/places/ChIJ_BROKEN_place/favorite')
          .set(auth(alice))
          .send({ favorite: true })
          .expect(200);
        expect(res.body.data).toEqual({ favorite: true });
        const [row] = await ds.query(
          `SELECT name FROM restaurants WHERE google_place_id = 'ChIJ_BROKEN_place'`,
        );
        expect(row.name).toBe('Unknown Restaurant');
      });

      it('legacy googlelike / favoriteplace toggles still work on the same state', async () => {
        const on = await http
          .post('/api/googlelike')
          .set(auth(carol))
          .send({ restaurant_id: PLACE_2, name: 'Trattoria Test' })
          .expect(201);
        expect(on.body.liked).toBe(true);
        const res = await http
          .put(`/api/places/${PLACE_2}/favorite`)
          .set(auth(carol))
          .send({ favorite: true })
          .expect(200);
        expect(res.body.data.favorite).toBe(true);
        const off = await http
          .post('/api/favoriteplace')
          .set(auth(carol))
          .send({ google_place_id: PLACE_2 })
          .expect(201);
        expect(off.body.favorited).toBe(false);
      });
    });

    // ---------------------------------------------------------- comments

    describe('comments', () => {
      let postId: number;
      const ids: string[] = [];

      beforeAll(async () => {
        const [row] = await ds.query(
          `SELECT id FROM posts WHERE user_id = $1 ORDER BY id LIMIT 1`,
          [bob.id],
        );
        postId = row.id;
        await ds.query(`TRUNCATE push_outbox RESTART IDENTITY`);
      });

      it('POST validates 1–500 chars and needs login', async () => {
        await http
          .post(`/api/posts/${postId}/comments`)
          .send({ text: 'hi' })
          .expect(401);
        for (const text of ['', '   ', 'x'.repeat(501)]) {
          const res = await http
            .post(`/api/posts/${postId}/comments`)
            .set(auth(alice))
            .send({ text })
            .expect(400);
          expect(res.body.errors.text).toBeDefined();
        }
        await http
          .post(`/api/posts/999999/comments`)
          .set(auth(alice))
          .send({ text: 'hi' })
          .expect(404);
      });

      it('creates comments, counts them and notifies the post owner through the outbox', async () => {
        const res = await http
          .post(`/api/posts/${postId}/comments`)
          .set(auth(alice))
          .send({ text: '  Looks <b>amazing</b>!  ' })
          .expect(201);
        expect(res.body).toEqual({
          success: true,
          data: {
            id: expect.any(String),
            text: 'Looks <b>amazing</b>!',
            user: {
              id: String(alice.id),
              userName: 'alice',
              fullName: 'Alice',
              avatarUrl: null,
            },
            createdAt: expect.stringMatching(/Z$/),
            canDelete: true,
          },
        });
        ids.push(res.body.data.id);
        for (const [who, text] of [
          [carol, 'second'],
          [bob, 'owner reply'],
          [alice, 'x'.repeat(500)],
        ] as [Who, string][]) {
          const r = await http
            .post(`/api/posts/${postId}/comments`)
            .set(auth(who))
            .send({ text })
            .expect(201);
          ids.push(r.body.data.id);
        }
        const [{ comments_count }] = await ds.query(
          `SELECT comments_count FROM posts WHERE id = $1`,
          [postId],
        );
        expect(comments_count).toBe(4);
        // Alice (twice) and Carol notify Bob; Bob's own reply does not.
        const jobs = await outbox();
        expect(jobs.map((j) => [j.user_id, j.type])).toEqual([
          [bob.id, 'comment'],
          [bob.id, 'comment'],
          [bob.id, 'comment'],
        ]);
        expect(jobs[0].payload.data.link).toBe(`/p/${postId}`);
      });

      it('GET lists oldest first with canDelete per viewer, for guests too', async () => {
        const guest = await http
          .get(`/api/posts/${postId}/comments?limit=2`)
          .expect(200);
        expect(guest.body.data.items.map((c) => c.id)).toEqual(ids.slice(0, 2));
        expect(guest.body.data.items.every((c) => c.canDelete === false)).toBe(
          true,
        );
        const next = await http
          .get(
            `/api/posts/${postId}/comments?limit=2&cursor=${guest.body.data.nextCursor}`,
          )
          .expect(200);
        expect(next.body.data.items.map((c) => c.id)).toEqual(ids.slice(2, 4));
        expect(next.body.data.nextCursor).toBeNull();

        const asCarol = await http
          .get(`/api/posts/${postId}/comments`)
          .set(auth(carol))
          .expect(200);
        expect(asCarol.body.data.items.map((c) => c.canDelete)).toEqual([
          false,
          true,
          false,
          false,
        ]);
        // The post owner may delete every comment.
        const asBob = await http
          .get(`/api/posts/${postId}/comments`)
          .set(auth(bob))
          .expect(200);
        expect(asBob.body.data.items.every((c) => c.canDelete)).toBe(true);
        expect(JSON.stringify(asBob.body)).not.toMatch(
          /@example\.com|password/,
        );
      });

      it('DELETE: author or post owner only', async () => {
        await http.delete(`/api/comments/${ids[0]}`).expect(401);
        await http
          .delete(`/api/comments/${ids[0]}`)
          .set(auth(carol))
          .expect(403);
        const own = await http
          .delete(`/api/comments/${ids[1]}`)
          .set(auth(carol))
          .expect(200);
        expect(own.body).toEqual({
          success: true,
          data: { ok: true, commentsCount: 3 },
        });
        const byOwner = await http
          .delete(`/api/comments/${ids[0]}`)
          .set(auth(bob))
          .expect(200);
        expect(byOwner.body.data.commentsCount).toBe(2);
        await http.delete(`/api/comments/${ids[0]}`).set(auth(bob)).expect(404);
        await http.delete(`/api/comments/abc`).set(auth(bob)).expect(404);
      });

      it('legacy comment-post still works and now caps the length at 500', async () => {
        const ok = await http
          .post('/api/comment-post')
          .set(auth(carol))
          .send({ post_id: postId, comment: 'legacy' })
          .expect(201);
        expect(ok.body.success).toBe(true);
        await http
          .post('/api/comment-post')
          .set(auth(carol))
          .send({ post_id: postId, comment: 'x'.repeat(501) })
          .expect(400);
      });
    });

    // ------------------------------------------------------------- posts

    describe('posts', () => {
      const valid = {
        description: 'Tacos!',
        images: ['image-u3-1-a.jpg', 'image-u3-1-b.mp4'],
        rating: 4,
        restaurant: 'Trattoria Test',
        restaurant_id: PLACE_ID,
        latitude: ORIGIN.lat,
        longitude: ORIGIN.lng,
      };
      let postId: string;

      it('post-save validates the new rules (400 with field errors)', async () => {
        const cases: [Record<string, unknown>, string][] = [
          [{ description: 'x'.repeat(1001) }, 'description'],
          [{ images: [] }, 'images'],
          [
            { images: Array.from({ length: 11 }, (_, i) => `i${i}.jpg`) },
            'images',
          ],
          [{ images: undefined }, 'images'],
          [{ rating: 6 }, 'rating'],
          [{ rating: 0 }, 'rating'],
          [{ rating: undefined }, 'rating'],
          [{ restaurant_id: undefined }, 'restaurant_id'],
          [{ restaurant_id: '' }, 'restaurant_id'],
        ];
        for (const [patch, field] of cases) {
          const res = await http
            .post('/api/post-save')
            .set(auth(carol))
            .send({ ...valid, ...patch })
            .expect(400);
          expect(res.body.errors[field]).toBeDefined();
        }
      });

      it('post-save returns the legacy shape plus data.postId; category defaults to the first one', async () => {
        const res = await http
          .post('/api/post-save')
          .set(auth(carol))
          .send(valid)
          .expect(201);
        expect(res.body.success).toBe(true);
        expect(res.body.post.id).toEqual(expect.any(Number));
        expect(res.body.data).toEqual({ postId: String(res.body.post.id) });
        postId = res.body.data.postId;
        const [row] = await ds.query(
          `SELECT category_id, rating::float AS rating FROM posts WHERE id = $1`,
          [postId],
        );
        expect(row).toEqual({ category_id: 1, rating: 4 });
      });

      it('legacy quarter-star ratings are rounded, not rejected', async () => {
        const res = await http
          .post('/api/post-save')
          .set(auth(carol))
          .send({ ...valid, rating: 3.75, category_id: 2, user_id: carol.id })
          .expect(201);
        const [row] = await ds.query(
          `SELECT category_id, rating::float AS rating FROM posts WHERE id = $1`,
          [res.body.data.postId],
        );
        expect(row).toEqual({ category_id: 2, rating: 4 });
        await ds.query(`UPDATE posts SET is_active = false WHERE id = $1`, [
          res.body.data.postId,
        ]);
      });

      it('GET /api/posts/:postId returns the contract Post for guests and users', async () => {
        await http
          .put(`/api/posts/${postId}/like`)
          .set(auth(alice))
          .send({ liked: true })
          .expect(200);
        const guest = await http.get(`/api/posts/${postId}`).expect(200);
        expect(guest.body.data).toEqual({
          postId,
          user: {
            id: String(carol.id),
            userName: 'carol',
            fullName: 'Carol',
            avatarUrl: null,
          },
          place: expect.objectContaining({
            placeId: PLACE_ID,
            name: 'Trattoria Test',
          }),
          description: 'Tacos!',
          rating: 4,
          media: [
            {
              url: 'https://api.test/storage/image-u3-1-a.jpg',
              type: 'image',
              thumbnailUrl: null,
            },
            {
              url: 'https://api.test/storage/image-u3-1-b.mp4',
              type: 'video',
              thumbnailUrl: null,
            },
          ],
          likesCount: 1,
          commentsCount: 0,
          isLiked: false,
          createdAt: expect.stringMatching(/Z$/),
          distanceM: null,
        });
        const mine = await http
          .get(`/api/posts/${postId}`)
          .set(auth(alice))
          .expect(200);
        expect(mine.body.data.isLiked).toBe(true);
        expect(JSON.stringify(mine.body)).not.toMatch(
          /@example\.com|password|device_token/,
        );
      });

      it('GET /api/posts/:postId 404s for hidden, missing or malformed ids', async () => {
        const [hidden] = await ds.query(
          `SELECT id FROM posts WHERE is_active = false LIMIT 1`,
        );
        await http.get(`/api/posts/${hidden.id}`).expect(404);
        await http.get('/api/posts/999999').expect(404);
        const bad = await http.get('/api/posts/1;DROP').expect(404);
        expect(bad.body.success).toBe(false);
      });

      it('imageupload stores HEIC as JPEG and rejects other types with 415', async () => {
        const res = await http
          .post('/api/imageupload')
          .set(auth(alice))
          .attach(
            'image',
            path.join(__dirname, '..', 'fixtures', 'tiny.heic'),
            {
              filename: 'IMG_0001.HEIC',
              contentType: 'image/heic',
            },
          )
          .expect(201);
        expect(res.body.url).toMatch(
          new RegExp(`^image-u${alice.id}-\\d+-\\d+\\.jpg$`),
        );
        const stored = fs.readFileSync(path.join(STORAGE, res.body.url));
        expect([...stored.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
        expect(
          fs.existsSync(
            path.join(STORAGE, res.body.url.replace(/\.jpg$/, '.heic')),
          ),
        ).toBe(false);

        const png = await http
          .post('/api/imageupload')
          .set(auth(alice))
          .attach('image', JPEG, {
            filename: 'a.png',
            contentType: 'image/png',
          })
          .expect(201);
        expect(png.body.url).toMatch(/\.png$/);

        const txt = await http
          .post('/api/imageupload')
          .set(auth(alice))
          .attach('image', Buffer.from('hello'), {
            filename: 'notes.txt',
            contentType: 'text/plain',
          })
          .expect(415);
        expect(txt.body.success).toBe(false);
      });
    });

    // ------------------------------------------------------------- users

    describe('users and profile', () => {
      it('GET /api/users/search matches userName/fullName only, with counts', async () => {
        await http.get('/api/users/search?q=ali').expect(401);
        const res = await http
          .get('/api/users/search?q=ALI')
          .set(auth(bob))
          .expect(200);
        expect(res.body.data).toEqual({
          items: [
            {
              id: String(alice.id),
              userName: 'alice',
              fullName: 'Alice',
              avatarUrl: null,
              followersCount: 2,
              postsCount: 0,
              isFollowing: true,
            },
          ],
          nextCursor: null,
        });
        for (const q of ['example.com', '%', '_', '']) {
          const r = await http
            .get(`/api/users/search?q=${encodeURIComponent(q)}`)
            .set(auth(bob))
            .expect(200);
          expect(r.body.data.items).toEqual([]);
        }
        // Prefix matches first, then pages with a cursor.
        const page1 = await http
          .get('/api/users/search?q=o&limit=1')
          .set(auth(alice))
          .expect(200);
        expect(page1.body.data.items).toHaveLength(1);
        const page2 = await http
          .get(
            `/api/users/search?q=o&limit=1&cursor=${page1.body.data.nextCursor}`,
          )
          .set(auth(alice))
          .expect(200);
        expect(page2.body.data.items[0].id).not.toBe(
          page1.body.data.items[0].id,
        );
      });

      it('GET /api/users/:userId shows counts, isFollowing and isMe', async () => {
        const guest = await http.get(`/api/users/${alice.id}`).expect(200);
        expect(guest.body.data).toEqual({
          id: String(alice.id),
          userName: 'alice',
          fullName: 'Alice',
          avatarUrl: null,
          bio: null,
          followersCount: 2,
          followingCount: 1,
          postsCount: 0,
          isFollowing: false,
          isMe: false,
        });
        const asBob = await http
          .get(`/api/users/${alice.id}`)
          .set(auth(bob))
          .expect(200);
        expect(asBob.body.data.isFollowing).toBe(true);
        const me = await http
          .get(`/api/users/${alice.id}`)
          .set(auth(alice))
          .expect(200);
        expect(me.body.data.isMe).toBe(true);
        expect(JSON.stringify(me.body)).not.toMatch(/@example\.com|password/);
        await http.get('/api/users/999999').expect(404);
        await http.get('/api/users/abc').expect(404);
      });

      it('GET /api/users/:userId/posts pages active posts newest first', async () => {
        const res = await http
          .get(`/api/users/${carol.id}/posts?limit=1`)
          .set(auth(alice))
          .expect(200);
        expect(res.body.data.items).toHaveLength(1);
        expect(res.body.data.items[0].user.id).toBe(String(carol.id));
        expect(res.body.data.items[0].isLiked).toBe(true);
        expect(res.body.data.nextCursor).toBeNull(); // the other one is hidden
        const bobs = await http.get(`/api/users/${bob.id}/posts`).expect(200);
        expect(bobs.body.data.items.map((p) => p.description)).toEqual([
          'Great carbonara',
        ]);
      });

      it('GET /api/users/:userId/favorites builds PlaceSummary from restaurants and the cache', async () => {
        const res = await http
          .get(`/api/users/${alice.id}/favorites`)
          .set(auth(alice))
          .expect(200);
        const items = res.body.data.items;
        expect(items.map((p) => p.placeId)).toEqual([
          'ChIJ_BROKEN_place',
          'ChIJ_test_place_0003',
        ]);
        // From the details cache:
        expect(items[1]).toEqual(
          expect.objectContaining({
            name: 'Trattoria Test',
            city: 'Palm Desert',
            likesCount: 3,
            isLiked: true,
            isFavorite: true,
            utcOffsetMinutes: -420,
          }),
        );
        expect(items[1].photos[0].url).toBe(
          `https://api.test/api/places/photo/${PHOTO_REF}?w=800`,
        );
        // From the restaurants row only (Google was down when it was saved):
        expect(items[0]).toEqual({
          placeId: 'ChIJ_BROKEN_place',
          name: 'Unknown Restaurant',
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
          likesCount: 1,
          isLiked: true,
          isFavorite: true,
        });
        const guest = await http
          .get(`/api/users/${alice.id}/favorites?limit=1`)
          .expect(200);
        expect(guest.body.data.items[0].isFavorite).toBe(false);
        expect(guest.body.data.nextCursor).toEqual(expect.any(String));
        expect(JSON.stringify(res.body)).not.toContain('test-places-key');
      });

      it('PUT /api/users/:userId/follow is idempotent and notifies once', async () => {
        await ds.query(`TRUNCATE push_outbox RESTART IDENTITY`);
        await http
          .put(`/api/users/${bob.id}/follow`)
          .set(auth(bob))
          .send({ following: true })
          .expect(400);
        await http
          .put(`/api/users/999999/follow`)
          .set(auth(bob))
          .send({ following: true })
          .expect(404);
        for (let i = 0; i < 2; i++) {
          const res = await http
            .put(`/api/users/${carol.id}/follow`)
            .set(auth(bob))
            .send({ following: true })
            .expect(200);
          expect(res.body.data).toEqual({ following: true, followersCount: 2 });
        }
        expect((await outbox()).map((j) => [j.user_id, j.type])).toEqual([
          [carol.id, 'follow'],
        ]);
        const off = await http
          .put(`/api/users/${carol.id}/follow`)
          .set(auth(bob))
          .send({ following: false })
          .expect(200);
        expect(off.body.data).toEqual({ following: false, followersCount: 1 });
        await http
          .put(`/api/users/${carol.id}/follow`)
          .set(auth(bob))
          .send({ following: false })
          .expect(200);
      });

      it('PATCH /api/me updates the profile; a taken userName is 409', async () => {
        await http.patch('/api/me').send({ bio: 'x' }).expect(401);
        const taken = await http
          .patch('/api/me')
          .set(auth(alice))
          .send({ userName: 'BOB' })
          .expect(409);
        expect(taken.body).toEqual(
          expect.objectContaining({
            success: false,
            message: 'That username is taken',
          }),
        );
        await http
          .patch('/api/me')
          .set(auth(alice))
          .send({ bio: 'x'.repeat(161) })
          .expect(400);
        await http
          .patch('/api/me')
          .set(auth(alice))
          .send({ userName: 'no spaces allowed' })
          .expect(400);
        await http
          .patch('/api/me')
          .set(auth(alice))
          .send({ email: 'x@y.z' })
          .expect(400);
        for (const avatarUrl of [
          '../package.json',
          'https://evil.example/x.jpg',
          '/storage/missing.jpg',
        ]) {
          await http
            .patch('/api/me')
            .set(auth(alice))
            .send({ avatarUrl })
            .expect(400);
        }

        const upload = await http
          .post('/api/imageupload')
          .set(auth(alice))
          .attach('image', JPEG, {
            filename: 'me.jpg',
            contentType: 'image/jpeg',
          })
          .expect(201);
        const res = await http
          .patch('/api/me')
          .set(auth(alice))
          .send({
            fullName: '  Alice A.  ',
            userName: 'alice.a',
            bio: 'Pasta hunter',
            avatarUrl: `https://api.test/storage/${upload.body.url}`,
          })
          .expect(200);
        expect(res.body.data).toEqual({
          id: String(alice.id),
          userName: 'alice.a',
          fullName: 'Alice A.',
          avatarUrl: `https://api.test/storage/${upload.body.url}`,
          bio: 'Pasta hunter',
        });
        // Keeping your own name (any case) is fine; empty bio clears it.
        const again = await http
          .patch('/api/me')
          .set(auth(alice))
          .send({ userName: 'Alice.A', bio: '' })
          .expect(200);
        expect(again.body.data).toEqual(
          expect.objectContaining({ userName: 'Alice.A', bio: null }),
        );
        const cleared = await http
          .patch('/api/me')
          .set(auth(alice))
          .send({ avatarUrl: null })
          .expect(200);
        expect(cleared.body.data.avatarUrl).toBeNull();
      });

      it('DELETE /api/me removes the account, its rows everywhere and its uploads', async () => {
        const dave = await register('dave@example.com', 'Dave');
        const upload = await http
          .post('/api/imageupload')
          .set(auth(dave))
          .attach('image', JPEG, {
            filename: 'd.jpg',
            contentType: 'image/jpeg',
          })
          .expect(201);
        const orphan = await http
          .post('/api/imageupload')
          .set(auth(dave))
          .attach('image', JPEG, {
            filename: 'o.jpg',
            contentType: 'image/jpeg',
          })
          .expect(201);
        // A legacy upload (no owner in the name) used by Dave's post, and
        // one also used by someone else's post (must stay).
        fs.writeFileSync(path.join(STORAGE, 'image-legacy-dave-1.jpg'), JPEG);
        fs.writeFileSync(path.join(STORAGE, 'image-legacy-shared-1.jpg'), JPEG);
        const post = await http
          .post('/api/post-save')
          .set(auth(dave))
          .send({
            description: 'Dave was here',
            images: [
              upload.body.url,
              'image-legacy-dave-1.jpg',
              'image-legacy-shared-1.jpg',
            ],
            rating: 3,
            restaurant_id: PLACE_ID,
          })
          .expect(201);
        await ds.query(
          `UPDATE posts SET images = '["image-legacy-shared-1.jpg"]' WHERE user_id = $1`,
          [bob.id],
        );
        const [bobPost] = await ds.query(
          `SELECT id FROM posts WHERE user_id = $1 LIMIT 1`,
          [bob.id],
        );
        await http
          .put(`/api/posts/${bobPost.id}/like`)
          .set(auth(dave))
          .send({ liked: true })
          .expect(200);
        await http
          .post(`/api/posts/${bobPost.id}/comments`)
          .set(auth(dave))
          .send({ text: 'nice' })
          .expect(201);
        await http
          .put(`/api/posts/${post.body.data.postId}/like`)
          .set(auth(bob))
          .send({ liked: true })
          .expect(200);
        await http
          .put(`/api/users/${alice.id}/follow`)
          .set(auth(dave))
          .send({ following: true })
          .expect(200);
        await http
          .put(`/api/users/${dave.id}/follow`)
          .set(auth(carol))
          .send({ following: true })
          .expect(200);
        await http
          .put(`/api/places/${PLACE_2}/favorite`)
          .set(auth(dave))
          .send({ favorite: true })
          .expect(200);
        await http
          .post('/api/device-tokens')
          .set(auth(dave))
          .send({ token: 'tok-dave', platform: 'ios' })
          .expect(201);
        await http
          .post('/api/user-setting')
          .set(auth(dave))
          .send({ notifications_enabled: true })
          .expect(201);
        await http
          .patch('/api/me')
          .set(auth(dave))
          .send({ avatarUrl: `/storage/${orphan.body.url}` })
          .expect(200);
        const before = await ds.query(
          `SELECT likes_count, comments_count FROM posts WHERE id = $1`,
          [bobPost.id],
        );

        await http.delete('/api/me').expect(401);
        const res = await http.delete('/api/me').set(auth(dave)).expect(200);
        expect(res.body).toEqual({ success: true, data: { deleted: true } });

        const leftovers = await ds.query(
          `SELECT
             (SELECT COUNT(*) FROM users WHERE id = $1)
           + (SELECT COUNT(*) FROM posts WHERE user_id = $1)
           + (SELECT COUNT(*) FROM likes WHERE user_id = $1)
           + (SELECT COUNT(*) FROM comments WHERE user_id = $1)
           + (SELECT COUNT(*) FROM favorites WHERE user_id = $1)
           + (SELECT COUNT(*) FROM follows WHERE follower_id = $1 OR following_id = $1)
           + (SELECT COUNT(*) FROM device_tokens WHERE user_id = $1)
           + (SELECT COUNT(*) FROM push_outbox WHERE user_id = $1)
           + (SELECT COUNT(*) FROM user_settings WHERE user_id = $1)
           + (SELECT COUNT(*) FROM notifications WHERE user_id = $1 OR actor_user_id = $1)
             AS n`,
          [dave.id],
        );
        expect(Number(leftovers[0].n)).toBe(0);
        const after = await ds.query(
          `SELECT likes_count, comments_count FROM posts WHERE id = $1`,
          [bobPost.id],
        );
        expect(after[0].likes_count).toBe(before[0].likes_count - 1);
        expect(after[0].comments_count).toBe(before[0].comments_count - 1);

        const exists = (f: string) => fs.existsSync(path.join(STORAGE, f));
        expect(exists(upload.body.url)).toBe(false);
        expect(exists(orphan.body.url)).toBe(false);
        expect(exists('image-legacy-dave-1.jpg')).toBe(false);
        expect(exists('image-legacy-shared-1.jpg')).toBe(true);

        await http.get(`/api/users/${dave.id}`).expect(404);
        await http.delete('/api/me').set(auth(dave)).expect(404);
      });
    });

    // ------------------------------------------------------------- share

    describe('share pages and app-link files', () => {
      const expectHtml = (res: request.Response, status: number) => {
        expect(res.status).toBe(status);
        expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
        expect(res.headers['cache-control']).toBe('public, max-age=300');
        expect(res.headers['content-security-policy']).toMatch(
          /default-src 'none'/,
        );
      };

      it('GET /p/:postId renders OG/Twitter tags, the smart banner and store buttons', async () => {
        const [post] = await ds.query(
          `SELECT id FROM posts WHERE user_id = $1 AND is_active ORDER BY id LIMIT 1`,
          [carol.id],
        );
        const res = await http.get(`/p/${post.id}`);
        expectHtml(res, 200);
        const html = res.text;
        expect(html).toContain(
          '<meta property="og:title" content="Trattoria Test">',
        );
        expect(html).toContain(
          // No details cached for this place yet, so no city.
          '<meta property="og:description" content="★ 4 · Italian">',
        );
        expect(html).toContain(
          '<meta property="og:image" content="https://api.test/storage/image-u3-1-a.jpg">',
        );
        expect(html).toContain(
          `<meta property="og:url" content="https://share.test/p/${post.id}">`,
        );
        expect(html).toContain(
          '<meta name="twitter:card" content="summary_large_image">',
        );
        expect(html).toContain(
          `<meta name="apple-itunes-app" content="app-id=1234567890, app-argument=https://share.test/p/${post.id}">`,
        );
        expect(html).toContain('https://apps.apple.com/app/id1234567890');
        expect(html).toContain(
          'https://play.google.com/store/apps/details?id=com.crunchii',
        );
        expect(html).toContain('Review by @carol');
        expect(html).not.toMatch(/test-places-key|@example\.com/);
      });

      it('hidden, missing or malformed posts get the 404 page', async () => {
        const [hidden] = await ds.query(
          `SELECT id FROM posts WHERE is_active = false LIMIT 1`,
        );
        for (const p of [`/p/${hidden.id}`, '/p/999999', '/p/abc']) {
          const res = await http.get(p);
          expectHtml(res, 404);
          expect(res.text).toContain('isn’t available');
        }
      });

      it('GET /r/:placeId uses the proxy photo at 1200 px, never a Google URL', async () => {
        const res = await http.get('/r/ChIJ_test_place_0003');
        expectHtml(res, 200);
        expect(res.text).toContain(
          `<meta property="og:image" content="https://api.test/api/places/photo/${PHOTO_REF}?w=1200">`,
        );
        expect(res.text).toContain(
          '<meta property="og:description" content="★ 4.6 · Restaurant · Palm Desert">',
        );
        expect(res.text).not.toMatch(/googleapis|test-places-key/);
        expectHtml(await http.get('/r/ChIJ_MISSING_share'), 404);
        expectHtml(await http.get('/r/bad%20id'), 404);
      });

      it('GET /u/:userId escapes everything the user typed', async () => {
        await ds.query(
          `UPDATE users SET full_name = $2, bio = $3 WHERE id = $1`,
          [
            bob.id,
            `Bob"><script>alert(1)</script>`,
            `</p><img src=x onerror=alert(2)>`,
          ],
        );
        const res = await http.get(`/u/${bob.id}`);
        expectHtml(res, 200);
        expect(res.text).not.toMatch(/<script|<img src=x/i);
        expect(res.text).toContain(
          'Bob&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt; (@bob)',
        );
        expect(res.text).toContain(
          '&lt;/p&gt;&lt;img src=x onerror=alert(2)&gt;',
        );
        expect(res.text).toMatch(/1 review · \d+ followers? · on Crunchii/);
        expectHtml(await http.get('/u/999999'), 404);
      });

      it('apple-app-site-association: JSON, no redirect, appIDs and components from env', async () => {
        const res = await http
          .get('/.well-known/apple-app-site-association')
          .redirects(0);
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/^application\/json/);
        expect(JSON.parse(res.text)).toEqual({
          applinks: {
            details: [
              {
                appIDs: ['TEAM123456.com.crunchy'],
                components: [{ '/': '/p/*' }, { '/': '/r/*' }, { '/': '/u/*' }],
              },
            ],
          },
        });
      });

      it('assetlinks.json lists the package and fingerprints from env', async () => {
        const res = await http.get('/.well-known/assetlinks.json').redirects(0);
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/^application\/json/);
        expect(res.body).toEqual([
          {
            relation: ['delegate_permission/common.handle_all_urls'],
            target: {
              namespace: 'android_app',
              package_name: 'com.crunchii',
              sha256_cert_fingerprints: ['AA:BB:CC', 'DD:EE:FF'],
            },
          },
        ]);
      });

      it('static files and legal pages still work next to the share routes', async () => {
        const legal = await http.get('/privacy-policy').expect(200);
        expect(legal.headers['content-type']).toMatch(/html/);
        fs.writeFileSync(path.join(STORAGE, 'image-share-static.jpg'), JPEG);
        const img = await http
          .get('/storage/image-share-static.jpg')
          .expect(200);
        expect(Buffer.compare(img.body, JPEG)).toBe(0);
      });
    });
  },
);
