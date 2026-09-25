import { MigrationInterface, QueryRunner } from 'typeorm';

/** Alternate-day + weekly schedules; persist preference on service requests. */
export class AlternateWeeklySchedule1754580000000
  implements MigrationInterface
{
  name = 'AlternateWeeklySchedule1754580000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "subscription_schedule_type_enum" ADD VALUE IF NOT EXISTS 'ALTERNATE_DAYS'`,
    );
    await queryRunner.query(
      `ALTER TYPE "subscription_schedule_type_enum" ADD VALUE IF NOT EXISTS 'WEEKLY'`,
    );

    await queryRunner.query(`
      ALTER TABLE "customer_service_requests"
        ADD COLUMN IF NOT EXISTS "schedule_type" "subscription_schedule_type_enum"
          NOT NULL DEFAULT 'EVERY_DAY'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customer_service_requests" DROP COLUMN IF EXISTS "schedule_type"
    `);
  }
}
