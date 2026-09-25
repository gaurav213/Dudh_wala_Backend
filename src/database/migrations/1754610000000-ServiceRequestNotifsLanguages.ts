import { MigrationInterface, QueryRunner } from 'typeorm';

export class ServiceRequestNotifsLanguages1754610000000
  implements MigrationInterface
{
  name = 'ServiceRequestNotifsLanguages1754610000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'SERVICE_REQUEST_CREATED'
    `);
    await queryRunner.query(`
      ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'SERVICE_REQUEST_ACCEPTED'
    `);
    await queryRunner.query(`
      ALTER TABLE "farms"
      ADD COLUMN IF NOT EXISTS "spoken_languages" jsonb NOT NULL DEFAULT '[]'::jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "farms" DROP COLUMN IF EXISTS "spoken_languages"
    `);
  }
}
