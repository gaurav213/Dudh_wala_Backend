import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 3: customer addresses, farm service areas, farm milk products,
 * and milk rate history. Additive / data-preserving.
 */
export class Phase3AddressesAreasProducts1754500000000 implements MigrationInterface {
  name = 'Phase3AddressesAreasProducts1754500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- customer_addresses ---
    await queryRunner.query(`
      CREATE TABLE "customer_addresses" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "customer_user_id" uuid NOT NULL REFERENCES "users"("id"),
        "label" varchar(100) NOT NULL,
        "address_line_1" varchar(255) NOT NULL,
        "address_line_2" varchar(255) NULL,
        "area" varchar(100) NOT NULL,
        "city" varchar(100) NOT NULL,
        "state" varchar(100) NOT NULL,
        "postal_code" varchar(20) NOT NULL,
        "latitude" numeric(10,7) NULL,
        "longitude" numeric(10,7) NULL,
        "delivery_instructions" text NULL,
        "is_default" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_customer_addresses_customer_user_id" ON "customer_addresses" ("customer_user_id")`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_customer_addresses_one_default"
      ON "customer_addresses" ("customer_user_id")
      WHERE "is_default" = true AND "deleted_at" IS NULL
    `);

    // --- farm_service_areas ---
    await queryRunner.query(`
      CREATE TYPE "farm_service_areas_status_enum" AS ENUM ('ACTIVE', 'INACTIVE')
    `);
    await queryRunner.query(`
      CREATE TABLE "farm_service_areas" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "farm_id" uuid NOT NULL REFERENCES "farms"("id") ON DELETE CASCADE,
        "area_name" varchar(100) NOT NULL,
        "city" varchar(100) NOT NULL,
        "state" varchar(100) NOT NULL,
        "postal_code" varchar(20) NULL,
        "latitude" numeric(10,7) NULL,
        "longitude" numeric(10,7) NULL,
        "service_radius_km" numeric(6,2) NULL,
        "status" "farm_service_areas_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_farm_service_areas_farm_id" ON "farm_service_areas" ("farm_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_farm_service_areas_farm_id_status" ON "farm_service_areas" ("farm_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_farm_service_areas_city" ON "farm_service_areas" ("city")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_farm_service_areas_postal_code" ON "farm_service_areas" ("postal_code")`,
    );

    // --- farm_milk_products ---
    await queryRunner.query(`
      CREATE TYPE "farm_milk_products_milk_type_enum" AS ENUM ('COW', 'BUFFALO', 'MIXED', 'TONED', 'OTHER')
    `);
    await queryRunner.query(`
      CREATE TABLE "farm_milk_products" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "farm_id" uuid NOT NULL REFERENCES "farms"("id") ON DELETE CASCADE,
        "name" varchar(150) NOT NULL,
        "milk_type" "farm_milk_products_milk_type_enum" NOT NULL,
        "description" text NULL,
        "current_rate_per_litre" numeric(12,2) NOT NULL,
        "minimum_quantity" numeric(10,3) NOT NULL,
        "maximum_quantity" numeric(10,3) NULL,
        "available_shifts" jsonb NOT NULL,
        "is_available" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_farm_milk_products_farm_id" ON "farm_milk_products" ("farm_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_farm_milk_products_farm_id_is_available" ON "farm_milk_products" ("farm_id", "is_available")`,
    );

    // --- milk_rate_history ---
    await queryRunner.query(`
      CREATE TABLE "milk_rate_history" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "farm_product_id" uuid NOT NULL REFERENCES "farm_milk_products"("id") ON DELETE CASCADE,
        "rate_per_litre" numeric(12,2) NOT NULL,
        "effective_from" date NOT NULL,
        "effective_to" date NULL,
        "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_milk_rate_history_farm_product_id" ON "milk_rate_history" ("farm_product_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_milk_rate_history_farm_product_id_effective_from" ON "milk_rate_history" ("farm_product_id", "effective_from")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "milk_rate_history"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "farm_milk_products"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "farm_milk_products_milk_type_enum"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "farm_service_areas"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "farm_service_areas_status_enum"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "customer_addresses"`);
  }
}
