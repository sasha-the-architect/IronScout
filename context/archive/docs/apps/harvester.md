# Harvester Application

The Harvester (`apps/harvester/`) is a BullMQ-based distributed worker system that crawls product data and processes dealer feeds.

## Overview

- **Framework**: BullMQ with Redis
- **Workers**: 10 parallel workers (6 core + 4 dealer)
- **Database**: PostgreSQL via Prisma
- **Queue**: Redis-backed job queues

---

## Architecture

```
apps/harvester/
├── src/
│   ├── worker.ts             # Worker entry point
│   ├── scheduler/            # Job scheduling
│   ├── config/
│   │   └── queues.ts         # Queue definitions
│   ├── workers/              # Core pipeline workers
│   │   ├── scheduler.ts
│   │   ├── fetcher.ts
│   │   ├── extractor.ts
│   │   ├── normalizer.ts
│   │   ├── writer.ts
│   │   └── alerter.ts
│   └── dealer/               # Dealer pipeline workers
│       ├── feed-ingest.ts
│       ├── sku-match.ts
│       ├── benchmark.ts
│       └── insight.ts
├── package.json
└── tsconfig.json
```

---

## Starting Workers

```bash
cd apps/harvester

# Start all workers
pnpm worker

# Development mode with hot reload
pnpm dev

# Trigger immediate crawl
pnpm dev run

# Set up recurring schedule
pnpm dev schedule

# Check queue status
pnpm dev status
```

---

## Pipeline Architecture

### Core Pipeline (6 Workers)

Processes external data sources (RSS feeds, HTML pages, JSON APIs).

```
┌───────────┐    ┌───────────┐    ┌───────────┐
│ Scheduler │───▶│  Fetcher  │───▶│ Extractor │
└───────────┘    └───────────┘    └───────────┘
                                        │
                                        ▼
┌───────────┐    ┌───────────┐    ┌───────────┐
│  Alerter  │◀───│  Writer   │◀───│Normalizer │
└───────────┘    └───────────┘    └───────────┘
```

| Worker | Purpose |
|--------|---------|
| **Scheduler** | Creates crawl jobs from Source records at configured intervals |
| **Fetcher** | Downloads content (RSS, HTML, JSON, JS_RENDERED via Playwright) |
| **Extractor** | Parses content and extracts product data using configured rules |
| **Normalizer** | Standardizes data (prices, calibers, brands, categories) |
| **Writer** | Upserts products, retailers, and prices to PostgreSQL |
| **Alerter** | Checks for price changes and triggers user alert notifications |

### Dealer Pipeline (4 Workers)

Processes dealer-submitted product feeds.

```
┌──────────────┐    ┌──────────────┐
│ FeedIngest   │───▶│  SkuMatch    │
└──────────────┘    └──────────────┘
                          │
                          ▼
┌──────────────┐    ┌──────────────┐
│   Insight    │◀───│  Benchmark   │
└──────────────┘    └──────────────┘
```

| Worker | Purpose |
|--------|---------|
| **FeedIngest** | Downloads and parses dealer CSV/XML/JSON feeds |
| **SkuMatch** | Matches dealer SKUs to canonical products |
| **Benchmark** | Calculates market price benchmarks per caliber |
| **Insight** | Generates actionable pricing insights for dealers |

---

## Queue Configuration

**File**: `src/config/queues.ts`

```typescript
export const QUEUES = {
  // Core pipeline
  SCHEDULER: 'scheduler',
  FETCHER: 'fetcher',
  EXTRACTOR: 'extractor',
  NORMALIZER: 'normalizer',
  WRITER: 'writer',
  ALERTER: 'alerter',

  // Dealer pipeline
  DEALER_FEED_INGEST: 'dealer-feed-ingest',
  DEALER_SKU_MATCH: 'dealer-sku-match',
  DEALER_BENCHMARK: 'dealer-benchmark',
  DEALER_INSIGHT: 'dealer-insight',
};
```

---

## Worker Details

### Scheduler

Creates jobs for sources that need crawling.

```typescript
// Check interval (runs every 5 minutes)
// For each Source where lastRunAt + intervalMinutes < now:
//   - Create fetcher job
//   - Update Source.lastRunAt
```

### Fetcher

Downloads content based on source type.

| Source Type | Method |
|-------------|--------|
| `RSS` | HTTP GET, parse XML |
| `HTML` | HTTP GET, raw HTML |
| `JSON` | HTTP GET, parse JSON |
| `JS_RENDERED` | Playwright browser fetch |

**Features**:
- Respects robots.txt
- Rate limiting per domain
- Retry with exponential backoff
- Hash-based caching (skip unchanged content)

### Extractor

Parses content using source-specific rules.

```typescript
// Source.config contains extraction rules:
{
  "selectors": {
    "product": ".product-item",
    "title": ".product-title",
    "price": ".product-price",
    "url": "a.product-link"
  }
}
```

### Normalizer

Standardizes extracted data.

**Transformations**:
- Price parsing ($12.99 → 12.99)
- Caliber normalization ("9mm Luger" → "9mm")
- Brand extraction from title
- Round count extraction ("1000 rounds" → 1000)
- Case type detection (brass, steel, aluminum)

### Writer

Upserts data to PostgreSQL.

**Operations**:
- Upsert Product (by UPC or title+caliber+brand)
- Upsert Retailer (by domain)
- Upsert Price (by product+retailer)
- Update Execution stats

### Alerter

Checks for price changes and notifies users.

**Logic**:
1. Compare new price to previous price
2. Find alerts where targetPrice >= newPrice
3. Check tier-based notification delay
4. Send notifications (email, push - planned)
5. Update Alert.lastNotified

---

## Dealer Pipeline Details

### FeedIngest

Downloads and parses dealer feeds.

**Supported Formats**:
- CSV (with configurable column mapping)
- XML (product feeds)
- JSON (API responses)

**Access Types**:
- URL (HTTP/HTTPS)
- FTP (with credentials)
- Upload (manual file upload)

**Processing**:
1. Download feed (or use cached upload)
2. Parse based on formatType
3. Validate required fields
4. Create/update DealerSku records
5. Trigger SkuMatch job

### SkuMatch

Matches dealer SKUs to canonical products using optimized batch operations.

**Confidence Levels**:

| Level | Criteria |
|-------|----------|
| HIGH | UPC + Brand + Pack size all match |
| MEDIUM | Caliber + Brand + Attributes match (no UPC) |
| LOW | Partial match, flagged for review |
| NONE | Cannot match, excluded from benchmarks |

**Matching Strategy**:
1. Try exact UPC match (O(1) via Map lookup)
2. Try attribute match using composite key `caliber|brand` (O(1) via Map lookup)
3. Flag low-confidence matches for manual review

**Performance Optimization (v2.0)**:

The SKU match worker was optimized from O(n²) to O(n) complexity:

| Approach | 5,000 SKUs | Queries |
|----------|------------|---------|
| **Before** (sequential) | ~105s | ~26,500 |
| **After** (batch + Maps) | ~5s | ~30 |

**Key Optimizations**:
- **Batch fetch**: Load all dealer SKUs in single query
- **Pre-built lookup Maps**: UPC map and attribute map built once
- **O(1) matching**: Map.get() instead of database queries per SKU
- **Batch creates**: `prisma.canonicalSku.createMany()` for new canonicals
- **Batch updates**: Single transaction for all DealerSku updates

```typescript
// Batch processing pattern
const upcMap = await buildUpcLookupMap(upcs)           // Single query
const attrMap = await buildAttributeLookupMap(...)     // Single query

for (const sku of dealerSkus) {
  const match = upcMap.get(sku.upc) ||                 // O(1)
                attrMap.get(`${caliber}|${brand}`)     // O(1)
}

await batchUpdateDealerSkus(updates)                   // Single transaction
```

**Throughput Benchmarks**:

| Dealer Tier | SKUs | Total Time | Match Throughput |
|-------------|------|------------|------------------|
| Hobbyist | 150 | 5.12ms | 178K SKUs/sec |
| Serious | 800 | 9.79ms | 529K SKUs/sec |
| National | 3,000 | 31.96ms | 689K SKUs/sec |
| Top-Tier | 5,000 | 38.49ms | 1.02M SKUs/sec |

### Benchmark

Calculates market-wide price benchmarks.

**Metrics per Caliber**:
- Average price
- Median price
- Min/max price
- Average price per round
- SKU count
- Dealer count

**Update Frequency**: After each feed ingestion

### Insight

Generates actionable recommendations.

**Insight Types**:

| Type | Description |
|------|-------------|
| `OVERPRICED` | Dealer price significantly above market |
| `UNDERPRICED` | Opportunity to increase price |
| `STOCK_OPPORTUNITY` | High-demand items dealer is OOS |
| `ATTRIBUTE_GAP` | Missing data preventing benchmarks |

---

## Feed Processing Flow

```
1. Scheduler triggers at feed interval
2. FeedIngest downloads and parses feed
3. DealerSku records created/updated
4. SkuMatch attempts canonical matching
5. Benchmark recalculates market averages
6. Insight generates recommendations
```

### Subscription Check

Before processing dealer feeds, check subscription status:

```typescript
// In FeedIngest worker
const dealer = await prisma.dealer.findUnique({ where: { id: dealerId } });

// Check subscription allows processing
if (dealer.subscriptionStatus === 'SUSPENDED' ||
    dealer.subscriptionStatus === 'CANCELLED') {
  // Skip with SKIPPED status
  return { status: 'SKIPPED', reason: 'Subscription inactive' };
}

// Check if past grace period
if (dealer.subscriptionStatus === 'EXPIRED') {
  const gracePeriodEnd = addDays(dealer.subscriptionExpiresAt, dealer.subscriptionGraceDays);
  if (new Date() > gracePeriodEnd) {
    return { status: 'SKIPPED', reason: 'Past grace period' };
  }
}
```

---

## Job Data Structures

### Fetcher Job

```typescript
interface FetcherJob {
  sourceId: string;
  executionId: string;
}
```

### FeedIngest Job

```typescript
interface FeedIngestJob {
  feedId: string;
  dealerId: string;
  runId: string;
  adminOverride?: boolean;  // Bypass subscription check
}
```

---

## Error Handling

**Retry Strategy**:
- 3 attempts with exponential backoff
- Failed jobs moved to dead letter queue
- Errors logged to ExecutionLog

**Monitoring**:
- Queue depth tracking
- Failed job alerts
- Processing time metrics

---

## Environment Variables

```env
# Redis
REDIS_HOST="localhost"
REDIS_PORT=6379

# Database
DATABASE_URL="postgresql://..."

# Playwright (for JS_RENDERED sources)
PLAYWRIGHT_BROWSERS_PATH="/path/to/browsers"
```

---

## Adding a New Worker

1. Create worker file in `src/workers/` or `src/dealer/`
2. Add queue name to `src/config/queues.ts`
3. Register in `src/worker.ts`
4. Define job interface
5. Implement job processor

```typescript
// src/workers/example.ts
import { Worker, Job } from 'bullmq';
import { redis } from '../config/redis';
import { QUEUES } from '../config/queues';

interface ExampleJob {
  data: string;
}

export function startExampleWorker() {
  const worker = new Worker<ExampleJob>(
    QUEUES.EXAMPLE,
    async (job: Job<ExampleJob>) => {
      console.log(`Processing: ${job.data.data}`);
      // ... process job
    },
    { connection: redis }
  );

  worker.on('completed', (job) => {
    console.log(`Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed:`, err);
  });

  return worker;
}
```

---

## Performance & Scaling

### Current Capacity

The harvester is optimized to handle 100+ dealers of various sizes:

| Dealer Distribution | Count | SKUs Each | Total |
|---------------------|-------|-----------|-------|
| Hobbyist | 40 | 150 | 6,000 |
| Serious | 35 | 800 | 28,000 |
| National | 20 | 3,000 | 60,000 |
| Top-Tier | 5 | 5,000 | 25,000 |
| **Total** | **100** | - | **119,000** |

### Feed-Level Change Detection

Skips processing when feed content hasn't changed:

```typescript
const contentHash = createHash('sha256').update(content).digest('hex')

if (feed?.feedHash === contentHash) {
  return { skipped: true, reason: 'no_changes' }
}
```

### Horizontal Scaling

BullMQ supports distributed workers automatically:

```
Redis Queue ←→ Harvester Instance 1 ←→ PostgreSQL
            ←→ Harvester Instance 2 ←↗
            ←→ Harvester Instance 3 ←↗
```

**Scale triggers**:
- Queue depth > 100 jobs consistently
- Worker CPU > 80%
- Any dealer processing > 30 seconds

### Testing Scale Performance

```bash
cd apps/harvester

# Run all tier tests
pnpm test -- --run scale-pipeline.test.ts

# Run specific tier only (Windows)
pnpm test -- --run --testNamePattern="Hobbyist Pipeline" scale-pipeline.test.ts

# Run bottleneck analysis
set RUN_BOTTLENECK=1 && pnpm test -- --run scale-pipeline.test.ts
```

See `docs/architecture/scaling-strategy.md` for detailed scaling roadmap.

---

*Last updated: December 16, 2025*
