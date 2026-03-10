import { Client } from "pg";

async function cleanup() {
  const client = new Client({
    host: "13.60.17.42",
    port: 5432,
    user: "adminuser",
    password: "Vgvguy766%^&FuuvD",
    database: "wordpress_migration_db",
  });
  await client.connect();

  console.log("Cleaning up order tables...");

  await client.query('DELETE FROM "Payment"');
  console.log("  ✅ Payment cleared");

  await client.query('DELETE FROM "OrderItem"');
  console.log("  ✅ OrderItem cleared");

  await client.query('DELETE FROM "orderAddress"');
  console.log("  ✅ orderAddress cleared");

  await client.query('DELETE FROM "Order"');
  console.log("  ✅ Order cleared");

  await client.query('DELETE FROM "MainOrder"');
  console.log("  ✅ MainOrder cleared");

  console.log("\n✅ All order tables cleaned up");
  await client.end();
}

cleanup();
