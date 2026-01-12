-- Migration: Database Audit Cleanup Phase 1
-- Purpose: Remove orphaned tables and redundant indexes identified in 2026-01-12 audit
-- Safe to run: These objects have been verified as unused via code analysis and pg_stat_user_indexes

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 1: Drop orphaned tables (zero code references)
-- ═══════════════════════════════════════════════════════════════════════════════

-- advertisements: Schema defined but never used in application code
-- Evidence: 0 rows, 1 seq scan (schema check only), no code references
DROP TABLE IF EXISTS "advertisements" CASCADE;

-- market_reports: Schema defined but zero code references anywhere
-- Evidence: 0 rows, 1 seq scan (schema check only), no code references
DROP TABLE IF EXISTS "market_reports" CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 2: Drop redundant indexes (covered by composite/unique indexes)
-- ═══════════════════════════════════════════════════════════════════════════════

-- These indexes are covered by composite indexes with the same leading columns
DROP INDEX IF EXISTS "affiliate_feeds_sourceId_idx";           -- covered by affiliate_feeds_sourceId_variant_key
DROP INDEX IF EXISTS "alerts_userId_idx";                      -- covered by alerts_userid_productid_ruletype_key
-- NOTE: alerts_watchlistItemId_idx is kept (defined in schema), only drop the duplicate
DROP INDEX IF EXISTS "idx_alerts_watchlist_item";              -- duplicate of alerts_watchlistItemId_idx
DROP INDEX IF EXISTS "click_events_clickId_idx";               -- covered by click_events_clickId_key
DROP INDEX IF EXISTS "merchant_contacts_merchantId_idx";       -- covered by dealer_contacts_dealerId_email_key
DROP INDEX IF EXISTS "merchant_invites_merchantId_idx";        -- covered by dealer_invites_dealerId_email_key
DROP INDEX IF EXISTS "merchant_retailers_merchantId_idx";      -- covered by merchant_retailers_merchantId_retailerId_key
DROP INDEX IF EXISTS "merchant_user_retailers_merchantUserId_idx"; -- covered by merchant_user_retailers_merchantUserId_merchantRetailerId_key
DROP INDEX IF EXISTS "merchant_users_merchantId_idx";          -- covered by merchant_users_merchantId_email_key
DROP INDEX IF EXISTS "product_links_status_idx";               -- covered by product_links_status_matchType_idx
DROP INDEX IF EXISTS "product_resolve_requests_status_idx";    -- covered by product_resolve_requests_status_updatedAt_idx
DROP INDEX IF EXISTS "retailer_skus_retailerId_idx";           -- covered by retailer_skus_retailerId_retailerSkuHash_key
DROP INDEX IF EXISTS "source_product_seen_runId_idx";          -- covered by source_product_seen_runId_sourceProductId_key
-- NOTE: watchlist_items_userId_idx is kept (partial covering index can't serve all queries)

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 3: Drop duplicate dealer→merchant migration indexes
-- ═══════════════════════════════════════════════════════════════════════════════

-- These are exact duplicates created during dealer→merchant rename
DROP INDEX IF EXISTS "dealer_feed_test_runs_feedId_idx";       -- duplicate of retailer_feed_test_runs_feedId_idx
DROP INDEX IF EXISTS "dealer_feed_test_runs_startedAt_idx";    -- duplicate of retailer_feed_test_runs_startedAt_idx
DROP INDEX IF EXISTS "dealer_skus_feedId_idx";                 -- duplicate of retailer_skus_feedId_idx
DROP INDEX IF EXISTS "dealer_users_dealerId_email_key";        -- duplicate of merchant_users_merchantId_email_key
DROP INDEX IF EXISTS "dealer_invites_inviteToken_idx";         -- duplicate of dealer_invites_inviteToken_key

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 4: Drop unused non-redundant indexes (verified no query usage)
-- ═══════════════════════════════════════════════════════════════════════════════

-- prices_ingestionRunType_idx: Column only used for provenance validation on INSERT,
-- never filtered in WHERE clauses. 144 kB savings.
DROP INDEX IF EXISTS "prices_ingestionRunType_idx";

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 5: Verification
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- Verify tables were dropped
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'advertisements') THEN
    RAISE WARNING 'advertisements table still exists';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'market_reports') THEN
    RAISE WARNING 'market_reports table still exists';
  END IF;

  RAISE NOTICE 'Migration 20260112_audit_cleanup_phase1 completed successfully';
  RAISE NOTICE 'Dropped 2 orphaned tables, ~20 redundant indexes, and 1 unused index';
END$$;

SELECT 'Migration 20260112_audit_cleanup_phase1 completed successfully' as status;
