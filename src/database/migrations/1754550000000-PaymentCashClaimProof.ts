import { MigrationInterface, QueryRunner } from 'typeorm';

export class PaymentCashClaimProof1754550000000 implements MigrationInterface {
  name = 'PaymentCashClaimProof1754550000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "payment_status_enum" AS ENUM (
          'PENDING_CONFIRMATION',
          'CONFIRMED',
          'REJECTED'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      ALTER TABLE "payments"
        ADD COLUMN IF NOT EXISTS "status" "payment_status_enum" NOT NULL DEFAULT 'CONFIRMED',
        ADD COLUMN IF NOT EXISTS "confirmed_by_user_id" uuid NULL,
        ADD COLUMN IF NOT EXISTS "confirmed_at" TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS "rejection_note" text NULL,
        ADD COLUMN IF NOT EXISTS "proof_image_url" varchar(500) NULL
    `);

    await queryRunner.query(`
      UPDATE "payments" SET "status" = 'CONFIRMED' WHERE "status" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_payments_status_date"
      ON "payments" ("status", "payment_date")
    `);

    await queryRunner.query(`
      ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'CASH_PAYMENT_CLAIMED'
    `);
    await queryRunner.query(`
      ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'CASH_PAYMENT_CONFIRMED'
    `);
    await queryRunner.query(`
      ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'CASH_PAYMENT_REJECTED'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payments_status_date"`);
    await queryRunner.query(`
      ALTER TABLE "payments"
        DROP COLUMN IF EXISTS "proof_image_url",
        DROP COLUMN IF EXISTS "rejection_note",
        DROP COLUMN IF EXISTS "confirmed_at",
        DROP COLUMN IF EXISTS "confirmed_by_user_id",
        DROP COLUMN IF EXISTS "status"
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS "payment_status_enum"`);
  }
}
