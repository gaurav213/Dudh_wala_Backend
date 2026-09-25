import { MigrationInterface, QueryRunner } from 'typeorm';

/** Adds AFTERNOON to all delivery_shift Postgres enums. */
export class AfternoonDeliveryShift1754570000000 implements MigrationInterface {
  name = 'AfternoonDeliveryShift1754570000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const enums = [
      'milk_subscriptions_delivery_shift_enum',
      'milk_deliveries_delivery_shift_enum',
      'customer_service_requests_delivery_shift_enum',
      'farm_customer_invitations_delivery_shift_enum',
    ];
    for (const type of enums) {
      await queryRunner.query(
        `ALTER TYPE "${type}" ADD VALUE IF NOT EXISTS 'AFTERNOON'`,
      );
    }
  }

  public async down(): Promise<void> {
    // Postgres cannot drop enum values safely — no-op.
  }
}
