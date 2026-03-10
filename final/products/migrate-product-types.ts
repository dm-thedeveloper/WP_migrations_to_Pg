/**
 * WordPress Product Type Migration
 * Links Products to Categories via productTypeId
 * Uses WordPress product category to determine product type
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
  linked: number;
  skipped: number;
  notFound: number;
  errors: number;
}

class ProductTypeMigration {
  private wpConnection!: mysql.Connection;
  private pgClient!: Client;
  private stats: MigrationStats = {
    total: 0,
    linked: 0,
    skipped: 0,
    notFound: 0,
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

  async fetchProductCategories() {
    console.log("🔍 Fetching WordPress product categories...");

    // Get the primary (first) category for each product
    const query = `
      SELECT 
        p.ID as product_id,
        t.term_id as category_id,
        t.name as category_name,
        t.slug as category_slug
      FROM wp_posts p
      INNER JOIN wp_term_relationships tr ON p.ID = tr.object_id
      INNER JOIN wp_term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
      INNER JOIN wp_terms t ON tt.term_id = t.term_id
      WHERE p.post_type = 'product'
        AND p.post_status IN ('publish', 'draft', 'pending', 'private')
        AND tt.taxonomy = 'product_cat'
      ORDER BY p.ID, tt.term_id
    `;

    const [results] =
      await this.wpConnection.query<mysql.RowDataPacket[]>(query);

    // Group by product and get the first (primary) category
    const productCategories = new Map<number, any>();
    for (const row of results) {
      if (!productCategories.has(row.product_id)) {
        productCategories.set(row.product_id, {
          product_id: row.product_id,
          category_id: row.category_id,
          category_name: row.category_name,
          category_slug: row.category_slug,
        });
      }
    }

    return Array.from(productCategories.values());
  }

  async productExists(productId: number): Promise<boolean> {
    const result = await this.pgClient.query(
      'SELECT id FROM "Product" WHERE id = $1',
      [productId],
    );
    return result.rows.length > 0;
  }

  async categoryExists(categoryId: number): Promise<boolean> {
    const result = await this.pgClient.query(
      'SELECT id FROM "Category" WHERE id = $1',
      [categoryId],
    );
    return result.rows.length > 0;
  }

  async linkProductToType(productId: number, categoryId: number) {
    await this.pgClient.query(
      'UPDATE "Product" SET "productTypeId" = $1 WHERE id = $2',
      [categoryId, productId],
    );
  }

  async run() {
    try {
      await this.connect();

      const productCategories = await this.fetchProductCategories();
      this.stats.total = productCategories.length;
      console.log(
        `📊 Found ${productCategories.length} products with categories\n`,
      );

      console.log("🚀 Linking products to product types...\n");

      for (const pc of productCategories) {
        try {
          // Check if product exists in target DB
          const productExists = await this.productExists(pc.product_id);
          if (!productExists) {
            this.stats.skipped++;
            continue;
          }

          // Check if category exists in target DB
          const categoryExists = await this.categoryExists(pc.category_id);
          if (!categoryExists) {
            this.stats.notFound++;
            continue;
          }

          // Link product to category as productType
          await this.linkProductToType(pc.product_id, pc.category_id);
          this.stats.linked++;

          if (this.stats.linked % 1000 === 0) {
            console.log(`  Linked ${this.stats.linked} products to types...`);
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
    console.log("📈 Product Type Migration Summary");
    console.log("=".repeat(50));
    console.log(`Total products: ${this.stats.total}`);
    console.log(`✅ Linked:     ${this.stats.linked}`);
    console.log(`⏭️  Skipped:    ${this.stats.skipped}`);
    console.log(`🔍 Not Found:  ${this.stats.notFound}`);
    console.log(`❌ Errors:     ${this.stats.errors}`);
    console.log("=".repeat(50));
  }
}

// Run migration
if (require.main === module) {
  const migration = new ProductTypeMigration();

  migration
    .run()
    .then(() => {
      console.log("\n🎉 Product type linking completed!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Migration failed:", error);
      process.exit(1);
    });
}

export default ProductTypeMigration;
