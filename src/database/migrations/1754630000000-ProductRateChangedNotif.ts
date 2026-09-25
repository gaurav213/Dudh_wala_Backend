import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProductRateChangedNotif1754630000000
  implements MigrationInterface
{
  name = 'ProductRateChangedNotif1754630000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'PRODUCT_RATE_CHANGED'
    `);
  }

  public async down(): Promise<void> {
    // enum values cannot be removed safely
  }
}
