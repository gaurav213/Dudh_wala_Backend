import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddressLocationRouting1754530000000 implements MigrationInterface {
  name = 'AddressLocationRouting1754530000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE address_location_source_enum AS ENUM (
          'CUSTOMER_GPS',
          'CUSTOMER_MAP_PIN',
          'FARM_MAP_PIN',
          'DELIVERY_STAFF_MAP_PIN',
          'GEOCODED_ADDRESS'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE customer_addresses
        ADD COLUMN IF NOT EXISTS location_source address_location_source_enum NULL,
        ADD COLUMN IF NOT EXISTS location_verified boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS location_verified_by_user_id uuid NULL,
        ADD COLUMN IF NOT EXISTS location_verified_at timestamptz NULL,
        ADD COLUMN IF NOT EXISTS location_accuracy_meters numeric(10,2) NULL
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE customer_addresses
          ADD CONSTRAINT customer_addresses_location_verified_by_user_id_fkey
          FOREIGN KEY (location_verified_by_user_id) REFERENCES users(id);
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_customer_addresses_latitude
        ON customer_addresses (latitude)
        WHERE latitude IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_customer_addresses_longitude
        ON customer_addresses (longitude)
        WHERE longitude IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_milk_deliveries_status_date
        ON milk_deliveries (status, delivery_date)
    `);

    // Backfill source for existing pins as customer map/GPS without inventing accuracy.
    await queryRunner.query(`
      UPDATE customer_addresses
      SET location_source = 'CUSTOMER_GPS'
      WHERE latitude IS NOT NULL
        AND longitude IS NOT NULL
        AND location_source IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS IDX_milk_deliveries_status_date`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS IDX_customer_addresses_longitude`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS IDX_customer_addresses_latitude`,
    );
    await queryRunner.query(`
      ALTER TABLE customer_addresses
        DROP CONSTRAINT IF EXISTS customer_addresses_location_verified_by_user_id_fkey
    `);
    await queryRunner.query(`
      ALTER TABLE customer_addresses
        DROP COLUMN IF EXISTS location_accuracy_meters,
        DROP COLUMN IF EXISTS location_verified_at,
        DROP COLUMN IF EXISTS location_verified_by_user_id,
        DROP COLUMN IF EXISTS location_verified,
        DROP COLUMN IF EXISTS location_source
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS address_location_source_enum`);
  }
}
