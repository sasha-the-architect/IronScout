# Guides

This document defines **operational guides** for IronScout v1.

Guides answer the question:
> “How do I do this safely?”

They are distinct from runbooks:
- **Runbooks** = incident response
- **Guides** = routine operations and debugging

If a task is expected to be performed more than once, it belongs in a guide.

---

## Purpose of Guides

Guides exist to:
- Reduce reliance on memory
- Enable safe, repeatable actions
- Support a small team operating under load
- Prevent common mistakes

Guides prioritize **clarity and safety** over speed.

---

## Guide Principles

All guides must:
- Be step-by-step
- State prerequisites clearly
- Call out irreversible actions
- Include verification steps
- Favor “do no harm” defaults

If a step feels risky, it must be documented.

---

## Guide Index (v1)

The following guides are required for v1 operations.

---

### Guide: Affiliate Feeds Go-Live

**Purpose**
- Safely enable and validate the affiliate feed pipeline.

**Docs**
- `context/operations/affiliate-feeds-go-live.md`
- Verification SQL: `context/operations/affiliate_feeds_verify.sql`

---

### Guide: Debugging a Broken Retailer Feed (legacy naming)

**When to use**
- Merchant reports missing or incorrect inventory
- Ingestion errors appear for a Retailer feed

**Steps**
1. Open Admin app → Merchants → Feeds
2. Identify feed status and last execution
3. Inspect execution logs and error summaries
4. Determine if issue is format, connectivity, or mapping
5. Quarantine feed if data integrity is at risk
6. Notify Merchant of issue and next steps

**Verification**
- Feed no longer propagates bad data
- No downstream benchmarks or alerts run

---

### Guide: Quarantining a Feed Safely

**When to use**
- Feed produces malformed or dangerous data
- Duplicate or corrupt ingestion detected

**Steps**
1. Pause or disable the feed in Admin app
2. Confirm feed state is QUARANTINED
3. Verify no new executions are scheduled
4. Confirm API no longer surfaces affected data

**Verification**
- Consumer search excludes affected inventory
- Alerts do not trigger from feed data

---

### Guide: Verifying Retailer Eligibility Enforcement

**When to use**
- Merchant subscription changes
- Visibility-related incidents

**Steps**
1. Check Merchant subscription status
2. Confirm feed health
3. Verify API search results exclude Retailer when ineligible
4. Verify alerts are suppressed

**Verification**
- Retailer inventory is not visible in any consumer path

---

### Guide: Validating Uniform Capabilities

**When to use**
- New feature deployment
- Pricing changes

**Steps**
1. Test endpoint access as a standard consumer
2. Confirm responses are uniform across users
3. Inspect API responses directly
4. Confirm UI reflects server-shaped data

**Verification**
- No consumer-tier gating appears in responses

---

### Guide: Investigating Unexpected Alert Behavior

**When to use**
- Duplicate alerts
- Alerts firing incorrectly

**Steps**
1. Identify alert definition and owner
2. Inspect evaluation logs
3. Confirm Retailer eligibility at trigger time
4. Check deduplication keys

**Verification**
- Alerts behave deterministically on re-evaluation

---

### Guide: Deleting a Retailer Safely

> **⚠️ WARNING: Retailer deletion cascades to price history!**
>
> `prices.retailerId` uses CASCADE. Deleting a retailer **permanently deletes all price records** for that retailer.
>
> **Prefer soft-delete instead**: Set `visibilityStatus = 'INELIGIBLE'` or `'SUSPENDED'` to hide from consumers while preserving data.

**When to use (RARE)**
- Test data cleanup only
- Duplicate retailer with no valuable price history

**Prerequisites**
- Admin access to database
- Understanding that **all price history will be deleted**
- Confirmation this is not needed for historical analysis

**FK Constraints**

1. `sources.retailerId`: **Required + Restrict**
   - Sources must be reassigned or deleted first
   - Attempting to delete a retailer with sources will fail

2. `prices.retailerId`: **Required + Cascade**
   - All prices for this retailer will be deleted
   - This is why retailer deletion should be avoided

**Steps**
1. Identify the retailer to delete:
   ```sql
   SELECT id, name, "visibilityStatus" FROM retailers WHERE id = '<retailer_id>';
   ```

2. Check for dependent sources:
   ```sql
   SELECT id, url, status FROM sources WHERE "retailerId" = '<retailer_id>';
   ```

3. **If sources exist, choose one:**
   - **Reassign** to another retailer:
     ```sql
     UPDATE sources SET "retailerId" = '<new_retailer_id>' WHERE "retailerId" = '<retailer_id>';
     ```
   - **Delete** sources (if retailer is being permanently retired):
     ```sql
     -- First check for dependent executions, prices, etc.
     SELECT COUNT(*) FROM executions WHERE "sourceId" IN (SELECT id FROM sources WHERE "retailerId" = '<retailer_id>');
     -- Delete sources (prices.sourceId will be set to NULL, preserving history)
     DELETE FROM sources WHERE "retailerId" = '<retailer_id>';
     ```

   **Note**: `sources.retailerId` is required (NOT NULL). Sources cannot exist without a retailer.
   They must be either reassigned or deleted.

4. Check for merchant_retailers entries:
   ```sql
   SELECT * FROM merchant_retailers WHERE "retailerId" = '<retailer_id>';
   ```
   Delete these entries:
   ```sql
   DELETE FROM merchant_retailers WHERE "retailerId" = '<retailer_id>';
   ```

5. Check for pricing_snapshots (will be nullified on delete via SetNull):
   ```sql
   SELECT COUNT(*) FROM pricing_snapshots WHERE "retailerId" = '<retailer_id>';
   ```
   These will have `retailerId` set to NULL after deletion (preserving history per ADR-004/ADR-015).

6. Delete the retailer:
   ```sql
   DELETE FROM retailers WHERE id = '<retailer_id>';
   ```

**Verification**
- Retailer no longer exists in `retailers` table
- Sources are either reassigned, deactivated, or had FK nullified
- No broken FK references remain
- `pricing_snapshots.retailerId` is NULL for historical records (history preserved)

**Warning**
- This operation is irreversible
- Historical price data will lose retailer association
- Consider setting `visibilityStatus = 'INELIGIBLE'` instead if data preservation is needed

---

### Guide: Validating pricing_snapshots Retailer↔Merchant Alignment

**Context**
- `pricing_snapshots` records can have both `retailerId` (optional) and `merchantId` (required)
- When `retailerId` IS set, the pair `(retailerId, merchantId)` must be valid per `merchant_retailers`
- V1 constraint: one retailer belongs to exactly one merchant
- Composite index `pricing_snapshots_retailer_merchant_idx` supports efficient validation queries

**When to use**
- Periodic data integrity checks (weekly recommended)
- After affiliate feed pipeline changes
- After bulk data imports
- When investigating pricing anomalies

**Validation Query**
Find snapshots where `retailerId` is set but the retailer↔merchant pair is invalid:

```sql
-- Find pricing_snapshots with invalid retailerId↔merchantId pairs
SELECT
  ps.id,
  ps."canonicalSkuId",
  ps."retailerId",
  ps."merchantId",
  ps."createdAt",
  ps."ingestionRunType",
  ps."ingestionRunId"
FROM pricing_snapshots ps
WHERE ps."retailerId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM merchant_retailers mr
    WHERE mr."retailerId" = ps."retailerId"
      AND mr."merchantId" = ps."merchantId"
      AND mr.status = 'ACTIVE'
  )
ORDER BY ps."createdAt" DESC
LIMIT 100;
```

**Count Check** (for monitoring):
```sql
SELECT COUNT(*) AS misaligned_count
FROM pricing_snapshots ps
WHERE ps."retailerId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM merchant_retailers mr
    WHERE mr."retailerId" = ps."retailerId"
      AND mr."merchantId" = ps."merchantId"
      AND mr.status = 'ACTIVE'
  );
```

**Expected Result**: 0 misaligned records

**If Misalignment Found**
1. Identify the ingestion source (`ingestionRunType`, `ingestionRunId`)
2. Check if the merchant_retailers relationship changed after snapshot creation
3. If relationship legitimately changed: no action needed (historical accuracy)
4. If bad data ingested: investigate the write path and fix at source

**Note**: Merchant benchmark snapshots (`ingestionRunType = 'MANUAL'`) do NOT set `retailerId` - they have `retailerId = NULL`, which is correct and excluded from this check.

---

### Guide: Safe Feature Flag Use

**When to use**
- Temporarily disabling features
- Testing risky changes

**Steps**
1. Confirm flag scope and environment
2. Disable flag in staging first
3. Monitor for side effects
4. Apply to production if safe

**Verification**
- Feature behavior changes without breaking core flows

---

## Writing New Guides

When adding a guide:
- Name it by task, not system
- Assume the operator is tired
- Assume mistakes are easy to make
- Include “how to verify” explicitly

Guides should prevent incidents, not just respond to them.

---

## Non-Negotiables

- No undocumented operational tasks
- No reliance on tribal knowledge
- No “just do X in prod” instructions

---

## Guiding Principle

> Guides exist so operators don’t have to think under pressure.
