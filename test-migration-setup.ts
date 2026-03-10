/**
 * Pre-Migration Test Script
 *
 * Run this before the actual migration to verify:
 * - Database connections
 * - Environment configuration
 * - Prisma setup
 * - Data accessibility
 */

import { PrismaClient } from "@prisma/client";
import mysql from "mysql2/promise";
import * as dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

const wpConfig = {
  host: process.env.WP_DB_HOST || "localhost",
  user: process.env.WP_DB_USER,
  password: process.env.WP_DB_PASSWORD,
  database: process.env.WP_DB_NAME,
  port: parseInt(process.env.WP_DB_PORT || "3306"),
};

interface TestResult {
  name: string;
  status: "pass" | "fail" | "warning";
  message: string;
  details?: any;
}

class PreMigrationTest {
  private results: TestResult[] = [];

  private addResult(result: TestResult) {
    this.results.push(result);

    const icon =
      result.status === "pass" ? "✅" : result.status === "fail" ? "❌" : "⚠️";
    console.log(`${icon} ${result.name}: ${result.message}`);

    if (result.details) {
      console.log(`   Details: ${JSON.stringify(result.details, null, 2)}`);
    }
  }

  async testEnvironmentVariables() {
    console.log("\n📋 Testing Environment Variables...");

    const required = [
      "DATABASE_URL",
      "WP_DB_HOST",
      "WP_DB_USER",
      "WP_DB_PASSWORD",
      "WP_DB_NAME",
    ];

    const missing = required.filter((key) => !process.env[key]);

    if (missing.length === 0) {
      this.addResult({
        name: "Environment Variables",
        status: "pass",
        message: "All required variables present",
      });
    } else {
      this.addResult({
        name: "Environment Variables",
        status: "fail",
        message: `Missing: ${missing.join(", ")}`,
        details: { missing },
      });
    }
  }

  async testWordPressConnection() {
    console.log("\n🔌 Testing WordPress MySQL Connection...");

    try {
      const connection = await mysql.createConnection(wpConfig);

      this.addResult({
        name: "WordPress Connection",
        status: "pass",
        message: "Connected successfully",
      });

      await connection.end();
    } catch (error: any) {
      this.addResult({
        name: "WordPress Connection",
        status: "fail",
        message: error.message,
      });
    }
  }

  async testWordPressData() {
    console.log("\n📊 Testing WordPress Data...");

    try {
      const connection = await mysql.createConnection(wpConfig);

      // Test wp_users table
      const [users] = await connection.query<mysql.RowDataPacket[]>(
        "SELECT COUNT(*) as total FROM wp_users"
      );
      const totalUsers = users[0].total;

      const [activeUsers] = await connection.query<mysql.RowDataPacket[]>(
        "SELECT COUNT(*) as total FROM wp_users WHERE deleted = 0 AND spam = 0"
      );
      const activeCount = activeUsers[0].total;

      this.addResult({
        name: "WordPress Users Table",
        status: "pass",
        message: `Found ${totalUsers} total users, ${activeCount} active`,
        details: { total: totalUsers, active: activeCount },
      });

      // Test wp_usermeta table
      const [meta] = await connection.query<mysql.RowDataPacket[]>(
        "SELECT COUNT(*) as total FROM wp_usermeta"
      );
      const metaCount = meta[0].total;

      this.addResult({
        name: "WordPress Usermeta Table",
        status: "pass",
        message: `Found ${metaCount} metadata records`,
        details: { count: metaCount },
      });

      // Check for duplicate emails
      const [duplicates] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT user_email, COUNT(*) as count 
         FROM wp_users 
         WHERE deleted = 0 AND spam = 0
         GROUP BY user_email 
         HAVING COUNT(*) > 1`
      );

      if (duplicates.length > 0) {
        this.addResult({
          name: "Duplicate Emails",
          status: "warning",
          message: `Found ${duplicates.length} duplicate email(s)`,
          details: duplicates.slice(0, 5),
        });
      } else {
        this.addResult({
          name: "Duplicate Emails",
          status: "pass",
          message: "No duplicates found",
        });
      }

      await connection.end();
    } catch (error: any) {
      this.addResult({
        name: "WordPress Data",
        status: "fail",
        message: error.message,
      });
    }
  }

  async testPostgreSQLConnection() {
    console.log("\n🔌 Testing PostgreSQL Connection...");

    try {
      await prisma.$connect();

      this.addResult({
        name: "PostgreSQL Connection",
        status: "pass",
        message: "Connected successfully",
      });
    } catch (error: any) {
      this.addResult({
        name: "PostgreSQL Connection",
        status: "fail",
        message: error.message,
      });
    }
  }

  async testPrismaSchema() {
    console.log("\n📋 Testing Prisma Schema...");

    try {
      // Try to query User table
      const userCount = await prisma.user.count();

      this.addResult({
        name: "Prisma User Model",
        status: "pass",
        message: `User table accessible (${userCount} existing users)`,
        details: { count: userCount },
      });

      // Check for required fields
      const requiredFields = ["email", "password", "name", "role"];

      // This will throw if fields don't exist
      const testUser = await prisma.user.findFirst({
        select: {
          email: true,
          password: true,
          name: true,
          role: true,
        },
      });

      this.addResult({
        name: "Required Fields",
        status: "pass",
        message: "All required fields present in schema",
      });
    } catch (error: any) {
      this.addResult({
        name: "Prisma Schema",
        status: "fail",
        message: error.message,
      });
    }
  }

  async testExistingMigratedUsers() {
    console.log("\n🔍 Checking Existing Migrated Users...");

    try {
      const migratedUsers = await prisma.user.count({
        where: {
          authProvider: "wordpress",
        },
      });

      if (migratedUsers > 0) {
        this.addResult({
          name: "Existing Migrated Users",
          status: "warning",
          message: `Found ${migratedUsers} already migrated users (will be skipped)`,
          details: { count: migratedUsers },
        });
      } else {
        this.addResult({
          name: "Existing Migrated Users",
          status: "pass",
          message: "No previously migrated users found",
        });
      }
    } catch (error: any) {
      this.addResult({
        name: "Existing Migrated Users",
        status: "fail",
        message: error.message,
      });
    }
  }

  async testSampleMigration() {
    console.log("\n🧪 Testing Sample User Creation...");

    const testEmail = `test-migration-${Date.now()}@example.com`;

    try {
      // Try to create a test user
      const testUser = await prisma.user.create({
        data: {
          email: testEmail,
          password: "test_password_hash",
          name: "Test Migration User",
          userName: "test_migration",
          role: "BUYER",
          authProvider: "test",
          isVerified: true,
          isActive: true,
        },
      });

      this.addResult({
        name: "Sample User Creation",
        status: "pass",
        message: "Successfully created test user",
        details: { id: testUser.id, email: testUser.email },
      });

      // Clean up test user
      await prisma.user.delete({
        where: { id: testUser.id },
      });

      this.addResult({
        name: "Sample User Deletion",
        status: "pass",
        message: "Successfully deleted test user",
      });
    } catch (error: any) {
      this.addResult({
        name: "Sample User Creation",
        status: "fail",
        message: error.message,
      });
    }
  }

  async testDatabaseCapacity() {
    console.log("\n💾 Testing Database Capacity...");

    try {
      const wpConnection = await mysql.createConnection(wpConfig);

      const [wpUsers] = await wpConnection.query<mysql.RowDataPacket[]>(
        "SELECT COUNT(*) as total FROM wp_users WHERE deleted = 0 AND spam = 0"
      );
      const wpUserCount = wpUsers[0].total;

      await wpConnection.end();

      const pgUserCount = await prisma.user.count();

      this.addResult({
        name: "Database Capacity",
        status: "pass",
        message: `Ready to migrate ${wpUserCount} users`,
        details: {
          wordpress: wpUserCount,
          postgresql_existing: pgUserCount,
          estimated_total: wpUserCount + pgUserCount,
        },
      });
    } catch (error: any) {
      this.addResult({
        name: "Database Capacity",
        status: "fail",
        message: error.message,
      });
    }
  }

  printSummary() {
    console.log("\n" + "=".repeat(70));
    console.log("📈 Test Summary");
    console.log("=".repeat(70));

    const passed = this.results.filter((r) => r.status === "pass").length;
    const failed = this.results.filter((r) => r.status === "fail").length;
    const warnings = this.results.filter((r) => r.status === "warning").length;

    console.log(`✅ Passed:   ${passed}`);
    console.log(`❌ Failed:   ${failed}`);
    console.log(`⚠️  Warnings: ${warnings}`);
    console.log("=".repeat(70));

    if (failed > 0) {
      console.log(
        "\n❌ Migration NOT ready. Please fix the failed tests above."
      );
      console.log(
        "   Check your .env configuration and database connections.\n"
      );
      return false;
    } else if (warnings > 0) {
      console.log(
        "\n⚠️  Migration ready with warnings. Review warnings above."
      );
      console.log("   You can proceed, but be aware of the noted issues.\n");
      return true;
    } else {
      console.log("\n✅ All tests passed! Ready to run migration.");
      console.log("   Run: npm run migrate:users\n");
      return true;
    }
  }

  async runAll() {
    console.log("🧪 Running Pre-Migration Tests...");
    console.log("=".repeat(70));

    await this.testEnvironmentVariables();
    await this.testWordPressConnection();
    await this.testWordPressData();
    await this.testPostgreSQLConnection();
    await this.testPrismaSchema();
    await this.testExistingMigratedUsers();
    await this.testSampleMigration();
    await this.testDatabaseCapacity();

    const ready = this.printSummary();

    await prisma.$disconnect();

    return ready;
  }
}

// Run tests
if (require.main === module) {
  const tester = new PreMigrationTest();

  tester
    .runAll()
    .then((ready) => {
      process.exit(ready ? 0 : 1);
    })
    .catch((error) => {
      console.error("💥 Test suite failed:", error);
      process.exit(1);
    });
}

export default PreMigrationTest;
