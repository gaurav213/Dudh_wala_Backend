import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 2: marketplace roles + farms + farm_members.
 * Additive / data-preserving. Does not drop supplier ledger tables.
 */
export class MarketplaceFarmsPhase21754495000000 implements MigrationInterface {
  name = 'MarketplaceFarmsPhase21754495000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- Role enum migration (preserve rows) ---
    await queryRunner.query(`
      ALTER TABLE "users" ALTER COLUMN "role" TYPE varchar(50) USING "role"::text
    `);
    await queryRunner.query(`
      UPDATE "users" SET "role" = 'PLATFORM_OWNER' WHERE "role" = 'ADMIN'
    `);
    await queryRunner.query(`
      UPDATE "users" SET "role" = 'FARM_OWNER' WHERE "role" = 'SUPPLIER'
    `);
    await queryRunner.query(`
      UPDATE "users" SET "role" = 'DELIVERY_STAFF' WHERE "role" = 'DELIVERY_PERSON'
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS "users_role_enum"`);
    await queryRunner.query(`
      CREATE TYPE "users_role_enum" AS ENUM (
        'PLATFORM_OWNER', 'FARM_OWNER', 'DELIVERY_STAFF', 'CUSTOMER'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      ALTER COLUMN "role" TYPE "users_role_enum"
      USING "role"::"users_role_enum"
    `);

    // --- Optional email on users ---
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "email" varchar(150) NULL
    `);

    // --- Farm status / member enums ---
    await queryRunner.query(`
      CREATE TYPE "farms_status_enum" AS ENUM (
        'PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'BLOCKED', 'REJECTED'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "farm_members_member_role_enum" AS ENUM ('OWNER', 'DELIVERY_STAFF')
    `);
    await queryRunner.query(`
      CREATE TYPE "farm_members_status_enum" AS ENUM (
        'INVITED', 'ACTIVE', 'INACTIVE', 'REMOVED'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "farms" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "name" varchar(150) NOT NULL,
        "business_name" varchar(150) NULL,
        "description" text NULL,
        "mobile_number" varchar(20) NOT NULL,
        "email" varchar(150) NULL,
        "address_line_1" varchar(255) NOT NULL,
        "address_line_2" varchar(255) NULL,
        "area" varchar(100) NOT NULL,
        "city" varchar(100) NOT NULL,
        "state" varchar(100) NOT NULL,
        "postal_code" varchar(20) NOT NULL,
        "latitude" numeric(10,7) NULL,
        "longitude" numeric(10,7) NULL,
        "status" "farms_status_enum" NOT NULL DEFAULT 'PENDING_APPROVAL',
        "approval_notes" text NULL,
        "approved_by_user_id" uuid NULL REFERENCES "users"("id"),
        "approved_at" TIMESTAMPTZ NULL,
        "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_farms_mobile_number" ON "farms" ("mobile_number")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_farms_area" ON "farms" ("area")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_farms_city" ON "farms" ("city")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_farms_postal_code" ON "farms" ("postal_code")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_farms_created_by" ON "farms" ("created_by_user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_farms_status" ON "farms" ("status")`,
    );

    await queryRunner.query(`
      CREATE TABLE "farm_members" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "farm_id" uuid NOT NULL REFERENCES "farms"("id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("id"),
        "member_role" "farm_members_member_role_enum" NOT NULL,
        "status" "farm_members_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "joined_at" TIMESTAMPTZ NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_farm_members_farm_user" UNIQUE ("farm_id", "user_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_farm_members_farm_id" ON "farm_members" ("farm_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_farm_members_user_id" ON "farm_members" ("user_id")`,
    );

    // --- audit_logs.farm_id ---
    await queryRunner.query(`
      ALTER TABLE "audit_logs"
      ADD COLUMN IF NOT EXISTS "farm_id" uuid NULL
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_logs_farm_id" ON "audit_logs" ("farm_id")`,
    );

    // --- Backfill farms from existing farm owners + supplier profiles ---
    await queryRunner.query(`
      INSERT INTO "farms" (
        "id", "name", "business_name", "mobile_number",
        "address_line_1", "area", "city", "state", "postal_code",
        "status", "approved_at", "created_by_user_id"
      )
      SELECT
        uuid_generate_v4(),
        COALESCE(sp.business_name, u.name),
        sp.business_name,
        u.mobile_number,
        COALESCE(sp.address, 'Migrated address'),
        'Migrated',
        'Migrated',
        'Migrated',
        '000000',
        'ACTIVE',
        now(),
        u.id
      FROM "users" u
      LEFT JOIN "supplier_profiles" sp ON sp.user_id = u.id
      WHERE u.role = 'FARM_OWNER'
        AND u.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM "farms" f WHERE f.created_by_user_id = u.id
        )
    `);

    await queryRunner.query(`
      INSERT INTO "farm_members" (
        "id", "farm_id", "user_id", "member_role", "status", "joined_at"
      )
      SELECT
        uuid_generate_v4(),
        f.id,
        f.created_by_user_id,
        'OWNER',
        'ACTIVE',
        now()
      FROM "farms" f
      WHERE NOT EXISTS (
        SELECT 1 FROM "farm_members" m
        WHERE m.farm_id = f.id AND m.user_id = f.created_by_user_id
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "farm_members"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "farms"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "farm_members_status_enum"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "farm_members_member_role_enum"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "farms_status_enum"`);

    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "farm_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "email"`,
    );

    await queryRunner.query(`
      ALTER TABLE "users" ALTER COLUMN "role" TYPE varchar(50) USING "role"::text
    `);
    await queryRunner.query(`
      UPDATE "users" SET "role" = 'ADMIN' WHERE "role" = 'PLATFORM_OWNER'
    `);
    await queryRunner.query(`
      UPDATE "users" SET "role" = 'SUPPLIER' WHERE "role" = 'FARM_OWNER'
    `);
    await queryRunner.query(`
      UPDATE "users" SET "role" = 'DELIVERY_PERSON' WHERE "role" = 'DELIVERY_STAFF'
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS "users_role_enum"`);
    await queryRunner.query(`
      CREATE TYPE "users_role_enum" AS ENUM (
        'ADMIN', 'SUPPLIER', 'CUSTOMER', 'DELIVERY_PERSON'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      ALTER COLUMN "role" TYPE "users_role_enum"
      USING "role"::"users_role_enum"
    `);
  }
}
