-- =====================================================
-- COMPREHENSIVE PRODUCT TEST QUERY
-- Test this in DBeaver first to verify data structure
-- SIMPLIFIED VERSION to avoid temp table overflow
-- =====================================================

-- =====================================================
-- QUERY 1: BASIC PRODUCT DATA (No heavy JOINs)
-- Run this first to test basic product fetch
-- =====================================================

SELECT 
    p.ID as product_id,
    p.post_title as title,
    p.post_author as vendor_id,
    p.post_status,
    p.post_date as created_at,
    p.comment_status
FROM wp_posts p
WHERE p.post_type = 'product'
  AND p.post_status IN ('publish', 'draft', 'pending', 'private')
ORDER BY p.ID
LIMIT 100;


-- =====================================================
-- QUERY 2: PRODUCT WITH METADATA (Lighter version)
-- =====================================================

SELECT 
    p.ID as product_id,
    p.post_title as title,
    p.post_author as vendor_id,
    p.post_status,
    
    MAX(CASE WHEN pm.meta_key = '_sku' THEN pm.meta_value END) as sku,
    MAX(CASE WHEN pm.meta_key = '_price' THEN pm.meta_value END) as mrsp,
    MAX(CASE WHEN pm.meta_key = '_sale_price' THEN pm.meta_value END) as discounted_price,
    MAX(CASE WHEN pm.meta_key = '_stock_status' THEN pm.meta_value END) as stock_status,
    MAX(CASE WHEN pm.meta_key = '_thumbnail_id' THEN pm.meta_value END) as featured_image_id,
    MAX(CASE WHEN pm.meta_key = '_product_image_gallery' THEN pm.meta_value END) as gallery_image_ids

FROM wp_posts p
LEFT JOIN wp_postmeta pm ON p.ID = pm.post_id

WHERE p.post_type = 'product'
  AND p.post_status IN ('publish', 'draft', 'pending', 'private')

GROUP BY p.ID, p.post_title, p.post_author, p.post_status
ORDER BY p.ID
LIMIT 100;


-- =====================================================
-- QUERY 3: FULL PRODUCT DATA (Use for small batches)
-- Add LIMIT and OFFSET for pagination
-- =====================================================

SELECT 
    p.ID as product_id,
    p.post_title as title,
    LEFT(p.post_content, 500) as description,  -- Truncate for testing
    p.post_excerpt as short_description,
    p.post_author as vendor_id,
    p.post_date as created_at,
    p.post_modified as updated_at,
    p.post_status,
    p.comment_status,
    
    -- Basic metadata
    MAX(CASE WHEN pm.meta_key = '_sku' THEN pm.meta_value END) as sku,
    MAX(CASE WHEN pm.meta_key = '_price' THEN pm.meta_value END) as mrsp,
    MAX(CASE WHEN pm.meta_key = '_sale_price' THEN pm.meta_value END) as discounted_price,
    MAX(CASE WHEN pm.meta_key = '_stock_status' THEN pm.meta_value END) as stock_status,
    MAX(CASE WHEN pm.meta_key = '_stock' THEN pm.meta_value END) as stock_quantity,
    
    -- Images
    MAX(CASE WHEN pm.meta_key = '_thumbnail_id' THEN pm.meta_value END) as featured_image_id,
    MAX(CASE WHEN pm.meta_key = '_product_image_gallery' THEN pm.meta_value END) as gallery_image_ids,
    
    -- Wholesale
    MAX(CASE WHEN pm.meta_key = '_dokan_wholesale_meta' THEN pm.meta_value END) as wholesale_meta,
    
    -- Other
    MAX(CASE WHEN pm.meta_key = '_weight' THEN pm.meta_value END) as weight,
    MAX(CASE WHEN pm.meta_key = 'min_quantity' THEN pm.meta_value END) as min_qty,
    MAX(CASE WHEN pm.meta_key = '_wc_average_rating' THEN pm.meta_value END) as rating,
    MAX(CASE WHEN pm.meta_key = '_tax_class' THEN pm.meta_value END) as tax_class

FROM wp_posts p
LEFT JOIN wp_postmeta pm ON p.ID = pm.post_id

WHERE p.post_type = 'product'
  AND p.post_status IN ('publish', 'draft', 'pending', 'private')

GROUP BY p.ID, p.post_title, p.post_content, p.post_excerpt, 
         p.post_author, p.post_date, p.post_modified, p.post_status, p.comment_status

ORDER BY p.ID
LIMIT 50 OFFSET 0;  -- Change OFFSET for pagination: 0, 50, 100, etc.


-- =====================================================
-- QUERY 4: GET CATEGORIES FOR A PRODUCT (Separate query)
-- Run this for specific product IDs
-- =====================================================

SELECT 
    tr.object_id as product_id,
    t.term_id as category_id,
    t.name as category_name
FROM wp_term_relationships tr
JOIN wp_term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
JOIN wp_terms t ON tt.term_id = t.term_id
WHERE tt.taxonomy = 'product_cat'
  AND tr.object_id IN (
      SELECT ID FROM wp_posts 
      WHERE post_type = 'product' 
      LIMIT 100
  )
ORDER BY tr.object_id;


-- =====================================================
-- QUERY 5: GET TAGS FOR PRODUCTS (Separate query)
-- =====================================================

SELECT 
    tr.object_id as product_id,
    t.name as tag_name
FROM wp_term_relationships tr
JOIN wp_term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
JOIN wp_terms t ON tt.term_id = t.term_id
WHERE tt.taxonomy = 'product_tag'
  AND tr.object_id IN (
      SELECT ID FROM wp_posts 
      WHERE post_type = 'product' 
      LIMIT 100
  );


-- =====================================================
-- QUERY 6: GET IMAGE URLS (Separate query)
-- =====================================================

SELECT 
    pm.post_id as product_id,
    pm.meta_value as image_id,
    img.guid as image_url
FROM wp_postmeta pm
JOIN wp_posts p ON pm.post_id = p.ID
JOIN wp_posts img ON pm.meta_value = img.ID
WHERE pm.meta_key = '_thumbnail_id'
  AND p.post_type = 'product'
  AND img.post_type = 'attachment'
LIMIT 100;


-- =====================================================
-- QUERY 7: PRODUCT COUNT
-- =====================================================

SELECT 
    post_status,
    COUNT(*) as count
FROM wp_posts 
WHERE post_type = 'product'
GROUP BY post_status;


-- =====================================================
-- QUERY TO GET GALLERY IMAGES AS ARRAY
-- Test this separately to verify image fetching
-- =====================================================

SELECT 
    p.ID as product_id,
    p.post_title,
    
    -- Featured image
    feat_img.guid as featured_image,
    pm_feat.meta_value as featured_image_id,
    
    -- Gallery images (comma-separated IDs)
    pm_gallery.meta_value as gallery_ids,
    
    -- Gallery image URL (if using FIND_IN_SET - only works in MySQL)
    gallery_img.guid as gallery_image_url,
    gallery_img.ID as gallery_image_id

FROM wp_posts p

-- Featured image
LEFT JOIN wp_postmeta pm_feat 
    ON p.ID = pm_feat.post_id 
    AND pm_feat.meta_key = '_thumbnail_id'
LEFT JOIN wp_posts feat_img 
    ON pm_feat.meta_value = feat_img.ID
    AND feat_img.post_type = 'attachment'

-- Gallery images
LEFT JOIN wp_postmeta pm_gallery 
    ON p.ID = pm_gallery.post_id 
    AND pm_gallery.meta_key = '_product_image_gallery'
    
-- Expand gallery (only works if gallery_ids is not null)
LEFT JOIN wp_posts gallery_img 
    ON FIND_IN_SET(gallery_img.ID, pm_gallery.meta_value) > 0
    AND gallery_img.post_type = 'attachment'

WHERE p.post_type = 'product'
  AND p.post_status = 'publish'
ORDER BY p.ID, gallery_img.ID
LIMIT 20;


-- =====================================================
-- QUERY TO GET PRODUCT VARIATIONS
-- Products with product_type = 'product_variation'
-- =====================================================

SELECT 
    p.ID as variation_id,
    p.post_parent as parent_product_id,
    p.post_title as variation_title,
    p.post_excerpt as variation_attributes, -- e.g., "color: Bronze, Size: XS"
    p.post_status,
    
    -- Variation metadata
    MAX(CASE WHEN pm.meta_key = '_sku' THEN pm.meta_value END) as sku,
    MAX(CASE WHEN pm.meta_key = '_price' THEN pm.meta_value END) as price,
    MAX(CASE WHEN pm.meta_key = '_stock' THEN pm.meta_value END) as stock,
    MAX(CASE WHEN pm.meta_key = '_stock_status' THEN pm.meta_value END) as stock_status

FROM wp_posts p
LEFT JOIN wp_postmeta pm ON p.ID = pm.post_id

WHERE p.post_type = 'product_variation'

GROUP BY p.ID, p.post_parent, p.post_title, p.post_excerpt, p.post_status
ORDER BY p.post_parent, p.ID
LIMIT 20;


-- =====================================================
-- CHECK VENDOR EXISTS
-- Verify all product vendors exist in User table
-- =====================================================

SELECT 
    p.post_author as vendor_id,
    u.user_login as vendor_username,
    u.user_email as vendor_email,
    COUNT(p.ID) as product_count
FROM wp_posts p
LEFT JOIN wp_users u ON p.post_author = u.ID
WHERE p.post_type = 'product'
GROUP BY p.post_author, u.user_login, u.user_email
ORDER BY product_count DESC;


-- =====================================================
-- PRODUCT COUNT SUMMARY
-- =====================================================

SELECT 'Total Products' as metric, COUNT(*) as count
FROM wp_posts WHERE post_type = 'product'
UNION ALL
SELECT 'Published Products', COUNT(*)
FROM wp_posts WHERE post_type = 'product' AND post_status = 'publish'
UNION ALL
SELECT 'Draft Products', COUNT(*)
FROM wp_posts WHERE post_type = 'product' AND post_status = 'draft'
UNION ALL
SELECT 'Pending Products', COUNT(*)
FROM wp_posts WHERE post_type = 'product' AND post_status = 'pending'
UNION ALL
SELECT 'Private Products', COUNT(*)
FROM wp_posts WHERE post_type = 'product' AND post_status = 'private'
UNION ALL
SELECT 'Product Variations', COUNT(*)
FROM wp_posts WHERE post_type = 'product_variation';


-- =====================================================
-- WHOLESALE META SAMPLES
-- Shows PHP serialized wholesale data
-- =====================================================

SELECT 
    p.ID,
    p.post_title,
    pm.meta_value as wholesale_meta_raw
FROM wp_posts p
JOIN wp_postmeta pm ON p.ID = pm.post_id
WHERE pm.meta_key = '_dokan_wholesale_meta'
  AND pm.meta_value IS NOT NULL
  AND pm.meta_value != ''
  AND p.post_type = 'product'
LIMIT 20;

-- =====================================================
-- GEO LOCATION DATA
-- Products with location info
-- =====================================================

SELECT 
    p.ID,
    p.post_title,
    MAX(CASE WHEN pm.meta_key = 'dokan_geo_address' THEN pm.meta_value END) as geo_address,
    MAX(CASE WHEN pm.meta_key = 'dokan_geo_latitude' THEN pm.meta_value END) as geo_lat,
    MAX(CASE WHEN pm.meta_key = 'dokan_geo_longitude' THEN pm.meta_value END) as geo_lng
FROM wp_posts p
JOIN wp_postmeta pm ON p.ID = pm.post_id
WHERE p.post_type = 'product'
  AND pm.meta_key IN ('dokan_geo_address', 'dokan_geo_latitude', 'dokan_geo_longitude')
GROUP BY p.ID, p.post_title
HAVING MAX(CASE WHEN pm.meta_key = 'dokan_geo_address' THEN pm.meta_value END) IS NOT NULL
LIMIT 20;


-- =====================================================
-- WC PRODUCT META LOOKUP
-- Data from wp_wc_product_meta_lookup table
-- =====================================================

SELECT 
    wc.product_id,
    p.post_title,
    wc.sku,
    wc.min_price,
    wc.max_price,
    wc.onsale,
    wc.stock_quantity,
    wc.stock_status,
    wc.total_sales,
    wc.tax_class
FROM wp_wc_product_meta_lookup wc
JOIN wp_posts p ON wc.product_id = p.ID
WHERE p.post_type = 'product'
LIMIT 50;


-- =====================================================
-- PRODUCT ATTRIBUTES LOOKUP
-- Shows all product attributes (colors, sizes, etc.)
-- =====================================================

SELECT 
    pal.product_id,
    p.post_title,
    pal.taxonomy,
    REPLACE(pal.taxonomy, 'pa_', '') as attribute_type,
    pal.term_id,
    t.name as attribute_value
FROM wp_wc_product_attributes_lookup pal
JOIN wp_posts p ON pal.product_id = p.ID
JOIN wp_terms t ON pal.term_id = t.term_id
WHERE p.post_type = 'product'
ORDER BY pal.product_id, pal.taxonomy
LIMIT 100;


-- =====================================================
-- CATEGORY DISTRIBUTION
-- Most popular product categories
-- =====================================================

SELECT 
    t.term_id,
    t.name as category_name,
    COUNT(tr.object_id) as product_count
FROM wp_terms t
JOIN wp_term_taxonomy tt ON t.term_id = tt.term_id
JOIN wp_term_relationships tr ON tt.term_taxonomy_id = tr.term_taxonomy_id
JOIN wp_posts p ON tr.object_id = p.ID
WHERE tt.taxonomy = 'product_cat'
  AND p.post_type = 'product'
  AND p.post_status IN ('publish', 'draft', 'pending', 'private')
GROUP BY t.term_id, t.name
ORDER BY product_count DESC
LIMIT 30;


-- =====================================================
-- POST VIEWS AND SALES
-- Products with view and sales data
-- =====================================================

SELECT 
    p.ID,
    p.post_title,
    MAX(CASE WHEN pm.meta_key = 'post_views_count' THEN pm.meta_value END) as views,
    MAX(CASE WHEN pm.meta_key = 'total_sales' THEN pm.meta_value END) as sales_meta,
    wc.total_sales as wc_sales
FROM wp_posts p
LEFT JOIN wp_postmeta pm ON p.ID = pm.post_id
LEFT JOIN wp_wc_product_meta_lookup wc ON p.ID = wc.product_id
WHERE p.post_type = 'product'
GROUP BY p.ID, p.post_title, wc.total_sales
ORDER BY CAST(MAX(CASE WHEN pm.meta_key = 'post_views_count' THEN pm.meta_value END) AS UNSIGNED) DESC
LIMIT 30;
