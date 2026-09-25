import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 4+: farm-customer connections, customer service requests,
 * customer/member invitations, and minimal delivery assignments.
 * Additive / data-preserving. Also adds a CLOSED farm status and
 * soft-close bookkeeping columns, plus a couple of search-supporting
 * indexes on customer_addresses.
 */
export class Phase4ConnectionsInvitations1754510000000 implements MigrationInterface {
  name = 'Phase4ConnectionsInvitations1754510000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- farms: soft-close support ---
    await queryRunner.query(`
      ALTER TYPE "farms_status_enum" ADD VALUE IF NOT EXISTS 'CLOSED'
    `);
    await queryRunner.query(`
      ALTER TABLE "farms" ADD COLUMN IF NOT EXISTS "deactivated_at" TIMESTAMPTZ NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "farms" ADD COLUMN IF NOT EXISTS "deletion_requested_at" TIMESTAMPTZ NULL
    `);

    // --- search-supporting indexes on customer_addresses ---
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_customer_addresses_postal_code" ON "customer_addresses" ("postal_code")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_customer_addresses_city" ON "customer_addresses" ("city")`,
    );

    // --- farm_customer_connections ---
    await queryRunner.query(`
      CREATE TYPE "farm_customer_connections_status_enum" AS ENUM ('PENDING', 'ACTIVE', 'BLOCKED', 'CLOSED')
    `);
    await queryRunner.query(`
      CREATE TABLE "farm_customer_connections" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "farm_id" uuid NOT NULL REFERENCES "farms"("id") ON DELETE CASCADE,
        "customer_user_id" uuid NOT NULL REFERENCES "users"("id"),
        "status" "farm_customer_connections_status_enum" NOT NULL DEFAULT 'PENDING',
        "connected_at" TIMESTAMPTZ NULL,
        "blocked_at" TIMESTAMPTZ NULL,
        "notes" text NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_farm_customer_connections_farm_customer" UNIQUE ("farm_id", "customer_user_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_farm_customer_connections_farm_id" ON "farm_customer_connections" ("farm_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_farm_customer_connections_customer_user_id" ON "farm_customer_connections" ("customer_user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_farm_customer_connections_farm_id_status" ON "farm_customer_connections" ("farm_id", "status")`,
    );

    // --- customer_service_requests ---
    await queryRunner.query(`
      CREATE TYPE "customer_service_requests_delivery_shift_enum" AS ENUM ('MORNING', 'EVENING')
    `);
    await queryRunner.query(`
      CREATE TYPE "customer_service_requests_status_enum" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED')
    `);
    await queryRunner.query(`
      CREATE TABLE "customer_service_requests" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "farm_id" uuid NOT NULL REFERENCES "farms"("id") ON DELETE CASCADE,
        "customer_user_id" uuid NOT NULL REFERENCES "users"("id"),
        "address_id" uuid NOT NULL REFERENCES "customer_addresses"("id"),
        "product_id" uuid NOT NULL REFERENCES "farm_milk_products"("id"),
        "quantity" numeric(10,3) NOT NULL,
        "delivery_shift" "customer_service_requests_delivery_shift_enum" NOT NULL,
        "preferred_start_date" date NOT NULL,
        "delivery_instructions" text NULL,
        "status" "customer_service_requests_status_enum" NOT NULL DEFAULT 'PENDING',
        "rejection_reason" text NULL,
        "assigned_member_user_id" uuid NULL REFERENCES "users"("id"),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_customer_service_requests_farm_id" ON "customer_service_requests" ("farm_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_customer_service_requests_customer_user_id" ON "customer_service_requests" ("customer_user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_customer_service_requests_farm_id_status" ON "customer_service_requests" ("farm_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_customer_service_requests_status" ON "customer_service_requests" ("status")`,
    );

    // --- farm_customer_invitations ---
    await queryRunner.query(`
      CREATE TYPE "farm_customer_invitations_delivery_shift_enum" AS ENUM ('MORNING', 'EVENING')
    `);
    await queryRunner.query(`
      CREATE TYPE "farm_customer_invitations_status_enum" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED')
    `);
    await queryRunner.query(`
      CREATE TABLE "farm_customer_invitations" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "farm_id" uuid NOT NULL REFERENCES "farms"("id") ON DELETE CASCADE,
        "mobile_number" varchar(20) NOT NULL,
        "customer_name" varchar(150) NULL,
        "product_id" uuid NOT NULL REFERENCES "farm_milk_products"("id"),
        "quantity" numeric(10,3) NOT NULL,
        "delivery_shift" "farm_customer_invitations_delivery_shift_enum" NOT NULL,
        "proposed_rate" numeric(12,2) NOT NULL,
        "preferred_start_date" date NOT NULL,
        "delivery_instructions" text NULL,
        "status" "farm_customer_invitations_status_enum" NOT NULL DEFAULT 'PENDING',
        "invited_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
        "expires_at" TIMESTAMPTZ NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_farm_customer_invitations_farm_id" ON "farm_customer_invitations" ("farm_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_farm_customer_invitations_mobile_number" ON "farm_customer_invitations" ("mobile_number")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_farm_customer_invitations_farm_id_status" ON "farm_customer_invitations" ("farm_id", "status")`,
    );

    // --- farm_member_invitations ---
    await queryRunner.query(`
      CREATE TYPE "farm_member_invitations_role_enum" AS ENUM ('DELIVERY_STAFF')
    `);
    await queryRunner.query(`
      CREATE TYPE "farm_member_invitations_status_enum" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED')
    `);
    await queryRunner.query(`
      CREATE TABLE "farm_member_invitations" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "farm_id" uuid NOT NULL REFERENCES "farms"("id") ON DELETE CASCADE,
        "mobile_number" varchar(20) NOT NULL,
        "name" varchar(150) NULL,
        "role" "farm_member_invitations_role_enum" NOT NULL DEFAULT 'DELIVERY_STAFF',
        "status" "farm_member_invitations_status_enum" NOT NULL DEFAULT 'PENDING',
        "invited_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
        "expires_at" TIMESTAMPTZ NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_farm_member_invitations_farm_id" ON "farm_member_invitations" ("farm_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_farm_member_invitations_mobile_number" ON "farm_member_invitations" ("mobile_number")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_farm_member_invitations_farm_id_status" ON "farm_member_invitations" ("farm_id", "status")`,
    );

    // --- delivery_assignments (minimal) ---
    await queryRunner.query(`
      CREATE TYPE "delivery_assignments_status_enum" AS ENUM ('ACTIVE', 'INACTIVE')
    `);
    await queryRunner.query(`
      CREATE TABLE "delivery_assignments" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "farm_id" uuid NOT NULL REFERENCES "farms"("id") ON DELETE CASCADE,
        "subscription_id" uuid NULL REFERENCES "milk_subscriptions"("id"),
        "delivery_id" uuid NULL REFERENCES "milk_deliveries"("id"),
        "assignee_user_id" uuid NOT NULL REFERENCES "users"("id"),
        "assigned_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
        "status" "delivery_assignments_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_delivery_assignments_farm_id" ON "delivery_assignments" ("farm_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_delivery_assignments_assignee_user_id" ON "delivery_assignments" ("assignee_user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_delivery_assignments_subscription_id" ON "delivery_assignments" ("subscription_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "delivery_assignments"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "delivery_assignments_status_enum"`,
    );

    await queryRunner.query(`DROP TABLE IF EXISTS "farm_member_invitations"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "farm_member_invitations_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "farm_member_invitations_role_enum"`,
    );

    await queryRunner.query(`DROP TABLE IF EXISTS "farm_customer_invitations"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "farm_customer_invitations_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "farm_customer_invitations_delivery_shift_enum"`,
    );

    await queryRunner.query(`DROP TABLE IF EXISTS "customer_service_requests"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "customer_service_requests_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "customer_service_requests_delivery_shift_enum"`,
    );

    await queryRunner.query(`DROP TABLE IF EXISTS "farm_customer_connections"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "farm_customer_connections_status_enum"`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_customer_addresses_city"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_customer_addresses_postal_code"`,
    );

    await queryRunner.query(
      `ALTER TABLE "farms" DROP COLUMN IF EXISTS "deletion_requested_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "farms" DROP COLUMN IF EXISTS "deactivated_at"`,
    );
    // Note: Postgres cannot DROP VALUE from an enum type; 'CLOSED' remains
    // defined on farms_status_enum after a rollback (harmless, unused).
  }
}
