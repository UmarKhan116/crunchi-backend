import {
  PUSH_MAX_RETRIES,
  PushOutboxWorker,
  retryDelayMs,
} from './push-outbox.worker';

const job = (over: Partial<any> = {}) => ({
  id: 1,
  user_id: 7,
  type: 'like',
  payload: { title: 'Crunchii', body: 'Bob liked your post', data: {} },
  status: 'sending',
  attempts: 1,
  ...over,
});

describe('PushOutboxWorker', () => {
  let query: jest.Mock;
  let send: jest.Mock;
  let worker: PushOutboxWorker;

  const make = (enabled = 'true') =>
    new PushOutboxWorker(
      { query } as any,
      { send } as any,
      { get: () => enabled } as any,
    );

  beforeEach(() => {
    query = jest.fn().mockResolvedValue([]);
    send = jest.fn().mockResolvedValue({ status: 'sent' });
    worker = make();
  });

  const updates = () =>
    query.mock.calls.filter(([sql]) =>
      /^\s*UPDATE push_outbox\s+SET status = \$2|SET status = 'failed'|SET status = 'pending'/.test(
        sql,
      ),
    );

  it('claims due rows with FOR UPDATE SKIP LOCKED and a LIMIT, counting the attempt', async () => {
    query.mockResolvedValueOnce([
      [
        { ...job({ id: '9', user_id: '3' }) },
        { ...job({ id: '4', user_id: '3' }) },
      ],
      2,
    ]);
    const rows = await worker.claim(100);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(sql).toMatch(/status = 'pending' AND next_attempt_at <= now\(\)/);
    expect(sql).toMatch(/SET status = 'sending', attempts = o\.attempts \+ 1/);
    expect(sql).toMatch(/LIMIT \$1/);
    expect(params).toEqual([100]);
    // ids are numbers and the batch is processed oldest first
    expect(rows.map((r) => r.id)).toEqual([4, 9]);
    expect(rows[0].user_id).toBe(3);
  });

  it('accepts a plain row array from the driver too', async () => {
    query.mockResolvedValueOnce([job({ id: 2 })]);
    expect((await worker.claim(10)).map((r) => r.id)).toEqual([2]);
  });

  it('marks a delivered job sent', async () => {
    await worker.process(job() as any);
    expect(send).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/SET status = \$2, sent_at = now\(\)/);
    expect(params).toEqual([1, 'sent', null]);
  });

  it('records skipped jobs with the reason', async () => {
    send.mockResolvedValue({ status: 'skipped', detail: 'no device tokens' });
    await worker.process(job() as any);
    expect(query.mock.calls[0][1]).toEqual([1, 'skipped', 'no device tokens']);
  });

  it('puts a failed job back with backoff while retries remain', async () => {
    send.mockRejectedValue(new Error('FCM failed: messaging/internal-error'));
    for (const attempts of [1, 2, 3]) {
      query.mockClear();
      await worker.process(job({ attempts }) as any);
      const [sql, params] = query.mock.calls[0];
      expect(sql).toMatch(/SET status = 'pending'/);
      expect(sql).toMatch(/next_attempt_at = now\(\) \+/);
      expect(params).toEqual([
        1,
        'FCM failed: messaging/internal-error',
        retryDelayMs(attempts),
      ]);
    }
  });

  it('gives up after the first attempt plus 3 retries', async () => {
    send.mockRejectedValue(new Error('boom'));
    await worker.process(job({ attempts: PUSH_MAX_RETRIES + 1 }) as any);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/SET status = 'failed'/);
    expect(params).toEqual([1, 'boom']);
  });

  it('backs off 5 s, 20 s, 80 s', () => {
    expect([1, 2, 3].map(retryDelayMs)).toEqual([5000, 20000, 80000]);
  });

  it('runOnce recovers stale locks, claims and sends each job', async () => {
    query.mockImplementation(async (sql: string) =>
      /FOR UPDATE SKIP LOCKED/.test(sql)
        ? [[job({ id: 1 }), job({ id: 2 })], 2]
        : [],
    );
    expect(await worker.runOnce()).toBe(2);
    expect(send).toHaveBeenCalledTimes(2);
    const sqls = query.mock.calls.map(([sql]) => sql);
    expect(sqls[0]).toMatch(/WHERE status = 'sending'\s+AND locked_at </);
    expect(sqls.some((s) => /DELETE FROM push_outbox/.test(s))).toBe(true);
    expect(updates().length).toBe(2);
  });

  it('does nothing on tick when PUSH_WORKER_ENABLED=false', async () => {
    worker = make('false');
    await worker.tick();
    expect(query).not.toHaveBeenCalled();
  });

  it('never runs two passes at once in one process', async () => {
    let open: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    query.mockImplementation(async () => {
      await gate;
      return [];
    });
    const first = worker.tick();
    await worker.tick(); // returns at once: a pass is still running
    expect(query).toHaveBeenCalledTimes(1);
    open();
    await first;
    const calls = query.mock.calls.length;
    await worker.tick(); // the next tick runs again
    expect(query.mock.calls.length).toBeGreaterThan(calls);
  });
});
