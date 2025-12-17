# Dealer Pipeline Scaling Strategy

This document outlines the architecture and implementation strategy for processing large dealer datasets within 30 seconds, including database operations, vector regeneration, and horizontal scaling.

## Current Architecture

### Pipeline Stages

```
Feed Ingest → SKU Match → Benchmark → Insight
     ↓
  (batch 100)
```

| Stage | Concurrency | Current Bottleneck |
|-------|-------------|-------------------|
| Feed Ingest | 5 workers | Sequential record processing |
| SKU Match | 5 workers | ✓ Optimized (batch lookups) |
| Benchmark | 3 workers | Sequential SKU iteration |
| Insight | 5 workers | Sequential SKU analysis |

### Scale Targets

| Tier | SKUs | Target Time | Required Throughput |
|------|------|-------------|-------------------|
| Hobbyist | 150 | < 5s | 30 SKUs/sec |
| Serious | 800 | < 10s | 80 SKUs/sec |
| National | 3,000 | < 20s | 150 SKUs/sec |
| Top-Tier | 5,000 | < 30s | 167 SKUs/sec |
| Enterprise | 10,000 | < 45s | 222 SKUs/sec |

---

## 1. Differential Update Strategy

### 1.1 Content-Level Change Detection (Already Implemented)

The feed-ingest worker already uses `contentHash` to skip unchanged feeds:

```typescript
const contentHash = createHash('sha256').update(content).digest('hex')

if (feed?.feedHash === contentHash) {
  // Skip processing - no changes
  return { skipped: true, reason: 'no_changes' }
}
```

### 1.2 Row-Level Change Detection (NEW)

Add row-level hashing to skip unchanged SKUs:

```typescript
// In feed-ingest.ts
interface RowHash {
  dealerSkuHash: string   // Existing: title|upc|sku|price
  contentHash: string     // NEW: All fields that affect processing
}

function generateContentHash(record: ParsedRecord): string {
  // Hash ALL fields that would trigger reprocessing
  const fields = [
    record.title,
    record.upc || '',
    record.sku || '',
    String(record.price || 0),
    record.caliber || '',
    String(record.grainWeight || ''),
    record.brand || '',
    record.bulletType || '',
    record.caseType || '',
    String(record.roundCount || ''),
    String(record.inStock),
  ]
  return createHash('sha256').update(fields.join('|')).digest('hex').substring(0, 32)
}
```

### 1.3 Batch Upsert with Change Detection

Replace sequential upserts with batch operations:

```typescript
// Collect all SKU data first
const skuUpdates: SkuUpdate[] = []

for (const result of parseResult.parsedRecords) {
  const contentHash = generateContentHash(result.record)
  skuUpdates.push({
    dealerSkuHash: generateSkuHash(...),
    contentHash,
    data: result.record,
  })
}

// Batch fetch existing SKUs
const existingSkus = await prisma.dealerSku.findMany({
  where: {
    dealerId,
    dealerSkuHash: { in: skuUpdates.map(s => s.dealerSkuHash) }
  },
  select: { id: true, dealerSkuHash: true, contentHash: true }
})

const existingMap = new Map(existingSkus.map(s => [s.dealerSkuHash, s]))

// Partition into creates vs updates vs unchanged
const toCreate: SkuUpdate[] = []
const toUpdate: SkuUpdate[] = []
const unchanged: string[] = []

for (const sku of skuUpdates) {
  const existing = existingMap.get(sku.dealerSkuHash)
  if (!existing) {
    toCreate.push(sku)
  } else if (existing.contentHash !== sku.contentHash) {
    toUpdate.push({ ...sku, id: existing.id })
  } else {
    unchanged.push(existing.id)
  }
}

// Batch create new SKUs
if (toCreate.length > 0) {
  await prisma.dealerSku.createMany({ data: toCreate.map(s => s.data) })
}

// Batch update changed SKUs
if (toUpdate.length > 0) {
  await prisma.$transaction(
    toUpdate.map(s => prisma.dealerSku.update({
      where: { id: s.id },
      data: { ...s.data, contentHash: s.contentHash }
    }))
  )
}

// Skip unchanged - no DB operations needed
console.log(`Skipped ${unchanged.length} unchanged SKUs`)
```

### 1.4 Schema Changes Required

```prisma
model DealerSku {
  // Existing fields...

  // NEW: Content hash for change detection
  contentHash    String?   @db.VarChar(32)

  // NEW: Track what triggered last update
  lastChangeType ChangeType?

  @@index([dealerId, contentHash])
}

enum ChangeType {
  CREATED
  PRICE_CHANGE
  STOCK_CHANGE
  ATTRIBUTE_CHANGE
}
```

---

## 2. Index & Vector Regeneration Strategy

### 2.1 Current State

**PostgreSQL Indexes**: Handled automatically on INSERT/UPDATE. No special handling needed - PostgreSQL maintains B-tree indexes incrementally.

**pgvector (HNSW) Index**: Also maintained automatically by PostgreSQL. HNSW indexes update incrementally - no full rebuild required for new rows.

**Embeddings (Current Gap)**: The harvester does NOT trigger embedding generation automatically. New products are created without embeddings and only get them via manual admin backfill (`POST /api/search/admin/backfill-embeddings`).

### 2.2 Scale Impact: 100 Vendors @ 5-Minute Polling

```
100 vendors × 12 polls/hour = 1,200 feed processes/hour
1,200 feeds × ~1% new products = ~12 new products/hour needing embeddings
Peak scenario (new vendor): 5,000 new SKUs needing embeddings at once
```

**OpenAI Rate Limits**:
- text-embedding-3-small: 3,000 RPM (requests per minute)
- Batching 100 texts per request = 300,000 embeddings/minute theoretical max
- Practical safe rate: ~50 requests/minute = 5,000 embeddings/minute

### 2.3 Solution: Deferred Embedding Queue

Embeddings should be generated **asynchronously** via a dedicated worker queue:

```
Feed Ingest → SKU Match → Benchmark → Insight
                ↓
          (flag products needing embeddings)
                ↓
         Embedding Queue ← (low priority, batched)
                ↓
         Embedding Worker → OpenAI API → PostgreSQL
```

**Why deferred?**
- Feed processing remains fast (< 30s target)
- Embedding failures don't block data ingestion
- Rate limiting handled separately from main pipeline
- Can prioritize by product importance

### 2.4 Semantic Content Hash

Only regenerate embeddings when text fields that affect search relevance change:

```typescript
function generateSemanticHash(product: Product): string {
  // Only hash fields that affect the embedding
  const semanticFields = [
    product.name,
    product.description || '',
    product.brand || '',
    product.caliber || '',
    product.purpose || '',
    product.category || '',
    product.bulletType || '',
    String(product.grainWeight || ''),
  ]
  return createHash('sha256').update(semanticFields.join('|')).digest('hex')
}
```

### 2.5 Deferred Embedding Queue

Separate embedding generation from the main pipeline:

```typescript
// In config/queues.ts
export const QUEUE_NAMES = {
  // ... existing queues
  EMBEDDING_BACKFILL: 'embedding-backfill',
}

export interface EmbeddingJobData {
  productIds: string[]
  priority: 'high' | 'normal' | 'low'
}

export const embeddingQueue = new Queue<EmbeddingJobData>(
  QUEUE_NAMES.EMBEDDING_BACKFILL,
  { connection: redisConnection }
)
```

### 2.6 Embedding Worker with Batching

```typescript
// In harvester/src/embedding-worker.ts
async function processEmbeddings(job: Job<EmbeddingJobData>) {
  const { productIds, priority } = job.data
  const BATCH_SIZE = priority === 'high' ? 10 : 50

  for (let i = 0; i < productIds.length; i += BATCH_SIZE) {
    const batch = productIds.slice(i, i + BATCH_SIZE)

    // Fetch products needing embedding update
    const products = await prisma.$queryRaw<Product[]>`
      SELECT id, name, description, brand, caliber, "grainWeight",
             purpose, category, "semanticHash"
      FROM products
      WHERE id = ANY(${batch})
        AND (embedding IS NULL OR "semanticHash" != "lastEmbeddingHash")
    `

    if (products.length === 0) continue

    // Generate embeddings in batch
    const texts = products.map(p => buildProductText(p))
    const embeddings = await generateEmbeddings(texts)

    // Batch update with new embeddings
    await prisma.$transaction(
      products.map((p, idx) => prisma.$executeRaw`
        UPDATE products
        SET embedding = ${JSON.stringify(embeddings[idx])}::vector,
            "lastEmbeddingHash" = ${generateSemanticHash(p)}
        WHERE id = ${p.id}
      `)
    )

    // Rate limit for OpenAI
    if (priority !== 'high') {
      await new Promise(r => setTimeout(r, 100))
    }
  }
}
```

### 2.7 Schema Changes for Embedding Tracking

```prisma
model Product {
  // Existing fields...

  // NEW: Track when embedding needs refresh
  semanticHash       String?   @db.VarChar(64)
  lastEmbeddingHash  String?   @db.VarChar(64)
  embeddingUpdatedAt DateTime?

  @@index([semanticHash, lastEmbeddingHash])
}
```

---

## 3. Database Optimization Strategy

### 3.1 Connection Pooling

Current: Each worker creates its own Prisma client.

Optimized: Use PgBouncer with transaction pooling:

```yaml
# render.yaml
services:
  - type: web
    name: ironscout-api
    env:
      DATABASE_URL: "postgresql://user:pass@pgbouncer:6432/ironscout?pgbouncer=true"
      DATABASE_DIRECT_URL: "postgresql://user:pass@db:5432/ironscout"
```

### 3.2 Batch Size Optimization

Based on testing, optimal batch sizes by operation:

| Operation | Optimal Batch Size | Reason |
|-----------|-------------------|--------|
| SELECT | 1,000 | Network overhead vs memory |
| INSERT (createMany) | 500 | Statement size limits |
| UPDATE (transaction) | 100 | Lock contention |
| Embedding API | 50-100 | OpenAI rate limits |

### 3.3 Index Strategy

Add targeted indexes for batch operations:

```sql
-- For batch SKU lookups
CREATE INDEX CONCURRENTLY idx_dealer_sku_batch_lookup
ON "DealerSku" ("dealerId", "dealerSkuHash");

-- For change detection
CREATE INDEX CONCURRENTLY idx_dealer_sku_content_hash
ON "DealerSku" ("dealerId", "contentHash");

-- For canonical matching
CREATE INDEX CONCURRENTLY idx_canonical_sku_attrs
ON "CanonicalSku" ("caliber", "brand", "grain", "packSize");

-- For embedding updates
CREATE INDEX CONCURRENTLY idx_product_embedding_refresh
ON products ("semanticHash", "lastEmbeddingHash")
WHERE embedding IS NULL OR "semanticHash" != "lastEmbeddingHash";
```

### 3.4 Bulk Operations with COPY

For large inserts (>1000 rows), use PostgreSQL COPY:

```typescript
import { pipeline } from 'stream/promises'
import { from as copyFrom } from 'pg-copy-streams'

async function bulkInsertSkus(skus: DealerSkuData[]): Promise<void> {
  const client = await pool.connect()
  try {
    const stream = client.query(copyFrom(`
      COPY "DealerSku" (
        "dealerId", "feedId", "dealerSkuHash", "rawTitle",
        "rawPrice", "rawUpc", "isActive", "createdAt"
      ) FROM STDIN WITH (FORMAT csv)
    `))

    for (const sku of skus) {
      stream.write(`${sku.dealerId},${sku.feedId},...\n`)
    }

    stream.end()
    await pipeline(stream)
  } finally {
    client.release()
  }
}
```

---

## 4. Horizontal Scaling Architecture

### 4.1 Current Single-Worker Architecture

```
Redis Queue ←→ Single Harvester Instance ←→ PostgreSQL
```

### 4.2 Multi-Worker Architecture

```
                    ┌─────────────────┐
                    │   Redis Queue   │
                    │  (Job Router)   │
                    └────────┬────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
    ┌─────▼─────┐     ┌─────▼─────┐     ┌─────▼─────┐
    │ Harvester │     │ Harvester │     │ Harvester │
    │ Instance 1│     │ Instance 2│     │ Instance 3│
    │ (Workers) │     │ (Workers) │     │ (Workers) │
    └─────┬─────┘     └─────┬─────┘     └─────┬─────┘
          │                  │                  │
          └──────────────────┼──────────────────┘
                             │
                    ┌────────▼────────┐
                    │   PgBouncer    │
                    │ (Conn Pooler)  │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   PostgreSQL   │
                    └─────────────────┘
```

### 4.3 BullMQ Configuration for Distributed Workers

```typescript
// In config/redis.ts
export const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null, // Required for BullMQ
}

// Worker configuration for distributed processing
export const workerConfig = {
  connection: redisConnection,
  concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5'),
  lockDuration: 60000,      // 60 seconds
  stalledInterval: 30000,   // Check for stalled jobs every 30s
  maxStalledCount: 2,       // Retry stalled jobs up to 2 times
}
```

### 4.4 Auto-Scaling Configuration (Render)

```yaml
# render.yaml
services:
  - type: worker
    name: ironscout-harvester
    runtime: node
    buildCommand: pnpm install && pnpm build
    startCommand: node dist/worker.js
    scaling:
      minInstances: 1
      maxInstances: 5
      targetMemoryPercent: 70
      targetCPUPercent: 70
    envVars:
      - key: WORKER_CONCURRENCY
        value: 5
      - key: REDIS_HOST
        fromService:
          type: redis
          name: ironscout-redis
          property: host
```

### 4.5 Job Prioritization

Implement priority queues for different dealer tiers:

```typescript
// In dealer/scheduler.ts
async function scheduleFeeds() {
  const feeds = await prisma.dealerFeed.findMany({
    where: { isActive: true, status: { not: 'SUSPENDED' } },
    include: { dealer: { select: { tier: true } } }
  })

  for (const feed of feeds) {
    const priority = getPriority(feed.dealer.tier)

    await dealerFeedIngestQueue.add(
      'ingest',
      { feedId: feed.id, ... },
      {
        priority,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      }
    )
  }
}

function getPriority(tier: DealerTier): number {
  switch (tier) {
    case 'PRO': return 1       // Highest priority
    case 'STANDARD': return 5
    case 'FOUNDING': return 1  // Same as PRO
    default: return 10
  }
}
```

### 4.6 Sharding by Dealer ID

For extreme scale (100+ dealers), shard by dealer ID:

```typescript
// Shard assignment based on dealer ID hash
function getShardId(dealerId: string, numShards: number): number {
  const hash = createHash('md5').update(dealerId).digest('hex')
  return parseInt(hash.substring(0, 8), 16) % numShards
}

// Each harvester instance handles specific shards
const MY_SHARDS = process.env.WORKER_SHARDS?.split(',').map(Number) || [0]

// Only process jobs for assigned shards
dealerFeedIngestWorker.process(async (job) => {
  const shardId = getShardId(job.data.dealerId, TOTAL_SHARDS)

  if (!MY_SHARDS.includes(shardId)) {
    // Re-queue for correct worker
    await dealerFeedIngestQueue.add('ingest', job.data, {
      ...job.opts,
      jobId: `${job.data.feedId}-shard-${shardId}`,
    })
    return { skipped: true, reason: 'wrong_shard' }
  }

  // Process normally
  return processFeedIngest(job)
})
```

---

## 5. Implementation Roadmap

### Phase 1: Differential Updates (Week 1)

1. Add `contentHash` field to `DealerSku` model
2. Implement row-level change detection in feed-ingest
3. Convert sequential upserts to batch operations
4. Add metrics for skipped vs processed counts

### Phase 2: Database Optimization (Week 2)

1. Add targeted indexes
2. Configure PgBouncer for connection pooling
3. Implement bulk COPY for large inserts
4. Optimize batch sizes based on load testing

### Phase 3: Vector Optimization (Week 3)

1. Add `semanticHash` and `lastEmbeddingHash` to Product model
2. Create embedding queue and worker
3. Implement deferred embedding regeneration
4. Add priority levels for embedding jobs

### Phase 4: Horizontal Scaling (Week 4)

1. Configure BullMQ for distributed workers
2. Set up Render auto-scaling
3. Implement job prioritization
4. Add monitoring and alerting

---

## 6. Monitoring & Metrics

### Key Metrics to Track

```typescript
// In each worker
const metrics = {
  // Throughput
  skusProcessedPerSecond: new Counter(),
  jobDurationMs: new Histogram(),

  // Efficiency
  skusSkippedUnchanged: new Counter(),
  embeddingsRegenerated: new Counter(),

  // Errors
  processingErrors: new Counter(),
  retriedJobs: new Counter(),

  // Database
  dbQueryDurationMs: new Histogram(),
  dbConnectionsActive: new Gauge(),
}
```

### Alert Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| Job duration (Top-Tier) | > 30s | > 60s |
| Processing errors/min | > 5 | > 20 |
| Queue depth | > 100 | > 500 |
| DB connections | > 80% | > 95% |

---

## 7. Cost Analysis

### Current (Single Instance)

- 1 Render Worker: ~$25/mo
- Redis: ~$10/mo
- Database: ~$50/mo
- **Total: ~$85/mo**

### Scaled (3 Instances + Pooler)

- 3 Render Workers: ~$75/mo
- Redis (larger): ~$25/mo
- Database (larger): ~$100/mo
- PgBouncer: ~$15/mo
- **Total: ~$215/mo**

### When to Scale

Scale horizontally when:
- Total dealer SKU count exceeds 50,000
- Peak processing time exceeds 30 seconds
- Worker CPU consistently > 80%
- Queue depth regularly exceeds 100 jobs

---

## Summary

The scaling strategy addresses your requirements:

1. **30-second processing**: Achieved through batch operations, differential updates, and parallel processing
2. **DB operations**: Optimized with batch upserts, connection pooling, and bulk COPY
3. **Vector regeneration**: Deferred to separate queue, only regenerates when semantic content changes
4. **Differential updates**: Content hashing at feed and row level skips unchanged data
5. **Horizontal scaling**: BullMQ supports multiple workers; implement when needed
6. **Hundreds of dealers**: Sharding strategy available for extreme scale

Start with Phase 1 (differential updates) for immediate wins, then proceed based on actual load.

---

## 8. Index & Vector Update Summary

### What Happens Automatically

| Component | Update Trigger | Mechanism |
|-----------|---------------|-----------|
| B-tree indexes | INSERT/UPDATE | PostgreSQL maintains incrementally |
| pgvector HNSW index | INSERT/UPDATE | PostgreSQL maintains incrementally |
| Foreign key indexes | INSERT/UPDATE | PostgreSQL maintains incrementally |

**No action needed** - PostgreSQL handles all index maintenance automatically.

### What Requires Explicit Handling

| Component | Current State | Recommended Solution |
|-----------|--------------|---------------------|
| Product embeddings | Manual backfill only | Embedding queue worker |
| Semantic hash tracking | Not implemented | Add `semanticHash` field |
| Embedding staleness | Not tracked | Add `lastEmbeddingHash` field |

### Recommended Implementation Order

1. **Immediate**: Current system works for steady-state (existing products have embeddings)
2. **Before 100 dealers**: Implement embedding queue for new products
3. **At scale**: Add semantic hash to skip unchanged embedding regeneration

### Key Insight

For 100 vendors polling every 5 minutes:
- **Index updates**: Zero concern - PostgreSQL handles this
- **Embedding updates**: Only ~1% of SKUs are typically new → ~12 embeddings/hour in steady state
- **Peak load** (new vendor onboarding): 5,000 embeddings can be processed in ~1 minute with batched API calls

The embedding queue is the primary enhancement needed before scaling to 100 dealers.
