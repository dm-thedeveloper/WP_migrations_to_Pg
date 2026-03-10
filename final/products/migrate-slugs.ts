/**
 * WordPress Product Slugs Migration
 * Migrates post_name from WordPress wp_posts to Product.slug in PostgreSQL
 *
 * This script ONLY:
 * 1. Finds products in PostgreSQL that have empty/null slugs
 * 2. Fetches the exact post_name from WordPress
 * 3. Updates the slug field with the EXACT WordPress post_name
 * 4. Skips products that don't have a post_name in WordPress
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
  host: "13.61.44.207",
  port: 5432,
  user: "adminuser",
  password: "Vgvguy766%^&FuuvD",
  database: "wordpress_migration_db",
};

interface MigrationStats {
  totalProductsWithoutSlug: number;
  updated: number;
  skippedNoWpSlug: number;
  skippedNotInWp: number;
  errors: number;
}

class SlugMigration {
  private wpConnection!: mysql.Connection;
  private pgClient!: Client;
  private stats: MigrationStats = {
    totalProductsWithoutSlug: 0,
    updated: 0,
    skippedNoWpSlug: 0,
    skippedNotInWp: 0,
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
    if (this.wpConnection) {
      await this.wpConnection.end();
    }
    if (this.pgClient) {
      await this.pgClient.end();
    }
  }

  /**
   * Get products from PostgreSQL that have empty or null slugs
   */
  async getProductsWithoutSlugs(): Promise<number[]> {
    console.log("🔍 Finding products with empty slugs in PostgreSQL...");
    const result = await this.pgClient.query(
      `SELECT id FROM "Product" WHERE slug IS NULL OR slug = '' ORDER BY id`,
    );
    const ids = result.rows.map((r) => r.id);
    console.log(`  Found ${ids.length} products without slugs\n`);
    return ids;
  }

  /**
   * Fetch post_name for a specific product from WordPress
   */
  async getWordPressSlug(productId: number): Promise<string | null> {
    const [rows] = await this.wpConnection.query<mysql.RowDataPacket[]>(
      `SELECT post_name FROM wp_posts WHERE ID = ? AND post_type = 'product' LIMIT 1`,
      [productId],
    );

    if (rows.length === 0) {
      return null; // Product doesn't exist in WordPress
    }

    const postName = rows[0].post_name;

    // Return null if post_name is empty
    if (!postName || postName.trim() === "") {
      return null;
    }

    return postName;
  }

  /**
   * Update slug for a single product
   */
  async updateProductSlug(productId: number, slug: string): Promise<boolean> {
    try {
      const result = await this.pgClient.query(
        `UPDATE "Product" SET slug = $1, "updatedAt" = NOW() WHERE id = $2`,
        [slug, productId],
      );
      return (result.rowCount ?? 0) > 0;
    } catch (error: any) {
      // Handle unique constraint violation
      if (error.code === "23505") {
        console.log(`    ⚠️  Unique constraint violation for slug: ${slug}`);
        return false;
      }
      throw error;
    }
  }

  /**
   * Main migration process
   */
  async run() {
    console.log(
      "═══════════════════════════════════════════════════════════════",
    );
    console.log("       WORDPRESS PRODUCT SLUG MIGRATION");
    console.log("       Migrating post_name → Product.slug");
    console.log(
      "═══════════════════════════════════════════════════════════════\n",
    );

    // Get all products that need slugs
    const productIds = await this.getProductsWithoutSlugs();
    this.stats.totalProductsWithoutSlug = productIds.length;

    if (productIds.length === 0) {
      console.log("✅ All products already have slugs. Nothing to migrate.");
      return;
    }

    console.log("🚀 Starting slug migration...\n");

    let processed = 0;
    for (const productId of productIds) {
      processed++;

      // Progress indicator every 100 products
      if (processed % 100 === 0) {
        console.log(
          `  Progress: ${processed}/${this.stats.totalProductsWithoutSlug} products processed...`,
        );
      }

      try {
        // Get the WordPress post_name
        const wpSlug = await this.getWordPressSlug(productId);

        if (wpSlug === null) {
          // Check if it's because product doesn't exist or has no slug
          const [checkExists] = await this.wpConnection.query<
            mysql.RowDataPacket[]
          >(
            `SELECT ID FROM wp_posts WHERE ID = ? AND post_type = 'product' LIMIT 1`,
            [productId],
          );

          if (checkExists.length === 0) {
            this.stats.skippedNotInWp++;
          } else {
            this.stats.skippedNoWpSlug++;
          }
          continue;
        }

        // Update with the EXACT WordPress slug
        const updated = await this.updateProductSlug(productId, wpSlug);

        if (updated) {
          this.stats.updated++;
          console.log(`  ✅ Product #${productId}: ${wpSlug}`);
        } else {
          this.stats.errors++;
          console.log(`  ❌ Failed to update Product #${productId}`);
        }
      } catch (error: any) {
        this.stats.errors++;
        console.log(`  ❌ Error for Product #${productId}: ${error.message}`);
      }
    }

    this.printSummary();
  }

  /**
   * Preview mode - show what would be migrated without making changes
   */
  async preview(limit: number = 50) {
    console.log(
      "═══════════════════════════════════════════════════════════════",
    );
    console.log("       SLUG MIGRATION PREVIEW (DRY RUN)");
    console.log(
      "═══════════════════════════════════════════════════════════════\n",
    );

    // Get all products that need slugs
    const productIds = await this.getProductsWithoutSlugs();

    if (productIds.length === 0) {
      console.log("✅ All products already have slugs. Nothing to migrate.");
      return;
    }

    console.log(`📋 Preview of products that will be updated:\n`);
    console.log("─".repeat(80));
    console.log("ID".padEnd(10) + "WordPress Slug (post_name)".padEnd(70));
    console.log("─".repeat(80));

    let previewCount = 0;
    let withSlug = 0;
    let withoutSlug = 0;
    let notInWp = 0;

    for (const productId of productIds) {
      const wpSlug = await this.getWordPressSlug(productId);

      if (wpSlug === null) {
        // Check why
        const [checkExists] = await this.wpConnection.query<
          mysql.RowDataPacket[]
        >(
          `SELECT ID FROM wp_posts WHERE ID = ? AND post_type = 'product' LIMIT 1`,
          [productId],
        );

        if (checkExists.length === 0) {
          notInWp++;
          if (previewCount < limit) {
            console.log(
              String(productId).padEnd(10) +
                "(not found in WordPress - will skip)".padEnd(70),
            );
            previewCount++;
          }
        } else {
          withoutSlug++;
          if (previewCount < limit) {
            console.log(
              String(productId).padEnd(10) +
                "(empty post_name - will skip)".padEnd(70),
            );
            previewCount++;
          }
        }
      } else {
        withSlug++;
        if (previewCount < limit) {
          console.log(
            String(productId).padEnd(10) + wpSlug.substring(0, 68).padEnd(70),
          );
          previewCount++;
        }
      }
    }

    console.log("─".repeat(80));
    console.log(`\n📊 Summary:`);
    console.log(`  Products without slugs in PostgreSQL: ${productIds.length}`);
    console.log(`  Will be updated (have WP post_name):  ${withSlug}`);
    console.log(`  Will be skipped (empty post_name):    ${withoutSlug}`);
    console.log(`  Will be skipped (not in WordPress):   ${notInWp}`);
    console.log(`\n💡 Run without --preview flag to execute migration`);
  }

  printSummary() {
    console.log(
      "\n═══════════════════════════════════════════════════════════════",
    );
    console.log("                    MIGRATION SUMMARY");
    console.log(
      "═══════════════════════════════════════════════════════════════",
    );
    console.log(
      `  📊 Products without slugs:     ${this.stats.totalProductsWithoutSlug}`,
    );
    console.log(`  ✅ Successfully updated:       ${this.stats.updated}`);
    console.log(
      `  ⏭️  Skipped (no WP post_name): ${this.stats.skippedNoWpSlug}`,
    );
    console.log(
      `  ⏭️  Skipped (not in WP):       ${this.stats.skippedNotInWp}`,
    );
    console.log(`  ❌ Errors:                     ${this.stats.errors}`);
    console.log(
      "═══════════════════════════════════════════════════════════════\n",
    );
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const isPreview = args.includes("--preview");

  const migration = new SlugMigration();

  try {
    await migration.connect();

    if (isPreview) {
      await migration.preview();
    } else {
      await migration.run();
    }
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await migration.disconnect();
  }
}

main();
