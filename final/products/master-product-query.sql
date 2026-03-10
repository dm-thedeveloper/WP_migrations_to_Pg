-- =====================================================
-- MASTER PRODUCT QUERY WITH ALL DETAILS
-- Fetches products with all metadata, categories, images, and attributes
-- =====================================================

SELECT 
    -- ========== PRODUCT CORE INFO ==========
    p.ID as product_id,
    p.post_title as title,
    p.post_content as description,
    p.post_excerpt as short_description,
    p.post_status as product_status,
    p.post_author as vendor_id,
    p.post_date as created_at,
    p.post_modified as updated_at,
    
    -- ========== VENDOR INFO ==========
    u.user_login as vendor_username,
    u.user_email as vendor_email,
    u.display_name as vendor_display_name,
    
    -- ========== PRODUCT METADATA (from wp_postmeta) ==========
    MAX(CASE WHEN pm.meta_key = '_sku' THEN pm.meta_value END) as sku,
    MAX(CASE WHEN pm.meta_key = '_regular_price' THEN pm.meta_value END) as mrsp,
    MAX(CASE WHEN pm.meta_key = '_sale_price' THEN pm.meta_value END) as discounted_price,
    MAX(CASE WHEN pm.meta_key = '_price' THEN pm.meta_value END) as current_price,
    MAX(CASE WHEN pm.meta_key = '_sale_price_dates_from' THEN pm.meta_value END) as sale_from,
    MAX(CASE WHEN pm.meta_key = '_sale_price_dates_to' THEN pm.meta_value END) as sale_to,
    
    -- ========== STOCK INFO ==========
    MAX(CASE WHEN pm.meta_key = '_stock_status' THEN pm.meta_value END) as stock_status,
    MAX(CASE WHEN pm.meta_key = '_stock' THEN pm.meta_value END) as stock_quantity,
    MAX(CASE WHEN pm.meta_key = '_manage_stock' THEN pm.meta_value END) as manage_stock,
    MAX(CASE WHEN pm.meta_key = '_backorders' THEN pm.meta_value END) as backorders,
    MAX(CASE WHEN pm.meta_key = '_low_stock_amount' THEN pm.meta_value END) as low_stock_threshold,
    
    -- ========== PRODUCT TYPE & ATTRIBUTES ==========
    MAX(CASE WHEN pm.meta_key = '_product_attributes' THEN pm.meta_value END) as product_attributes,
    MAX(CASE WHEN pm.meta_key = '_default_attributes' THEN pm.meta_value END) as default_attributes,
    
    -- ========== SHIPPING & DIMENSIONS ==========
    MAX(CASE WHEN pm.meta_key = '_weight' THEN pm.meta_value END) as weight,
    MAX(CASE WHEN pm.meta_key = '_length' THEN pm.meta_value END) as length,
    MAX(CASE WHEN pm.meta_key = '_width' THEN pm.meta_value END) as width,
    MAX(CASE WHEN pm.meta_key = '_height' THEN pm.meta_value END) as height,
    MAX(CASE WHEN pm.meta_key = '_shipping_class' THEN pm.meta_value END) as shipping_class,
    
    -- ========== TAX INFO ==========
    MAX(CASE WHEN pm.meta_key = '_tax_status' THEN pm.meta_value END) as tax_status,
    MAX(CASE WHEN pm.meta_key = '_tax_class' THEN pm.meta_value END) as tax_class,
    
    -- ========== IMAGES ==========
    MAX(CASE WHEN pm.meta_key = '_thumbnail_id' THEN pm.meta_value END) as featured_image_id,
    MAX(CASE WHEN pm.meta_key = '_product_image_gallery' THEN pm.meta_value END) as gallery_image_ids,
    
    -- Get featured image URL
    (SELECT guid FROM wp_posts WHERE ID = MAX(CASE WHEN pm.meta_key = '_thumbnail_id' THEN pm.meta_value END) AND post_type = 'attachment') as featured_image_url,
    
    -- ========== PRODUCT FLAGS ==========
    MAX(CASE WHEN pm.meta_key = '_virtual' THEN pm.meta_value END) as is_virtual,
    MAX(CASE WHEN pm.meta_key = '_downloadable' THEN pm.meta_value END) as is_downloadable,
    MAX(CASE WHEN pm.meta_key = '_sold_individually' THEN pm.meta_value END) as limit_one_per_order,
    
    -- ========== REVIEWS ==========
    MAX(CASE WHEN pm.meta_key = '_wc_review_count' THEN pm.meta_value END) as review_count,
    MAX(CASE WHEN pm.meta_key = '_wc_average_rating' THEN pm.meta_value END) as average_rating,
    
    -- ========== CUSTOM FIELDS (Dokan/WooCommerce specific) ==========
    MAX(CASE WHEN pm.meta_key = '_min_quantity' THEN pm.meta_value END) as minimum_order_quantity,
    MAX(CASE WHEN pm.meta_key = '_wholesale_price' THEN pm.meta_value END) as wholesale_price,
    MAX(CASE WHEN pm.meta_key = 'gtin' THEN pm.meta_value END) as gtin,
    MAX(CASE WHEN pm.meta_key = '_country_of_origin' THEN pm.meta_value END) as country,
    MAX(CASE WHEN pm.meta_key = '_vat_rate' THEN pm.meta_value END) as vat_rate,
    MAX(CASE WHEN pm.meta_key = '_tariff_code' THEN pm.meta_value END) as tariff_code,
    
    -- ========== DOKAN SPECIFIC ==========
    MAX(CASE WHEN pm.meta_key = '_is_dokan_product' THEN pm.meta_value END) as is_dokan_product,
    MAX(CASE WHEN pm.meta_key = '_dokan_geolocation_use_store_settings' THEN pm.meta_value END) as use_store_location,
    
    -- ========== CATEGORIES (comma-separated) ==========
    GROUP_CONCAT(
        DISTINCT CASE 
            WHEN tt.taxonomy = 'product_cat' 
            THEN CONCAT(t.term_id, ':', t.name)
        END 
        SEPARATOR '||'
    ) as categories,
    
    -- ========== TAGS (comma-separated) ==========
    GROUP_CONCAT(
        DISTINCT CASE 
            WHEN tt.taxonomy = 'product_tag' 
            THEN t.name
        END 
        SEPARATOR ','
    ) as tags,
    
    -- ========== ATTRIBUTES (all pa_* taxonomies) ==========
    GROUP_CONCAT(
        DISTINCT CASE 
            WHEN tt.taxonomy LIKE 'pa_%' 
            THEN CONCAT(REPLACE(tt.taxonomy, 'pa_', ''), ':', t.name)
        END 
        SEPARATOR '||'
    ) as attributes

FROM wp_posts p

-- Join vendor/author
LEFT JOIN wp_users u ON p.post_author = u.ID

-- Join product metadata
LEFT JOIN wp_postmeta pm ON p.ID = pm.post_id

-- Join taxonomies (categories, tags, attributes)
LEFT JOIN wp_term_relationships tr ON p.ID = tr.object_id
LEFT JOIN wp_term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
LEFT JOIN wp_terms t ON tt.term_id = t.term_id

WHERE p.post_type = 'product'
  AND p.post_status IN ('publish', 'draft', 'pending')

GROUP BY p.ID, u.user_login, u.user_email, u.display_name
ORDER BY p.ID;


-- =====================================================
-- ALTERNATIVE: GET GALLERY IMAGES AS ARRAY
-- =====================================================
-- Use this query to get gallery images as separate rows:

SELECT 

    p.ID as product_id,
    p.post_title as product_name,
    
    -- Featured image
    img_featured.guid as featured_image,
    
    -- Gallery images (comma-separated IDs in postmeta)
    pm_gallery.meta_value as gallery_ids
    
FROM wp_posts p

LEFT JOIN wp_postmeta pm_featured 
    ON p.ID = pm_featured.post_id 
    AND pm_featured.meta_key = '_thumbnail_id'
    
LEFT JOIN wp_posts img_featured 
    ON pm_featured.meta_value = img_featured.ID 
    AND img_featured.post_type = 'attachment'

LEFT JOIN wp_postmeta pm_gallery 
    ON p.ID = pm_gallery.post_id 
    AND pm_gallery.meta_key = '_product_image_gallery'

WHERE p.post_type = 'product'
  AND p.post_status = 'publish';


-- =====================================================
-- GET PRODUCT WITH EXPANDED GALLERY IMAGES
-- =====================================================
-- This expands gallery_image_ids to separate URLs

SELECT 
    p.ID as product_id,
    p.post_title,
    
    -- Featured image
    feat_img.guid as featured_image,
    
    -- Gallery image
    gallery_img.guid as gallery_image,
    gallery_img.ID as gallery_image_id
    
FROM wp_posts p

-- Get gallery IDs from postmeta
LEFT JOIN wp_postmeta pm_gallery 
    ON p.ID = pm_gallery.post_id 
    AND pm_gallery.meta_key = '_product_image_gallery'

-- Featured image
LEFT JOIN wp_postmeta pm_feat 
    ON p.ID = pm_feat.post_id 
    AND pm_feat.meta_key = '_thumbnail_id'
LEFT JOIN wp_posts feat_img 
    ON pm_feat.meta_value = feat_img.ID
    
-- Gallery images (need to parse comma-separated IDs)
LEFT JOIN wp_posts gallery_img 
    ON FIND_IN_SET(gallery_img.ID, pm_gallery.meta_value) > 0
    AND gallery_img.post_type = 'attachment'

WHERE p.post_type = 'product'
  AND p.post_status = 'publish'
ORDER BY p.ID, gallery_img.ID;


-- =====================================================
-- GET PRODUCT ATTRIBUTES (pa_* taxonomies)
-- =====================================================

SELECT 
    p.ID as product_id,
    p.post_title as product_name,
    
    -- Attribute name (e.g., color, size)
    REPLACE(tt.taxonomy, 'pa_', '') as attribute_name,
    
    -- Attribute value (e.g., Red, Large)
    t.name as attribute_value,
    t.slug as attribute_slug,
    
    tt.taxonomy as full_taxonomy

FROM wp_posts p
JOIN wp_term_relationships tr ON p.ID = tr.object_id
JOIN wp_term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
JOIN wp_terms t ON tt.term_id = t.term_id

WHERE p.post_type = 'product'
  AND tt.taxonomy LIKE 'pa_%'
  AND p.post_status = 'publish'

ORDER BY p.ID, tt.taxonomy, t.name;


-- =====================================================
-- COMPACT VERSION: Essential product data only
-- =====================================================

SELECT 
    p.ID as id,
    p.post_title as title,
    p.post_content as description,
    p.post_author as vendor_id,
    p.post_status as status,
    
    MAX(CASE WHEN pm.meta_key = '_sku' THEN pm.meta_value END) as sku,
    MAX(CASE WHEN pm.meta_key = '_regular_price' THEN pm.meta_value END) as mrsp,
    MAX(CASE WHEN pm.meta_key = '_sale_price' THEN pm.meta_value END) as discounted_price,
    MAX(CASE WHEN pm.meta_key = '_stock' THEN pm.meta_value END) as stock_quantity,
    MAX(CASE WHEN pm.meta_key = '_stock_status' THEN pm.meta_value END) as stock_status,
    
    -- Images
    MAX(CASE WHEN pm.meta_key = '_thumbnail_id' THEN pm.meta_value END) as featured_image_id,
    MAX(CASE WHEN pm.meta_key = '_product_image_gallery' THEN pm.meta_value END) as gallery_ids,
    
    -- Categories
    GROUP_CONCAT(
        DISTINCT CASE WHEN tt.taxonomy = 'product_cat' 
        THEN t.term_id END
    ) as category_ids

FROM wp_posts p
LEFT JOIN wp_postmeta pm ON p.ID = pm.post_id
LEFT JOIN wp_term_relationships tr ON p.ID = tr.object_id
LEFT JOIN wp_term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
LEFT JOIN wp_terms t ON tt.term_id = t.term_id

WHERE p.post_type = 'product'
  AND p.post_status = 'publish'

GROUP BY p.ID
ORDER BY p.ID;
