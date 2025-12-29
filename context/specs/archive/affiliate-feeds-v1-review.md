# Affiliate Feeds v1 - Architecture Review

**Status:** Superseded
**Date:** 2025-12-26
**Reviewers:** Architecture Team

> **Note:** This document has been superseded. All questions have been resolved and incorporated into the master specification:
> **`context/specs/affiliate-feeds-v1.md`**
>
> This file is retained for historical reference only.

---

## 1. Executive Summary

This document reviews the Affiliate Feeds v1 Specification against the existing IronScout codebase and architecture. It identifies alignment with existing patterns, gaps requiring resolution, and additional questions beyond those in the original spec.

**Overall Assessment:** The spec is well-structured and most decisions align with existing patterns. Key concerns center on:
1. Data model conflicts with existing schema
2. Credential security gaps
3. Ambiguity around offer identity vs existing Price/Sku models
4. Scheduler implementation details

---

## 2. Alignment with Existing Patterns

### 2.1 What Aligns Well

| Spec Decision | Existing Pattern | Notes |
|---------------|------------------|-------|
| Harvester as scheduler owner | ADR-001, dealer scheduler | BullMQ repeatable jobs already proven |
| FTP transport | `ftp-fetcher.ts` | Already implemented for dealer feeds |
| CSV/GZIP support | Dealer connectors | Parsing infrastructure exists |
| 3 consecutive failures → auto-pause | Dealer feed pattern | Same logic in `feed-ingest.ts` |
| Run history tracking | `DealerFeedRun` model | Same structure proposed |
| Slack notifications | `@ironscout/notifications` | Channel already configured |
| Admin CRUD pattern | `apps/admin/app/dealers/` | Server actions + audit logging |

### 2.2 What Needs Adaptation

| Spec Decision | Current State | Gap |
|---------------|---------------|-----|
| `offers` table with identity resolution | No `Offer` model exists | Schema conflict (see §3) |
| Encrypted credentials | Plaintext in DB | Security gap (see §4) |
| Per-feed expiry policy | No expiry on dealer SKUs | New concept |
| Expiration spike detection | No equivalent | New feature |

---

## 3. Critical Schema Questions

### 3.1 Offer vs Existing Models

**Current Schema Reality:**
- `Price` model: Append-only price snapshots (ADR-004)
- `Sku` model: Canonical product identity (UPC-based)
- `Source` model: Already has affiliate fields (`affiliateNetwork`, `affiliateAdvertiserId`, etc.)
- `DealerSku` model: Dealer-specific product records

**Spec Proposes:**
- New `offers` table with `identity_type`, `identity_value`, `current_price`, `status`

**Conflict:** The spec's `offers` table stores `current_price` as a mutable field. This violates ADR-004 (append-only price history).

**Questions to Resolve:**

> **Q3.1.1:** Should affiliate "offers" write to the existing `Price` table (append-only) or is `offers.current_price` meant to be a denormalized "latest price" cache?

> **Q3.1.2:** How do affiliate offers relate to canonical `Sku` records? Options:
> - A) Affiliate offers create/link to `Sku` via UPC matching (like dealer feeds)
> - B) Affiliate offers are standalone and never match to canonical products
> - C) Affiliate offers are a separate pipeline that feeds into `Sku` via a matching job

> **Q3.1.3:** The spec says "treat key changes as new offers." If an Impact `itemId` changes but the product URL is the same, do we:
> - A) Create a new offer (spec says this)
> - B) Update the existing offer's identity
> - C) Mark old offer expired, create new one, link them

### 3.2 Retailer Relationship

**Spec:** `affiliate_feeds.retailer_id (fk, required)`

**Current Schema:** `Source` model already links to `Retailer` and has affiliate fields.

**Questions:**

> **Q3.2.1:** Should `affiliate_feeds` be a new table, or should we extend the existing `Source` model with feed configuration fields?

> **Q3.2.2:** If a retailer has both a direct Source and an affiliate feed Source, how do we handle:
> - Duplicate products from both sources?
> - Price conflicts between sources?
> - Which source takes precedence for display?

### 3.3 Model Naming

The spec uses snake_case (`affiliate_feeds`, `affiliate_feed_runs`). Our Prisma schema uses PascalCase models with camelCase fields.

> **Q3.3.1:** Confirm naming convention: `AffiliateFeed`, `AffiliateFeedRun`, `AffiliateFeedRunError`?

---

## 4. Security Concerns

### 4.1 Credential Storage

**Current State:** `DealerFeed.username` and `DealerFeed.password` are stored plaintext in the database and passed through BullMQ job data unencrypted.

**Spec Proposes:** `secret_encrypted` field for credentials.

**Gaps:**

1. No encryption utility exists in the codebase
2. No key management pattern established
3. Credentials would still pass through Redis (BullMQ) unless decrypted only at execution time

**Questions:**

> **Q4.1.1:** Encryption approach:
> - A) Symmetric encryption with env-based key (simple, single point of failure)
> - B) AWS KMS / GCP KMS integration (more secure, adds complexity)
> - C) HashiCorp Vault (enterprise pattern)

> **Q4.1.2:** Where does decryption occur?
> - A) In Harvester worker only, just before FTP connection
> - B) In API when preparing job data (credentials in Redis briefly)

> **Q4.1.3:** Should we retrofit encryption to existing `DealerFeed` credentials before shipping affiliate feeds?

### 4.2 Audit Logging

**Spec mentions:** `created_by` field on feeds.

**Current Pattern:** `logAdminAction()` in admin app logs changes.

> **Q4.2.1:** Should credential changes trigger special audit events beyond standard admin action logging?

---

## 5. Scheduler Implementation Details

### 5.1 Current Dealer Pattern

```typescript
// Dealer scheduler runs every 5 minutes
// Uses BullMQ repeatable job with idempotent job IDs
const jobId = `feed-${feed.id}-${schedulingWindow}`
```

### 5.2 Affiliate Feed Scheduling

**Spec:** `schedule_frequency_hours` (nullable int)

**Questions:**

> **Q5.1.1:** If `schedule_frequency_hours` is null, does the feed:
> - A) Never run automatically (manual only)
> - B) Use a system default (e.g., 24 hours)

> **Q5.1.2:** Scheduling granularity - the spec uses hours. Should we support:
> - A) Hours only (1, 2, 4, 6, 12, 24)
> - B) Cron expressions for flexibility
> - C) Minutes for testing (with production guardrails)

> **Q5.1.3:** How do we compute `next_run_at`?
> - A) Stored in DB, updated after each run
> - B) Computed from `last_run_at + frequency` (stateless)
> - C) BullMQ handles via repeatable job pattern

### 5.3 Run Mutual Exclusion

**Spec:** "Only one active run per feed at a time"

**Current Pattern:** BullMQ's job ID deduplication handles this for dealer feeds.

> **Q5.3.1:** For affiliate feeds, should we use:
> - A) BullMQ job ID deduplication (same pattern)
> - B) PostgreSQL advisory locks (spec mentions this)
> - C) Both (belt and suspenders)

> **Q5.3.2:** If a run is already in progress and "Run now" is clicked:
> - A) Return error "Run already in progress"
> - B) Queue after current run completes
> - C) Cancel current run and start new one

---

## 6. Ingest Pipeline Details

### 6.1 Identity Resolution

**Spec Priority:**
1. Impact `itemId`
2. Retailer SKU
3. Normalized URL hash

**Questions:**

> **Q6.1.1:** What is "normalized URL hash"? Define the normalization:
> - Remove query params?
> - Remove tracking params only?
> - Lowercase + remove trailing slashes?
> - MD5 or SHA256?

> **Q6.1.2:** If a row has both `itemId` and `sku`, we use `itemId`. But should we still store the `sku` for reference/debugging?

> **Q6.1.3:** Identity type is per-offer. Can it change over time? (e.g., first run has URL_HASH, later run has itemId for same product)

### 6.2 Partial Failure Handling

**Spec:** "Offers expire when unseen for `expiry_hours`"

> **Q6.2.1:** If a run processes 50% of rows then fails mid-file:
> - A) Rollback all upserts (all-or-nothing)
> - B) Keep successful upserts, mark run as FAILED
> - C) Keep upserts, mark run as PARTIAL_SUCCESS (new status)

> **Q6.2.2:** For kept upserts in a failed run, does `last_seen_at` update?
> - This affects expiry logic

### 6.3 Duplicate Rows in Single File

> **Q6.3.1:** If the same `itemId` appears twice in one file:
> - A) Last row wins (upsert semantics)
> - B) First row wins
> - C) Log error, skip duplicates
> - D) Fail the entire run

---

## 7. Expiration Logic

### 7.1 Expiration Timing

**Spec:** "Expiry evaluated only after successful runs"

> **Q7.1.1:** When exactly does expiration run?
> - A) Inline at end of successful ingest (same transaction)
> - B) Separate scheduled job (e.g., hourly cleanup)
> - C) Lazy expiration (check on read)

> **Q7.1.2:** If inline expiration fails but ingest succeeded:
> - A) Mark run as FAILED (loses ingest work)
> - B) Mark run as SUCCEEDED_WITH_WARNINGS (new status)
> - C) Mark run as SUCCEEDED, log error, retry expiration later

### 7.2 Expiration Spike Detection

**Spec:** ">30% of active offers expire in a single successful run"

> **Q7.2.1:** "Active offers" means:
> - A) All offers for this feed with status=ACTIVE before the run
> - B) Offers that were seen in the previous successful run

> **Q7.2.2:** If feed has 10 offers total and 4 expire (40%), we alert. But if feed has 1000 offers and 4 expire (0.4%), we don't. Is percentage-only the right metric, or should we also have an absolute threshold?

---

## 8. FTP Operational Details

### 8.1 Protocol Support

> **Q8.1.1:** Confirm FTP variants to support:
> - [ ] Plain FTP (port 21)
> - [ ] FTPS (explicit TLS)
> - [ ] FTPS (implicit TLS, port 990)
> - [ ] SFTP (SSH-based, port 22) - already implemented

> **Q8.1.2:** Passive vs Active mode:
> - A) Passive only (simpler, works behind NAT)
> - B) Configurable per feed

### 8.2 File Selection

**Spec mentions:** "Product Catalog file"

> **Q8.2.1:** How do we identify which file to download?
> - A) Fixed path configured per feed (e.g., `/feeds/catalog.csv.gz`)
> - B) Pattern matching (e.g., `catalog_*.csv.gz`, pick latest by mtime)
> - C) Always download all files in directory

> **Q8.2.2:** Reprocessing protection:
> - A) Store last processed file mtime/size, skip if unchanged
> - B) Content hash comparison (current dealer pattern)
> - C) Both

---

## 9. Admin UI Considerations

### 9.1 Feed Status Display

**Spec statuses:** DRAFT, ENABLED, PAUSED, DISABLED

> **Q9.1.1:** What's the difference between PAUSED and DISABLED?
> - PAUSED: Temporarily stopped, can resume
> - DISABLED: Permanently stopped?
> - Or is DISABLED = deleted but retained for history?

### 9.2 Credential Handling in UI

> **Q9.2.1:** When editing a feed, how do we handle the password field?
> - A) Show masked placeholder, only update if changed
> - B) Require re-entry on every edit
> - C) Separate "Update Credentials" action

### 9.3 Test Run Output

**Spec:** "Test validates download and parses sample rows"

> **Q9.3.1:** What does test return to UI?
> - Row count?
> - Sample of parsed data?
> - Validation errors?
> - All of the above?

> **Q9.3.2:** How many rows does test parse? (Full file could be huge)
> - A) First N rows (e.g., 100)
> - B) Stream until N valid rows found
> - C) Full parse but don't persist

---

## 10. Additional Architecture Questions (Beyond Original Spec)

### 10.1 Relationship to Existing Source Model

The existing `Source` model already has:
- `affiliateNetwork` enum
- `affiliateProgramId`, `affiliateAdvertiserId`, `affiliateCampaignId`
- `affiliateTrackingTemplate`
- `feedHash` for change detection
- `lastRunAt`

> **Q10.1.1:** Should `AffiliateFeed` be:
> - A) A new standalone model (spec approach)
> - B) An extension of `Source` with additional fields
> - C) A join table linking `Source` to feed configuration

### 10.2 Price History Integration

**ADR-004:** Price history is append-only.

> **Q10.2.1:** When an affiliate offer price changes, do we:
> - A) Insert new `Price` record (follows ADR-004)
> - B) Update `offers.current_price` only (violates ADR-004?)
> - C) Both (denormalized for query performance)

### 10.3 Search/Display Integration

> **Q10.3.1:** How do affiliate offers appear in search results?
> - A) Merged with canonical `Sku` products (need matching)
> - B) Separate "affiliate offers" section
> - C) Only shown when no canonical match exists

> **Q10.3.2:** Tier enforcement for affiliate data:
> - Free tier: Limited affiliate sources visible?
> - Premium tier: All sources?

### 10.4 Click Tracking (Deferred but Architected)

The spec correctly defers click tracking, but `Source.affiliateTrackingTemplate` exists.

> **Q10.4.1:** Confirm the deferred scope includes:
> - [ ] `buildTrackingUrl()` function (implement now)
> - [ ] Click redirect endpoint (defer)
> - [ ] Click event logging (defer)
> - [ ] Attribution/commission tracking (defer)

### 10.5 Multi-Network Future

**Spec:** "Future networks: CJ, AvantLink, ShareASale, others"

> **Q10.5.1:** Should the schema be network-agnostic now, or Impact-specific with migration later?
> - A) Generic `source_config` JSON (current spec)
> - B) Network-specific tables (`impact_feed_config`, `cj_feed_config`)
> - C) Union type with discriminator

---

## 11. Recommendations

### 11.1 Before Implementation

1. **Resolve Schema Conflict (§3.1):** Decide if `offers` is a new table or we extend existing models
2. **Implement Credential Encryption (§4.1):** Security requirement before storing API credentials
3. **Clarify Source Relationship (§10.1):** Avoid model proliferation

### 11.2 Implementation Approach

1. **Reuse Dealer Infrastructure:** BullMQ scheduler, FTP fetcher, notification channels
2. **New Connector:** `ImpactAffiliateConnector` in `apps/harvester/src/dealer/connectors/` (or new `affiliate/connectors/` directory)
3. **Admin UI:** Follow `apps/admin/app/dealers/` pattern with server actions
4. **Incremental Rollout:** Impact only first, validate before adding networks

### 11.3 Testing Requirements

Per `context/reference/testing.md`:
- Eligibility enforcement (ineligible feeds skipped)
- Append-only price writes (if using `Price` table)
- Fail-closed on parse errors
- Expiration only after successful runs
- Auto-pause after 3 failures

---

## 12. Open Questions Summary

### From Original Spec (§10.1-10.8)
- 10.1: Scheduler contract details
- 10.2: Run state machine and retries
- 10.3: Advisory locking scope
- 10.4: FTP operational details
- 10.5: Data write strategy
- 10.6: Expiry job placement
- 10.7: Slack alerting
- 10.8: Secrets and encryption

### Added by Architecture Review
- Q3.1.1-3: Offer vs existing models
- Q3.2.1-2: Retailer relationship
- Q3.3.1: Naming convention
- Q4.1.1-3: Encryption approach
- Q4.2.1: Audit logging
- Q5.1.1-3: Scheduling details
- Q5.3.1-2: Run mutual exclusion
- Q6.1.1-3: Identity resolution details
- Q6.2.1-2: Partial failure handling
- Q6.3.1: Duplicate rows
- Q7.1.1-2: Expiration timing
- Q7.2.1-2: Spike detection thresholds
- Q8.1.1-2: FTP protocol support
- Q8.2.1-2: File selection
- Q9.1.1: Status definitions
- Q9.2.1: Credential UI handling
- Q9.3.1-2: Test run output
- Q10.1.1: Source model relationship
- Q10.2.1: Price history integration
- Q10.3.1-2: Search/display integration
- Q10.4.1: Click tracking scope
- Q10.5.1: Multi-network schema

---

## 13. Next Steps

1. Schedule architecture review meeting
2. Answer critical questions (§3, §4, §10.1, §10.2)
3. Update spec with decisions
4. Create implementation tickets
5. Begin with credential encryption infrastructure

---

**Document Version:** 1.0
**Last Updated:** 2025-12-26
