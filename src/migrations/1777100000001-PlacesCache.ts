import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Places proxy (PRD item 2): the Postgres cache for Google responses and the
 * opening-hours columns on restaurants.
 */
export class PlacesCache1777100000001 implements MigrationInterface {
  name = 'PlacesCache1777100000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "place_cache" (
        "key" text NOT NULL,
        "kind" character varying(32) NOT NULL,
        "payload" jsonb NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_84a25b1a25b4aa857af42c547f2" PRIMARY KEY ("key")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_place_cache_expires_at" ON "place_cache" ("expires_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "restaurants" ADD "opening_periods" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "restaurants" ADD "utc_offset_minutes" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "restaurants" ADD "hours_updated_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "restaurants" DROP COLUMN "hours_updated_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "restaurants" DROP COLUMN "utc_offset_minutes"`,
    );
    await queryRunner.query(
      `ALTER TABLE "restaurants" DROP COLUMN "opening_periods"`,
    );
    await queryRunner.query(`DROP INDEX "idx_place_cache_expires_at"`);
    await queryRunner.query(`DROP TABLE "place_cache"`);
  }
}
