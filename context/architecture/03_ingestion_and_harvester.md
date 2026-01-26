# Ingestion and Harvester

This document describes how data ingestion works in IronScout as implemented today, with explicit callouts where behavior, documentation, or scale assumptions require decisions or code changes.

This document is intentionally operational and conservative. It describes **what the harvester actually does**, not what it could do in the future.

## Terminology (Canonical)

- **Merchant**: B2B portal account (subscription, billing, auth boundary).
- **Retailer**: Consumer-facing storefront shown in search results. Consumer `prices` are keyed by `retailerId`. Retailers do not authenticate.
- **Source/Feed**: Technical origin of a consumer price record (affiliate, scraper, direct feed). Source is not Merchant.
- **Admin rights**: Merchant users are explicitly granted permissions per Retailer.
- **Legacy**: Any “dealer” wording or `DEALER_*` keys are legacy and must be migrated to “merchant” terminology.

---

## Purpose of the Harvester

The harvester exists to:
- Ingest pricing and availability data from external sources
- Normalize inconsistent inputs into a canonical schema
- Preserve historical price data
- Feed search, alerts, and Retailer visibility with predictable inputs

The harvester is designed for **correctness, traceability, and idempotency**, not real-time guarantees.

---

## Harvester Architecture (Current)

### Process Model

- Harvester is a long-running Node.js worker (`apps/harvester`)
- Uses **BullMQ + Redis** for job orchestration
- Writes directly to Postgres via Prisma
- Runs multiple pipelines in the same worker process:
  - Affiliate ingestion (v1)
  - Retailer crawl/feed ingestion
  - Merchant-portal feed ingestion and benchmarks/insights (legacy dealer naming)

This architecture favors simplicity over isolation in v1.

---

## Ingestion Pipelines

This pipeline processes affiliate ingestion to produce Retailer-keyed consumer prices (`prices.retailerId`).
All consumer price outputs are keyed by `retailerId` (affiliate feeds only in v1).

### 1) Affiliate Ingestion (v1)

This pipeline ingests affiliate sources.

**High-level stages:**
1. Schedule crawl
2. Fetch remote data (HTML, JSON, CSV, XML)
3. Extract offers
4. Normalize ammo attributes
5. Write prices and availability
6. Trigger alerts

**Key components (observed):**
- `scheduler/*`
- `fetcher/*`
- `extractor/*`
- `normalizer/*`
- `writer/*`
- `alerter/*`

**Invariants:**
- Ingestion must be idempotent
- Unchanged content should not produce new writes
- Failures must not corrupt historical data

#### Affiliate Ingestion Path

Affiliate feeds (Impact, AvantLink, ShareASale, etc.) follow a specific data flow:

**Data Flow:**
```
Source (config) → Fetch → ParsedProduct (ephemeral) → Normalize → Price (persistent)
```

**Key Constraints:**

1. **ParsedProduct is network-agnostic and ephemeral**
   - Common interface across all affiliate networks
   - Lives only in memory during pipeline execution
   - Never persisted directly

2. **Source scopes affiliate configuration**
   - `affiliateNetwork`, `affiliateProgramId`, `affiliateAdvertiserId`, `affiliateCampaignId`
   - `affiliateTrackingTemplate` for click-time URL generation
   - One Source = one feed = one affiliate config

3. **Price is append-only and promo-aware**
   - Canonical product URL stored (no tracking params)
   - Optional sale metadata: `originalPrice`, `priceType`, `saleStartsAt`, `saleEndsAt`
   - Sale windows are informational only, never enforced

4. **No lifecycle state for affiliate products**
   - Use `Source.lastRunAt` and `Price.createdAt` for presence
   - No `productStatus`, `lastSeenAt`, or `missingCount` on affiliate path
   - Add `SourceProduct` table later if per-product lifecycle needed

**Reference:** See `context/reference/market/affiliate-feed-analysis.md` for full decision log.

---

### 2) Retailer Portal Feed Ingestion (legacy dealer naming)

Retailer feeds are ingested through a separate pipeline (legacy dealer-* naming).

**High-level stages:**
1. Retailer feed scheduling
2. Fetch and parse feed
3. Validate feed health
4. Normalize SKUs
5. Match SKUs to canonical products
6. Write Retailer price data
7. Generate benchmarks and insights (pricing_snapshots) if eligible

**Key components:**
- `merchant/feed-ingest.ts`
- `merchant/sku-match.ts`
- `merchant/benchmark.ts`
- `merchant/insight.ts`
- `merchant/scheduler.ts`

---

## Scheduling Model (Critical)

### Current State

- Affiliate feed scheduling uses a DB-locked claim loop (`FOR UPDATE SKIP LOCKED`) and is safe to run with multiple workers.
- Retailer and Merchant schedulers use in-process `setInterval` patterns.

### Implication

If more than one harvester instance is running:
- Schedulers will run **once per instance**
- Duplicate executions and writes are possible

This is a **hard scaling constraint**.

---

### Decision Required: Scheduler Ownership

Affiliate scheduling is lock-protected. For retailer/merchant schedulers, one of the following must be explicitly chosen and documented:

1. **Singleton Scheduler (Recommended for v1)**
   - Only one harvester instance runs schedulers
   - Additional instances run workers only
   - Simple and low-risk

2. **Distributed Locking**
   - Scheduler ticks acquire a Redis lock
   - Only one instance schedules per interval
   - More complex but scalable

3. **Queue-Native Scheduling**
   - Replace intervals with BullMQ repeatable jobs
   - Most robust, highest complexity

**If no decision is made, assume a singleton scheduler.**

---

## Idempotency and Deduplication

### Expectations

- Re-running a job must not duplicate data
- Duplicate scheduling must not corrupt state
- Writes must be safe under retries

### Current Observations

- Content hashing is used in some fetch paths
- Writer behavior appears row-by-row in some cases

### Required Invariants

- Use deterministic job IDs where possible
- Batch writes to reduce amplification
- Prefer “skip if unchanged” over overwrite

**If idempotency cannot be guaranteed, ingestion must fail closed.**

---

## Write Strategy and History

### Price History

- Price records form a time series
- History must not be overwritten silently
- “Current price” is derived, not stored as a single mutable field

### Retailer Inventory (administered by Merchants)


- Retailer SKUs anchor Retailer offers
- SKU-to-product mapping must be stable
- Failed mappings must be visible to ops

### Decision Required

- Confirm that writes are append-only for price history
- Ensure batch operations are used instead of per-row writes

---

## Retailer Eligibility and SKIPPED Executions

### Required Behavior

- Affiliate feeds must respect Retailer eligibility and feed health
- If a Retailer is ineligible or a feed is quarantined:
  - Execution is marked SKIPPED
  - No downstream jobs run
  - No downstream alerts or write-side effects are generated

### Trust Requirement

A SKIPPED execution must be a **hard stop**, not a soft warning.

If downstream effects occur after SKIPPED, it is a correctness bug.

---

## Failure Modes and Quarantine

### Expected Failure Types

- Feed unreachable
- Invalid format
- Partial data
- Mapping failures
- Sudden data spikes

### Required Controls

- Ability to disable or quarantine a feed
- Ability to stop propagation without redeploying
- Visibility into last successful execution

Quarantine must isolate the feed without affecting unrelated sources.

---

## Observability and Debugging

### Required Signals

- Execution status and timestamps
- Counts of items processed, written, skipped
- Error summaries
- Ability to replay a failed execution safely

Logs and execution records are operational tools, not user-facing features.

---

## Performance and Scaling Constraints

### v1 Assumptions

- Data is eventually consistent
- Ingestion is not real-time
- Throughput is bounded by:
  - database write capacity
  - normalization complexity
  - scheduler behavior

### Explicitly Out of Scope (v1)

- Real-time ingestion guarantees
- Auto-scaling schedulers
- Multi-region ingestion

---

## Known Inconsistencies and Required Decisions

These must be resolved or explicitly accepted before scaling:

1. **Scheduler duplication risk**
   - Decision: singleton vs lock vs repeatable jobs

2. **Batching and write amplification**
   - Decision: enforce batching and reduce per-item writes

3. **SKIPPED execution enforcement**
   - Decision: audit downstream job creation paths

4. **Embedding generation ownership**
   - Decision: API vs harvester (documented in `02_search_and_ai.md`)

---

## Non-Negotiables

- Ingestion must fail safely
- Bad data must not propagate silently
- Retailer eligibility must be enforced before visibility
- Historical data must not be destroyed to "fix" bugs

---

## Guiding Principle

> Ingestion exists to preserve trust in the data, not to maximize throughput.
