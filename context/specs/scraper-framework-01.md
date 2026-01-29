# Spec: Scraper Framework v0.3

**Status:** Draft (Decisions Resolved, Feedback Incorporated)
**Owner:** Engineering (Harvester)
**Created:** 2026-01-29
**Updated:** 2026-01-29
**Depends on:** ADR-015 (Price Corrections), ADR-019 (Product Resolver)
**Blocks:** Scraper development

---

## 1. Goal

Build a surgical, URL-driven price monitoring framework that:
- Scrapes specific product URLs (not site-wide crawling)
- Enables rapid onboarding of new retailer targets via thin adapters
- Follows the unified ingestion pattern (source_products → resolver → products)
- Preserves all trust invariants (append-only, fail-closed, server-side enforcement)
- Remains invisible to consumers until explicitly enabled per ADR scope rules

---

## 2. Non-Goals (v1)

- No site-wide crawling or product discovery
- No consumer visibility for scraped prices
- No real-time guarantees or SLAs
- No proxy rotation or anti-bot evasion (defer to later phases)
- No distributed crawling across multiple nodes
- No AI-based extraction (deterministic selectors only)
- No JS rendering (defer until a target requires it)

---

## 3. Architecture Overview

### 3.1 Surgical Scraping Model

Unlike traditional crawlers that discover URLs via pagination, this framework scrapes **specific URLs stored in the database**. URLs come from:
- Admin portal input
- CSV/bulk import
- Affiliate feed URLs (refresh prices for known products)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         URL DATABASE                                         │
│                                                                              │
│  scrape_targets table:                                                       │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ url │ sourceId │ adapterId │ schedule │ enabled │ lastScrapedAt │... │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│     Sources:             │                                                   │
│     • Admin portal       │                                                   │
│     • CSV import         │                                                   │
│     • Affiliate feed URLs│                                                   │
└──────────────────────────┼───────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SCRAPER FRAMEWORK                                     │
│                                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐   │
│  │  Scheduler  │───▶│   Fetcher   │───▶│   Adapter   │───▶│  Validator  │   │
│  │  (BullMQ)   │    │ (pluggable) │    │ (per-site)  │    │(fail-closed)│   │
│  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘   │
│         │                 │                                      │          │
│         │          ┌──────┴──────┐                               │          │
│         │          │   Policies  │                    ┌──────────┴────────┐ │
│         │          │ • robots.txt│                    │                   │ │
│         │          │ • rate limit│                    ▼         ▼        ▼ │ │
│         │          │ • allowlist │               ┌───────┐ ┌──────┐ ┌─────────┐
│         │          └─────────────┘               │ VALID │ │ DROP │ │QUARANTINE│
│         │                                        └───┬───┘ └──────┘ └─────────┘
│         │                                            │                       │
└─────────┼────────────────────────────────────────────┼───────────────────────┘
          │                                            │
          │                                            ▼
          │         ┌─────────────────────────────────────────────────────────┐
          │         │                UNIFIED INGESTION PATTERN                 │
          │         │                                                          │
          │         │  source_products ──▶ source_product_identifiers ──▶     │
          │         │       ↓                    resolver                      │
          │         │    prices (with ingestionRunType='SCRAPE')              │
          │         └─────────────────────────────────────────────────────────┘
          │                                            │
          ▼                                            ▼
    scrape_runs                                   products
   (audit trail)                                 (canonical)
```

### 3.2 Key Differences from Site Crawling

| Aspect | Site Crawling | Surgical Scraping (This Spec) |
|--------|---------------|-------------------------------|
| URL source | Adapter discovers via pagination | Database (`scrape_targets`) |
| Volume | Thousands of pages | Tens to hundreds of URLs |
| Discovery | Finds new products | Only monitors known products |
| Adapter complexity | High (pagination, dedup) | Low (single page extraction) |
| Risk profile | Higher ToS exposure | Lower, more controlled |

---

## 4. Resolved Decisions

| # | Decision | Resolution |
|---|----------|------------|
| 1 | URL/Allowlist Storage | Database table (`scrape_targets`) |
| 2 | First Retailer | SGAmmo |
| 3 | Rate Limit Default | Conservative: 0.5 req/sec |
| 4 | Drift Thresholds | 50% failure, 2 consecutive batches, min 20 URLs |
| 5 | Crawling Library | fetch + cheerio, pluggable fetcher interface |
| 6 | JS Rendering | Defer until needed |
| 7 | Backpressure | Block/reject with retry-after + 24h max-age |
| 8 | Price Format | Cents (integer) internally, Decimal(10,2) on write |

---

## 5. Core Types

### 5.1 ScrapedOffer (Output Contract)

```typescript
/**
 * Currency codes supported by the scraper framework.
 * USD only for v1; extend as needed.
 */
export type CurrencyCode = 'USD'

/**
 * Stock availability signals.
 * Adapters must derive from explicit page signals, never guess.
 *
 * IMPORTANT: UNKNOWN triggers a drop (fail-closed). If availability
 * cannot be determined from the page, the offer is not written.
 */
export type Availability =
  | 'IN_STOCK'
  | 'OUT_OF_STOCK'
  | 'BACKORDER'
  | 'UNKNOWN'  // Fail-closed: drops offer, does not write to DB

/**
 * Reasons for extraction failure.
 * Used when extract() cannot produce an offer.
 */
export type ExtractFailureReason =
  | 'SELECTOR_NOT_FOUND'      // Expected element missing from DOM
  | 'PRICE_NOT_FOUND'         // Price element missing
  | 'TITLE_NOT_FOUND'         // Title element missing
  | 'PAGE_STRUCTURE_CHANGED'  // DOM structure doesn't match expected
  | 'BLOCKED_PAGE'            // Captcha, access denied, etc.
  | 'EMPTY_PAGE'              // Page returned but has no content
  | 'OOS_NO_PRICE'            // Out of stock page with no price displayed (expected)

/**
 * Extraction result - explicit success or failure with reason.
 * Replaces returning null (which was a silent drop violating fail-closed).
 */
export type ExtractResult =
  | { ok: true; offer: ScrapedOffer }
  | { ok: false; reason: ExtractFailureReason; details?: string }

/**
 * Validation outcome from adapter normalize step.
 */
export type NormalizeResult =
  | { status: 'ok'; offer: ScrapedOffer }
  | { status: 'drop'; reason: DropReason; offer: ScrapedOffer }
  | { status: 'quarantine'; reason: QuarantineReason; offer: ScrapedOffer }

/**
 * Reasons for dropping an offer (not written to DB).
 */
export type DropReason =
  | 'MISSING_REQUIRED_FIELD'
  | 'INVALID_PRICE'
  | 'INVALID_URL'
  | 'DUPLICATE_WITHIN_RUN'
  | 'BLOCKED_BY_ROBOTS_TXT'
  | 'OOS_NO_PRICE'           // Out of stock with no price - expected, don't count toward drift
  | 'UNKNOWN_AVAILABILITY'   // Fail-closed: availability indeterminate, don't store ambiguous data

/**
 * Reasons for quarantining an offer (written to quarantine table).
 */
export type QuarantineReason =
  | 'VALIDATION_FAILED'
  | 'DRIFT_DETECTED'
  | 'SELECTOR_FAILURE'
  | 'NORMALIZATION_FAILED'
  | 'ZERO_PRICE_EXTRACTED'
  | 'AMBIGUOUS_PRICE'

/**
 * The canonical output of a scraper adapter.
 *
 * IMPORTANT: All prices are in CENTS (integer) to avoid floating point issues.
 * Convert to Decimal(10,2) when writing to prices table.
 */
export interface ScrapedOffer {
  // ═══════════════════════════════════════════════════════════════════════
  // Required Fields (fail-closed if missing)
  // ═══════════════════════════════════════════════════════════════════════

  /** Source ID from sources table */
  sourceId: string

  /** Retailer ID from retailers table */
  retailerId: string

  /** Canonical URL (normalized, no tracking params) */
  url: string

  /** Product title as displayed on page */
  title: string

  /**
   * Single-unit price in CENTS (e.g., 1999 = $19.99)
   *
   * Price semantics (canonical rule):
   * 1. Capture current selling price (not crossed-out list price)
   * 2. If tiered pricing, prefer qty=1 tier (see Appendix C for details)
   * 3. If multiple prices visible and ambiguous, quarantine with AMBIGUOUS_PRICE
   * 4. If out-of-stock and price hidden, return ExtractResult with OOS_NO_PRICE reason
   */
  priceCents: number

  /** Currency code (USD only for v1) */
  currency: CurrencyCode

  /** Stock availability */
  availability: Availability

  /** When this offer was observed (set by adapter, not server) */
  observedAt: Date

  // ═══════════════════════════════════════════════════════════════════════
  // Identity Fields (for source-scoped deduplication)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Source-scoped identity key.
   * Format: {idType}:{idValue}
   * Priority: retailerProductId > retailerSku > urlHash
   */
  identityKey: string

  /** Retailer's SKU if available */
  retailerSku?: string

  /** Retailer's product ID if available */
  retailerProductId?: string

  // ═══════════════════════════════════════════════════════════════════════
  // Product Identity Fields (for resolver matching)
  // ═══════════════════════════════════════════════════════════════════════

  /** UPC/GTIN if present (written to source_product_identifiers) */
  upc?: string

  /** Brand name as displayed */
  brand?: string

  /** Caliber as displayed (e.g., "9mm Luger", "5.56 NATO") */
  caliber?: string

  /** Grain weight if applicable */
  grainWeight?: number

  /** Round count / pack size */
  roundCount?: number

  /** Case material (brass, steel, aluminum) */
  caseMaterial?: string

  /** Bullet type (FMJ, HP, etc.) */
  bulletType?: string

  /** Shotgun load type (shot size or slug weight) */
  loadType?: string

  /** Shotgun shell length */
  shellLength?: string

  // ═══════════════════════════════════════════════════════════════════════
  // Pricing Metadata (optional, all in CENTS)
  // ═══════════════════════════════════════════════════════════════════════

  /** Cost per round in CENTS (derived if roundCount known) */
  costPerRoundCents?: number

  /** Shipping cost in CENTS if displayed */
  shippingCents?: number | null

  /** Whether tax is included in price */
  taxIncluded?: boolean

  // ═══════════════════════════════════════════════════════════════════════
  // Metadata
  // ═══════════════════════════════════════════════════════════════════════

  /** Image URL */
  imageUrl?: string

  /** Adapter version that produced this offer */
  adapterVersion: string
}
```

### 5.2 Fetcher Interface (Pluggable)

```typescript
/**
 * Fetcher interface - allows swapping HTTP for Playwright later.
 * Adapter receives HTML regardless of how it was fetched.
 */
export interface Fetcher {
  /**
   * Fetch a URL and return the HTML content.
   */
  fetch(url: string, options: FetchOptions): Promise<FetchResult>
}

export interface FetchOptions {
  /** Request timeout in ms (default: 30000) */
  timeoutMs?: number

  /** Maximum response size in bytes (default: 10MB) */
  maxSizeBytes?: number

  /** Custom headers */
  headers?: Record<string, string>
}

export interface FetchResult {
  status: 'ok' | 'error' | 'blocked' | 'timeout' | 'too_large' | 'robots_blocked'
  statusCode?: number
  html?: string
  contentHash?: string
  error?: string
  durationMs: number
}

/**
 * HTTP-based fetcher using native fetch + cheerio.
 * Default implementation for v1.
 */
export class HttpFetcher implements Fetcher { ... }

/**
 * Playwright-based fetcher for JS-rendered pages.
 * Deferred - implement when needed.
 */
export class PlaywrightFetcher implements Fetcher { ... }
```

### 5.3 ScrapeAdapter Interface

```typescript
/**
 * Context provided to adapter methods.
 */
export interface ScrapeAdapterContext {
  sourceId: string
  retailerId: string
  runId: string
  targetId: string  // scrape_targets.id
  now: Date
  logger: Logger
}

/**
 * Adapter interface for surgical scraping.
 * Each retailer implements this.
 *
 * Note: No getSeedUrls() or getNextPages() - URLs come from database.
 */
export interface ScrapeAdapter {
  /** Unique adapter identifier (e.g., 'sgammo') */
  readonly id: string

  /** Semver version (increment on extraction logic changes) */
  readonly version: string

  /** Domain this adapter handles (for rate limiting) */
  readonly domain: string

  /** Whether this adapter requires JS rendering */
  readonly requiresJsRendering: boolean

  /**
   * Extract offer from a single product page.
   * Returns explicit success/failure - never silent drops.
   *
   * Must be deterministic given the same HTML input.
   *
   * IMPORTANT: Return { ok: false, reason: 'OOS_NO_PRICE' } when:
   * - Page indicates out-of-stock AND price is not displayed
   * This is expected behavior, not a drift signal.
   */
  extract(html: string, url: string, ctx: ScrapeAdapterContext): ExtractResult

  /**
   * Normalize and validate the extracted offer.
   * Must return explicit status (ok/drop/quarantine).
   */
  normalize(offer: ScrapedOffer, ctx: ScrapeAdapterContext): NormalizeResult
}
```

### 5.4 Adapter Registry

```typescript
/**
 * Registry for scrape adapters.
 * Adapters must be explicitly registered; no auto-discovery.
 */
export interface AdapterRegistry {
  /** Register an adapter */
  register(adapter: ScrapeAdapter): void

  /** Get adapter by ID */
  get(adapterId: string): ScrapeAdapter | undefined

  /** List all registered adapter IDs */
  list(): string[]

  /** Check if adapter exists for domain */
  hasAdapterForDomain(domain: string): boolean
}
```

---

## 6. Fetch Layer

### 6.1 HTTP Client (Default Fetcher)

```typescript
export interface RetryPolicy {
  maxAttempts: number        // Default: 3
  initialDelayMs: number     // Default: 1000
  maxDelayMs: number         // Default: 30000
  backoffMultiplier: number  // Default: 2
  retryableStatusCodes: number[]  // Default: [429, 500, 502, 503, 504]
}

export const DEFAULT_FETCH_OPTIONS: FetchOptions = {
  timeoutMs: 30000,
  maxSizeBytes: 10 * 1024 * 1024,  // 10 MB
}
```

### 6.2 Rate Limiter

```typescript
/**
 * Rate limiter interface.
 *
 * IMPORTANT: Implementation MUST be Redis-backed for coordination across workers.
 * Per-process rate limiting will exceed budgets when workers scale.
 *
 * DOMAIN DEFINITION: Rate limits apply to the registrable domain (eTLD+1),
 * not the full hostname. For example:
 * - sgammo.com, www.sgammo.com, cdn.sgammo.com all share one limit
 * - This prevents subdomains/CDNs from multiplying allowed traffic
 *
 * Per-host exceptions can be configured if a site genuinely serves different
 * content from subdomains (rare for e-commerce).
 */
export interface RateLimiter {
  /**
   * Acquire permission to make a request to the given registrable domain (eTLD+1).
   * Blocks until rate limit allows.
   *
   * MUST use shared state (Redis) to coordinate across all workers.
   */
  acquire(domain: string): Promise<void>

  /**
   * Get current config for domain.
   */
  getConfig(domain: string): RateLimitConfig
}

export interface RateLimitConfig {
  /** Requests per second (default: 0.5) */
  requestsPerSecond: number

  /** Minimum delay between requests in ms (default: 2000) */
  minDelayMs: number

  /** Maximum concurrent requests (default: 1) */
  maxConcurrent: number
}

/**
 * Default rate limit config - CONSERVATIVE
 * Start slow, increase per-retailer after proving stability.
 */
export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  requestsPerSecond: 0.5,
  minDelayMs: 2000,
  maxConcurrent: 1,
}

/**
 * Redis-backed rate limiter implementation.
 * Uses sliding window algorithm with global coordination.
 */
export class RedisRateLimiter implements RateLimiter {
  constructor(private redis: Redis) {}
  // ...
}
```

### 6.3 Robots.txt Policy

```typescript
export interface RobotsPolicy {
  /**
   * Check if URL is allowed by robots.txt.
   * Returns false if disallowed OR unavailable (fail-closed).
   */
  isAllowed(url: string): Promise<boolean>

  /**
   * Get crawl delay from robots.txt.
   */
  getCrawlDelay(domain: string): Promise<number | null>
}
```

**Policy rules:**
1. Obey all Disallow rules for `User-agent: *` and `User-agent: IronScout`
2. Honor Crawl-delay (min 1s, max 60s, default 2s if not specified)
3. If robots.txt unavailable after 3 retries: **fail closed** (block domain)
4. Cache robots.txt for 24 hours
5. If robots.txt changes to Disallow: **stop on next refresh** (up to 24h delay is acceptable)

**Note on consistency:** The 24h cache and "stop on change" are reconciled as follows: we cannot detect changes until we refresh the cache. When the cache expires and we fetch a new robots.txt that disallows our paths, we stop immediately. The maximum delay between a site adding a Disallow and us stopping is 24 hours.

---

## 7. Drift Detection (Detailed)

### 7.1 Metrics Tracked Per Run

```typescript
export interface ScrapeRunMetrics {
  urlsAttempted: number
  urlsSucceeded: number
  urlsFailed: number
  offersExtracted: number
  offersValid: number
  offersDropped: number
  offersQuarantined: number
  zeroPriceCount: number
  oosNoPriceCount: number  // Expected OOS with no price - don't count toward drift
}

export interface DerivedMetrics {
  /** urlsFailed / urlsAttempted */
  failureRate: number

  /** offersDropped / offersExtracted */
  dropRate: number

  /** offersValid / urlsAttempted */
  yieldRate: number
}
```

### 7.2 Drift Thresholds and Actions

#### Adapter-Level Drift (Extraction Broken)

| Condition | Action |
|-----------|--------|
| Failure rate > 50% in 1 batch (≥20 URLs) | **Alert** to #ingestion-ops |
| Failure rate > 50% in 2 consecutive batches (≥20 URLs each) | **Auto-disable adapter** + alert |
| Zero offers extracted in 2 consecutive runs (≥20 URLs each) | **Auto-disable adapter** + alert |

**Recovery:** Manual re-enable after fix. Adapter stays disabled until:
1. Fix deployed
2. Ops manually re-enables via admin portal
3. First run after re-enable is monitored closely

#### URL-Level Drift (Single URL Broken)

| Condition | Action |
|-----------|--------|
| URL fails 5 consecutive times | Mark URL as `status=BROKEN` |
| URL marked BROKEN | Stop scraping, add to weekly recheck queue |
| Weekly recheck succeeds | Mark URL as `status=ACTIVE`, resume scraping |
| Weekly recheck fails | Keep BROKEN, check again next week |

#### Zero Price Detection

| Condition | Action |
|-----------|--------|
| Single zero-price in small batch (<20 URLs) | **Quarantine** that offer + alert |
| Zero-price in 2 consecutive runs (≥20 URLs) | **Auto-disable adapter** + alert |

#### OOS No Price Handling

| Condition | Action |
|-----------|--------|
| `availability=OUT_OF_STOCK` AND price missing | **Drop** with `OOS_NO_PRICE` reason |
| `OOS_NO_PRICE` drops | Do **NOT** count toward drift metrics |

**Rationale:** Many out-of-stock pages legitimately hide the price. This is expected behavior, not extraction drift. Track separately in `oosNoPriceCount` for visibility but exclude from failure rate calculations.

#### UNKNOWN Availability Handling (Fail-Closed)

| Condition | Action |
|-----------|--------|
| `availability=UNKNOWN` | **Drop** with `UNKNOWN_AVAILABILITY` reason |
| `UNKNOWN_AVAILABILITY` drops | **DO** count toward drift metrics |

**Rationale:** If the adapter cannot determine availability from the page, the data is ambiguous. Per fail-closed principle, we don't store ambiguous data. Unlike OOS_NO_PRICE (which is expected behavior), UNKNOWN indicates the adapter may need selector fixes, so it counts toward drift.

### 7.3 Baseline Calculation

```typescript
/**
 * Drift baseline for an adapter.
 * Calculated from rolling window of successful runs.
 */
export interface DriftBaseline {
  /** 7-day rolling median failure rate */
  medianFailureRate: number

  /** 7-day rolling median yield rate */
  medianYieldRate: number

  /** Number of runs in baseline (min 3 required) */
  sampleSize: number

  /** Whether baseline is established */
  isEstablished: boolean
}
```

**Rules:**
- Minimum 3 successful runs before baseline is established
- Use 7-day rolling window
- Exclude runs with <20 URLs from baseline calculation
- Until baseline established: use absolute thresholds only

---

## 8. Backpressure and Queue Management

### 8.1 Queue Capacity

```typescript
export interface QueueConfig {
  /** Maximum pending URLs per adapter (default: 1000) */
  maxPendingPerAdapter: number

  /** Maximum total pending URLs (default: 10000) */
  maxPendingTotal: number

  /** Maximum age for pending URL before cleanup (default: 24h) */
  maxAgeMs: number
}

export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  maxPendingPerAdapter: 1000,
  maxPendingTotal: 10000,
  maxAgeMs: 24 * 60 * 60 * 1000,  // 24 hours
}
```

### 8.2 Overflow Handling (Block/Reject)

When queue capacity is reached:

```typescript
export interface EnqueueResult {
  status: 'accepted' | 'rejected'

  /** If rejected, when to retry */
  retryAfterMs?: number

  /** Reason for rejection */
  reason?: 'queue_full' | 'adapter_disabled' | 'rate_limited'
}
```

**Behavior:**
1. New URLs are **rejected** (not silently dropped)
2. Caller receives `retryAfterMs` hint
3. Alert if rejection rate exceeds threshold

**Scheduler Backoff (Avoid Retry Loops):**
When the scheduler attempts to enqueue URLs and receives rejections:
1. If >50% of URLs rejected in a scheduling cycle: pause scheduling for `retryAfterMs` (from rejection)
2. If consecutive scheduling cycles rejected: exponential backoff (2x, max 1 hour)
3. Track `schedulerBackoffUntil` timestamp; skip scheduling until then
4. Alert if backoff exceeds 30 minutes (indicates persistent capacity issue)

### 8.3 Stale URL Cleanup

Background job runs hourly:
1. Find URLs pending > 24 hours
2. Move to `status=STALE`
3. Alert if stale count exceeds threshold
4. Stale URLs can be re-queued manually

### 8.4 Head-of-Line Blocking (Future Consideration)

**Note:** The current design uses a single `SCRAPE_URL` queue with blocking `RateLimiter.acquire()`. This can cause head-of-line blocking where one slow/rate-limited domain stalls other retailers.

**Acceptable for Phase 1-2** (single adapter, SGAmmo only).

**Phase 3+ consideration:** If adding multiple retailers with different rate limits:
- Option A: Per-adapter queues with dedicated workers
- Option B: Partitioned workers (worker affinity to adapter)
- Option C: Non-blocking limiter with requeue on rate limit hit

---

## 9. Database Schema

### 9.1 scrape_targets Table

```sql
CREATE TABLE scrape_targets (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Target URL and ownership
  url TEXT NOT NULL,
  canonical_url TEXT NOT NULL,  -- Canonicalized for dedup (see Appendix A)
  source_id TEXT NOT NULL REFERENCES sources(id),  -- REQUIRED: enables trust config, visibility
  adapter_id TEXT NOT NULL,

  -- Optional link to existing source_product (for price refresh)
  source_product_id TEXT REFERENCES source_products(id),

  -- Scheduling
  schedule TEXT,  -- cron expression, e.g., '0 */4 * * *'
  priority INTEGER DEFAULT 0,  -- higher = process first

  -- Status
  status TEXT NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE, PAUSED, BROKEN, STALE
  enabled BOOLEAN NOT NULL DEFAULT TRUE,

  -- URL-level compliance override (can only BLOCK, never loosen)
  -- TRUE = inherit from domain policy; FALSE = block this specific URL
  -- Setting to TRUE does NOT override a domain-level block
  robots_path_blocked BOOLEAN DEFAULT FALSE,

  -- Tracking
  last_scraped_at TIMESTAMPTZ,
  last_status TEXT,  -- SUCCESS, FAILED, etc.
  consecutive_failures INTEGER DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  notes TEXT,

  -- Unique on canonical URL per source (prevents duplicates via tracking params)
  UNIQUE(source_id, canonical_url)
);

CREATE INDEX idx_scrape_targets_source ON scrape_targets(source_id);
CREATE INDEX idx_scrape_targets_adapter ON scrape_targets(adapter_id);
CREATE INDEX idx_scrape_targets_status ON scrape_targets(status);
CREATE INDEX idx_scrape_targets_schedule ON scrape_targets(schedule) WHERE enabled = TRUE;
```

**Note:** `retailer_id` is derived via `sources.retailer_id` join. Storing `source_id` directly enables:
- Trust config lookup (`source_trust_config.sourceId`)
- UPC trust resolution
- Visibility gating
- Per-source scrape configuration

### 9.2 Idempotency Constraint (source_products)

To prevent duplicate offers across runs, `source_products` **MUST** have a unique constraint:

```sql
-- Add unique constraint if not present
ALTER TABLE source_products
  ADD CONSTRAINT source_products_source_identity_key_unique
  UNIQUE (source_id, identity_key);
```

**Writer Upsert Rule:**
The scrape writer MUST use upsert semantics:

```typescript
await prisma.source_products.upsert({
  where: {
    source_id_identity_key: {
      sourceId: offer.sourceId,
      identityKey: offer.identityKey,
    }
  },
  create: { /* full offer data */ },
  update: {
    // Update mutable fields only
    title: offer.title,
    url: offer.url,
    brand: offer.brand,
    // ... other fields
    updatedAt: new Date(),
  },
})
```

**Rationale:** Without this constraint, duplicate offers from the same source accumulate across runs. The `identityKey` (see Appendix B) provides stable identity; upsert ensures we update existing records rather than creating duplicates.

### 9.3 scrape_runs Table

```sql
CREATE TABLE scrape_runs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Run context
  adapter_id TEXT NOT NULL,
  adapter_version TEXT NOT NULL,
  source_id TEXT NOT NULL REFERENCES sources(id),  -- For per-source metrics
  retailer_id TEXT NOT NULL REFERENCES retailers(id),  -- For per-retailer debugging
  trigger TEXT NOT NULL,  -- SCHEDULED, MANUAL, RETRY

  -- Status
  status TEXT NOT NULL DEFAULT 'RUNNING',  -- RUNNING, SUCCESS, FAILED, QUARANTINED

  -- Timing
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,

  -- Counts
  urls_attempted INTEGER DEFAULT 0,
  urls_succeeded INTEGER DEFAULT 0,
  urls_failed INTEGER DEFAULT 0,
  offers_extracted INTEGER DEFAULT 0,
  offers_valid INTEGER DEFAULT 0,
  offers_dropped INTEGER DEFAULT 0,
  offers_quarantined INTEGER DEFAULT 0,
  oos_no_price_count INTEGER DEFAULT 0,  -- Track separately, don't count as failures

  -- Derived metrics (computed at run completion)
  failure_rate DECIMAL(5,4),
  yield_rate DECIMAL(5,4),
  drop_rate DECIMAL(5,4),

  -- Error tracking
  error_code TEXT,
  error_message TEXT,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scrape_runs_adapter ON scrape_runs(adapter_id);
CREATE INDEX idx_scrape_runs_source ON scrape_runs(source_id);
CREATE INDEX idx_scrape_runs_retailer ON scrape_runs(retailer_id);
CREATE INDEX idx_scrape_runs_status ON scrape_runs(status);
CREATE INDEX idx_scrape_runs_started ON scrape_runs(started_at);
```

### 9.4 scrape_adapter_status Table

```sql
CREATE TABLE scrape_adapter_status (
  adapter_id TEXT PRIMARY KEY,

  -- Status
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  disabled_at TIMESTAMPTZ,
  disabled_reason TEXT,  -- MANUAL, DRIFT_DETECTED, ToS_VIOLATION
  disabled_by TEXT,

  -- Baseline metrics (7-day rolling)
  baseline_failure_rate DECIMAL(5,4),
  baseline_yield_rate DECIMAL(5,4),
  baseline_sample_size INTEGER DEFAULT 0,
  baseline_updated_at TIMESTAMPTZ,

  -- Consecutive failure tracking
  consecutive_failed_batches INTEGER DEFAULT 0,
  last_batch_failure_rate DECIMAL(5,4),

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 9.5 Sources Table Extension (Domain-Level Compliance)

```sql
-- Add scraper-related fields to existing sources table
-- Domain-level compliance belongs here, not on scrape_targets

ALTER TABLE sources ADD COLUMN IF NOT EXISTS adapter_id TEXT;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS scrape_config JSONB DEFAULT '{}';

-- Domain-level compliance (moved from scrape_targets)
ALTER TABLE sources ADD COLUMN IF NOT EXISTS tos_reviewed_at TIMESTAMPTZ;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS tos_approved_by TEXT;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS robots_compliant BOOLEAN DEFAULT TRUE;

-- scrape_config schema example:
-- {
--   "rateLimit": { "requestsPerSecond": 0.5 },
--   "fetcherType": "http",  -- or "playwright"
--   "customHeaders": { "Accept-Language": "en-US" }
-- }
```

**Rationale:** ToS and robots.txt are domain-level concerns. Storing at source level (not URL level) prevents:
- Inconsistent approvals across URLs for same domain
- Redundant compliance tracking
- Confusion about what's actually approved

---

## 10. Queue Architecture

### 10.1 Queue Definitions

```typescript
export const QUEUE_NAMES = {
  // ... existing queues ...
  SCRAPE_URL: 'scrape-url',  // Single queue for surgical scraping
} as const

export interface ScrapeUrlJobData {
  targetId: string       // scrape_targets.id
  url: string
  sourceId: string       // For trust config, visibility
  retailerId: string     // Derived from source, included for convenience
  adapterId: string
  runId: string
  priority: number
  trigger: 'SCHEDULED' | 'MANUAL' | 'RETRY' | 'RECHECK'
}
```

### 10.2 Job Flow

```
Scheduler/Trigger
       │
       ├── Select due scrape_targets
       ├── Create scrape_runs record (with source_id, retailer_id)
       ├── Enqueue SCRAPE_URL jobs
       │
       ▼
SCRAPE_URL Worker
       │
       ├── Acquire rate limit (Redis-backed, global coordination)
       ├── Check robots.txt (fail-closed)
       ├── Fetch HTML (via Fetcher)
       ├── Extract offer (via Adapter.extract())
       │   └── Returns ExtractResult { ok, offer } or { ok: false, reason }
       │
       ├── If extraction failed:
       │   ├── Log failure with reason
       │   ├── If reason is OOS_NO_PRICE: increment oos_no_price_count (not failure)
       │   ├── Else: increment urls_failed
       │   └── Update consecutive_failures on target
       │
       ├── If extraction succeeded:
       │   ├── Normalize offer (via Adapter.normalize())
       │   ├── Validate offer (fail-closed on missing required fields)
       │   │
       │   ├── If valid:
       │   │   ├── Write source_products record
       │   │   ├── Write source_product_identifiers records
       │   │   ├── Write prices record (ADR-015 compliant):
       │   │   │   - ingestionRunType = 'SCRAPE'
       │   │   │   - ingestionRunId = runId
       │   │   │   - observedAt = offer.observedAt
       │   │   ├── Enqueue resolver job
       │   │   └── Reset consecutive_failures on target
       │   │
       │   ├── If drop:
       │   │   └── Log drop with reason, increment offers_dropped
       │   │
       │   └── If quarantine:
       │       └── Write to quarantine table, increment offers_quarantined
       │
       ├── Update scrape_targets.last_scraped_at
       │
       ▼
  Update scrape_runs metrics (including oos_no_price_count)
```

**ADR-015 Compliance:** All price writes include:
- `ingestionRunType = 'SCRAPE'`
- `ingestionRunId = scrape_runs.id`
- `observedAt` from the offer

This enables the price corrections overlay to work correctly and ensures scraped prices are excluded from consumer queries until explicitly enabled.

---

## 11. Observability

### 11.1 Metrics

```typescript
// Counters
scrape_urls_attempted_total{adapter_id, source_id, status}
scrape_urls_succeeded_total{adapter_id, source_id}
scrape_urls_failed_total{adapter_id, source_id, reason}
scrape_offers_extracted_total{adapter_id, source_id}
scrape_offers_valid_total{adapter_id, source_id}
scrape_offers_dropped_total{adapter_id, source_id, reason}
scrape_offers_quarantined_total{adapter_id, source_id, reason}
scrape_adapter_disabled_total{adapter_id, reason}
scrape_queue_rejected_total{reason}
scrape_oos_no_price_total{adapter_id, source_id}  // Track separately

// Gauges
scrape_queue_pending{adapter_id}
scrape_adapter_enabled{adapter_id}  // 1 or 0
scrape_targets_active{adapter_id, source_id}
scrape_targets_broken{adapter_id, source_id}

// Histograms
scrape_fetch_duration_ms{adapter_id}
scrape_extract_duration_ms{adapter_id}
scrape_rate_limit_wait_ms{domain}
```

### 11.2 Alerts

| Alert | Condition | Severity | Action |
|-------|-----------|----------|--------|
| Adapter auto-disabled | `scrape_adapter_enabled == 0` | P1 | Page on-call |
| High failure rate | `failure_rate > 0.5` for 1 batch | P2 | Slack alert |
| Queue rejection spike | `scrape_queue_rejected_total` increase | P2 | Slack alert |
| Stale URLs accumulating | `scrape_targets_stale > 100` | P3 | Slack alert |

---

## 12. Visibility Enforcement

### 12.1 Consumer Exclusion (Mandatory)

Scraped prices MUST be excluded from consumer-facing queries until explicitly enabled:

```typescript
// In all consumer-facing price queries
{
  ingestionRunType: { notIn: ['SCRAPE'] }
}
```

### 12.2 Audit Checklist

Before enabling any scrape adapter for production:

- [ ] `apps/api/src/services/ai-search/price-resolver.ts` excludes SCRAPE
- [ ] `apps/api/src/services/saved-items.ts` excludes SCRAPE
- [ ] `apps/api/src/services/market-deals.ts` excludes SCRAPE
- [ ] `current_visible_prices` recompute excludes SCRAPE
- [ ] Raw SQL queries audited for SCRAPE exclusion

### 12.3 Source Defaults

New scrape sources MUST default to:
- `visibilityStatus = 'INELIGIBLE'`
- `upcTrusted = false` in `source_trust_config`

---

## 13. File Structure

```
apps/harvester/src/scraper/
├── index.ts                    # Exports
├── types.ts                    # ScrapedOffer, ScrapeAdapter, ExtractResult, etc.
├── registry.ts                 # AdapterRegistry implementation
│
├── fetch/
│   ├── fetcher.ts              # Fetcher interface
│   ├── http-fetcher.ts         # fetch + cheerio implementation
│   ├── robots.ts               # robots.txt parser + cache
│   └── rate-limiter.ts         # Redis-backed rate limiter (MUST be Redis)
│
├── process/
│   ├── validator.ts            # Offer validation (fail-closed)
│   ├── writer.ts               # Writes to source_products AND prices
│   └── drift-detector.ts       # Drift detection + auto-disable
│
├── worker.ts                   # SCRAPE_URL queue worker
├── scheduler.ts                # Schedules due targets
│
├── utils/
│   ├── url.ts                  # URL canonicalization
│   ├── selectors.ts            # CSS selector helpers
│   ├── price-parser.ts         # Price extraction (returns cents)
│   └── stock-parser.ts         # Stock signal parsing
│
├── adapters/
│   ├── _template/              # Adapter template
│   │   ├── adapter.ts
│   │   ├── selectors.ts
│   │   └── __tests__/
│   │       ├── adapter.test.ts
│   │       └── fixtures/
│   │           └── product-page.html
│   │
│   └── sgammo/                 # First adapter
│       ├── adapter.ts
│       ├── selectors.ts
│       └── __tests__/
│
├── metrics.ts                  # Prometheus metrics
│
└── __tests__/
    ├── validator.test.ts
    ├── rate-limiter.test.ts
    ├── drift-detector.test.ts
    └── integration/
```

---

## 14. Implementation Phases

### Phase 0: Compliance + Contract (Blocking)

- [ ] Create `scrape_targets` table migration
- [ ] Create `scrape_runs` table migration
- [ ] Create `scrape_adapter_status` table migration
- [ ] Add scraper fields to `sources` table migration
- [ ] Review SGAmmo ToS
- [ ] Review SGAmmo robots.txt
- [ ] Document compliance approval

**Exit criteria:** ToS approved, tables exist, robots.txt policy documented.

### Phase 1: Shared Framework

- [ ] Core types (`types.ts`) including ExtractResult
- [ ] Fetcher interface + HttpFetcher
- [ ] Rate limiter (Redis-backed, explicitly global)
- [ ] robots.txt policy
- [ ] Offer validator (fail-closed)
- [ ] Adapter registry
- [ ] SCRAPE_URL queue + worker
- [ ] Drift detector + auto-disable (with OOS_NO_PRICE exclusion)
- [ ] Scheduler for due targets
- [ ] Metrics emission
- [ ] Visibility audit (SCRAPE exclusion)

**Exit criteria:** Framework functional, can process URLs (no adapter yet).

### Phase 2: SGAmmo Adapter

- [ ] Capture SGAmmo product page fixtures
- [ ] Implement selectors.ts for SGAmmo
- [ ] Implement adapter.ts (returning ExtractResult)
- [ ] Fixture-based tests
- [ ] Integration test (end-to-end)
- [ ] Add 10-20 SGAmmo URLs to scrape_targets
- [ ] Run in staging, verify source_products AND prices written
- [ ] Verify resolver links scraped products

**Exit criteria:** SGAmmo adapter extracts offers, resolver links them.

### Phase 3: Scale Readiness

- [ ] Admin portal: manage scrape_targets
- [ ] Admin portal: view scrape_runs
- [ ] Admin portal: enable/disable adapters
- [ ] Grafana dashboard for scraper metrics
- [ ] Runbook for drift alerts
- [ ] Runbook for adapter re-enable
- [ ] Evaluate head-of-line blocking mitigation if adding more adapters

**Exit criteria:** Ops can manage scrapers without code changes.

### Phase 4: JS Rendering (Deferred)

- [ ] PlaywrightFetcher implementation
- [ ] Resource limits (memory, CPU, timeout)
- [ ] Adapter opt-in flag
- [ ] First JS-rendered target

**Exit criteria:** Only if a target requires JS rendering.

---

## 15. Acceptance Criteria

### Phase 1 Exit

- [ ] Fetcher respects robots.txt (blocked URLs return `robots_blocked`)
- [ ] Rate limiter enforces 0.5 req/sec default (Redis-backed, global)
- [ ] Validator rejects offers missing required fields
- [ ] Drift detector auto-disables adapter after 2 consecutive failed batches
- [ ] OOS_NO_PRICE drops are tracked but excluded from drift calculations
- [ ] SCRAPE runs excluded from all consumer queries (audited)
- [ ] Metrics emitted for all key operations
- [ ] Queue rejects new URLs when at capacity

### Phase 2 Exit

- [ ] SGAmmo adapter extracts price, title, availability, stock
- [ ] SGAmmo adapter returns ExtractResult (not null) on all paths
- [ ] >90% of SGAmmo URLs produce valid offers
- [ ] Prices written with correct provenance (`ingestionRunType='SCRAPE'`)
- [ ] Resolver links scraped products to canonical products
- [ ] Fixture tests pass in CI (no network access)

### Phase 3 Exit

- [ ] Ops can add/remove/pause scrape_targets via admin portal
- [ ] Ops can enable/disable adapters via admin portal
- [ ] Drift alerts fire correctly in staging
- [ ] Auto-disable triggers and recovers correctly
- [ ] Runbooks documented and reviewed

---

## Appendix A: URL Canonicalization Rules

1. Enforce https (upgrade http)
2. Remove tracking parameters: `utm_*`, `fbclid`, `gclid`, `ref`, `source`, `campaign`
3. Remove fragment identifiers (`#...`)
4. Lowercase hostname
5. Remove trailing slash (except root path)
6. Remove empty query parameters
7. Sort query parameters alphabetically (for consistent hashing)

```typescript
function canonicalizeUrl(url: string): string {
  const parsed = new URL(url)

  // Enforce https
  parsed.protocol = 'https:'

  // Lowercase hostname
  parsed.hostname = parsed.hostname.toLowerCase()

  // Remove tracking params
  const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term',
                          'utm_content', 'fbclid', 'gclid', 'ref', 'source']
  trackingParams.forEach(p => parsed.searchParams.delete(p))

  // Sort remaining params
  parsed.searchParams.sort()

  // Remove fragment
  parsed.hash = ''

  // Remove trailing slash (except root)
  if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
    parsed.pathname = parsed.pathname.slice(0, -1)
  }

  return parsed.toString()
}
```

**Important:** `scrape_targets` stores both `url` (original) and `canonical_url` (normalized). The unique constraint is on `(source_id, canonical_url)` to prevent duplicates via tracking params.

---

## Appendix B: Identity Key Format

Format: `{idType}:{idValue}`

**Priority (use first available):**
1. `PID:{retailerProductId}` - Most stable identifier
2. `SKU:{retailerSku}` - Usually stable
3. `URL:{urlHash}` - Fallback (SHA-256 of canonical URL, first 16 chars)

**Examples:**
- `PID:12345678`
- `SKU:FEDERAL-9MM-115-50`
- `URL:a1b2c3d4e5f67890`

**Validation rules:**
- idType must be one of: `PID`, `SKU`, `URL`
- idValue must be non-empty
- idValue must not contain `:`
- idValue max length: 255 characters

---

## Appendix C: Price Conversion and Semantics

### Price Semantics (Canonical Rules)

1. **Capture current selling price** - the price a customer would pay right now, not crossed-out "was" prices
2. **If tiered pricing exists:**
   - **Prefer qty=1 tier** when present (most consumer-aligned)
   - Only fall back to lowest tier if all tiers have identical per-unit pricing
   - Example: "1-4: $25, 5-9: $24, 10+: $23" → capture $25 (qty=1 tier)
   - Example: "Any qty: $24.99/box" → capture $24.99 (all same)
3. **If multiple prices visible and ambiguous** - quarantine with `AMBIGUOUS_PRICE` reason
4. **If out-of-stock and price hidden** - return `ExtractResult { ok: false, reason: 'OOS_NO_PRICE' }` (not an error)
5. **Ignore "per round" display prices** - always capture box/unit price, derive CPR in post-processing

### Price Conversion

```typescript
/**
 * Convert cents (integer) to Decimal for database write.
 */
function centsToDecimal(cents: number): Prisma.Decimal {
  return new Prisma.Decimal(cents).div(100)
}

/**
 * Convert scraped offer price to database format.
 */
function convertPrice(offer: ScrapedOffer): Prisma.Decimal {
  // Validate cents is integer
  if (!Number.isInteger(offer.priceCents)) {
    throw new Error(`priceCents must be integer, got ${offer.priceCents}`)
  }

  // Validate range (max $999,999.99)
  if (offer.priceCents < 1 || offer.priceCents > 99999999) {
    throw new Error(`priceCents out of range: ${offer.priceCents}`)
  }

  return centsToDecimal(offer.priceCents)
}
```

---

## Appendix D: SGAmmo Adapter Notes

**Domain:** `sgammo.com`

**Product page structure (to verify during Phase 2):**
- Price location: TBD (capture fixture first)
- Stock indicator: TBD
- Product ID: TBD
- SKU: TBD

**Known considerations:**
- Server-rendered HTML (no JS required)
- robots.txt: TBD (review in Phase 0)
- ToS: TBD (review in Phase 0)

**Fixture capture checklist:**
- [ ] In-stock product page
- [ ] Out-of-stock product page (verify price visibility)
- [ ] Product with quantity tiers (if applicable)
- [ ] Product with sale price (if applicable)
