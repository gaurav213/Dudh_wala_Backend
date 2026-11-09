import { MigrationInterface, QueryRunner } from 'typeorm';

export class DairySales1754660000000 implements MigrationInterface {
  name = 'DairySales1754660000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "dairy_slips" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "farm_id" uuid NOT NULL,
        "dairy_name" character varying(150) NOT NULL,
        "slip_date" date NOT NULL,
        "litres" numeric(12,3) NOT NULL,
        "rate" numeric(12,2) NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "fat_percent" numeric(5,2),
        "raw_numbers" jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_dairy_slips" PRIMARY KEY ("id"),
        CONSTRAINT "FK_dairy_slips_farm" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_dairy_slips_farm_date" ON "dairy_slips" ("farm_id", "slip_date")`,
    );
    await queryRunner.query(`
      CREATE TABLE "dairy_payments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "farm_id" uuid NOT NULL,
        "dairy_name" character varying(150) NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "paid_on" date NOT NULL,
        "note" character varying(200),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_dairy_payments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_dairy_payments_farm" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_dairy_payments_farm_date" ON "dairy_payments" ("farm_id", "paid_on")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "dairy_payments"`);
    await queryRunner.query(`DROP TABLE "dairy_slips"`);
  }
}
