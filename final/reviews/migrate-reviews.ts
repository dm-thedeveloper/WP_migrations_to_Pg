/**
 * WordPress Product Reviews to PostgreSQL Migration
 * Direct PostgreSQL connection (NOT Prisma)
 * Preserves WordPress comment IDs as Review IDs
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

// PostgreSQL configuration (AWS)
const pgConfig = {
  host: "13.60.17.42",
  port: 5432,
  user: "adminuser",
  password: "Vgvguy766%^&FuuvD",
  database: "wordpress_migration_db",
};

interface MigrationStats {
  totalReviews: number;
  reviewsCreated: number;
  skipped: number;
  errors: number;
}

class ReviewMigration {
  private wpConnection!: mysql.Connection;
  private pgClient!: Client;
  private stats: MigrationStats = {
    totalReviews: 0,
    reviewsCreated: 0,
    skipped: 0,
    errors: 0,
  };

  async connect() {
    console.log("🔌 Connecting to WordPress MySQL...");
    this.wpConnection = await mysql.createConnection(wpConfig);
    console.log("✅ WordPress connected\n");

    console.log("🔌 Connecting to PostgreSQL (AWS)...");
    this.pgClient = new Client(pgConfig);
    await this.pgClient.connect();
    console.log("✅ PostgreSQL connected\n");
  }

  async disconnect() {
    if (this.wpConnection) await this.wpConnection.end();
    if (this.pgClient) await this.pgClient.end();
  }

  // =====================================================
  // PHASE 0: Create Tables
  // =====================================================

  async createTablesAndEnums() {
    console.log("📋 Phase 0: Creating Review table in PostgreSQL...\n");

    // Create Review table
    await this.pgClient.query(`
      CREATE TABLE IF NOT EXISTS "Review" (
        id INTEGER PRIMARY KEY,
        title TEXT,
        comment TEXT NOT NULL,
        rating INTEGER NOT NULL DEFAULT 0,
        "productId" INTEGER NOT NULL REFERENCES "Product"(id) ON DELETE CASCADE,
        "userId" INTEGER REFERENCES "User"(id) ON DELETE SET NULL,
        "isVerifiedPurchase" BOOLEAN DEFAULT false,
        status TEXT DEFAULT 'approved',
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log("  ✅ Review table verified");

    // Create indexes
    await this.pgClient.query(`
      CREATE INDEX IF NOT EXISTS idx_review_productid ON "Review"("productId");
      CREATE INDEX IF NOT EXISTS idx_review_userid ON "Review"("userId");
      CREATE INDEX IF NOT EXISTS idx_review_rating ON "Review"(rating);
    `);
    console.log("  ✅ Indexes created\n");
  }

  // =====================================================
  // PHASE 1: Fetch WordPress Reviews
  // =====================================================

  async fetchWordPressReviews(): Promise<any[]> {
    console.log("📋 Phase 1: Fetching WordPress product reviews...\n");

    const [reviews] = await this.wpConnection.query<mysql.RowDataPacket[]>(`
      SELECT 
        c.comment_ID as review_id,
        c.comment_post_ID as product_id,
        c.user_id,
        c.comment_author as author_name,
        c.comment_author_email as author_email,
        c.comment_content as review_text,
        c.comment_date as created_at,
        c.comment_date_gmt,
        c.comment_approved as status,
        c.comment_parent as parent_id,
        
        -- Get rating from commentmeta
        (SELECT meta_value FROM wp_commentmeta 
         WHERE comment_id = c.comment_ID AND meta_key = 'rating' LIMIT 1) as rating,
        
        -- Check if verified purchase
        (SELECT meta_value FROM wp_commentmeta 
         WHERE comment_id = c.comment_ID AND meta_key = 'verified' LIMIT 1) as verified
        
      FROM wp_comments c
      JOIN wp_posts p ON c.comment_post_ID = p.ID
      WHERE p.post_type = 'product'
        AND c.comment_type IN ('review', '')
        AND c.comment_approved IN ('1', '0', 'spam', 'trash')
      ORDER BY c.comment_ID ASC
    `);

    this.stats.totalReviews = reviews.length;
    console.log(`  ✅ Found ${reviews.length} product reviews\n`);

    return reviews;
  }

  // =====================================================
  // PHASE 2: Helper Functions
  // =====================================================

  async reviewExists(reviewId: number): Promise<boolean> {
    const result = await this.pgClient.query(
      'SELECT id FROM "Review" WHERE id = $1 LIMIT 1',
      [reviewId],
    );
    return result.rows.length > 0;
  }

  async productExists(productId: number): Promise<boolean> {
    const result = await this.pgClient.query(
      'SELECT id FROM "Product" WHERE id = $1 LIMIT 1',
      [productId],
    );
    return result.rows.length > 0;
  }

  async userExists(userId: number): Promise<boolean> {
    if (userId === 0) return false;
    const result = await this.pgClient.query(
      'SELECT id FROM "User" WHERE id = $1 LIMIT 1',
      [userId],
    );
    return result.rows.length > 0;
  }

  mapReviewStatus(wpStatus: string): string {
    const statusMap: { [key: string]: string } = {
      "1": "approved",
      "0": "pending",
      spam: "spam",
      trash: "deleted",
    };
    return statusMap[wpStatus] || "pending";
  }

  // =====================================================
  // PHASE 3: Migrate Single Review
  // =====================================================

  async migrateReview(review: any) {
    try {
      const reviewId = review.review_id;
      const productId = review.product_id;
      const userId = parseInt(review.user_id || "0");

      // Check if review already exists
      if (await this.reviewExists(reviewId)) {
        this.stats.skipped++;
        return;
      }

      // Check if product exists
      if (!(await this.productExists(productId))) {
        console.log(
          `⚠️  Product ${productId} not found for review ${reviewId}`,
        );
        this.stats.skipped++;
        return;
      }

      // Check if user exists (if provided)
      let finalUserId: number | null = null;
      if (userId > 0) {
        if (await this.userExists(userId)) {
          finalUserId = userId;
        }
      }

      const rating = parseInt(review.rating || "0");
      const isVerified = review.verified === "1" || review.verified === "yes";
      const status = this.mapReviewStatus(review.status);

      // Insert review
      await this.pgClient.query(
        `
        INSERT INTO "Review" (
          id, comment, rating, "productId", "userId",
          "isVerifiedPurchase", status, "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO NOTHING
      `,
        [
          reviewId,
          review.review_text || "",
          rating,
          productId,
          finalUserId,
          isVerified,
          status,
          new Date(review.created_at),
          new Date(review.created_at),
        ],
      );

      this.stats.reviewsCreated++;

      // Log progress every 100 reviews
      if (this.stats.reviewsCreated % 100 === 0) {
        console.log(
          `  ✅ Migrated ${this.stats.reviewsCreated}/${this.stats.totalReviews} reviews...`,
        );
      }
    } catch (error: any) {
      console.error(
        `❌ Error migrating review ${review.review_id}: ${error.message}`,
      );
      this.stats.errors++;
    }
  }

  // =====================================================
  // PHASE 4: Update Sequences
  // =====================================================

  async updateSequences() {
    console.log("\n🔄 Updating sequences...");

    try {
      // Review sequence (if using SERIAL)
      const reviewMax = await this.pgClient.query(
        'SELECT MAX(id) as max_id FROM "Review"',
      );
      if (reviewMax.rows[0].max_id) {
        // Note: Review uses preserved WordPress IDs, so sequence update is optional
        console.log(`  Review max ID: ${reviewMax.rows[0].max_id}`);
      }
    } catch (error: any) {
      console.log("⚠️  Could not update sequences:", error.message);
    }
  }

  // =====================================================
  // PHASE 5: Update Product Ratings
  // =====================================================

  async updateProductRatings() {
    console.log("\n📊 Updating product average ratings...");

    try {
      // Calculate and update average ratings for each product
      await this.pgClient.query(`
        UPDATE "Product" p
        SET rattings = COALESCE((
          SELECT AVG(rating)::DECIMAL(3,2)
          FROM "Review" r
          WHERE r."productId" = p.id
            AND r.status = 'approved'
            AND r.rating > 0
        ), 0)
        WHERE EXISTS (
          SELECT 1 FROM "Review" r 
          WHERE r."productId" = p.id
        )
      `);

      console.log("  ✅ Product ratings updated");
    } catch (error: any) {
      console.log("⚠️  Could not update product ratings:", error.message);
    }
  }

  // =====================================================
  // MAIN RUN
  // =====================================================

  async run() {
    try {
      await this.connect();

      // Phase 0: Create tables
      await this.createTablesAndEnums();

      // Phase 1: Fetch WordPress reviews
      const reviews = await this.fetchWordPressReviews();

      console.log("🚀 Phase 2: Migrating reviews...\n");

      // Process each review
      for (const review of reviews) {
        await this.migrateReview(review);
      }

      // Phase 3: Update sequences
      await this.updateSequences();

      // Phase 4: Update product ratings
      await this.updateProductRatings();

      this.printSummary();
    } catch (error) {
      console.error("💥 Migration failed:", error);
      throw error;
    } finally {
      await this.disconnect();
    }
  }

  printSummary() {
    console.log("\n" + "=".repeat(60));
    console.log("📊 REVIEW MIGRATION SUMMARY");
    console.log("=".repeat(60));
    console.log(`Total WP reviews:      ${this.stats.totalReviews}`);
    console.log(`✅ Reviews created:    ${this.stats.reviewsCreated}`);
    console.log(`⏭️  Skipped:            ${this.stats.skipped}`);
    console.log(`❌ Errors:             ${this.stats.errors}`);
    console.log("=".repeat(60));

    console.log("\n✅ Migration includes:");
    console.log("   - Preserved WordPress comment IDs");
    console.log("   - Review ratings (1-5 stars)");
    console.log("   - Verified purchase status");
    console.log("   - Updated product average ratings");
  }
}

// Run migration
if (require.main === module) {
  const migration = new ReviewMigration();

  migration
    .run()
    .then(() => {
      console.log("\n🎉 Review migration completed!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Migration failed:", error);
      process.exit(1);
    });
}

export default ReviewMigration;
