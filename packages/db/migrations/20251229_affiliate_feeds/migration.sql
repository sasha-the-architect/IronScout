-- Migration: Add affiliate feeds infrastructure
-- This migration adds all tables and columns needed for the affiliate feeds v1 feature.

-- First, check if required enums exist and create them if not
DO $$ BEGIN
    CREATE TYPE "AffiliateFeedStatus" AS ENUM ('DRAFT', 'PENDING_ACTIVATION', 'ENABLED', 'PAUSED', 'FAILED', 'DISABLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "FeedTransport" AS ENUM ('FTP', 'SFTP', 'HTTP', 'HTTPS');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "FeedFormat" AS ENUM ('CSV', 'TSV', 'XML', 'JSON');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "FeedCompression" AS ENUM ('NONE', 'GZIP', 'ZIP');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "AffiliateFeedRunTrigger" AS ENUM ('SCHEDULED', 'MANUAL', 'MANUAL_PENDING', 'ADMIN_TEST', 'RETRY');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "AffiliateFeedRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "SourceKind" AS ENUM ('DIRECT', 'AFFILIATE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "SourceProductIdentityType" AS ENUM ('SKU', 'UPC', 'IMPACT_ITEM_ID', 'URL_HASH');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETION_REQUESTED', 'DELETED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add IMPACT to FeedFormatType if it exists and doesn't have it
DO $$ BEGIN
    ALTER TYPE "FeedFormatType" ADD VALUE IF NOT EXISTS 'IMPACT';
EXCEPTION
    WHEN undefined_object THEN null;
END $$;

-- AlterTable: alerts - drop old columns if they exist
ALTER TABLE "alerts" DROP COLUMN IF EXISTS "alertType";
ALTER TABLE "alerts" DROP COLUMN IF EXISTS "isActive";
ALTER TABLE "alerts" DROP COLUMN IF EXISTS "lastTriggered";
ALTER TABLE "alerts" DROP COLUMN IF EXISTS "targetPrice";

-- AlterTable: watchlist_items - drop old columns if they exist
ALTER TABLE "watchlist_items" DROP COLUMN IF EXISTS "lowestPriceSeen";
ALTER TABLE "watchlist_items" DROP COLUMN IF EXISTS "lowestPriceSeenAt";
ALTER TABLE "watchlist_items" DROP COLUMN IF EXISTS "targetPrice";

-- AlterTable: prices - add new columns
ALTER TABLE "prices" ADD COLUMN IF NOT EXISTS "affiliateFeedRunId" TEXT;
ALTER TABLE "prices" ADD COLUMN IF NOT EXISTS "priceSignatureHash" TEXT;
ALTER TABLE "prices" ADD COLUMN IF NOT EXISTS "sourceProductId" TEXT;
ALTER TABLE "prices" ALTER COLUMN "productId" DROP NOT NULL;

-- AlterTable: sources - add new columns (with defaults for existing rows)
-- First add retailerId as nullable
ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "retailerId" TEXT;

-- Populate retailerId for existing sources from their associated prices/retailers
-- This assumes each source is associated with prices that have a retailer
UPDATE "sources" s
SET "retailerId" = (
    SELECT DISTINCT p."retailerId"
    FROM "prices" p
    WHERE p."retailerId" IS NOT NULL
    LIMIT 1
)
WHERE s."retailerId" IS NULL;

-- If still null, create a placeholder retailer and assign it
-- (This handles sources without any prices)
DO $$
DECLARE
    placeholder_retailer_id TEXT;
BEGIN
    -- Only proceed if there are sources without retailerId
    IF EXISTS (SELECT 1 FROM "sources" WHERE "retailerId" IS NULL) THEN
        -- Check if placeholder retailer exists
        SELECT id INTO placeholder_retailer_id FROM "retailers" WHERE "website" = 'placeholder.internal';

        IF placeholder_retailer_id IS NULL THEN
            -- Create placeholder retailer
            INSERT INTO "retailers" (id, name, website, "createdAt", "updatedAt")
            VALUES (gen_random_uuid()::text, 'Placeholder Retailer', 'placeholder.internal', NOW(), NOW())
            RETURNING id INTO placeholder_retailer_id;
        END IF;

        -- Update sources without retailerId
        UPDATE "sources" SET "retailerId" = placeholder_retailer_id WHERE "retailerId" IS NULL;
    END IF;
END $$;

-- Now make retailerId NOT NULL
ALTER TABLE "sources" ALTER COLUMN "retailerId" SET NOT NULL;

-- Add other source columns
ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "affiliateAccountId" TEXT;
ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "affiliateAccountName" TEXT;
ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "affiliateAdvertiserId" TEXT;
ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "affiliateCampaignId" TEXT;
ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "affiliateProgramId" TEXT;
ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "affiliateTrackingTemplate" TEXT;
ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "isDisplayPrimary" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "sourceKind" "SourceKind" NOT NULL DEFAULT 'DIRECT';

-- AlterTable: users - add new columns
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deletionRequestedAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deletionScheduledFor" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable: affiliate_feeds
CREATE TABLE IF NOT EXISTS "affiliate_feeds" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "network" "AffiliateNetwork" NOT NULL,
    "status" "AffiliateFeedStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduleFrequencyHours" INTEGER,
    "nextRunAt" TIMESTAMP(3),
    "expiryHours" INTEGER NOT NULL DEFAULT 48,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "lastRunAt" TIMESTAMP(3),
    "manualRunPending" BOOLEAN NOT NULL DEFAULT false,
    "transport" "FeedTransport" NOT NULL DEFAULT 'SFTP',
    "host" TEXT,
    "port" INTEGER,
    "path" TEXT,
    "username" TEXT,
    "secretCiphertext" BYTEA,
    "secretKeyId" TEXT,
    "secretVersion" INTEGER NOT NULL DEFAULT 1,
    "format" "FeedFormat" NOT NULL DEFAULT 'CSV',
    "compression" "FeedCompression" NOT NULL DEFAULT 'NONE',
    "lastRemoteMtime" TIMESTAMP(3),
    "lastRemoteSize" BIGINT,
    "lastContentHash" TEXT,
    "maxFileSizeBytes" BIGINT,
    "maxRowCount" INTEGER,
    "feedLockId" BIGSERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    CONSTRAINT "affiliate_feeds_pkey" PRIMARY KEY ("id")
);

-- CreateTable: affiliate_feed_runs
CREATE TABLE IF NOT EXISTS "affiliate_feed_runs" (
    "id" TEXT NOT NULL,
    "feedId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "trigger" "AffiliateFeedRunTrigger" NOT NULL DEFAULT 'SCHEDULED',
    "status" "AffiliateFeedRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "downloadBytes" BIGINT,
    "rowsRead" INTEGER,
    "rowsParsed" INTEGER,
    "productsUpserted" INTEGER,
    "pricesWritten" INTEGER,
    "productsPromoted" INTEGER,
    "errorCount" INTEGER,
    "productsExpired" INTEGER,
    "productsRejected" INTEGER,
    "duplicateKeyCount" INTEGER,
    "urlHashFallbackCount" INTEGER,
    "activeCountBefore" INTEGER,
    "seenSuccessCount" INTEGER,
    "wouldExpireCount" INTEGER,
    "skippedReason" TEXT,
    "failureKind" TEXT,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "isPartial" BOOLEAN NOT NULL DEFAULT false,
    "expiryStepFailed" BOOLEAN NOT NULL DEFAULT false,
    "expiryBlocked" BOOLEAN NOT NULL DEFAULT false,
    "expiryBlockedReason" TEXT,
    "expiryApprovedAt" TIMESTAMP(3),
    "expiryApprovedBy" TEXT,
    "artifactUrl" TEXT,
    CONSTRAINT "affiliate_feed_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: affiliate_feed_run_errors
CREATE TABLE IF NOT EXISTS "affiliate_feed_run_errors" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "rowNumber" INTEGER,
    "sample" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "affiliate_feed_run_errors_pkey" PRIMARY KEY ("id")
);

-- CreateTable: source_products
CREATE TABLE IF NOT EXISTS "source_products" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "identityType" "SourceProductIdentityType" NOT NULL,
    "identityValue" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "imageUrl" TEXT,
    "sku" TEXT,
    "upc" TEXT,
    "urlHash" TEXT,
    "normalizedUrl" TEXT,
    "impactItemId" TEXT,
    "createdByRunId" TEXT,
    "lastUpdatedByRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "source_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable: source_product_presence
CREATE TABLE IF NOT EXISTS "source_product_presence" (
    "id" TEXT NOT NULL,
    "sourceProductId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenSuccessAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "source_product_presence_pkey" PRIMARY KEY ("id")
);

-- CreateTable: source_product_seen
CREATE TABLE IF NOT EXISTS "source_product_seen" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sourceProductId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "source_product_seen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: affiliate_feeds
CREATE UNIQUE INDEX IF NOT EXISTS "affiliate_feeds_sourceId_key" ON "affiliate_feeds"("sourceId");
CREATE UNIQUE INDEX IF NOT EXISTS "affiliate_feeds_feedLockId_key" ON "affiliate_feeds"("feedLockId");
CREATE INDEX IF NOT EXISTS "affiliate_feeds_status_idx" ON "affiliate_feeds"("status");
CREATE INDEX IF NOT EXISTS "affiliate_feeds_nextRunAt_idx" ON "affiliate_feeds"("nextRunAt");

-- CreateIndex: affiliate_feed_runs
CREATE INDEX IF NOT EXISTS "affiliate_feed_runs_feedId_startedAt_idx" ON "affiliate_feed_runs"("feedId", "startedAt");
CREATE INDEX IF NOT EXISTS "affiliate_feed_runs_feedId_trigger_startedAt_idx" ON "affiliate_feed_runs"("feedId", "trigger", "startedAt");
CREATE INDEX IF NOT EXISTS "affiliate_feed_runs_feedId_status_startedAt_idx" ON "affiliate_feed_runs"("feedId", "status", "startedAt");

-- CreateIndex: affiliate_feed_run_errors
CREATE INDEX IF NOT EXISTS "affiliate_feed_run_errors_runId_idx" ON "affiliate_feed_run_errors"("runId");

-- CreateIndex: source_products
CREATE INDEX IF NOT EXISTS "source_products_sourceId_idx" ON "source_products"("sourceId");
CREATE INDEX IF NOT EXISTS "source_products_impactItemId_idx" ON "source_products"("impactItemId");
CREATE INDEX IF NOT EXISTS "source_products_sku_idx" ON "source_products"("sku");
CREATE UNIQUE INDEX IF NOT EXISTS "source_products_sourceId_identityType_identityValue_key" ON "source_products"("sourceId", "identityType", "identityValue");

-- CreateIndex: source_product_presence
CREATE UNIQUE INDEX IF NOT EXISTS "source_product_presence_sourceProductId_key" ON "source_product_presence"("sourceProductId");
CREATE INDEX IF NOT EXISTS "source_product_presence_lastSeenSuccessAt_idx" ON "source_product_presence"("lastSeenSuccessAt");

-- CreateIndex: source_product_seen
CREATE INDEX IF NOT EXISTS "source_product_seen_runId_idx" ON "source_product_seen"("runId");
CREATE UNIQUE INDEX IF NOT EXISTS "source_product_seen_runId_sourceProductId_key" ON "source_product_seen"("runId", "sourceProductId");

-- CreateIndex: alerts
CREATE INDEX IF NOT EXISTS "alerts_userId_idx" ON "alerts"("userId");
CREATE INDEX IF NOT EXISTS "alerts_productId_idx" ON "alerts"("productId");
CREATE INDEX IF NOT EXISTS "alerts_watchlistItemId_idx" ON "alerts"("watchlistItemId");

-- CreateIndex: prices
CREATE INDEX IF NOT EXISTS "prices_sourceProductId_idx" ON "prices"("sourceProductId");

-- CreateIndex: sources
CREATE INDEX IF NOT EXISTS "sources_retailer_id_idx" ON "sources"("retailerId");

-- AddForeignKey: prices -> source_products
DO $$ BEGIN
    ALTER TABLE "prices" ADD CONSTRAINT "prices_sourceProductId_fkey"
    FOREIGN KEY ("sourceProductId") REFERENCES "source_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: prices -> affiliate_feed_runs
DO $$ BEGIN
    ALTER TABLE "prices" ADD CONSTRAINT "prices_affiliateFeedRunId_fkey"
    FOREIGN KEY ("affiliateFeedRunId") REFERENCES "affiliate_feed_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Clean up orphaned alerts before adding FK constraint
-- Set watchlistItemId to NULL for alerts referencing non-existent watchlist items
UPDATE "alerts" SET "watchlistItemId" = NULL
WHERE "watchlistItemId" IS NOT NULL
  AND "watchlistItemId" NOT IN (SELECT id FROM "watchlist_items");

-- AddForeignKey: alerts -> watchlist_items
DO $$ BEGIN
    ALTER TABLE "alerts" ADD CONSTRAINT "alerts_watchlistItemId_fkey"
    FOREIGN KEY ("watchlistItemId") REFERENCES "watchlist_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: sources -> retailers
DO $$ BEGIN
    ALTER TABLE "sources" ADD CONSTRAINT "sources_retailerId_fkey"
    FOREIGN KEY ("retailerId") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: affiliate_feeds -> sources
DO $$ BEGIN
    ALTER TABLE "affiliate_feeds" ADD CONSTRAINT "affiliate_feeds_sourceId_fkey"
    FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: affiliate_feed_runs -> affiliate_feeds
DO $$ BEGIN
    ALTER TABLE "affiliate_feed_runs" ADD CONSTRAINT "affiliate_feed_runs_feedId_fkey"
    FOREIGN KEY ("feedId") REFERENCES "affiliate_feeds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: affiliate_feed_run_errors -> affiliate_feed_runs
DO $$ BEGIN
    ALTER TABLE "affiliate_feed_run_errors" ADD CONSTRAINT "affiliate_feed_run_errors_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "affiliate_feed_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: source_products -> sources
DO $$ BEGIN
    ALTER TABLE "source_products" ADD CONSTRAINT "source_products_sourceId_fkey"
    FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: source_product_presence -> source_products
DO $$ BEGIN
    ALTER TABLE "source_product_presence" ADD CONSTRAINT "source_product_presence_sourceProductId_fkey"
    FOREIGN KEY ("sourceProductId") REFERENCES "source_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: source_product_seen -> affiliate_feed_runs
DO $$ BEGIN
    ALTER TABLE "source_product_seen" ADD CONSTRAINT "source_product_seen_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "affiliate_feed_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: source_product_seen -> source_products
DO $$ BEGIN
    ALTER TABLE "source_product_seen" ADD CONSTRAINT "source_product_seen_sourceProductId_fkey"
    FOREIGN KEY ("sourceProductId") REFERENCES "source_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
