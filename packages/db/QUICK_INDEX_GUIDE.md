# Quick Index Application Guide

## TL;DR - Apply Indexes Now

### Production (Render)
```bash
cd packages/db
$env:DATABASE_URL="postgresql://ironscout:X9yOiz5SVOUgN5ycNA1ArsPH6J0bs2yk@dpg-d4o9vui4d50c738n40dg-a.ohio-postgres.render.com/ironscout"
pnpm db:indexes
```

**Time**: 10-30 minutes (uses CONCURRENTLY - zero downtime)

### Local
```bash
cd packages/db
pnpm db:indexes
```

## What Gets Created

### 🎯 **50+ Indexes** organized by priority:

#### Critical (Apply First)
- **Product search** - Text search on name, description, brand (GIN indexes)
- **Price lookups** - Product history, retailer prices, stock filtering
- **User alerts** - Active alerts, duplicate checks

#### High Priority
- **Category/Brand** - Composite indexes for filtered searches
- **Ammunition fields** - Caliber, grain weight, case material
- **Executions & Logs** - Admin console performance

#### Standard
- **Timestamps** - Created/updated date sorting
- **Status fields** - Boolean and enum filtering

## Expected Performance Gains

| Query Type | Before | After | Improvement |
|------------|--------|-------|-------------|
| Product search | 500-2000ms | 50-200ms | **5-10x faster** |
| Price history | 200-800ms | 50-100ms | **4-8x faster** |
| Alert dashboard | 100-500ms | 10-50ms | **10x faster** |
| Admin logs | 1000-3000ms | 100-300ms | **10x faster** |

## Verify Indexes Were Created

```bash
# Check index status
pnpm db:indexes:status

# Or manually:
psql $DATABASE_URL -c "SELECT tablename, indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename;"
```

Should show ~50 new indexes like:
- `idx_products_name_gin`
- `idx_prices_product_retailer_date`
- `idx_alerts_user_active`
- etc.

## Test Performance

### Before/After Comparison

```sql
-- Product search (should use idx_products_name_gin)
EXPLAIN ANALYZE
SELECT * FROM products WHERE name ILIKE '%9mm%';

-- Price history (should use idx_prices_product_retailer_date)
EXPLAIN ANALYZE
SELECT * FROM prices
WHERE "productId" = 'test-id'
ORDER BY "createdAt" DESC;
```

Look for:
- ✅ "Index Scan using idx_..."
- ❌ "Seq Scan on table" (means index not used)

## Common Issues

### ❌ ERROR: extension "pg_trgm" does not exist
**Solution**: Run this first:
```sql
psql $DATABASE_URL -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"
```

### ❌ CONCURRENTLY cannot run inside a transaction block
**Solution**: Script already handles this - no action needed

### ⚠️ Taking a long time
**Expected**: CONCURRENTLY is slower but allows production traffic
**Time**: 10-30 minutes for all 50 indexes

## Monitoring

### Check Index Usage (After 24 Hours)
```sql
-- See which indexes are being used
SELECT
    tablename,
    indexname,
    idx_scan as times_used,
    pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND idx_scan > 0
ORDER BY idx_scan DESC
LIMIT 20;
```

### Find Unused Indexes (After 1 Week)
```sql
-- Indexes that are never used (candidates for removal)
SELECT tablename, indexname
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND idx_scan = 0;
```

## Rollback (If Needed)

To remove all indexes:
```sql
-- Drop specific index
DROP INDEX CONCURRENTLY idx_products_name_gin;

-- Or generate drop statements for all
SELECT 'DROP INDEX CONCURRENTLY ' || indexname || ';'
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%';
```

## Next Steps

1. ✅ Apply indexes to production
2. ⏳ Wait 10-30 minutes for completion
3. ✅ Verify with `pnpm db:indexes:status`
4. ✅ Test product search performance
5. 📊 Monitor usage after 24 hours

## Need More Info?

- Full details: `INDEX_RECOMMENDATIONS.md`
- SQL script: `migrations/add-performance-indexes.sql`
- Query analysis: See conversation history
