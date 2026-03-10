/**
 * Fix Product table columns - add missing camelCase columns
 */

import { Client } from "pg";

const pgConfig = {
  host: "13.60.17.42",
  port: 5432,
  user: "adminuser",
  password: "Vgvguy766%^&FuuvD",
  database: "wordpress_migration_db",
};

async function fixColumns() {
  const client = new Client(pgConfig);

  try {
    console.log("🔌 Connecting to PostgreSQL...");
    await client.connect();
    console.log("✅ Connected\n");

    // Check existing columns
    console.log("🔍 Checking existing columns...");
    const result = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'Product' 
      ORDER BY ordinal_position
    `);

    const existingColumns = result.rows.map((r: any) =>
      r.column_name.toLowerCase()
    );
    console.log("Existing columns:", existingColumns.join(", "));

    // Add missing columns with proper quoting
    const columnsToAdd = [
      { name: "agreePrice", type: "BOOLEAN DEFAULT false" },
      { name: "discountedPrice", type: "DECIMAL(10, 2) DEFAULT 0.0" },
      { name: "vatRate", type: "\"VatRate\" DEFAULT 'STANDARD'" },
      { name: "tariffCode", type: "TEXT DEFAULT ''" },
      { name: "inStock", type: "BOOLEAN DEFAULT true" },
      { name: "startShipDate", type: "TEXT" },
      { name: "endShipDate", type: "TEXT" },
      { name: "continueAfterShip", type: "BOOLEAN DEFAULT false" },
      { name: "onHand", type: "INTEGER" },
      { name: "hasOptions", type: "BOOLEAN DEFAULT true" },
      { name: "productOptionsId", type: "INTEGER" },
      { name: "sellingMethod", type: "\"SellingMethod\" DEFAULT 'BY_ITEM'" },
      { name: "minimumOrderQuantity", type: "INTEGER" },
      { name: "caseSize", type: "INTEGER" },
      { name: "shippingMeasurementsId", type: "INTEGER" },
      { name: "sameMeasurement", type: "BOOLEAN DEFAULT false" },
      { name: "enableReviews", type: "BOOLEAN DEFAULT true" },
      { name: "productTypeId", type: "INTEGER" },
      { name: "createdAt", type: "TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP" },
      { name: "updatedAt", type: "TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP" },
      { name: "letRetailersBuy", type: "BOOLEAN DEFAULT false" },
      { name: "letRetailersCustomize", type: "BOOLEAN DEFAULT false" },
      { name: "retailersInstructions", type: "TEXT" },
      { name: "retailerInputLimit", type: "INTEGER" },
      { name: "retailerMOQ", type: "INTEGER" },
      { name: "requiredCustomInfo", type: "BOOLEAN DEFAULT false" },
      { name: "retailPrice", type: "DECIMAL(10, 2) DEFAULT 0.0" },
      {
        name: "productStatus",
        type: "\"ProductStatus\" DEFAULT 'UNPUBLISHED'",
      },
      { name: "shortDescription", type: "TEXT" },
      { name: "geoAddress", type: "TEXT" },
      { name: "geoLatitude", type: "DECIMAL(10, 8)" },
      { name: "geoLongitude", type: "DECIMAL(11, 8)" },
      { name: "totalSales", type: "INTEGER DEFAULT 0" },
      { name: "postViews", type: "INTEGER DEFAULT 0" },
      { name: "wpStatus", type: "TEXT" },
      { name: "wholesaleMinQty", type: "INTEGER DEFAULT 0" },
      { name: "vendorId", type: "INTEGER" },
    ];

    console.log("\n📋 Adding missing columns...");
    for (const col of columnsToAdd) {
      if (!existingColumns.includes(col.name.toLowerCase())) {
        try {
          await client.query(
            `ALTER TABLE "Product" ADD COLUMN "${col.name}" ${col.type}`
          );
          console.log(`  ✅ Added "${col.name}"`);
        } catch (err: any) {
          if (err.message.includes("already exists")) {
            console.log(`  ⏭️  "${col.name}" already exists`);
          } else {
            console.log(`  ❌ Error adding "${col.name}": ${err.message}`);
          }
        }
      } else {
        console.log(`  ⏭️  "${col.name}" already exists`);
      }
    }

    console.log("\n✅ Done!");
  } catch (error) {
    console.error("💥 Error:", error);
  } finally {
    await client.end();
  }
}

fixColumns();
