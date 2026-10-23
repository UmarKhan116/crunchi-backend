import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, MoreThan, Repository } from 'typeorm';
import { PlaceCacheEntry } from '../entities/place-cache.entity';

export type CacheKind =
  | 'nearby'
  | 'details'
  | 'text'
  | 'autocomplete'
  | 'geocode'
  | 'category';

/**
 * Read-through cache in Postgres (`place_cache`). Expired rows are ignored on
 * read and cleaned up opportunistically on write. Concurrent misses for the
 * same key in this process share one fetch, so a burst of requests for a
 * cell makes one Google call.
 */
@Injectable()
export class PlaceCacheService {
  private readonly logger = new Logger(PlaceCacheService.name);
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private lastCleanup = 0;

  constructor(
    @InjectRepository(PlaceCacheEntry)
    private readonly repo: Repository<PlaceCacheEntry>,
  ) {}

  /** Overridable in tests. */
  now(): Date {
    return new Date();
  }

  async get<T>(key: string): Promise<T | null> {
    const row = await this.repo.findOne({
      where: { key, expires_at: MoreThan(this.now()) },
    });
    return row ? (row.payload as T) : null;
  }

  async getMany<T>(keys: string[]): Promise<Map<string, T>> {
    if (!keys.length) return new Map();
    const rows = await this.repo.find({
      where: { key: In(keys), expires_at: MoreThan(this.now()) },
    });
    return new Map(rows.map((r) => [r.key, r.payload as T]));
  }

  async set(key: string, kind: CacheKind, payload: unknown, ttlMs: number) {
    const now = this.now();
    await this.repo.upsert(
      {
        key,
        kind,
        payload: payload as any,
        expires_at: new Date(now.getTime() + ttlMs),
        created_at: now,
      },
      ['key'],
    );
    this.maybeCleanup(now);
  }

  async getOrFetch<T>(
    key: string,
    kind: CacheKind,
    ttlMs: number,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const pending = this.inFlight.get(key) as Promise<T> | undefined;
    if (pending) return pending;

    const promise = (async () => {
      const value = await fetcher();
      await this.set(key, kind, value, ttlMs);
      return value;
    })().finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise);
    return promise;
  }

  /** At most once a minute per process; never blocks the request. */
  private maybeCleanup(now: Date) {
    if (now.getTime() - this.lastCleanup < 60_000) return;
    this.lastCleanup = now.getTime();
    this.repo
      .delete({ expires_at: LessThan(now) })
      .catch((error) =>
        this.logger.warn(`cache cleanup failed: ${error?.message}`),
      );
  }
}
