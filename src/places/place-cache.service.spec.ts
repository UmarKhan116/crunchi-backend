import { PlaceCacheService } from './place-cache.service';
import { memoryCacheRepo } from '../../test/helpers/memory-cache-repo';

describe('PlaceCacheService', () => {
  const HOUR = 60 * 60_000;
  let clock: number;
  let repo: ReturnType<typeof memoryCacheRepo>;
  let cache: PlaceCacheService;

  beforeEach(() => {
    clock = Date.UTC(2026, 9, 23, 12);
    repo = memoryCacheRepo();
    cache = new PlaceCacheService(repo as any);
    cache.now = () => new Date(clock);
  });

  it('misses, fetches and stores; then hits without fetching', async () => {
    const fetcher = jest.fn().mockResolvedValue({ results: [1, 2] });
    expect(await cache.getOrFetch('k', 'nearby', HOUR, fetcher)).toEqual({
      results: [1, 2],
    });
    expect(await cache.getOrFetch('k', 'nearby', HOUR, fetcher)).toEqual({
      results: [1, 2],
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(repo.rows.get('k').kind).toBe('nearby');
  });

  it('expires after the TTL and fetches again', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce('old')
      .mockResolvedValueOnce('new');
    await cache.getOrFetch('k', 'nearby', HOUR, fetcher);

    clock += HOUR - 1; // still fresh
    expect(await cache.getOrFetch('k', 'nearby', HOUR, fetcher)).toBe('old');

    clock += 2; // just past 60 min
    expect(await cache.getOrFetch('k', 'nearby', HOUR, fetcher)).toBe('new');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('uses each kind’s own TTL', async () => {
    await cache.set('ac', 'autocomplete', 'a', 10 * 60_000);
    await cache.set('det', 'details', 'd', 24 * HOUR);
    clock += 11 * 60_000;
    expect(await cache.get('ac')).toBeNull();
    expect(await cache.get('det')).toBe('d');
    clock += 24 * HOUR;
    expect(await cache.get('det')).toBeNull();
  });

  it('shares one fetch between concurrent misses for the same key', async () => {
    let resolve: (v: string) => void;
    const fetcher = jest.fn(() => new Promise<string>((r) => (resolve = r)));
    const a = cache.getOrFetch('k', 'details', HOUR, fetcher);
    const b = cache.getOrFetch('k', 'details', HOUR, fetcher);
    await new Promise((r) => setImmediate(r));
    resolve('v');
    expect(await Promise.all([a, b])).toEqual(['v', 'v']);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failed fetch', async () => {
    const fetcher = jest
      .fn()
      .mockRejectedValueOnce(new Error('Google down'))
      .mockResolvedValueOnce('ok');
    await expect(
      cache.getOrFetch('k', 'nearby', HOUR, fetcher),
    ).rejects.toThrow('Google down');
    expect(await cache.getOrFetch('k', 'nearby', HOUR, fetcher)).toBe('ok');
  });

  it('getMany returns only fresh keys', async () => {
    await cache.set('a', 'details', 1, HOUR);
    await cache.set('b', 'details', 2, 2 * HOUR);
    clock += HOUR + 1;
    const got = await cache.getMany(['a', 'b', 'c']);
    expect([...got.entries()]).toEqual([['b', 2]]);
  });
});
