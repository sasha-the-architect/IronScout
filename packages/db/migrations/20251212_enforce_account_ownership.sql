-- Migration: Enforce Account Ownership Constraint
-- Purpose: Ensure each dealer has exactly one account owner contact
-- Date: 2025-12-12

-- ============================================
-- Step 1: Convert any OTHER roles to PRIMARY
-- ============================================
UPDATE dealer_contacts 
SET role = 'PRIMARY' 
WHERE role = 'OTHER';

-- ============================================
-- Step 2: Set account owner for dealers missing one
-- ============================================
-- For each dealer without an owner, set the earliest created contact as owner
-- Using a CTE to identify the earliest contact per dealer without an owner
WITH dealers_missing_owner AS (
  SELECT d.id as dealer_id
  FROM dealers d
  WHERE NOT EXISTS (
    SELECT 1 FROM dealer_contacts dc 
    WHERE dc."dealerId" = d.id AND dc."isAccountOwner" = true
  )
),
earliest_contact_per_dealer AS (
  SELECT DISTINCT ON (dc."dealerId") 
    dc.id,
    dc."dealerId"
  FROM dealer_contacts dc
  INNER JOIN dealers_missing_owner dmo ON dc."dealerId" = dmo.dealer_id
  ORDER BY dc."dealerId", dc."createdAt" ASC
)
UPDATE dealer_contacts dc
SET "isAccountOwner" = true
FROM earliest_contact_per_dealer ec
WHERE dc.id = ec.id;

-- ============================================
-- Step 3: Handle dealers with multiple owners
-- ============================================
-- If somehow there are multiple owners per dealer, keep only the earliest
-- This shouldn't happen with the new constraint, but just in case
WITH multiple_owners AS (
  SELECT 
    "dealerId",
    id,
    ROW_NUMBER() OVER (PARTITION BY "dealerId" ORDER BY "createdAt" ASC) as rn
  FROM dealer_contacts
  WHERE "isAccountOwner" = true
),
owners_to_remove AS (
  SELECT id
  FROM multiple_owners
  WHERE rn > 1
)
UPDATE dealer_contacts dc
SET "isAccountOwner" = false
FROM owners_to_remove otr
WHERE dc.id = otr.id;

-- ============================================
-- Validation Queries (Run these to verify)
-- ============================================
-- Each dealer should have EXACTLY ONE account owner
SELECT 
  d.id, 
  d."businessName", 
  COUNT(dc.id) as total_contacts,
  SUM(CASE WHEN dc."isAccountOwner" THEN 1 ELSE 0 END) as owner_count
FROM dealers d
LEFT JOIN dealer_contacts dc ON d.id = dc."dealerId"
GROUP BY d.id, d."businessName"
HAVING SUM(CASE WHEN dc."isAccountOwner" THEN 1 ELSE 0 END) != 1
ORDER BY d."createdAt" DESC;

-- No contacts should have OTHER role
SELECT COUNT(*) as other_role_count
FROM dealer_contacts 
WHERE role = 'OTHER';

-- Show account owner contacts
SELECT 
  d."businessName",
  dc."firstName",
  dc."lastName",
  dc.email,
  dc."isAccountOwner",
  dc.role,
  dc."createdAt"
FROM dealers d
INNER JOIN dealer_contacts dc ON d.id = dc."dealerId"
WHERE dc."isAccountOwner" = true
ORDER BY d."businessName";
