-- Create User, Address, and Store tables based on Prisma schema
-- Run this on your AWS PostgreSQL database BEFORE running the migration

-- ============================================
-- 1. CREATE ENUM TYPES
-- ============================================

-- Role enum
CREATE TYPE "Role" AS ENUM ('BUYER', 'VENDOR', 'SUB_ADMIN', 'ADMIN');

-- ============================================
-- 2. CREATE USER TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS "User" (
  id SERIAL PRIMARY KEY,
  name TEXT,
  "fcmToken" TEXT,
  "firstName" TEXT,
  "lastName" TEXT,
  phone TEXT,
  email TEXT NOT NULL UNIQUE,
  password TEXT,
  role "Role" NOT NULL DEFAULT 'BUYER',
  otp TEXT,
  "otpExpiry" TIMESTAMP(3),
  "isVerified" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isApprovalRequired" BOOLEAN NOT NULL DEFAULT true,
  "userName" TEXT,
  "googleId" TEXT UNIQUE,
  "profilePicture" TEXT,
  "authProvider" TEXT DEFAULT 'local',
  "marketingEmail" TEXT,
  "sellingLocation" TEXT,
  country TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for User table
CREATE INDEX "idx_user_email" ON "User"("email");
CREATE INDEX "idx_user_role" ON "User"("role");
CREATE INDEX "idx_user_authProvider" ON "User"("authProvider");

-- ============================================
-- 3. CREATE ADDRESS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS "Address" (
  id SERIAL PRIMARY KEY,
  "shopName" TEXT,
  username TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  country TEXT,
  apartment TEXT,
  street TEXT,
  state TEXT,
  city TEXT,
  "zipCode" TEXT,
  province TEXT,
  "phoneNumber" TEXT,
  "addressType" TEXT,
  "userId" INTEGER NOT NULL UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Address_userId_fkey" FOREIGN KEY ("userId") 
    REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create index for Address table
CREATE INDEX "idx_address_userId" ON "Address"("userId");

-- ============================================
-- 4. CREATE STORE TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS "Store" (
  id SERIAL PRIMARY KEY,
  "storeName" TEXT,
  country TEXT,
  "marketingEmail" TEXT,
  "sellingLocation" TEXT,
  website TEXT,
  "openingYear" TEXT,
  "annualSales" TEXT,
  "legalName" TEXT,
  siret TEXT,
  "postalCode" INTEGER,
  "storeStatus" TEXT NOT NULL DEFAULT 'pending',
  "vendorId" INTEGER NOT NULL UNIQUE,
  "storeTypes" TEXT[] NOT NULL DEFAULT '{}',
  
  -- Store complete settings as JSONB (from dokan_profile_settings)
  "storeSettings" JSONB,
  
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Store_vendorId_fkey" FOREIGN KEY ("vendorId") 
    REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create index for Store table
CREATE INDEX "idx_store_vendorId" ON "Store"("vendorId");
CREATE INDEX "idx_store_storeStatus" ON "Store"("storeStatus");

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- View all tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('User', 'Address', 'Store');

-- View User table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'User'
ORDER BY ordinal_position;

-- View Address table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'Address'
ORDER BY ordinal_position;

-- View Store table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'Store'
ORDER BY ordinal_position;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================
-- Tables created successfully!
-- Now you can run: npm run migrate
