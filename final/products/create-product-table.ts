/**
 * Create Product and ProductCategory tables in PostgreSQL
 * Run this BEFORE running migrate-products.ts
 */

import { Client } from "pg";
import * as dotenv from "dotenv";

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
    await client.connect();
    console.log("✅ Connected\n");

    // Create enums
    console.log("📋 Creating enums...");

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE "VatRate" AS ENUM ('STANDARD', 'REDUCED');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log("  ✅ VatRate enum");

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE "SellingMethod" AS ENUM ('BY_ITEM', 'BY_CASE');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log("  ✅ SellingMethod enum");

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE "ProductStatus" AS ENUM ('PUBLISHED', 'UNPUBLISHED', 'DRAFT');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log("  ✅ ProductStatus enum");

    // Create Product table
    console.log("\n📋 Creating Product table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS "Product" (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        mrsp DECIMAL(10, 2) NOT NULL DEFAULT 0.0,
        wholesale DECIMAL(10, 2) NOT NULL DEFAULT 0.0,
        "agreePrice" BOOLEAN NOT NULL DEFAULT false,
        "discountedPrice" DECIMAL(10, 2) DEFAULT 0.0,
        "from" TIMESTAMP(3),
        "to" TIMESTAMP(3),
        images TEXT[] NOT NULL DEFAULT '{}',
        videos TEXT[] NOT NULL DEFAULT '{}',
        sku TEXT NOT NULL DEFAULT '',
        gtin TEXT NOT NULL DEFAULT '',
        country TEXT NOT NULL DEFAULT '',
        "vatRate" "VatRate" NOT NULL DEFAULT 'STANDARD',
        "tariffCode" TEXT NOT NULL DEFAULT '',
        "inStock" BOOLEAN NOT NULL DEFAULT true,
        "startShipDate" TEXT,
        "endShipDate" TEXT,
        "continueAfterShip" BOOLEAN NOT NULL DEFAULT false,
        "onHand" INTEGER,
        committed INTEGER,
        available INTEGER,
        "hasOptions" BOOLEAN NOT NULL DEFAULT true,
        "productOptionsId" INTEGER,
        "sellingMethod" "SellingMethod" NOT NULL DEFAULT 'BY_ITEM',
        "minimumOrderQuantity" INTEGER,
        "caseSize" INTEGER,
        "shippingMeasurementsId" INTEGER,
        "sameMeasurement" BOOLEAN NOT NULL DEFAULT false,
        tags TEXT[] NOT NULL DEFAULT '{}',
        "enableReviews" BOOLEAN NOT NULL DEFAULT true,
        "productTypeId" INTEGER,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "letRetailersBuy" BOOLEAN NOT NULL DEFAULT false,
        "letRetailersCustomize" BOOLEAN NOT NULL DEFAULT false,
        "retailersInstructions" TEXT,
        "retailerInputLimit" INTEGER,
        "retailerMOQ" INTEGER,
        "requiredCustomInfo" BOOLEAN NOT NULL DEFAULT false,
        "retailPrice" DECIMAL(10, 2) DEFAULT 0.0,
        "productStatus" "ProductStatus" NOT NULL DEFAULT 'UNPUBLISHED',
        "vendorId" INTEGER NOT NULL,
        rattings FLOAT NOT NULL DEFAULT 0.0,
        
        -- Additional WordPress migration columns
        "shortDescription" TEXT,
        "geoAddress" TEXT,
        "geoLatitude" DECIMAL(10, 8),
        "geoLongitude" DECIMAL(11, 8),
        "totalSales" INTEGER DEFAULT 0,
        "postViews" INTEGER DEFAULT 0,
        weight DECIMAL(10, 2) DEFAULT 0,
        "wpStatus" TEXT,
        "wholesaleMinQty" INTEGER DEFAULT 0,
        
        CONSTRAINT "Product_vendorId_fkey" FOREIGN KEY ("vendorId") 
          REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);
    console.log("✅ Product table created");

    // Create indexes
    console.log("\n📋 Creating indexes...");
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_product_vendorId" ON "Product"("vendorId")`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_product_status" ON "Product"("productStatus")`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_product_sku" ON "Product"(sku)`
    );
    console.log("✅ Indexes created");

    // Create ProductCategory junction table
    console.log("\n📋 Creating ProductCategory table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS "ProductCategory" (
        id SERIAL PRIMARY KEY,
        "productId" INTEGER NOT NULL,
        "categoryId" INTEGER NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        
        CONSTRAINT "ProductCategory_productId_fkey" FOREIGN KEY ("productId") 
          REFERENCES "Product"(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "ProductCategory_categoryId_fkey" FOREIGN KEY ("categoryId") 
          REFERENCES "Category"(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "ProductCategory_unique" UNIQUE ("productId", "categoryId")
      );
    `);
    console.log("✅ ProductCategory table created");

    // Create indexes for ProductCategory
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_productcategory_productId" ON "ProductCategory"("productId")`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_productcategory_categoryId" ON "ProductCategory"("categoryId")`
    );
    console.log("✅ ProductCategory indexes created");

    console.log("\n" + "=".repeat(50));
    console.log("✅ All tables created successfully!");
    console.log("=".repeat(50));
    console.log("\nYou can now run: npx ts-node migrate-products.ts");
  } catch (error: any) {
    console.error("💥 Error:", error.message);
    throw error;
  } finally {
    await client.end();
    console.log("\n🔌 Disconnected from PostgreSQL");
  }
}

createTables()
  .then(() => {
    console.log("🎉 Setup completed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Setup failed:", error);
    process.exit(1);
  });
