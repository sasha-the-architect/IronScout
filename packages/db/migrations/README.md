# Database Migrations

This directory contains database migrations for IronScout.

## Migration Types

### Prisma Migrations (Automatic)
Files matching pattern: `YYYYMMDD*/migration.sql`

These are managed by Prisma and applied automatically via:
```bash
pnpm prisma migrate deploy
```

### Manual SQL Migrations
Files matching pattern: `YYYYMMDD_*.sql` (without subdirectory)

These contain SQL that Prisma cannot express (partial indexes, CHECK constraints, complex backfills) and must be applied manually.

## Manual SQL Files

### `20251228_affiliate_feed_constraints.sql`
**Purpose:** Creates database constraints for affiliate feeds that Prisma cannot express.

**Contents:**
1. `prices_affiliate_dedupe` - Partial unique index for retry-safe price writes
2. `sources_one_primary_per_retailer` - Partial unique index for display primary enforcement
3. `expiry_hours_range` - CHECK constraint for expiryHours (1-168)
4. `affiliate_feeds_feed_lock_id_unique` - Unique index for advisory lock IDs
5. `source_product_seen_run_lookup` - Index for circuit breaker queries

**When to run:** After Prisma migration creates affiliate feed tables.

### `20251228_backfill_source_fields.sql`
**Purpose:** Backfills `sourceKind` and `isDisplayPrimary` for existing sources.

**Contents:**
1. Sets `sourceKind = 'DIRECT'` for all existing sources
2. Sets `isDisplayPrimary = true` for oldest source per retailer

**When to run:** After `20251228_affiliate_feed_constraints.sql`.

## Applying Manual Migrations

### Production / Staging
```bash
# Connect to database
psql $DATABASE_URL

# Apply in order
\i packages/db/migrations/20251228_affiliate_feed_constraints.sql
\i packages/db/migrations/20251228_backfill_source_fields.sql
```

### Local Development
```bash
# From project root
pnpm exec prisma db execute --file packages/db/migrations/20251228_affiliate_feed_constraints.sql
pnpm exec prisma db execute --file packages/db/migrations/20251228_backfill_source_fields.sql
```

### Verification
After applying, run the verification queries included at the bottom of each SQL file to confirm constraints are in place.

## Migration Order

1. Run Prisma migrations: `pnpm prisma migrate deploy`
2. Apply manual SQL in filename order (by date prefix)
3. Verify constraints with included verification queries

## Troubleshooting

### "relation does not exist"
The Prisma migration hasn't been applied yet. Run `pnpm prisma migrate deploy` first.

### "constraint already exists"
The manual SQL is idempotent (`IF NOT EXISTS`). Safe to re-run.

### "multiple display primaries" error
The backfill script detected data integrity issues. Check the verification query output and manually resolve duplicates before the partial unique index can be created.
