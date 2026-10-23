import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Accounts created before sign-up generated a username have none, so their
 * profiles and share links show an empty "@". Give each one a stable, unique
 * name from the email's local part plus the user id.
 */
export class BackfillUserNames1777300000000 implements MigrationInterface {
  name = 'BackfillUserNames1777300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE users
      SET user_name = LEFT(
            COALESCE(NULLIF(regexp_replace(lower(split_part(email, '@', 1)), '[^a-z0-9._]', '', 'g'), ''), 'user'),
            20
          ) || '_' || id
      WHERE user_name IS NULL OR btrim(user_name) = ''
    `);
  }

  public async down(): Promise<void> {
    // Generated names can't be told apart from chosen ones afterwards; nothing to undo.
  }
}
