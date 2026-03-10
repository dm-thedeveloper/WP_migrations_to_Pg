/**
 * Enhanced WordPress to PostgreSQL Migration
 * Direct database connection with optimized single query
 * Works with AWS-hosted PostgreSQL
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

// PostgreSQL configuration (AWS or local)
const pgConfig = {
  // host: "13.60.17.42",
  host: "13.61.44.207",
  port: 5432,
  user: "adminuser",
  password: "Vgvguy766%^&FuuvD",
  database: "wordpress_migration_db",
};

interface MigrationStats {
  total: number;
  success: number;
  skipped: number;
  errors: number;
}

class EnhancedMigration {
  private wpConnection!: mysql.Connection;
  private pgClient!: Client;
  private stats: MigrationStats = {
    total: 0,
    success: 0,
    skipped: 0,
    errors: 0,
  };
  private fixedPasswordHash =
    "$2a$10$sVMsMf2voDqKnCBWeGzZXO/jP3IzpNQMP0Wu763SDhrVbCUS.q1Xa";

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

  async fetchWordPressUsersWithMeta() {
    console.log("🔍 Fetching WordPress users with metadata...");

    const query = `
      SELECT 
        u.ID as user_id,
        u.user_login as name,
        '${this.fixedPasswordHash}' as password,
        u.user_nicename as userName,
        u.user_email as email,
        u.user_url as user_url,
        u.display_name as displayName,
        u.user_registered as createdAt,
        
        MAX(CASE WHEN um.meta_key = 'billing_address_1' THEN um.meta_value END) as address,
        MAX(CASE WHEN um.meta_key = 'billing_city' THEN um.meta_value END) as city,
        MAX(CASE WHEN um.meta_key = 'billing_company' THEN um.meta_value END) as company,
        MAX(CASE WHEN um.meta_key = 'billing_country' THEN um.meta_value END) as country,
        MAX(CASE WHEN um.meta_key = 'billing_dokan_bank_iban' THEN um.meta_value END) as bank_iban,
        MAX(CASE WHEN um.meta_key = 'billing_dokan_bank_name' THEN um.meta_value END) as bank_name,
        MAX(CASE WHEN um.meta_key = 'billing_dokan_company_id_number' THEN um.meta_value END) as dokan_company_id_number,
        MAX(CASE WHEN um.meta_key = 'billing_postcode' THEN um.meta_value END) as zipCode,
        MAX(CASE WHEN um.meta_key = 'billing_state' THEN um.meta_value END) as state,
        MAX(CASE WHEN um.meta_key = 'first_name' THEN um.meta_value END) as firstName,
        MAX(CASE WHEN um.meta_key = 'last_name' THEN um.meta_value END) as lastName,
        MAX(CASE WHEN um.meta_key = 'nickname' THEN um.meta_value END) as nickname,
        MAX(CASE WHEN um.meta_key = 'vat_number' THEN um.meta_value END) as vatNumber,
        MAX(CASE WHEN um.meta_key = 'shop_activity' THEN um.meta_value END) as shop_activity,
        MAX(CASE WHEN um.meta_key = 'billing_phone' THEN um.meta_value END) as phone,
        MAX(CASE WHEN um.meta_key = 'billing_apartment' THEN um.meta_value END) as apartment,
        MAX(CASE WHEN um.meta_key = 'billing_address_2' THEN um.meta_value END) as street,
        
        -- Store/Vendor specific fields
        MAX(CASE WHEN um.meta_key = 'dokan_profile_settings' THEN um.meta_value END) as dokan_profile_settings,
        MAX(CASE WHEN um.meta_key = 'dokan_store_name' THEN um.meta_value END) as store_name,
        MAX(CASE WHEN um.meta_key = '_store_phone' THEN um.meta_value END) as store_phone,
        
        -- Role resolution from wp_capabilities (priority-based: admin > seller > customer)
        CASE
          -- Priority 1: Administrator (highest)
          WHEN MAX(CASE WHEN um.meta_key = 'wp_capabilities' THEN um.meta_value END)
               LIKE '%administrator%' 
              THEN 'ADMIN'
          -- Priority 2: Seller/Vendor
          WHEN MAX(CASE WHEN um.meta_key = 'wp_capabilities' THEN um.meta_value END)
               LIKE '%seller%' 
              THEN 'VENDOR'
          -- Priority 3: Customer
          WHEN MAX(CASE WHEN um.meta_key = 'wp_capabilities' THEN um.meta_value END)
               LIKE '%customer%'
              THEN 'BUYER'
          -- Priority 4: Wholesale customer
          WHEN MAX(CASE WHEN um.meta_key = 'wp_capabilities' THEN um.meta_value END)
               LIKE '%dokan_wholesale_customer%'
              THEN 'BUYER'
          -- Default: Buyer
          ELSE 'BUYER'
        END AS role,
        
        MAX(CASE WHEN um.meta_key = 'wp_capabilities' THEN um.meta_value END) as wp_capabilities,
        
        wcl.first_name as customer_first_name,
        wcl.last_name as customer_last_name,
        wcl.email as customer_email,
        wcl.country as customer_country,
        wcl.postcode as customer_postcode,
        wcl.city as customer_city,
        wcl.state as customer_state
        
      FROM wp_users u
      LEFT JOIN wp_usermeta um 
        ON u.ID = um.user_id 
        AND um.meta_key IN (
          'billing_address_1',
          'billing_city',
          'billing_company',
          'billing_country',
          'billing_dokan_bank_iban',
          'billing_dokan_bank_name',
          'billing_dokan_company_id_number',
          'billing_postcode',
          'billing_state',
          'billing_phone',
          'billing_apartment',
          'billing_address_2',
          'first_name',
          'last_name',
          'nickname',
          'vat_number',
          'shop_activity',
          'wp_capabilities',
          'dokan_profile_settings',
          'dokan_store_name',
          '_store_phone'
        )
      LEFT JOIN wp_wc_customer_lookup wcl 
        ON u.ID = wcl.user_id
      WHERE u.deleted = 0 AND u.spam = 0
      GROUP BY u.ID
      ORDER BY u.ID
    `;

    const [users] = await this.wpConnection.query<mysql.RowDataPacket[]>(query);
    return users;
  }

  async userExists(userId: number, email: string): Promise<boolean> {
    const result = await this.pgClient.query(
      'SELECT id FROM "User" WHERE id = $1 OR email = $2 LIMIT 1',
      [userId, email],
    );
    return result.rows.length > 0;
  }

  async insertUser(user: any) {
    // Preserve WordPress user ID
    const query = `
      INSERT INTO "User" (
        id,
        name,
        email,
        password,
        "userName",
        "firstName",
        "lastName",
        phone,
        role,
        country,
        "isVerified",
        "isActive",
        "isApprovalRequired",
        "authProvider",
        "createdAt",
        "updatedAt"
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
      ) RETURNING id
    `;

    const values = [
      user.user_id, // id - PRESERVE WordPress ID
      user.name || user.userName, // name
      user.email, // email
      user.password, // password (fixed bcrypt hash)
      user.userName, // userName
      user.firstName || user.customer_first_name || null, // firstName
      user.lastName || user.customer_last_name || null, // lastName
      user.phone || null, // phone
      user.role, // role
      user.country || user.customer_country || null, // country
      true, // isVerified
      true, // isActive
      false, // isApprovalRequired
      "wordpress", // authProvider
      user.createdAt ? new Date(user.createdAt) : new Date(), // createdAt
      new Date(), // updatedAt
    ];

    const result = await this.pgClient.query(query, values);
    return result.rows[0].id;
  }

  async insertAddress(userId: number, user: any) {
    // Only insert if there's address data
    if (!user.address && !user.city && !user.state && !user.country) {
      return;
    }

    const query = `
      INSERT INTO "Address" (
        "userId",
        "shopName",
        username,
        email,
        phone,
        address,
        country,
        apartment,
        street,
        state,
        city,
        "zipCode",
        "phoneNumber",
        "addressType",
        "createdAt",
        "updatedAt"
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
      )
    `;

    const values = [
      userId, // userId
      user.store_name || user.company || null, // shopName
      user.userName || user.name, // username
      user.email, // email
      user.phone || null, // phone
      user.address || null, // address
      user.country || user.customer_country || null, // country
      user.apartment || null, // apartment
      user.street || null, // street
      user.state || user.customer_state || null, // state
      user.city || user.customer_city || null, // city
      user.zipCode || user.customer_postcode || null, // zipCode
      user.phone || null, // phoneNumber
      "billing", // addressType
      new Date(), // createdAt
      new Date(), // updatedAt
    ];

    await this.pgClient.query(query, values);
  }

  async insertStore(vendorId: number, user: any) {
    // Only insert store for vendors
    if (user.role !== "VENDOR") {
      return;
    }

    // Parse dokan_profile_settings if available
    let storeData: any = {};
    if (user.dokan_profile_settings) {
      try {
        storeData = JSON.parse(user.dokan_profile_settings);
      } catch (e) {
        // If parsing fails, use empty object
        console.log(
          `  ⚠️  Could not parse dokan_profile_settings for vendor ${vendorId}`,
        );
      }
    }

    const query = `
      INSERT INTO "Store" (
        "vendorId",
        "storeName",
        country,
        "marketingEmail",
        "sellingLocation",
        website,
        "openingYear",
        "annualSales",
        "legalName",
        siret,
        "postalCode",
        "storeStatus",
        "storeTypes",
        "storeSettings",
        "createdAt",
        "updatedAt"
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
      )
    `;

    const values = [
      vendorId, // vendorId
      user.store_name || storeData.store_name || user.company || "Store", // storeName
      user.country || user.customer_country || null, // country
      user.email, // marketingEmail
      user.country || null, // sellingLocation
      storeData.website || user.user_url || null, // website
      storeData.opening_year || null, // openingYear
      storeData.annual_sales || null, // annualSales
      user.company || null, // legalName
      user.dokan_company_id_number || null, // siret
      user.zipCode ? parseInt(user.zipCode) : null, // postalCode
      "pending", // storeStatus
      [], // storeTypes (empty array)
      JSON.stringify(storeData), // storeSettings (complete dokan settings as JSONB)
      new Date(), // createdAt
      new Date(), // updatedAt
    ];

    await this.pgClient.query(query, values);
  }

  async migrateUser(user: any) {
    try {
      // Check if user exists by ID or email
      const exists = await this.userExists(user.user_id, user.email);

      if (exists) {
        console.log(
          `⏭️  Skipping: ${user.email} (ID ${user.user_id} already exists)`,
        );
        this.stats.skipped++;
        return;
      }

      // Insert user with preserved WordPress ID
      const newUserId = await this.insertUser(user);

      // Insert address
      await this.insertAddress(newUserId, user);

      // Insert store for vendors
      if (user.role === "VENDOR") {
        await this.insertStore(newUserId, user);
      }

      const userInfo = `${user.name} → User ID ${newUserId} (${user.role})`;
      const extraInfo = user.role === "VENDOR" ? " + Store" : "";
      console.log(`✅ Migrated: ${userInfo}${extraInfo}`);
      this.stats.success++;
    } catch (error: any) {
      console.error(
        `❌ Error migrating ${user.name} (${user.email}):`,
        error.message,
      );
      this.stats.errors++;
    }
  }

  async updateSequence() {
    console.log("\n🔄 Updating User ID sequence...");
    try {
      // Get the maximum ID from User table
      const maxIdQuery = 'SELECT MAX(id) as max_id FROM "User"';
      const result = await this.pgClient.query(maxIdQuery);
      const maxId = result.rows[0].max_id || 0;

      // Update the sequence to start from maxId + 1
      const sequenceQuery = `SELECT setval('"User_id_seq"', $1, true)`;
      await this.pgClient.query(sequenceQuery, [maxId]);

      console.log(`✅ Sequence updated to start from ${maxId + 1}\n`);
    } catch (error: any) {
      console.log("⚠️  Could not update sequence:", error.message);
    }
  }

  async run() {
    try {
      await this.connect();

      const wpUsers = await this.fetchWordPressUsersWithMeta();
      this.stats.total = wpUsers.length;
      console.log(`📊 Found ${wpUsers.length} users\n`);

      console.log("🚀 Starting migration...\n");
      for (const user of wpUsers) {
        await this.migrateUser(user);
      }

      await this.updateSequence();
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
      console.log("\n✅ All users migrated with:");
      console.log("   - Preserved WordPress IDs");
      console.log("   - Fixed bcrypt password");
      console.log(
        "   - Password: Use the same hash for all users or send reset emails.\n",
      );
    }
  }
}

// Run migration
if (require.main === module) {
  const migration = new EnhancedMigration();

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

export default EnhancedMigration;
