# WordPress to PostgreSQL Migration Scripts

Complete migration solution that **preserves WordPress IDs** for Users, Categories, and Products.

---

## 📋 **Migration Order**

Execute migrations in this order to maintain foreign key relationships:

1. **Users** → Creates User, Address, Store tables
2. **Categories** → Creates Category table
3. **Products** → Creates Product, ProductCategory tables (coming next)

---

## 🚀 **1. User Migration**

### Features:
- ✅ Preserves WordPress user IDs
- ✅ Migrates users with all metadata
- ✅ Creates addresses for all users
- ✅ Creates stores for vendors only
- ✅ Automatically updates PostgreSQL sequence

### Run Migration:

```bash
cd final/user
npx ts-node migrate-enhanced.ts
```

### What It Does:
- Fetches all active users from WordPress (deleted=0, spam=0)
- Determines role (ADMIN, VENDOR, BUYER) from wp_capabilities
- **Uses WordPress user.ID as PostgreSQL User.id**
- Migrates billing/shipping addresses
- Creates store records for vendors
- Updates the User_id_seq to prevent ID conflicts

### Tables Created:
- `User` (with WordPress IDs)
- `Address`
- `Store`
---

## 📂 **2. Category Migration**

### Features:
- ✅ Preserves WordPress term_id as category ID
- ✅ Maintains parent/child relationships
- ✅ Fetches category images
- ✅ Only migrates product_cat taxonomy

### Run Migration:

```bash
cd final/categories
npx ts-node migrate-categories.ts
```

### What It Does:
- Fetches all product categories from wp_terms + wp_term_taxonomy
- **Uses WordPress term_id as PostgreSQL Category.id**
- Preserves parent category relationships
- Downloads category thumbnail images
- Updates the Category_id_seq

### Tables Created:
- `Category` (with WordPress term IDs)

---

## 🛍️ **3. Product Query (For Migration)**

### Master SQL Query

Located in: `final/products/master-product-query.sql`

This comprehensive query fetches ALL product data:

#### Includes:
- ✅ Product core info (title, description, status)
- ✅ Vendor information
- ✅ All product metadata (SKU, prices, stock)
- ✅ Categories (linked by term_id)
- ✅ Tags
- ✅ Attributes (pa_color, pa_size, etc.)
- ✅ Images (featured + gallery)
- ✅ Shipping dimensions
- ✅ Tax information
- ✅ Dokan vendor fields
- ✅ Reviews & ratings

### Query Variations:

1. **Full Product Query** - Everything in one query
2. **Gallery Images Expanded** - Each image as separate row
3. **Product Attributes** - Only attribute values
4. **Compact Version** - Essential fields only

---

## 🔧 **Environment Setup**

Create a `.env` file in each directory:

```env
# WordPress MySQL
WP_DB_HOST=srv447.hstgr.io
WP_DB_USER=u758272264_NW_DB
WP_DB_PASSWORD=Aeiou@123
WP_DB_NAME=u758272264_NW_DB
WP_DB_PORT=3306

# PostgreSQL (AWS RDS or local)
PG_HOST=your-postgres-host.amazonaws.com
PG_PORT=5432
PG_USER=your-pg-user
PG_PASSWORD=your-pg-password
PG_DATABASE=your-database-name
PG_SSL=true
```

---

## 📦 **Installation**

### Install dependencies in each folder:

```bash
# User migration
cd final/user
npm install mysql2 pg dotenv
npm install -D @types/node typescript ts-node

# Category migration
cd ../categories
npm install mysql2 pg dotenv
npm install -D @types/node typescript ts-node
```

---

## ⚙️ **PostgreSQL Setup**

### Before running migrations, ensure your PostgreSQL tables exist.

If using Prisma, run:

```bash
npx prisma migrate dev
# or
npx prisma db push
```

### Manual Table Creation (if needed):

```sql
-- Users table
CREATE TABLE "User" (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255),
  "userName" VARCHAR(255),
  "firstName" VARCHAR(255),
  "lastName" VARCHAR(255),
  phone VARCHAR(50),
  role VARCHAR(20) NOT NULL,
  country VARCHAR(100),
  "isVerified" BOOLEAN DEFAULT true,
  "isActive" BOOLEAN DEFAULT true,
  "isApprovalRequired" BOOLEAN DEFAULT false,
  "authProvider" VARCHAR(50),
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Category table
CREATE TABLE "Category" (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  "categoryType" VARCHAR(50) NOT NULL,
  "isActive" BOOLEAN DEFAULT true,
  "parentId" INTEGER,
  image VARCHAR(500),
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY ("parentId") REFERENCES "Category"(id) ON DELETE CASCADE
);
```

---

## 🔑 **Why Preserve WordPress IDs?**

### Critical for maintaining relationships:

1. **Products** reference `post_author` (vendor user ID)
2. **Categories** reference `parent_id` (parent category term_id)
3. **Orders** reference customer user IDs
4. **Reviews** reference product IDs and user IDs

### The scripts automatically:
- Insert records with original WordPress IDs
- Update PostgreSQL sequences to prevent future conflicts
- Skip existing records by ID check

---

## 📊 **Migration Statistics**

Each script provides detailed stats:

```
==================================================
📈 Migration Summary
==================================================
Total records:    469
✅ Success:       465
⏭️  Skipped:       4
❌ Errors:        0
==================================================
```

---

## ⚠️ **Important Notes**

### 1. Run migrations in order (Users → Categories → Products)
### 2. WordPress IDs are preserved for all entities
### 3. Sequences are automatically updated after migration
### 4. Re-running migrations skips existing records (safe to retry)
### 5. All users get the same bcrypt password (send reset emails)

---

## 🐛 **Troubleshooting**

### Sequence Issues:
If new records get duplicate IDs, manually update the sequence:

```sql
-- For Users
SELECT setval('"User_id_seq"', (SELECT MAX(id) FROM "User"), true);

-- For Categories
SELECT setval('"Category_id_seq"', (SELECT MAX(id) FROM "Category"), true);
```

### Connection Issues:
- Verify `.env` file exists and has correct credentials
- Test MySQL connection: `mysql -h srv447.hstgr.io -u u758272264_NW_DB -p`
- Test PostgreSQL: `psql -h your-host -U your-user -d your-database`

### Foreign Key Errors:
- Ensure User table exists before migrating Addresses/Stores
- Ensure Category table exists before migrating ProductCategories
- Run migrations in the specified order

---

## 📝 **Next Steps**

1. ✅ Migrate Users (completed)
2. ✅ Migrate Categories (completed)
3. 🔄 Create Product Migration Script (using master-product-query.sql)
4. 🔄 Migrate Product-Category relationships
5. 🔄 Migrate Orders
6. 🔄 Migrate Reviews

---

## 📞 **Support**

If you encounter issues:
1. Check logs for specific error messages
2. Verify database connections
3. Ensure tables exist in PostgreSQL
4. Check that sequences are properly updated
5. Verify foreign key relationships exist

---

## 🎉 **Success!**

Once all migrations complete, you'll have:
- All WordPress users with preserved IDs
- Complete category hierarchy with original IDs
- Ready for product migration with relationships intact!

🚀 **Happy migrating!**
