import { MigrationInterface, QueryRunner } from 'typeorm';

export class DeliveryEditAndFarmDashboard1754540000000 implements MigrationInterface {
  name = 'DeliveryEditAndFarmDashboard1754540000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE delivery_edit_review_status_enum AS ENUM (
          'NOT_REQUIRED',
          'PENDING_REVIEW',
          'CONFIRMED',
          'FLAGGED'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE delivery_edit_reason_enum AS ENUM (
          'ENTERED_WRONG_QUANTITY',
          'CUSTOMER_CORRECTED_QUANTITY',
          'EXTRA_MILK_ENTERED_INCORRECTLY',
          'OTHER'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TYPE delivery_event_type_enum ADD VALUE IF NOT EXISTS 'DELIVERY_EDITED'
    `);
    await queryRunner.query(`
      ALTER TYPE delivery_event_type_enum ADD VALUE IF NOT EXISTS 'EDIT_REVIEW_CONFIRMED'
    `);
    await queryRunner.query(`
      ALTER TYPE delivery_event_type_enum ADD VALUE IF NOT EXISTS 'EDIT_REVIEW_FLAGGED'
    `);

    await queryRunner.query(`
      ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'DELIVERY_EDITED'
    `);
    await queryRunner.query(`
      ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'DELIVERY_EXTRA_CHANGED'
    `);
    await queryRunner.query(`
      ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'DELIVERY_QUANTITY_CHANGED'
    `);
    await queryRunner.query(`
      ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'DELIVERY_AMOUNT_CHANGED'
    `);
    await queryRunner.query(`
      ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'DELIVERY_EDIT_CONFIRMED'
    `);
    await queryRunner.query(`
      ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'DELIVERY_EDIT_FLAGGED'
    `);

    await queryRunner.query(`
      ALTER TABLE milk_deliveries
        ADD COLUMN IF NOT EXISTS is_edited boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS last_edited_at timestamptz NULL,
        ADD COLUMN IF NOT EXISTS last_edited_by_user_id uuid NULL,
        ADD COLUMN IF NOT EXISTS edit_review_status delivery_edit_review_status_enum
          NOT NULL DEFAULT 'NOT_REQUIRED'
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE milk_deliveries
          ADD CONSTRAINT milk_deliveries_last_edited_by_user_id_fkey
          FOREIGN KEY (last_edited_by_user_id) REFERENCES users(id);
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_milk_deliveries_is_edited_date
        ON milk_deliveries (is_edited, delivery_date)
        WHERE is_edited = true
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_milk_deliveries_edit_review_status
        ON milk_deliveries (edit_review_status)
        WHERE edit_review_status = 'PENDING_REVIEW'
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS delivery_edit_history (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        delivery_id uuid NOT NULL REFERENCES milk_deliveries(id) ON DELETE CASCADE,
        edited_by_user_id uuid NOT NULL REFERENCES users(id),
        edited_by_role varchar(40) NOT NULL,
        previous_quantity numeric(10,3) NOT NULL,
        new_quantity numeric(10,3) NOT NULL,
        previous_extra_quantity numeric(10,3) NOT NULL DEFAULT 0,
        new_extra_quantity numeric(10,3) NOT NULL DEFAULT 0,
        previous_staff_extra_quantity numeric(10,3) NOT NULL DEFAULT 0,
        new_staff_extra_quantity numeric(10,3) NOT NULL DEFAULT 0,
        previous_amount numeric(12,2) NOT NULL,
        new_amount numeric(12,2) NOT NULL,
        edit_reason delivery_edit_reason_enum NOT NULL,
        edit_note text NULL,
        edited_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_delivery_edit_history_delivery
        ON delivery_edit_history (delivery_id, edited_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_delivery_edit_history_editor
        ON delivery_edit_history (edited_by_user_id, edited_at DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS IDX_delivery_edit_history_editor`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS IDX_delivery_edit_history_delivery`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS delivery_edit_history`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS IDX_milk_deliveries_edit_review_status`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS IDX_milk_deliveries_is_edited_date`,
    );
    await queryRunner.query(`
      ALTER TABLE milk_deliveries
        DROP CONSTRAINT IF EXISTS milk_deliveries_last_edited_by_user_id_fkey
    `);
    await queryRunner.query(`
      ALTER TABLE milk_deliveries
        DROP COLUMN IF EXISTS edit_review_status,
        DROP COLUMN IF EXISTS last_edited_by_user_id,
        DROP COLUMN IF EXISTS last_edited_at,
        DROP COLUMN IF EXISTS is_edited
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS delivery_edit_reason_enum`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS delivery_edit_review_status_enum`,
    );
  }
}
