# ADR-015: Price History Immutability, Corrections, and Operational Control

## Status
Accepted — Required for v1

## Purpose
Ensure IronScout can safely ingest incorrect data, correct it post hoc, preserve auditability, and protect user trust across consumer and merchant experiences.

This ADR supersedes any prior assumptions that append-only storage alone is sufficient.

---

## Core Invariants

1. Price facts are immutable.
2. Corrections are explicit, auditable overlays.
3. Ignored data is never user-visible.
4. Current price must be deterministic under corrections.
5. Operational control must be fast, safe, and tool-supported.

---

## Domain Model Clarification

### Merchant vs Retailer

- **Merchant**: B2B portal account and benchmarked entity. Subscription customer. Manages data and users.
- **Retailer**: Consumer-facing storefront whose prices appear in search results.

Relationship:
Merchant (1) → Retailer (many)

They are not interchangeable.

---

## Fact vs Dimension Data

### Immutable Facts
- `prices`
- `pricing_snapshots`

These are append-only. No UPDATE or DELETE.

### Mutable Dimensions
- `products`
- `retailers`
- `merchants`
- `source_products`

Upserts are allowed and expected.

---

## Canonical Timestamps

All correction semantics use:

- `observedAt`: when the price was observed at the source.

`createdAt` must never be used for correction matching.

---

## Ingestion Provenance (Required)

Both `prices` and `pricing_snapshots` MUST include:

- `ingestionRunType ENUM { AFFILIATE | MERCHANT | SCRAPER | MANUAL }`
- `ingestionRunId STRING`
- `merchantId`
- `sourceId` (for prices; provenance of the observation)
- `affiliateId` (if applicable)
- `retailerId` (if applicable)

All new rows must include provenance.
Historical backfill is best-effort and documented.

### Schema State (v1)

Currently these columns are **nullable** to support backfill of historical data:
- `ingestionRunType IngestionRunType?`
- `ingestionRunId String?`

### Enforcement Strategy

1. **Application-level**: All write paths MUST set provenance fields
2. **Monitoring**: Data integrity checks flag recent writes (24h) with NULL provenance
3. **Future migration**: After backfill is complete and no NULL values exist in recent data:
   - Run: `UPDATE prices SET "ingestionRunType" = 'SCRAPER', "ingestionRunId" = 'backfill-legacy' WHERE "ingestionRunType" IS NULL`
   - Run: `UPDATE pricing_snapshots SET "ingestionRunType" = 'MANUAL', "ingestionRunId" = 'backfill-legacy' WHERE "ingestionRunType" IS NULL`
   - Alter columns to NOT NULL

### Validation Query

Check for provenance gaps in recent data:
```sql
-- Prices missing provenance (last 7 days)
SELECT COUNT(*) FROM prices
WHERE "createdAt" > NOW() - INTERVAL '7 days'
  AND ("ingestionRunType" IS NULL OR "ingestionRunId" IS NULL);

-- Snapshots missing provenance (last 7 days)
SELECT COUNT(*) FROM pricing_snapshots
WHERE "createdAt" > NOW() - INTERVAL '7 days'
  AND ("ingestionRunType" IS NULL OR "ingestionRunId" IS NULL);
```

Expected result: 0 for both queries before NOT NULL migration.

### Application-Level Helpers (`@ironscout/db`)

Use these helpers to enforce provenance at the application level:

```typescript
import {
  createProvenance,
  assertProvenanceValid,
  validateProvenance,
  type ProvenanceData,
  type IngestionRunType
} from '@ironscout/db'

// Option 1: Create provenance object (recommended)
// Validates and returns a typed provenance object
const provenance = createProvenance('SCRAPE', executionId)
// provenance = { ingestionRunType: 'SCRAPE', ingestionRunId: '...', observedAt: Date }

await prisma.prices.create({
  data: { ...priceData, ...provenance }
})

// Option 2: Assert before insert (throws on invalid)
const data = { ingestionRunType: 'MANUAL', ingestionRunId: runId, observedAt: new Date() }
assertProvenanceValid(data)
await prisma.pricing_snapshots.create({ data: { ...snapshotData, ...data } })

// Option 3: Validate and check result
const result = validateProvenance(data)
if (!result.valid) {
  log.error('Invalid provenance', { errors: result.errors })
  return
}
```

**Usage Rules**:
- All new write paths for `prices` and `pricing_snapshots` MUST use these helpers
- Never rely on DB defaults for `observedAt` in new code—set it explicitly
- Valid `ingestionRunType` values: `SCRAPE`, `AFFILIATE_FEED`, `RETAILER_FEED`, `MANUAL`

**Current Write Paths**:
| Path | Type | Status |
|------|------|--------|
| `writer/index.ts` (scraper) | SCRAPE | ✅ Sets all fields explicitly |
| `affiliate/processor.ts` | AFFILIATE_FEED | ✅ Sets all fields explicitly |
| `merchant/benchmark.ts` | MANUAL | ✅ Uses `createProvenance()` |

---

## Run Ignore Semantics

Each run table must include:

- `ignoredAt TIMESTAMPTZ NULL`
- `ignoredBy STRING NULL`
- `ignoredReason TEXT NULL`

A run is ignored if `ignoredAt IS NOT NULL`.

Ignored runs:
- Are excluded from all user-visible reads
- Trigger recompute jobs
- Trigger alert suppression

---

## Corrections

### Schema: price_corrections

- `id UUID`
- `scope_type ENUM { PRODUCT | RETAILER | MERCHANT | SOURCE | AFFILIATE | FEED_RUN }`
- `scope_id STRING`
- `start_ts TIMESTAMPTZ`
- `end_ts TIMESTAMPTZ`
- `action ENUM { IGNORE | MULTIPLIER }`
- `value NUMERIC NULL`
- `reason TEXT`
- `created_at TIMESTAMPTZ`
- `created_by STRING`
- `revoked_at TIMESTAMPTZ NULL`
- `revoked_by STRING NULL`
- `revoke_reason TEXT NULL`

Active if `revoked_at IS NULL`.
Deletes are forbidden.

---

## Matching Semantics

### Time Window
A correction applies if:
`observedAt ∈ [start_ts, end_ts)`

### Scope Matching
- PRODUCT → productId
- RETAILER → retailerId
- MERCHANT → merchantId
- SOURCE → sourceId (preferred) or sourceProductId (stable source key)
- AFFILIATE → affiliateId
- FEED_RUN → (ingestionRunType, ingestionRunId)

### Precedence
IGNORE always wins.

---

## MULTIPLIER Semantics (v1)

- MULTIPLIER corrections stack multiplicatively.
- `visible_price = raw_price * Π(multipliers)`
- Max 2 multipliers per event.
- More than 2 → event becomes not visible.
- Overlapping multipliers at same scope are disallowed by default.

---

## Current Price Semantics

Definitions:
- Visible event: not ignored and not excluded by IGNORE correction.
- Lookback window: `CURRENT_PRICE_LOOKBACK` (config, e.g. 7 days).

Rule:
Current price = most recent visible price event within lookback window.

If none exist:
- `current_price = NULL`
- UI must show unavailable / stale state.

---

## Alerts

### Evaluation
- Alerts evaluate only visible prices.
- Ignored data must never trigger alerts.

### Retroactive Suppression (Required)
Alert records must include:
- `suppressedAt`
- `suppressedBy`
- `suppressedReason`

Triggers:
- Run ignored
- IGNORE correction created or activated

Suppressed alerts:
- Hidden in UI by default
- Never re-fired

External notifications are not retracted in v1.

---

## Performance Strategy

### Hot Paths
- Search
- Dashboard
- Alerts
- Benchmarks

Must read from derived tables.

### Cold Paths
- Admin
- Debug
- Audit

May evaluate corrections at read time.

---

## Derived Data & Recompute

### Required Jobs
- BENCHMARK_RECOMPUTE
- CURRENT_PRICE_RECOMPUTE
- ALERT_SUPPRESSION

### Triggered By
- Correction create / revoke
- Run ignore / unignore

All recomputes are async.

---

## Operational Tooling (v1 Required)

Admin UI or CLI must support:

1. Ignore / unignore run (one action)
2. Create correction with validation and preview
3. Revoke correction
4. Bulk alert suppression
5. View audit history

Direct DB writes are not an approved workflow.

---

## Auditability

All operational actions must record:
- who
- when
- why
- what scope was affected

Corrections overlay facts; they must not mutate retailer eligibility or listing state. Eligibility/listing are enforced separately at read time.
- Provenance (including `prices.sourceId`) is required for correction scope mapping; visibility predicates (eligibility + listing + active relationship) remain separate from subscription state.

--- 

## Non-Goals (v1)

- User-facing correction history
- Alert retraction (email/push)
- Priority-based correction ordering
- Exception semantics (ALLOW)

---

## Final Note

This ADR defines the minimum architecture required to preserve trust.
Anything less will fail operationally.
