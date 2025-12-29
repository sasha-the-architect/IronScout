# Affiliate Feeds v1 - Architecture Decisions

**Status:** Superseded
**Date:** 2025-12-26

> **Note:** This document has been superseded. All decisions are now consolidated in the master specification:
> **`context/specs/affiliate-feeds-v1.md`** (Appendix A: Decision Log)
>
> This file is retained for historical reference only.

---

This document records all architecture decisions made during the review of the Affiliate Feeds v1 specification.

---

## Section 3: Schema Decisions

### Q3.1.1: Offer vs Price Table
**Decision:** Affiliate ingest writes append-only price observations to the `Price` table. `offers.current_price` is a denormalized cache of the latest valid price.

### Q3.1.2: When to Write Price Row
**Decision:** Insert new `Price` row on change OR heartbeat (24h default). Price signature = `price_amount`, `currency`, and promo metadata if present.

### Q3.1.3: Identity Key Changes
**Decision:** Create a new offer. Old offer expires via normal expiry logic. No linking.

### Q3.2.1: AffiliateFeed vs Source Model
**Decision:** New `AffiliateFeed` model links 1:1 to `Source`. Source handles commercial attribution, AffiliateFeed handles ingestion operations.

### Q3.2.2: Duplicate Sources for Same Retailer
**Decision:** Option B now (one display-primary Source per Retailer), Option D later (canonical merge). Add `is_display_primary` boolean and `source_kind` enum to `Source`.

### Q3.3.1: Naming Convention
**Decision:** `AffiliateFeed`, `AffiliateFeedRun`, `AffiliateFeedRunError` (PascalCase models, camelCase fields).

---

## Section 4: Security Decisions

### Q4.1.1: Encryption Approach
**Decision:** AES-256-GCM with env-based key (`CREDENTIAL_ENCRYPTION_KEY`). Schema supports future KMS migration via `secret_key_id` and `secret_version` fields.

### Q4.1.2: Decryption Location
**Decision:** Decrypt in Harvester worker only, just before FTP connection. Job data contains `feedId` only. Credentials never pass through Redis.

### Q4.1.3: Retrofit Dealer Credentials
**Decision:** Separate ticket immediately after affiliate feeds ship. Encryption utility built once, used for both.

### Q4.2.1: Audit Logging for Credential Changes
**Decision:** Dedicated `CREDENTIAL_CHANGED` audit event. Log field names only (not values), actor, feed, timestamp. No Slack in v1.

---

## Section 5: Scheduler Decisions

### Q5.1.1: Null Schedule Frequency
**Decision:** Null frequency means manual only. No auto-runs.

**Rules:**
- `DRAFT` → never auto-run
- `ENABLED` + null frequency → manual only
- `ENABLED` + frequency set → scheduled
- `PAUSED` / `DISABLED` → never auto-run

### Q5.1.2: Scheduling Granularity
**Decision:** Hours only (1, 2, 4, 6, 12, 24) for v1. Cron expressions documented as future enhancement. "Run now" button required.

### Q5.1.3: Computing next_run_at
**Decision:** BullMQ repeatable jobs own scheduling. Store `lastRunAt` for UI only.

**Key rules:**
- Stable job key: `affiliate-feed:{feedId}`
- On frequency change: remove old repeatable, add new
- On pause/disable: remove repeatable immediately
- Advisory lock still required in worker

### Q5.3.1: Run Mutual Exclusion
**Decision:** Both BullMQ deduplication AND PostgreSQL advisory locks.
- BullMQ: `affiliate-feed-run:{feedId}` job ID for deduplication
- Worker: `pg_try_advisory_lock(feed_lock_id)` at execution start
- If lock not acquired: mark run `CANCELED`, exit without work

### Q5.3.2: "Run Now" During Active Run
**Decision:** Queue after current run completes.
- Coalesce via `manual_run_pending` flag
- Worker retries with short delay if lock not acquired
- UI shows "Run in progress. Manual run queued." warning

---

## Section 6: Ingest Pipeline Decisions

### Q6.1.1: Normalized URL Hash
**Decision:** Remove tracking params only, preserve product-relevant params.

**Normalization steps:**
1. Lowercase scheme and host (preserve path case)
2. Remove protocol (`http://`, `https://`)
3. Remove trailing slash
4. Strip tracking params: `utm_*`, `ref`, `aff*`, `affiliate*`, `clickid`, `click_id`, `subid`, `sub_id`, network-specific
5. Preserve variant params (size, caliber, color, SKU-like)
6. Sort remaining query params by key
7. SHA-256 hash

**Guardrail:** Log when URL-hash identity is used (data quality signal).

### Q6.1.2: Store Secondary Identifiers
**Decision:** Store all available identifiers on the offer record. Use only the resolved one for identity. Others are informational.

### Q6.1.3: Identity Type Changes
**Decision:** Identity type is immutable. Higher-priority identifier appearing later creates a new offer. Old offer expires naturally.

**Observability:** Emit `IDENTITY_UPGRADE_DETECTED` warning.

### Q6.2.1: Partial Failure Handling
**Decision:** Keep successful upserts, mark run as FAILED. No new status.

**Guardrails:**
- No expiry on failed runs
- Chunked commits (500-5000 rows per batch)
- Store `rows_parsed`, `offers_upserted`, `error_count`
- Add `is_partial` derived boolean

### Q6.2.2: last_seen_at on Failed Runs
**Decision:** Update `last_seen_at` as each offer is processed.

**Safeguard:** Add `last_seen_success_at` field on Offer.
- Successful run: update both
- Failed run: update only `last_seen_at`
- Expiry logic uses `last_seen_success_at`

### Q6.3.1: Duplicate Rows in File
**Decision:** Last row wins (upsert semantics).

**Observability:**
- Track `duplicate_key_count` per run
- Sample in `AffiliateFeedRunError` with code `DUPLICATE_ROW_SAME_IDENTITY`
- Duplicates don't count toward auto-pause

---

## Section 7: Expiration Decisions

### Q7.1.1: When Expiration Runs
**Decision:** Two-phase circuit breaker with query-time expiration (no status mutation).

**Phase 1: Ingest and Stage Presence**
1. Process file in batches, commit each
2. Update `lastSeenAt` as you process
3. Record "seen this run" in staging table: `source_product_seen(runId, sourceProductId)`

**Phase 2: Evaluate Circuit Breaker (BEFORE updating success timestamps)**
1. Compute: `activeCountBefore`, `seenSuccessCount`, `wouldExpireCount`
2. Apply thresholds
3. If spike detected: block activation, alert, set `expiryBlocked = true`
4. If no spike: promote `lastSeenSuccessAt` for seen products

**Key insight:** "Active" is derived from `NOW() - lastSeenSuccessAt <= expiryHours`. No status field mutation.

### Q7.1.2: Expiry Step Failure
**Decision:** Run stays `SUCCEEDED`. If circuit breaker trips, set `expiryBlocked = true` and `expiryBlockedReason`.

### Q7.2.1: Active Products Definition
**Decision:** All products for this feed where `NOW() - lastSeenSuccessAt <= expiryHours`.

### Q7.2.2: Spike Detection Thresholds
**Decision:** Block activation and alert if either:
- `(wouldExpireCount / activeCountBefore) > 30%` AND `wouldExpireCount >= 10`
- OR `wouldExpireCount >= 500`

### Q7.2.3: Admin Approval Action
**Decision:** Admin can "Approve Activation" for blocked runs:
1. Re-run Phase 2 promotion for that runId
2. Update `lastSeenSuccessAt` for products in `source_product_seen`
3. Set `expiryApprovedAt`, `expiryApprovedBy`
4. Clear `expiryBlocked` flag

---

## Section 8: FTP Decisions

### Q8.1.1: Protocol Support
**Decision:** FTP (plain, port 21) and SFTP (SSH, port 22) for v1. FTPS deferred.

### Q8.1.2: FTP Mode
**Decision:** Passive mode only.

### Q8.2.1: File Selection
**Decision:** Fixed path configured per feed. Pattern matching out of scope for v1.

### Q8.2.2: Reprocessing Protection
**Decision:** Both mtime/size precheck AND content hash.

**Algorithm:**
1. STAT file for mtime/size (if available)
2. If metadata matches → skip download
3. If changed → download
4. SHA256 of downloaded bytes (compressed if gzip)
5. If hash matches → `skipped_reason=UNCHANGED_HASH`
6. Store `last_remote_mtime`, `last_remote_size`, `last_content_hash`

---

## Section 9: Admin UI Decisions

### Q9.1.1: Status Definitions
**Decision:**
- **PAUSED** = operator-initiated stop. Can resume immediately.
- **DISABLED** = system-enforced stop (3 failures). Requires re-enable.

**UI copy:**
- PAUSED: "Paused by admin"
- DISABLED: "Disabled due to repeated failures"

### Q9.2.1: Credential UI Handling
**Decision:** Show masked placeholder, update only if new value entered.

**Guardrails:**
- Empty input = keep existing
- `CREDENTIAL_CHANGED` audit only when field non-empty
- Placeholder: "Leave blank to keep existing password"

### Q9.3.1: Test Run Output
**Decision:** Row count + sample parsed data (5-10 rows) + validation warnings/errors.

**Returns:**
- `success` boolean
- `rows_detected` count
- `format_detected`
- Sample rows (itemId, sku, title, price, url)
- Validation errors/warnings

### Q9.3.2: Test Row Limit
**Decision:** First 100 rows parsed, first 10 rows post-mapping returned to UI.

---

## Section 10: Integration Decisions

### Q10.3.1: Search/Display Integration
**Decision:** Merged with canonical SKU products.

**v1 rules:**
- Canonical SKU is anchor
- Affiliate offers attach via exact match (SKU or UPC)
- No fuzzy matching in v1
- Search filters by `is_display_primary = true`

### Q10.3.2: Tier Enforcement
**Decision:** Same tier rules as existing sources. Tiers affect features, not offer visibility.

### Q10.4.1: Click Tracking Scope
**v1 (implement):**
- ✅ `buildTrackingUrl()` function

**Deferred:**
- ❌ Click redirect endpoint
- ❌ Click event logging
- ❌ Attribution/commission tracking

### Q10.5.1: Multi-Network Schema
**Decision:** Single table with discriminator + common columns + `config_json`.

```
AffiliateFeed
├── id, source_id (1:1), network (enum)
├── status, schedule_frequency_hours, expiry_hours
├── transport (enum), host, port, path, username
├── secret_ciphertext, secret_key_id, secret_version
├── format, compression, config_json
└── feed_lock_id (BIGSERIAL for advisory locks)
```

---

## Section 10 (Original Spec): Remaining Items

### Q10.2.6: Retry Policy
**Decision:** BullMQ default (3 attempts, exponential backoff). Only retry transient errors. No retry for parse errors.

### Q10.3 Advisory Lock Key
**Decision:** Add `feed_lock_id BIGSERIAL NOT NULL UNIQUE` column for advisory locks.

### Q10.7.1: Slack Delivery
**Decision:** Harvester enqueues to `@ironscout/notifications` service.

### Q10.7.2: Slack Failure Impact
**Decision:** Slack errors logged but never fail the run.

### Q10.7.3: Slack Routing
**Decision:** Global ops channel for all affiliate feed alerts in v1.

---

## Schema Summary

### New Models

```prisma
model AffiliateFeed {
  id                     String   @id @default(cuid())
  source                 Source   @relation(fields: [sourceId], references: [id])
  sourceId               String   @unique

  network                AffiliateNetwork
  status                 AffiliateFeedStatus @default(DRAFT)

  // Scheduling
  scheduleFrequencyHours Int?
  expiryHours            Int      @default(48)
  consecutiveFailures    Int      @default(0)
  lastRunAt              DateTime?

  // Transport
  transport              FeedTransport @default(FTP)
  host                   String?
  port                   Int?
  path                   String?
  username               String?

  // Encrypted credentials
  secretCiphertext       Bytes?
  secretKeyId            String?
  secretVersion          Int      @default(1)

  // Format
  format                 FeedFormat @default(CSV)
  compression            FeedCompression @default(NONE)

  // Network-specific config
  configJson             Json?

  // Change detection
  lastRemoteMtime        DateTime?
  lastRemoteSize         BigInt?
  lastContentHash        String?

  // Advisory lock key
  feedLockId             BigInt   @default(autoincrement()) @unique

  // Metadata
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt
  createdBy              String?

  runs                   AffiliateFeedRun[]
}

model AffiliateFeedRun {
  id                String   @id @default(cuid())
  feed              AffiliateFeed @relation(fields: [feedId], references: [id])
  feedId            String

  status            AffiliateFeedRunStatus
  startedAt         DateTime @default(now())
  finishedAt        DateTime?
  durationMs        Int?

  // Metrics
  downloadBytes     BigInt?
  rowsRead          Int?
  rowsParsed        Int?
  offersUpserted    Int?
  offersExpired     Int?
  offersRejected    Int?
  errorCount        Int      @default(0)
  duplicateKeyCount Int      @default(0)

  // Flags
  isPartial         Boolean  @default(false)
  expiryStepFailed  Boolean  @default(false)
  skippedReason     String?

  // Artifact (future)
  artifactUrl       String?

  errors            AffiliateFeedRunError[]

  @@index([feedId, startedAt])
}

model AffiliateFeedRunError {
  id        String   @id @default(cuid())
  run       AffiliateFeedRun @relation(fields: [runId], references: [id])
  runId     String

  code      String
  message   String
  rowNumber Int?
  rawRow    Json?

  createdAt DateTime @default(now())
}

enum AffiliateFeedStatus {
  DRAFT
  ENABLED
  PAUSED
  DISABLED
}

enum AffiliateFeedRunStatus {
  QUEUED
  RUNNING
  SUCCEEDED
  FAILED
  CANCELED
}

enum FeedTransport {
  FTP
  SFTP
}

enum FeedFormat {
  CSV
}

enum FeedCompression {
  NONE
  GZIP
}
```

### Source Model Additions

```prisma
model Source {
  // ... existing fields ...

  // New fields
  isDisplayPrimary  Boolean @default(false)
  sourceKind        SourceKind @default(DIRECT)

  affiliateFeed     AffiliateFeed?
}

enum SourceKind {
  DIRECT
  AFFILIATE_FEED
  OTHER
}
```

### Offer Model Additions

```prisma
model Offer {
  // ... existing fields ...

  // New fields for affiliate support
  lastSeenAt          DateTime?
  lastSeenSuccessAt   DateTime?

  // Secondary identifiers (informational)
  impactItemId        String?
  sku                 String?
  normalizedUrlHash   String?
}
```

---

## Next Steps

1. Update original spec with all decisions
2. Create Prisma migration for new models
3. Implement credential encryption utility
4. Build admin UI following dealer pattern
5. Implement AffiliateFeed ingest worker
6. Add to Harvester scheduler

---

**Document Version:** 1.0
**Last Updated:** 2025-12-26
