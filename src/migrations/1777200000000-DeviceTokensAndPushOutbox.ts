import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * WS7 push: one row per device token (a user can have many devices) and the
 * push_outbox queue. Existing users.device_token values are copied in;
 * that column stays until old app builds are retired.
 */
export class DeviceTokensAndPushOutbox1777200000000
  implements MigrationInterface
{
  name = 'DeviceTokensAndPushOutbox1777200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "device_tokens" (
        "id" SERIAL NOT NULL,
        "user_id" integer NOT NULL,
        "token" text NOT NULL,
        "platform" character varying(16),
        "app_version" character varying(32),
        "last_seen_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_84700be257607cfb1f9dc2e52c3" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_device_tokens_token" ON "device_tokens" ("token")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_device_tokens_user_id" ON "device_tokens" ("user_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "device_tokens" ADD CONSTRAINT "FK_17e1f528b993c6d55def4cf5bea"
         FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // The same token can sit on several users (shared phone, no unique
    // constraint before). The most recently updated user keeps it.
    await queryRunner.query(
      `INSERT INTO "device_tokens" ("user_id", "token", "last_seen_at")
       SELECT DISTINCT ON (btrim(u."device_token"))
              u."id", btrim(u."device_token"), COALESCE(u."updated_at", now())
         FROM "users" u
        WHERE u."device_token" IS NOT NULL AND btrim(u."device_token") <> ''
        ORDER BY btrim(u."device_token"), u."updated_at" DESC NULLS LAST, u."id" DESC`,
    );

    await queryRunner.query(
      `CREATE TABLE "push_outbox" (
        "id" SERIAL NOT NULL,
        "user_id" integer NOT NULL,
        "type" character varying(32) NOT NULL,
        "payload" jsonb NOT NULL,
        "status" character varying(16) NOT NULL DEFAULT 'pending',
        "attempts" integer NOT NULL DEFAULT '0',
        "next_attempt_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "locked_at" TIMESTAMP WITH TIME ZONE,
        "last_error" text,
        "sent_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_2eeb678cf47580cba9958e29fe7" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_push_outbox_status_next_attempt" ON "push_outbox" ("status", "next_attempt_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_push_outbox_user_id" ON "push_outbox" ("user_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "push_outbox" ADD CONSTRAINT "FK_51e986f25389f1379bde97c5c2f"
         FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // users.device_token was never dropped, so nothing needs copying back.
    await queryRunner.query(
      `ALTER TABLE "push_outbox" DROP CONSTRAINT "FK_51e986f25389f1379bde97c5c2f"`,
    );
    await queryRunner.query(`DROP INDEX "idx_push_outbox_user_id"`);
    await queryRunner.query(`DROP INDEX "idx_push_outbox_status_next_attempt"`);
    await queryRunner.query(`DROP TABLE "push_outbox"`);
    await queryRunner.query(
      `ALTER TABLE "device_tokens" DROP CONSTRAINT "FK_17e1f528b993c6d55def4cf5bea"`,
    );
    await queryRunner.query(`DROP INDEX "idx_device_tokens_user_id"`);
    await queryRunner.query(`DROP INDEX "uq_device_tokens_token"`);
    await queryRunner.query(`DROP TABLE "device_tokens"`);
  }
}
