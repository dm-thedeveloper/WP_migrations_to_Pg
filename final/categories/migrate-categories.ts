/**
 * WordPress Categories to PostgreSQL Migration
 * Preserves WordPress term_id as PostgreSQL id
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
  // host: "13.60.17.42",
  host: "13.61.44.207",
  port: 5432,
  user: "adminuser",
  password: "Vgvguy766%^&FuuvD",
  database: "wordpress_migration_db",
};
console.log("Starting Category Migration...", pgConfig);

interface MigrationStats {
  total: number;
  success: number;
  skipped: number;
  errors: number;
}

class CategoryMigration {
  private wpConnection!: mysql.Connection;
  private pgClient!: Client;
  private stats: MigrationStats = {
    total: 0,
    success: 0,
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
    if (this.wpConnection) {
      await this.wpConnection.end();
    }
    if (this.pgClient) {
      await this.pgClient.end();
    }
  }

  async createCategoryTable() {
    console.log("📋 Creating Category table if not exists...");

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS "Category" (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
         slug VARCHAR(255), 
        "categoryType" VARCHAR(50) NOT NULL,
        "isActive" BOOLEAN DEFAULT true,
        "parentId" INTEGER,
        image VARCHAR(500),
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY ("parentId") REFERENCES "Category"(id) ON DELETE CASCADE
      );`;

    await this.pgClient.query(createTableQuery);
    console.log("✅ Category table ready\n");
  }

  async fetchWordPressCategories() {
    console.log("🔍 Fetching WordPress product categories...");

    const query = `
      SELECT 
        t.term_id as category_id,
        t.name as category_name,
        t.slug as category_slug,
        tt.taxonomy,
        tt.description,
        tt.parent as parent_id,
        tt.count as product_count,
        
        -- Get category image from termmeta
        MAX(CASE WHEN tm.meta_key = 'thumbnail_id' THEN tm.meta_value END) as thumbnail_id
        
      FROM wp_terms t
      JOIN wp_term_taxonomy tt ON t.term_id = tt.term_id
      LEFT JOIN wp_termmeta tm ON t.term_id = tm.term_id 
        AND tm.meta_key = 'thumbnail_id'
      WHERE tt.taxonomy = 'product_cat'
      GROUP BY t.term_id, t.name, t.slug, tt.taxonomy, tt.description, tt.parent, tt.count
      ORDER BY tt.parent, t.term_id
    `;

    const [categories] =
      await this.wpConnection.query<mysql.RowDataPacket[]>(query);
    return categories;
  }

  async categoryExists(categoryId: number): Promise<boolean> {
    const result = await this.pgClient.query(
      'SELECT id FROM "Category" WHERE id = $1 LIMIT 1',
      [categoryId],
    );
    return result.rows.length > 0;
  }

  async getImageUrl(thumbnailId: string | null): Promise<string | null> {
    if (!thumbnailId) return null;

    try {
      const query = `
        SELECT guid 
        FROM wp_posts 
        WHERE ID = ? AND post_type = 'attachment'
      `;
      const [result] = await this.wpConnection.query<mysql.RowDataPacket[]>(
        query,
        [thumbnailId],
      );

      return result.length > 0 ? result[0].guid : null;
    } catch (error) {
      return null;
    }
  }

  async parentExists(parentId: number): Promise<boolean> {
    if (!parentId || parentId === 0) return true;

    const result = await this.pgClient.query(
      'SELECT id FROM "Category" WHERE id = $1 LIMIT 1',
      [parentId],
    );
    return result.rows.length > 0;
  }

  async insertCategory(category: any) {
    const imageUrl = await this.getImageUrl(category.thumbnail_id);

    // Check if parent exists, if not set to NULL
    const parentId = category.parent_id === 0 ? null : category.parent_id;
    const parentExistsInDb = await this.parentExists(category.parent_id);

    const finalParentId = parentExistsInDb ? parentId : null;

    if (parentId && !parentExistsInDb) {
      console.log(
        `  ⚠️  Parent ${parentId} doesn't exist for "${category.category_name}", setting as root category`,
      );
    }

    const query = `
      INSERT INTO "Category" (
        id,
        name,
        slug,
        "categoryType",
        "isActive",
        "parentId",
        image,
        "createdAt",
        "updatedAt"
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9
      )`;

    const values = [
      category.category_id, // Preserve WordPress ID
      category.category_name,
      category.category_slug,
      // "product_category", // categoryType
      category.parent_id === 0 || !category.parent_id ? "parent" : "child",
      true, // isActive
      finalParentId, // parentId (NULL if parent doesn't exist)
      imageUrl, // image
      new Date(), // createdAt
      new Date(), // updatedAt
    ];

    await this.pgClient.query(query, values);
  }

  async migrateCategory(category: any) {
    try {
      const exists = await this.categoryExists(category.category_id);

      if (exists) {
        console.log(
          `⏭️  Skipping: ${category.category_name} (ID ${category.category_id} already exists)`,
        );
        this.stats.skipped++;
        return;
      }

      await this.insertCategory(category);

      const parentInfo = category.parent_id
        ? ` → Parent: ${category.parent_id}`
        : " (Root)";
      console.log(
        `✅ Migrated: ${category.category_name} (ID: ${category.category_id})${parentInfo}`,
      );
      this.stats.success++;
    } catch (error: any) {
      console.error(
        `❌ Error migrating ${category.category_name}:`,
        error.message,
      );
      this.stats.errors++;
    }
  }

  async updateSequence() {
    console.log("\n🔄 Updating ID sequence...");
    try {
      // Get the maximum ID from Category table
      const maxIdQuery = 'SELECT MAX(id) as max_id FROM "Category"';
      const result = await this.pgClient.query(maxIdQuery);
      const maxId = result.rows[0].max_id || 0;

      // Update the sequence to start from maxId + 1
      const sequenceQuery = `SELECT setval('"Category_id_seq"', $1, true)`;
      await this.pgClient.query(sequenceQuery, [maxId]);

      console.log(`✅ Sequence updated to start from ${maxId + 1}\n`);
    } catch (error: any) {
      console.log("⚠️  Could not update sequence:", error.message);
    }
  }

  async run() {
    try {
      await this.connect();
      await this.createCategoryTable();

      const wpCategories = await this.fetchWordPressCategories();
      this.stats.total = wpCategories.length;
      console.log(`📊 Found ${wpCategories.length} categories\n`);

      console.log("🚀 Starting migration...\n");

      // First pass: migrate root categories (parentId = 0 or NULL)
      console.log("📍 Pass 1: Migrating root categories...\n");
      const rootCategories = wpCategories.filter(
        (c) => c.parent_id === 0 || !c.parent_id,
      );
      for (const category of rootCategories) {
        await this.migrateCategory(category);
      }

      // Second pass: migrate child categories
      console.log("\n📍 Pass 2: Migrating child categories...\n");
      const childCategories = wpCategories.filter(
        (c) => c.parent_id !== 0 && c.parent_id,
      );
      for (const category of childCategories) {
        await this.migrateCategory(category);
      }

      await this.updateSequence();
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
    console.log("📈 Category Migration Summary");
    console.log("=".repeat(50));
    console.log(`Total categories: ${this.stats.total}`);
    console.log(`✅ Success:       ${this.stats.success}`);
    console.log(`⏭️  Skipped:       ${this.stats.skipped}`);
    console.log(`❌ Errors:        ${this.stats.errors}`);
    console.log("=".repeat(50));

    if (this.stats.success > 0) {
      console.log("\n✅ Categories migrated with preserved WordPress IDs!");
    }
  }
}

// Run migration
if (require.main === module) {
  const migration = new CategoryMigration();

  migration
    .run()
    .then(() => {
      console.log("🎉 Category migration completed!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Migration failed:", error);
      process.exit(1);
    });
}

export default CategoryMigration;
