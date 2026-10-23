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
  },
);
