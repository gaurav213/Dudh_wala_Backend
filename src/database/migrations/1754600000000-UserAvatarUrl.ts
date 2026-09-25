import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserAvatarUrl1754600000000 implements MigrationInterface {
  name = 'UserAvatarUrl1754600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "avatar_url" varchar(500)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "avatar_url"
    `);
  }
}
