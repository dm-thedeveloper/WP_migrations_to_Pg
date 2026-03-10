/**
 * Direct WordPress to PostgreSQL Migration
 * No Prisma - Direct database connection
 * Works with AWS-hosted PostgreSQL
 */

import mysql from "mysql2/promise";
import { Client } from "pg";
import * as dotenv from "dotenv";

dotenv.config();

// WordPress MySQL configuration
const wpConfig = {
  host: process.env.WP_DB_HOST || "localhost",
  user: process.env.WP_DB_USER,
  password: process.env.WP_DB_PASSWORD,
  database: process.env.WP_DB_NAME,
  port: parseInt(process.env.WP_DB_PORT || "3306"),
};

// PostgreSQL configuration (AWS or local)
const pgConfig = {
  host: process.env.PG_HOST || "localhost",
  port: parseInt(process.env.PG_PORT || "5432"),
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  ssl:
    process.env.PG_SSL === "true" ? { rejectUnauthorized: false } : undefined,
};

interface MigrationStats {
  total: number;
  success: number;
  skipped: number;
  errors: number;
}

class DirectMigration {
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

  determineRole(meta: Record<string, string>): string {
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

  async userExists(email: string): Promise<boolean> {
    const result = await this.pgClient.query(
      'SELECT id FROM "User" WHERE email = $1 LIMIT 1',
      [email]
    );
    return result.rows.length > 0;
  }

  async insertUser(wpUser: any, meta: Record<string, string>) {
    const role = this.determineRole(meta);

    const query = `
      INSERT INTO "User" (
        name,
        email,
        password,
        "userName",
        "firstName",
        "lastName",
        phone,
        "profilePicture",
        role,
        "isVerified",
        "isActive",
        "isApprovalRequired",
        "authProvider",
        "createdAt",
        "updatedAt"
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
      ) RETURNING id
    `;

    const values = [
      wpUser.user_login, // name
      wpUser.user_email, // email
      wpUser.user_pass, // password (WordPress hash)
      wpUser.user_nicename, // userName
      meta.first_name || null, // firstName
      meta.last_name || null, // lastName
      meta.billing_phone || meta.phone || null, // phone
      meta.profile_picture || meta.avatar || null, // profilePicture
      role, // role
      wpUser.user_status === 0, // isVerified
      true, // isActive
      false, // isApprovalRequired
      "wordpress", // authProvider
      wpUser.user_registered ? new Date(wpUser.user_registered) : new Date(), // createdAt
      new Date(), // updatedAt
    ];

    const result = await this.pgClient.query(query, values);
    return result.rows[0].id;
  }

  async migrateUser(wpUser: any) {
    try {
      // Check if user exists
      const exists = await this.userExists(wpUser.user_email);

      if (exists) {
        console.log(`⏭️  Skipping: ${wpUser.user_email} (already exists)`);
        this.stats.skipped++;
        return;
      }

      // Get user metadata
      const meta = await this.getUserMeta(wpUser.ID);

      // Insert user
      const newUserId = await this.insertUser(wpUser, meta);

      console.log(
        `✅ Migrated: ${
          wpUser.user_login
        } → User ID ${newUserId} (${this.determineRole(meta)})`
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
      console.log("   Users will need to reset their passwords.\n");
    }
  }
}

// Run migration
if (require.main === module) {
  const migration = new DirectMigration();

  migration
    .run()
    .then(() => {
      console.log("🎉 Migration completed!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Migration failed:", error);
      process.exit(1);
    });
}

export default DirectMigration;
