/**
 * Clean up existing products before migration
 * Removes all products, product categories, and product options
 */

import { Client } from "pg";
import * as dotenv from "dotenv";

dotenv.config();

const pgConfig = {
  host: process.env.PG_HOST || "13.60.17.42",
  port: parseInt(process.env.PG_PORT || "5432"),
  user: process.env.PG_USER || "adminuser",
  password: process.env.PG_PASSWORD || "Vgvguy766%^&FuuvD",
  database: process.env.PG_DATABASE || "wordpress_migration_db",
};

async function cleanupProducts() {
  const client = new Client(pgConfig);

  try {
    console.log("🔌 Connecting to PostgreSQL...");
    await client.connect();
    console.log("✅ Connected\n");

    // Get counts before deletion
    console.log("📊 Current data counts:");

    const productCount = await client.query('SELECT COUNT(*) FROM "Product"');
    console.log(`  Products: ${productCount.rows[0].count}`);

    try {
      const pcCount = await client.query(
        'SELECT COUNT(*) FROM "ProductCategory"',
      );
      console.log(`  ProductCategory: ${pcCount.rows[0].count}`);
    } catch (e) {
      console.log(`  ProductCategory: table doesn't exist`);
    }

    try {
      const poCount = await client.query(
        'SELECT COUNT(*) FROM "ProductOptions"',
      );
      console.log(`  ProductOptions: ${poCount.rows[0].count}`);
    } catch (e) {
      console.log(`  ProductOptions: table doesn't exist`);
    }

    try {
      const smCount = await client.query(
        'SELECT COUNT(*) FROM "ShippingMeasurements"',
      );
      console.log(`  ShippingMeasurements: ${smCount.rows[0].count}`);
    } catch (e) {
      console.log(`  ShippingMeasurements: table doesn't exist`);
    }

    console.log("\n🗑️  Deleting data...");

    // Delete in correct order (respect foreign keys)
    try {
      const pc = await client.query('DELETE FROM "ProductCategory"');
      console.log(`  ✅ Deleted ProductCategory records: ${pc.rowCount}`);
    } catch (e) {
      console.log(`  ⏭️  ProductCategory: skipped`);
    }

    try {
      const sm = await client.query('DELETE FROM "ShippingMeasurements"');
      console.log(`  ✅ Deleted ShippingMeasurements records: ${sm.rowCount}`);
    } catch (e) {
      console.log(`  ⏭️  ShippingMeasurements: skipped`);
    }

    try {
      const po = await client.query('DELETE FROM "ProductOptions"');
      console.log(`  ✅ Deleted ProductOptions records: ${po.rowCount}`);
    } catch (e) {
      console.log(`  ⏭️  ProductOptions: skipped`);
    }

    // Delete products last
    const p = await client.query('DELETE FROM "Product"');
    console.log(`  ✅ Deleted Product records: ${p.rowCount}`);

    // Reset sequences
    console.log("\n🔄 Resetting sequences...");

    try {
      await client.query('ALTER SEQUENCE "Product_id_seq" RESTART WITH 1');
      console.log(`  ✅ Product_id_seq reset`);
    } catch (e) {
      console.log(
        `  ⏭️  Product sequence: skipped (may be using WordPress IDs)`,
      );
    }

    try {
      await client.query(
        'ALTER SEQUENCE "ProductCategory_id_seq" RESTART WITH 1',
      );
      console.log(`  ✅ ProductCategory_id_seq reset`);
    } catch (e) {
      console.log(`  ⏭️  ProductCategory sequence: skipped`);
    }

    try {
      await client.query(
        'ALTER SEQUENCE "ProductOptions_id_seq" RESTART WITH 1',
      );
      console.log(`  ✅ ProductOptions_id_seq reset`);
    } catch (e) {
      console.log(`  ⏭️  ProductOptions sequence: skipped`);
    }

    try {
      await client.query(
        'ALTER SEQUENCE "ShippingMeasurements_id_seq" RESTART WITH 1',
      );
      console.log(`  ✅ ShippingMeasurements_id_seq reset`);
    } catch (e) {
      console.log(`  ⏭️  ShippingMeasurements sequence: skipped`);
    }

    console.log("\n✅ Cleanup complete! Ready for fresh migration.");
  } catch (error) {
    console.error("💥 Error:", error);
  } finally {
    await client.end();
  }
}

cleanupProducts();
