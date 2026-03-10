# WordPress to PostgreSQL User Migration Guide

This guide will help you migrate users from your WordPress MySQL database to your PostgreSQL database using Prisma.

## Prerequisites

1. Node.js and npm/yarn installed
2. Access to both WordPress MySQL database and PostgreSQL database
3. Prisma Client generated

## Setup Instructions

### 1. Install Required Dependencies

```bash
npm install mysql2
# or
yarn add mysql2
```

### 2. Configure Database Connections

Copy the example environment file and fill in your database credentials:

```bash
cp .env.migration.example .env
```

Edit `.env` file with your actual database credentials:

```env
# PostgreSQL Database (Target - Prisma)
DATABASE_URL="postgresql://username:password@localhost:5432/your_database?schema=public"

# WordPress MySQL Database (Source)
WP_DB_HOST="your-wordpress-host.com"
WP_DB_USER="your_mysql_user"
WP_DB_PASSWORD="your_mysql_password"
WP_DB_NAME="u758272264_NW_DB"
WP_DB_PORT="3306"
```

### 3. Generate Prisma Client

Make sure your Prisma Client is up to date:

```bash
npx prisma generate
```

## Field Mapping

The migration script maps WordPress user fields to PostgreSQL as follows:

### From wp_users table:
- `user_login` → `name`
- `user_pass` → `password`
- `user_email` → `email`
- `user_nicename` → `userName`
- `display_name` → Used as fallback for name
- `user_registered` → `createdAt`
- `user_status` → `isVerified` (0 = verified)
- `spam`, `deleted` → `isActive`

### From wp_usermeta table:
- `first_name` → `firstName`
- `last_name` → `lastName`
- `billing_phone` or `phone` → `phone`
- `profile_picture` or `avatar` → `profilePicture`
- `wp_capabilities` → `role` (parsed to determine ADMIN/VENDOR/BUYER)

### Additional Fields:
- `authProvider` → Set to "wordpress"
- `role` → Determined from WordPress capabilities (admin → ADMIN, vendor/seller → VENDOR, default → BUYER)

## Running the Migration

### Option 1: Using ts-node (Development)

```bash
npx ts-node migrate-wordpress-users.ts
```

### Option 2: Compile and Run (Production)

```bash
# Compile TypeScript
npx tsc migrate-wordpress-users.ts

# Run compiled JavaScript
node migrate-wordpress-users.js
```

## Migration Features

✅ **Duplicate Prevention**: Checks if user already exists by email before creating
✅ **User Meta Integration**: Extracts first name, last name, phone, and profile picture from wp_usermeta
✅ **Role Mapping**: Automatically maps WordPress roles to your application's role enum
✅ **Spam/Deleted Filtering**: Only migrates active, non-spam, non-deleted users
✅ **Error Handling**: Continues migration even if individual users fail
✅ **Progress Tracking**: Shows detailed progress and summary

## Output

The script provides detailed logging:
- Connection status
- Users found
- Migration progress for each user
- Final summary with success/skip/error counts

Example output:
```
🔌 Connecting to WordPress MySQL database...
✅ Connected to WordPress database
🔍 Fetching users from WordPress...
📊 Found 469 users to migrate
✅ Migrated user: john_doe (ID: 1 → 1)
⏭️  Skipping user jane_smith (jane@example.com) - already exists
...
📈 Migration Summary:
   ✅ Successfully migrated: 450
   ⏭️  Skipped (already exists): 15
   ❌ Errors: 4
   📊 Total processed: 469
🎉 Migration completed successfully!
```

## Important Notes

⚠️ **Password Hashing**: WordPress uses a different password hashing algorithm (phpass) than most modern applications. Migrated passwords will need to be reset or you'll need to implement a custom password verification strategy.

⚠️ **Data Validation**: The script migrates data as-is. You may want to add additional validation logic.

⚠️ **Backup**: Always backup your PostgreSQL database before running the migration.

⚠️ **Testing**: Test the migration on a development database first.

## Customization

### Adding More Meta Fields

To extract additional user meta fields, modify the `getUserMetaData` function:

```typescript
case 'your_meta_key':
  metaData.yourField = meta.meta_value;
  break;
```

### Custom Role Mapping

Modify the role determination logic in the `getUserMetaData` function:

```typescript
if (capabilities.includes('your_custom_role')) {
  metaData.role = 'YOUR_ROLE';
}
```

### Filtering Users

Modify the SQL query to filter specific users:

```sql
SELECT * FROM wp_users 
WHERE deleted = 0 
  AND spam = 0 
  AND user_status = 0
ORDER BY ID
```

## Troubleshooting

### Connection Errors
- Verify database credentials in `.env`
- Check if MySQL server allows remote connections
- Ensure PostgreSQL is running and accessible

### Duplicate Key Errors
- The script skips users with duplicate emails
- Check for existing users before running migration

### Type Errors
- Ensure Prisma Client is generated: `npx prisma generate`
- Verify schema.prisma matches your database

## Post-Migration Steps

1. **Verify Data**: Check a sample of migrated users in your PostgreSQL database
2. **Password Reset**: Send password reset emails to migrated users
3. **Test Authentication**: Verify users can log in (you may need custom logic for WordPress password hashing)
4. **Update Relationships**: If you have related data, migrate those next

## Support

For issues or questions:
1. Check the error messages in the console output
2. Verify your database connections
3. Ensure all dependencies are installed
4. Review the Prisma schema matches your needs
