-- PostgreSQL Table Creation for WordPress User Migration
-- Run this on your AWS PostgreSQL database BEFORE migration

-- Create User table
CREATE TABLE IF NOT EXISTS "User" (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255),
    "userName" VARCHAR(255),
    "firstName" VARCHAR(255),
    "lastName" VARCHAR(255),
    phone VARCHAR(50),
    "profilePicture" TEXT,
    role VARCHAR(50) NOT NULL DEFAULT 'BUYER',
    "isVerified" BOOLEAN DEFAULT false,
    "isActive" BOOLEAN DEFAULT true,
    "isApprovalRequired" BOOLEAN DEFAULT false,
    "authProvider" VARCHAR(50) DEFAULT 'local',
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_email ON "User"(email);
CREATE INDEX IF NOT EXISTS idx_user_role ON "User"(role);
CREATE INDEX IF NOT EXISTS idx_user_auth_provider ON "User"("authProvider");

-- Verify table creation
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'User'
ORDER BY ordinal_position;

-- Check if table is ready
SELECT COUNT(*) as existing_users FROM "User";

COMMENT ON TABLE "User" IS 'User accounts migrated from WordPress';
COMMENT ON COLUMN "User".role IS 'Valid values: BUYER, VENDOR, ADMIN, SUB_ADMIN';
COMMENT ON COLUMN "User"."authProvider" IS 'Authentication provider (wordpress, local, google, etc.)';
