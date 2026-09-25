import { MigrationInterface, QueryRunner } from 'typeorm';

export class FarmNoDeliveryTodayNotif1754650000000
  implements MigrationInterface
{
  name = 'FarmNoDeliveryTodayNotif1754650000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'FARM_NO_DELIVERY_TODAY'
    `);
  }

  public async down(): Promise<void> {
    // enum values cannot be removed safely
  }
}
