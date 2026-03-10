# Direct Migration Workflow (NO Prisma)

## 🎯 Migration Approach

We are **NOT using Prisma migrations**. Instead:

1. ✅ Create tables manually in PostgreSQL using SQL
2. ✅ Run direct migration script (migrate-enhanced.ts) using `pg` client
3. ✅ Data flows: WordPress MySQL → PostgreSQL (direct connection)

## 📋 Step-by-Step Process

### Step 1: Create PostgreSQL Tables

Run the SQL script on your AWS PostgreSQL database:

```bash
psql -h your-aws-host.rds.amazonaws.com -U postgres -d your_database -f create-user-tables.sql
```

Or using a PostgreSQL client (pgAdmin, DBeaver, etc.):
- Open create-user-tables.sql
- Execute all commands

**Tables Created:**
- `User` table with all fields from Prisma schema
- `Address` table (1-to-1 with User)
- `Store` table (1-to-1 with User, for vendors only)

### Step 2: Configure Environment

Edit `.env` file:

```env
# WordPress MySQL Database
WP_DB_HOST=srv447.hstgr.io
WP_DB_USER=u758272264_NW_DB
WP_DB_PASSWORD=Aeiou@123
WP_DB_NAME=u758272264_NW_DB
WP_DB_PORT=3306

# AWS PostgreSQL Database
PG_HOST=your-aws-rds-endpoint.amazonaws.com
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=your-password
PG_DATABASE=your-database-name
PG_SSL=true
```

### Step 3: Test WordPress Data

Verify what data will be migrated:

```bash
node fetch_user.js
```

This shows you all WordPress users with their metadata.

### Step 4: Run Migration

Execute the direct migration:

```bash
npm run migrate
```

This runs `migrate-enhanced.ts` which:
- Connects directly to WordPress MySQL
- Connects directly to AWS PostgreSQL
- Fetches users with all metadata in ONE optimized query
- Creates User records
- Creates Address records (if address data exists)
- Creates Store records (for vendors only)

## 🗂️ Files Overview

### SQL Scripts (Manual Table Creation)
- ✅ `create-user-tables.sql` - Creates User, Address, Store tables

### Migration Scripts (Direct Connection - NO Prisma)
- ✅ `migrate-enhanced.ts` - Main migration script (uses `pg` client)
- ✅ `fetch_user.js` - Test script to verify WordPress data

### ❌ NOT USED
- ❌ `migrate-wordpress-users.ts` - Uses Prisma (IGNORE THIS FILE)
- ❌ Prisma migrations - We don't use these

## 📊 Data Flow

```
WordPress MySQL (srv447.hstgr.io)
         ↓
   [fetch_user.js] - Test query
         ↓
   [migrate-enhanced.ts] - Direct migration
         ↓
         ├─→ User table (all users)
         ├─→ Address table (users with address data)
         └─→ Store table (vendors only)
         ↓
AWS PostgreSQL (your-rds-endpoint)
```

## 🔑 Key Points

1. **No Prisma Client** - We use `pg` library directly
2. **Manual SQL Tables** - Tables created with SQL script
3. **Direct Database Connections** - WordPress MySQL → PostgreSQL
4. **Single Optimized Query** - Fetches all user data at once
5. **Smart Record Creation**:
   - User: Always created
   - Address: Only if address data exists
   - Store: Only for VENDOR role

## ✅ Migration Features

- ✅ Priority-based role detection (ADMIN > VENDOR > BUYER)
- ✅ Single SQL query (no N+1 problem)
- ✅ Fixed password hash for all users
- ✅ Automatic address creation
- ✅ Automatic store creation for vendors
- ✅ Skip existing users (idempotent)
- ✅ Comprehensive error handling

## 🧪 Verification

After migration, check your PostgreSQL database:

```sql
-- Count users by role
SELECT role, COUNT(*) 
FROM "User" 
WHERE "authProvider" = 'wordpress' 
GROUP BY role;

-- Check addresses created
SELECT COUNT(*) FROM "Address";

-- Check stores created (should match VENDOR count)
SELECT COUNT(*) FROM "Store";

-- View sample migrated data
SELECT 
  u.name, u.email, u.role,
  a.address, a.city,
  s."storeName"
FROM "User" u
LEFT JOIN "Address" a ON u.id = a."userId"
LEFT JOIN "Store" s ON u.id = s."vendorId"
WHERE u."authProvider" = 'wordpress'
LIMIT 10;
```

## 🚀 Quick Start

```bash
# 1. Create tables in PostgreSQL
psql -h your-host -U postgres -d your-db -f create-user-tables.sql

# 2. Configure .env with your credentials

# 3. Test data extraction
npm run fetch

# 4. Run migration
npm run migrate
```

## 📝 Summary

**What we USE:**
- ✅ create-user-tables.sql (manual table creation)
- ✅ migrate-enhanced.ts (direct migration with pg)
- ✅ fetch_user.js (test script)

**What we DON'T USE:**
- ❌ Prisma migrations
- ❌ migrate-wordpress-users.ts (it uses Prisma)
- ❌ PrismaClient for data insertion

The Prisma schema file is just for **reference** - we create tables manually with SQL!
