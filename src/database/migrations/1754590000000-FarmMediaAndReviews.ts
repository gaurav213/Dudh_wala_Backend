import { MigrationInterface, QueryRunner } from 'typeorm';

export class FarmMediaAndReviews1754590000000 implements MigrationInterface {
  name = 'FarmMediaAndReviews1754590000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "farm_media" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "farm_id" uuid NOT NULL REFERENCES "farms"("id") ON DELETE CASCADE,
        "url" varchar(500) NOT NULL,
        "sort_order" int NOT NULL DEFAULT 0,
        "uploaded_by_user_id" uuid NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_farm_media_farm_id" ON "farm_media" ("farm_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "farm_reviews" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "farm_id" uuid NOT NULL REFERENCES "farms"("id") ON DELETE CASCADE,
        "customer_user_id" uuid NOT NULL,
        "rating" smallint NOT NULL,
        "comment" text,
        "status" "customer_review_status_enum" NOT NULL DEFAULT 'PUBLISHED',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_farm_reviews_farm_customer" UNIQUE ("farm_id", "customer_user_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_farm_reviews_farm_id" ON "farm_reviews" ("farm_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "farm_reviews"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "farm_media"`);
  }
}
