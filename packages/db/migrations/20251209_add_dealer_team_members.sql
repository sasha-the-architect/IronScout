-- Migration: Add Dealer Team Members (DealerUser and DealerInvite)
-- This migration adds multi-user support to dealer accounts

-- =============================================
-- 1. Create DealerUserRole enum
-- =============================================
CREATE TYPE "DealerUserRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');

-- =============================================
-- 2. Create dealer_users table
-- =============================================
CREATE TABLE "dealer_users" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "DealerUserRole" NOT NULL DEFAULT 'MEMBER',
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifyToken" TEXT,
    "resetToken" TEXT,
    "resetTokenExp" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dealer_users_pkey" PRIMARY KEY ("id")
);

-- =============================================
-- 3. Create dealer_invites table
-- =============================================
CREATE TABLE "dealer_invites" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "DealerUserRole" NOT NULL DEFAULT 'MEMBER',
    "inviteToken" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dealer_invites_pkey" PRIMARY KEY ("id")
);

-- =============================================
-- 4. Add indexes
-- =============================================
CREATE INDEX "dealer_users_email_idx" ON "dealer_users"("email");
CREATE INDEX "dealer_users_dealerId_idx" ON "dealer_users"("dealerId");
CREATE UNIQUE INDEX "dealer_users_dealerId_email_key" ON "dealer_users"("dealerId", "email");

CREATE INDEX "dealer_invites_inviteToken_idx" ON "dealer_invites"("inviteToken");
CREATE INDEX "dealer_invites_dealerId_idx" ON "dealer_invites"("dealerId");
CREATE UNIQUE INDEX "dealer_invites_inviteToken_key" ON "dealer_invites"("inviteToken");
CREATE UNIQUE INDEX "dealer_invites_dealerId_email_key" ON "dealer_invites"("dealerId", "email");

-- =============================================
-- 5. Add foreign key constraints
-- =============================================
ALTER TABLE "dealer_users" ADD CONSTRAINT "dealer_users_dealerId_fkey" 
    FOREIGN KEY ("dealerId") REFERENCES "dealers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dealer_invites" ADD CONSTRAINT "dealer_invites_dealerId_fkey" 
    FOREIGN KEY ("dealerId") REFERENCES "dealers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dealer_invites" ADD CONSTRAINT "dealer_invites_invitedById_fkey" 
    FOREIGN KEY ("invitedById") REFERENCES "dealer_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================
-- 6. Migrate existing dealer auth data to dealer_users
--    Creates OWNER users from existing dealer records
-- =============================================
INSERT INTO "dealer_users" (
    "id",
    "dealerId",
    "email",
    "passwordHash",
    "name",
    "role",
    "emailVerified",
    "verifyToken",
    "resetToken",
    "resetTokenExp",
    "createdAt",
    "updatedAt"
)
SELECT 
    gen_random_uuid()::text,
    d."id",
    d."email",
    d."passwordHash",
    d."contactName",
    'OWNER'::"DealerUserRole",
    d."emailVerified",
    d."verifyToken",
    d."resetToken",
    d."resetTokenExp",
    d."createdAt",
    d."updatedAt"
FROM "dealers" d
WHERE d."email" IS NOT NULL AND d."passwordHash" IS NOT NULL;

-- =============================================
-- 7. Drop old auth columns from dealers table
-- =============================================
ALTER TABLE "dealers" DROP COLUMN IF EXISTS "email";
ALTER TABLE "dealers" DROP COLUMN IF EXISTS "passwordHash";
ALTER TABLE "dealers" DROP COLUMN IF EXISTS "emailVerified";
ALTER TABLE "dealers" DROP COLUMN IF EXISTS "verifyToken";
ALTER TABLE "dealers" DROP COLUMN IF EXISTS "resetToken";
ALTER TABLE "dealers" DROP COLUMN IF EXISTS "resetTokenExp";

-- =============================================
-- Done!
-- =============================================
