import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1754490000000 implements MigrationInterface {
  name = 'InitialSchema1754490000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TYPE "users_role_enum" AS ENUM ('ADMIN', 'SUPPLIER', 'CUSTOMER', 'DELIVERY_PERSON')
    `);
    await queryRunner.query(`
      CREATE TYPE "users_status_enum" AS ENUM ('ACTIVE', 'INACTIVE', 'BLOCKED')
    `);
    await queryRunner.query(`
      CREATE TYPE "customers_status_enum" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED')
    `);
    await queryRunner.query(`
      CREATE TYPE "milk_subscriptions_milk_type_enum" AS ENUM ('COW', 'BUFFALO', 'MIXED', 'TONED', 'OTHER')
    `);
    await queryRunner.query(`
      CREATE TYPE "milk_subscriptions_delivery_shift_enum" AS ENUM ('MORNING', 'EVENING')
    `);
    await queryRunner.query(`
      CREATE TYPE "milk_subscriptions_status_enum" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED')
    `);
    await queryRunner.query(`
      CREATE TYPE "milk_deliveries_delivery_shift_enum" AS ENUM ('MORNING', 'EVENING')
    `);
    await queryRunner.query(`
      CREATE TYPE "milk_deliveries_status_enum" AS ENUM ('PENDING', 'DELIVERED', 'SKIPPED', 'CANCELLED')
    `);
    await queryRunner.query(`
      CREATE TYPE "monthly_bills_status_enum" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID')
    `);
    await queryRunner.query(`
      CREATE TYPE "monthly_bill_items_item_type_enum" AS ENUM ('MILK_DELIVERY', 'PREVIOUS_BALANCE', 'DISCOUNT', 'ADJUSTMENT')
    `);
    await queryRunner.query(`
      CREATE TYPE "payments_payment_method_enum" AS ENUM ('CASH', 'UPI', 'BANK_TRANSFER', 'OTHER')
    `);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "name" varchar(150) NOT NULL,
        "mobile_number" varchar(20) NOT NULL UNIQUE,
        "password_hash" varchar(255) NOT NULL,
        "role" "users_role_enum" NOT NULL,
        "status" "users_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "preferred_language" varchar(10) NOT NULL DEFAULT 'en',
        "timezone" varchar(50) NOT NULL DEFAULT 'Asia/Kolkata',
        "last_login_at" TIMESTAMPTZ NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_users_mobile_number" ON "users" ("mobile_number")`,
    );

    await queryRunner.query(`
      CREATE TABLE "supplier_profiles" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
        "business_name" varchar(150) NOT NULL,
        "address" text NULL,
        "default_currency" varchar(3) NOT NULL DEFAULT 'INR',
        "default_timezone" varchar(50) NOT NULL DEFAULT 'Asia/Kolkata',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "customers" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "supplier_id" uuid NOT NULL REFERENCES "users"("id"),
        "customer_user_id" uuid NULL REFERENCES "users"("id"),
        "name" varchar(150) NOT NULL,
        "mobile_number" varchar(20) NULL,
        "address" text NULL,
        "notes" text NULL,
        "status" "customers_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "version" integer NOT NULL DEFAULT 1,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_customers_supplier_id" ON "customers" ("supplier_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_customers_supplier_status" ON "customers" ("supplier_id", "status")`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_customers_supplier_mobile"
      ON "customers" ("supplier_id", "mobile_number")
      WHERE "mobile_number" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "milk_subscriptions" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "supplier_id" uuid NOT NULL REFERENCES "users"("id"),
        "customer_id" uuid NOT NULL REFERENCES "customers"("id"),
        "milk_type" "milk_subscriptions_milk_type_enum" NOT NULL,
        "default_quantity" numeric(10,3) NOT NULL,
        "rate_per_litre" numeric(12,2) NOT NULL,
        "delivery_shift" "milk_subscriptions_delivery_shift_enum" NOT NULL,
        "start_date" date NOT NULL,
        "end_date" date NULL,
        "status" "milk_subscriptions_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "version" integer NOT NULL DEFAULT 1,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_subs_customer_id" ON "milk_subscriptions" ("customer_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_subs_supplier_status" ON "milk_subscriptions" ("supplier_id", "status")`,
    );

    await queryRunner.query(`
      CREATE TABLE "milk_deliveries" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "supplier_id" uuid NOT NULL REFERENCES "users"("id"),
        "customer_id" uuid NOT NULL REFERENCES "customers"("id"),
        "subscription_id" uuid NOT NULL REFERENCES "milk_subscriptions"("id"),
        "delivery_date" date NOT NULL,
        "delivery_shift" "milk_deliveries_delivery_shift_enum" NOT NULL,
        "quantity" numeric(10,3) NOT NULL,
        "rate_per_litre" numeric(12,2) NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "status" "milk_deliveries_status_enum" NOT NULL DEFAULT 'PENDING',
        "notes" text NULL,
        "client_reference_id" uuid NOT NULL UNIQUE,
        "version" integer NOT NULL DEFAULT 1,
        "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ NULL,
        CONSTRAINT "UQ_delivery_sub_date_shift"
          UNIQUE ("subscription_id", "delivery_date", "delivery_shift")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_deliveries_supplier_date" ON "milk_deliveries" ("supplier_id", "delivery_date")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_deliveries_customer_date" ON "milk_deliveries" ("customer_id", "delivery_date")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_deliveries_sub_date" ON "milk_deliveries" ("subscription_id", "delivery_date")`,
    );

    await queryRunner.query(`
      CREATE TABLE "monthly_bills" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "supplier_id" uuid NOT NULL REFERENCES "users"("id"),
        "customer_id" uuid NOT NULL REFERENCES "customers"("id"),
        "billing_month" date NOT NULL,
        "total_delivery_days" integer NOT NULL DEFAULT 0,
        "total_quantity" numeric(12,3) NOT NULL DEFAULT 0,
        "milk_amount" numeric(12,2) NOT NULL DEFAULT 0,
        "previous_balance" numeric(12,2) NOT NULL DEFAULT 0,
        "discount" numeric(12,2) NOT NULL DEFAULT 0,
        "adjustment" numeric(12,2) NOT NULL DEFAULT 0,
        "total_amount" numeric(12,2) NOT NULL DEFAULT 0,
        "paid_amount" numeric(12,2) NOT NULL DEFAULT 0,
        "remaining_balance" numeric(12,2) NOT NULL DEFAULT 0,
        "status" "monthly_bills_status_enum" NOT NULL DEFAULT 'DRAFT',
        "generated_at" TIMESTAMPTZ NOT NULL,
        "finalized_at" TIMESTAMPTZ NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_bills_customer_month" UNIQUE ("customer_id", "billing_month")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_bills_customer_month" ON "monthly_bills" ("customer_id", "billing_month")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bills_supplier_status" ON "monthly_bills" ("supplier_id", "status")`,
    );

    await queryRunner.query(`
      CREATE TABLE "monthly_bill_items" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "bill_id" uuid NOT NULL REFERENCES "monthly_bills"("id") ON DELETE CASCADE,
        "delivery_id" uuid NULL REFERENCES "milk_deliveries"("id"),
        "item_date" date NOT NULL,
        "description" varchar(255) NOT NULL,
        "quantity" numeric(10,3) NOT NULL DEFAULT 0,
        "rate" numeric(12,2) NOT NULL DEFAULT 0,
        "amount" numeric(12,2) NOT NULL DEFAULT 0,
        "item_type" "monthly_bill_items_item_type_enum" NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "supplier_id" uuid NOT NULL REFERENCES "users"("id"),
        "customer_id" uuid NOT NULL REFERENCES "customers"("id"),
        "bill_id" uuid NULL REFERENCES "monthly_bills"("id"),
        "amount" numeric(12,2) NOT NULL,
        "payment_method" "payments_payment_method_enum" NOT NULL,
        "payment_date" date NOT NULL,
        "reference_number" varchar(100) NULL,
        "notes" text NULL,
        "client_reference_id" uuid NOT NULL UNIQUE,
        "version" integer NOT NULL DEFAULT 1,
        "recorded_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_payments_customer_date" ON "payments" ("customer_id", "payment_date")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payments_bill_id" ON "payments" ("bill_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "token_hash" varchar(255) NOT NULL,
        "device_id" varchar(100) NULL,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "revoked_at" TIMESTAMPTZ NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "sync_operations" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "operation_id" uuid NOT NULL UNIQUE,
        "user_id" uuid NOT NULL REFERENCES "users"("id"),
        "device_id" varchar(100) NOT NULL,
        "entity_type" varchar(50) NOT NULL,
        "entity_id" uuid NOT NULL,
        "operation_type" varchar(20) NOT NULL,
        "result_status" varchar(20) NOT NULL,
        "processed_at" TIMESTAMPTZ NOT NULL,
        "error_code" varchar(100) NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "change_logs" (
        "id" BIGSERIAL PRIMARY KEY,
        "supplier_id" uuid NOT NULL,
        "entity_type" varchar(50) NOT NULL,
        "entity_id" uuid NOT NULL,
        "change_type" varchar(20) NOT NULL,
        "entity_version" integer NOT NULL,
        "changed_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_change_logs_supplier_id" ON "change_logs" ("supplier_id", "id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "actor_user_id" uuid NULL,
        "supplier_id" uuid NULL,
        "entity_type" varchar(50) NOT NULL,
        "entity_id" uuid NULL,
        "action" varchar(100) NOT NULL,
        "old_values" jsonb NULL,
        "new_values" jsonb NULL,
        "ip_address" varchar(100) NULL,
        "user_agent" text NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "change_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sync_operations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "monthly_bill_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "monthly_bills"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "milk_deliveries"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "milk_subscriptions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "customers"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "supplier_profiles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);

    await queryRunner.query(
      `DROP TYPE IF EXISTS "payments_payment_method_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "monthly_bill_items_item_type_enum"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "monthly_bills_status_enum"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "milk_deliveries_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "milk_deliveries_delivery_shift_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "milk_subscriptions_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "milk_subscriptions_delivery_shift_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "milk_subscriptions_milk_type_enum"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "customers_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "users_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "users_role_enum"`);
  }
}
