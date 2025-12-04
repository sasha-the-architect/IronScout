-- =====================================================
-- Performance Indexes for IronScout Database
-- Generated based on application query pattern analysis
-- =====================================================

-- PRODUCTS TABLE
-- =====================================================

-- 1. Text search optimization (GIN indexes for ILIKE queries)
-- Used heavily in product search with case-insensitive LIKE queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_name_gin
ON products USING gin(name gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_description_gin
ON products USING gin(description gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_brand_gin
ON products USING gin(brand gin_trgm_ops);

-- Note: Requires pg_trgm extension
-- Run this first if not already enabled:
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Category filtering (most common filter in product searches)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_category
ON products(category);

-- 3. Brand filtering (commonly used with category)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_brand
ON products(brand) WHERE brand IS NOT NULL;

-- 4. Composite index for category + brand (very common combination)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_category_brand
ON products(category, brand) WHERE brand IS NOT NULL;

-- 5. Ammunition-specific searches (caliber is heavily filtered)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_caliber
ON products(caliber) WHERE caliber IS NOT NULL;

-- 6. Composite index for ammunition searches (caliber + grainWeight)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_caliber_grain
ON products(caliber, "grainWeight")
WHERE caliber IS NOT NULL AND "grainWeight" IS NOT NULL;

-- 7. Case material filtering for ammunition
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_case_material
ON products("caseMaterial") WHERE "caseMaterial" IS NOT NULL;

-- 8. Purpose filtering for ammunition
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_purpose
ON products(purpose) WHERE purpose IS NOT NULL;

-- 9. Round count range queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_round_count
ON products("roundCount") WHERE "roundCount" IS NOT NULL;

-- 10. Created/Updated timestamps for sorting
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_created_at
ON products("createdAt" DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_updated_at
ON products("updatedAt" DESC);


-- PRICES TABLE
-- =====================================================

-- 1. Product lookup (most common - every product detail/search needs prices)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_prices_product_id
ON prices("productId");

-- 2. Retailer lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_prices_retailer_id
ON prices("retailerId");

-- 3. Price history queries (productId + retailerId + date)
-- This covers: finding latest price, price history over time
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_prices_product_retailer_date
ON prices("productId", "retailerId", "createdAt" DESC);

-- 4. Stock availability filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_prices_in_stock
ON prices("inStock") WHERE "inStock" = true;

-- 5. Price range queries with stock filter
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_prices_price_stock
ON prices(price, "inStock");

-- 6. Recent price lookups (last 7 days pattern seen in code)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_prices_created_at
ON prices("createdAt" DESC);

-- 7. Composite for finding lowest price per product
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_prices_product_price_stock
ON prices("productId", price, "inStock") WHERE "inStock" = true;


-- RETAILERS TABLE
-- =====================================================

-- 1. Website lookup (unique constraint should already create index, but verify)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_retailers_website
ON retailers(website);

-- 2. Tier filtering (used in price sorting - PREMIUM before STANDARD)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_retailers_tier
ON retailers(tier);

-- 3. Composite for tier-based price queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_retailers_tier_name
ON retailers(tier, name);


-- ALERTS TABLE
-- =====================================================

-- 1. User's alerts (most common query - users viewing their alerts)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_alerts_user_id
ON alerts("userId");

-- 2. Active alerts filtering (userId + isActive)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_alerts_user_active
ON alerts("userId", "isActive") WHERE "isActive" = true;

-- 3. Product alerts (checking if alert exists for product)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_alerts_product_id
ON alerts("productId");

-- 4. Composite for duplicate alert checks (userId + productId + type)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_alerts_user_product_type
ON alerts("userId", "productId", type);

-- 5. Created date for sorting
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_alerts_created_at
ON alerts("createdAt" DESC);


-- USERS TABLE
-- =====================================================

-- 1. Email lookup (authentication) - should already be unique
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email
ON users(email);

-- 2. Tier filtering (for feature access checks)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_tier
ON users(tier);


-- SOURCES TABLE (Harvester)
-- =====================================================

-- 1. Enabled sources filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sources_enabled
ON sources(enabled) WHERE enabled = true;

-- 2. Type filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sources_type
ON sources(type);

-- 3. Created/Updated timestamps
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sources_updated_at
ON sources("updatedAt" DESC);


-- EXECUTIONS TABLE (Harvester)
-- =====================================================

-- 1. Source executions lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_executions_source_id
ON executions("sourceId");

-- 2. Status filtering (admin dashboard)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_executions_status
ON executions(status);

-- 3. Composite for source + status queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_executions_source_status
ON executions("sourceId", status);

-- 4. Timestamp ordering (finding latest executions)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_executions_started_at
ON executions("startedAt" DESC) WHERE "startedAt" IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_executions_completed_at
ON executions("completedAt" DESC) WHERE "completedAt" IS NOT NULL;

-- 5. Composite for recent execution queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_executions_source_started
ON executions("sourceId", "startedAt" DESC);


-- EXECUTION LOGS TABLE (Harvester)
-- =====================================================

-- 1. Execution logs lookup (most common - viewing logs for an execution)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_execution_logs_execution_id
ON execution_logs("executionId");

-- 2. Timestamp ordering (logs always sorted by time)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_execution_logs_timestamp
ON execution_logs(timestamp DESC);

-- 3. Composite for execution + timestamp (optimal for log viewing)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_execution_logs_exec_timestamp
ON execution_logs("executionId", timestamp DESC);

-- 4. Level filtering (ERROR, WARN filtering in admin)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_execution_logs_level
ON execution_logs(level);

-- 5. Event filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_execution_logs_event
ON execution_logs(event);

-- 6. Composite for execution + level (finding errors for an execution)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_execution_logs_exec_level
ON execution_logs("executionId", level);


-- SUBSCRIPTIONS TABLE
-- =====================================================

-- 1. User subscription lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subscriptions_user_id
ON subscriptions("userId");

-- 2. Retailer subscription lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subscriptions_retailer_id
ON subscriptions("retailerId") WHERE "retailerId" IS NOT NULL;

-- 3. Active subscriptions
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subscriptions_status
ON subscriptions(status);

-- 4. Stripe customer lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subscriptions_stripe_customer
ON subscriptions("stripeCustomerId") WHERE "stripeCustomerId" IS NOT NULL;


-- ADVERTISEMENTS TABLE
-- =====================================================

-- 1. Active ads for search results
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_advertisements_is_active
ON advertisements("isActive") WHERE "isActive" = true;

-- 2. Retailer ads lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_advertisements_retailer_id
ON advertisements("retailerId");

-- 3. Composite for active retailer ads
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_advertisements_retailer_active
ON advertisements("retailerId", "isActive") WHERE "isActive" = true;


-- =====================================================
-- ADDITIONAL RECOMMENDATIONS
-- =====================================================

-- Enable pg_trgm extension for trigram text search (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Analyze tables after index creation for optimal query planning
ANALYZE products;
ANALYZE prices;
ANALYZE retailers;
ANALYZE alerts;
ANALYZE users;
ANALYZE sources;
ANALYZE executions;
ANALYZE execution_logs;
ANALYZE subscriptions;
ANALYZE advertisements;

-- =====================================================
-- INDEX MONITORING QUERIES
-- =====================================================

-- Check index usage statistics
-- Run this periodically to verify indexes are being used:
/*
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan as index_scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;
*/

-- Check index sizes
/*
SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;
*/

-- Find unused indexes (idx_scan = 0)
/*
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
    AND idx_scan = 0
    AND indexrelname NOT LIKE 'pg_toast%';
*/
