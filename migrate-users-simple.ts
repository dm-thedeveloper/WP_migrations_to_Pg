#!/usr/bin/env ts-node

/**
 * Simplified WordPress to PostgreSQL User Migration Script
 *
 * This script migrates users from WordPress (wp_users and wp_usermeta)
 * to PostgreSQL database using Prisma.
 *
 * Usage:
 *   1. Set up your .env file with database credentials
 *   2. Run: npm run migrate:users
 */

import { PrismaClient } from "@prisma/client";
import mysql from "mysql2/promise";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

// WordPress database configuration
const wpConfig = {
  host: process.env.WP_DB_HOST || "localhost",
  user: process.env.WP_DB_USER,
  password: process.env.WP_DB_PASSWORD,
  database: process.env.WP_DB_NAME,
  port: parseInt(process.env.WP_DB_PORT || "3306"),
};

interface MigrationStats {
  total: number;
  success: number;
  skipped: number;
  errors: number;
}

class WordPressUserMigration {
  private wpConnection!: mysql.Connection;
  private stats: MigrationStats = {
    total: 0,
    success: 0,
    skipped: 0,
    errors: 0,
  };

  async connect() {
    console.log("🔌 Connecting to WordPress database...");
    this.wpConnection = await mysql.createConnection(wpConfig);
    console.log("✅ Connected successfully\n");
  }

  async disconnect() {
    if (this.wpConnection) {
      await this.wpConnection.end();
    }
    await prisma.$disconnect();
  }

  async fetchWordPressUsers() {
    const [users] = await this.wpConnection.query<mysql.RowDataPacket[]>(
      `SELECT * FROM wp_users WHERE deleted = 0 AND spam = 0 ORDER BY ID`
    );
    return users;
  }

  async getUserMeta(userId: number): Promise<Record<string, string>> {
    const [metaRows] = await this.wpConnection.query<mysql.RowDataPacket[]>(
      "SELECT meta_key, meta_value FROM wp_usermeta WHERE user_id = ?",
      [userId]
    );

    const meta: Record<string, string> = {};
    metaRows.forEach((row) => {
      if (row.meta_value) {
        meta[row.meta_key] = row.meta_value;
      }
    });

    return meta;
  }

  determineRole(
    meta: Record<string, string>
  ): "ADMIN" | "VENDOR" | "BUYER" | "SUB_ADMIN" {
    const capabilities = meta.wp_capabilities || "";

    if (capabilities.includes("administrator")) return "ADMIN";
    if (
      capabilities.includes("vendor") ||
      capabilities.includes("seller") ||
      capabilities.includes("shop_manager")
    )
      return "VENDOR";
    if (
      capabilities.includes("sub_admin") ||
      capabilities.includes("moderator")
    )
      return "SUB_ADMIN";

    return "BUYER";
  }

  async migrateUser(wpUser: any) {
    try {
      // Check if user exists
      const existing = await prisma.user.findUnique({
        where: { email: wpUser.user_email },
      });

      if (existing) {
        console.log(`⏭️  Skipping: ${wpUser.user_email} (already exists)`);
        this.stats.skipped++;
        return;
      }

      // Get user metadata
      const meta = await this.getUserMeta(wpUser.ID);
      const role = this.determineRole(meta);

      // Create user
      const newUser = await prisma.user.create({
        data: {
          // Required fields
          email: wpUser.user_email,
          password: wpUser.user_pass, // ⚠️ WordPress password - needs handling

          // Basic fields
          name: wpUser.user_login,
          userName: wpUser.user_nicename,
          firstName: meta.first_name || null,
          lastName: meta.last_name || null,

          // Contact info
          phone: meta.billing_phone || meta.phone || null,

          // Profile
          profilePicture: meta.profile_picture || meta.avatar || null,

          // Role and status
          role: role,
          isVerified: wpUser.user_status === 0,
          isActive: true,
          isApprovalRequired: false,

          // Auth provider
          authProvider: "wordpress",

          // Timestamps
          createdAt: wpUser.user_registered
            ? new Date(wpUser.user_registered)
            : new Date(),
        },
      });

      console.log(
        `✅ Migrated: ${wpUser.user_login} → User ID ${newUser.id} (${role})`
      );
      this.stats.success++;
    } catch (error: any) {
      console.error(`❌ Error migrating ${wpUser.user_login}:`, error.message);
      this.stats.errors++;
    }
  }

  async run() {
    try {
      await this.connect();

      console.log("🔍 Fetching WordPress users...");
      const wpUsers = await this.fetchWordPressUsers();
      this.stats.total = wpUsers.length;
      console.log(`📊 Found ${wpUsers.length} users\n`);

      console.log("🚀 Starting migration...\n");
      for (const user of wpUsers) {
        await this.migrateUser(user);
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
    console.log("📈 Migration Summary");
    console.log("=".repeat(50));
    console.log(`Total users:     ${this.stats.total}`);
    console.log(`✅ Success:      ${this.stats.success}`);
    console.log(`⏭️  Skipped:      ${this.stats.skipped}`);
    console.log(`❌ Errors:       ${this.stats.errors}`);
    console.log("=".repeat(50));

    if (this.stats.success > 0) {
      console.log("\n⚠️  IMPORTANT: WordPress passwords use phpass hashing.");
      console.log("   Users will need to reset their passwords or implement");
      console.log("   WordPress password verification in your authentication.");
    }
  }
}

// Run migration
if (require.main === module) {
  const migration = new WordPressUserMigration();

  migration
    .run()
    .then(() => {
      console.log("\n🎉 Migration completed!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n💥 Migration failed:", error);
      process.exit(1);
    });
}

export default WordPressUserMigration;
