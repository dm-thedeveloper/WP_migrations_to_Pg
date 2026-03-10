-- WordPress to PostgreSQL User Migration SQL Script
-- 
-- This script provides SQL-based migration as an alternative to TypeScript
-- Useful for direct database migration or understanding the data transformation
--
-- ⚠️ WARNING: This assumes both databases are accessible from the same SQL client
-- For remote migration, use the TypeScript scripts instead

-- ==============================================================================
-- PREPARATION
-- ==============================================================================

-- 1. Install foreign data wrapper (PostgreSQL only)
-- CREATE EXTENSION IF NOT EXISTS mysql_fdw;

-- 2. Create server connection to WordPress MySQL
-- CREATE SERVER wordpress_mysql
--   FOREIGN DATA WRAPPER mysql_fdw
--   OPTIONS (host 'localhost', port '3306');

-- 3. Create user mapping
-- CREATE USER MAPPING FOR CURRENT_USER
--   SERVER wordpress_mysql
--   OPTIONS (username 'wp_user', password 'wp_password');

-- 4. Import foreign schema
-- IMPORT FOREIGN SCHEMA wordpress_db
--   LIMIT TO (wp_users, wp_usermeta)
--   FROM SERVER wordpress_mysql
--   INTO public;

-- ==============================================================================
-- MIGRATION QUERIES
-- ==============================================================================

-- View WordPress users ready for migration
-- (Excludes spam and deleted users)
SELECT 
    ID as wp_id,
    user_login,
    user_email,
    user_nicename,
    user_registered,
    display_name,
    user_status,
    spam,
    deleted
FROM wp_users
WHERE deleted = 0 
  AND spam = 0
ORDER BY ID;

-- ==============================================================================
-- Extract user metadata for a specific user
-- ==============================================================================
SELECT 
    user_id,
    meta_key,
    meta_value
FROM wp_usermeta
WHERE user_id = 1  -- Replace with actual user ID
  AND meta_key IN (
    'first_name',
    'last_name',
    'billing_phone',
    'phone',
    'profile_picture',
    'avatar',
    'wp_capabilities'
  );

-- ==============================================================================
-- MIGRATION LOGIC (Conceptual - requires adaptation)
-- ==============================================================================

-- This is a conceptual example. Direct cross-database INSERT is complex.
-- Use the TypeScript migration scripts for production.

/*
-- Example migration pattern (pseudo-SQL):

INSERT INTO "User" (
    name,
    email,
    password,
    "userName",
    "firstName",
    "lastName",
    phone,
    "profilePicture",
    role,
    "isVerified",
    "isActive",
    "authProvider",
    "createdAt"
)
SELECT 
    wp.user_login as name,
    wp.user_email as email,
    wp.user_pass as password,
    wp.user_nicename as "userName",
    (SELECT meta_value FROM wp_usermeta 
     WHERE user_id = wp.ID AND meta_key = 'first_name' LIMIT 1) as "firstName",
    (SELECT meta_value FROM wp_usermeta 
     WHERE user_id = wp.ID AND meta_key = 'last_name' LIMIT 1) as "lastName",
    (SELECT meta_value FROM wp_usermeta 
     WHERE user_id = wp.ID AND meta_key IN ('billing_phone', 'phone') LIMIT 1) as phone,
    (SELECT meta_value FROM wp_usermeta 
     WHERE user_id = wp.ID AND meta_key IN ('profile_picture', 'avatar') LIMIT 1) as "profilePicture",
    CASE 
        WHEN (SELECT meta_value FROM wp_usermeta 
              WHERE user_id = wp.ID AND meta_key = 'wp_capabilities') LIKE '%administrator%' 
        THEN 'ADMIN'::Role
        WHEN (SELECT meta_value FROM wp_usermeta 
              WHERE user_id = wp.ID AND meta_key = 'wp_capabilities') LIKE '%vendor%' 
        THEN 'VENDOR'::Role
        ELSE 'BUYER'::Role
    END as role,
    (wp.user_status = 0) as "isVerified",
    true as "isActive",
    'wordpress' as "authProvider",
    wp.user_registered as "createdAt"
FROM wp_users wp
WHERE wp.deleted = 0 
  AND wp.spam = 0
  AND NOT EXISTS (
    SELECT 1 FROM "User" 
    WHERE email = wp.user_email
  );
*/

-- ==============================================================================
-- VERIFICATION QUERIES
-- ==============================================================================

-- Count users by source
SELECT 
    'WordPress' as source,
    COUNT(*) as total_users,
    SUM(CASE WHEN deleted = 0 AND spam = 0 THEN 1 ELSE 0 END) as active_users
FROM wp_users
UNION ALL
SELECT 
    'PostgreSQL' as source,
    COUNT(*) as total_users,
    SUM(CASE WHEN "isActive" = true THEN 1 ELSE 0 END) as active_users
FROM "User"
WHERE "authProvider" = 'wordpress';

-- Compare email counts
SELECT 
    'WordPress' as source,
    COUNT(DISTINCT user_email) as unique_emails
FROM wp_users
WHERE deleted = 0 AND spam = 0
UNION ALL
SELECT 
    'PostgreSQL' as source,
    COUNT(DISTINCT email) as unique_emails
FROM "User"
WHERE "authProvider" = 'wordpress';

-- Find WordPress users not yet migrated
SELECT 
    wp.ID,
    wp.user_login,
    wp.user_email,
    wp.user_registered
FROM wp_users wp
WHERE wp.deleted = 0 
  AND wp.spam = 0
  AND NOT EXISTS (
    SELECT 1 
    FROM "User" 
    WHERE email = wp.user_email
  )
ORDER BY wp.ID;

-- Verify migrated users
SELECT 
    id,
    name,
    email,
    role,
    "isVerified",
    "isActive",
    "authProvider",
    "createdAt"
FROM "User"
WHERE "authProvider" = 'wordpress'
ORDER BY id
LIMIT 10;

-- ==============================================================================
-- USER METADATA ANALYSIS
-- ==============================================================================

-- Most common meta keys in WordPress
SELECT 
    meta_key,
    COUNT(*) as usage_count
FROM wp_usermeta
GROUP BY meta_key
ORDER BY usage_count DESC
LIMIT 20;

-- User meta values for reference
SELECT 
    u.user_login,
    um.meta_key,
    CASE 
        WHEN LENGTH(um.meta_value) > 50 
        THEN LEFT(um.meta_value, 50) || '...'
        ELSE um.meta_value
    END as meta_value_preview
FROM wp_users u
INNER JOIN wp_usermeta um ON u.ID = um.user_id
WHERE u.ID IN (1, 2, 3)  -- Sample user IDs
  AND um.meta_key IN (
    'first_name', 'last_name', 'billing_phone', 
    'phone', 'wp_capabilities'
  )
ORDER BY u.ID, um.meta_key;

-- ==============================================================================
-- POST-MIGRATION CLEANUP (Optional)
-- ==============================================================================

-- Remove duplicate users (keep first occurrence)
/*
WITH duplicates AS (
    SELECT 
        id,
        email,
        ROW_NUMBER() OVER (PARTITION BY email ORDER BY id) as rn
    FROM "User"
    WHERE "authProvider" = 'wordpress'
)
DELETE FROM "User"
WHERE id IN (
    SELECT id FROM duplicates WHERE rn > 1
);
*/

-- Update user statistics
/*
UPDATE "User"
SET "updatedAt" = NOW()
WHERE "authProvider" = 'wordpress'
  AND "updatedAt" = "createdAt";
*/

-- ==============================================================================
-- NOTES
-- ==============================================================================

-- This SQL script is for reference and analysis purposes.
-- For actual migration, use the TypeScript migration scripts which handle:
--   - Connection management
--   - Error handling
--   - Transaction safety
--   - Progress logging
--   - Duplicate prevention
--
-- The TypeScript scripts (migrate-wordpress-users.ts or migrate-users-simple.ts)
-- provide a more robust and maintainable solution.

-- ==============================================================================
-- PASSWORD MIGRATION CONSIDERATION
-- ==============================================================================

-- WordPress passwords use phpass hashing (starting with $P$ or $H$)
-- These cannot be directly used with bcrypt/argon2
-- 
-- Options:
-- 1. Keep WP hashes, verify on login, upgrade to bcrypt when valid
-- 2. Force password reset for all migrated users
-- 3. Generate random passwords and email users
--
-- See password-migration-helper.ts for implementation details
