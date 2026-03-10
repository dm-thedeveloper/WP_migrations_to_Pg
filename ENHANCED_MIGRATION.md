# ✨ Enhanced WordPress Migration

## Updates

### ✅ Improved Features
1. **Single Optimized Query** - Fetches all user data in one query (faster)
2. **Fixed Password Hash** - All users get the same bcrypt password
3. **Priority-Based Roles** - administrator > seller > customer
4. **Additional Fields** - Bank details, VAT, company info, addresses
5. **WooCommerce Data** - Includes wp_wc_customer_lookup table

### 🎯 Role Mapping (Priority Order)
```
1. administrator       → ADMIN (highest priority)
2. seller             → VENDOR
3. customer           → BUYER
4. dokan_wholesale    → BUYER (default)
```

### 📊 Field Mapping

| WordPress | PostgreSQL | Source |
|-----------|------------|--------|
| `user_login` | `name` | wp_users |
| `user_email` | `email` | wp_users |
| `user_nicename` | `userName` | wp_users |
| `first_name` | `firstName` | wp_usermeta |
| `last_name` | `lastName` | wp_usermeta |
| `billing_phone` | `phone` | wp_usermeta |
| `wp_capabilities` | `role` | wp_usermeta (parsed) |

### 🔐 Password Strategy
All users receive the same bcrypt hash:
```
$2a$10$sVMsMf2voDqKnCBWeGzZXO/jP3IzpNQMP0Wu763SDhrVbCUS.q1Xa
```

**Options:**
1. Users reset password on first login
2. Use fixed password for testing: `password123`
3. Send password reset emails after migration

## 🚀 Quick Start

```bash
# Run enhanced migration
npm run migrate

# Or test fetch query first
npm run fetch
```

## 📋 Commands

```bash
npm run fetch          # Test WordPress query (fetch_user.js)
npm run migrate        # Run enhanced migration
npm run migrate:direct # Run simple migration (old version)
```

## 🧪 Test First

```bash
# Test the WordPress query
npm run fetch
```

This shows you sample data before migrating.

## ⚡ Run Migration

```bash
npm run migrate
```

Expected output:
```
🔌 Connecting to WordPress MySQL...
✅ WordPress connected

🔌 Connecting to PostgreSQL...
✅ PostgreSQL connected

🔍 Fetching WordPress users with metadata...
📊 Found 469 users

🚀 Starting migration...

✅ Migrated: admin → User ID 1 (ADMIN)
✅ Migrated: seller1 → User ID 2 (VENDOR)
✅ Migrated: customer1 → User ID 3 (BUYER)
⏭️  Skipping: existing@email.com (already exists)

==================================================
📈 Migration Summary
==================================================
Total users:     469
✅ Success:      450
⏭️  Skipped:      15
❌ Errors:       4
==================================================

✅ All users migrated with fixed bcrypt password.
   Password: Use the same hash for all users or send reset emails.

🎉 Migration completed!
```

## 🔍 Verify Migration

```sql
-- Check migrated users
SELECT COUNT(*) FROM "User" WHERE "authProvider" = 'wordpress';

-- View by role
SELECT role, COUNT(*) FROM "User" 
WHERE "authProvider" = 'wordpress' 
GROUP BY role;

-- Sample users
SELECT id, name, email, role, "firstName", "lastName", phone
FROM "User" 
WHERE "authProvider" = 'wordpress'
LIMIT 10;
```

## 🎯 What's Different?

### Enhanced Migration (`migrate-enhanced.ts`)
- ✅ Single optimized query
- ✅ Fetches all metadata at once
- ✅ Includes WooCommerce customer data
- ✅ Fixed password hash for all users
- ✅ Priority-based role detection
- ✅ Faster performance

### Simple Migration (`migrate-direct.ts`)
- ⚡ Multiple queries per user
- ⚡ Fetches metadata separately
- ⚡ Basic role detection
- ⚡ Keeps WordPress password hash

**Use enhanced version for better performance!**

## 📝 Files

- `migrate-enhanced.ts` - **Use this** (optimized)
- `migrate-direct.ts` - Simple version
- `fetch_user.js` - Test WordPress query
- `create-tables.sql` - PostgreSQL setup

---

**Ready?** Run `npm run migrate` 🚀
