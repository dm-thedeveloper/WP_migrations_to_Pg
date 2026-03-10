# WordPress Users Table - Important Relations

## 📊 Core User Table: `wp_users`

### Table Information
- **Total Users**: 469
- **Size**: 0.19 MB

### Key Columns
| Column | Type | Description |
|--------|------|-------------|
| `ID` | bigint(20) | PRIMARY KEY - Unique user identifier |
| `user_login` | varchar(60) | Login username |
| `user_email` | varchar(100) | Email address |
| `display_name` | varchar(250) | Public display name |
| `user_registered` | datetime | Registration date |
| `spam` | tinyint(2) | Spam flag (0=active, 1=spam) |
| `deleted` | tinyint(2) | Delete flag (0=active, 1=deleted) |

---

## 👥 USER ROLES (Stored in wp_usermeta)

User roles are stored in `wp_usermeta` with `meta_key = 'wp_capabilities'`

### Common User Roles:

| Role | Key | Description |
|------|-----|-------------|
| **Administrator** | `administrator` | Full site control - can do everything |
| **Shop Manager** | `shop_manager` | Manages WooCommerce store, products, orders |
| **Vendor/Seller** | `seller` / `dc_vendor` | Dokan marketplace vendor - sells products |
| **Customer** | `customer` | Regular customer - can purchase products |
| **Subscriber** | `subscriber` | Basic user - can only manage their profile |
| **Editor** | `editor` | Can publish and manage posts/pages |
| **Author** | `author` | Can publish and manage their own posts |
| **Contributor** | `contributor` | Can write and manage own posts (no publish) |

### How to Get User Role:
```sql
-- Get user role
SELECT u.ID, u.user_login, u.user_email, 
       um.meta_value as capabilities
FROM wp_users u
LEFT JOIN wp_usermeta um ON u.ID = um.user_id 
WHERE um.meta_key = 'wp_capabilities';
```

### Vendor-Specific Metadata (Dokan):
- `meta_key = 'dokan_enable_selling'` → Vendor enabled status
- `meta_key = 'dokan_profile_settings'` → Vendor store info
- `meta_key = 'dokan_store_name'` → Store name

---

## 🔗 CRITICAL USER RELATIONS

### 1. ⭐ **wp_usermeta** - User Metadata & Roles
- **Relation**: `user_id` → `wp_users.ID`
- **Stores**: User roles, capabilities, preferences, vendor data
- **Critical**: This defines if user is admin, vendor, customer, etc.

### 2. 🛍️ **wp_posts** - Products, Posts, Pages
- **Relation**: `post_author` → `wp_users.ID`
- **Stores**: ALL CONTENT including PRODUCTS
- **Product Location**: `post_type = 'product'`
- **Usage**: 
  - Vendors create products (`post_author` = vendor user ID)
  - Admins create posts/pages
  - Products are just special post types

```sql
-- Get user's products
SELECT p.* 
FROM wp_posts p
WHERE p.post_author = ? 
  AND p.post_type = 'product'
  AND p.post_status = 'publish';
```

### 3. 💰 **wp_wc_customer_lookup** - Customer Purchase Data
- **Relation**: `user_id` → `wp_users.ID`
- **Stores**: Order count, total spent, last order date
- **For**: Tracking customer purchase history

### 4. 🛒 **wp_wc_orders** - Orders (via customer_id)
- **Indirect Relation**: Through `wp_wc_customer_lookup`
- **Stores**: All customer orders
- **Usage**: Customer purchase orders

```sql
-- Get customer orders
SELECT o.*
FROM wp_users u
JOIN wp_wc_customer_lookup wc ON u.ID = wc.user_id
JOIN wp_wc_orders o ON wc.customer_id = o.customer_id
WHERE u.ID = ?;
```

### 5. 💬 **wp_comments** - Product Reviews & Comments
- **Relation**: `user_id` → `wp_users.ID`
- **Stores**: Product reviews, blog comments
- **Note**: `user_id = 0` for guest reviews

### 6. 💳 **wp_dokan_withdraw** - Vendor Withdrawals
- **Relation**: `user_id` → `wp_users.ID`
- **Stores**: Vendor payment withdrawal requests
- **For**: Vendors getting paid

### 7. 🔐 **wp_woocommerce_payment_tokens** - Saved Payment Methods
- **Relation**: `user_id` → `wp_users.ID`
- **Stores**: Customer saved credit cards, payment methods

### 8. 📥 **wp_woocommerce_downloadable_product_permissions**
- **Relation**: `user_id` → `wp_users.ID`
- **Stores**: Download access for digital products

### 9. ❤️ **wp_tinvwl_lists** - Customer Wishlists
- **Relation**: `user_id` → `wp_users.ID`
- **Stores**: Customer product wishlists

---

## 📦 WHERE ARE PRODUCTS?

### **PRODUCTS = wp_posts table**

Products are stored in `wp_posts` with:
- `post_type = 'product'`
- `post_author` = The vendor/admin user ID who created it
- `post_status = 'publish'` for active products

### Product-Related Tables:
- **wp_posts** - Product main data (linked via `post_author`)
- **wp_postmeta** - Product metadata (price, SKU, stock, etc.)
- **wp_wc_product_meta_lookup** - Product search optimization
- **wp_term_relationships** - Product categories, tags

```sql
-- Get vendor's products
SELECT 
    u.user_login as vendor_name,
    p.ID as product_id,
    p.post_title as product_name,
    p.post_status,
    p.post_date
FROM wp_users u
JOIN wp_posts p ON u.ID = p.post_author
WHERE p.post_type = 'product'
  AND u.ID = ?;
```

---

## 🎯 USER TYPE IDENTIFICATION

### How to Identify User Type:

```sql
-- Check if user is Vendor
SELECT u.*, um.meta_value
FROM wp_users u
JOIN wp_usermeta um ON u.ID = um.user_id
WHERE um.meta_key = 'wp_capabilities'
  AND um.meta_value LIKE '%seller%';

-- Check if user is Customer (has orders)
SELECT DISTINCT u.*
FROM wp_users u
JOIN wp_wc_customer_lookup wc ON u.ID = wc.user_id
WHERE wc.order_count > 0;

-- Check if user is Admin
SELECT u.*, um.meta_value
FROM wp_users u
JOIN wp_usermeta um ON u.ID = um.user_id
WHERE um.meta_key = 'wp_capabilities'
  AND um.meta_value LIKE '%administrator%';
```

---

## 📊 COMPLETE USER DATA QUERY

```sql
-- Get everything about a user
SELECT 
    u.ID,
    u.user_login,
    u.user_email,
    u.display_name,
    u.user_registered,
    
    -- Role
    (SELECT meta_value FROM wp_usermeta 
     WHERE user_id = u.ID AND meta_key = 'wp_capabilities') as role,
    
    -- Customer stats
    wc.order_count,
    wc.total_spend,
    wc.date_last_order,
    
    -- Product count (if vendor)
    (SELECT COUNT(*) FROM wp_posts 
     WHERE post_author = u.ID AND post_type = 'product') as product_count,
    
    -- Order count (if customer)
    (SELECT COUNT(*) FROM wp_wc_orders o
     JOIN wp_wc_customer_lookup cl ON o.customer_id = cl.customer_id
     WHERE cl.user_id = u.ID) as order_count
     
FROM wp_users u
LEFT JOIN wp_wc_customer_lookup wc ON u.ID = wc.user_id
WHERE u.ID = ?;
```

---

## 🔑 KEY POINTS

1. **User Roles** → Stored in `wp_usermeta` with key `wp_capabilities`
2. **Products** → Stored in `wp_posts` with `post_type='product'` and `post_author` = vendor ID
3. **Orders** → Linked via `wp_wc_customer_lookup` → `wp_wc_orders`
4. **Vendors** → Regular users with role `seller` or `dc_vendor` in capabilities
5. **Customers** → Users who have made purchases (tracked in `wp_wc_customer_lookup`)
6. **Admins** → Users with `administrator` capability

---

## ⚡ Quick Checks

```sql
-- Is user a vendor?
SELECT * FROM wp_usermeta 
WHERE user_id = ? AND meta_key = 'wp_capabilities' 
  AND meta_value LIKE '%seller%';

-- Get user's products
SELECT * FROM wp_posts 
WHERE post_author = ? AND post_type = 'product';

-- Get user's orders
SELECT o.* FROM wp_wc_orders o
JOIN wp_wc_customer_lookup wc ON o.customer_id = wc.customer_id
WHERE wc.user_id = ?;
```
