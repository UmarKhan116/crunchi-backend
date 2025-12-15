import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdvertisementMediaFields1763200000000 implements MigrationInterface {
  name = 'AddAdvertisementMediaFields1763200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "advertisements" ADD COLUMN "type" VARCHAR NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "advertisements" ADD COLUMN "file_name" VARCHAR NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "advertisements" DROP COLUMN "file_name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "advertisements" DROP COLUMN "type"`,
    );
  }
}


