import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Delivery-staff workflow: subscription schedules, delivery quantity split,
 * confirmation lifecycle, events, extra requests, issues, notifications,
 * device tokens, farm delivery settings, customer reviews.
 */
export class DeliveryStaffWorkflow1754520000000 implements MigrationInterface {
  name = 'DeliveryStaffWorkflow1754520000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- Expand delivery status enum ---
    await queryRunner.query(
      `ALTER TYPE "milk_deliveries_status_enum" ADD VALUE IF NOT EXISTS 'OUT_FOR_DELIVERY'`,
    );
    await queryRunner.query(
      `ALTER TYPE "milk_deliveries_status_enum" ADD VALUE IF NOT EXISTS 'FAILED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "milk_deliveries_status_enum" ADD VALUE IF NOT EXISTS 'DISPUTED'`,
    );

    // --- Subscription schedule fields ---
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "subscription_schedule_type_enum" AS ENUM ('EVERY_DAY', 'WEEKDAYS', 'CUSTOM');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      ALTER TABLE "milk_subscriptions"
        ADD COLUMN IF NOT EXISTS "schedule_type" "subscription_schedule_type_enum" NOT NULL DEFAULT 'EVERY_DAY',
        ADD COLUMN IF NOT EXISTS "delivery_days" smallint[] NULL,
        ADD COLUMN IF NOT EXISTS "paused_from" date NULL,
        ADD COLUMN IF NOT EXISTS "paused_until" date NULL,
        ADD COLUMN IF NOT EXISTS "holiday_dates" date[] NULL,
        ADD COLUMN IF NOT EXISTS "assigned_delivery_user_id" uuid NULL REFERENCES "users"("id"),
        ADD COLUMN IF NOT EXISTS "farm_id" uuid NULL REFERENCES "farms"("id"),
        ADD COLUMN IF NOT EXISTS "farm_product_id" uuid NULL,
        ADD COLUMN IF NOT EXISTS "customer_address_id" uuid NULL
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_milk_subscriptions_assigned_delivery_user_id" ON "milk_subscriptions" ("assigned_delivery_user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_milk_subscriptions_status" ON "milk_subscriptions" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_milk_subscriptions_farm_id" ON "milk_subscriptions" ("farm_id")`,
    );

    // --- Delivery quantity + confirmation columns ---
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "delivery_confirmation_status_enum" AS ENUM (
          'NOT_CONFIRMED',
          'FARM_MARKED_DELIVERED',
          'CUSTOMER_CONFIRMED',
          'CUSTOMER_REPORTED_NOT_RECEIVED',
          'CUSTOMER_REPORTED_WRONG_QUANTITY',
          'CUSTOMER_MARKED_RECEIVED',
          'DISPUTED',
          'RESOLVED'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    await queryRunner.query(`
      ALTER TABLE "milk_deliveries"
        ADD COLUMN IF NOT EXISTS "farm_id" uuid NULL REFERENCES "farms"("id"),
        ADD COLUMN IF NOT EXISTS "customer_user_id" uuid NULL REFERENCES "users"("id"),
        ADD COLUMN IF NOT EXISTS "customer_address_id" uuid NULL,
        ADD COLUMN IF NOT EXISTS "farm_product_id" uuid NULL,
        ADD COLUMN IF NOT EXISTS "assigned_user_id" uuid NULL REFERENCES "users"("id"),
        ADD COLUMN IF NOT EXISTS "delivered_by_user_id" uuid NULL REFERENCES "users"("id"),
        ADD COLUMN IF NOT EXISTS "scheduled_quantity" numeric(10,3) NULL,
        ADD COLUMN IF NOT EXISTS "customer_extra_quantity" numeric(10,3) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "staff_extra_quantity" numeric(10,3) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "final_delivered_quantity" numeric(10,3) NULL,
        ADD COLUMN IF NOT EXISTS "confirmation_status" "delivery_confirmation_status_enum" NOT NULL DEFAULT 'NOT_CONFIRMED',
        ADD COLUMN IF NOT EXISTS "delivered_at" TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS "delivery_notes" text NULL,
        ADD COLUMN IF NOT EXISTS "delivery_sequence" int NULL
    `);

    // Backfill quantity split from legacy quantity
    await queryRunner.query(`
      UPDATE "milk_deliveries"
      SET
        "scheduled_quantity" = COALESCE("scheduled_quantity", "quantity"),
        "final_delivered_quantity" = CASE
          WHEN "status" = 'DELIVERED' THEN COALESCE("final_delivered_quantity", "quantity")
          ELSE "final_delivered_quantity"
        END
      WHERE "scheduled_quantity" IS NULL OR ("status" = 'DELIVERED' AND "final_delivered_quantity" IS NULL)
    `);
    await queryRunner.query(`
      ALTER TABLE "milk_deliveries"
        ALTER COLUMN "scheduled_quantity" SET NOT NULL,
        ALTER COLUMN "scheduled_quantity" SET DEFAULT 0
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_milk_deliveries_assigned_user_date" ON "milk_deliveries" ("assigned_user_id", "delivery_date")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_milk_deliveries_customer_user_date" ON "milk_deliveries" ("customer_user_id", "delivery_date")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_milk_deliveries_status" ON "milk_deliveries" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_milk_deliveries_confirmation_status" ON "milk_deliveries" ("confirmation_status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_milk_deliveries_farm_date" ON "milk_deliveries" ("farm_id", "delivery_date")`,
    );

    // --- Farm delivery settings / staff permissions ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "farm_delivery_settings" (
        "farm_id" uuid PRIMARY KEY REFERENCES "farms"("id") ON DELETE CASCADE,
        "can_view_customer_balance" boolean NOT NULL DEFAULT true,
        "can_view_billing_summary" boolean NOT NULL DEFAULT true,
        "can_record_cash_payment" boolean NOT NULL DEFAULT false,
        "can_view_payment_history" boolean NOT NULL DEFAULT false,
        "delivery_staff_can_approve_extra_requests" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // --- Delivery events ---
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "delivery_event_type_enum" AS ENUM (
          'CREATED','ASSIGNED','CUSTOMER_EXTRA_REQUESTED','CUSTOMER_EXTRA_CANCELLED',
          'STAFF_EXTRA_ADDED','OUT_FOR_DELIVERY','MARKED_DELIVERED','CUSTOMER_MARKED_RECEIVED',
          'CUSTOMER_CONFIRMED','CUSTOMER_REPORTED_NOT_RECEIVED','CUSTOMER_REPORTED_WRONG_QUANTITY',
          'SKIPPED','CANCELLED','FAILED','DISPUTED','RESOLVED','REASSIGNED'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "delivery_events" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "delivery_id" uuid NOT NULL REFERENCES "milk_deliveries"("id") ON DELETE CASCADE,
        "event_type" "delivery_event_type_enum" NOT NULL,
        "actor_user_id" uuid NULL REFERENCES "users"("id"),
        "actor_role" varchar(40) NULL,
        "previous_status" varchar(40) NULL,
        "new_status" varchar(40) NULL,
        "quantity" numeric(10,3) NULL,
        "notes" text NULL,
        "latitude" numeric(10,7) NULL,
        "longitude" numeric(10,7) NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_delivery_events_delivery_created" ON "delivery_events" ("delivery_id", "created_at")`,
    );

    // --- Extra requests ---
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "delivery_extra_request_status_enum" AS ENUM (
          'PENDING','ACCEPTED','REJECTED','CANCELLED','FULFILLED'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "delivery_extra_requests" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "farm_id" uuid NOT NULL REFERENCES "farms"("id") ON DELETE CASCADE,
        "customer_user_id" uuid NOT NULL REFERENCES "users"("id"),
        "subscription_id" uuid NOT NULL REFERENCES "milk_subscriptions"("id"),
        "delivery_id" uuid NULL REFERENCES "milk_deliveries"("id"),
        "delivery_date" date NOT NULL,
        "requested_quantity" numeric(10,3) NOT NULL,
        "status" "delivery_extra_request_status_enum" NOT NULL DEFAULT 'PENDING',
        "notes" text NULL,
        "requested_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "reviewed_by_user_id" uuid NULL REFERENCES "users"("id"),
        "reviewed_at" TIMESTAMPTZ NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_extra_req_pending_sub_date"
      ON "delivery_extra_requests" ("subscription_id", "delivery_date")
      WHERE "status" = 'PENDING'
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_extra_requests_date_status" ON "delivery_extra_requests" ("delivery_date", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_extra_requests_farm_date" ON "delivery_extra_requests" ("farm_id", "delivery_date")`,
    );

    // --- Delivery issues ---
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "delivery_issue_type_enum" AS ENUM (
          'NOT_RECEIVED','WRONG_QUANTITY','WRONG_PRODUCT','QUALITY_ISSUE','OTHER'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "delivery_issue_status_enum" AS ENUM (
          'OPEN','UNDER_REVIEW','RESOLVED','DISMISSED'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "delivery_issues" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "delivery_id" uuid NOT NULL REFERENCES "milk_deliveries"("id") ON DELETE CASCADE,
        "farm_id" uuid NULL REFERENCES "farms"("id"),
        "reported_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
        "issue_type" "delivery_issue_type_enum" NOT NULL,
        "status" "delivery_issue_status_enum" NOT NULL DEFAULT 'OPEN',
        "description" text NULL,
        "resolution_notes" text NULL,
        "resolved_by_user_id" uuid NULL REFERENCES "users"("id"),
        "resolved_at" TIMESTAMPTZ NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_delivery_issues_delivery" ON "delivery_issues" ("delivery_id")`,
    );

    // --- Notifications ---
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "notification_type_enum" AS ENUM (
          'EXTRA_MILK_REQUESTED','EXTRA_REQUEST_ACCEPTED','EXTRA_REQUEST_REJECTED',
          'DELIVERY_ASSIGNED','OUT_FOR_DELIVERY','MILK_DELIVERED','CUSTOMER_MARKED_RECEIVED',
          'CUSTOMER_CONFIRMED_DELIVERY','CUSTOMER_REPORTED_NOT_RECEIVED','WRONG_QUANTITY_REPORTED',
          'DELIVERY_ISSUE_RESOLVED','CASH_PAYMENT_RECORDED','CUSTOMER_REVIEW_ADDED',
          'CUSTOMER_REVIEW_REPORTED','GENERIC'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "push_delivery_status_enum" AS ENUM (
          'PENDING','SENT','SKIPPED_NOT_CONFIGURED','FAILED','NO_DEVICE'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notifications" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "type" "notification_type_enum" NOT NULL DEFAULT 'GENERIC',
        "title" varchar(200) NOT NULL,
        "body" text NOT NULL,
        "data" jsonb NOT NULL DEFAULT '{}',
        "route" varchar(255) NULL,
        "farm_id" uuid NULL REFERENCES "farms"("id"),
        "entity_type" varchar(60) NULL,
        "entity_id" uuid NULL,
        "created_by_user_id" uuid NULL REFERENCES "users"("id"),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notification_recipients" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "notification_id" uuid NOT NULL REFERENCES "notifications"("id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "read_at" TIMESTAMPTZ NULL,
        "push_status" "push_delivery_status_enum" NOT NULL DEFAULT 'PENDING',
        "push_error" text NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_notification_recipient" UNIQUE ("notification_id", "user_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_notification_recipients_user_read" ON "notification_recipients" ("user_id", "read_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "device_tokens" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "token" varchar(512) NOT NULL,
        "platform" varchar(20) NOT NULL,
        "device_id" varchar(120) NULL,
        "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_device_tokens_token" UNIQUE ("token")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_device_tokens_user_id" ON "device_tokens" ("user_id")`,
    );

    // --- Customer reviews by farm/staff ---
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "customer_review_status_enum" AS ENUM (
          'PUBLISHED','HIDDEN','REPORTED','REMOVED'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "customer_reviews" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "farm_id" uuid NOT NULL REFERENCES "farms"("id") ON DELETE CASCADE,
        "customer_user_id" uuid NOT NULL REFERENCES "users"("id"),
        "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
        "delivery_id" uuid NULL REFERENCES "milk_deliveries"("id"),
        "subscription_id" uuid NULL REFERENCES "milk_subscriptions"("id"),
        "rating" smallint NOT NULL,
        "communication_rating" smallint NULL,
        "address_accuracy_rating" smallint NULL,
        "payment_reliability_rating" smallint NULL,
        "comment" text NULL,
        "customer_response" text NULL,
        "status" "customer_review_status_enum" NOT NULL DEFAULT 'PUBLISHED',
        "reported_at" TIMESTAMPTZ NULL,
        "report_reason" text NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_customer_reviews_rating" CHECK ("rating" BETWEEN 1 AND 5)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_customer_reviews_customer_user" ON "customer_reviews" ("customer_user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_customer_reviews_farm" ON "customer_reviews" ("farm_id")`,
    );

    // Payment purpose for cash collections
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "cash_payment_purpose_enum" AS ENUM (
          'BILL_PAYMENT','ADVANCE_PAYMENT','DAIRY_ORDER_PAYMENT'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      ALTER TABLE "payments"
        ADD COLUMN IF NOT EXISTS "purpose" "cash_payment_purpose_enum" NULL,
        ADD COLUMN IF NOT EXISTS "farm_id" uuid NULL REFERENCES "farms"("id")
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_payments_customer_date" ON "payments" ("customer_id", "payment_date")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "customer_reviews"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "customer_review_status_enum"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "device_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_recipients"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "push_delivery_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "notification_type_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "delivery_issues"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "delivery_issue_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "delivery_issue_type_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "delivery_extra_requests"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "delivery_extra_request_status_enum"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "delivery_events"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "delivery_event_type_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "farm_delivery_settings"`);
    // Column drops omitted for safety on down in additive migrations.
    await queryRunner.query(
      `DROP TYPE IF EXISTS "delivery_confirmation_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "subscription_schedule_type_enum"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "cash_payment_purpose_enum"`);
  }
}
