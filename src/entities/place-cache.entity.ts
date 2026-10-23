import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Postgres cache for Google Places responses (no Redis). One row per
 * request key, e.g. "nearby:v1:restaurant|italian:33.72,-116.37:8000:0:p1".
 * `kind` is only for inspection and cleanup.
 */
@Entity('place_cache')
@Index('idx_place_cache_expires_at', ['expires_at'])
export class PlaceCacheEntry {
  @PrimaryColumn({ type: 'text' })
  key: string;

  @Column({ type: 'varchar', length: 32 })
  kind: string;

  @Column({ type: 'jsonb' })
  payload: any;

  @Column({ type: 'timestamptz' })
  expires_at: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
