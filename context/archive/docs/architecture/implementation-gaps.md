# Implementation Gaps Analysis

This document consolidates identified gaps between the documented scaling strategy and actual implementation, along with impact assessment and recommended fixes.

**Source**: Issues identified during code review of dealer pipeline workers.

---

## Summary

| # | Issue | Location | Severity | Impact |
|---|-------|----------|----------|--------|
| 1 | Hash includes price → row churn | `feed-ingest.ts:154` | **HIGH** | Table bloat, lost mapping history, forces rematching |
| 2 | Sequential record processing (no batch/contentHash) | `feed-ingest.ts:303-339` | **HIGH** | O(n) DB hits, >30s at scale |
| 3 | Scheduler runs on every replica (no distributed lock) | `worker.ts:40`, `scheduler.ts` | **HIGH** | Duplicate feed runs, 3x load |
| 4 | Pipeline break: no benchmark/insight trigger after match | `sku-match.ts` / `scheduler.ts` | **MEDIUM** | 2-hour stale data gap |
| 5 | Benchmark 500-SKU batch limit (no pagination) | `benchmark.ts:257` | **MEDIUM** | >500 SKUs stay stale |
| 6 | Benchmark N+1 queries + snapshot bloat | `benchmark.ts:268-345` | **MEDIUM** | Per-SKU queries, pricingSnapshot row explosion |
| 7 | Insight fan-out with non-deduped jobIds | `benchmark.ts:357` | **MEDIUM** | Redundant insight jobs, contention |
| 8 | Insight O(n) round-trips | `insight.ts:394-399` | **MEDIUM** | Per-SKU benchmark fetch, >30s at 3-5k SKUs |
| 9 | No fetch timeout/size guard | `feed-ingest.ts:128-148` | **LOW** | Worker stalls on slow/hung endpoints |
| 10 | Scaling doc vs reality (documented features not implemented) | Multiple | **HIGH** | contentHash, batch ops, embedding queue missing |

---

## Issue 1: SKU Hash Includes Price → Row Churn

### Current Code (`feed-ingest.ts:154-167`)

```typescript
function generateSkuHash(title: string, upc?: string, sku?: string, price?: number): string {
  const components = [
    title.toLowerCase().trim(),
    upc || '',
    sku || '',
    price ? String(price) : '',  // ← PROBLEM: price in hash
  ]
  // ...
}
```

### Problem

When price changes (common - happens frequently), the hash changes, causing:
1. **New row created** instead of updating existing
2. **`updateMany` marks old row inactive** (line 342-349)
3. **Mapping history lost** - `canonicalSkuId` on old row, not new one
4. **Forces rematching** every time price changes
5. **Table bloat** - thousands of inactive rows per feed run

### Impact at Scale

```
5,000 SKUs × 10% price changes = 500 new rows + 500 marked inactive
100 dealers × 12 runs/hour × 24 hours = 28,800 feed runs/day
If 5% have price changes: ~72,000 orphaned rows/day
```

### Recommended Fix

```typescript
// Hash should identify the SKU, not its current state
function generateSkuHash(title: string, upc?: string, sku?: string): string {
  const components = [
    title.toLowerCase().trim(),
    upc || '',
    sku || '',
    // NO price - price is a state, not identity
  ]
  // ...
}

// Track state changes separately
function generateContentHash(record: ParsedRecord): string {
  // Hash ALL fields that affect processing
  return createHash('sha256').update([
    record.price,
    record.inStock,
    record.caliber,
    // ... other mutable fields
  ].join('|')).digest('hex')
}
```

---

## Issue 2: Sequential Record Processing (O(n) DB Hits)

### Current Code (`feed-ingest.ts:303-339`)

```typescript
for (const result of parseResult.parsedRecords) {
  // Each iteration: 1 upsert (DealerSku) or 1 upsert (QuarantinedRecord)
  const skuId = await processIndexableRecord(dealerId, feedId, feedRunId, result)
}
```

### Problem

- **5,000 SKUs = 5,000 individual DB operations**
- No row-level change detection - unchanged rows still hit DB
- No batch `createMany`/`updateMany`
- Contradicts scaling doc's differential update plan

### Impact at Scale

```
5,000 SKUs × ~5ms/upsert = 25 seconds (optimistic)
With network latency: 50+ seconds
Way over 30s target
```

### Recommended Fix

```typescript
// Step 1: Batch fetch existing SKUs
const existingSkus = await prisma.dealerSku.findMany({
  where: { dealerId, feedId },
  select: { id: true, dealerSkuHash: true, contentHash: true }
})
const existingMap = new Map(existingSkus.map(s => [s.dealerSkuHash, s]))

// Step 2: Partition into create/update/skip
const toCreate: SkuData[] = []
const toUpdate: { id: string; data: SkuData }[] = []
const unchanged: string[] = []

for (const result of parseResult.parsedRecords) {
  const skuHash = generateSkuHash(...)
  const contentHash = generateContentHash(result.record)
  const existing = existingMap.get(skuHash)

  if (!existing) {
    toCreate.push(buildSkuData(result))
  } else if (existing.contentHash !== contentHash) {
    toUpdate.push({ id: existing.id, data: buildSkuData(result) })
  } else {
    unchanged.push(existing.id)
  }
}

// Step 3: Batch operations
await prisma.dealerSku.createMany({ data: toCreate })
await prisma.$transaction(toUpdate.map(u =>
  prisma.dealerSku.update({ where: { id: u.id }, data: u.data })
))

console.log(`Created: ${toCreate.length}, Updated: ${toUpdate.length}, Skipped: ${unchanged.length}`)
```

---

## Issue 3: Scheduler Runs on Every Replica (Duplicate Jobs)

### Current Code (`worker.ts:40`)

```typescript
// worker.ts
startDealerScheduler()  // Called unconditionally on every worker
```

### Problem

With 3 harvester replicas:
- Each runs `scheduleDealerFeeds()` every 5 minutes
- `jobId: \`feed-${feed.id}-${now.getTime()}\`` - timestamp differs slightly per replica
- Same feed gets scheduled 3 times with different jobIds
- **3x duplicate feed runs and load**

### Impact at Scale

```
100 feeds × 3 replicas = 300 feed runs per cycle (should be 100)
```

### Recommended Fix

**Option A: Leader election (Redis-based)**

```typescript
import Redlock from 'redlock'

const redlock = new Redlock([redisClient])

async function runSchedulerWithLock() {
  try {
    const lock = await redlock.acquire(['scheduler:dealer-feeds'], 60000)
    try {
      await scheduleDealerFeeds()
    } finally {
      await lock.release()
    }
  } catch (err) {
    // Another instance has the lock - skip this cycle
  }
}
```

**Option B: Idempotent jobId (feed-based, not time-based)**

```typescript
// Use feed.nextRunAt or a deterministic time window
const windowStart = Math.floor(now.getTime() / (5 * 60 * 1000)) * (5 * 60 * 1000)
const jobId = `feed-${feed.id}-${windowStart}`  // Same across all replicas

await dealerFeedIngestQueue.add('ingest', data, {
  jobId,  // BullMQ dedupes by jobId
  ...
})
```

**Option C: Single scheduler instance**

```typescript
// Only start scheduler if SCHEDULER_ENABLED=true
if (process.env.SCHEDULER_ENABLED === 'true') {
  startDealerScheduler()
}
// Deploy one replica with SCHEDULER_ENABLED=true
```

---

## Issue 4: No Benchmark/Insight Trigger After Ingest

### Current Code

- `feed-ingest.ts` queues `sku-match` jobs (line 417-433)
- `sku-match.ts` does NOT queue benchmark jobs
- `scheduler.ts` runs benchmark every 2 hours (line 273-280)

### Problem

Fresh feed data waits up to 2 hours before benchmarks/insights update.
Documented flow: `ingest → match → benchmark → insight`
Actual flow: `ingest → match → (wait 2 hours) → benchmark → insight`

### Recommended Fix

```typescript
// In sku-match.ts, after processing completes:
await dealerBenchmarkQueue.add('incremental', {
  canonicalSkuIds: matchedCanonicalIds,  // Only recalc affected SKUs
}, {
  jobId: `benchmark-after-feed-${feedRunId}`,
  delay: 30000,  // 30s delay to batch multiple feeds
})
```

---

## Issue 5: Benchmark 500-SKU Batch Limit

### Current Code (`benchmark.ts:257-259`)

```typescript
const skus = await prisma.canonicalSku.findMany({
  // ...
  take: 500, // Process in batches
})
skuIds = skus.map(s => s.id)
```

### Problem

- Only processes first 500 stale SKUs per run
- No pagination/loop to process remaining
- With 5,000+ SKUs, many stay stale indefinitely

### Recommended Fix

```typescript
// Process ALL stale SKUs with pagination
let cursor: string | undefined
const batchSize = 500

while (true) {
  const skus = await prisma.canonicalSku.findMany({
    where: { /* stale conditions */ },
    take: batchSize,
    cursor: cursor ? { id: cursor } : undefined,
    skip: cursor ? 1 : 0,
  })

  if (skus.length === 0) break

  // Process batch...

  cursor = skus[skus.length - 1].id
}
```

---

## Issue 6: Benchmark N+1 Queries

### Current Code (`benchmark.ts:268-345`)

```typescript
for (const skuId of skuIds) {
  const result = await calculateBenchmark(skuId)  // Multiple queries per SKU
  await prisma.benchmark.upsert(...)              // 1 upsert per SKU

  const dealerSkus = await prisma.dealerSku.findMany(...)  // N+1
  for (const sku of dealerSkus) {
    await prisma.pricingSnapshot.create(...)  // N+1 creates
  }
}
```

### Problem

Per SKU:
- `collectDealerPrices()`: 2 queries
- `collectHarvesterPrices()`: 1 query
- `prisma.benchmark.upsert()`: 1 query
- `prisma.dealerSku.findMany()`: 1 query
- `prisma.pricingSnapshot.create()`: N queries

**500 SKUs × ~10 queries = 5,000+ DB operations**

### Recommended Fix

```typescript
// Batch load all data upfront
const allDealerSkus = await prisma.dealerSku.findMany({
  where: { canonicalSkuId: { in: skuIds }, isActive: true },
})
const dealerSkusByCanonical = groupBy(allDealerSkus, 'canonicalSkuId')

const allSnapshots = await prisma.pricingSnapshot.findMany({
  where: { canonicalSkuId: { in: skuIds }, createdAt: { gte: sevenDaysAgo } },
})
const snapshotsByCanonical = groupBy(allSnapshots, 'canonicalSkuId')

// Process in memory
const benchmarkUpserts = skuIds.map(skuId => ({
  where: { canonicalSkuId: skuId },
  create: calculateBenchmarkData(skuId, dealerSkusByCanonical[skuId], snapshotsByCanonical[skuId]),
  update: calculateBenchmarkData(...),
}))

// Batch upsert
await prisma.$transaction(benchmarkUpserts.map(u => prisma.benchmark.upsert(u)))

// Batch create snapshots
const newSnapshots = buildSnapshotData(...)
await prisma.pricingSnapshot.createMany({ data: newSnapshots })
```

---

## Issue 7: Insight Fan-Out with Non-Deduped JobIds

### Current Code (`benchmark.ts:349-360`)

```typescript
// Queue insight generation for affected dealers
for (const dealerId of dealersToNotify) {
  await dealerInsightQueue.add(
    'generate-insights',
    { dealerId },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      // Dedupe by dealerId
      jobId: `insight-${dealerId}-${Date.now()}`,  // ← PROBLEM: Date.now() makes each unique
    }
  )
}
```

### Problem

- `Date.now()` in jobId means every call creates a unique job
- A single benchmark run can queue multiple insight jobs for the same dealer
- **Causes redundant work and DB contention**
- Multiple concurrent insight jobs for same dealer = race conditions

### Recommended Fix

```typescript
// Use deterministic jobId without timestamp
jobId: `insight-${dealerId}`,  // BullMQ will skip if job already exists

// Or use a time window
const windowStart = Math.floor(Date.now() / (5 * 60 * 1000)) * (5 * 60 * 1000)
jobId: `insight-${dealerId}-${windowStart}`,
```

---

## Issue 8: Insight O(n) Round-Trips

### Current Code (`insight.ts:394-399`)

```typescript
for (const sku of skus) {
  activeSkuIds.push(sku.id)
  const skuInsights = await analyzeDealerSku(dealerId, sku)  // Queries per SKU
  allInsights.push(...skuInsights)
}
```

And `analyzeDealerSku()` calls:
```typescript
const benchmark = await prisma.benchmark.findUnique(...)  // Per SKU
```

And `saveInsights()`:
```typescript
for (const candidate of candidates) {
  const existing = await prisma.dealerInsight.findFirst(...)  // Per insight
  if (existing) {
    await prisma.dealerInsight.update(...)
  } else {
    await prisma.dealerInsight.create(...)
  }
}
```

### Problem

**3,000 SKUs × ~3 queries = 9,000+ DB operations**

### Recommended Fix

```typescript
// Batch load benchmarks
const benchmarks = await prisma.benchmark.findMany({
  where: { canonicalSkuId: { in: skus.map(s => s.canonicalSkuId).filter(Boolean) } },
})
const benchmarkMap = new Map(benchmarks.map(b => [b.canonicalSkuId, b]))

// Batch load existing insights
const existingInsights = await prisma.dealerInsight.findMany({
  where: { dealerId, isActive: true },
})
const insightMap = new Map(existingInsights.map(i => [`${i.type}-${i.dealerSkuId}`, i]))

// Process in memory
const insightsToCreate: InsightData[] = []
const insightsToUpdate: { id: string; data: InsightData }[] = []

for (const sku of skus) {
  const benchmark = benchmarkMap.get(sku.canonicalSkuId)
  const candidates = analyzeSkuInMemory(sku, benchmark)

  for (const candidate of candidates) {
    const key = `${candidate.type}-${sku.id}`
    const existing = insightMap.get(key)

    if (existing) {
      insightsToUpdate.push({ id: existing.id, data: candidate })
    } else {
      insightsToCreate.push(candidate)
    }
  }
}

// Batch operations
await prisma.dealerInsight.createMany({ data: insightsToCreate })
await prisma.$transaction(insightsToUpdate.map(u =>
  prisma.dealerInsight.update({ where: { id: u.id }, data: u.data })
))
```

---

## Issue 8: No Fetch Timeout/Size Guard

### Current Code (`feed-ingest.ts:128-148`)

```typescript
async function fetchFeed(url: string, ...): Promise<string> {
  const response = await fetch(url, { headers })  // No timeout
  return response.text()  // No size limit
}
```

### Problem

- Slow/hung endpoints occupy worker slot indefinitely
- Large responses can OOM the worker
- Only BullMQ retry, no fetch-level retry

### Recommended Fix

```typescript
async function fetchFeed(url: string, ...): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60000)  // 60s timeout

  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`Feed fetch failed: ${response.status}`)
    }

    // Size guard
    const contentLength = parseInt(response.headers.get('content-length') || '0')
    if (contentLength > 50 * 1024 * 1024) {  // 50MB limit
      throw new Error(`Feed too large: ${contentLength} bytes`)
    }

    return response.text()
  } finally {
    clearTimeout(timeout)
  }
}
```

---

## Issue 9: Scaling Doc vs Reality

### Gap Summary

| Documented Feature | Status |
|--------------------|--------|
| Row-level `contentHash` for change detection | ❌ Not implemented |
| `DealerSku.contentHash` column | ❌ Not in schema |
| Batch `createMany`/`updateMany` in feed-ingest | ❌ Sequential upserts |
| Embedding queue for new products | ❌ Manual backfill only |
| `Product.semanticHash` for embedding staleness | ❌ Not in schema |
| Deferred embedding worker | ❌ Not implemented |
| Distributed scheduler lock | ❌ Runs on all replicas |
| Pipeline continuity (ingest → match → benchmark → insight) | ❌ 2-hour gap |

---

## Recommended Implementation Priority

### Phase 1: Critical Fixes (Prevent Production Issues)

1. **Fix SKU hash** - Remove price from hash (1 hour)
2. **Fix scheduler duplication** - Add Redlock or idempotent jobId (2 hours)
3. **Add fetch timeout** - 60s timeout + size guard (30 min)

### Phase 2: Performance Fixes (Meet 30s Target)

4. **Batch feed-ingest** - Replace sequential with batch operations (4-6 hours)
5. **Batch benchmark** - Preload data, batch upserts (3-4 hours)
6. **Batch insight** - Preload data, batch creates/updates (3-4 hours)

### Phase 3: Pipeline Completion

7. **Trigger benchmark after match** - Queue after sku-match (1 hour)
8. **Fix benchmark pagination** - Process all stale SKUs (1 hour)

### Phase 4: Embedding Queue

9. **Schema changes** - Add `embeddingStatus`, `semanticHash` (1 hour)
10. **Embedding worker** - Implement deferred queue (4-6 hours)
11. **Integration** - Writer queues new products (1 hour)

---

*Last updated: December 16, 2025*
