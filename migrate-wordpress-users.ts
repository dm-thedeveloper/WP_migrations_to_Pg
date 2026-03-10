import { PrismaClient } from "@prisma/client";
import mysql from "mysql2/promise";

const prisma = new PrismaClient();

// WordPress MySQL database configuration
const wpDbConfig = {
  host: process.env.WP_DB_HOST || "localhost",
  user: process.env.WP_DB_USER || "root",
  password: process.env.WP_DB_PASSWORD || "",
  database: process.env.WP_DB_NAME || "u758272264_NW_DB",
  port: parseInt(process.env.WP_DB_PORT || "3306"),
};

interface WordPressUser {
  ID: number;
  user_login: string;
  user_pass: string;
  user_nicename: string;
  user_email: string;
  user_url: string;
  user_registered: Date;
  user_activation_key: string;
  user_status: number;
  display_name: string;
  spam: number;
  deleted: number;
}

interface WordPressUserMeta {
  umeta_id: number;
  user_id: number;
  meta_key: string;
  meta_value: string | null;
}

interface UserMetaData {
  firstName?: string;
  lastName?: string;
  phone?: string;
  profilePicture?: string;
  role?: string;
}

async function getUserMetaData(
  wpConnection: mysql.Connection,
  userId: number
): Promise<UserMetaData> {
  const [metaRows] = await wpConnection.query<mysql.RowDataPacket[]>(
    "SELECT meta_key, meta_value FROM wp_usermeta WHERE user_id = ?",
    [userId]
  );

  const metaData: UserMetaData = {};

  metaRows.forEach((meta) => {
    switch (meta.meta_key) {
      case "first_name":
        metaData.firstName = meta.meta_value;
        break;
      case "last_name":
        metaData.lastName = meta.meta_value;
        break;
      case "billing_phone":
      case "phone":
        metaData.phone = meta.meta_value;
        break;
      case "profile_picture":
      case "avatar":
        metaData.profilePicture = meta.meta_value;
        break;
      case "wp_capabilities":
        // Parse WordPress role from capabilities
        try {
          const capabilities = meta.meta_value;
          if (capabilities.includes("administrator")) {
            metaData.role = "ADMIN";
          } else if (
            capabilities.includes("vendor") ||
            capabilities.includes("seller")
          ) {
            metaData.role = "VENDOR";
          } else {
            metaData.role = "BUYER";
          }
        } catch (e) {
          metaData.role = "BUYER";
        }
        break;
    }
  });

  return metaData;
}

async function migrateUsers() {
  let wpConnection: mysql.Connection | null = null;

  try {
    console.log("🔌 Connecting to WordPress MySQL database...");
    wpConnection = await mysql.createConnection(wpDbConfig);
    console.log("✅ Connected to WordPress database");

    console.log("🔍 Fetching users from WordPress...");
    const [wpUsers] = await wpConnection.query<mysql.RowDataPacket[]>(
      `SELECT * FROM wp_users WHERE deleted = 0 AND spam = 0 ORDER BY ID`
    );

    console.log(`📊 Found ${wpUsers.length} users to migrate`);

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (const wpUser of wpUsers as WordPressUser[]) {
      try {
        // Check if user already exists in PostgreSQL by email
        const existingUser = await prisma.user.findUnique({
          where: { email: wpUser.user_email },
        });

        if (existingUser) {
          console.log(
            `⏭️  Skipping user ${wpUser.user_login} (${wpUser.user_email}) - already exists`
          );
          skipCount++;
          continue;
        }

        // Get user meta data
        const metaData = await getUserMetaData(wpConnection, wpUser.ID);

        // Determine role
        const role = metaData.role || "BUYER";

        // Create user in PostgreSQL
        const newUser = await prisma.user.create({
          data: {
            name: wpUser.user_login,
            userName: wpUser.user_nicename,
            email: wpUser.user_email,
            password: wpUser.user_pass, // Note: WordPress passwords are hashed differently
            firstName: metaData.firstName || null,
            lastName: metaData.lastName || null,
            phone: metaData.phone || null,
            profilePicture: metaData.profilePicture || null,
            role: role as any,
            isVerified: wpUser.user_status === 0,
            isActive: wpUser.deleted === 0 && wpUser.spam === 0,
            authProvider: "wordpress",
            createdAt: wpUser.user_registered || new Date(),
          },
        });

        console.log(
          `✅ Migrated user: ${wpUser.user_login} (ID: ${wpUser.ID} → ${newUser.id})`
        );
        successCount++;
      } catch (error) {
        console.error(`❌ Error migrating user ${wpUser.user_login}:`, error);
        errorCount++;
      }
    }

    console.log("\n📈 Migration Summary:");
    console.log(`   ✅ Successfully migrated: ${successCount}`);
    console.log(`   ⏭️  Skipped (already exists): ${skipCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log(`   📊 Total processed: ${wpUsers.length}`);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    if (wpConnection) {
      await wpConnection.end();
      console.log("🔌 Disconnected from WordPress database");
    }
    await prisma.$disconnect();
    console.log("🔌 Disconnected from PostgreSQL database");
  }
}

// Run migration
migrateUsers()
  .then(() => {
    console.log("🎉 Migration completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Migration failed:", error);
    process.exit(1);
  });
