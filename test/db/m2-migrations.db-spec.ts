/**
 * Milestone 2 migrations on a THROWAWAY Postgres (TEST_DB_PORT, see
 * test-data-source.ts): device_tokens + push_outbox up and down, the copy of
 * users.device_token, cascades, and SKIP LOCKED claiming with real SQL.
 *
 *   TEST_DB_PORT=55432 npm run test:db
 */
import { DataSource, QueryRunner } from 'typeorm';
import { testDataSource } from './test-data-source';
import { PushOutboxWorker } from '../../src/notifications/push/push-outbox.worker';

const describeDb = process.env.TEST_DB_PORT ? describe : describe.skip;

const tableExists = async (ds: DataSource, name: string) =>
  (
    await ds.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [
      `public.${name}`,
    ])
  )[0].ok;

describeDb('Milestone 2 migrations (throwaway Postgres)', () => {
  let ds: DataSource;
  let runner: QueryRunner;
  const migration = () =>
    ds.migrations.find((m) =>
      /^DeviceTokensAndPushOutbox/.test(m.name ?? m.constructor.name),
    );

  beforeAll(async () => {
    ds = testDataSource();
    await ds.initialize();
    await ds.query('DROP SCHEMA public CASCADE');
    await ds.query('CREATE SCHEMA public');
    await ds.runMigrations({ transaction: 'each' });
    runner = ds.createQueryRunner();
  });

  afterAll(async () => {
    await runner?.release();
    await ds?.destroy();
  });

  it('matches the entities (no drift)', async () => {
    const log = await ds.driver.createSchemaBuilder().log();
    expect(log.upQueries.map((q) => q.query)).toEqual([]);
  });

  it('down drops both tables and keeps users.device_token; up copies tokens in', async () => {
    await migration().down(runner);
    expect(await tableExists(ds, 'device_tokens')).toBe(false);
    expect(await tableExists(ds, 'push_outbox')).toBe(false);

    await ds.query(
      `INSERT INTO users (id, email, password, device_token, updated_at) VALUES
         (1, 'a@x.com', 'h', 'tok-shared', '2026-01-01'),
         (2, 'b@x.com', 'h', 'tok-shared', '2026-02-01'),
         (3, 'c@x.com', 'h', '  tok-c  ', '2026-01-01'),
         (4, 'd@x.com', 'h', '', '2026-01-01'),
         (5, 'e@x.com', 'h', NULL, '2026-01-01')`,
    );

    await migration().up(runner);
    const rows = await ds.query(
      `SELECT user_id, token, platform FROM device_tokens ORDER BY token`,
    );
    // The most recently updated owner keeps a shared token; blanks are skipped.
    expect(rows).toEqual([
      { user_id: 3, token: 'tok-c', platform: null },
      { user_id: 2, token: 'tok-shared', platform: null },
    ]);
    const [{ n }] = await ds.query(
      `SELECT COUNT(*)::int n FROM users WHERE device_token IS NOT NULL`,
    );
    expect(n).toBe(4); // the column is untouched

    const log = await ds.driver.createSchemaBuilder().log();
    expect(log.upQueries).toEqual([]);
  });

  it('a token is unique, and deleting a user removes their tokens and queued pushes', async () => {
    await expect(
      ds.query(
        `INSERT INTO device_tokens (user_id, token) VALUES (1, 'tok-c')`,
      ),
    ).rejects.toThrow(/uq_device_tokens_token/);
    await ds.query(
      `INSERT INTO push_outbox (user_id, type, payload) VALUES (2, 'like', '{"title":"t","body":"b","data":{}}')`,
    );
    await ds.query(`DELETE FROM users WHERE id = 2`);
    expect(
      await ds.query(`SELECT token FROM device_tokens WHERE user_id = 2`),
    ).toEqual([]);
    expect(await ds.query(`SELECT id FROM push_outbox`)).toEqual([]);
  });

  it('two workers claiming at once never get the same row (SKIP LOCKED)', async () => {
    await ds.query(`TRUNCATE push_outbox RESTART IDENTITY`);
    await ds.query(
      `INSERT INTO push_outbox (user_id, type, payload, next_attempt_at)
       SELECT 1, 'like', '{"title":"t","body":"b","data":{}}', now() - interval '1 second'
         FROM generate_series(1, 30)`,
    );
    // One row is not due yet.
    await ds.query(
      `INSERT INTO push_outbox (user_id, type, payload, next_attempt_at)
       VALUES (1, 'like', '{"title":"t","body":"b","data":{}}', now() + interval '1 hour')`,
    );
    const config = { get: () => 'false' } as any;
    const a = new PushOutboxWorker(ds, null, config);
    const b = new PushOutboxWorker(ds, null, config);
    const [ra, rb] = await Promise.all([a.claim(20), b.claim(20)]);
    const ids = [...ra, ...rb].map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(30);
    expect(ra.every((r) => r.status === 'sending' && r.attempts === 1)).toBe(
      true,
    );
    expect(await a.claim(20)).toEqual([]);
  });

  it('retries a failed send later and records the error', async () => {
    await ds.query(`TRUNCATE push_outbox RESTART IDENTITY`);
    await ds.query(
      `INSERT INTO push_outbox (user_id, type, payload) VALUES (1, 'like', '{"title":"t","body":"b","data":{}}')`,
    );
    const sender = { send: jest.fn().mockRejectedValue(new Error('quota')) };
    const worker = new PushOutboxWorker(
      ds,
      sender as any,
      {
        get: () => 'false',
      } as any,
    );
    expect(await worker.runOnce()).toBe(1);
    const [row] = await ds.query(
      `SELECT status, attempts, last_error, next_attempt_at > now() + interval '4 seconds' AS later
         FROM push_outbox`,
    );
    expect(row).toEqual({
      status: 'pending',
      attempts: 1,
      last_error: 'quota',
      later: true,
    });
    // Not due yet, so the next pass claims nothing.
    expect(await worker.runOnce()).toBe(0);
  });
});
