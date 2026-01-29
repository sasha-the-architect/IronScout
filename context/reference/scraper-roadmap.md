# Scraper Roadmap — Surgical URL Scraping + Thin Adapters

**Status:** Active (decisions resolved)
**Owner:** Engineering (Harvester)
**Last updated:** 2026-01-29
**Detailed spec:** `context/specs/scraper-framework-01.md`

This roadmap defines how to build a surgical, URL-driven price monitoring system.
It does NOT expand v1 scope. v1 consumer data remains affiliate-feed only per `context/02_v1_scope_and_cut_list.md`.
Scraper outputs must remain non-consumer-visible until scope and promises change.

---

## Architecture: Surgical Scraping (Not Site Crawling)

**Key decision:** We scrape **specific URLs stored in the database**, not entire sites.

| Aspect | Site Crawling (Rejected) | Surgical Scraping (Adopted) |
|--------|--------------------------|------------------------------|
| URL source | Adapter discovers via pagination | Database (`scrape_targets` table) |
| Volume | Thousands of pages | Tens to hundreds of URLs |
| Discovery | Finds new products | Monitors known products only |
| Adapter complexity | High (pagination, dedup) | Low (single page extraction) |
| Risk profile | Higher ToS exposure | Lower, more controlled |

---

## Goals

- Build a surgical price monitoring framework where new retailers can be added via thin adapters
- Scrape specific product URLs (not site-wide crawling)
- Preserve trust invariants: append-only price facts (ADR-004/015), fail-closed ambiguity (ADR-009)
- Keep the system operable with clear run logging, quarantine controls, and deterministic outputs
- Ensure cross-source grouping via Product Resolver (ADR-019)

---

## Non-Goals (v1)

- No site-wide crawling or product discovery
- No consumer visibility for scraped prices
- No real-time guarantees or SLAs
- No purchase recommendations, verdicts, or deal scores
- No JS rendering (defer until a target requires it)
- No proxy rotation or anti-bot evasion

---

## Current State (Post-Cleanup)

The legacy crawl pipeline (`scheduler/`, `fetcher/`, `extractor/`, `normalizer/`, `writer/`) has been **removed**.

What exists:
- `apps/harvester/src/utils/ammo-utils.ts` — caliber/grain/roundCount extraction
- Product Resolver (ADR-019) — links source_products → products
- BullMQ infrastructure — job queuing
- Affiliate feed parser — reference implementation for unified ingestion pattern
- `source_products` + `source_product_identifiers` tables

What needs to be built:
- `apps/harvester/src/scraper/` — new scraper framework (see spec)

---

## Resolved Decisions

| # | Decision | Resolution |
|---|----------|------------|
| 1 | URL Storage | Database table (`scrape_targets`) |
| 2 | First Retailer | **SGAmmo** |
| 3 | Rate Limit Default | Conservative: **0.5 req/sec** |
| 4 | Drift Thresholds | 50% failure, 2 consecutive batches, min 20 URLs |
| 5 | Crawling Library | **fetch + cheerio**, pluggable fetcher interface |
| 6 | JS Rendering | **Defer** until needed |
| 7 | Backpressure | **Block/reject** with retry-after + 24h max-age |
| 8 | Price Format | **Cents (integer)** internally, Decimal(10,2) on write |

See `context/specs/scraper-framework-01.md` for full details.

---

## Roadmap Phases

### Phase 0 — Compliance + Schema (Blocking)

**Owner:** Engineering
**Deliverables:**
- [ ] Create `scrape_targets` table migration
- [ ] Create `scrape_runs` table migration
- [ ] Create `scrape_adapter_status` table migration
- [ ] Review SGAmmo ToS
- [ ] Review SGAmmo robots.txt
- [ ] Document compliance approval

**Exit criteria:** ToS approved, tables exist, robots.txt policy documented.

**Gate:** Phase 1 must not start until Phase 0 completes.

---

### Phase 1 — Shared Framework

**Owner:** Engineering (Harvester)
**Deliverables:**
- [ ] Core types (`types.ts`) — ScrapedOffer, ScrapeAdapter, etc.
- [ ] Fetcher interface + HttpFetcher (fetch + cheerio)
- [ ] Rate limiter (Redis-backed, 0.5 req/sec default)
- [ ] robots.txt policy (fail-closed)
- [ ] Offer validator (fail-closed on missing required fields)
- [ ] Adapter registry
- [ ] SCRAPE_URL queue + worker
- [ ] Drift detector + auto-disable logic
- [ ] Scheduler for due targets
- [ ] Metrics emission
- [ ] Visibility audit (SCRAPE exclusion from all consumer queries)

**Exit criteria:** Framework functional, can process URLs (no adapter yet).

---

### Phase 2 — SGAmmo Adapter

**Owner:** Engineering (Ingestion)
**Deliverables:**
- [ ] Capture SGAmmo product page fixtures (in-stock, out-of-stock, sale price)
- [ ] Implement `selectors.ts` for SGAmmo
- [ ] Implement `adapter.ts`
- [ ] Fixture-based tests (no network in CI)
- [ ] Integration test (end-to-end flow)
- [ ] Add 10-20 SGAmmo URLs to `scrape_targets`
- [ ] Run in staging, verify `source_products` written correctly
- [ ] Verify resolver links scraped products to canonical products

**Exit criteria:** SGAmmo adapter extracts offers, resolver links them, >90% success rate.

---

### Phase 3 — Scale Readiness

**Owner:** Engineering (Ops)
**Deliverables:**
- [ ] Admin portal: manage `scrape_targets` (add/remove/pause URLs)
- [ ] Admin portal: view `scrape_runs` (history, metrics)
- [ ] Admin portal: enable/disable adapters
- [ ] Grafana dashboard for scraper metrics
- [ ] Runbook for drift alerts
- [ ] Runbook for adapter re-enable after fix

**Exit criteria:** Ops can manage scrapers without code changes.

---

### Phase 4 — JS Rendering (Deferred)

**Owner:** Engineering (Platform)
**Trigger:** Only if a target requires JS rendering
**Deliverables:**
- [ ] PlaywrightFetcher implementation
- [ ] Resource limits (memory, CPU, timeout)
- [ ] Adapter opt-in flag (`requiresJsRendering`)
- [ ] First JS-rendered target

**Exit criteria:** JS-rendered pages can be scraped with same adapter interface.

---

## Adapter Contract (Summary)

Full contract in `context/specs/scraper-framework-01.md`.

### Simplified Interface (No Pagination)

```typescript
interface ScrapeAdapter {
  readonly id: string
  readonly version: string
  readonly domain: string
  readonly requiresJsRendering: boolean

  // One URL in, one offer out
  extract(html: string, url: string, ctx: ScrapeAdapterContext): ScrapedOffer | null
  normalize(offer: ScrapedOffer, ctx: ScrapeAdapterContext): NormalizeResult
}
```

No `getSeedUrls()` or `getNextPages()` — URLs come from database.

### Price Format

All prices in **cents (integer)** to avoid floating point issues:
- `priceCents: 1999` = $19.99
- Convert to `Decimal(10,2)` when writing to `prices` table

### Required Fields (Fail-Closed)

- `sourceId`, `retailerId`, `url`, `title`, `priceCents`, `currency`, `availability`, `observedAt`, `identityKey`, `adapterVersion`

Missing any required field → DROP (not written to DB).

---

## Drift Detection

### Adapter-Level

| Condition | Action |
|-----------|--------|
| Failure rate > 50% in 1 batch (≥20 URLs) | **Alert** |
| Failure rate > 50% in 2 consecutive batches | **Auto-disable adapter** |
| Zero offers in 2 consecutive runs (≥20 URLs) | **Auto-disable adapter** |

### URL-Level

| Condition | Action |
|-----------|--------|
| URL fails 5 consecutive times | Mark `status=BROKEN` |
| BROKEN URL | Stop scraping, weekly recheck |
| Weekly recheck succeeds | Mark `status=ACTIVE`, resume |

### Recovery

Manual re-enable via admin portal after fix deployed.

---

## Rate Limiting

**Default:** 0.5 requests/second (2 second minimum delay)

- Redis-backed, per-domain
- Configurable per-adapter via `scrape_config`
- Start conservative, increase after proving stability

---

## Backpressure

**Policy:** Block/reject (not silent drop)

When queue is full:
1. Reject new URLs with `retryAfterMs` hint
2. Alert on rejection spike
3. Stale cleanup: URLs pending >24h moved to `status=STALE`

---

## Visibility Enforcement (v1 Hard Gates)

Scraper outputs MUST be excluded from consumers:

```typescript
// In all consumer-facing price queries
{ ingestionRunType: { notIn: ['SCRAPE'] } }
```

**Checklist before any scrape adapter goes live:**
- [ ] `price-resolver.ts` excludes SCRAPE
- [ ] `saved-items.ts` excludes SCRAPE
- [ ] `market-deals.ts` excludes SCRAPE
- [ ] `current_visible_prices` recompute excludes SCRAPE
- [ ] All raw SQL queries audited

**Source defaults:**
- `visibilityStatus = 'INELIGIBLE'`
- `upcTrusted = false`

---

## Robots.txt Policy

1. Obey all Disallow rules for `User-agent: *` and `User-agent: IronScout`
2. Honor Crawl-delay (min 1s, max 60s, default 2s)
3. If robots.txt unavailable after 3 retries: **fail closed** (block domain)
4. Cache robots.txt for 24 hours
5. If robots.txt changes to Disallow: stop immediately

---

## Database Schema (New Tables)

### scrape_targets

Stores URLs to scrape:
- `url`, `retailer_id`, `adapter_id`
- `schedule` (cron), `priority`, `enabled`
- `status` (ACTIVE, PAUSED, BROKEN, STALE)
- `last_scraped_at`, `consecutive_failures`
- `tos_reviewed_at`, `tos_approved_by`

### scrape_runs

Audit trail for scrape batches:
- `adapter_id`, `adapter_version`, `trigger`
- `status`, `started_at`, `completed_at`, `duration_ms`
- `urls_attempted`, `urls_succeeded`, `urls_failed`
- `offers_extracted`, `offers_valid`, `offers_dropped`, `offers_quarantined`
- `failure_rate`, `yield_rate`, `drop_rate`

### scrape_adapter_status

Per-adapter state:
- `enabled`, `disabled_at`, `disabled_reason`
- `baseline_failure_rate`, `baseline_yield_rate`, `baseline_sample_size`
- `consecutive_failed_batches`

---

## File Structure

```
apps/harvester/src/scraper/
├── types.ts                    # ScrapedOffer, ScrapeAdapter, etc.
├── registry.ts                 # AdapterRegistry
├── worker.ts                   # SCRAPE_URL queue worker
├── scheduler.ts                # Schedules due targets
│
├── fetch/
│   ├── fetcher.ts              # Fetcher interface
│   ├── http-fetcher.ts         # fetch + cheerio
│   ├── robots.ts               # robots.txt policy
│   └── rate-limiter.ts         # Redis-backed
│
├── process/
│   ├── validator.ts            # Fail-closed validation
│   ├── writer.ts               # Write to source_products
│   └── drift-detector.ts       # Auto-disable logic
│
├── utils/
│   ├── url.ts                  # URL canonicalization
│   ├── price-parser.ts         # Extract price in cents
│   └── stock-parser.ts         # Availability signals
│
├── adapters/
│   ├── _template/              # Adapter template
│   └── sgammo/                 # First adapter
│
└── __tests__/
```

---

## Product Resolver Alignment

Scrapers follow the unified ingestion pattern:

1. Write `source_products` records
2. Write `source_product_identifiers` records (UPC, SKU, retailerProductId)
3. Enqueue resolver jobs

The Product Resolver (ADR-019) handles:
- Normalization (`brandNorm`, `caliberNorm`, `grain`, `packCount`)
- UPC lookup (if source is trusted)
- Fingerprint matching
- Routing to NEEDS_REVIEW if ambiguous

**Tip:** Providing structured fields (`brand`, `roundCount`, `caliber`) on `source_products` improves resolver success rate.

---

## Acceptance Criteria

### Phase 1 Exit

- [ ] Fetcher respects robots.txt (blocked URLs return `robots_blocked`)
- [ ] Rate limiter enforces 0.5 req/sec default
- [ ] Validator rejects offers missing required fields
- [ ] Drift detector auto-disables adapter after 2 consecutive failed batches
- [ ] SCRAPE runs excluded from all consumer queries (audited)
- [ ] Metrics emitted for all key operations
- [ ] Queue rejects new URLs when at capacity

### Phase 2 Exit

- [ ] SGAmmo adapter extracts price, title, availability
- [ ] >90% of SGAmmo URLs produce valid offers
- [ ] Prices written with correct provenance (`ingestionRunType='SCRAPE'`)
- [ ] Resolver links scraped products to canonical products
- [ ] Fixture tests pass in CI (no network access)

### Phase 3 Exit

- [ ] Ops can add/remove/pause `scrape_targets` via admin portal
- [ ] Ops can enable/disable adapters via admin portal
- [ ] Drift alerts fire correctly in staging
- [ ] Auto-disable triggers and recovers correctly
- [ ] Runbooks documented and reviewed

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| ToS violation | Legal/business | Allowlist + legal sign-off + robots.txt hygiene |
| Extraction drift | Data quality | Fixture tests + drift detection + auto-disable |
| Rate limit bans | Source blocked | Conservative defaults (0.5 req/sec) |
| Queue overflow | Data loss | Block/reject policy (not silent drop) |

---

## References

- **Detailed spec:** `context/specs/scraper-framework-01.md`
- **Product Resolver:** `context/decisions/ADR-019-product-resolver.md`
- **Price Corrections:** `context/decisions/ADR-015-price-corrections.md`
- **Unified Ingestion:** `apps/harvester/README.md`
