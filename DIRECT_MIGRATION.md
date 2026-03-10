# Direct WordPress to PostgreSQL Migration (No Prisma)

Simple, direct migration from WordPress to AWS-hosted PostgreSQL.

## 🚀 Quick Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Create PostgreSQL Table
Connect to your AWS PostgreSQL and run:
```bash
psql -h your-db.rds.amazonaws.com -U postgres -d your_database -f create-tables.sql
```

Or copy the SQL from `create-tables.sql` and run it in your PostgreSQL client.

### 3. Configure Environment
```bash
cp .env.direct.example .env
```

Edit `.env` with your credentials:
```env
# AWS PostgreSQL (or any PostgreSQL)
PG_HOST="your-db.abc123.us-east-1.rds.amazonaws.com"
PG_PORT="5432"
PG_USER="postgres"
PG_PASSWORD="your_password"
PG_DATABASE="your_database"
PG_SSL="true"  # true for AWS RDS

# WordPress MySQL
WP_DB_HOST="localhost"
WP_DB_USER="root"
WP_DB_PASSWORD="your_wp_password"
WP_DB_NAME="u758272264_NW_DB"
WP_DB_PORT="3306"
```

### 4. Run Migration
```bash
npm run migrate
```

## 📊 What Gets Migrated

### WordPress → PostgreSQL

| WordPress | PostgreSQL | Type |
|-----------|------------|------|
| `wp_users.user_login` | `User.name` | string |
| `wp_users.user_pass` | `User.password` | string |
| `wp_users.user_email` | `User.email` | string |
| `wp_users.user_nicename` | `User.userName` | string |
| `wp_usermeta.first_name` | `User.firstName` | string |
| `wp_usermeta.last_name` | `User.lastName` | string |
| `wp_usermeta.billing_phone` | `User.phone` | string |
| `wp_usermeta.profile_picture` | `User.profilePicture` | string |
| `wp_usermeta.wp_capabilities` | `User.role` | enum |

### Role Mapping
- `administrator` → `ADMIN`
- `vendor`, `seller`, `shop_manager` → `VENDOR`
- `sub_admin`, `moderator` → `SUB_ADMIN`
- Others → `BUYER`

## 🎯 Features

- ✅ Direct database-to-database migration
- ✅ No Prisma dependency
- ✅ Works with AWS RDS PostgreSQL
- ✅ SSL support for AWS
- ✅ Duplicate detection (skips existing emails)
- ✅ User metadata extraction
- ✅ Role mapping
- ✅ Error handling
- ✅ Progress logging

## 📋 Step-by-Step Guide

### Step 1: Prepare PostgreSQL

Create the User table in your PostgreSQL database:

```bash
# Using psql
psql -h your-host -U postgres -d your_db -f create-tables.sql

# Or using pgAdmin/DBeaver
# Copy and run the SQL from create-tables.sql
```

Verify table creation:
```sql
SELECT * FROM "User" LIMIT 1;
```

### Step 2: Configure Connections

Edit `.env` file with your actual credentials:

**For AWS RDS PostgreSQL:**
```env
PG_HOST="mydb.abc123.us-east-1.rds.amazonaws.com"
PG_PORT="5432"
PG_USER="postgres"
PG_PASSWORD="MySecurePassword123"
PG_DATABASE="mydatabase"
PG_SSL="true"
```

**For Local PostgreSQL:**
```env
PG_HOST="localhost"
PG_PORT="5432"
PG_USER="postgres"
PG_PASSWORD="password"
PG_DATABASE="mydatabase"
PG_SSL="false"
```

### Step 3: Test Connections

You can test your connections by running:
```bash
# Test PostgreSQL connection
psql -h your-host -U postgres -d your_database -c "SELECT version();"

# Test MySQL connection
mysql -h localhost -u root -p your_database -e "SELECT COUNT(*) FROM wp_users;"
```

### Step 4: Run Migration

```bash
npm run migrate
```

Expected output:
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

### Step 5: Verify Migration

Check migrated users in PostgreSQL:

```sql
-- Count migrated users
SELECT COUNT(*) FROM "User" WHERE "authProvider" = 'wordpress';

-- View sample users
SELECT id, name, email, role, "createdAt" 
FROM "User" 
WHERE "authProvider" = 'wordpress' 
LIMIT 10;

-- Count by role
SELECT role, COUNT(*) 
FROM "User" 
WHERE "authProvider" = 'wordpress'
GROUP BY role;
```

## 🔧 Troubleshooting

### Connection Issues

**PostgreSQL Connection Failed:**
```
Error: connect ECONNREFUSED
```
**Fix:**
- Check `PG_HOST` and `PG_PORT` in `.env`
- Verify security group allows your IP (AWS)
- Check database is running

**MySQL Connection Failed:**
```
Error: ER_ACCESS_DENIED_ERROR
```
**Fix:**
- Verify `WP_DB_USER` and `WP_DB_PASSWORD`
- Check MySQL is running
- Verify database name `WP_DB_NAME`

### SSL Issues (AWS RDS)

**SSL Error:**
```
Error: no pg_hba.conf entry for host
```
**Fix:**
- Set `PG_SSL="true"` in `.env`
- Download RDS CA certificate if needed

### Table Doesn't Exist

**Error:**
```
relation "User" does not exist
```
**Fix:**
- Run `create-tables.sql` first
- Check table name is quoted: `"User"`

### Duplicate Key Error

**Error:**
```
duplicate key value violates unique constraint
```
**Fix:**
- This is normal - script skips duplicates
- Check output: `⏭️  Skipping: email@example.com`

## 🔐 Password Migration

WordPress uses **phpass** hashing. After migration:

### Option 1: Force Password Reset (Recommended)
Send password reset emails to all migrated users.

### Option 2: Implement WordPress Password Verification
```bash
npm install wordpress-hash-node
```

Then implement verification in your authentication:
```typescript
import { CheckPassword } from 'wordpress-hash-node';

if (user.authProvider === 'wordpress') {
  const isValid = CheckPassword(password, user.password);
  if (isValid) {
    // Update to bcrypt hash
  }
}
```

## 📊 AWS RDS Connection Example

### Using AWS RDS PostgreSQL

1. **Get RDS Endpoint:**
   - AWS Console → RDS → Databases
   - Copy endpoint (e.g., `mydb.abc123.us-east-1.rds.amazonaws.com`)

2. **Configure Security Group:**
   - Allow inbound PostgreSQL (port 5432) from your IP

3. **Update .env:**
```env
PG_HOST="mydb.abc123.us-east-1.rds.amazonaws.com"
PG_PORT="5432"
PG_USER="postgres"
PG_PASSWORD="your_master_password"
PG_DATABASE="your_database_name"
PG_SSL="true"
```

4. **Run Migration:**
```bash
npm run migrate
```

## 📝 Files

- `migrate-direct.ts` - Main migration script (no Prisma)
- `create-tables.sql` - PostgreSQL table creation
- `.env.direct.example` - Environment template
- `package.json` - Updated with `npm run migrate`

## ⚠️ Important Notes

1. **Backup First** - Always backup PostgreSQL before migration
2. **Test Environment** - Run on dev/staging first
3. **Password Strategy** - Decide on password handling
4. **AWS Security** - Configure security groups properly
5. **SSL Required** - Enable SSL for AWS RDS

## 🎉 Success!

If migration completes successfully:
- Users are in PostgreSQL
- WordPress data preserved
- Roles mapped correctly
- Ready to implement password reset

---

**Need help?** Check error messages and verify:
1. `.env` configuration
2. PostgreSQL table exists
3. Both databases accessible
4. Security groups (AWS)
