# Affiliate Feed Alerts v1

## Goal

Enable price drop and back-in-stock alerts for products ingested via affiliate feeds by
reusing the existing alert queue and alerter worker from the retailer/crawl pipeline.

## Non-Goals

- No new alert types or alert UX changes.
- No changes to the alerter worker logic.
- No recommendations or "deal" scoring.
- No new schema tables for alerts.
- No changes to retailer/crawl alert behavior.
- No backfill of historical alerts.

## Scope

Applies to:
- Affiliate feed ingestion pipeline in `apps/harvester/src/affiliate/processor.ts`.
- Existing alert queue in `apps/harvester/src/config/queues.ts`.
- Existing alerter worker in `apps/harvester/src/alerter/index.ts`.

Does not apply to:
- Retailer/crawl ingestion pipeline.
- Product resolver logic.
- Watchlist creation logic.

## Decision References

- ADR-004 Append-Only Price History
- ADR-005 Retailer Visibility Determined at Query Time
- ADR-009 Fail Closed on Ambiguity
- ADR-011 Unified Saved Items
- ADR-015 Price History Immutability and Corrections

## Key Requirements

1) Alerts must be triggered only from actual price drops or back-in-stock events.
2) Alerts must only be queued for products with a canonical `productId`.
3) Affiliate alerts must use the existing alert queue and payload shape.
4) Price history remains append-only; no updates to existing rows.
5) Alert evaluation continues to enforce retailer visibility at query time (ADR-005).

## Data Model

No schema changes required for alerts.

Affiliate pipeline relies on the existing `prices` table and its partial unique index:
- `prices_affiliate_dedupe` on (`sourceProductId`, `affiliateFeedRunId`, `priceSignatureHash`)

## Pipeline Changes

### 1) Extend in-memory last price cache

Current cache uses `priceSignatureHash` only. To compute price drops and stock transitions,
the cache must include `price` and `inStock` for the last observed row.

```
interface LastPriceEntry {
  sourceProductId: string
  priceSignatureHash: string
  createdAt: Date
  price: number
  inStock: boolean
  currency: string
}
```

Fetch latest values with `DISTINCT ON`, cast Decimal to float for comparisons:

```
SELECT DISTINCT ON ("sourceProductId")
  "sourceProductId",
  "priceSignatureHash",
  "createdAt",
  "price"::float8 AS price,
  "inStock",
  "currency"
FROM prices
WHERE "sourceProductId" = ANY($1::text[])
ORDER BY "sourceProductId", "createdAt" DESC
```

### 2) Separate change detection from signature changes

`priceSignatureHash` includes `currency` and `originalPrice`, so a signature change
does not imply a price drop.

Change detection rules:
- Price drop: `oldPrice > newPrice` and `oldCurrency === newCurrency`
- Back in stock: `oldInStock === false && newInStock === true`
- Stock-only changes must be written even if signature unchanged

### 3) Return structured change data

`decidePriceWrites()` must return both `pricesToWrite` and change lists:

```
interface AffiliatePriceChange {
  productId: string
  sourceProductId: string
  oldPrice: number
  newPrice: number
}

interface AffiliateStockChange {
  productId: string
  sourceProductId: string
  inStock: true
}

interface PriceWriteResult {
  pricesToWrite: NewPriceRecord[]
  priceChanges: AffiliatePriceChange[]
  stockChanges: AffiliateStockChange[]
}
```

### 4) Queue alerts after successful writes

Only enqueue alerts after `bulkInsertPrices()` succeeds.
Use existing alert queue and payload shape:

```
data: {
  executionId: affiliateFeedRunId,
  productId,
  oldPrice,
  newPrice,
  inStock
}
```

Job dedupe:
- Do not set `jobId` (alerter already enforces cooldowns and claim logic).

### 5) Skip alerts when productId is null

If `productId` is null (no UPC match and resolver has not linked yet),
do not queue an alert. Log a skip event.

## Alert Semantics

### Price Drop

- Triggered only when `oldPrice > newPrice`.
- Signature changes that do not change price do not trigger alerts.

### Back In Stock

- Triggered only when `oldInStock === false && newInStock === true`.
- Requires inStock to be persisted and updated in cache.
- Does not trigger on new products with no prior stock state.
- If current `inStock` is null/undefined, do not trigger stock alerts.

## Observability

Logs (affiliate pipeline):
- `AFFILIATE_ALERTS_ENQUEUED` with counts for price drops and back-in-stock.
- `AFFILIATE_ALERTS_SKIPPED_NO_PRODUCT` for rows missing `productId`.
- `AFFILIATE_ALERTS_SKIPPED_NO_CHANGE` when no actionable changes.
- `AFFILIATE_ALERTS_QUEUE_FAILED` when alert queueing fails.
- `AFFILIATE_ALERTS_SKIPPED_CURRENCY_MISMATCH` when currencies differ.
- `AFFILIATE_ALERTS_SKIPPED_STOCK_UNKNOWN` when inStock is missing.

Metrics (recommended):
- `affiliate_alerts_enqueued_total{type="price_drop|back_in_stock"}`
- `affiliate_alerts_skipped_total{reason="no_product_id|no_change"}`

## Failure Modes and Behavior

- Cache miss: treated as new product; no alert.
- Stock-only change: write price row + queue back-in-stock if applicable.
- Duplicate run: dedupe index prevents duplicate price rows, alerter cooldown
  prevents repeated notifications.
- Visibility: alerter enforces visibility via `hasVisibleRetailerPrice()`.
- Queue failure: log and continue (alerts are best-effort).

## Rollout Plan

1) Implement affiliate alert enqueue logic.
2) Deploy with alert processing enabled (existing flag).
3) Monitor alert volume and skip logs.
4) If volume is unexpected, disable alert processing via existing setting.

## Test Plan

Unit tests in affiliate pipeline:
- Price drop queues alert.
- Price increase does not queue alert.
- Stock false -> true queues back-in-stock alert.
- Stock true -> false does not queue back-in-stock alert.
- Signature change only (originalPrice/currency) does not queue alert.
- Currency change only does not queue alert.
- inStock undefined does not queue stock alert.
- productId null skips queueing.

Integration tests:
- Affiliate feed run writes price and enqueues alerts.
- Alerter processes queued affiliate alerts without code changes.

## Acceptance Criteria

- Affiliate price drops trigger alerts for watchlisted products.
- Back-in-stock alerts trigger on stock transitions.
- No alerts fire for price increases or signature-only changes.
- Alerts are never queued for products without a canonical `productId`.
- Retailer visibility enforcement remains unchanged (ADR-005).

## Known Limitations

### Stock Alerts Limited to Affiliate Sources (v1)

BACK_IN_STOCK alerts are only supported for products ingested via affiliate feeds.
The crawl/retailer pipeline tracks stock for price writes but does not queue stock
alerts. This is intentional for v1 to limit scope.

Follow-up: [GitHub Issue #19 — Add BACK_IN_STOCK alerts to crawl/retailer pipeline](https://github.com/jeb-scarbrough/IronScout/issues/19)

### Handling NULL Values from Database

- If `oldInStock` is NULL in the database, treat as unknown state; do not trigger BACK_IN_STOCK.
- If `oldCurrency` is NULL in the database, treat as unknown; do not trigger price drop alert.
- These cases should be logged as `AFFILIATE_ALERTS_SKIPPED_UNKNOWN_PRIOR_STATE`.
