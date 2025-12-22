-- ADR-011: Unified Saved Items (Collapse Watchlist + Alerts)
-- Phase 2: Add notification preferences and cooldown state to WatchlistItem

-- Add notification preference columns to watchlist_items
ALTER TABLE watchlist_items
ADD COLUMN IF NOT EXISTS "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "priceDropEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "backInStockEnabled" BOOLEAN NOT NULL DEFAULT true;

-- Add anti-spam threshold columns
ALTER TABLE watchlist_items
ADD COLUMN IF NOT EXISTS "minDropPercent" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN IF NOT EXISTS "minDropAmount" DECIMAL(10,2) NOT NULL DEFAULT 5.0;

-- Add cooldown columns
ALTER TABLE watchlist_items
ADD COLUMN IF NOT EXISTS "stockAlertCooldownHours" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN IF NOT EXISTS "lastStockNotifiedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "lastPriceNotifiedAt" TIMESTAMP(3);

-- Add AlertRuleType enum if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AlertRuleType') THEN
        CREATE TYPE "AlertRuleType" AS ENUM ('PRICE_DROP', 'BACK_IN_STOCK');
    END IF;
END$$;

-- Add watchlistItemId to alerts table for linking (if not exists)
ALTER TABLE alerts
ADD COLUMN IF NOT EXISTS "watchlistItemId" TEXT,
ADD COLUMN IF NOT EXISTS "ruleType" "AlertRuleType",
ADD COLUMN IF NOT EXISTS "isEnabled" BOOLEAN NOT NULL DEFAULT true;

-- Create index on watchlistItemId for fast lookups
CREATE INDEX IF NOT EXISTS idx_alerts_watchlist_item
ON alerts("watchlistItemId") WHERE "watchlistItemId" IS NOT NULL;

-- Add unique constraint for one rule type per user+product
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'alerts_userId_productId_ruleType_key'
    ) THEN
        -- First, we need to handle potential duplicates
        -- Delete duplicates keeping the first one
        DELETE FROM alerts a1
        USING alerts a2
        WHERE a1.id > a2.id
          AND a1."userId" = a2."userId"
          AND a1."productId" = a2."productId"
          AND a1."ruleType" = a2."ruleType"
          AND a1."ruleType" IS NOT NULL;

        -- Now add the constraint
        ALTER TABLE alerts ADD CONSTRAINT alerts_userId_productId_ruleType_key
            UNIQUE ("userId", "productId", "ruleType");
    END IF;
END$$;

-- Comments for documentation
COMMENT ON COLUMN watchlist_items."notificationsEnabled" IS 'Master toggle for all notifications on this saved item';
COMMENT ON COLUMN watchlist_items."priceDropEnabled" IS 'Enable price drop notifications';
COMMENT ON COLUMN watchlist_items."backInStockEnabled" IS 'Enable back-in-stock notifications';
COMMENT ON COLUMN watchlist_items."minDropPercent" IS 'Minimum price drop percentage to trigger notification (0-100)';
COMMENT ON COLUMN watchlist_items."minDropAmount" IS 'Minimum price drop amount to trigger notification';
COMMENT ON COLUMN watchlist_items."stockAlertCooldownHours" IS 'Minimum hours between stock notifications';
COMMENT ON COLUMN watchlist_items."lastStockNotifiedAt" IS 'Last time a stock notification was sent';
COMMENT ON COLUMN watchlist_items."lastPriceNotifiedAt" IS 'Last time a price notification was sent';
COMMENT ON COLUMN alerts."watchlistItemId" IS 'Link to parent WatchlistItem for unified saved items model';
COMMENT ON COLUMN alerts."ruleType" IS 'Type of alert rule: PRICE_DROP or BACK_IN_STOCK';
COMMENT ON COLUMN alerts."isEnabled" IS 'Whether this specific rule is enabled';
