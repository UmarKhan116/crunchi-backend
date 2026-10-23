import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Database repair (PRD item C).
 *
 * 1777064415555-new-migration was generated from entities that declared no
 * indexes and no onDelete, so it dropped 14 indexes and turned every
 * ON DELETE CASCADE into NO ACTION (deleting a user failed). This puts them
 * back, adds a lat/lng index for distance queries, and the entities now
 * declare all of it so a future `migration:generate` keeps it.
 *
 * Foreign keys are found by (table, column) rather than by name, so this also
 * works on a database whose constraint names differ (e.g. one built with
 * synchronize). They are re-created with TypeORM's own names.
 */

interface ForeignKeySpec {
  table: string;
  column: string;
  refTable: string;
  name: string;
}

// Names are TypeORM's deterministic ones (the same as 1777064415555 used).
const FOREIGN_KEYS: ForeignKeySpec[] = [
  {
    table: 'posts',
    column: 'user_id',
    refTable: 'users',
    name: 'FK_c4f9a7bd77b489e711277ee5986',
  },
  {
    table: 'likes',
    column: 'user_id',
    refTable: 'users',
    name: 'FK_3f519ed95f775c781a254089171',
  },
  {
    table: 'likes',
    column: 'post_id',
    refTable: 'posts',
    name: 'FK_741df9b9b72f328a6d6f63e79ff',
  },
  {
    table: 'comments',
    column: 'user_id',
    refTable: 'users',
    name: 'FK_4c675567d2a58f0b07cef09c13d',
  },
  {
    table: 'comments',
    column: 'post_id',
    refTable: 'posts',
    name: 'FK_259bf9825d9d198608d1b46b0b5',
  },
  {
    table: 'favorites',
    column: 'user_id',
    refTable: 'users',
    name: 'FK_35a6b05ee3b624d0de01ee50593',
  },
  {
    table: 'favorites',
    column: 'restaurant_id',
    refTable: 'restaurants',
    name: 'FK_61a7e9427fce239c7ff6f3e7186',
  },
  {
    table: 'follows',
    column: 'follower_id',
    refTable: 'users',
    name: 'FK_54b5dc2739f2dea57900933db66',
  },
  {
    table: 'follows',
    column: 'following_id',
    refTable: 'users',
    name: 'FK_c518e3988b9c057920afaf2d8c0',
  },
  {
    table: 'sessions',
    column: 'user_id',
    refTable: 'users',
    name: 'FK_085d540d9f418cfbdc7bd55bb19',
  },
  {
    table: 'user_settings',
    column: 'user_id',
    refTable: 'users',
    name: 'FK_4ed056b9344e6f7d8d46ec4b302',
  },
  {
    table: 'notifications',
    column: 'user_id',
    refTable: 'users',
    name: 'FK_9a8a82462cab47c73d25f49261f',
  },
  {
    table: 'advertisement_views',
    column: 'user_id',
    refTable: 'users',
    name: 'FK_6f010b292835e1bde5dcd9639a6',
  },
  {
    table: 'advertisement_views',
    column: 'advertisement_id',
    refTable: 'advertisements',
    name: 'FK_b636e98f547411dea8ce260db4d',
  },
];

// The 14 non-unique indexes 1777064415555 dropped (see its down()), plus the
// new lat/lng index for the bounding-box prefilter.
const INDEXES: { name: string; table: string; columns: string[] }[] = [
  { name: 'idx_posts_user_id', table: 'posts', columns: ['user_id'] },
  { name: 'idx_posts_category_id', table: 'posts', columns: ['category_id'] },
  {
    name: 'idx_posts_restaurant_id',
    table: 'posts',
    columns: ['restaurant_id'],
  },
  { name: 'idx_posts_created_at', table: 'posts', columns: ['created_at'] },
  { name: 'idx_likes_user_id', table: 'likes', columns: ['user_id'] },
  { name: 'idx_likes_post_id', table: 'likes', columns: ['post_id'] },
  { name: 'idx_comments_post_id', table: 'comments', columns: ['post_id'] },
  { name: 'idx_favorites_user_id', table: 'favorites', columns: ['user_id'] },
  {
    name: 'idx_follows_follower_id',
    table: 'follows',
    columns: ['follower_id'],
  },
  {
    name: 'idx_follows_following_id',
    table: 'follows',
    columns: ['following_id'],
  },
  { name: 'idx_sessions_user_id', table: 'sessions', columns: ['user_id'] },
  {
    name: 'idx_notifications_user_id',
    table: 'notifications',
    columns: ['user_id'],
  },
  {
    name: 'idx_notifications_actor_user_id',
    table: 'notifications',
    columns: ['actor_user_id'],
  },
  {
    name: 'idx_restaurants_google_place_id',
    table: 'restaurants',
    columns: ['google_place_id'],
  },
  {
    name: 'idx_posts_lat_lng',
    table: 'posts',
    columns: ['latitude', 'longitude'],
  },
];

export class RepairIndexesAndCascades1777100000000
  implements MigrationInterface
{
  name = 'RepairIndexesAndCascades1777100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const fk of FOREIGN_KEYS) {
      await this.replaceForeignKey(queryRunner, fk, 'CASCADE');
    }
    for (const index of INDEXES) {
      const columns = index.columns.map((c) => `"${c}"`).join(', ');
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "${index.name}" ON "${index.table}" (${columns})`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Back to the 1777064415555 state: no indexes, NO ACTION foreign keys.
    for (const index of [...INDEXES].reverse()) {
      await queryRunner.query(`DROP INDEX IF EXISTS "${index.name}"`);
    }
    for (const fk of [...FOREIGN_KEYS].reverse()) {
      await this.replaceForeignKey(queryRunner, fk, 'NO ACTION');
    }
  }

  private async replaceForeignKey(
    queryRunner: QueryRunner,
    fk: ForeignKeySpec,
    onDelete: 'CASCADE' | 'NO ACTION',
  ) {
    const existing: { conname: string }[] = await queryRunner.query(
      `SELECT con.conname
         FROM pg_constraint con
         JOIN pg_class rel ON rel.oid = con.conrelid
         JOIN pg_namespace ns ON ns.oid = rel.relnamespace
         JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
        WHERE con.contype = 'f'
          AND ns.nspname = current_schema()
          AND rel.relname = $1
          AND att.attname = $2
          AND array_length(con.conkey, 1) = 1`,
      [fk.table, fk.column],
    );
    for (const { conname } of existing) {
      await queryRunner.query(
        `ALTER TABLE "${fk.table}" DROP CONSTRAINT "${conname}"`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE "${fk.table}" ADD CONSTRAINT "${fk.name}" FOREIGN KEY ("${fk.column}") ` +
        `REFERENCES "${fk.refTable}"("id") ON DELETE ${onDelete} ON UPDATE NO ACTION`,
    );
  }
}
