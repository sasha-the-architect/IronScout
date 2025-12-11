-- Migration: Split contactName into firstName/lastName and add DealerContact model
-- Date: 2025-12-11

-- =============================================================================
-- Step 1: Add new contact name columns to dealers table
-- =============================================================================

ALTER TABLE dealers ADD COLUMN "contactFirstName" TEXT;
ALTER TABLE dealers ADD COLUMN "contactLastName" TEXT;

-- =============================================================================
-- Step 2: Migrate existing contactName data
-- Split on first space: everything before first space -> firstName, rest -> lastName
-- If no space, entire name goes to firstName
-- =============================================================================

UPDATE dealers
SET 
  "contactFirstName" = CASE 
    WHEN "contactName" LIKE '% %' THEN SPLIT_PART("contactName", ' ', 1)
    ELSE "contactName"
  END,
  "contactLastName" = CASE 
    WHEN "contactName" LIKE '% %' THEN SUBSTRING("contactName" FROM POSITION(' ' IN "contactName") + 1)
    ELSE ''
  END;

-- =============================================================================
-- Step 3: Make new columns NOT NULL after data migration
-- =============================================================================

ALTER TABLE dealers ALTER COLUMN "contactFirstName" SET NOT NULL;
ALTER TABLE dealers ALTER COLUMN "contactLastName" SET NOT NULL;

-- =============================================================================
-- Step 4: Drop old contactName column
-- =============================================================================

ALTER TABLE dealers DROP COLUMN "contactName";

-- =============================================================================
-- Step 5: Create DealerContactRole enum
-- =============================================================================

CREATE TYPE "DealerContactRole" AS ENUM ('PRIMARY', 'BILLING', 'TECHNICAL', 'MARKETING', 'OTHER');

-- =============================================================================
-- Step 6: Create dealer_contacts table
-- =============================================================================

CREATE TABLE dealer_contacts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "dealerId" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  role "DealerContactRole" NOT NULL DEFAULT 'PRIMARY',
  "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
  "communicationOptIn" BOOLEAN NOT NULL DEFAULT true,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT "dealer_contacts_dealerId_fkey" 
    FOREIGN KEY ("dealerId") 
    REFERENCES dealers(id) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE
);

-- =============================================================================
-- Step 7: Create indexes for dealer_contacts
-- =============================================================================

CREATE UNIQUE INDEX "dealer_contacts_dealerId_email_key" ON dealer_contacts("dealerId", email);
CREATE INDEX "dealer_contacts_dealerId_idx" ON dealer_contacts("dealerId");
CREATE INDEX "dealer_contacts_email_idx" ON dealer_contacts(email);

-- =============================================================================
-- Step 8: Migrate existing contacts from dealer_users (OWNER role) to dealer_contacts
-- This creates an initial contact record for each dealer based on their owner user
-- =============================================================================

INSERT INTO dealer_contacts (id, "dealerId", "firstName", "lastName", email, phone, role, "isPrimary", "marketingOptIn", "communicationOptIn", "createdAt", "updatedAt")
SELECT 
  gen_random_uuid()::text,
  du."dealerId",
  CASE 
    WHEN du.name LIKE '% %' THEN SPLIT_PART(du.name, ' ', 1)
    ELSE du.name
  END,
  CASE 
    WHEN du.name LIKE '% %' THEN SUBSTRING(du.name FROM POSITION(' ' IN du.name) + 1)
    ELSE ''
  END,
  du.email,
  d.phone,
  'PRIMARY'::"DealerContactRole",
  true,
  false,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM dealer_users du
JOIN dealers d ON d.id = du."dealerId"
WHERE du.role = 'OWNER'
ON CONFLICT ("dealerId", email) DO NOTHING;
