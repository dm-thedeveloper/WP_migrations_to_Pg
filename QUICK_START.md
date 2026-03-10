# WordPress to PostgreSQL User Migration - Quick Start

## ⚡ Quick Start (3 Steps)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Create a `.env` file with your database credentials:

```env
# Target PostgreSQL Database (Prisma)
DATABASE_URL="postgresql://user:password@localhost:5432/database"

# Source WordPress MySQL Database
WP_DB_HOST="localhost"
WP_DB_USER="root"
WP_DB_PASSWORD="your_password"
WP_DB_NAME="u758272264_NW_DB"
WP_DB_PORT="3306"
```

### 3. Run Migration
```bash
npm run migrate:users
```

## 📋 What Gets Migrated

### WordPress → PostgreSQL Field Mapping

| WordPress (wp_users) | PostgreSQL (User) | Notes |
|---------------------|-------------------|-------|
| `user_login` | `name` | Username |
| `user_pass` | `password` | ⚠️ Needs password reset |
| `user_email` | `email` | Unique identifier |
| `user_nicename` | `userName` | URL-friendly name |
| `user_registered` | `createdAt` | Registration date |
| `user_status` | `isVerified` | Account status |

### WordPress Metadata (wp_usermeta) → PostgreSQL

| Meta Key | PostgreSQL Field | Notes |
|----------|------------------|-------|
| `first_name` | `firstName` | From meta |
| `last_name` | `lastName` | From meta |
| `billing_phone` / `phone` | `phone` | Contact |
| `profile_picture` / `avatar` | `profilePicture` | Image URL |
| `wp_capabilities` | `role` | ADMIN/VENDOR/BUYER |

## 🔐 Important: Password Handling

WordPress uses **phpass** password hashing, which is different from most modern apps.

### Options:
1. **Force password reset** (Recommended)
2. **Implement WordPress password verification**
3. **Hash passwords during migration** (requires plaintext access)

## 🛠️ Available Scripts

```bash
# Run migration with ts-node (recommended)
npm run migrate:users

# Build and run (production)
npm run migrate:users:build
```

## ✨ Features

✅ Duplicate detection (skips existing emails)
✅ User metadata extraction
✅ Role mapping (Admin, Vendor, Buyer)
✅ Filters spam and deleted users
✅ Detailed progress logging
✅ Error handling per user
✅ Migration summary

## 📊 Sample Output

```
🔌 Connecting to WordPress database...
✅ Connected successfully

🔍 Fetching WordPress users...
📊 Found 469 users

🚀 Starting migration...

✅ Migrated: admin → User ID 1 (ADMIN)
✅ Migrated: vendor1 → User ID 2 (VENDOR)
⏭️  Skipping: john@example.com (already exists)
✅ Migrated: customer1 → User ID 3 (BUYER)
❌ Error migrating invalid_user: email validation failed

==================================================
📈 Migration Summary
==================================================
Total users:     469
✅ Success:      450
⏭️  Skipped:      15
❌ Errors:       4
==================================================
```

## 🔧 Troubleshooting

### Connection Failed
```
❌ Error: ER_ACCESS_DENIED_ERROR
```
**Solution**: Check your `WP_DB_*` credentials in `.env`

### Prisma Error
```
❌ Error: Invalid `prisma.user.create()` invocation
```
**Solution**: Run `npx prisma generate` to update Prisma Client

### Email Already Exists
```
⏭️ Skipping: user@example.com (already exists)
```
**This is normal** - the script skips duplicate emails

## 📞 Need Help?

1. Check your `.env` file configuration
2. Verify database connectivity
3. Ensure Prisma schema matches your User model
4. Review error messages in console output

## 🔄 Re-running Migration

The script is **idempotent** - you can run it multiple times safely. It will:
- Skip users that already exist (by email)
- Only migrate new users
- Report statistics

## ⚠️ Pre-Migration Checklist

- [ ] Backup your PostgreSQL database
- [ ] Test on development environment first
- [ ] Verify WordPress database connection
- [ ] Check Prisma schema matches User model
- [ ] Have password reset flow ready for users

## 📝 Post-Migration Tasks

1. ✅ Verify migrated user data
2. 📧 Send password reset emails to users
3. 🔍 Test user authentication
4. 🔗 Migrate related data (orders, posts, etc.)
5. 📊 Update user statistics/counts
