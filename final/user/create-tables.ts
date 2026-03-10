/**
 * Create PostgreSQL tables for migration
 * Run this BEFORE running the migration
 */

import { Client } from "pg";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

const pgConfig = {
  host: "13.60.17.42",
  port: 5432,
  user: "adminuser",
  password: "Vgvguy766%^&FuuvD",
  database: "wordpress_migration_db",
};

async function createTables() {
  const client = new Client(pgConfig);

  try {
    console.log("🔌 Connecting to PostgreSQL...");
    console.log(`   Host: ${pgConfig.host}`);
    console.log(`   Database: ${pgConfig.database}`);

    await client.connect();
    console.log("✅ Connected to PostgreSQL\n");

    console.log("🔨 Creating database tables...\n");

    // Create Role enum
    try {
      await client.query(`
        DO $$ BEGIN
          CREATE TYPE "Role" AS ENUM ('BUYER', 'VENDOR', 'SUB_ADMIN', 'ADMIN');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);
      console.log("✅ Created enum: Role");
    } catch (error: any) {
      if (!error.message.includes("already exists")) {
        throw error;
      }
    }

    // Create User table
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS "User" (
          id SERIAL PRIMARY KEY,
          name TEXT,
          "fcmToken" TEXT,
          "firstName" TEXT,
          "lastName" TEXT,
          phone TEXT,
          email TEXT NOT NULL UNIQUE,
          password TEXT,
          role "Role" NOT NULL DEFAULT 'BUYER',
          otp TEXT,
          "otpExpiry" TIMESTAMP(3),
          "isVerified" BOOLEAN NOT NULL DEFAULT false,
          "isActive" BOOLEAN NOT NULL DEFAULT true,
          "isApprovalRequired" BOOLEAN NOT NULL DEFAULT true,
          "userName" TEXT,
          "googleId" TEXT UNIQUE,
          "profilePicture" TEXT,
          "authProvider" TEXT DEFAULT 'local',
          "marketingEmail" TEXT,
          "sellingLocation" TEXT,
          country TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log("✅ Created table: User");
    } catch (error: any) {
      if (!error.message.includes("already exists")) {
        throw error;
      }
    }

    // Create indexes for User table
    try {
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_user_email" ON "User"("email")`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_user_role" ON "User"("role")`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_user_authProvider" ON "User"("authProvider")`,
      );
      console.log("✅ Created indexes for User table");
    } catch (error: any) {
      if (!error.message.includes("already exists")) {
        console.log("⚠️  Indexes may already exist");
      }
    }

    // Create Address table
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS "Address" (
          id SERIAL PRIMARY KEY,
          "shopName" TEXT,
          username TEXT,
          email TEXT,
          phone TEXT,
          address TEXT,
          country TEXT,
          apartment TEXT,
          street TEXT,
          state TEXT,
          city TEXT,
          "zipCode" TEXT,
          province TEXT,
          "phoneNumber" TEXT,
          "addressType" TEXT,
          "userId" INTEGER NOT NULL UNIQUE,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "Address_userId_fkey" FOREIGN KEY ("userId") 
            REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE
        )
      `);
      console.log("✅ Created table: Address");
    } catch (error: any) {
      if (!error.message.includes("already exists")) {
        throw error;
      }
    }

    // Create index for Address table
    try {
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_address_userId" ON "Address"("userId")`,
      );
      console.log("✅ Created index for Address table");
    } catch (error: any) {
      if (!error.message.includes("already exists")) {
        console.log("⚠️  Index may already exist");
      }
    }

    // Create Store table
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS "Store" (
          id SERIAL PRIMARY KEY,
          "storeName" TEXT,
          country TEXT,
          "marketingEmail" TEXT,
          "sellingLocation" TEXT,
          website TEXT,
          "openingYear" TEXT,
          "annualSales" TEXT,
          "legalName" TEXT,
          siret TEXT,
          "postalCode" INTEGER,
          "storeStatus" TEXT NOT NULL DEFAULT 'pending',
          "vendorId" INTEGER NOT NULL UNIQUE,
          "storeTypes" TEXT[] NOT NULL DEFAULT '{}',
          "storeSettings" JSONB,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "Store_vendorId_fkey" FOREIGN KEY ("vendorId") 
            REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE
        )
      `);
      console.log("✅ Created table: Store");
    } catch (error: any) {
      if (!error.message.includes("already exists")) {
        throw error;
      }
    }

    // Create indexes for Store table
    try {
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_store_vendorId" ON "Store"("vendorId")`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_store_storeStatus" ON "Store"("storeStatus")`,
      );
      console.log("✅ Created indexes for Store table");
    } catch (error: any) {
      if (!error.message.includes("already exists")) {
        console.log("⚠️  Indexes may already exist");
      }
    }

    console.log("\n" + "=".repeat(50));
    console.log("✅ All tables and indexes created successfully!");
    console.log("=".repeat(50));

    console.log("\n✅ Database tables ready!");
    console.log("   You can now run: npm run migrate\n");
  } catch (error: any) {
    console.error("💥 Failed to create tables:", error.message);
    throw error;
  } finally {
    await client.end();
    console.log("🔌 Disconnected from PostgreSQL");
  }
}

// Run the script
createTables()
  .then(() => {
    console.log("🎉 Setup completed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Setup failed:", error);
    process.exit(1);
  });
