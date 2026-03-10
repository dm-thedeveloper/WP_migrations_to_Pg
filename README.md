# WordPress to PostgreSQL User Migration

**Direct migration from WordPress to AWS PostgreSQL (No Prisma required)**

Migrate users from WordPress (wp_users & wp_usermeta) directly to PostgreSQL hosted on AWS RDS or any PostgreSQL server.

## ⚡ Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Create PostgreSQL table
psql -h your-db.rds.amazonaws.com -U postgres -d your_db -f create-tables.sql

# 3. Configure environment
cp .env.direct.example .env
# Edit .env with your credentials

# 4. Run migration
npm run migrate
```

## 📊 What Gets Migrated

### WordPress → PostgreSQL

| WordPress Field | PostgreSQL Field | Notes |
|----------------|------------------|-------|
| `wp_users.user_login` | `User.name` | Username |
| `wp_users.user_pass` | `User.password` | WordPress hash (needs reset) |
| `wp_users.user_email` | `User.email` | Unique identifier |
| `wp_users.user_nicename` | `User.userName` | URL-friendly name |
| `wp_usermeta.first_name` | `User.firstName` | From metadata |
| `wp_usermeta.last_name` | `User.lastName` | From metadata |
| `wp_usermeta.billing_phone` | `User.phone` | Contact number |
| `wp_usermeta.profile_picture` | `User.profilePicture` | Avatar URL |
| `wp_usermeta.wp_capabilities` | `User.role` | ADMIN/VENDOR/BUYER |

### Role Mapping
- `administrator` → `ADMIN`
- `vendor`, `seller`, `shop_manager` → `VENDOR`
- `sub_admin`, `moderator` → `SUB_ADMIN`
- Others → `BUYER`

## ✨ Features

- ✅ **Direct Migration** - No Prisma, direct database-to-database
- ✅ **AWS Support** - Works with AWS RDS PostgreSQL (SSL enabled)
- ✅ **Duplicate Detection** - Skips existing emails automatically
- ✅ **Metadata Extraction** - Pulls name, phone, profile data from wp_usermeta
- ✅ **Role Mapping** - Converts WordPress roles to your app roles
- ✅ **Error Handling** - Continues on individual failures
- ✅ **Progress Logging** - Real-time migration status
- ✅ **Idempotent** - Safe to run multiple times

## 📋 Requirements

- Node.js 14+
- Access to WordPress MySQL database
- Access to PostgreSQL database (AWS RDS or local)
- `pg` library for PostgreSQL (included)
- `mysql2` library for MySQL (included)

## 🔧 Setup Guide

### Step 1: Create PostgreSQL Table

Run the provided SQL script on your PostgreSQL database:

```bash
# For AWS RDS
psql -h your-db.abc123.us-east-1.rds.amazonaws.com -U postgres -d your_database -f create-tables.sql

# For local PostgreSQL
psql -U postgres -d your_database -f create-tables.sql
```

Or copy the SQL from `create-tables.sql` and run it in pgAdmin, DBeaver, or any PostgreSQL client.

### Step 2: Configure Environment

Create `.env` file from template:

```bash
cp .env.direct.example .env
```

Edit with your credentials:

**For AWS RDS PostgreSQL:**
```env
PG_HOST="mydb.abc123.us-east-1.rds.amazonaws.com"
PG_PORT="5432"
PG_USER="postgres"
PG_PASSWORD="your_password"
PG_DATABASE="your_database"
PG_SSL="true"

WP_DB_HOST="localhost"
WP_DB_USER="root"
WP_DB_PASSWORD="wp_password"
WP_DB_NAME="u758272264_NW_DB"
WP_DB_PORT="3306"
```

**For Local PostgreSQL:**
```env
PG_HOST="localhost"
PG_PORT="5432"
PG_USER="postgres"
PG_PASSWORD="postgres"
PG_DATABASE="mydatabase"
PG_SSL="false"

WP_DB_HOST="localhost"
WP_DB_USER="root"
WP_DB_PASSWORD="password"
WP_DB_NAME="u758272264_NW_DB"
WP_DB_PORT="3306"
```

### Step 3: Run Migration

```bash
npm run migrate
```

### Step 4: Verify Results

Connect to PostgreSQL and verify:

```sql
-- Count migrated users
SELECT COUNT(*) FROM "User" WHERE "authProvider" = 'wordpress';

-- View sample users
SELECT id, name, email, role, "createdAt" 
FROM "User" 
WHERE "authProvider" = 'wordpress' 
LIMIT 10;

-- Count by role
SELECT role, COUNT(*) as count
FROM "User" 
WHERE "authProvider" = 'wordpress'
GROUP BY role;
```

## 📊 Expected Output

```
🔌 Connecting to WordPress MySQL...
✅ WordPress connected

🔌 Connecting to PostgreSQL...
✅ PostgreSQL connected

🔍 Fetching WordPress users...
📊 Found 469 users

🚀 Starting migration...

✅ Migrated: admin → User ID 1 (ADMIN)
✅ Migrated: vendor1 → User ID 2 (VENDOR)
⏭️  Skipping: existing@email.com (already exists)
✅ Migrated: customer1 → User ID 3 (BUYER)

==================================================
📈 Migration Summary
==================================================
Total users:     469
✅ Success:      450
⏭️  Skipped:      15
❌ Errors:       4
==================================================

⚠️  IMPORTANT: WordPress passwords use phpass hashing.
   Users will need to reset their passwords.

🎉 Migration completed!
```

## 🔐 Password Migration

WordPress uses **phpass** hashing. After migration, choose a strategy:

### Option 1: Force Password Reset (Recommended)
Send password reset emails to all migrated users.

### Option 2: Implement WordPress Password Verification
```bash
npm install wordpress-hash-node bcrypt
```

## 🐛 Troubleshooting

### Connection Issues

**PostgreSQL Connection Failed:**
```
Error: connect ECONNREFUSED
```
**Fix:**
- Check `PG_HOST` and `PG_PORT` in `.env`
- Verify AWS security group allows your IP
- Ensure `PG_SSL="true"` for AWS RDS

**MySQL Connection Failed:**
```
Error: ER_ACCESS_DENIED_ERROR
```
**Fix:**
- Verify `WP_DB_USER` and `WP_DB_PASSWORD` in `.env`
- Check MySQL server is running
- Confirm database name is correct

### Table Issues

**Table doesn't exist:**
```
relation "User" does not exist
```
**Fix:**
- Run `create-tables.sql` first
- Ensure table name is quoted: `"User"`

**Duplicate key error:**
```
duplicate key value violates unique constraint
```
**Fix:**
- This is normal - script automatically skips duplicates
- Check for `⏭️  Skipping:` messages in output

## 📁 Project Files

- **`migrate-direct.ts`** - Main migration script (no Prisma)
- **`create-tables.sql`** - PostgreSQL table creation script
- **`.env.direct.example`** - Environment configuration template
- **`DIRECT_MIGRATION.md`** - Detailed migration guide
- **`QUICK_REFERENCE.md`** - Quick reference card
- **`package.json`** - Node.js package configuration

## 🎯 Migration Statistics

For a typical WordPress database with 469 users:
- **Success Rate**: 96% (450 users)
- **Skipped**: 3% (15 duplicates)
- **Errors**: 1% (4 data issues)
- **Duration**: 2-5 minutes

## ⚠️ Important Notes

1. **Backup First** - Always backup PostgreSQL database before migration
2. **Test Environment** - Run on dev/staging database first
3. **AWS Security** - Configure security groups to allow your IP address
4. **SSL Required** - Enable SSL for AWS RDS connections
5. **Password Strategy** - Plan password reset flow before migration
6. **Unique Emails** - Email must be unique in PostgreSQL

## 📚 Documentation

- **Quick Reference**: See `QUICK_REFERENCE.md` for commands and tips
- **Full Guide**: See `DIRECT_MIGRATION.md` for detailed instructions
- **SQL Reference**: See `create-tables.sql` for table structure

## 🚀 AWS RDS Setup Example

### 1. Get RDS Endpoint
- AWS Console → RDS → Databases
- Copy endpoint: `mydb.abc123.us-east-1.rds.amazonaws.com`

### 2. Configure Security Group
- Inbound rules → PostgreSQL (5432) → Your IP

### 3. Update .env
```env
PG_HOST="mydb.abc123.us-east-1.rds.amazonaws.com"
PG_SSL="true"
```

### 4. Create Table
```bash
psql -h mydb.abc123.us-east-1.rds.amazonaws.com -U postgres -d mydb -f create-tables.sql
```

### 5. Run Migration
```bash
npm run migrate
```

## 🎉 Success Criteria

Migration is successful when:
- All active WordPress users migrated to PostgreSQL
- User data is accurate and complete
- No duplicate accounts created
- Roles are correctly mapped
- Migration statistics show high success rate
- Users can be queried in PostgreSQL

## 📞 Support

Having issues?

1. Check error messages in console output
2. Verify `.env` configuration
3. Test database connections separately
4. Review `DIRECT_MIGRATION.md` for detailed troubleshooting
5. Check AWS security group settings (if using RDS)

## 📝 License

This migration script is provided as-is for use in your projects.

---

**Ready to migrate?** Follow the Quick Start above or read `DIRECT_MIGRATION.md` for detailed instructions.

**Quick Commands:**
```bash
npm install                    # Install dependencies
npm run migrate                # Run migration
```
