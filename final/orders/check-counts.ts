import { Client } from "pg";

async function check() {
  const client = new Client({
    host: "13.60.17.42",
    port: 5432,
    user: "adminuser",
    password: "Vgvguy766%^&FuuvD",
    database: "wordpress_migration_db",
  });
  await client.connect();

  const tables = ["MainOrder", "Order", "orderAddress", "OrderItem", "Payment"];

  console.log("\n📊 Database Table Counts:");
  console.log("=".repeat(40));

  for (const table of tables) {
    try {
      const result = await client.query(
        `SELECT COUNT(*) as count FROM "${table}"`
      );
      console.log(`${table}: ${result.rows[0].count}`);
    } catch (e: any) {
      console.log(`${table}: error - ${e.message}`);
    }
  }

  console.log("=".repeat(40));
  await client.end();
}

check();
