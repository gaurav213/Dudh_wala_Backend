import { MigrationInterface, QueryRunner } from 'typeorm';

export class CustomerNoMilkTodayNotif1754640000000
  implements MigrationInterface
{
  name = 'CustomerNoMilkTodayNotif1754640000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'CUSTOMER_NO_MILK_TODAY'
    `);
  }

  public async down(): Promise<void> {
    // enum values cannot be removed safely
  }
}
