# ⚡ WordPress to PostgreSQL - Quick Reference

## Direct Migration (No Prisma) to AWS PostgreSQL

---

## 🚀 Quick Start (4 Steps)

### 1. Install
```bash
npm install
```

### 2. Create PostgreSQL Table
```bash
psql -h your-rds-endpoint.amazonaws.com -U postgres -d your_db -f create-tables.sql
```

### 3. Configure
```bash
cp .env.direct.example .env
# Edit .env with your AWS RDS and WordPress credentials
```

### 4. Migrate
```bash
npm run migrate
```

---

## 📝 Environment Setup (.env)

```env
# AWS PostgreSQL (RDS)
PG_HOST="your-db.abc123.us-east-1.rds.amazonaws.com"
PG_PORT="5432"
PG_USER="postgres"
PG_PASSWORD="your_password"
PG_DATABASE="your_database"
PG_SSL="true"

# WordPress MySQL
WP_DB_HOST="localhost"
WP_DB_USER="root"
WP_DB_PASSWORD="your_password"
WP_DB_NAME="u758272264_NW_DB"
WP_DB_PORT="3306"
```

---

## 📊 Field Mapping

| WordPress | → | PostgreSQL |
|-----------|---|------------|
| `user_login` | → | `name` |
| `user_pass` | → | `password` |
| `user_email` | → | `email` |
| `user_nicename` | → | `userName` |
| `first_name` (meta) | → | `firstName` |
| `last_name` (meta) | → | `lastName` |
| `billing_phone` (meta) | → | `phone` |
| `wp_capabilities` (meta) | → | `role` |

---

## 🎯 Commands

```bash
# Run migration
npm run migrate

# Build and run
npm run migrate:build
```

---

## ✅ Verify Migration

```sql
-- Count migrated users
SELECT COUNT(*) FROM "User" WHERE "authProvider" = 'wordpress';

-- View users by role
SELECT role, COUNT(*) FROM "User" 
WHERE "authProvider" = 'wordpress' 
GROUP BY role;

-- Sample data
SELECT id, name, email, role FROM "User" LIMIT 10;
```

---

## 🔧 Troubleshooting

### Can't connect to PostgreSQL
- Check AWS security group allows your IP
- Verify `PG_HOST` and credentials in `.env`
- Ensure `PG_SSL="true"` for AWS RDS

### Table doesn't exist
- Run `create-tables.sql` first
- Check table name uses quotes: `"User"`

### MySQL connection failed
- Verify `WP_DB_*` credentials
- Check MySQL is running

---

## 📁 Important Files

- **`migrate-direct.ts`** - Main migration script
- **`create-tables.sql`** - PostgreSQL table setup
- **`.env.direct.example`** - Config template
- **`DIRECT_MIGRATION.md`** - Full documentation

---

## ⚠️ Important

1. **Backup PostgreSQL** before running
2. **Run on dev/staging** first
3. **Password reset** required (WordPress uses different hashing)
4. **AWS Security Groups** must allow your IP

---

## 🎉 Expected Output

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

==================================================
📈 Migration Summary
==================================================
Total users:     469
✅ Success:      450
⏭️  Skipped:      15
❌ Errors:       4
==================================================

🎉 Migration completed!
```

---

**Read full guide:** `DIRECT_MIGRATION.md`
