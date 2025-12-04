-- Migration: Add Shipping Costs and Product Reporting
-- Created: 2025-12-04
-- Description: Adds shipping/handling fields to prices and creates product reporting system

-- =====================================================
-- 1. ADD SHIPPING FIELDS TO PRICES TABLE
-- =====================================================

-- Add shipping cost field
ALTER TABLE prices ADD COLUMN IF NOT EXISTS "shippingCost" DECIMAL(10,2);

-- Add free shipping minimum threshold
ALTER TABLE prices ADD COLUMN IF NOT EXISTS "freeShippingMinimum" DECIMAL(10,2);

-- Add shipping notes field
ALTER TABLE prices ADD COLUMN IF NOT EXISTS "shippingNotes" TEXT;

COMMENT ON COLUMN prices."shippingCost" IS 'Shipping cost for this price point. NULL means free shipping or unknown.';
COMMENT ON COLUMN prices."freeShippingMinimum" IS 'Minimum order amount to qualify for free shipping';
COMMENT ON COLUMN prices."shippingNotes" IS 'Additional shipping information (e.g., "Free for Prime members")';


-- =====================================================
-- 2. CREATE PRODUCT ISSUE TYPE ENUM
-- =====================================================

CREATE TYPE "ProductIssueType" AS ENUM (
  'INCORRECT_PRICE',
  'OUT_OF_STOCK',
  'INCORRECT_INFO',
  'BROKEN_LINK',
  'WRONG_PRODUCT',
  'SPAM',
  'OTHER'
);


-- =====================================================
-- 3. CREATE REPORT STATUS ENUM
-- =====================================================

CREATE TYPE "ReportStatus" AS ENUM (
  'PENDING',
  'UNDER_REVIEW',
  'RESOLVED',
  'DISMISSED'
);


-- =====================================================
-- 4. CREATE PRODUCT REPORTS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS product_reports (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "productId" TEXT NOT NULL,
  "userId" TEXT,
  "priceId" TEXT,
  "issueType" "ProductIssueType" NOT NULL,
  description TEXT NOT NULL,
  status "ReportStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedBy" TEXT,
  "reviewNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),

  -- Foreign keys
  CONSTRAINT "product_reports_productId_fkey"
    FOREIGN KEY ("productId")
    REFERENCES products(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,

  CONSTRAINT "product_reports_userId_fkey"
    FOREIGN KEY ("userId")
    REFERENCES users(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,

  CONSTRAINT "product_reports_priceId_fkey"
    FOREIGN KEY ("priceId")
    REFERENCES prices(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
);

COMMENT ON TABLE product_reports IS 'User-submitted reports of issues with products or prices';


-- =====================================================
-- 5. CREATE INDEXES FOR PRODUCT REPORTS
-- =====================================================

-- Index for finding reports by product
CREATE INDEX IF NOT EXISTS idx_product_reports_product_id
ON product_reports("productId");

-- Index for finding reports by user
CREATE INDEX IF NOT EXISTS idx_product_reports_user_id
ON product_reports("userId") WHERE "userId" IS NOT NULL;

-- Index for admin dashboard (pending reports)
CREATE INDEX IF NOT EXISTS idx_product_reports_status
ON product_reports(status);

-- Index for admin filtering (status + created date)
CREATE INDEX IF NOT EXISTS idx_product_reports_status_created
ON product_reports(status, "createdAt" DESC);

-- Index for issue type filtering
CREATE INDEX IF NOT EXISTS idx_product_reports_issue_type
ON product_reports("issueType");

-- Index for specific price reports
CREATE INDEX IF NOT EXISTS idx_product_reports_price_id
ON product_reports("priceId") WHERE "priceId" IS NOT NULL;


-- =====================================================
-- 6. CREATE INDEXES FOR SHIPPING FIELDS
-- =====================================================

-- Index for filtering by shipping cost
CREATE INDEX IF NOT EXISTS idx_prices_shipping_cost
ON prices("shippingCost") WHERE "shippingCost" IS NOT NULL;

-- Composite index for total cost queries (price + shipping)
CREATE INDEX IF NOT EXISTS idx_prices_total_cost
ON prices("productId", price, "shippingCost")
WHERE "inStock" = true;


-- =====================================================
-- 7. UPDATE STATISTICS
-- =====================================================

ANALYZE prices;
ANALYZE product_reports;


-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Verify shipping columns exist
/*
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'prices'
  AND column_name IN ('shippingCost', 'freeShippingMinimum', 'shippingNotes');
*/

-- Verify product_reports table exists
/*
SELECT table_name
FROM information_schema.tables
WHERE table_name = 'product_reports';
*/

-- Verify enums exist
/*
SELECT typname, enumlabel
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
WHERE typname IN ('ProductIssueType', 'ReportStatus')
ORDER BY typname, e.enumsortorder;
*/
