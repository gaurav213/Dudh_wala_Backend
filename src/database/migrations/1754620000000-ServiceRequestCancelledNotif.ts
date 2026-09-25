import { MigrationInterface, QueryRunner } from 'typeorm';

export class ServiceRequestCancelledNotif1754620000000
  implements MigrationInterface
{
  name = 'ServiceRequestCancelledNotif1754620000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'SERVICE_REQUEST_CANCELLED'
    `);
  }

  public async down(): Promise<void> {
    // enum values cannot be removed safely
  }
}
