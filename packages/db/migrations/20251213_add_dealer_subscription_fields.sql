-- Add subscription management fields to dealers table
-- These fields track dealer subscription status for portal access and feed processing

-- Add subscription status enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DealerSubscriptionStatus') THEN
        CREATE TYPE "DealerSubscriptionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELLED');
    END IF;
END$$;

-- Add subscription fields to dealers table
ALTER TABLE dealers
ADD COLUMN IF NOT EXISTS "subscriptionStatus" "DealerSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN IF NOT EXISTS "subscriptionExpiresAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "subscriptionGraceDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN IF NOT EXISTS "lastSubscriptionNotifyAt" TIMESTAMP(3);

-- Add SKIPPED status to FeedRunStatus enum if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'SKIPPED'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'FeedRunStatus')
    ) THEN
        ALTER TYPE "FeedRunStatus" ADD VALUE 'SKIPPED';
    END IF;
END$$;

-- Create index for subscription status queries
-- Note: Using regular CREATE INDEX (not CONCURRENTLY) to allow running in transaction
CREATE INDEX IF NOT EXISTS idx_dealers_subscription_status
ON dealers("subscriptionStatus");

-- Create index for finding dealers needing notification
CREATE INDEX IF NOT EXISTS idx_dealers_subscription_notify
ON dealers("subscriptionExpiresAt", "lastSubscriptionNotifyAt")
WHERE "subscriptionStatus" = 'ACTIVE' OR "subscriptionStatus" = 'EXPIRED';

COMMENT ON COLUMN dealers."subscriptionStatus" IS 'Current subscription status: ACTIVE, EXPIRED, SUSPENDED, or CANCELLED';
COMMENT ON COLUMN dealers."subscriptionExpiresAt" IS 'When subscription expires (null = no expiration for founding/lifetime)';
COMMENT ON COLUMN dealers."subscriptionGraceDays" IS 'Number of days after expiration before access is blocked (default 7)';
COMMENT ON COLUMN dealers."lastSubscriptionNotifyAt" IS 'Last time subscription expiry notification was sent (rate limiting)';
