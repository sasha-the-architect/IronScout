-- Firearm → Preferred Ammo Mapping
-- Per firearm_preferred_ammo_mapping_spec_v3.md
-- User-declared ammo usage context for firearms. Not a recommendation system.

-- Create AmmoUseCase enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AmmoUseCase') THEN
    CREATE TYPE "AmmoUseCase" AS ENUM ('TRAINING', 'CARRY', 'COMPETITION', 'GENERAL');
  END IF;
END $$;

-- Create AmmoPreferenceDeleteReason enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AmmoPreferenceDeleteReason') THEN
    CREATE TYPE "AmmoPreferenceDeleteReason" AS ENUM ('USER_REMOVED', 'FIREARM_DELETED', 'SKU_SUPERSEDED', 'ADMIN_CLEANUP');
  END IF;
END $$;

-- Create firearm_ammo_preferences table
CREATE TABLE IF NOT EXISTS "firearm_ammo_preferences" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "firearmId" TEXT NOT NULL,
  "ammoSkuId" TEXT NOT NULL,
  "useCase" "AmmoUseCase" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "deleteReason" "AmmoPreferenceDeleteReason",

  CONSTRAINT "firearm_ammo_preferences_pkey" PRIMARY KEY ("id")
);

-- Add foreign key constraints
-- Per spec: Soft-delete semantics for firearm/user deletion
-- userId: CASCADE is acceptable (account deletion removes all data)
-- firearmId: NO ACTION - application handles soft-delete cascade via cascadeFirearmDeletion()
--            Orphaned refs in soft-deleted records are acceptable for audit trail
-- ammoSkuId: CASCADE is safe (products should never be hard-deleted per spec)
ALTER TABLE "firearm_ammo_preferences"
ADD CONSTRAINT "firearm_ammo_preferences_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "firearm_ammo_preferences"
ADD CONSTRAINT "firearm_ammo_preferences_firearmId_fkey"
FOREIGN KEY ("firearmId") REFERENCES "user_guns"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "firearm_ammo_preferences"
ADD CONSTRAINT "firearm_ammo_preferences_ammoSkuId_fkey"
FOREIGN KEY ("ammoSkuId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add partial unique index for active-only constraint (spec requirement)
-- Per spec: UNIQUE (user_id, firearm_id, ammo_sku_id, use_case) WHERE deleted_at IS NULL
-- This enforces that only one active mapping exists per user+firearm+sku+useCase
-- Allows multiple soft-deleted records for the same combination
CREATE UNIQUE INDEX IF NOT EXISTS "firearm_ammo_preferences_active_unique"
ON "firearm_ammo_preferences" ("userId", "firearmId", "ammoSkuId", "useCase")
WHERE "deletedAt" IS NULL;

-- Recommended indexes per spec
CREATE INDEX IF NOT EXISTS "firearm_ammo_preferences_userId_firearmId_deletedAt_idx"
ON "firearm_ammo_preferences" ("userId", "firearmId", "deletedAt");

CREATE INDEX IF NOT EXISTS "firearm_ammo_preferences_userId_ammoSkuId_deletedAt_idx"
ON "firearm_ammo_preferences" ("userId", "ammoSkuId", "deletedAt");

CREATE INDEX IF NOT EXISTS "firearm_ammo_preferences_userId_useCase_deletedAt_idx"
ON "firearm_ammo_preferences" ("userId", "useCase", "deletedAt");
