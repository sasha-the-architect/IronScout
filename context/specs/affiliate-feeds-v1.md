# Affiliate Feeds v1 - Complete Specification

**Status:** Ready for Implementation
**Date:** 2026-01-08
**Version:** 1.2

---

## 1. Overview

### 1.1 Purpose

Enable IronScout to ingest product catalog data from affiliate networks (starting with Impact) via scheduled FTP/SFTP file retrieval. This creates a new data source pipeline separate from retailer feeds, managed through the admin portal.

### 1.2 Scope

**In Scope (v1):**
- Impact network product catalog ingestion
- FTP and SFTP transport protocols
- CSV format with optional GZIP compression
- Scheduled and manual feed execution
- Offer expiration with spike detection
- Admin UI for feed CRUD and monitoring
- Encrypted credential storage

**Out of Scope (v1):**
- Other affiliate networks (CJ, AvantLink, ShareASale)
- FTPS protocol
- Click redirect endpoint and attribution tracking
- Pattern-based file selection
- Cron expressions for scheduling

### 1.3 Design Principles

1. **Append-only price history** - Follows ADR-004
2. **Fail closed on ambiguity** - Follows ADR-009
3. **Server-side enforcement** - Follows ADR-002
4. **Credential security** - Never in Redis, decrypt only at execution
5. **Reuse existing patterns** - BullMQ, retailer feed infrastructure (legacy dealer naming)

---

## 2. Data Model

### 2.1 New Models

#### AffiliateFeed

Links 1:1 to Source. Source handles commercial attribution, AffiliateFeed handles ingestion operations.

```prisma
model AffiliateFeed {
  id                     String   @id @default(cuid())
  source                 Source   @relation(fields: [sourceId], references: [id])
  sourceId               String   @unique

  network                AffiliateNetwork
  status                 AffiliateFeedStatus @default(DRAFT)

  // Scheduling
  scheduleFrequencyHours Int?                 // null = manual only
  nextRunAt              DateTime?            // null = not scheduled, set by scheduler
  expiryHours            Int      @default(48) // Valid range: 1-168 (see Section 2.8)
  consecutiveFailures    Int      @default(0)
  lastRunAt              DateTime?            // for UI display only

  // Transport
  transport              FeedTransport @default(SFTP)
  host                   String?
  port                   Int?
  path                   String?              // Fixed path, e.g., /feeds/catalog.csv.gz
  username               String?

  // Encrypted credentials (AES-256-GCM)
  secretCiphertext       Bytes?
  secretKeyId            String?              // For future KMS migration
  secretVersion          Int      @default(1)

  // Format
  format                 FeedFormat @default(CSV)
  compression            FeedCompression @default(NONE)

  // Network-specific config: REMOVED for v1
  // Impact column names are hardcoded in ingest code.
  // Re-introduce as `impactConfig Json` when variance is observed.

  // Change detection
  lastRemoteMtime        DateTime?
  lastRemoteSize         BigInt?
  lastContentHash        String?

  // Safety limits (Section 7.3.1)
  maxFileSizeBytes       BigInt?   // null = use default (500 MB)
  maxRowCount            Int?      // null = use default (500,000)

  // Advisory lock key (for PostgreSQL advisory locks)
  // Autoincrement ensures uniqueness within this database instance.
  // Note: Value is NOT stable across DB restores/clones. Locks only require
  // uniqueness within a single running database, which autoincrement guarantees.
  feedLockId             BigInt   @default(autoincrement()) @unique

  // Manual run queuing (see Section 6.3)
  manualRunPending       Boolean  @default(false)

  // Metadata
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt
  createdBy              String?

  runs                   AffiliateFeedRun[]

  @@map("affiliate_feeds")
}

enum AffiliateNetwork {
  IMPACT
  // Future: CJ, AVANTLINK, SHAREASALE
}

enum AffiliateFeedStatus {
  DRAFT     // Never auto-run
  ENABLED   // Scheduled or manual runs allowed
  PAUSED    // Operator-initiated stop, can resume immediately
  DISABLED  // System-enforced stop (3 failures), requires re-enable
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

#### AffiliateFeedRun

```prisma
model AffiliateFeedRun {
  id                String   @id @default(cuid())
  feed              AffiliateFeed @relation(fields: [feedId], references: [id])
  feedId            String

  // Denormalized for query convenience (avoids join through feed in dashboards/logs)
  sourceId          String

  trigger           AffiliateFeedRunTrigger @default(SCHEDULED)
  status            AffiliateFeedRunStatus
  startedAt         DateTime @default(now())
  finishedAt        DateTime?
  durationMs        Int?

  // Metrics
  downloadBytes     BigInt?
  rowsRead          Int?
  rowsParsed        Int?
  productsUpserted  Int?     // SourceProducts created/updated
  productsExpired   Int?     // Count of products that became stale
  productsRejected  Int?     // Rows that failed validation
  pricesWritten     Int?     // Price records appended
  errorCount        Int      @default(0)
  duplicateKeyCount Int      @default(0)
  urlHashFallbackCount Int?  // Products using URL_HASH identity (data quality signal, see 3.3.2)

  // Circuit breaker metrics (computed in Phase 2)
  activeCountBefore Int?     // Active products before this run
  seenSuccessCount  Int?     // Active products seen in this run
  wouldExpireCount  Int?     // Products that would expire if promoted

  // Flags
  isPartial         Boolean  @default(false)  // Derived: errorCount > 0 && productsUpserted > 0
  expiryStepFailed  Boolean  @default(false)
  skippedReason     String?                   // e.g., "UNCHANGED_HASH", "UNCHANGED_MTIME"

  // Expiry circuit breaker
  // Semantics: expiryBlocked=true means "promotion was blocked by circuit breaker"
  // It stays true even after approval. expiryApprovedAt IS NOT NULL is the approval signal.
  // Query: blocked && pending = expiryBlocked && expiryApprovedAt IS NULL
  //        blocked && approved = expiryBlocked && expiryApprovedAt IS NOT NULL
  expiryBlocked       Boolean  @default(false)
  expiryBlockedReason String?  // 'SPIKE_THRESHOLD_EXCEEDED' | 'DATA_QUALITY_URL_HASH_SPIKE'
  expiryApprovedAt    DateTime?  // Non-null = admin approved and promotion succeeded
  expiryApprovedBy    String?

  // Artifact (future)
  artifactUrl       String?

  errors            AffiliateFeedRunError[]
  seenProducts      SourceProductSeen[]        // Products observed in this run

  @@index([feedId, startedAt])
  @@index([feedId, trigger, startedAt])  // For UI filters and metrics by trigger type
  @@index([feedId, status, startedAt])   // For Approve Activation stale run check, run history filtering
  @@map("affiliate_feed_runs")
}

enum AffiliateFeedRunTrigger {
  SCHEDULED       // Scheduler claim flow
  MANUAL          // User clicked "Run Now"
  MANUAL_PENDING  // Follow-up run from manualRunPending flag
  ADMIN_TEST      // Test run from admin UI (if test runs create records)
}

enum AffiliateFeedRunStatus {
  RUNNING     // Lock acquired, run record created, execution in progress
  SUCCEEDED   // Completed successfully
  FAILED      // Completed with error
  // Note: No QUEUED status - run records are created only after lock acquisition (Section 6.3.3)
  // Note: No CANCELED status - lock-busy scenarios don't create run records (Section 6.3)
}
```

#### AffiliateFeedRunError

```prisma
model AffiliateFeedRunError {
  id        String   @id @default(cuid())
  run       AffiliateFeedRun @relation(fields: [runId], references: [id])
  runId     String

  code      String   // e.g., "PARSE_ERROR", "DUPLICATE_ROW_SAME_IDENTITY"
  message   String
  rowNumber Int?
  rawRow    Json?

  createdAt DateTime @default(now())

  @@map("affiliate_feed_run_errors")
}
```

### 2.2 Source Model Additions

> **⚠️ INVARIANT:** `Source.retailerId` is **required**. Affiliate sources must be attached to a Retailer. In v1, mapping is operator-defined and typically 1:1 with the Impact advertiser.

```prisma
model Retailer {
  id        String   @id @default(cuid())
  name      String
  // ... existing fields (website, logoUrl, tier, etc.) ...
  sources   Source[]
}

model Source {
  // ... existing fields ...

  // Required FK - all sources belong to a retailer
  retailer          Retailer @relation(fields: [retailerId], references: [id])
  retailerId        String

  // Display and kind
  isDisplayPrimary  Boolean @default(false)  // For multi-source retailer display
  sourceKind        SourceKind @default(DIRECT)

  // Optional affiliate metadata for v1 traceability
  affiliateNetwork     AffiliateNetwork?  // IMPACT only in v1
  affiliateAccountId   String?            // e.g., Impact advertiser/partner ID
  affiliateAccountName String?            // Copy for debugging/display

  affiliateFeed     AffiliateFeed?
  sourceProducts    SourceProduct[]

  @@index([retailerId], map: "sources_retailer_id_idx")
}

enum SourceKind {
  DIRECT          // Direct retailer integration
  AFFILIATE_FEED  // Affiliate network feed
  OTHER
}

enum AffiliateNetwork {
  IMPACT
  // Future: AVANTLINK, SHAREASALE, CJ, RAKUTEN
}
```

**Database constraint (partial unique index):**
```sql
CREATE UNIQUE INDEX sources_one_primary_per_retailer
ON sources(retailer_id)
WHERE is_display_primary = true;
```

This prevents multiple sources from being marked primary for the same retailer.

**v1 mapping rule:** Affiliate Source maps to a Retailer 1:1 with the Impact advertiser. Each Impact "advertiser" becomes one Retailer row, and Source references it. This is set in admin UI when creating the Source—not auto-discovered.

### 2.3 SourceProduct Model (Offer Entity)

Represents a product listing (offer) from a specific Source. Together with `SourceProductPresence` and `Price`, this forms the **offer system** with a **time-window activity model** (see Section 2.7).

```prisma
model SourceProduct {
  id                String   @id @default(cuid())
  source            Source   @relation(fields: [sourceId], references: [id])
  sourceId          String

  // Identity (one of these is the resolved key)
  identityType      SourceProductIdentityType
  identityValue     String

  // Product data
  title             String
  url               String                      // Canonical URL (no tracking params)
  imageUrl          String?

  // Secondary identifiers (informational, for debugging)
  impactItemId      String?
  sku               String?
  normalizedUrlHash String?

  // Run attribution
  createdByRunId    String?
  lastUpdatedByRunId String?

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  // Relations
  presence          SourceProductPresence?
  prices            Price[]
  seenInRuns        SourceProductSeen[]        // Runs where this product was observed

  @@unique([sourceId, identityType, identityValue])
  @@index([sourceId])
  @@index([impactItemId])
  @@index([sku])
  @@map("source_products")
}

enum SourceProductIdentityType {
  IMPACT_ITEM_ID
  SKU
  URL_HASH
}
```

### 2.4 SourceProductPresence Model (Activity Timestamps)

Tracks observation timestamps for deriving offer activity state. Part of the time-window activity model (see Section 2.7).

```prisma
model SourceProductPresence {
  id                    String        @id @default(cuid())
  sourceProduct         SourceProduct @relation(fields: [sourceProductId], references: [id], onDelete: Cascade)
  sourceProductId       String        @unique

  lastSeenAt            DateTime      // Updated on every observation (Phase 1)
  lastSeenSuccessAt     DateTime?     // NULL until first promotion; updated after circuit breaker passes (Phase 2)

  updatedAt             DateTime      @updatedAt

  @@index([lastSeenSuccessAt])        // Circuit breaker active count queries
  @@map("source_product_presence")
}
```

**Design notes:**
- No `status` enum - activity state derived from timestamps at query time
- `lastSeenSuccessAt` is **nullable** - NULL means "never promoted, not visible in search" (see Section 2.7)
- Index on `lastSeenSuccessAt` required for circuit breaker queries (Section 8.2)

### 2.5 SourceProductSeen Model (Staging Table)

Transient table for two-phase circuit breaker. Records which products were seen in each run.

```prisma
model SourceProductSeen {
  id              String   @id @default(cuid())
  runId           String
  sourceProductId String
  createdAt       DateTime @default(now())

  run           AffiliateFeedRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  sourceProduct SourceProduct    @relation(fields: [sourceProductId], references: [id], onDelete: Cascade)

  @@unique([runId, sourceProductId])  // Creates btree on (run_id, source_product_id)
  @@index([runId])                    // Redundant but explicit for runId-only queries
  @@map("source_product_seen")
}
```

**Index coverage:**
- `@@unique([runId, sourceProductId])` creates a btree index that supports:
  - Circuit breaker count query: `WHERE run_id = :runId` (uses leading column)
  - Promotion join: `WHERE run_id = :runId` joining on `source_product_id`
- `@@index([runId])` is technically redundant (composite unique covers it) but kept for clarity

**Retention:** Delete with run cleanup (30 days). Cascades on run delete.

### 2.6 Price Model (Extended for Affiliate Dedupe)

Price remains append-only per ADR-004. Affiliate ingest writes Price records like any other source, with additional fields for retry-safe deduplication.

```prisma
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ PLATFORM INVARIANT: The `prices` table must NEVER gain additional unique
// constraints. Doing so will silently drop inserts due to ON CONFLICT DO NOTHING
// in affiliate feed ingest. This is enforced via migration test (Section 18.1.1).
// ═══════════════════════════════════════════════════════════════════════════
model Price {
  // ... existing fields ...

  // Link to SourceProduct for affiliate prices
  sourceProductId        String?
  sourceProduct          SourceProduct? @relation(fields: [sourceProductId], references: [id])

  // Affiliate price deduplication (nullable - only set for affiliate pipeline)
  affiliateFeedRunId     String?        // Run that created this price
  priceSignatureHash     String?        // SHA-256 of (amount|currency|promoJson) for dedupe

  // onDelete: SetNull preserves price rows when runs are cleaned up (Section 15.5)
  affiliateFeedRun       AffiliateFeedRun? @relation(fields: [affiliateFeedRunId], references: [id], onDelete: SetNull)

  // Partial unique index for affiliate dedupe - see Section 18.1
  // @@index([sourceProductId, affiliateFeedRunId, priceSignatureHash]) -- covered by partial unique
}
```

**Affiliate deduplication fields:**

| Field | Purpose | When Set |
|-------|---------|----------|
| `affiliateFeedRunId` | Links price to the run that created it | Affiliate ingest only |
| `priceSignatureHash` | Hash of price signature for dedupe | Affiliate ingest only |

These fields are **nullable** and only populated by the affiliate pipeline. Existing price queries and indexes are unaffected. The partial unique index (Section 18.1) ensures affiliate price inserts are idempotent per `(sourceProductId, runId, signature)`.

**Signature hash computation:**

```typescript
import { createHash } from 'crypto';

function computePriceSignatureHash(
  amount: number,
  currency: string,
  promoJson: object | null
): string {
  const canonical = JSON.stringify({
    amount,
    currency,
    promo: promoJson ?? null,
  });
  return createHash('sha256').update(canonical).digest('hex').slice(0, 32);
  // 32 hex chars (128 bits) - eliminates collision risk at scale
  // Storage cost difference vs 64-bit is noise; removes a class of "impossible" bugs
}
```

Current price is derived from the latest valid `Price` record for a SourceProduct.

### 2.7 Offer System Architecture (Time-Window Activity Model)

The combination of `SourceProduct`, `SourceProductPresence`, and `Price` forms the **offer system** - the representation of product listings from affiliate sources.

**Why document this explicitly:** Future engineers may be tempted to add `status` enum fields to track offer lifecycle. This section explains why that's unnecessary and would create conflicts.

**The time-window activity model:**

```
┌─────────────────────────────────────────────────────────────────────┐
│                         OFFER SYSTEM                                │
│                                                                     │
│  ┌──────────────────┐  1:1  ┌─────────────────────┐                │
│  │  SourceProduct   │──────▶│ SourceProductPresence│                │
│  │                  │       │                     │                │
│  │  - identity      │       │  - lastSeenAt       │                │
│  │  - title, url    │       │  - lastSeenSuccessAt│                │
│  │  - metadata      │       │                     │                │
│  └────────┬─────────┘       └─────────────────────┘                │
│           │                                                         │
│           │ 1:N                                                     │
│           ▼                                                         │
│  ┌──────────────────┐                                              │
│  │      Price       │  (append-only per ADR-004)                   │
│  │                  │                                              │
│  │  - amount        │                                              │
│  │  - currency      │                                              │
│  │  - createdAt     │                                              │
│  └──────────────────┘                                              │
└─────────────────────────────────────────────────────────────────────┘
```

**Derived lifecycle states (not stored, computed at query time):**

| State | Derivation | Meaning |
|-------|------------|---------|
| Pending (new) | `lastSeenSuccessAt IS NULL` | Never promoted, not yet visible in search |
| Pending (update) | `lastSeenSuccessAt IS NOT NULL AND lastSeenAt > lastSeenSuccessAt` | Re-seen in Phase 1, awaiting Phase 2 |
| Active | `lastSeenSuccessAt IS NOT NULL AND now() - lastSeenSuccessAt <= expiryHours` | Offer is current, show in search |
| Stale | `lastSeenSuccessAt IS NOT NULL AND now() - lastSeenSuccessAt > expiryHours` | Offer expired, exclude from search |

**NULL semantics for `lastSeenSuccessAt` (critical):**

When a SourceProduct is first observed, its presence is created with:
- `lastSeenAt = now()` - marks observation time
- `lastSeenSuccessAt = NULL` - **not yet promoted**

This means:
- New products are **invisible in search** until Phase 2 promotes them
- New products are **excluded from circuit breaker denominator** (`activeCountBefore`)
- This is intentional: fail-closed behavior per ADR-009

**Presence creation (Phase 1):**
```sql
INSERT INTO source_product_presence (source_product_id, last_seen_at, last_seen_success_at)
VALUES (:sourceProductId, NOW(), NULL)  -- NULL = pending promotion
ON CONFLICT (source_product_id) DO UPDATE
SET last_seen_at = NOW();
```

**Visibility query (search):**
```sql
-- Only show products that have been successfully promoted at least once
WHERE spp.last_seen_success_at IS NOT NULL
  AND NOW() - spp.last_seen_success_at <= (:expiryHours * interval '1 hour')
```

**Why this is correct:**
- First run of a new feed: all products are new, all have NULL `lastSeenSuccessAt`
- Circuit breaker sees `activeCountBefore = 0`, so no spike is possible
- Phase 2 promotes all, setting `lastSeenSuccessAt` for the first time
- Products become visible only after successful promotion
- If circuit breaker blocks, new products remain invisible (safe)

**Why no status enum:**
- Status enums require mutation logic and state machine validation
- Timestamps are simpler: update one field, derive state at query time
- No "invalid state" bugs (e.g., status=ACTIVE but timestamps say otherwise)
- Circuit breaker works by blocking `lastSeenSuccessAt` updates, not status transitions

**Anti-pattern to avoid:**
```prisma
// ❌ DO NOT ADD - creates redundant state that can conflict with timestamps
model SourceProduct {
  status  OfferStatus  // ACTIVE, STALE, PENDING - DON'T DO THIS
}
```

**Correct pattern:**
```sql
-- ✅ Derive activity at query time
WHERE now() - spp.last_seen_success_at <= (feed.expiry_hours * interval '1 hour')
```

### 2.8 Validation Requirements

Certain fields have strict domain constraints that must be enforced at API boundaries. Invalid values in these fields can silently defeat safety mechanisms.

#### 2.8.1 `expiryHours` Validation

| Constraint | Value | Rationale |
|------------|-------|-----------|
| Type | Integer | Required for interval arithmetic |
| Minimum | 1 | Zero or negative instantly expires all products |
| Maximum | 168 (7 days) | Unbounded values create silent data retention issues |
| Default | 48 | 2 days is reasonable for most affiliate feeds |

**Application-level validation (required):**

Validate on all API boundaries:
- Feed create
- Feed update
- Test run configuration
- Enable transition (DRAFT/PAUSED/DISABLED → ENABLED)

```typescript
function validateExpiryHours(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > 168) {
    throw new ValidationError('expiryHours must be an integer between 1 and 168 hours');
  }
}
```

**Database constraint (defense-in-depth):**

```sql
ALTER TABLE affiliate_feeds
ADD CONSTRAINT expiry_hours_range
CHECK (expiry_hours BETWEEN 1 AND 168);
```

This constraint is best-effort backup, not relied upon exclusively. Application validation is the primary enforcement.

**Why this matters:**
- `expiryHours = 0` would instantly expire all products on every run
- Negative values break interval arithmetic and produce undefined behavior
- Unbounded values (e.g., 10000) silently disable expiration, accumulating stale data
- Invalid values defeat the circuit breaker without triggering alerts

#### 2.8.2 `expiryHours` Change Semantics

**Product decision:** Changing `expiryHours` retroactively changes what is considered "active."

| Effect | Behavior |
|--------|----------|
| Search visibility | Immediate - products may appear/disappear based on new window |
| Circuit breaker `activeCountBefore` | Immediate - next run uses new expiry window |
| Historical runs | Unchanged - run metrics reflect state at run time |

**Example:** Feed has 1000 active products with `expiryHours = 48`. Admin changes to `expiryHours = 24`. Products last seen 25-48 hours ago immediately become stale (invisible in search). Next run's circuit breaker sees smaller `activeCountBefore`.

**Accepted for v1.** This is the simpler model: one source of truth for expiry. Audit log on change provides explainability.

**Post-v1 option:** Store `expiryHoursAtRun` on `AffiliateFeedRun` for debugging/explainability. Allows answering: "what expiry window did this run use?"

---

## 3. Identity Resolution

### 3.1 Priority Order

1. Impact `itemId` (network-assigned)
2. Retailer SKU
3. Normalized URL hash (fallback)

### 3.2 Identity Key Composition

SourceProduct uses `(sourceId, identityType, identityValue)` as unique key.

Examples:
- `(source_123, IMPACT_ITEM_ID, abc123)`
- `(source_123, SKU, FEDERAL-9MM-1000)`
- `(source_123, URL_HASH, a1b2c3d4...)`

### 3.3 Immutability Rule

Identity type is immutable once set. If a higher-priority identifier appears later (e.g., feed adds `itemId` to a row previously identified by URL hash), a **new SourceProduct** is created. The old one expires naturally via presence tracking.

**Observability:** Emit `IDENTITY_UPGRADE_DETECTED` warning when this occurs.

### 3.3.1 Identity Flap Detection (Post-v1)

**Status: DEFERRED.** The URL_HASH quality gate (Section 3.3.2) provides sufficient protection for v1. Flap detection is a "nice warning" feature, not a safety feature.

**Problem it would solve:** A feed with intermittent data quality issues (SKU present in some runs, missing in others) can create runaway duplicate SourceProducts. Each "upgrade" creates a new product, and the cycle repeats.

**Post-v1 implementation:**
- Track identity type changes per normalized URL across runs
- Emit `IDENTITY_FLAP_DETECTED` if same URL produces different `identityType` values within last N runs
- Consider auto-pause if flap count exceeds threshold

**Why deferred:** URL_HASH spike blocking (Section 3.3.2) catches the primary failure mode (excessive URL_HASH fallback). Flap detection adds observability but not safety. Cutting this speeds v1 delivery.

### 3.3.2 URL_HASH Quality Gate

**Problem:** `URL_HASH` is the lowest-priority fallback. High URL_HASH usage indicates missing `itemId`/`SKU` data - a feed quality issue that can cause:
- Duplicate products from path case variance
- Identity flaps when SKUs appear/disappear
- Harder debugging (no stable identifier)

**Quality gate (v1):**

Track `urlHashFallbackCount` per run. If `URL_HASH` exceeds threshold:

| Metric | Threshold | Action |
|--------|-----------|--------|
| `urlHashFallbackPercent` | > 50% | Block with `DATA_QUALITY_URL_HASH_SPIKE` |
| `urlHashFallbackCount` | > 1000 | Block with `DATA_QUALITY_URL_HASH_SPIKE` |

**Block behavior:**
- Run marked `SUCCEEDED` (data was ingested)
- `expiryBlocked = true`
- `expiryBlockedReason = 'DATA_QUALITY_URL_HASH_SPIKE'`
- Products staged but NOT promoted (same as expiry spike)
- Alert via Slack
- Admin can approve activation if URL_HASH usage is acceptable for this feed

```typescript
// After Phase 1, before Phase 2 promotion
function checkUrlHashQuality(run: AffiliateFeedRun): BlockReason | null {
  const urlHashPercent = run.urlHashFallbackCount / run.productsUpserted;

  if (urlHashPercent > 0.5 || run.urlHashFallbackCount > 1000) {
    return {
      blocked: true,
      reason: 'DATA_QUALITY_URL_HASH_SPIKE',
      details: {
        urlHashFallbackCount: run.urlHashFallbackCount,
        urlHashFallbackPercent: urlHashPercent,
        productsUpserted: run.productsUpserted,
      }
    };
  }
  return null;
}
```

**Run metric to add:**

```prisma
model AffiliateFeedRun {
  // ... existing fields ...
  urlHashFallbackCount  Int?  // Count of products using URL_HASH identity
}
```

**Why this threshold:**
- 50% URL_HASH means half the feed lacks stable identifiers
- 1000 absolute cap catches small feeds with 100% URL_HASH
- Both indicate the feed provider should be contacted to include itemId/SKU

### 3.4 URL Normalization Steps

1. Lowercase scheme and host (preserve path case)
2. Remove protocol (`http://`, `https://`)
3. Remove trailing slash
4. Strip **known tracking params only**: `utm_*`, `ref`, `aff*`, `affiliate*`, `clickid`, `click_id`, `subid`, `sub_id`, network-specific (Impact tracking params)
5. Keep all other params (do not attempt semantic param classification in v1)
6. Sort remaining query params by key
7. SHA-256 hash

**v1 simplification:** No "variant param" detection. Classifying params as "product variant" vs "tracking" is error-prone and retailer-specific. Keep all non-tracking params; let the hash differentiate. If this creates false duplicates (same product, different param order), sorting handles it. If it creates false splits (tracking param not in blocklist), the product expires naturally and gets re-created - acceptable for v1.

**Why preserve path case:** Most web servers treat paths as case-sensitive. Lowercasing would incorrectly merge distinct products.

**Path case collision detection:**

Some retailers treat paths case-insensitively, producing URLs like:
- `example.com/Product-123`
- `example.com/product-123`

These would create two SourceProducts for the same actual product.

**v1 guardrails (optimized):**
- Only check for collisions when URL_HASH identity is used (lowest-priority fallback)
- Only compute case-insensitive hash at collision check time, not for every row
- Detection triggers only when **creating** a new URL_HASH identity:

```typescript
// Only runs when: identityType === 'URL_HASH' && isNewProduct
async function checkPathCaseCollision(url: string, sourceId: string): Promise<void> {
  const caseInsensitiveHash = hashUrl(url, { lowercasePath: true });

  // Check if another product exists with same case-insensitive hash
  const collision = await prisma.sourceProduct.findFirst({
    where: {
      sourceId,
      identityType: 'URL_HASH',
      // Different case-sensitive hash but same case-insensitive
      normalizedUrlHash: { not: hashUrl(url) },
    },
    select: { url: true, normalizedUrlHash: true }
  });

  // To find collisions, we'd need a stored caseInsensitiveHash column
  // For v1: skip DB lookup, just log URL_HASH usage as a data quality signal
  // Post-v1: add normalizedUrlHashInsensitive column if collisions become an issue
}
```

**v1 simplified approach:**
- Log `URL_HASH_FALLBACK` when URL-hash identity is used (data quality signal)
- Defer collision detection to post-v1 if URL_HASH usage is high for a feed
- Avoids computing two hashes per row

**Future (post-v1):**
- Add `normalizedUrlHashInsensitive` column to SourceProduct
- Per-feed `urlNormalizationMode` option: `PRESERVE_PATH_CASE` (default) or `LOWERCASE_PATH`
- Admin can flip mode for retailers with case-insensitive servers

### 3.5 Secondary Identifier Storage

All available identifiers are stored on SourceProduct for debugging/reference:
- `impactItemId`
- `sku`
- `normalizedUrlHash`

Only the resolved identity key (identityType + identityValue) is used for upsert matching.

---

## 4. Price Observation Strategy

### 4.1 Append-Only Compliance (ADR-004)

Affiliate ingest writes append-only price observations to the `Price` table. Current price is derived from the latest valid `Price` record - no denormalized cache field.

### 4.2 When to Write Price Row

Insert new `Price` row when **any** of the following are true:

1. **No prior price exists** for this SourceProduct
2. **Price signature changed** from the most recent Price record
3. **Heartbeat interval exceeded** since the most recent Price record

**Price Signature** (all must match to skip write):
- `priceAmount`
- `currency`
- Promo metadata (if present)

**Heartbeat Rules:**
- Interval: 24 hours (configurable per feed or global default)
- Measured from: `Price.createdAt` of the most recent price for this SourceProduct
- Scope: Per SourceProduct, not per feed
- Purpose: Ensures price history shows "still at this price" even when unchanged

**CRITICAL: Price evaluation must not perform per-row DB reads.**

A 50K row file with per-row queries is a self-inflicted outage. Worker must batch-fetch latest prices per chunk.

### 4.2.1 Batch Processing Pattern

Process rows in chunks (e.g., 1000 rows). For each chunk:

1. **Resolve identities** and upsert `SourceProduct` records for the chunk
2. **Batch-fetch last prices** for all `sourceProductId`s in one query
3. **Decide writes in-memory** using a run-local cache
4. **Bulk insert** new `Price` rows with `createMany`

**Batch fetch query (DISTINCT ON):**

```sql
-- Fast with index on (source_product_id, created_at DESC)
SELECT DISTINCT ON (p.source_product_id)
  p.source_product_id,
  p.created_at,
  p.price_amount,
  p.currency,
  p.promo_json
FROM prices p
WHERE p.source_product_id = ANY(:sourceProductIds)
ORDER BY p.source_product_id, p.created_at DESC;
```

**Run-local price cache:**

```typescript
// Maintained across chunks within a single run
const lastPriceCache = new Map<string, LastPriceRecord>();

async function processChunk(
  runId: string,  // Required for dedupe fields
  rows: ParsedRow[],
  heartbeatHours: number = 24
): Promise<void> {
  // Step 1: Resolve identities and upsert SourceProducts
  const sourceProducts = await upsertSourceProducts(rows);
  const sourceProductIds = sourceProducts.map(sp => sp.id);

  // Step 2: Batch-fetch last prices (only for IDs not already in cache)
  const uncachedIds = sourceProductIds.filter(id => !lastPriceCache.has(id));
  if (uncachedIds.length > 0) {
    const lastPrices = await fetchLastPrices(uncachedIds);
    for (const lp of lastPrices) {
      lastPriceCache.set(lp.sourceProductId, lp);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MEMORY GUARD: Abort if cache exceeds maxRowCount
  // This prevents OOM from feeds with more unique products than expected.
  // The cache grows with unique products, not rows. If a feed has 1M unique
  // products despite row limits, we'd OOM without this guard.
  // ═══════════════════════════════════════════════════════════════════════════
  const maxProducts = feed.maxRowCount ?? DEFAULT_MAX_ROW_COUNT;
  if (lastPriceCache.size > maxProducts) {
    throw new UniqueProductLimitExceeded(lastPriceCache.size, maxProducts);
  }

  // Step 3: Decide writes in-memory
  const pricesToWrite: NewPriceRecord[] = [];
  for (const row of rows) {
    const sourceProductId = row.resolvedSourceProductId;
    const newSignature = computeSignature(row);
    const signatureHash = computePriceSignatureHash(row.price, row.currency, row.promo);
    const lastPrice = lastPriceCache.get(sourceProductId);

    const decision = shouldWritePrice(lastPrice, newSignature, heartbeatHours);
    if (decision.write) {
      const newPrice = {
        sourceProductId,
        priceAmount: row.price,
        currency: row.currency,
        promoJson: row.promo,
        createdAt: new Date(),
        // Dedupe fields for retry safety (Section 2.6)
        affiliateFeedRunId: runId,
        priceSignatureHash: signatureHash,
      };
      pricesToWrite.push(newPrice);
      // Update cache so later chunks see this write
      lastPriceCache.set(sourceProductId, newPrice);
    }
  }

  // Step 4: Bulk insert with conflict suppression
  // ═══════════════════════════════════════════════════════════════════════════
  // CONFLICT HANDLING STRATEGY:
  //
  // We use ON CONFLICT DO NOTHING (no target). PostgreSQL will suppress conflicts
  // on ANY unique constraint/index, including our partial index `prices_affiliate_dedupe`.
  //
  // ⚠️ CRITICAL CONSTRAINT: The `prices` table MUST NOT have any other unique
  // constraints or indexes. If one is added, conflicts on that constraint would
  // be silently suppressed, causing data loss.
  //
  // This is ENFORCED via migration test (Section 18.1.1), not just code review.
  //
  // Why not ON CONFLICT (cols) WHERE ... DO NOTHING?
  // - PostgreSQL does NOT support targeting a partial unique index using
  //   ON CONFLICT (col1, col2) WHERE predicate. That syntax is invalid and will
  //   error at runtime. You can only use WHERE in CREATE INDEX, not ON CONFLICT.
  //
  // Why not ON CONFLICT ON CONSTRAINT?
  // - ON CONFLICT ON CONSTRAINT only works with named TABLE constraints (created
  //   via ALTER TABLE ADD CONSTRAINT). Partial unique indexes cannot be named
  //   constraints. Converting to a constraint would require a generated column
  //   or sentinel value to handle the nullable affiliateFeedRunId.
  //
  // GUARANTEE: Retry-safe under current schema constraints. The migration test
  // ensures no additional unique constraints can be added without failing CI.
  // ═══════════════════════════════════════════════════════════════════════════
  if (pricesToWrite.length > 0) {
    const result = await prisma.$executeRaw`
      INSERT INTO prices (
        id, source_product_id, price_amount, currency, promo_json, created_at,
        affiliate_feed_run_id, price_signature_hash
      )
      SELECT
        gen_random_uuid(),
        unnest(${pricesToWrite.map(p => p.sourceProductId)}::text[]),
        unnest(${pricesToWrite.map(p => p.priceAmount)}::numeric[]),
        unnest(${pricesToWrite.map(p => p.currency)}::text[]),
        unnest(${pricesToWrite.map(p => JSON.stringify(p.promoJson))}::jsonb[]),
        unnest(${pricesToWrite.map(p => p.createdAt)}::timestamptz[]),
        unnest(${pricesToWrite.map(p => p.affiliateFeedRunId)}::text[]),
        unnest(${pricesToWrite.map(p => p.priceSignatureHash)}::text[])
      ON CONFLICT DO NOTHING
    `;
    // Increment pricesWritten from DB rowCount, not array length
    // This ensures accurate metrics even if duplicates were suppressed
    pricesWrittenCount += result;
  }
}

// Pure function - no DB access
function shouldWritePrice(
  lastPrice: LastPriceRecord | undefined,
  newSignature: PriceSignature,
  heartbeatHours: number
): { write: boolean; reason: 'new' | 'changed' | 'heartbeat' | null } {
  // Case 1: No prior price - always write
  if (!lastPrice) {
    return { write: true, reason: 'new' };
  }

  // Case 2: Signature changed
  if (!signaturesMatch(lastPrice, newSignature)) {
    return { write: true, reason: 'changed' };
  }

  // Case 3: Heartbeat due
  const hoursSinceLastPrice =
    (Date.now() - lastPrice.createdAt.getTime()) / (1000 * 60 * 60);
  if (hoursSinceLastPrice >= heartbeatHours) {
    return { write: true, reason: 'heartbeat' };
  }

  // No write needed
  return { write: false, reason: null };
}
```

### 4.2.2 Edge Cases

**New products:** Products not in the cache after batch-fetch have no prior price. Treat as `reason='new'`.

**Duplicates in file:** "Last row wins" means collapse rows by identity within the chunk before deciding price writes. Otherwise you write two price rows in the same run for the same product.

```typescript
// Dedupe within chunk before processing
const deduped = new Map<string, ParsedRow>();
for (const row of chunkRows) {
  deduped.set(row.identityKey, row); // Last row wins
}
const rows = Array.from(deduped.values());
```

**Cross-chunk duplicates:** If the same product appears in chunk 1 and chunk 2, chunk 2's batch-fetch would be stale. The run-local `lastPriceCache` solves this by updating after each batch insert.

**Important:** Heartbeat uses `Price.createdAt`, NOT `SourceProductPresence.lastSeenAt`. These timestamps serve different purposes:
- `Price.createdAt`: When we last recorded a price observation
- `lastSeenAt`: When we last saw this product in any feed run

### 4.3 Current Price Derivation

Current price is always derived via query:
```sql
SELECT * FROM prices
WHERE source_product_id = ?
ORDER BY created_at DESC
LIMIT 1
```

No cache field. This keeps Price as the single source of truth per ADR-004.

**Required index for performance:**
```sql
CREATE INDEX prices_source_product_latest
ON prices(source_product_id, created_at DESC);
```

Without this index, the lateral join in search queries will be expensive at scale.

**Future optimization (post-v1):**

If query performance degrades, consider a materialized `latest_prices` table:
- Populated by trigger or async job on Price insert
- Stays ADR-004 compliant (Price remains append-only, cache is derived)
- Search queries join to cache instead of lateral subquery

For v1, the index is sufficient. Monitor query latency and add materialization if needed.

---

## 5. Scheduling

### 5.1 Schedule Rules

| Status | Frequency | Behavior |
|--------|-----------|----------|
| DRAFT | any | Never auto-run |
| ENABLED | null | Manual only |
| ENABLED | 1-24h | Scheduled |
| PAUSED | any | Never auto-run |
| DISABLED | any | Never auto-run |

### 5.2 Frequency Options (v1)

Hours only: 1, 2, 4, 6, 12, 24

Cron expressions documented as future enhancement.

### 5.3 Scheduler Integration (ADR-001 Compliant)

Affiliate feeds use the **singleton Harvester scheduler** pattern, not BullMQ repeatable jobs.

**Scheduler loop behavior:**
- Singleton scheduler ticks on interval (e.g., every 60 seconds)
- Each tick: **atomically claim** due feeds using `FOR UPDATE SKIP LOCKED`
- Enqueue jobs to BullMQ for claimed feeds: `affiliate-feed-ingest:{feedId}`
- BullMQ handles execution only, not scheduling

**Multi-network behavior (v1):**

v1 only supports Impact. Scheduler claims due feeds across all networks - no network predicate is required. One queue, one scheduler, one mental model.

**v2 consideration:** When additional networks exist (CJ, AvantLink, etc.), keep one scheduler tick by default. Add network-based partitioning only if a network needs:
- Different cadence or polling frequency
- Separate credentials or authentication
- Different SLAs or retry policies
- Per-network rate limiting or throttling

If rate limits are needed, implement per-network concurrency caps at the **worker level** (BullMQ worker concurrency or separate queues per network), not scheduler-level filtering. Worker concurrency is the higher-leverage control.

**Atomic claim query (prevents duplicate scheduling even under double-instance):**

```sql
-- Claim due feeds atomically. SKIP LOCKED ensures no duplicates if
-- two scheduler instances race (deploy glitch, operator error, etc.)
-- v1: No network filter. All feeds share one scheduler tick.
-- v2: Add "AND network = :network" here if network-based partitioning is needed.
UPDATE affiliate_feeds
SET next_run_at = :now + (schedule_frequency_hours * interval '1 hour'),
    updated_at = :now
WHERE id IN (
  SELECT id FROM affiliate_feeds
  WHERE status = 'ENABLED'
    AND next_run_at IS NOT NULL
    AND next_run_at <= :now
    AND schedule_frequency_hours IS NOT NULL
    -- AND network = :network  -- Uncomment for v2 network partitioning
  FOR UPDATE SKIP LOCKED
  LIMIT :batch_size  -- e.g., 50
)
RETURNING id;
```

Then enqueue jobs for returned IDs only. This is self-healing: even if singleton invariant is violated, no feed is double-scheduled.

**Log fields:** Include `network` in `FEED_ENQUEUED` log event for future filtering and metrics splits.

**At-most-once semantics (v1):**

The claim-then-enqueue pattern is **at-most-once per interval**, not exactly-once:

```
1. Scheduler claims feeds (UPDATE ... SET next_run_at = next interval)
2. Scheduler crashes HERE
3. Jobs never enqueued
4. Feeds wait until next_run_at arrives again
```

This is acceptable for v1:
- Missed run is recovered at next scheduled time (e.g., 1-24 hours later)
- No data corruption - just a delayed run
- Ops should not assume guaranteed cadence

**Post-v1 improvement (if needed):** Add outbox table `affiliate_feed_schedule_claims(feedId, claimedAt, enqueuedAt)`. Claim writes to outbox, separate process enqueues and marks `enqueuedAt`. Recovers from crashes by re-enqueuing uncompleted claims.

**Why this pattern:**
- `FOR UPDATE SKIP LOCKED` ensures only one scheduler claims each row
- `RETURNING id` gives exactly the feeds that were claimed
- No window between SELECT and UPDATE where races can occur
- Works correctly even with N scheduler instances (though N>1 is discouraged)

**Why `nextRunAt` instead of `lastRunAt + frequency`:**
- **No drift:** Run duration doesn't affect cadence
- **Deterministic backlog:** If scheduler is down for 6 hours, only 1 run enqueues (not 6)
- **Predictable:** Admin can see exactly when next run will occur

**Setting `nextRunAt`:**

| Event | Action |
|-------|--------|
| Feed created with frequency | `nextRunAt = now() + frequencyHours` |
| Feed enabled (was DRAFT/PAUSED/DISABLED) | `nextRunAt = now() + frequencyHours` |
| Frequency changed | `nextRunAt = now() + newFrequencyHours` |
| Feed paused/disabled | `nextRunAt = null` |
| Scheduler enqueues job | `nextRunAt = now() + frequencyHours` |
| "Run Now" clicked | No change to `nextRunAt` (manual runs don't affect schedule) |

**On status change:**
- ENABLED → PAUSED/DISABLED: Set `nextRunAt = null`
- PAUSED/DISABLED → ENABLED: Set `nextRunAt = now() + frequencyHours`
- Frequency change: Set `nextRunAt = now() + newFrequencyHours`

Store `lastRunAt` for UI display only (when did this feed last run?).

### 5.4 Run Now Button

Always available for ENABLED feeds. Queues immediately.

---

## 6. Run Mutual Exclusion

### 6.1 Single-Layer Protection (Advisory Lock Only)

**v1 approach:** Rely solely on PostgreSQL advisory locks. No BullMQ jobId deduplication.

**Lock key:** Advisory locks always use `AffiliateFeed.feedLockId` (BIGINT). Feed IDs (cuid strings) are never hashed or converted for locking. The `feedLockId` is auto-generated on feed creation and guaranteed unique.

```
Scheduler/Manual → Enqueue job (no jobId) → Worker acquires lock → Runs
                                         → Worker fails lock  → Exits cleanly
```

**Why no BullMQ jobId dedupe:**

BullMQ jobId deduplication (`affiliate-feed-ingest:{feedId}`) interacts badly with `manualRunPending` follow-up enqueues:
- Completion handler enqueues follow-up for pending manual run
- If another job already exists in queue (delayed, waiting), enqueue is silently ignored
- `manualRunPending` stays true forever → stuck state

**Why advisory lock alone is sufficient:**
- Lock-busy jobs exit cleanly without creating run records (Section 6.3)
- Multiple queued jobs are harmless: first acquires lock and runs, others exit immediately
- No "stuck pending" scenarios
- Simpler mental model: "jobs may queue, but only one runs"

**Trade-off:**
- Slightly more jobs may be enqueued (e.g., scheduler + manual at same time)
- But execution is still serialized and correct
- Lock-busy exits are cheap (no run record, no work done)

### 6.2 Advisory Lock Scope

**Critical invariant:** The advisory lock must be held for the **entire run execution**, including Phase 2 promotion.

```
┌─────────────────────────────────────────────────────────────────┐
│                    ADVISORY LOCK HELD                           │
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   Phase 1    │    │   Phase 2    │    │   Cleanup    │      │
│  │   Ingest     │───▶│  Circuit     │───▶│   Check      │      │
│  │   + Stage    │    │  Breaker +   │    │   Pending    │      │
│  │              │    │  Promote     │    │              │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                                                        ▼
                                              Lock released HERE
                                                        ▼
                                              Enqueue pending run
```

**Why this matters:** If the lock is released after Phase 1 but before Phase 2 promotion:
1. Run A finishes Phase 1, releases lock
2. Run B starts, acquires lock, begins Phase 1
3. Run B updates `lastSeenAt` and `source_product_seen` table
4. Run A promotes `lastSeenSuccessAt` from its stale seen set
5. **Corruption:** Products seen only by Run B now have stale `lastSeenSuccessAt`

**Lock release timing:**
- Lock is released **after** Phase 2 completes (promotion or circuit breaker block)
- Lock is released **after** run status is set to SUCCEEDED or FAILED
- Lock is released **before** checking `manualRunPending` and enqueueing follow-up

### 6.3 Lock Failure Handling

**Problem:** In multi-worker setups, jobs can attempt execution while another run is active due to retries, delayed jobs, scheduler bugs, or brief multi-instance scenarios. Creating `CANCELED` run records for these inflates run history and confuses ops.

**Solution:** Different behavior based on trigger type. Lock acquisition happens **before** creating a run record.

#### 6.3.1 Scheduled Runs (Lock Busy)

If advisory lock not acquired for a **scheduled** run:
- **Do NOT create a run record** - no `AffiliateFeedRun` row
- Log `SKIPPED_LOCK_BUSY` at DEBUG level (not WARN - this is expected)
- Exit job successfully (don't trigger BullMQ retry)
- The active run will complete and next scheduled tick will work normally

#### 6.3.2 Manual Runs (Lock Busy)

If advisory lock not acquired for a **manual** run (from `manualRunPending`):
- **Do NOT create a run record**
- **Keep `manualRunPending = true`** - don't clear it
- Log `MANUAL_RUN_DEFERRED` at DEBUG level
- The active run's completion handler will retry the manual run

#### 6.3.3 Run Record Creation Timing

**Key principle:** Run records are created **only after** lock acquisition, with status `RUNNING`. There is no `QUEUED` status.

| Step | Action |
|------|--------|
| 1 | Job dequeued from BullMQ |
| 2 | Attempt `pg_try_advisory_lock(feed_lock_id)` |
| 3a | Lock acquired → Create `AffiliateFeedRun` with status `RUNNING` |
| 3b | Lock busy → Exit cleanly, no run record |

This eliminates noisy `CANCELED` records entirely.

**Queue visibility (v1):** Use BullMQ's built-in UI or logs to observe queued jobs. Do not overload run status for queue state. If structured job event tracking is needed post-v1, consider a separate `affiliate_feed_job_events` append-only table.

### 6.4 Complete Worker Flow

**Run record timing rule:** Create the run record **immediately after acquiring the lock**, before any file operations. Skip detection (mtime/hash unchanged) happens inside Phase 1 and results in an early `SUCCEEDED` with `skippedReason` set. This ensures every successful lock acquisition produces an auditable run record.

```
Lock acquired → Create run (RUNNING) → STAT/Download → Skip or Process → SUCCEEDED/FAILED
                     ▲                      │
                     │                      ▼
              Run exists before      skippedReason set if unchanged
              any file I/O
```

```typescript
type TriggerType = 'SCHEDULED' | 'MANUAL' | 'MANUAL_PENDING';

// ═══════════════════════════════════════════════════════════════════════════
// ADVISORY LOCK HELPERS
// Always use AffiliateFeed.feedLockId (BIGINT) for PostgreSQL advisory locks.
// Feed IDs (cuid strings) are never hashed or converted for locking.
// ═══════════════════════════════════════════════════════════════════════════

async function tryAcquireAdvisoryLock(lockId: bigint): Promise<boolean> {
  const result = await prisma.$queryRaw<[{ pg_try_advisory_lock: boolean }]>`
    SELECT pg_try_advisory_lock(${lockId})
  `;
  return result[0].pg_try_advisory_lock;
}

async function releaseAdvisoryLock(lockId: bigint): Promise<void> {
  await prisma.$queryRaw`SELECT pg_advisory_unlock(${lockId})`;
}

async function handleFeedIngestJob(feedId: string, trigger: TriggerType) {
  // Step 1: Load feed to get lock ID (also needed for config, credentials later)
  const feed = await prisma.affiliateFeed.findUniqueOrThrow({
    where: { id: feedId },
    select: { id: true, feedLockId: true, status: true }
  });

  // Step 2: Acquire lock using feedLockId (BIGINT)
  const lockAcquired = await tryAcquireAdvisoryLock(feed.feedLockId);
  if (!lockAcquired) {
    if (trigger === 'SCHEDULED') {
      log.debug('SKIPPED_LOCK_BUSY', { feedId, feedLockId: feed.feedLockId, trigger });
    } else {
      // Manual run: keep flag set for retry
      log.debug('MANUAL_RUN_DEFERRED', { feedId, feedLockId: feed.feedLockId, trigger });
    }
    return; // Exit cleanly, no run record
  }

  // Step 3: Create run record IMMEDIATELY (before any file I/O)
  // This ensures every lock acquisition has an auditable run record
  // IMPORTANT: trigger is set once here and never changes, even across BullMQ retries
  const run = await createRunRecord(feedId, trigger);

  try {
    // ═══════════════════════════════════════════════════════════
    // PHASE 1: Ingest and Stage (lock held)
    // Includes: STAT, download, hash check, parse, upsert
    // May exit early with skippedReason if file unchanged
    // ═══════════════════════════════════════════════════════════
    const skipReason = await executePhase1Ingest(run);
    if (skipReason) {
      // File unchanged - exit early with SUCCEEDED + skippedReason
      // Clear manualRunPending in same transaction (handles all trigger types)
      await markRunSucceededAndClearPending(run, feedId, { skippedReason: skipReason });
      return; // finally block still runs (releases lock, checks pending)
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 2: Circuit Breaker + Promote (lock STILL held)
    // Only runs if Phase 1 processed new data
    // ═══════════════════════════════════════════════════════════
    await executePhase2Promotion(run);

    // Clear manualRunPending on any successful completion
    await markRunSucceededAndClearPending(run, feedId);
  } catch (error) {
    await markRunFailed(run, feedId, error as Error);
    throw error; // Let BullMQ handle retry policy
  } finally {
    // Step 4: Read follow-up state WHILE STILL HOLDING LOCK
    // ═══════════════════════════════════════════════════════════════════════
    // INVARIANT: Read manualRunPending WHILE HOLDING the advisory lock.
    // Moving this read AFTER unlock introduces a lost-run race:
    //   1. We release lock
    //   2. New job acquires lock, clears manualRunPending, runs
    //   3. We read manualRunPending (now false), skip follow-up
    //   4. User's pending request was silently dropped
    //
    // By reading before unlock, we capture the flag state atomically with
    // our run's completion. The subsequent enqueue may race with other jobs,
    // but the READ is protected.
    // ═══════════════════════════════════════════════════════════════════════
    const feedState = await prisma.affiliateFeed.findUnique({
      where: { id: feedId },
      select: { manualRunPending: true, status: true, feedLockId: true }
    });
    const shouldEnqueueFollowUp = feedState?.manualRunPending && feedState?.status === 'ENABLED';

    // Step 5: Release lock (AFTER reading manualRunPending - see invariant above)
    await releaseAdvisoryLock(feed.feedLockId);

    // Step 6: Enqueue follow-up AFTER lock release (if needed)
    // Only enqueue if: (1) pending flag was set, (2) feed is still ENABLED
    // This prevents surprise runs after admin pauses feed mid-run
    if (shouldEnqueueFollowUp) {
      enqueueJob(feedId, { trigger: 'MANUAL_PENDING' });
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// RUN FINALIZATION FUNCTIONS
// These are the ONLY places that set finishedAt/durationMs and terminal status.
// BullMQ handlers (onCompleted, onFailed) must NOT mutate run records.
// ═══════════════════════════════════════════════════════════════════════════

// Clear pending flag on ANY successful run (including skipped)
// Regardless of trigger type - the user's request has been honored
async function markRunSucceededAndClearPending(
  run: AffiliateFeedRun,
  feedId: string,
  options?: { skippedReason?: string }
) {
  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - run.startedAt.getTime();

  await prisma.$transaction(async (tx) => {
    await tx.affiliateFeedRun.update({
      where: { id: run.id },
      data: {
        status: 'SUCCEEDED',
        finishedAt,
        durationMs,
        skippedReason: options?.skippedReason,
      }
    });
    await tx.affiliateFeed.update({
      where: { id: feedId },
      data: {
        manualRunPending: false,
        consecutiveFailures: 0,
        lastRunAt: finishedAt,
      }
    });
  });
}

async function markRunFailed(
  run: AffiliateFeedRun,
  feedId: string,
  error: Error,
  options?: { isPartial?: boolean; stage?: string }
) {
  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - run.startedAt.getTime();

  await prisma.$transaction(async (tx) => {
    await tx.affiliateFeedRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        finishedAt,
        durationMs,
        isPartial: options?.isPartial ?? false,
      }
    });
    // Increment consecutive failures (auto-disable check happens here)
    const feed = await tx.affiliateFeed.update({
      where: { id: feedId },
      data: {
        consecutiveFailures: { increment: 1 },
        lastRunAt: finishedAt,
      }
    });
    // Auto-disable after 3 consecutive failures
    if (feed.consecutiveFailures >= 3) {
      await tx.affiliateFeed.update({
        where: { id: feedId },
        data: { status: 'DISABLED' }
      });
      // Log alertable event (Slack notification enqueued separately)
      log.warn('FEED_AUTO_DISABLED', {
        feedId,
        consecutiveFailures: feed.consecutiveFailures,
        lastError: error.message,
      });
    }
  });
  // NOTE: Do NOT clear manualRunPending on failure - user's request should retry
}

// ═══════════════════════════════════════════════════════════════════════════
// RUN RECORD CREATION
// trigger is set once at creation and NEVER changes, even across BullMQ retries.
// This preserves causality: "why did this run start?"
// ═══════════════════════════════════════════════════════════════════════════

async function createRunRecord(feedId: string, trigger: TriggerType): Promise<AffiliateFeedRun> {
  return prisma.affiliateFeedRun.create({
    data: {
      feedId,
      trigger,  // Immutable once set
      status: 'RUNNING',
      startedAt: new Date(),
    }
  });
}
```

**Trigger immutability:** The `trigger` field is set exactly once when the run record is created. If a job fails and BullMQ retries it, the retry continues with the **same run record** (same `trigger` value). This preserves causality for audit trails.

**BullMQ retry semantics:**
- On transient failure, the job throws and BullMQ schedules a retry
- The retry invocation must pass the existing `runId` (not create a new record)
- The finalize functions update the existing record
- **Retries restart from scratch** (re-download, re-parse, re-process all rows)

**Retry idempotency guarantees:**

Retries are safe because all writes are idempotent:

| Write | Idempotency Mechanism |
|-------|----------------------|
| `SourceProduct` upsert | Unique constraint on `(sourceId, identityType, identityValue)` |
| `SourceProductPresence.lastSeenAt` | Last-write-wins, timestamp updated idempotently |
| `SourceProductSeen` staging | Unique constraint on `(runId, sourceProductId)` |
| **Price insert** | Partial unique index `prices_affiliate_dedupe` + `ON CONFLICT DO NOTHING` (Section 2.6). ⚠️ Enforced via migration test (Section 18.1.1): no other unique constraints on `prices` table |

**Price dedupe guarantees no duplicate persistence; duplicate attempts are safely ignored.** Without the partial unique index, retries could inflate price history with duplicate rows. The `affiliateFeedRunId` + `priceSignatureHash` fields ensure at most one price per `(sourceProductId, runId, signature)` combination. The database constraint guarantees no duplicate rows are persisted, regardless of cache state or retry behavior. Duplicate insert attempts may still occur (e.g., during retries or cross-chunk duplicates), but `ON CONFLICT DO NOTHING` safely ignores them. Note: `pricesWritten` is incremented from DB rowCount (not array length) to ensure metrics reflect actual inserts, not attempted inserts.

### 6.4.1 Run Record Creation Invariant

**CRITICAL:** Run creation and job data update must happen atomically before any throwable I/O.

**The trap:** If run creation succeeds but `job.updateData()` fails (or any subsequent I/O fails before `updateData`), BullMQ retries without `runId` in job data. The retry creates a **second run record** for the same job, breaking the "one run per job execution" invariant.

**Invariant:** On first attempt, these steps must execute in order with no throwable operations between them:
1. Acquire advisory lock
2. Create run record
3. Call `job.updateData({ runId, feedLockId })`

Only after step 3 completes can any throwable I/O (FTP connect, download, parse, etc.) begin.

**Why `job.updateData()` before I/O:**
- If FTP fails after run creation but before `updateData`, retry has no `runId`
- Retry would create a second run → duplicate metrics, broken audit trail
- By persisting `runId` to job data immediately, retries always reuse the same run

```typescript
// Job data includes runId and feedLockId after first attempt
interface AffiliateFeedJobData {
  feedId: string;
  trigger: TriggerType;
  runId?: string;       // Set after first lock acquisition, reused on retry
  feedLockId?: bigint;  // Cached to avoid re-query on retry
}

// On retry, skip record creation, resume from existing run
async function handleFeedIngestJob(job: Job<AffiliateFeedJobData>) {
  const { feedId, trigger, runId } = job.data;

  // Load feed to get lock ID (or use cached value on retry)
  let feedLockId = job.data.feedLockId;
  if (!feedLockId) {
    const feed = await prisma.affiliateFeed.findUniqueOrThrow({
      where: { id: feedId },
      select: { feedLockId: true }
    });
    feedLockId = feed.feedLockId;
  }

  let run: AffiliateFeedRun;
  if (runId) {
    // Retry: reuse existing run record
    run = await prisma.affiliateFeedRun.findUniqueOrThrow({ where: { id: runId } });
    // Re-acquire lock (may have been released on previous failure)
    const lockAcquired = await tryAcquireAdvisoryLock(feedLockId);
    if (!lockAcquired) {
      // Another run started - this retry is obsolete
      log.warn('RETRY_LOCK_CONFLICT', { runId, feedId, feedLockId });
      return;
    }
  } else {
    // First attempt: use dedicated atomic function (see acquireLockAndCreateRun below)
    const result = await acquireLockAndCreateRun(job, feedId, feedLockId, trigger);
    if (!result.success) {
      return; // Lock not acquired, logged and exited
    }
    run = result.run;

    // ═══════════════════════════════════════════════════════════════════════
    // Only AFTER updateData completes can throwable I/O begin
    // ═══════════════════════════════════════════════════════════════════════
  }

  // Now safe to proceed with Phase 1 + Phase 2...
  // Any failure from here will retry with the same runId
}

// ═══════════════════════════════════════════════════════════════════════════
// ATOMIC RUN INITIALIZATION
// This function encapsulates the three-step invariant that MUST complete
// before any throwable I/O. Keeping it as a dedicated function prevents
// future refactors from accidentally inserting code between steps.
//
// INVARIANT: No throwable operations between lock acquisition and updateData.
// The only awaits allowed inside are:
//   1. tryAcquireAdvisoryLock (DB)
//   2. createRunRecord (DB)
//   3. job.updateData (Redis)
//
// DO NOT add logging, metrics, credential decryption, or any other awaits.
// ═══════════════════════════════════════════════════════════════════════════
async function acquireLockAndCreateRun(
  job: Job<AffiliateFeedJobData>,
  feedId: string,
  feedLockId: bigint,
  trigger: TriggerType
): Promise<{ success: false } | { success: true; run: AffiliateFeedRun }> {
  // Step 1: Acquire lock
  const lockAcquired = await tryAcquireAdvisoryLock(feedLockId);
  if (!lockAcquired) {
    // Handle lock-busy (details in Section 6.3)
    return { success: false };
  }

  // Step 2: Create run record (now holds lock, safe to create)
  const run = await createRunRecord(feedId, trigger);

  // Step 3: IMMEDIATELY persist runId to job data
  // If this fails, BullMQ will retry and we'll create a duplicate run
  // If this succeeds but later I/O fails, retry will reuse this run
  await job.updateData({ ...job.data, runId: run.id, feedLockId });

  // ONLY NOW is it safe to proceed with throwable I/O
  return { success: true, run };
}
```

> **⚠️ HARD RULE: Run records MUST only be created via `acquireLockAndCreateRun()`.**
>
> Creating runs elsewhere is **forbidden**. The `createRunRecord()` helper is private to this function. This is not merely a guideline—it's a correctness requirement. Any code path that creates a run outside this function will break retry safety and produce duplicate run records.
>
> **Why this matters:** The three-step invariant (lock → create run → updateData) must be atomic. If any throwable operation (logging, metrics, await, etc.) is inserted between steps, a failure will cause BullMQ to retry without `runId` in job data, creating a second run record. Keeping run creation inside `acquireLockAndCreateRun()` makes this invariant enforceable by code review.

**Guard for orphaned runs:** If a retry sees a RUNNING run without matching `job.data.runId`, something went wrong (invariant violated or data corruption). Log ERROR and abort:

```typescript
// In retry path, after fetching run:
if (run.status === 'RUNNING' && run.id !== job.data.runId) {
  log.error('RUN_ID_MISMATCH', {
    expectedRunId: job.data.runId,
    foundRunId: run.id,
    feedId,
    message: 'Invariant violation: retry has runId but DB shows different RUNNING run'
  });
  // Do NOT proceed - this indicates duplicate run records or data corruption
  throw new UnrecoverableError('Run ID mismatch - potential duplicate run records');
}
```

### 6.5 Run Now Button

**Problem with naive approach:** If "Run Now" enqueues a job while a run is active, the job executes immediately, fails to acquire lock, and the user's request is dropped.

**Solution:** Always set `manualRunPending = true`, then enqueue. No race-prone `hasActiveRun` check needed.

**On "Run Now" click (atomic, idempotent):**
```typescript
async function handleRunNowClick(feedId: string): Promise<{ status: 'queued' }> {
  // Always set pending flag - idempotent, no race condition
  await prisma.affiliateFeed.update({
    where: { id: feedId },
    data: { manualRunPending: true }
  });

  // Enqueue job - will either:
  // 1. Acquire lock, clear flag, run immediately
  // 2. Find lock busy, exit (flag remains true for active run to pick up)
  enqueueJob(feedId, { trigger: 'MANUAL' });

  return { status: 'queued' };
}
```

**Why this works:**
- Setting `manualRunPending = true` is idempotent (multiple clicks are harmless)
- The enqueued job either runs immediately or finds the lock busy
- If lock busy: flag stays true, active run's completion handler picks it up
- If lock acquired: job clears flag and runs
- No TOCTOU race between checking `hasActiveRun` and setting flag

**UI feedback:**
- Always show: "Run queued" (job will execute immediately or after current run)
- Show `manualRunPending` badge in feed detail view when flag is true

**Add to AffiliateFeed model:**
```prisma
manualRunPending   Boolean  @default(false)
```

### 6.6 Status Enum Rationale

With the lock-first design (run records created only after lock acquisition), no intermediate statuses are needed.

**AffiliateFeedRunStatus values:**
```prisma
enum AffiliateFeedRunStatus {
  RUNNING     // Lock acquired, run record created, execution in progress
  SUCCEEDED   // Completed successfully
  FAILED      // Completed with error
  // Note: No QUEUED status - run records are created only after lock acquisition (Section 6.3.3)
  // Note: No CANCELED status - lock-busy scenarios don't create run records (Section 6.3)
}
```

**Queue visibility (v1):** Use BullMQ's built-in UI or logs to observe queued jobs. Do not overload run status for queue state. If structured job event tracking is needed post-v1, consider a separate `affiliate_feed_job_events` append-only table rather than polluting run history with non-runs.

---

## 7. Ingest Pipeline

### 7.1 Pipeline Stages

**Phase 1: Ingest and Stage**
1. **Download** - FTP/SFTP file retrieval
2. **Decompress** - GZIP if applicable
3. **Parse** - CSV row iteration
4. **Validate** - Required fields, data types
5. **Transform** - Map to SourceProduct + Price schema (see Section 7.1.1)
6. **Upsert** - Chunked commits (500-5000 rows per batch)
   - Update `lastSeenAt` only
   - Insert into `SourceProductSeen` staging table

**Phase 2: Circuit Breaker and Promotion**
7. **Evaluate** - Compute spike metrics, check thresholds (Section 8.2)
8. **Promote** - If no spike: update `lastSeenSuccessAt` for seen products
9. **Alert** - Slack notification for spikes or failures

### 7.1.1 CSV Field Mapping

The parser maps CSV columns to internal schema using case-insensitive matching with fallback priority. This handles variance across affiliate networks and feed formats.

#### Price Field Mapping

**Problem:** Feeds may have both a list/MSRP price (`Price`) and a discounted/sale price (`SalePrice`). We must use the actual selling price for consumer display while preserving original price for discount calculations.

**Solution:**

| Priority | CSV Columns Checked | Target Field | Rationale |
|----------|-------------------|--------------|-----------|
| 1 | `SalePrice`, `Sale Price`, `CurrentPrice`, `Current Price` | `price` (current) | Actual selling price - what consumer pays |
| 2 | `Price`, `price`, `ListPrice`, `List Price` | Fallback to `price` | Use if no sale price present |
| 3 | `OriginalPrice`, `Original Price`, `MSRP`, `RetailPrice`, `Retail Price` | `originalPrice` | Explicit MSRP/list price |
| 4 | `Price` (when SalePrice was used) | `originalPrice` | Infer MSRP from list price |

**Logic:**
```typescript
// 1. Check for sale/current price first
const salePriceStr = getValue('SalePrice', 'Sale Price', 'CurrentPrice', 'Current Price')
const listPriceStr = getValue('Price', 'price', 'ListPrice', 'List Price')

// 2. Use sale price if available, otherwise fall back to list price
const priceStr = salePriceStr || listPriceStr

// 3. For originalPrice: explicit fields take priority, else infer from list price
const explicitOriginalPriceStr = getValue('OriginalPrice', 'Original Price', 'MSRP', 'RetailPrice')
const originalPriceStr = explicitOriginalPriceStr || (salePriceStr ? listPriceStr : undefined)
```

**Example Feed:**
```csv
SKU,Name,Price,SalePrice,Availability
PSA-001,Federal 9mm 50rd,18.99,15.99,in stock
```

**Result:**
- `price` = 15.99 (SalePrice - actual selling price)
- `originalPrice` = 18.99 (Price - used as MSRP since SalePrice was primary)

#### UPC/GTIN Field Mapping

UPCs are fixed-length codes where leading zeros are significant.

| CSV Columns | Target | Notes |
|-------------|--------|-------|
| `Gtin`, `GTIN`, `UPC`, `EAN`, `ISBN`, `upc`, `gtin`, `ean` | `upc` | Strip non-digits, preserve leading zeros |

**Important:** UPC `020892215513` must remain `020892215513`, not be truncated to `20892215513`. UPC-A codes are always 12 digits; leading zeros are part of the code.

#### Other Field Mappings

| Target Field | CSV Columns (priority order) |
|-------------|------------------------------|
| `name` | `Name`, `ProductName`, `Product Name`, `title`, `Title` |
| `url` | `Url`, `URL`, `ProductURL`, `Product URL`, `Link`, `url`, `link` |
| `sku` | `SKU`, `MerchantSKU`, `sku`, `merchant_sku`, `ProductSKU`, `Unique Merchant SKU` |
| `impactItemId` | `CatalogItemId`, `ItemId`, `item_id`, `catalogItemId` |
| `brand` | `Manufacturer`, `Brand`, `brand`, `manufacturer` |
| `imageUrl` | `ImageUrl`, `ImageURL`, `Image URL`, `Image`, `PrimaryImage` |
| `description` | `Description`, `ProductDescription`, `Product Description` |
| `category` | `Category`, `ProductCategory`, `category`, `Product Type` |
| `currency` | `Currency`, `CurrencyCode`, `currency` (default: USD) |
| `inStock` | `StockAvailability`, `Stock Availability`, `Availability`, `InStock` |

#### Stock Status Mapping

| CSV Value | `inStock` | Notes |
|-----------|-----------|-------|
| `y`, `yes`, `true`, `1`, `in stock`, `instock`, `available` | `true` | In stock |
| `low stock`, `lowstock`, `low_stock`, `limited` | `true` | In stock (limited quantity) |
| `n`, `no`, `false`, `0`, `out of stock`, `outofstock`, `unavailable` | `false` | Out of stock |
| `backordered`, `preorder`, `pre-order`, `sold out`, `discontinued` | `false` | Unavailable variants |
| (unrecognized) | `true` | Default to in stock if ambiguous |

### 7.2 Ingest Write Pattern (Phase 1)

For each row:
1. Resolve identity (itemId > SKU > URL hash)
2. Upsert `SourceProduct` by `(sourceId, identityType, identityValue)`
3. Update `SourceProductPresence.lastSeenAt` only (do NOT touch `lastSeenSuccessAt` yet)
4. Insert into `SourceProductSeen` staging table for this run
5. If price changed or heartbeat due: append `Price` record

**Important:** `lastSeenSuccessAt` is updated in Phase 2 (Section 8.2) after circuit breaker evaluation, not during row processing.

### 7.3 Chunked Commits

- Batch size: 500-5000 rows (configurable)
- Each batch committed independently
- Enables partial progress on large files

### 7.3.1 File Size and Row Limits

**v1 hard limits** to prevent OOM and runaway processing:

| Limit | Default | Configurable | Behavior |
|-------|---------|--------------|----------|
| Max file size | 500 MB | Per-feed override | Abort download if exceeded |
| Max row count | 500,000 | Per-feed override | Abort parse if exceeded |

**Why these limits:**
- `lastPriceCache` holds one entry per unique product → 500K products ≈ 200-400 MB memory
- Files larger than 500 MB suggest data quality issues or wrong file selection
- Limits can be raised per-feed by admin if a known large catalog requires it

> **⚠️ MEMORY INVARIANT:** `maxRowCount` bounds both row count AND unique product count.
>
> v1 assumes near-1:1 rows-to-products (most feeds have one row per product). The 500K row default bounds cache size to ~200-400 MB.
>
> **Enforcement:** The memory guard in `processChunk()` (Section 4.2.1) aborts the run with `UNIQUE_PRODUCT_LIMIT_EXCEEDED` if `lastPriceCache.size > maxRowCount`. This prevents OOM even if a feed has unexpectedly high unique product density.
>
> **OOM risk without guard:** If a feed contains 500K unique products and each cache entry is ~400-800 bytes, peak cache memory is 200-400 MB. Combined with other runtime allocations, this approaches typical worker limits (512 MB - 1 GB). The guard ensures this cannot happen.

**Abort behavior:**

```typescript
// During download
if (downloadedBytes > feed.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE) {
  throw new FileSizeLimitExceeded(downloadedBytes, feed.maxFileSizeBytes);
}

// During parse
if (rowsRead > feed.maxRowCount ?? DEFAULT_MAX_ROW_COUNT) {
  throw new RowCountLimitExceeded(rowsRead, feed.maxRowCount);
}

// During chunk processing (see Section 4.2.1)
if (lastPriceCache.size > feed.maxRowCount ?? DEFAULT_MAX_ROW_COUNT) {
  throw new UniqueProductLimitExceeded(lastPriceCache.size, feed.maxRowCount);
}
```

**On limit exceeded:**
- Run marked `FAILED` with error `FILE_SIZE_LIMIT_EXCEEDED`, `ROW_COUNT_LIMIT_EXCEEDED`, or `UNIQUE_PRODUCT_LIMIT_EXCEEDED`
- `isPartial = true` if any rows were processed before abort
- Alert via Slack
- Admin can review and raise limit if legitimate

**Memory notes:**
- Cache is cleared after each run (not shared across runs)
- Chunking bounds peak memory per batch, but cache grows across chunks
- `UNIQUE_PRODUCT_LIMIT_EXCEEDED` catches unexpected high-density feeds before OOM

### 7.4 Partial Failure Handling

If run fails mid-file:
- Keep successful upserts
- Mark run as `FAILED`
- Set `isPartial = true`
- No expiry on failed runs
- Store `rowsParsed`, `productsUpserted`, `errorCount`

### 7.5 Duplicate Rows in File

**Behavior:** Last row wins (upsert semantics)

**Observability:**
- Track `duplicateKeyCount` per run
- Sample in `AffiliateFeedRunError` with code `DUPLICATE_ROW_SAME_IDENTITY`
- Duplicates don't count toward auto-pause threshold

### 7.6 Presence Timestamp Handling

**Phase 1 (during row processing):**

| Run Result | lastSeenAt | lastSeenSuccessAt |
|------------|------------|-------------------|
| Any | Updated per row | NOT updated |

**Phase 2 (after circuit breaker - Section 8.2):**

| Circuit Breaker Result | lastSeenSuccessAt |
|------------------------|-------------------|
| No spike detected | Updated for all seen products |
| Spike detected (blocked) | NOT updated |
| Admin approves blocked run | Updated for all seen products |

Expiry logic uses `lastSeenSuccessAt` only. This is what makes the circuit breaker work: blocking `lastSeenSuccessAt` promotion prevents products from becoming stale.

---

## 8. Expiration (Two-Phase Circuit Breaker)

### 8.1 Expiration Model

**Key insight:** Expiration is a query-time filter, not a status mutation.

A SourceProduct is "active" if:
```sql
source_product_presence.last_seen_success_at IS NOT NULL
  AND NOW() - source_product_presence.last_seen_success_at <= feed.expiry_hours
```

No `status` field is mutated. Products become "stale" passively when their `lastSeenSuccessAt` timestamp ages out. Products with NULL `lastSeenSuccessAt` (never promoted) are excluded from search entirely.

### 8.2 Two-Phase Commit Algorithm

**Phase 1: Ingest and Stage Presence**

1. Download + parse + validate rows
2. Upsert `SourceProduct` records
3. Update `lastSeenAt` as you process (even if run fails later)
4. Record "seen this run" in staging table: `source_product_seen(runId, sourceProductId)`

**Phase 2: Evaluate Circuit Breaker (BEFORE updating success timestamps)**

**CRITICAL: Use `:t0` parameter everywhere. No `NOW()` in SQL.**

All Phase 2 queries must use the same captured timestamp and the same `expiryHours` value. Using `NOW()` in SQL creates timing inconsistencies between queries (clock drift during execution, transaction isolation differences). Pass `:t0` as a parameter to all queries.

1. Capture evaluation timestamp (use consistently for all queries):
   ```typescript
   const t0 = new Date(); // Single timestamp for all Phase 2 queries
   const expiryHours = feed.expiryHours; // Capture once, use everywhere
   ```

2. Compute metrics (note: `:t0` parameter, not `NOW()`):
   ```sql
   -- Count currently active products for this feed
   -- Use :t0 (not NOW()) for time window stability
   -- Excludes NULL lastSeenSuccessAt (never-promoted products)
   SELECT COUNT(*) as active_count_before
   FROM source_products sp
   JOIN source_product_presence spp ON sp.id = spp.source_product_id
   WHERE sp.source_id = :sourceId
     AND spp.last_seen_success_at IS NOT NULL
     AND :t0 - spp.last_seen_success_at <= (:expiryHours * interval '1 hour');

   -- Count active products that were seen in this run
   -- Only counts previously-active products, not new ones
   SELECT COUNT(*) as seen_success_count
   FROM source_products sp
   JOIN source_product_presence spp ON sp.id = spp.source_product_id
   JOIN source_product_seen seen ON sp.id = seen.source_product_id
   WHERE sp.source_id = :sourceId
     AND seen.run_id = :runId
     AND spp.last_seen_success_at IS NOT NULL
     AND :t0 - spp.last_seen_success_at <= (:expiryHours * interval '1 hour');
   ```

   **Note:** New products (NULL `lastSeenSuccessAt`) are excluded from both counts. They don't affect the circuit breaker calculation - only previously-active products that would become stale matter.

3. Compute derived values with edge case handling:
   ```typescript
   // Clamp to zero - negative values indicate data anomalies
   const rawExpireCount = activeCountBefore - seenSuccessCount;
   const wouldExpireCount = Math.max(0, rawExpireCount);

   // Log warning if clamping occurred - this is a smoke alarm
   if (rawExpireCount < 0) {
     log.warn('CIRCUIT_BREAKER_NEGATIVE_EXPIRE_COUNT', {
       runId,
       feedId,
       activeCountBefore,
       seenSuccessCount,
       rawExpireCount,
       // Possible causes: NULL lastSeenSuccessAt, clock skew, missing presence rows
     });
   }

   // Handle division by zero: if no active products, nothing can expire
   const expirePercent = activeCountBefore > 0
     ? wouldExpireCount / activeCountBefore
     : 0;
   ```

   **Why clamp:** `seenSuccessCount > activeCountBefore` can occur due to:
   - `lastSeenSuccessAt` being NULL for newly created presence rows
   - Clock skew between app server `:t0` and DB `NOW()`
   - Bugs where presence rows are created late or missing

   If clamping ever triggers, investigate the root cause.

4. Apply thresholds:
   - Alert if `(expirePercent > 0.30 AND wouldExpireCount >= 10)` OR `wouldExpireCount >= 500`
   - If `activeCountBefore = 0`: no spike possible, always pass

5. **If spike detected:**
   - Send Slack alert
   - Set run flags: `expiryBlocked = true`, `expiryBlockedReason = 'SPIKE_THRESHOLD_EXCEEDED'`
   - **Do NOT update `lastSeenSuccessAt`** for seen products
   - Result: consumers still see the previous active set (no blast radius)

6. **If no spike:**
   - Promote presence: Update `lastSeenSuccessAt` for all products seen in this run
   - Query-time expiry naturally removes stale ones
   - Record `productsExpired` count in run metrics

**Promotion query (single UPDATE):**

```sql
-- Efficient: uses index on source_product_seen.run_id
-- and unique index on source_product_presence.source_product_id
UPDATE source_product_presence spp
SET last_seen_success_at = :t0
FROM source_product_seen seen
WHERE seen.run_id = :runId
  AND seen.source_product_id = spp.source_product_id;
```

**Index coverage:**
- `source_product_seen.run_id` → covered by `@@index([runId])`
- `source_product_presence.source_product_id` → covered by `@unique`

**Performance notes:**
- Single UPDATE is efficient in PostgreSQL for 50K+ rows
- v1: Keep single UPDATE, monitor `promoteRowsUpdated` and `durationMs` in `PROMOTE_COMPLETE` log
- Post-v1: If lock time becomes problematic, chunk by `source_product_id` ranges

### 8.3 Why This Works

Because "active" is defined by `lastSeenSuccessAt`:
- If you don't advance it, nothing becomes newly stale from this run
- Data is still ingested and diagnosable
- You only block the **activation step**, not the ingest

### 8.4 Staging Table

```prisma
model SourceProductSeen {
  id              String   @id @default(cuid())
  runId           String
  sourceProductId String
  createdAt       DateTime @default(now())

  run           AffiliateFeedRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  sourceProduct SourceProduct    @relation(fields: [sourceProductId], references: [id], onDelete: Cascade)

  @@unique([runId, sourceProductId])
  @@index([runId])
  @@map("source_product_seen")
}
```

**Retention:** Delete with run cleanup (30 days).

### 8.5 Run Flags

Add to `AffiliateFeedRun`:

```prisma
model AffiliateFeedRun {
  // ... existing fields ...

  // Expiry circuit breaker (see Section 2.2 for full semantics)
  // expiryBlocked stays true after approval; expiryApprovedAt is the approval signal
  expiryBlocked       Boolean  @default(false)
  expiryBlockedReason String?
  expiryApprovedAt    DateTime?
  expiryApprovedBy    String?
}
```

### 8.6 Expiry Threshold

```sql
stale = NOW() - last_seen_success_at > expiry_hours
```

Default `expiryHours`: 48

### 8.7 Admin "Approve Activation" Action

When circuit breaker blocks activation, admin can review and approve:

**UI:** Button on blocked run: "Approve Activation"

**Eligibility (all must be true):**
- `run.status = SUCCEEDED`
- `run.expiryBlocked = true`
- `run.expiryApprovedAt IS NULL`
- No newer successful run exists for this feed (see below)

**Stale run check:**
```sql
-- Block approval if a newer successful run exists
SELECT COUNT(*) FROM affiliate_feed_runs
WHERE feed_id = :feedId
  AND status = 'SUCCEEDED'
  AND started_at > :blockedRunStartedAt
```
If count > 0, approval is blocked with message: "A newer run has completed. This run's activation is no longer relevant."

**Why block stale approvals:**
- A newer run has already updated `lastSeenAt` for current products
- Promoting an old run's seen set would mark products as "success seen" that may no longer exist in the feed
- Could resurrect products that should have expired

**Timestamp semantics (t0 vs approvalAt):**

Phase 2 circuit breaker uses a captured `t0` timestamp for run-scoped consistency - all queries within the same run use the same wall-clock reference to avoid time-window drift.

Approve Activation is a **separate admin operation** with its own wall-clock time. Using `approvalAt = NOW()` is correct because you are explicitly choosing to "activate as of approval time." The approval timestamp is applied consistently within the approval transaction:
- `run.expiryApprovedAt = approvalAt`
- `spp.lastSeenSuccessAt = approvalAt` for all products seen in that run

**Important:** Approval does not recompute spike metrics. It bypasses the circuit breaker by operator decision. The admin is asserting "I reviewed the spike and it's acceptable."

**Concurrency controls (critical):**

Approval modifies many rows and must be safe against:
- Another ingest job starting during approval
- Two admins clicking approve simultaneously

```typescript
async function approveActivation(runId: string, adminId: string): Promise<ApprovalResult> {
  // Load run with feed to get feedLockId
  const run = await prisma.affiliateFeedRun.findUnique({
    where: { id: runId },
    include: { feed: { select: { id: true, feedLockId: true } } }
  });

  if (!run) {
    return { success: false, error: 'RUN_NOT_FOUND' };
  }

  // Capture approval timestamp once - used consistently throughout this operation
  const approvalAt = new Date();

  // Step 1: Acquire the SAME advisory lock used by ingest jobs
  // This prevents a new run from starting while we promote
  const lockAcquired = await tryAcquireAdvisoryLock(run.feed.feedLockId);
  if (!lockAcquired) {
    return { success: false, error: 'FEED_BUSY', message: 'A run is currently in progress. Try again later.' };
  }

  try {
    // Step 2: Check ALL eligibility conditions BEFORE any mutations
    // This avoids intermediate "approved" state that could be observed

    // 2a: Re-fetch run state (may have changed since initial load)
    const currentRun = await prisma.affiliateFeedRun.findUnique({
      where: { id: runId },
      select: { status: true, expiryBlocked: true, expiryApprovedAt: true, feedId: true, startedAt: true }
    });

    if (!currentRun) {
      return { success: false, error: 'RUN_NOT_FOUND' };
    }

    // 2b: Check basic eligibility
    if (currentRun.status !== 'SUCCEEDED') {
      return { success: false, error: 'RUN_NOT_SUCCEEDED' };
    }
    if (!currentRun.expiryBlocked) {
      return { success: false, error: 'NOT_BLOCKED' };
    }
    // Use expiryApprovedAt as the sole signal of approval
    // expiryBlocked stays true (semantically: "was blocked, now approved")
    if (currentRun.expiryApprovedAt !== null) {
      return { success: false, error: 'ALREADY_APPROVED' };
    }

    // 2c: Check for newer successful run (stale approval check)
    const newerRunExists = await prisma.affiliateFeedRun.count({
      where: {
        feedId: currentRun.feedId,
        status: 'SUCCEEDED',
        startedAt: { gt: currentRun.startedAt }
      }
    }) > 0;

    if (newerRunExists) {
      return { success: false, error: 'STALE_RUN', message: 'A newer run has completed.' };
    }

    // Step 3: All checks passed - execute approval + promotion in ONE transaction
    // No intermediate state where run is "approved but not promoted"
    await prisma.$transaction(async (tx) => {
      // 3a: Set approval fields
      // NOTE: expiryBlocked stays TRUE. The approval signal is expiryApprovedAt.
      // Semantics: expiryBlocked=true means "was blocked"; expiryApprovedAt!=null
      // means "admin approved and promotion succeeded".
      // We don't set expiryBlocked=false because that would semantically claim
      // "fully activated" before promotion (step 3b) completes.
      await tx.affiliateFeedRun.update({
        where: { id: runId },
        data: {
          expiryApprovedAt: approvalAt,
          expiryApprovedBy: adminId,
          // expiryBlocked intentionally NOT changed - stays true
        }
      });

      // 3b: Promote presence timestamps for all products seen in this run
      await tx.$executeRaw`
        UPDATE source_product_presence spp
        SET last_seen_success_at = ${approvalAt}
        FROM source_product_seen seen
        WHERE seen.run_id = ${runId}
          AND seen.source_product_id = spp.source_product_id
      `;
    });

    return { success: true, productsPromoted: await getSeenCount(runId) };

  } finally {
    // Step 4: Always release the lock
    await releaseAdvisoryLock(run.feed.feedLockId);
  }
}
```

**Helper function:**

```typescript
async function getSeenCount(runId: string): Promise<number> {
  return prisma.sourceProductSeen.count({
    where: { runId }
  });
}
```

**Key protections:**
- Advisory lock prevents concurrent ingest from racing with approval
- All eligibility checks (status, blocked, not-already-approved, no-newer-run) happen **before** any mutations
- Approval flags + promotion happen in **one transaction** - no intermediate "approved but not promoted" state
- Double-approve prevented by checking `expiryApprovedAt !== null` under lock

**Result:** Legitimate large deletions are possible without manual SQL, but only for the most recent blocked run. No race window where a second admin or process observes partial state.

### 8.8 Spike Detection Thresholds

Alert and block if either:
- `(wouldExpireCount / activeCountBefore) > 30%` AND `wouldExpireCount >= 10`
- OR `wouldExpireCount >= 500`

---

## 9. FTP Operations

### 9.1 Protocol Support

| Protocol | Port | v1 Support | Security |
|----------|------|------------|----------|
| SFTP (SSH) | 22 | Yes (default) | Encrypted |
| FTP (plain) | 21 | Yes (opt-in) | **Cleartext - credentials exposed** |
| FTPS (TLS) | 990 | No (future) | Encrypted |

**Default:** SFTP. Plain FTP transmits credentials and data in cleartext.

### 9.2 FTP Security Controls

Plain FTP is allowed but requires explicit opt-in with safeguards:

**Admin UI:**
- FTP option shows warning: "⚠️ Insecure: Credentials transmitted in cleartext. Use SFTP if possible."
- Selecting FTP requires confirmation checkbox: "I understand FTP is insecure"

**Environment kill switch:**
```
AFFILIATE_FEED_ALLOW_PLAIN_FTP=false  # default in production
```
- If `false`, FTP transport selection returns validation error
- Allows orgs to enforce SFTP-only policy

**Audit logging:**
- `INSECURE_TRANSPORT_SELECTED` event when FTP is chosen
- Logged with actor, feed ID, timestamp

### 9.3 Mode

Passive mode only (works behind NAT, simpler).

### 9.4 File Selection

Fixed path configured per feed. Pattern matching out of scope for v1.

Example: `/feeds/impact/catalog.csv.gz`

### 9.5 Change Detection

Two-layer protection against reprocessing:

1. **Precheck:** STAT file for mtime/size (optimization, not source of truth)
   - If **both** mtime and size are available **and** match last known values → skip download
   - If either is missing, unavailable, or different → proceed to download

2. **Content hash:** SHA-256 of downloaded bytes (source of truth)
   - If hash matches `lastContentHash` → `skippedReason = UNCHANGED_HASH`
   - If different → process file

Store on feed: `lastRemoteMtime`, `lastRemoteSize`, `lastContentHash`

**STAT reliability notes:**

Many FTP/SFTP servers have unreliable metadata:
- Coarse timestamps (day-level, not second-level)
- Missing mtime entirely
- Size unavailable until transfer starts

**Decision logic:**

```typescript
async function shouldDownload(feed: AffiliateFeed, remoteStat: FileStat | null): Promise<boolean> {
  // If STAT failed or returned incomplete data, always download
  if (!remoteStat || remoteStat.mtime === undefined || remoteStat.size === undefined) {
    log.debug('STAT_INCOMPLETE', { feedId: feed.id, remoteStat });
    return true;
  }

  // If we have no prior metadata, always download
  if (feed.lastRemoteMtime === null || feed.lastRemoteSize === null) {
    return true;
  }

  // Both current and prior metadata exist - compare
  const mtimeMatch = remoteStat.mtime.getTime() === feed.lastRemoteMtime.getTime();
  const sizeMatch = remoteStat.size === feed.lastRemoteSize;

  if (mtimeMatch && sizeMatch) {
    log.debug('STAT_UNCHANGED', { feedId: feed.id, mtime: remoteStat.mtime, size: remoteStat.size });
    return false; // Skip download, use skippedReason = UNCHANGED_MTIME
  }

  return true;
}
```

**Skip reason semantics:**

| Scenario | Download? | `skippedReason` |
|----------|-----------|-----------------|
| STAT unavailable or incomplete | Yes | (check hash after download) |
| STAT matches prior | No | `UNCHANGED_MTIME` |
| STAT differs, hash matches | Yes (downloaded) | `UNCHANGED_HASH` |
| STAT differs, hash differs | Yes (downloaded) | (process file) |

### 9.6 Skipped Run Semantics

When a run is skipped due to unchanged content (mtime or hash match):

**Run record behavior:**
- **Create a run record** with status `SUCCEEDED` and `skippedReason` set
- This provides audit trail and visibility into scheduler activity
- Run duration will be short (just connection + metadata check)

**Side effects of skipped runs (same transaction as marking SUCCEEDED):**

| Effect | Behavior | Rationale |
|--------|----------|-----------|
| `consecutiveFailures` | Reset to 0 | File was successfully accessed; connection works |
| `manualRunPending` | **Cleared unconditionally** | User's request was honored (file just hadn't changed) |
| `lastRunAt` | Updated | Feed was checked |
| `lastSeenSuccessAt` | **NOT updated** | No products were actually observed |
| Circuit breaker | **NOT run** | No new data to evaluate |

**Important:** `manualRunPending` is cleared on **any** successful run completion, regardless of trigger type (`scheduled`, `manual`, or `manual_pending`). This is done in the same transaction as marking the run `SUCCEEDED`. See `markRunSucceededAndClearPending()` in Section 6.4.

**Why create a run record:**
- Ops visibility: "Why didn't my feed update?" → "File unchanged"
- Distinguishes "scheduler ran, nothing to do" from "scheduler didn't run"
- Audit trail for debugging stale data issues

**Why reset consecutiveFailures:**
- The FTP connection succeeded
- The file was accessible
- Only the content was unchanged
- This is not a failure condition

**Timing clarification:**
Skip detection happens **inside Phase 1**, after the run record already exists. The sequence is:

1. Lock acquired
2. Run record created (RUNNING) ← run exists before any file I/O
3. STAT file → if mtime unchanged, return `UNCHANGED_MTIME`
4. Download file → if hash unchanged, return `UNCHANGED_HASH`
5. If no skip, continue to parse/upsert

See Section 6.4 for the complete worker flow showing `executePhase1Ingest()` returning a skip reason.

---

## 10. Credential Security

### 10.1 Encryption Approach

Credentials are encrypted using AES-256-GCM. The symmetric key is provided via environment variable `CREDENTIAL_ENCRYPTION_KEY_B64`, containing a base64-encoded 32-byte key. The worker decrypts only at execution time. The admin/API encrypts on write.

**Key storage:**
- Environment variable: `CREDENTIAL_ENCRYPTION_KEY_B64`
- Required in: Harvester and Admin API runtime environments (same value in both)
- Format: Base64-encoded 32-byte key (AES-256)
- Validation: Decode base64, ensure length is exactly 32 bytes. **Hard fail on startup if invalid.**

**Rotation:** Post-v1. For v1, single key is acceptable. `secretKeyId`/`secretVersion` fields are placeholders for future KMS migration.

### 10.2 Ciphertext Payload Format

Store a single blob in `secretCiphertext` containing:

| Offset | Length | Field |
|--------|--------|-------|
| 0 | 1 byte | Version (currently `1`) |
| 1 | 12 bytes | IV (random, generated per encryption) |
| 13 | 16 bytes | Auth Tag (from GCM) |
| 29 | N bytes | Ciphertext |

This avoids extra columns and makes migrations easy.

**Associated Data (AAD):**

Use stable context to prevent copy-paste attacks:
```
AAD string: feed:{feedId}:v{secretVersion}
```

The same AAD must be passed on both encrypt and decrypt.

### 10.3 Implementation

Location: `packages/crypto/secrets.ts` (shared utility for affiliate feeds and future Merchant credential retrofit)

```typescript
import crypto from "crypto";

const KEY_B64 = process.env.CREDENTIAL_ENCRYPTION_KEY_B64;

export function loadCredentialKey(): Buffer {
  if (!KEY_B64) throw new Error("Missing CREDENTIAL_ENCRYPTION_KEY_B64");
  const key = Buffer.from(KEY_B64, "base64");
  if (key.length !== 32) throw new Error("CREDENTIAL_ENCRYPTION_KEY_B64 must decode to 32 bytes");
  return key;
}

const VERSION = 1;
const IV_LEN = 12;
const TAG_LEN = 16;

export function encryptSecret(plaintext: string, aad?: string): Buffer {
  const key = loadCredentialKey();
  const iv = crypto.randomBytes(IV_LEN);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  if (aad) cipher.setAAD(Buffer.from(aad, "utf8"));

  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([
    Buffer.from([VERSION]),
    iv,
    tag,
    ciphertext,
  ]);
}

export function decryptSecret(payload: Buffer, aad?: string): string {
  if (payload.length < 1 + IV_LEN + TAG_LEN) throw new Error("Ciphertext payload too short");
  const version = payload.readUInt8(0);
  if (version !== VERSION) throw new Error(`Unsupported secret version ${version}`);

  const iv = payload.subarray(1, 1 + IV_LEN);
  const tag = payload.subarray(1 + IV_LEN, 1 + IV_LEN + TAG_LEN);
  const ciphertext = payload.subarray(1 + IV_LEN + TAG_LEN);

  const key = loadCredentialKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  if (aad) decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
```

### 10.4 Decryption Location

**Harvester worker only**, just before FTP connection.

- Job data contains `feedId` only
- Worker loads feed, decrypts credential using `decryptSecret(feed.secretCiphertext, aad)`
- Credentials never pass through Redis

### 10.5 Operational Guardrails

1. **Startup check:** Validate env key at process boot for both Admin API and Harvester worker
2. **Never log:** plaintext, IV, tag, ciphertext, or decoded key
3. **Admin UI behavior:** Blank password field means "no change" — encryption only happens when a new value is submitted
4. **AAD construction:** Always use `feed:{feedId}:v{secretVersion}` for both encrypt and decrypt

### 10.6 Audit Logging

Dedicated `CREDENTIAL_CHANGED` audit event type:
- Log field names only (never values)
- Actor ID
- Feed ID
- Timestamp

No Slack notification for credential changes in v1.

### 10.7 Merchant Credential Retrofit (legacy: dealer)

Separate ticket immediately after affiliate feeds ship. The `packages/crypto/secrets.ts` utility is built once and reused for both affiliate and Merchant credentials.

---

## 11. Auto-Pause and Recovery

### 11.1 Auto-Pause Trigger

3 consecutive **final job failures** → status changes to `DISABLED`

**Counting logic:**
- A "failure" is counted only after all BullMQ retries are exhausted
- Individual retry attempts do not increment `consecutiveFailures`
- Example: Job fails, retries 3 times, finally fails → counts as 1 failure
- `consecutiveFailures` resets to 0 on any successful run

**State mutation ownership (critical):**

All run finalization happens in the worker job function via `markRunSucceededAndClearPending()` and `markRunFailed()`. BullMQ event handlers (`onCompleted`, `onFailed`) must **not** mutate database state.

| Responsibility | Owner | NOT Owner |
|----------------|-------|-----------|
| Set `finishedAt`, `durationMs` | Worker finalize functions | BullMQ handlers |
| Set terminal status (SUCCEEDED/FAILED) | Worker finalize functions | BullMQ handlers |
| Increment/reset `consecutiveFailures` | Worker finalize functions | BullMQ handlers |
| Trigger auto-disable | `markRunFailed()` | BullMQ `onFailed` |
| Enqueue Slack notifications | Worker (after finalize) | BullMQ handlers |

**Why:** BullMQ handlers run after job completion. If the handler mutates state, there's a race window where the run record shows `RUNNING` even though the job finished. Worker finalize functions ensure atomic state transitions within the job execution.

### 11.2 Status Definitions

| Status | Meaning | Resume Action |
|--------|---------|---------------|
| PAUSED | Operator-initiated stop | Click "Resume" |
| DISABLED | System-enforced (3 failures) | Click "Re-enable" + acknowledge |

### 11.3 UI Copy

- PAUSED: "Paused by admin"
- DISABLED: "Disabled due to repeated failures"

---

## 12. Admin UI

### 12.1 Menu Location

Top-level menu item: "Affiliate Feeds"

### 12.2 List View

Columns:
- Feed name (from Source)
- Network (Impact)
- Status (badge)
- Last run (relative time)
- Last run status
- Schedule
- Actions

### 12.3 Detail View

Tabs:
- Configuration (edit form)
- Run History (paginated table)
- Metrics (future)

### 12.4 Credential UI Handling

- Show masked placeholder: "••••••••"
- Helper text: "Leave blank to keep existing password"
- Update only if new value entered
- Empty input = keep existing

### 12.5 Test Run

**Returns:**
- `success` boolean
- `rowsDetected` count
- `formatDetected`
- Sample rows (first 10 post-mapping): itemId, sku, title, price, url
- Validation errors/warnings

**Limits:**
- Parse first 100 rows
- Return first 10 rows to UI

---

## 13. Search/Display Integration

### 13.1 Active Product Query (Fail-Closed for Affiliates)

**Important scoping note:** This query applies to `SourceProduct` records only. In v1, only affiliate feeds create `SourceProduct` records. DIRECT sources use the existing product pipeline (DealerSku, etc.) which has its own query patterns.

> **⚠️ V1 ASSUMPTION:** Only AFFILIATE sources produce `SourceProduct` records.
> If DIRECT sources are migrated to `SourceProduct` in the future, the INNER JOIN
> on `affiliate_feeds` will silently hide DIRECT products. This query MUST change.

**Affiliate SourceProduct query (fail-closed):**

```sql
-- ⚠️ ASSUMPTION: Only AFFILIATE sources produce SourceProduct in v1.
-- If DIRECT sources migrate to SourceProduct, this query MUST change.
SELECT sp.*, p.price, p.in_stock
FROM source_products sp
JOIN source_product_presence spp ON sp.id = spp.source_product_id
JOIN sources s ON sp.source_id = s.id
JOIN affiliate_feeds af ON s.id = af.source_id  -- ← INNER JOIN assumes affiliate-only
JOIN LATERAL (
  SELECT * FROM prices
  WHERE source_product_id = sp.id
  ORDER BY created_at DESC
  LIMIT 1
) p ON true
WHERE (:now - spp.last_seen_success_at) <= (af.expiry_hours * interval '1 hour')
  AND s.is_display_primary = true
```

**Why INNER JOIN is correct here:**
- `SourceProduct` is only created by affiliate feed ingest
- Every `SourceProduct` has a `Source` with an `AffiliateFeed`
- DIRECT sources don't create `SourceProduct` records (they use DealerSku)

**If future versions unify all products into SourceProduct:**

When DIRECT sources also use `SourceProduct`, the query must change:

```sql
SELECT sp.*, p.price, p.in_stock
FROM source_products sp
JOIN source_product_presence spp ON sp.id = spp.source_product_id
JOIN sources s ON sp.source_id = s.id
LEFT JOIN affiliate_feeds af ON s.id = af.source_id
JOIN LATERAL (
  SELECT * FROM prices
  WHERE source_product_id = sp.id
  ORDER BY created_at DESC
  LIMIT 1
) p ON true
WHERE (
    -- Affiliate sources: use per-feed expiry
    (af.id IS NOT NULL AND (:now - spp.last_seen_success_at) <= (af.expiry_hours * interval '1 hour'))
    OR
    -- DIRECT sources: use system default expiry (or always active if no presence tracking)
    (af.id IS NULL AND (
      spp.last_seen_success_at IS NULL  -- No presence tracking = always active
      OR (:now - spp.last_seen_success_at) <= (:defaultExpiryHours * interval '1 hour')
    ))
  )
  AND (
    s.is_display_primary = true
    OR (
      NOT EXISTS (
        SELECT 1 FROM sources s2
        WHERE s2.retailer_id = s.retailer_id
          AND s2.is_display_primary = true
      )
      AND s.source_kind = 'DIRECT'
    )
  )
```

**v1 reality:**
- Affiliate products: `SourceProduct` + `SourceProductPresence` + `Price`
- DIRECT products: Existing DealerSku pipeline (unchanged)
- Search unification is post-v1

**Display primary behavior by source kind:**

| Source Kind | `isDisplayPrimary` | Visibility |
|-------------|-------------------|------------|
| DIRECT | any | Always visible (existing behavior, fail-open) |
| AFFILIATE | `true` | Visible |
| AFFILIATE | `false` or NULL | **Not visible** (fail-closed) |

**Why different behavior:**
- **DIRECT (fail-open):** Existing retailers must stay visible even if flag is missing. Bad migration cannot take down search.
- **AFFILIATE (fail-closed):** New sources require explicit primary selection before exposure. Safer launch - admin must consciously enable visibility.

**Implication:** When creating an affiliate Source, admin must explicitly set `isDisplayPrimary = true` (or toggle it after creation) for products to appear in search. This prevents accidental exposure of untested feeds.

### 13.2 Merge Strategy

**v1: SourceProduct-based search (no canonical merge)**

In v1, search queries return `SourceProduct` records directly. There is no join to a canonical SKU table.

- `SourceProduct.sku` is stored as a secondary identifier for debugging/future use
- No `canonicalSkuId` FK exists on `SourceProduct`
- Search results are grouped/deduplicated at the application layer if needed

**Future (post-v1): Canonical SKU merge**

When canonical merge is implemented:
- Add `canonicalSkuId` FK to `SourceProduct` (nullable, filled when exact match exists)
- Matching job populates FK via exact SKU/UPC match
- Search queries can then join through canonical SKU for cross-source aggregation
- No fuzzy matching planned

**Why defer:**
- Canonical SKU matching requires a robust SKU normalization strategy
- v1 focus is on getting affiliate data flowing correctly
- SourceProduct-based search is sufficient for initial launch

### 13.3 Multi-Source Display

When retailer has both direct and affiliate sources:
- If any source is marked `isDisplayPrimary = true`, use that one
- If no primary is set, fall back to `sourceKind = DIRECT` (DIRECT sources are fail-open)
- AFFILIATE sources with `isDisplayPrimary = false` are **never** shown (fail-closed)
- Admin can toggle primary via admin UI

### 13.4 Admin Primary Toggle Behavior

When admin sets a source as primary:
1. Transactionally set all other sources for that retailer to `isDisplayPrimary = false`
2. Set the chosen source to `isDisplayPrimary = true`
3. Partial unique index enforces constraint

### 13.5 Tier Enforcement

Same rules as existing sources. Tiers affect features, not product visibility.

---

## 14. Click Tracking (v1 Scope)

### 14.1 Implement Now

- `buildTrackingUrl(offer, source)` function
- Uses `Source.affiliateTrackingTemplate`

### 14.2 Deferred

- Click redirect endpoint
- Click event logging
- Attribution/commission tracking

---

## 15. Slack Notifications

### 15.1 Delivery

Harvester enqueues to `@ironscout/notifications` service.

### 15.2 Failure Impact

Slack errors are logged but **never fail the run**.

### 15.3 Routing

Global ops channel for all affiliate feed alerts in v1.

### 15.4 Alert Types

- Run failed
- Expiration spike detected
- Feed auto-disabled (3 failures)

### 15.5 Run Cleanup Job

**Purpose:** Delete old `AffiliateFeedRun` records and cascaded data to prevent unbounded table growth.

**Trigger:** Daily scheduler tick (separate from feed scheduling). Runs once per day during low-traffic window.

**Retention policy:**
| Data | Retention | Deletion Method |
|------|-----------|-----------------|
| `AffiliateFeedRun` | 30 days | Delete where `startedAt < now() - 30 days` |
| `SourceProductSeen` | Cascades | `onDelete: Cascade` from run |
| `AffiliateFeedRunError` | Cascades | `onDelete: Cascade` from run |
| `Price.affiliateFeedRunId` | SET NULL | FK reference becomes null, price row preserved |

**Deduplication timing:** The partial unique index `prices_affiliate_dedupe` applies only at ingest-time. After cleanup nulls `affiliateFeedRunId`, the index no longer covers those rows. This is correct: deduplication prevents duplicates during insert; cleanup does not affect historical uniqueness guarantees.

**Implementation:**

```typescript
async function cleanupOldRuns(): Promise<CleanupResult> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Batch delete to avoid long-running transactions
  // Delete in chunks of 1000 runs
  let totalDeleted = 0;
  let batchDeleted: number;

  do {
    const runsToDelete = await prisma.affiliateFeedRun.findMany({
      where: { startedAt: { lt: cutoff } },
      select: { id: true },
      take: 1000,
    });

    if (runsToDelete.length === 0) break;

    // Cascades handle SourceProductSeen and AffiliateFeedRunError
    // Price.affiliateFeedRunId is SET NULL (prices preserved)
    batchDeleted = await prisma.affiliateFeedRun.deleteMany({
      where: { id: { in: runsToDelete.map(r => r.id) } },
    });

    totalDeleted += batchDeleted.count;

    log.info('CLEANUP_BATCH_COMPLETE', {
      batchDeleted: batchDeleted.count,
      totalDeleted,
      cutoffDate: cutoff.toISOString(),
    });
  } while (batchDeleted.count > 0);

  log.info('CLEANUP_COMPLETE', { totalDeleted, cutoffDate: cutoff.toISOString() });
  return { totalDeleted };
}
```

**Price FK behavior:**

```prisma
model Price {
  // ...
  affiliateFeedRun  AffiliateFeedRun? @relation(fields: [affiliateFeedRunId], references: [id], onDelete: SetNull)
}
```

When a run is deleted, `Price.affiliateFeedRunId` becomes NULL. The price row is preserved (append-only per ADR-004). The `priceSignatureHash` remains for debugging but `affiliateFeedRunId` no longer links to a run.

**Observability:**
- Log `CLEANUP_COMPLETE` with `totalDeleted` count
- Alert if cleanup takes > 10 minutes (may indicate table bloat)

---

## 16. Retry Policy

### 16.1 BullMQ Configuration

Default: 3 attempts, exponential backoff (5s, 15s, 45s)

**Interaction with auto-disable (Section 11.1):**
- Retries happen within a single job execution
- `consecutiveFailures` only increments after all retries exhausted
- 3 retries × 3 final failures = up to 9 total attempts before auto-disable

### 16.2 Retry Eligibility

Errors are classified into three categories based on FTP/SFTP library error codes:

| Category | Error Type | Codes / Patterns | Retry? | Notes |
|----------|------------|------------------|--------|-------|
| **Transient** | Network timeout | `ETIMEDOUT`, `ECONNRESET`, `EPIPE` | Yes | Exponential backoff |
| Transient | Connection refused | `ECONNREFUSED`, `ENOTFOUND` | Yes | Server may be restarting |
| Transient | Server busy | FTP 421, SFTP channel timeout | Yes | Temporary capacity |
| Transient | Temp file error | FTP 450, 452 | Yes | Disk/quota transient |
| **Permanent** | Auth failure | FTP 530, SFTP auth error | No | Bad credentials |
| Permanent | Permission denied | FTP 550 (permission), SFTP `EACCES` | No | ACL misconfiguration |
| Permanent | File not found | FTP 550 (not found), SFTP `ENOENT` | No | Path misconfiguration |
| Permanent | Parse error | CSV parse exception | No | File format issue |
| Permanent | Invalid format | Schema validation failure | No | Mapping misconfiguration |
| **Config** | TLS/cert error | `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, `CERT_HAS_EXPIRED` | No | Requires manual fix |
| Config | Protocol mismatch | Wrong port, wrong transport | No | Feed misconfigured |

**Classification logic:**

```typescript
function classifyError(error: Error & { code?: string }): 'transient' | 'permanent' | 'config' {
  const transientCodes = ['ETIMEDOUT', 'ECONNRESET', 'EPIPE', 'ECONNREFUSED', 'ENOTFOUND'];
  const permanentCodes = ['EACCES', 'ENOENT'];
  const configPatterns = ['CERT', 'TLS', 'SSL', 'VERIFY'];

  if (transientCodes.includes(error.code ?? '')) return 'transient';
  if (permanentCodes.includes(error.code ?? '')) return 'permanent';
  if (configPatterns.some(p => error.message.includes(p))) return 'config';
  if (error.message.includes('parse') || error.message.includes('validation')) return 'permanent';

  // Default to transient for unknown errors (retry is safer than failing)
  return 'transient';
}
```

**Retry behavior by classification:**
- `transient`: Retry with exponential backoff (throw error, let BullMQ retry)
- `permanent`: Fail immediately, increment `consecutiveFailures`, no retry
- `config`: Fail immediately, log at ERROR with remediation hint, no retry

### 16.3 BullMQ Retry Prevention

**Problem:** BullMQ retries all failed jobs by default. For permanent/config errors, retrying is pointless and delays the `consecutiveFailures` increment.

**Solution:** Use `job.discard()` before throwing for non-retryable errors.

```typescript
import { Job, UnrecoverableError } from 'bullmq';

async function handleFeedIngestJob(job: Job<AffiliateFeedJobData>) {
  try {
    await executeIngest(job.data);
  } catch (error) {
    const classification = classifyError(error as Error);

    if (classification === 'transient') {
      // Let BullMQ retry with backoff
      throw error;
    }

    // Permanent or config error - prevent retries
    // Option 1: Use UnrecoverableError (BullMQ v4+)
    throw new UnrecoverableError(error.message);

    // Option 2: Discard then throw (older BullMQ)
    // await job.discard();
    // throw error;
  }
}
```

**BullMQ UnrecoverableError:**
- Available in BullMQ v4+
- Job moves directly to 'failed' state without retry
- `consecutiveFailures` increments immediately
- Cleaner than `job.discard()` + throw

**Verify BullMQ version supports UnrecoverableError.** If not, use `job.discard()`.

**Error wrapper for classification:**

```typescript
class NonRetryableError extends Error {
  constructor(
    message: string,
    public readonly classification: 'permanent' | 'config',
    public readonly originalError: Error
  ) {
    super(message);
    this.name = 'NonRetryableError';
  }
}

// In catch block:
if (classification !== 'transient') {
  throw new UnrecoverableError(
    `[${classification.toUpperCase()}] ${error.message}`
  );
}
```

**Observability:**
- Log `RETRY_SKIPPED` at INFO level for permanent/config errors
- Include classification, error code, and remediation hint for config errors

---

## 17. Observability

### 17.1 Metrics

Per run:
- `downloadBytes`
- `rowsRead`, `rowsParsed`
- `productsUpserted`, `productsExpired`, `productsRejected`
- `pricesWritten`
- `errorCount`, `duplicateKeyCount`
- `durationMs`

### 17.2 Logging Strategy

All logs are structured JSON with consistent base fields:

```typescript
interface BaseLogContext {
  feedId: string;
  runId: string;
  sourceId: string;
  network: string;
  stage: 'scheduler' | 'download' | 'parse' | 'transform' | 'upsert' | 'circuit_breaker' | 'promote' | 'cleanup';
  timestamp: string;
}
```

### 17.3 Scheduler Logs

| Level | Event | Fields | When |
|-------|-------|--------|------|
| DEBUG | `SCHEDULER_TICK` | `eligibleFeeds`, `tickDurationMs` | Every scheduler tick |
| INFO | `FEED_ENQUEUED` | `feedId`, `nextRunAt`, `trigger` ('scheduled' \| 'manual') | Job enqueued to BullMQ |
| DEBUG | `FEED_SKIPPED_NOT_DUE` | `feedId`, `nextRunAt`, `now` | Feed not yet due |
| DEBUG | `FEED_SKIPPED_STATUS` | `feedId`, `status` | Feed paused/disabled/draft |
| WARN | `MANUAL_RUN_PENDING_SET` | `feedId`, `activeRunId` | Manual run queued while active |

### 17.4 Download Stage Logs

| Level | Event | Fields | When |
|-------|-------|--------|------|
| INFO | `DOWNLOAD_START` | `host`, `port`, `path`, `transport` | Beginning FTP/SFTP connection |
| DEBUG | `FTP_CONNECTED` | `host`, `connectionTimeMs` | Connection established |
| DEBUG | `FILE_STAT` | `remoteMtime`, `remoteSize`, `lastKnownMtime`, `lastKnownSize` | File metadata retrieved |
| INFO | `DOWNLOAD_SKIPPED_UNCHANGED` | `reason` ('UNCHANGED_MTIME' \| 'UNCHANGED_HASH'), `hash` | File unchanged, skipping |
| DEBUG | `DOWNLOAD_PROGRESS` | `bytesDownloaded`, `totalBytes`, `percentComplete` | Every 10% progress |
| INFO | `DOWNLOAD_COMPLETE` | `bytes`, `durationMs`, `compressionType` | Download finished |
| WARN | `DOWNLOAD_RETRY` | `attempt`, `maxAttempts`, `error`, `retryInMs` | Transient error, retrying |
| ERROR | `DOWNLOAD_FAILED` | `error`, `attempts`, `willRetry` | Download failed |

### 17.5 Parse Stage Logs

| Level | Event | Fields | When |
|-------|-------|--------|------|
| INFO | `PARSE_START` | `format`, `encoding`, `expectedColumns` | Beginning CSV parse |
| DEBUG | `PARSE_HEADERS` | `headers[]`, `mappedColumns{}` | Headers detected and mapped |
| DEBUG | `PARSE_PROGRESS` | `rowsRead`, `rowsParsed`, `rowsSkipped`, `percentComplete` | Every 1000 rows |
| WARN | `PARSE_ROW_SKIPPED` | `rowNumber`, `reason`, `rawRow` (truncated) | Row failed validation |
| WARN | `PARSE_COLUMN_MISSING` | `rowNumber`, `columnName`, `required` | Expected column missing |
| DEBUG | `PARSE_BATCH_COMPLETE` | `batchNumber`, `rowsInBatch`, `durationMs` | Batch boundary reached |
| INFO | `PARSE_COMPLETE` | `totalRows`, `parsedRows`, `skippedRows`, `durationMs` | Parsing finished |

### 17.6 Transform Stage Logs

| Level | Event | Fields | When |
|-------|-------|--------|------|
| DEBUG | `IDENTITY_RESOLVED` | `rowNumber`, `identityType`, `identityValue`, `alternates{}` | Identity key chosen |
| INFO | `IDENTITY_UPGRADE_DETECTED` | `rowNumber`, `oldType`, `newType`, `oldValue`, `newValue` | Higher-priority ID appeared |
| WARN | `URL_HASH_FALLBACK` | `rowNumber`, `url`, `hash` | No itemId/SKU, using URL hash |
| DEBUG | `URL_HASH_IDENTITY_CREATED` | `sourceProductId`, `url`, `hash` | New product using URL_HASH fallback (data quality signal) |
| DEBUG | `PRICE_SIGNATURE` | `rowNumber`, `amount`, `currency`, `promo`, `changed` | Price comparison result |
| DEBUG | `PRICE_HEARTBEAT_DUE` | `rowNumber`, `sourceProductId`, `lastPriceAt`, `hoursSince` | Writing heartbeat price |

### 17.7 Upsert Stage Logs

| Level | Event | Fields | When |
|-------|-------|--------|------|
| INFO | `UPSERT_BATCH_START` | `batchNumber`, `batchSize`, `totalBatches` | Beginning batch commit |
| DEBUG | `PRODUCT_CREATED` | `sourceProductId`, `identityType`, `identityValue` | New SourceProduct |
| DEBUG | `PRODUCT_UPDATED` | `sourceProductId`, `fieldsChanged[]` | Existing product updated |
| DEBUG | `PRICE_WRITTEN` | `sourceProductId`, `priceId`, `amount`, `reason` ('changed' \| 'heartbeat') | Price record appended |
| DEBUG | `PRESENCE_UPDATED` | `sourceProductId`, `lastSeenAt` | Presence timestamp updated |
| DEBUG | `SEEN_STAGED` | `sourceProductId`, `runId` | Added to staging table |
| WARN | `DUPLICATE_ROW_SAME_IDENTITY` | `rowNumber`, `identityType`, `identityValue`, `previousRow` | Duplicate in file |
| INFO | `UPSERT_BATCH_COMPLETE` | `batchNumber`, `productsUpserted`, `pricesWritten`, `durationMs` | Batch committed |
| ERROR | `UPSERT_BATCH_FAILED` | `batchNumber`, `error`, `rolledBack` | Batch failed |

### 17.8 Circuit Breaker Stage Logs

| Level | Event | Fields | When |
|-------|-------|--------|------|
| INFO | `CIRCUIT_BREAKER_START` | `t0`, `expiryHours` | Beginning evaluation |
| DEBUG | `CIRCUIT_BREAKER_COUNTS` | `activeCountBefore`, `seenSuccessCount`, `wouldExpireCount`, `expirePercent` | Metrics computed |
| WARN | `CIRCUIT_BREAKER_NEGATIVE_EXPIRE_COUNT` | `activeCountBefore`, `seenSuccessCount`, `rawExpireCount` | seenSuccessCount > activeCountBefore (data anomaly) |
| INFO | `CIRCUIT_BREAKER_PASSED` | `wouldExpireCount`, `expirePercent`, `thresholdPercent`, `thresholdAbsolute` | No spike, proceeding |
| WARN | `CIRCUIT_BREAKER_TRIPPED` | `wouldExpireCount`, `expirePercent`, `thresholdPercent`, `thresholdAbsolute`, `reason` | Spike detected, blocking |
| INFO | `PROMOTE_START` | `productsToPromote` | Beginning success timestamp promotion |
| DEBUG | `PROMOTE_PROGRESS` | `promoted`, `total`, `percentComplete` | Every 1000 products (if chunking post-v1) |
| INFO | `PROMOTE_COMPLETE` | `promoteRowsUpdated`, `productsExpired`, `durationMs` | Promotion finished (monitor for lock time issues) |

### 17.9 Admin Action Logs

| Level | Event | Fields | When |
|-------|-------|--------|------|
| INFO | `FEED_CREATED` | `feedId`, `sourceId`, `network`, `createdBy` | New feed created |
| INFO | `FEED_UPDATED` | `feedId`, `changedFields[]`, `updatedBy` | Feed config changed |
| WARN | `EXPIRY_HOURS_CHANGED` | `feedId`, `oldValue`, `newValue`, `changedBy` | Expiry window changed (affects active definition, see 2.8.2) |
| INFO | `FEED_STATUS_CHANGED` | `feedId`, `oldStatus`, `newStatus`, `changedBy`, `reason` | Status transition |
| WARN | `FEED_AUTO_DISABLED` | `feedId`, `consecutiveFailures`, `lastError` | 3 failures reached |
| INFO | `CREDENTIAL_CHANGED` | `feedId`, `fieldName`, `changedBy` | Password/username updated (no values!) |
| WARN | `INSECURE_TRANSPORT_SELECTED` | `feedId`, `transport`, `selectedBy` | FTP chosen over SFTP |
| INFO | `MANUAL_RUN_REQUESTED` | `feedId`, `requestedBy` | Run Now clicked |
| INFO | `ACTIVATION_APPROVED` | `feedId`, `runId`, `approvedBy`, `productsPromoted` | Blocked run approved |
| WARN | `ACTIVATION_APPROVAL_REJECTED` | `feedId`, `runId`, `reason` | Approval blocked (stale run) |

### 17.10 Run Lifecycle Logs

| Level | Event | Fields | When |
|-------|-------|--------|------|
| DEBUG | `SKIPPED_LOCK_BUSY` | `feedId`, `feedLockId`, `trigger` | Lock busy, no run record created (scheduled) |
| DEBUG | `MANUAL_RUN_DEFERRED` | `feedId`, `feedLockId` | Lock busy, keeping manualRunPending=true |
| DEBUG | `ADVISORY_LOCK_ACQUIRED` | `feedLockId`, `feedId` | Lock obtained, creating run record |
| INFO | `RUN_START` | `runId`, `feedId`, `trigger`, `workerPid` | Run record created, execution begins |
| INFO | `RUN_COMPLETE` | `runId`, `status`, `durationMs`, `summary{}` | Run finished |
| INFO | `RUN_FAILED` | `runId`, `error`, `stage`, `isPartial`, `durationMs` | Run failed |
| DEBUG | `ADVISORY_LOCK_RELEASED` | `feedLockId`, `runId` | Lock released |
| DEBUG | `MANUAL_RUN_PENDING_CHECK` | `feedId`, `pending`, `enqueuingFollowUp` | Checking pending flag |

### 17.11 Log Level Guidelines

| Level | Use For | Retention |
|-------|---------|-----------|
| DEBUG | Decision details, progress updates, internal state | Short (24-48h) |
| INFO | Run lifecycle, stage boundaries, admin actions | Medium (7-30 days) |
| WARN | Anomalies, fallbacks, blocked actions, security events | Long (90+ days) |
| ERROR | Failures, exceptions, data loss scenarios | Long (90+ days) |

### 17.12 Example Log Sequence

Successful run (INFO level):
```
INFO  FEED_ENQUEUED        feedId=abc123 trigger=scheduled
INFO  RUN_START            runId=run_456 feedId=abc123
INFO  DOWNLOAD_START       host=ftp.example.com path=/feeds/catalog.csv.gz
INFO  DOWNLOAD_COMPLETE    bytes=15234567 durationMs=3200
INFO  PARSE_START          format=CSV encoding=UTF-8
INFO  PARSE_COMPLETE       totalRows=50000 parsedRows=49823 skippedRows=177
INFO  UPSERT_BATCH_START   batchNumber=1 batchSize=1000
INFO  UPSERT_BATCH_COMPLETE batchNumber=1 productsUpserted=1000 durationMs=450
... (49 more batches)
INFO  CIRCUIT_BREAKER_START t0=2025-12-27T10:00:00Z
INFO  CIRCUIT_BREAKER_PASSED wouldExpireCount=50 expirePercent=0.001
INFO  PROMOTE_COMPLETE     promoteRowsUpdated=49823 productsExpired=50 durationMs=2100
INFO  RUN_COMPLETE         runId=run_456 status=SUCCEEDED durationMs=125000
```

### 17.13 Observability Events (Alertable)

- `IDENTITY_UPGRADE_DETECTED` - Higher-priority identifier appeared
- `CIRCUIT_BREAKER_TRIPPED` - Expiry threshold exceeded, promotion blocked
- `DATA_QUALITY_URL_HASH_SPIKE` - URL_HASH fallback exceeded threshold, promotion blocked (Section 3.3.2)
- `FEED_AUTO_DISABLED` - 3 consecutive failures
- `URL_HASH_FALLBACK` - Feed row missing itemId/SKU, using URL hash (data quality signal)
- `INSECURE_TRANSPORT_SELECTED` - FTP used instead of SFTP

---

## 18. Migration Requirements

### 18.1 Schema Migration

Add new tables and columns:
- `AffiliateFeed`, `AffiliateFeedRun`, `AffiliateFeedRunError`
- `SourceProduct`, `SourceProductPresence`, `SourceProductSeen`
- `Source.isDisplayPrimary`, `Source.sourceKind`
- `Price.sourceProductId`, `Price.affiliateFeedRunId`, `Price.priceSignatureHash`

Add required indexes:
```sql
-- Latest price lookup (critical for search performance)
CREATE INDEX prices_source_product_latest
ON prices(source_product_id, created_at DESC);

-- Circuit breaker active count queries (Section 8.2)
-- Without this, counting active products by lastSeenSuccessAt will table scan
CREATE INDEX spp_last_seen_success_at_idx
ON source_product_presence(last_seen_success_at);

-- Search query: active products by source (join through source_products)
-- source_products.source_id index already defined in model
-- This composite helps when filtering by source + joining to presence
CREATE INDEX sp_source_id_id_idx
ON source_products(source_id, id);

-- Approve Activation stale run check + run history filtering by status
-- Order: feed_id scopes, status narrows, started_at supports range
CREATE INDEX affiliate_feed_runs_feed_status_started_idx
ON affiliate_feed_runs(feed_id, status, started_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- AFFILIATE PRICE DEDUPLICATION (Section 2.6)
-- Ensures affiliate price inserts are idempotent per (sourceProductId, runId, signature).
-- Retries are safe: duplicate inserts are safely ignored without creating new rows.
-- Partial index: only applies to affiliate prices (where affiliateFeedRunId IS NOT NULL).
-- Existing pipelines and queries are unaffected.
--
-- CONFLICT HANDLING: Insert statements use ON CONFLICT DO NOTHING (no target).
-- PostgreSQL will suppress conflicts on this partial unique index.
--
-- ⚠️ CRITICAL CONSTRAINT: The `prices` table MUST NOT have any other unique
-- constraints or indexes. Insert statements use ON CONFLICT DO NOTHING which
-- suppresses conflicts on ALL unique constraints. If another constraint is
-- added, conflicts on that constraint would be silently suppressed, causing
-- data loss.
--
-- This is enforced via migration test (see Section 18.1.1 below).
--
-- Why not ON CONFLICT (cols) WHERE ... ?
-- PostgreSQL does NOT support targeting a partial unique index with WHERE in
-- ON CONFLICT. That syntax is invalid and errors at runtime.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX prices_affiliate_dedupe
ON prices (source_product_id, affiliate_feed_run_id, price_signature_hash)
WHERE affiliate_feed_run_id IS NOT NULL;

-- Validation constraint: expiryHours must be in valid range (Section 2.8.1)
-- Defense-in-depth; application validation is primary enforcement
ALTER TABLE affiliate_feeds
ADD CONSTRAINT expiry_hours_range
CHECK (expiry_hours BETWEEN 1 AND 168);
```

### 18.1.1 Migration Guard: prices Table Unique Constraints

**Invariant:** The `prices` table must have exactly one unique constraint/index: `prices_affiliate_dedupe`.

**Enforcement:** Add a migration test that fails if any new unique indexes or constraints are added to `prices`:

```typescript
// In migration tests (e.g., packages/db/__tests__/schema-invariants.test.ts)

describe('prices table schema invariants', () => {
  it('must have exactly one unique index (prices_affiliate_dedupe)', async () => {
    const uniqueIndexes = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'prices'
        AND indexdef LIKE '%UNIQUE%'
    `;

    expect(uniqueIndexes).toHaveLength(1);
    expect(uniqueIndexes[0].indexname).toBe('prices_affiliate_dedupe');
  });

  it('must have no unique table constraints', async () => {
    const constraints = await prisma.$queryRaw<{ conname: string }[]>`
      SELECT conname
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'prices'
        AND c.contype = 'u'  -- unique constraint
    `;

    expect(constraints).toHaveLength(0);
  });
});
```

**Why this matters:** The affiliate feed pipeline uses `ON CONFLICT DO NOTHING` without a conflict target, which suppresses conflicts on ALL unique constraints. If a second unique constraint is added, conflicts on that constraint would be silently suppressed, causing data loss. This test turns the "HARD RULE" into an enforceable invariant.

**CI integration:** This test must run on every PR that modifies `schema.prisma` or adds migrations. Failure blocks merge.

### 18.2 Data Backfill (Critical)

**Migration path for `Source.retailerId`:**

The current `Source` model has no `retailerId`. Adding this as a required FK requires a multi-step migration:

1. **Add nullable column:** `ALTER TABLE sources ADD COLUMN retailer_id TEXT;`
2. **Backfill existing sources:** Match sources to retailers by domain/URL. For sources that cannot be auto-matched, admin must manually assign retailer before next step.
3. **Add FK constraint:** `ALTER TABLE sources ADD CONSTRAINT sources_retailer_id_fkey FOREIGN KEY (retailer_id) REFERENCES retailers(id);`
4. **Make non-nullable:** `ALTER TABLE sources ALTER COLUMN retailer_id SET NOT NULL;`

```sql
-- Step 2a: Auto-match sources to retailers by domain
-- This covers most cases where Source.url matches Retailer.website
UPDATE sources s
SET retailer_id = r.id
FROM retailers r
WHERE s.retailer_id IS NULL
  AND (
    s.url LIKE '%' || replace(r.website, 'https://', '') || '%'
    OR s.url LIKE '%' || replace(r.website, 'http://', '') || '%'
  );

-- Step 2b: Report unmatched sources (must be manually assigned)
SELECT id, name, url FROM sources WHERE retailer_id IS NULL;
```

**After retailerId is populated**, run the remaining backfill:

```sql
-- 3. Ensure all existing sources have explicit sourceKind
UPDATE sources
SET source_kind = 'DIRECT'
WHERE source_kind IS NULL;

-- 4. Set exactly ONE DIRECT source per retailer as display primary
--    Selection rule: oldest source (by created_at, then id as tiebreaker)
WITH ranked AS (
  SELECT id, retailer_id,
         ROW_NUMBER() OVER (
           PARTITION BY retailer_id
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM sources
  WHERE source_kind = 'DIRECT'
)
UPDATE sources s
SET is_display_primary = (ranked.rn = 1)
FROM ranked
WHERE s.id = ranked.id;
```

**Why oldest-first:** Oldest DIRECT source is most likely to be the canonical/production source. Test sources and fallbacks are typically created later.

### 18.3 Constraint Migration

Add partial unique index after backfill:

```sql
CREATE UNIQUE INDEX sources_one_primary_per_retailer
ON sources(retailer_id)
WHERE is_display_primary = true;
```

**Order matters:**
1. Schema migration adds columns with defaults (`source_kind = NULL`, `is_display_primary = false`)
2. Backfill sets `source_kind = 'DIRECT'` for all existing sources
3. Backfill sets exactly one `is_display_primary = true` per retailer (oldest DIRECT source)
4. Partial unique index enforces constraint going forward

If step 3 is skipped or sets multiple primaries, step 4 will fail.

---

## 19. Implementation Order

1. Prisma migration for new models + Source columns
2. Data backfill migration (sourceKind + isDisplayPrimary)
3. Add partial unique index constraint
4. Credential encryption utility
5. Admin UI (CRUD + test)
6. AffiliateFeed ingest worker
7. Singleton scheduler integration
8. Expiration logic
9. Slack notifications
10. End-to-end testing

---

## 20. Testing Requirements

Per `context/reference/testing.md`:

- [ ] Eligibility enforcement (ineligible feeds skipped)
- [ ] Append-only price writes
- [ ] Fail-closed on parse errors
- [ ] Expiration only after successful runs
- [ ] Auto-pause after 3 failures
- [ ] Credential decryption only in worker
- [ ] Advisory lock prevents concurrent runs
- [ ] Spike detection thresholds

---

## 21. Related Documents

- `decisions/ADR-001.md` - Singleton scheduler
- `decisions/ADR-002.md` - Server-side enforcement
- `decisions/ADR-004.md` - Append-only price history
- `decisions/ADR-009.md` - Fail closed on ambiguity

---

## Appendix A: Decision Log

This appendix records all architecture decisions made during the specification process.

### A.1 Schema Decisions

| ID | Question | Decision |
|----|----------|----------|
| Q3.0.1 | Offer System Architecture | SourceProduct + SourceProductPresence + Price = the offer system. Uses **time-window activity model**: lifecycle states (Active/Stale/Pending) derived from timestamps at query time, not stored as status enum. Prevents state conflicts and simplifies circuit breaker. |
| Q3.0.2 | Presence NULL Semantics | `lastSeenSuccessAt` is nullable. NULL = never promoted = invisible in search = excluded from circuit breaker denominator. New products only become visible after successful Phase 2 promotion. Fail-closed per ADR-009. |
| Q3.1.1 | Offer vs Price Table | No separate Offer model. Use SourceProduct + SourceProductPresence + Price. Price is append-only per ADR-004. |
| Q3.1.2 | When to Write Price Row | Insert new Price row when: (1) no prior price exists, (2) signature changed, OR (3) heartbeat due. Heartbeat measured from `Price.createdAt` per SourceProduct (not per feed, not from `lastSeenAt`). |
| Q3.1.3 | Identity Key Changes | Create new SourceProduct. Old one expires via presence timestamp aging. No linking. |
| Q3.2.1 | AffiliateFeed vs Source | New AffiliateFeed model links 1:1 to Source. Source = commercial identity, AffiliateFeed = ingestion operations. |
| Q3.2.2 | Duplicate Sources per Retailer | One display-primary Source per Retailer via `isDisplayPrimary` boolean + `sourceKind` enum. Partial unique index enforces constraint. |
| Q3.2.3 | Display Primary Visibility | DIRECT sources: fail-open (visible even if flag missing). AFFILIATE sources: fail-closed (require explicit `isDisplayPrimary = true` to appear in search). Safer launch for new affiliate feeds. |
| Q3.2.4 | sourceId Denormalization | Store `sourceId` directly on `AffiliateFeedRun` (denormalized from feed→source). Avoids join churn in dashboards, logs, and queries. Low-risk, high convenience. |
| Q3.2.5 | feedLockId Stability | `feedLockId` is autoincrement, guarantees uniqueness within single DB instance. Value is NOT stable across DB restores/clones - this is acceptable since advisory locks only need in-DB uniqueness. |
| Q3.2.6 | Source → Retailer Relationship | `Source.retailerId` is **required FK**. Affiliate sources must belong to a Retailer for display grouping, primary selection, and "View at <retailer>" display. v1 mapping: Impact advertiser = Retailer (1:1, operator-defined in admin UI). Add optional `affiliateAccountId`/`affiliateAccountName` for traceability. |
| Q3.3.1 | Naming Convention | PascalCase models (`AffiliateFeed`, `AffiliateFeedRun`), camelCase fields. |

### A.2 Security Decisions

| ID | Question | Decision |
|----|----------|----------|
| Q4.1.1 | Encryption Approach | AES-256-GCM with env-based key (`CREDENTIAL_ENCRYPTION_KEY_B64`). Base64-encoded 32-byte key. Ciphertext payload: version(1) + iv(12) + tag(16) + ciphertext. AAD: `feed:{feedId}:v{secretVersion}`. Schema includes `secretKeyId`/`secretVersion` for future KMS. |
| Q4.1.2 | Decryption Location | Harvester worker only, just before FTP connection. Job data contains `feedId` only. Credentials never in Redis. Hard fail on startup if key invalid. |
| Q4.1.3 | Merchant Credential Retrofit | Separate ticket after affiliate feeds ship. Utility at `packages/crypto/secrets.ts` built once, used for both. |
| Q4.2.1 | Audit Logging | Dedicated `CREDENTIAL_CHANGED` audit event. Log field names only (not values), actor, feed, timestamp. No Slack in v1. |

### A.3 Scheduler Decisions

| ID | Question | Decision |
|----|----------|----------|
| Q5.1.1 | Null Schedule Frequency | Null = manual only. No auto-runs. |
| Q5.1.2 | Scheduling Granularity | Hours only (1, 2, 4, 6, 12, 24) for v1. Cron expressions deferred. |
| Q5.1.3 | Computing nextRunAt | Use explicit `nextRunAt` field. Scheduler queries `nextRunAt <= now()`, then sets `nextRunAt = now() + frequency`. Prevents drift and defines backlog behavior (1 run, not N). |
| Q5.1.4 | Atomic Feed Claiming | Use `FOR UPDATE SKIP LOCKED` in scheduler to atomically claim due feeds. Prevents duplicate scheduling even with multiple scheduler instances. |
| Q5.1.5 | Scheduler Delivery Guarantee | At-most-once per interval. If scheduler crashes after claim but before enqueue, run is skipped until next `nextRunAt`. Acceptable for v1; outbox pattern documented for post-v1 if needed. |
| Q5.3.1 | Run Mutual Exclusion | Advisory lock only, no BullMQ jobId dedupe. JobId dedupe interacts badly with `manualRunPending` follow-up enqueues (can strand pending=true). Lock-busy handling is sufficient: multiple jobs may queue but only one runs, others exit cleanly. |
| Q5.3.2 | Run Now Button | Always set `manualRunPending=true` then enqueue (idempotent, no TOCTOU race). Job either acquires lock and clears flag, or finds lock busy and exits (flag stays true for active run to pick up). |
| Q5.3.3 | Lock-Busy Behavior | No CANCELED run records. Scheduled runs: skip silently (DEBUG log). Manual runs: keep `manualRunPending=true` for retry. Run records created only after lock acquired. |
| Q5.3.4 | Advisory Lock Scope | Lock held through **both** Phase 1 and Phase 2. Released only after promotion completes or circuit breaker blocks. Prevents race where Run B's Phase 1 corrupts Run A's Phase 2 promotion. |
| Q5.3.5 | Run Finalization Ownership | Worker finalize functions (`markRunSucceededAndClearPending`, `markRunFailed`) own all terminal state mutations: `finishedAt`, `durationMs`, status, `consecutiveFailures`. BullMQ handlers must NOT mutate DB state. Prevents race between job completion and handler execution. |
| Q5.3.6 | Timestamp Naming | Use `startedAt`/`finishedAt` (not `completedAt`). "Finished" is neutral and applies to both SUCCEEDED and FAILED. `durationMs` computed once in finalize function as `finishedAt - startedAt`. |
| Q5.3.7 | Run Trigger Tracking | Persist `trigger` enum (`SCHEDULED`, `MANUAL`, `MANUAL_PENDING`, `ADMIN_TEST`) on `AffiliateFeedRun`. Set once at run creation, immutable across BullMQ retries. Enables audit trails, UI filters, and metrics splits. Index on `(feedId, trigger, startedAt)` for filtered queries. |
| Q5.3.8 | Advisory Lock Key Type | Use `AffiliateFeed.feedLockId` (BIGINT auto-increment) for PostgreSQL advisory locks. Feed IDs (cuid strings) are never hashed or converted. Eliminates collision risk, aligns model with database semantics. Worker loads feed first to get `feedLockId` (already required for config/credentials). |
| Q5.3.9 | Follow-Up Enqueue Timing | Read `manualRunPending` and `status` while still holding advisory lock. Release lock. Then enqueue follow-up only if `pending && status === 'ENABLED'`. Eliminates race ambiguity and prevents surprise runs after admin pauses feed mid-run. |
| Q5.3.10 | Run Record Creation Invariant | On first attempt: (1) acquire lock, (2) create run record, (3) call `job.updateData({ runId })` - these three steps MUST complete before any throwable I/O. If `updateData` isn't called before FTP/download fails, retry creates duplicate run. Invariant ensures one run per job execution. |
| Q5.4.1 | Multi-Network Scheduling | v1: Single scheduler claims all feeds regardless of network (Impact-only). No network predicate needed. v2: Keep unified tick by default. Add network partitioning only if networks need different cadence/SLAs/throttling. Rate limits via worker concurrency, not scheduler filtering. |

### A.4 Ingest Pipeline Decisions

| ID | Question | Decision |
|----|----------|----------|
| Q6.1.1 | Normalized URL Hash | Remove tracking params, preserve product params. Lowercase host, remove protocol, sort params, SHA-256. |
| Q6.1.2 | Store Secondary Identifiers | Store all identifiers on SourceProduct. Use only resolved one for identity. Others are informational. |
| Q6.1.3 | Identity Type Changes | Identity type is immutable. Higher-priority identifier creates new SourceProduct. Emit `IDENTITY_UPGRADE_DETECTED`. |
| Q6.1.4 | Identity Flap Detection | **DEFERRED to post-v1.** URL_HASH quality gate provides sufficient protection. Flap detection adds observability, not safety. Cut to speed v1 delivery. |
| Q6.1.5 | URL_HASH Quality Gate | Track `urlHashFallbackCount` per run. Block promotion if >50% or >1000 products use URL_HASH. `expiryBlocked=true`, `reason='DATA_QUALITY_URL_HASH_SPIKE'`. Admin can approve if acceptable for feed. Prevents runaway duplicates from unstable identifiers. |
| Q6.2.1 | Partial Failure Handling | Keep successful upserts, mark run FAILED, set `isPartial = true`. No expiry on failed runs. |
| Q6.2.2 | lastSeenAt on Failed Runs | Update `lastSeenAt` as processed. Add `lastSeenSuccessAt` for expiry (updated only after circuit breaker passes). |
| Q6.3.1 | Duplicate Rows in File | Last row wins (upsert). Track `duplicateKeyCount`. Sample in errors. Don't count toward auto-pause. |
| Q6.4.1 | Price Evaluation Batching | Per-row DB reads are forbidden (self-inflicted outage at 50K rows). Batch-fetch last prices per chunk using `DISTINCT ON`. Maintain run-local `lastPriceCache` updated after each batch insert. Dedupe rows within chunk before processing. |
| Q6.5.1 | Retry Price Deduplication | Add `affiliateFeedRunId` and `priceSignatureHash` to Price (nullable, affiliate-only). Partial unique index `prices_affiliate_dedupe` ensures inserts are idempotent per `(sourceProductId, runId, signature)`. Use `ON CONFLICT DO NOTHING` (no target). ⚠️ HARD RULE: `prices` table must have no other unique constraints—**enforced via migration test** (Section 18.1.1). Duplicate insert attempts are safely ignored; `pricesWritten` incremented from DB rowCount, not array length. |
| Q6.6.1 | File Size and Row Limits | Hard limits to prevent OOM: 500 MB file size, 500K rows. Per-feed overrides via `maxFileSizeBytes`/`maxRowCount`. Abort with `FILE_SIZE_LIMIT_EXCEEDED` or `ROW_COUNT_LIMIT_EXCEEDED`. Cache grows with unique products; limits bound memory usage. |

### A.5 Expiration Decisions

| ID | Question | Decision |
|----|----------|----------|
| Q7.1.1 | When Expiration Runs | Two-phase circuit breaker. Phase 1: ingest + stage presence. Phase 2: evaluate thresholds before promoting `lastSeenSuccessAt`. |
| Q7.1.2 | Expiry Step Failure | Run stays SUCCEEDED. If circuit breaker trips, set `expiryBlocked = true` + reason. |
| Q7.2.1 | Active Products Definition | Query-time filter: `NOW() - lastSeenSuccessAt <= expiryHours`. No status field. |
| Q7.2.2 | Spike Detection Thresholds | Block + alert if: `(wouldExpire / activeBefore) > 30% AND wouldExpire >= 10` OR `wouldExpire >= 500`. |
| Q7.2.3 | Admin Approval Action | "Approve Activation" with guardrails: must be SUCCEEDED + blocked + not already approved + no newer successful run exists. Prevents promoting stale state. |
| Q7.2.4 | Approval Concurrency | Acquire feed advisory lock before approval (prevents ingest race). Use conditional `UPDATE ... WHERE expiryApprovedAt IS NULL` to prevent double-approve atomically. Check rows affected. |
| Q7.2.5 | expiryHours Validation | Enforce range 1-168 hours at all API boundaries (create, update, enable). Zero/negative breaks time-window model. Unbounded disables expiration. DB CHECK constraint as defense-in-depth, application validation is primary. |
| Q7.2.6 | expiryHours Change Semantics | Changing `expiryHours` retroactively affects "active" definition. Immediate effect on search visibility and circuit breaker. Accepted for v1 (simpler). Emit `EXPIRY_HOURS_CHANGED` audit log at WARN level. Post-v1: consider `expiryHoursAtRun` on run record for explainability. |

### A.6 FTP Decisions

| ID | Question | Decision |
|----|----------|----------|
| Q8.1.1 | Protocol Support | SFTP (default, encrypted) and FTP (opt-in with warning, env kill switch, audit log). FTPS deferred. |
| Q8.1.2 | FTP Mode | Passive mode only. |
| Q8.2.1 | File Selection | Fixed path per feed. Pattern matching out of scope for v1. |
| Q8.2.2 | Reprocessing Protection | Both mtime/size precheck AND content hash. mtime as optimization, hash as source of truth. |
| Q8.2.3 | Skipped Run Semantics | Create run record with `SUCCEEDED` + `skippedReason`. In same transaction: reset `consecutiveFailures`, clear `manualRunPending` unconditionally (regardless of trigger type), update `lastRunAt`. Does NOT update `lastSeenSuccessAt` or run circuit breaker. |

### A.7 Admin UI Decisions

| ID | Question | Decision |
|----|----------|----------|
| Q9.1.1 | Status Definitions | PAUSED = operator-initiated, resume immediately. DISABLED = system-enforced (3 failures), requires re-enable. |
| Q9.2.1 | Credential UI Handling | Show masked placeholder. Empty input = keep existing. `CREDENTIAL_CHANGED` audit only when non-empty. |
| Q9.3.1 | Test Run Output | Row count + sample parsed data (10 rows) + validation errors/warnings. |
| Q9.3.2 | Test Row Limit | Parse first 100 rows, return first 10 to UI. |

### A.8 Integration Decisions

| ID | Question | Decision |
|----|----------|----------|
| Q10.3.1 | Search/Display Integration | v1: SourceProduct-based search, no canonical merge. `canonicalSkuId` FK deferred to post-v1. Fail-open query pattern. |
| Q10.3.2 | Tier Enforcement | Same rules as existing sources. Tiers affect features, not visibility. |
| Q10.4.1 | Click Tracking Scope | v1: `buildTrackingUrl()` only. Deferred: redirect endpoint, click logging, attribution. |
| Q10.5.1 | Multi-Network Schema | Single table with discriminator. `configJson` removed for v1 - no known Impact field-mapping variance. Impact column names hardcoded in ingest code. Re-introduce as versioned `impactConfig Json` when variance is observed. |

### A.9 Operational Decisions

| ID | Question | Decision |
|----|----------|----------|
| Q10.2.6 | Retry Policy | BullMQ default (3 attempts, exponential backoff). Only retry transient errors. |
| Q10.2.7 | BullMQ Retry Prevention | Use `UnrecoverableError` (BullMQ v4+) or `job.discard()` for permanent/config errors. Prevents pointless retries, ensures `consecutiveFailures` increments immediately. Classify errors via `classifyError()` function. |
| Q10.3 | Advisory Lock Key | `feedLockId BIGSERIAL` column for PostgreSQL advisory locks. |
| Q10.7.1 | Slack Delivery | Harvester enqueues to `@ironscout/notifications` service. |
| Q10.7.2 | Slack Failure Impact | Logged but never fails the run. |
| Q10.7.3 | Slack Routing | Global ops channel for all affiliate feed alerts in v1. |
| Q10.8.1 | Run Cleanup Job | Daily scheduler job deletes runs older than 30 days. Batch delete (1000 at a time) to avoid long transactions. Cascades delete `SourceProductSeen` and `AffiliateFeedRunError`. `Price.affiliateFeedRunId` set to NULL (prices preserved per ADR-004). |

---

## Appendix B: ADR Compliance Matrix

| ADR | Requirement | How This Spec Complies |
|-----|-------------|------------------------|
| ADR-001 | Singleton Harvester Scheduler | Uses singleton scheduler loop, not BullMQ repeatable jobs. BullMQ for execution only. |
| ADR-002 | Server-side enforcement | Tier and eligibility resolved server-side. Client cannot bypass. |
| ADR-004 | Append-only price history | Price table unchanged. SourceProduct has no `currentPrice` cache. Derive from latest Price record. |
| ADR-005 | Retailer visibility at query time | Display primary filtering happens in SQL query, not application logic. |
| ADR-009 | Fail closed on ambiguity | Partial failures keep data but block expiry. Circuit breaker blocks activation on spikes. |
| ADR-010 | Routine ops without code changes | Feed enable/disable, frequency changes, manual runs all via admin UI. |

---

## Appendix C: Open Items

| Item | Status | Notes |
|------|--------|-------|
| Rollback Strategy | Deferred | Consider adding `invalidatedAt`, `invalidatedByRunId` to SourceProduct for run-level invalidation. Acceptable to add post-launch. |
| secretKeyId/secretVersion | Included | Fields present for future KMS migration. Could be removed for v1 if schema simplicity preferred. |
| last_seen_success_at vs run-level flag | Included | Per-product timestamps chosen over run-level flag for better partial failure handling. |
| SourceProduct Archival | Deferred | Identity upgrades and URL rotations create orphaned SourceProducts that "expire naturally" but rows remain forever. Post-v1: add archival job to delete SourceProducts where: (1) `lastSeenSuccessAt IS NULL` or stale > N days, (2) no Price records, (3) created > M days ago. Prevents unbounded table growth from URL_HASH fallbacks. |

---

**Document Version:** 1.1
**Last Updated:** 2025-12-27
**Status:** Ready for Implementation - All critical issues resolved
