# Database Index Recommendations for IronScout

## Overview

This document explains the database indexing strategy based on analysis of actual query patterns in the IronScout application.

## Analysis Summary

The index recommendations are based on:
- **API route analysis**: All routes in `apps/api/src/routes/`
- **Query frequency**: Most common WHERE clauses, joins, and sorting patterns
- **Performance impact**: High-traffic endpoints prioritized

## High-Impact Indexes

### 1. Product Search (Highest Priority)

**Problem**: Product search is the primary user interaction. Queries use:
- Text search on name, description, brand (case-insensitive)
- Category filtering
- Ammunition-specific filters (caliber, grainWeight, caseMaterial, purpose)

**Solution**:
```sql
-- GIN indexes for text search (ILIKE queries)
CREATE INDEX idx_products_name_gin ON products USING gin(name gin_trgm_ops);
CREATE INDEX idx_products_description_gin ON products USING gin(description gin_trgm_ops);
CREATE INDEX idx_products_brand_gin ON products USING gin(brand gin_trgm_ops);

-- Composite indexes for common filter combinations
CREATE INDEX idx_products_category_brand ON products(category, brand);
CREATE INDEX idx_products_caliber_grain ON products(caliber, "grainWeight");
```

**Expected Impact**: 5-10x faster product search queries, especially text searches

### 2. Price Lookups (Critical)

**Problem**: Every product detail and search result requires price data with:
- Product + Retailer + Date combinations
- Price range filtering
- Stock availability checks
- Recent price history (last 7 days)

**Solution**:
```sql
-- Covers most price queries (product history, latest price, retailer prices)
CREATE INDEX idx_prices_product_retailer_date
ON prices("productId", "retailerId", "createdAt" DESC);

-- Optimizes "lowest available price" queries
CREATE INDEX idx_prices_product_price_stock
ON prices("productId", price, "inStock") WHERE "inStock" = true;
```

**Expected Impact**: 3-5x faster price queries, instant price history lookups

### 3. User Alerts (High Traffic)

**Problem**: Users frequently check active alerts:
- Filter by userId + isActive
- Check for duplicate alerts (userId + productId + type)

**Solution**:
```sql
CREATE INDEX idx_alerts_user_active
ON alerts("userId", "isActive") WHERE "isActive" = true;

CREATE INDEX idx_alerts_user_product_type
ON alerts("userId", "productId", type);
```

**Expected Impact**: Near-instant alert dashboard loading

### 4. Harvester Operations (Admin)

**Problem**: Admin console queries executions and logs:
- Source + Status filtering
- Timestamp ordering (DESC)
- Execution logs by executionId + timestamp

**Solution**:
```sql
CREATE INDEX idx_executions_source_status
ON "Execution"("sourceId", status);

CREATE INDEX idx_execution_logs_exec_timestamp
ON "ExecutionLog"("executionId", timestamp DESC);
```

**Expected Impact**: Fast admin dashboard, instant log viewing

## Index Types Explained

### B-Tree Indexes (Default)
Used for exact matches, ranges, and sorting:
- `category`, `brand`, `caliber`
- Numeric fields: `price`, `grainWeight`, `roundCount`
- Timestamps: `createdAt`, `startedAt`

### GIN Indexes (Generalized Inverted Index)
Used for text search with trigram matching:
- Enables fast ILIKE queries (case-insensitive pattern matching)
- Required for: `name gin_trgm_ops`, `description gin_trgm_ops`, `brand gin_trgm_ops`
- Requires `pg_trgm` extension

**Why not Full-Text Search (tsvector)?**
- Prisma doesn't have first-class support for PostgreSQL full-text search
- GIN with trigrams handles ILIKE queries (which Prisma uses)
- Easier to maintain with ORM

### Partial Indexes
Used to reduce index size and improve performance:
```sql
WHERE "isActive" = true    -- Only index active records
WHERE brand IS NOT NULL     -- Skip null values
WHERE "inStock" = true     -- Only index available items
```

**Benefits**:
- Smaller index size (faster updates)
- Better cache efficiency
- Matches actual query patterns

### Composite Indexes
Used when queries filter/sort on multiple columns:
```sql
(category, brand)           -- Category + brand filter
("userId", "isActive")      -- User's active alerts
("productId", "retailerId", "createdAt") -- Price history
```

**Column Order Matters**:
- Most selective column first
- Matches query WHERE clause order
- Can satisfy queries on leftmost columns

## Concurrent Index Creation

All indexes use `CONCURRENTLY` to avoid blocking table writes:
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_name ...
```

**Benefits**:
- Zero downtime
- No table locks
- Safe for production

**Note**: Takes longer but production can continue running

## Performance Metrics

### Before Indexes (Estimated)
- Product search: 500-2000ms (table scan on 1000+ products)
- Price history: 200-800ms (scanning all prices)
- Alert dashboard: 100-500ms
- Admin logs: 1000-3000ms (large log tables)

### After Indexes (Expected)
- Product search: 50-200ms (5-10x faster)
- Price history: 50-100ms (4-8x faster)
- Alert dashboard: 10-50ms (10x faster)
- Admin logs: 100-300ms (10x faster)

## Maintenance

### Monitor Index Usage
```sql
-- Check which indexes are actually being used
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan as scans,
    pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;
```

### Find Unused Indexes
```sql
-- Identify indexes that are never used
SELECT
    schemaname,
    tablename,
    indexname
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
    AND idx_scan = 0
    AND indexrelname NOT LIKE 'pg_toast%';
```

### Update Statistics
Run after significant data changes:
```sql
ANALYZE products;
ANALYZE prices;
-- etc.
```

## Potential Issues & Solutions

### Issue: GIN Indexes Require pg_trgm Extension
**Solution**: Migration script includes extension creation:
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

### Issue: Large Index Sizes
**Monitor**: Check index sizes regularly:
```sql
SELECT pg_size_pretty(pg_relation_size('idx_prices_product_retailer_date'));
```

**Solution**: Use partial indexes where appropriate

### Issue: Write Performance Impact
**Reality Check**:
- Indexes slow down INSERT/UPDATE/DELETE
- But reads (95% of traffic) are much faster
- Net positive for user experience

### Issue: Too Many Indexes
**Current Count**: ~50 indexes recommended
**Assessment**: Reasonable for application query patterns
**Monitor**: Remove unused indexes after 30 days

## Implementation Plan

### Phase 1: Critical Indexes (Deploy Immediately)
- Product search indexes
- Price lookup indexes
- Alert indexes

### Phase 2: Performance Indexes (Deploy Within 1 Week)
- Harvester execution indexes
- Retailer tier indexes

### Phase 3: Monitoring & Optimization (Ongoing)
- Track index usage
- Remove unused indexes
- Add indexes for new features

## Quick Apply

### Local Development
```bash
cd packages/db
psql $DATABASE_URL -f migrations/add-performance-indexes.sql
```

### Production (Render)
```bash
cd packages/db
psql "postgresql://ironscout:X9yOiz5SVOUgN5ycNA1ArsPH6J0bs2yk@dpg-d4o9vui4d50c738n40dg-a.ohio-postgres.render.com/ironscout" -f migrations/add-performance-indexes.sql
```

**Note**: Uses CONCURRENTLY - safe for production, but takes 10-30 minutes

## Testing After Deployment

### 1. Verify Indexes Created
```sql
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```

### 2. Test Product Search Performance
```sql
EXPLAIN ANALYZE
SELECT * FROM products
WHERE name ILIKE '%9mm%'
  AND category = 'Ammunition';
```
Should show "Index Scan using idx_products_name_gin"

### 3. Test Price History Performance
```sql
EXPLAIN ANALYZE
SELECT * FROM prices
WHERE "productId" = 'some-product-id'
  AND "createdAt" >= NOW() - INTERVAL '7 days'
ORDER BY "createdAt" DESC;
```
Should show "Index Scan using idx_prices_product_retailer_date"

## Questions?

Contact the development team or refer to PostgreSQL documentation:
- [PostgreSQL Indexes](https://www.postgresql.org/docs/current/indexes.html)
- [GIN Indexes](https://www.postgresql.org/docs/current/gin.html)
- [pg_trgm Extension](https://www.postgresql.org/docs/current/pgtrgm.html)
