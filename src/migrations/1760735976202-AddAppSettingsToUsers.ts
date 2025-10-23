import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAppSettingsToUsers1760735976202 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add app_settings column to users table
    await queryRunner.query(`
            ALTER TABLE "users" 
            ADD COLUMN IF NOT EXISTS "app_settings" jsonb DEFAULT NULL
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove app_settings column from users table
    await queryRunner.query(`
            ALTER TABLE "users" 
            DROP COLUMN IF EXISTS "app_settings"
        `);
  }
}
