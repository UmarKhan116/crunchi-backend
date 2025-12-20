import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddActorUserIdToNotifications1700000000002
  implements MigrationInterface
{
  name = 'AddActorUserIdToNotifications1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add actor_user_id column to notifications table
    await queryRunner.query(`
      ALTER TABLE "notifications" 
      ADD COLUMN IF NOT EXISTS "actor_user_id" INTEGER
    `);

    // Add index for better query performance
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_notifications_actor_user_id" 
      ON "notifications" ("actor_user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove index
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_notifications_actor_user_id"
    `);

    // Remove column
    await queryRunner.query(`
      ALTER TABLE "notifications" 
      DROP COLUMN IF EXISTS "actor_user_id"
    `);
  }
}

