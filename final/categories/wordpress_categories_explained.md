# 📂 WordPress Product Categories - Complete Guide

## 🎯 WHERE ARE CATEGORIES?

Categories in WordPress/WooCommerce are stored using a **3-table system**:

### The Taxonomy System (3 Tables):

```
wp_terms → wp_term_taxonomy → wp_term_relationships → wp_posts (products)
```

---

## 📊 Table 1: `wp_terms` - Category Names

**Stores**: The actual category/tag names

| Column | Type | Description |
|--------|------|-------------|
| `term_id` | bigint(20) | PRIMARY - Unique term ID |
| `name` | varchar(200) | Category display name (e.g., "Electronics") |
| `slug` | varchar(200) | URL-friendly name (e.g., "electronics") |
| `term_group` | bigint(10) | Grouping (usually 0) |

**Total Terms**: 5,106 (includes categories, tags, attributes, etc.)

---

## 📊 Table 2: `wp_term_taxonomy` - Category Types

**Stores**: What TYPE each term is (product category, product tag, etc.)

| Column | Type | Description |
|--------|------|-------------|
| `term_taxonomy_id` | bigint(20) | PRIMARY - Unique taxonomy ID |
| `term_id` | bigint(20) | Links to `wp_terms.term_id` |
| `taxonomy` | varchar(32) | **Type**: `product_cat`, `product_tag`, `category`, `post_tag`, etc. |
| `description` | longtext | Category description |
| `parent` | bigint(20) | Parent category ID (for hierarchical categories) |
| `count` | bigint(20) | Number of products in this category |

**Total Taxonomies**: 5,140

### Common Taxonomy Types:
- **`product_cat`** → Product Categories (WooCommerce)
- **`product_tag`** → Product Tags
- **`pa_*`** → Product Attributes (e.g., `pa_color`, `pa_size`)
- **`category`** → Blog Post Categories
- **`post_tag`** → Blog Post Tags

---

## 📊 Table 3: `wp_term_relationships` - Product ↔ Category Links

**Stores**: Which products belong to which categories

| Column | Type | Description |
|--------|------|-------------|
| `object_id` | bigint(20) | Product/Post ID (from `wp_posts.ID`) |
| `term_taxonomy_id` | bigint(20) | Category ID (from `wp_term_taxonomy.term_taxonomy_id`) |
| `term_order` | int(11) | Display order |

**Total Relationships**: 92,110 links

---

## 🔍 HOW TO GET PRODUCT CATEGORIES

### Get All Product Categories:

```sql
SELECT 
    t.term_id,
    t.name as category_name,
    t.slug as category_slug,
    tt.description,
    tt.parent as parent_category_id,
    tt.count as product_count
FROM wp_terms t
JOIN wp_term_taxonomy tt ON t.term_id = tt.term_id
WHERE tt.taxonomy = 'product_cat'
ORDER BY t.name;
```
2986	Accent/Desk Lamp	accent-desk-lamp		0	39
3805	AccentDesk Lamp	accentdesk-lamp		0	0
227	Accessories	accessories		0	0
3780	Advent Calendar	advent-calendar		0	5
325	Africa	africa		323	0
366	African Food	african-food		168	0
2946	Air Freshener	air-freshener		0	7
3101	Air Humidifier	air-humidifier		0	2
3730	Airpod/Earbud Case - Men's	airpod-earbud-case-mens		0	2
3806	AirpodEarbud Case - Men's	airpodearbud-case-mens		0	0
3735	Alarm Clock	alarm-clock		0	4
451	Alcoholic Beverages	alcoholic-beverages		163	0
3740	Anklet	anklet		0	0
3755	Apron	apron		0	4
1811	Aprons	aprons		0	32
3861	Area Rug	area-rug		0	3
2944	Aromatherapy Bracelet	aromatherapy-bracelet		0	7
3055	Aromatherapy Lotion/Oil	aromatherapy-lotion-oil		0	1
2954	Art Print	art-print		0	2
4053	Art Set - Kids &amp; Baby	art-set-kids-baby		0	1
3933	Artificial Flowers	artificial-flowers		0	6
3863	Artificial Plant	artificial-plant		0	1
3745	Ashtray	ashtray		0	19
324	Asia	asia		323	18
3750	Assorted Cutlery Set	assorted-cutlery-set		0	1
127	Atta &amp; Flours	atta-flours		168	53
### Get Categories for a Specific Product:

```sql
SELECT 
    p.ID as product_id,
    p.post_title as product_name,
    t.term_id,
    t.name as category_name,
    t.slug as category_slug,
    tt.parent as parent_category_id
FROM wp_posts p
JOIN wp_term_relationships tr ON p.ID = tr.object_id
JOIN wp_term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
JOIN wp_terms t ON tt.term_id = t.term_id
WHERE p.post_type = 'product'
  AND tt.taxonomy = 'product_cat'
  AND p.ID = ?; -- Replace ? with product ID
```

### Get All Products in a Category:

```sql
SELECT 
    t.name as category_name,
    p.ID as product_id,
    p.post_title as product_name,
    p.post_status,
    p.post_author as vendor_id
FROM wp_terms t
JOIN wp_term_taxonomy tt ON t.term_id = tt.term_id
JOIN wp_term_relationships tr ON tt.term_taxonomy_id = tr.term_taxonomy_id
JOIN wp_posts p ON tr.object_id = p.ID
WHERE tt.taxonomy = 'product_cat'
  AND t.slug = 'electronics' -- Category slug
  AND p.post_type = 'product'
  AND p.post_status = 'publish';
```

### Get Category Hierarchy (Parent/Child):

```sql
SELECT 
    child.term_id as child_id,
    child.name as child_category,
    child.slug as child_slug,
    parent.term_id as parent_id,
    parent.name as parent_category,
    parent.slug as parent_slug,
    tt_child.count as product_count
FROM wp_terms child
JOIN wp_term_taxonomy tt_child ON child.term_id = tt_child.term_id
LEFT JOIN wp_term_taxonomy tt_parent ON tt_child.parent = tt_parent.term_id
LEFT JOIN wp_terms parent ON tt_parent.term_id = parent.term_id
WHERE tt_child.taxonomy = 'product_cat'
ORDER BY parent.name, child.name;
```

---

## 🏗️ COMPLETE PRODUCT DATA QUERY

### Get Product with All Details (Including Categories):

```sql
SELECT 
    -- Product Info
    p.ID as product_id,
    p.post_title as product_name,
    p.post_content as description,
    p.post_status,
    p.post_author as vendor_id,
    u.user_login as vendor_name,
    
    -- Categories (as comma-separated list)
    GROUP_CONCAT(
        DISTINCT CASE WHEN tt.taxonomy = 'product_cat' 
        THEN t.name END
        SEPARATOR ', '
    ) as categories,
    
    -- Tags
    GROUP_CONCAT(
        DISTINCT CASE WHEN tt.taxonomy = 'product_tag' 
        THEN t.name END
        SEPARATOR ', '
    ) as tags

FROM wp_posts p
LEFT JOIN wp_users u ON p.post_author = u.ID
LEFT JOIN wp_term_relationships tr ON p.ID = tr.object_id
LEFT JOIN wp_term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
LEFT JOIN wp_terms t ON tt.term_id = t.term_id

WHERE p.post_type = 'product'
  AND p.post_status = 'publish'
  AND p.ID = ? -- Replace ? with product ID

GROUP BY p.ID;
```

---

## 🎨 PRODUCT ATTRIBUTES (Color, Size, etc.)

Product attributes are ALSO stored in the same taxonomy system!

### Get Product Attributes:

```sql
SELECT 
    t.name as attribute_value,
    tt.taxonomy,
    REPLACE(tt.taxonomy, 'pa_', '') as attribute_name
FROM wp_posts p
JOIN wp_term_relationships tr ON p.ID = tr.object_id
JOIN wp_term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
JOIN wp_terms t ON tt.term_id = t.term_id
WHERE p.ID = ?
  AND tt.taxonomy LIKE 'pa_%' -- Product attributes start with 'pa_'
  AND p.post_type = 'product';
```

**Examples**:
- `pa_color` → Color attribute
- `pa_size` → Size attribute
- `pa_brand` → Brand attribute

---

## 📋 CATEGORY METADATA

Categories can also have metadata stored in `wp_termmeta`:

```sql
SELECT 
    t.name as category_name,
    tm.meta_key,
    tm.meta_value
FROM wp_terms t
JOIN wp_term_taxonomy tt ON t.term_id = tt.term_id
LEFT JOIN wp_termmeta tm ON t.term_id = tm.term_id
WHERE tt.taxonomy = 'product_cat'
  AND t.term_id = ?; -- Category ID
```

Common meta keys:
- `thumbnail_id` → Category image
- `display_type` → How to display (products, subcategories, both)
- `order` → Custom sort order

---

## 🔗 RELATIONSHIP DIAGRAM

```
┌─────────────┐
│  wp_posts   │ (Products)
│  ID         │
│  post_type  │ = 'product'
└──────┬──────┘
       │
       ↓ (object_id)
┌─────────────────────────┐
│ wp_term_relationships   │ (Links)
│ object_id               │
│ term_taxonomy_id        │
└──────┬──────────────────┘
       │
       ↓ (term_taxonomy_id)
┌─────────────────┐
│ wp_term_taxonomy│ (Types)
│ term_taxonomy_id│
│ term_id         │
│ taxonomy        │ = 'product_cat'
│ parent          │ (category hierarchy)
└──────┬──────────┘
       │
       ↓ (term_id)
┌─────────────┐
│  wp_terms   │ (Names)
│  term_id    │
│  name       │ "Electronics"
│  slug       │ "electronics"
└─────────────┘
```

---

## 💡 KEY POINTS

1. **Categories = Terms with taxonomy='product_cat'**
2. **Tags = Terms with taxonomy='product_tag'**
3. **Attributes = Terms with taxonomy='pa_*'**
4. **One product can have MULTIPLE categories**
5. **Categories can have PARENT categories** (hierarchical)
6. **The `count` column shows how many products in each category**

---

## 🎯 PRACTICAL EXAMPLES

### Example 1: Get Top 10 Most Popular Categories

```sql
SELECT 
    t.name,
    t.slug,
    tt.count as product_count
FROM wp_terms t
JOIN wp_term_taxonomy tt ON t.term_id = tt.term_id
WHERE tt.taxonomy = 'product_cat'
ORDER BY tt.count DESC
LIMIT 10;
```

### Example 2: Get Vendor's Categories

```sql
SELECT DISTINCT
    t.name as category_name,
    t.slug,
    COUNT(p.ID) as vendor_product_count
FROM wp_users u
JOIN wp_posts p ON u.ID = p.post_author
JOIN wp_term_relationships tr ON p.ID = tr.object_id
JOIN wp_term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
JOIN wp_terms t ON tt.term_id = t.term_id
WHERE u.ID = ? -- Vendor user ID
  AND p.post_type = 'product'
  AND tt.taxonomy = 'product_cat'
  AND p.post_status = 'publish'
GROUP BY t.term_id
ORDER BY vendor_product_count DESC;
```

### Example 3: Category with Parent Info

```sql
SELECT 
    child.name as category,
    child.slug,
    parent.name as parent_category,
    tt_child.count as products,
    tt_child.description
FROM wp_terms child
JOIN wp_term_taxonomy tt_child ON child.term_id = tt_child.term_id
LEFT JOIN wp_terms parent ON tt_child.parent = parent.term_id
WHERE tt_child.taxonomy = 'product_cat'
ORDER BY parent.name, child.name;
```

---

## ✅ SUMMARY

**Categories Location**: 
- **Names**: `wp_terms` table
- **Type Info**: `wp_term_taxonomy` table (where taxonomy='product_cat')
- **Product Links**: `wp_term_relationships` table

**To get everything**: Join all 3 tables + `wp_posts` for products!
