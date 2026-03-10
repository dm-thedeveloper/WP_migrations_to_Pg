/**
 * WordPress Product Shipping Measurements Migration
 * Creates ShippingMeasurements records from WordPress product dimensions
 * Links Products to their shipping measurements
 */

import mysql from "mysql2/promise";
import { Client } from "pg";
import * as dotenv from "dotenv";

dotenv.config();

// WordPress MySQL configuration
const wpConfig = {
  host: process.env.WP_DB_HOST || "srv447.hstgr.io",
  user: process.env.WP_DB_USER || "u758272264_NW_DB",
  password: process.env.WP_DB_PASSWORD || "Aeiou@123",
  database: process.env.WP_DB_NAME || "u758272264_NW_DB",
  port: parseInt(process.env.WP_DB_PORT || "3306"),
};

// PostgreSQL configuration
const pgConfig = {
  host: "13.60.17.42",
  port: 5432,
  user: "adminuser",
  password: "Vgvguy766%^&FuuvD",
  database: "wordpress_migration_db",
};

interface MigrationStats {
  total: number;
  created: number;
  skipped: number;
  errors: number;
}

class ShippingMeasurementsMigration {
  private wpConnection!: mysql.Connection;
  private pgClient!: Client;
  private stats: MigrationStats = {
    total: 0,
    created: 0,
    skipped: 0,
    errors: 0,
  };

  async connect() {
    console.log("🔌 Connecting to WordPress MySQL...");
    this.wpConnection = await mysql.createConnection(wpConfig);
    console.log("✅ WordPress connected\n");

    console.log("🔌 Connecting to PostgreSQL...");
    this.pgClient = new Client(pgConfig);
    await this.pgClient.connect();
    console.log("✅ PostgreSQL connected\n");
  }

  async disconnect() {
    if (this.wpConnection) await this.wpConnection.end();
    if (this.pgClient) await this.pgClient.end();
  }

  async ensureShippingMeasurementsTable() {
    console.log("📋 Ensuring ShippingMeasurements table exists...");

    // Create UnitTypes enum if not exists
    await this.pgClient.query(`
      DO $$ BEGIN
        CREATE TYPE "UnitTypes" AS ENUM ('KG', 'G', 'CM', 'M');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await this.pgClient.query(`
      CREATE TABLE IF NOT EXISTS "ShippingMeasurements" (
        id SERIAL PRIMARY KEY,
        "itemWeight" INTEGER NOT NULL DEFAULT 0,
        "itemWeightUnit" "UnitTypes" NOT NULL DEFAULT 'KG',
        "itemLength" INTEGER NOT NULL DEFAULT 0,
        "itemLengthUnit" "UnitTypes" NOT NULL DEFAULT 'CM',
        "itemWidth" INTEGER NOT NULL DEFAULT 0,
        "itemWidthUnit" "UnitTypes" NOT NULL DEFAULT 'CM',
        "itemHeight" INTEGER NOT NULL DEFAULT 0,
        "itemHeightUnit" "UnitTypes" NOT NULL DEFAULT 'CM',
        "packageWeight" INTEGER NOT NULL DEFAULT 0,
        "packageWeightUnit" "UnitTypes" NOT NULL DEFAULT 'KG',
        "packageLength" INTEGER NOT NULL DEFAULT 0,
        "packageLengthUnit" "UnitTypes" NOT NULL DEFAULT 'CM',
        "packageWidth" INTEGER NOT NULL DEFAULT 0,
        "packageWidthUnit" "UnitTypes" NOT NULL DEFAULT 'CM',
        "packageHeight" INTEGER NOT NULL DEFAULT 0,
        "packageHeightUnit" "UnitTypes" NOT NULL DEFAULT 'CM'
      )
    `);

    console.log("✅ ShippingMeasurements table ready\n");
  }

  async fetchProductDimensions() {
    console.log("🔍 Fetching WordPress product dimensions...");

    const query = `
      SELECT 
        p.ID as product_id,
        MAX(CASE WHEN pm.meta_key = '_weight' THEN pm.meta_value END) as weight,
        MAX(CASE WHEN pm.meta_key = '_length' THEN pm.meta_value END) as length,
        MAX(CASE WHEN pm.meta_key = '_width' THEN pm.meta_value END) as width,
        MAX(CASE WHEN pm.meta_key = '_height' THEN pm.meta_value END) as height
      FROM wp_posts p
      LEFT JOIN wp_postmeta pm ON p.ID = pm.post_id
      WHERE p.post_type = 'product'
        AND p.post_status IN ('publish', 'draft', 'pending', 'private')
      GROUP BY p.ID
      HAVING weight IS NOT NULL OR length IS NOT NULL OR width IS NOT NULL OR height IS NOT NULL
    `;

    const [products] =
      await this.wpConnection.query<mysql.RowDataPacket[]>(query);
    return products;
  }

  async productExists(productId: number): Promise<boolean> {
    const result = await this.pgClient.query(
      'SELECT id, "shippingMeasurementsId" FROM "Product" WHERE id = $1',
      [productId],
    );
    return result.rows.length > 0;
  }

  async createShippingMeasurement(product: any): Promise<number | null> {
    // Parse dimensions (WordPress stores as strings)
    const weight = Math.round(parseFloat(product.weight || "0") * 1000); // Convert kg to grams, then to int
    const length = Math.round(parseFloat(product.length || "0"));
    const width = Math.round(parseFloat(product.width || "0"));
    const height = Math.round(parseFloat(product.height || "0"));

    // Skip if all dimensions are 0
    if (weight === 0 && length === 0 && width === 0 && height === 0) {
      return null;
    }

    const query = `
      INSERT INTO "ShippingMeasurements" (
        "itemWeight", "itemWeightUnit",
        "itemLength", "itemLengthUnit",
        "itemWidth", "itemWidthUnit",
        "itemHeight", "itemHeightUnit",
        "packageWeight", "packageWeightUnit",
        "packageLength", "packageLengthUnit",
        "packageWidth", "packageWidthUnit",
        "packageHeight", "packageHeightUnit"
      ) VALUES (
        $1, 'G', $2, 'CM', $3, 'CM', $4, 'CM',
        $1, 'G', $2, 'CM', $3, 'CM', $4, 'CM'
      ) RETURNING id
    `;

    const result = await this.pgClient.query(query, [
      weight,
      length,
      width,
      height,
    ]);
    return result.rows[0].id;
  }

  async linkProductToShippingMeasurements(
    productId: number,
    shippingId: number,
  ) {
    await this.pgClient.query(
      'UPDATE "Product" SET "shippingMeasurementsId" = $1 WHERE id = $2',
      [shippingId, productId],
    );
  }

  async run() {
    try {
      await this.connect();
      await this.ensureShippingMeasurementsTable();

      const products = await this.fetchProductDimensions();
      this.stats.total = products.length;
      console.log(`📊 Found ${products.length} products with dimensions\n`);

      console.log("🚀 Creating shipping measurements...\n");

      for (const product of products) {
        try {
          // Check if product exists in target DB
          const exists = await this.productExists(product.product_id);
          if (!exists) {
            this.stats.skipped++;
            continue;
          }

          // Create shipping measurement
          const shippingId = await this.createShippingMeasurement(product);

          if (shippingId) {
            await this.linkProductToShippingMeasurements(
              product.product_id,
              shippingId,
            );
            this.stats.created++;

            if (this.stats.created % 500 === 0) {
              console.log(
                `  Created ${this.stats.created} shipping measurements...`,
              );
            }
          } else {
            this.stats.skipped++;
          }
        } catch (error: any) {
          this.stats.errors++;
        }
      }

      this.printSummary();
    } catch (error) {
      console.error("💥 Migration failed:", error);
      throw error;
    } finally {
      await this.disconnect();
    }
  }

  printSummary() {
    console.log("\n" + "=".repeat(50));
    console.log("📈 Shipping Measurements Migration Summary");
    console.log("=".repeat(50));
    console.log(`Total products with dimensions: ${this.stats.total}`);
    console.log(`✅ Created:  ${this.stats.created}`);
    console.log(`⏭️  Skipped:  ${this.stats.skipped}`);
    console.log(`❌ Errors:   ${this.stats.errors}`);
    console.log("=".repeat(50));
  }
}

// Run migration
if (require.main === module) {
  const migration = new ShippingMeasurementsMigration();

  migration
    .run()
    .then(() => {
      console.log("\n🎉 Shipping measurements migration completed!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Migration failed:", error);
      process.exit(1);
    });
}

export default ShippingMeasurementsMigration;
