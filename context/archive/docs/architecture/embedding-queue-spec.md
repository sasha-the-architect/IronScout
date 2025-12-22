# Embedding Queue Implementation Specification

This document details the implementation, operations, monitoring, and cost analysis for the embedding queue system needed to scale to 100+ dealers.

## 1. Current State vs. Target State

### Current State

```
Writer Worker → Product Created → embedding = NULL
                                      ↓
              Manual Admin Backfill (on-demand)
                                      ↓
                              Product Searchable
```

**Problem**: New products aren't searchable via semantic search until manually backfilled.

### Target State

```
Writer Worker → Product Created → embedding = NULL
                     ↓
              Queue Embedding Job (automatic)
                     ↓
         Embedding Worker (async, batched)
                     ↓
              Product Searchable (within minutes)
```

---

## 2. Implementation Changes

### 2.1 Schema Changes

```prisma
// packages/db/schema.prisma

model Product {
  // Existing fields...

  // NEW: Track embedding status
  embeddingStatus     EmbeddingStatus @default(PENDING)
  embeddingQueuedAt   DateTime?
  embeddingUpdatedAt  DateTime?
  embeddingError      String?

  // NEW: Semantic hash for change detection
  semanticHash        String?         @db.VarChar(64)

  @@index([embeddingStatus])
}

enum EmbeddingStatus {
  PENDING     // Needs embedding
  QUEUED      // In queue, waiting for processing
  PROCESSING  // Currently being processed
  COMPLETE    // Embedding generated
  FAILED      // Failed after retries
  SKIPPED     // Intentionally skipped (e.g., invalid product)
}
```

### 2.2 Queue Configuration

```typescript
// apps/harvester/src/config/queues.ts

export const QUEUE_NAMES = {
  // ... existing queues
  EMBEDDING: 'embedding',
} as const

export interface EmbeddingJobData {
  productIds: string[]
  priority: 'critical' | 'high' | 'normal' | 'low'
  source: 'new_product' | 'content_change' | 'manual_backfill' | 'retry'
  attemptNumber?: number
}

export const embeddingQueue = new Queue<EmbeddingJobData>(
  QUEUE_NAMES.EMBEDDING,
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 60000, // 1 minute initial delay
      },
      removeOnComplete: 1000,  // Keep last 1000 completed jobs
      removeOnFail: 5000,      // Keep last 5000 failed jobs for debugging
    },
  }
)
```

### 2.3 Embedding Worker

```typescript
// apps/harvester/src/embedding/worker.ts

import { Worker, Job } from 'bullmq'
import { prisma } from '@ironscout/db'
import { redisConnection } from '../config/redis'
import { QUEUE_NAMES, EmbeddingJobData } from '../config/queues'
import OpenAI from 'openai'
import { createHash } from 'crypto'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const EMBEDDING_MODEL = 'text-embedding-3-small'

// Rate limiting configuration
const RATE_LIMIT = {
  requestsPerMinute: 50,        // Conservative limit (OpenAI allows 3000 RPM)
  tokensPerMinute: 1_000_000,   // OpenAI limit is 1M TPM for this model
  batchSize: 100,               // Max texts per API call
  delayBetweenBatches: 1200,    // 1.2s delay = 50 req/min
}

// Metrics (in production, use Prometheus/Datadog)
const metrics = {
  processed: 0,
  failed: 0,
  tokensUsed: 0,
  apiCalls: 0,
  lastProcessedAt: null as Date | null,
}

export function buildProductText(product: {
  name: string
  description?: string | null
  brand?: string | null
  caliber?: string | null
  grainWeight?: number | null
  caseMaterial?: string | null
  purpose?: string | null
  category?: string | null
}): string {
  const parts: string[] = [product.name]

  if (product.brand) parts.push(`Brand: ${product.brand}`)
  if (product.caliber) parts.push(`Caliber: ${product.caliber}`)
  if (product.grainWeight) parts.push(`Grain weight: ${product.grainWeight}gr`)
  if (product.caseMaterial) parts.push(`Case: ${product.caseMaterial}`)
  if (product.purpose) {
    parts.push(`Use: ${product.purpose}`)
    // Semantic enrichment
    if (product.purpose === 'Defense') {
      parts.push('self-defense home protection carry concealed')
    } else if (product.purpose === 'Hunting') {
      parts.push('game hunting deer elk hog varmint')
    } else if (product.purpose === 'Target') {
      parts.push('target practice range training plinking competition')
    }
  }
  if (product.category) parts.push(`Category: ${product.category}`)
  if (product.description) parts.push(product.description)

  return parts.join('\n')
}

export function generateSemanticHash(product: {
  name: string
  description?: string | null
  brand?: string | null
  caliber?: string | null
  purpose?: string | null
  category?: string | null
}): string {
  const fields = [
    product.name,
    product.description || '',
    product.brand || '',
    product.caliber || '',
    product.purpose || '',
    product.category || '',
  ]
  return createHash('sha256').update(fields.join('|')).digest('hex')
}

async function processEmbeddingJob(job: Job<EmbeddingJobData>) {
  const { productIds, priority, source } = job.data
  const startTime = Date.now()

  console.log(`[Embedding] Processing ${productIds.length} products (${source}, ${priority})`)

  // Mark products as processing
  await prisma.product.updateMany({
    where: { id: { in: productIds } },
    data: { embeddingStatus: 'PROCESSING' },
  })

  // Fetch products
  const products = await prisma.$queryRaw<Array<{
    id: string
    name: string
    description: string | null
    brand: string | null
    caliber: string | null
    grainWeight: number | null
    caseMaterial: string | null
    purpose: string | null
    category: string | null
    semanticHash: string | null
  }>>`
    SELECT id, name, description, brand, caliber, "grainWeight",
           "caseMaterial", purpose, category, "semanticHash"
    FROM products
    WHERE id = ANY(${productIds})
  `

  // Filter out products that don't need embedding updates
  const needsEmbedding = products.filter(p => {
    const currentHash = generateSemanticHash(p)
    return p.semanticHash !== currentHash
  })

  if (needsEmbedding.length === 0) {
    console.log(`[Embedding] All ${products.length} products already up to date`)
    await prisma.product.updateMany({
      where: { id: { in: productIds } },
      data: { embeddingStatus: 'COMPLETE' },
    })
    return { processed: 0, skipped: products.length }
  }

  console.log(`[Embedding] ${needsEmbedding.length}/${products.length} need embedding updates`)

  let processed = 0
  let failed = 0

  // Process in batches
  for (let i = 0; i < needsEmbedding.length; i += RATE_LIMIT.batchSize) {
    const batch = needsEmbedding.slice(i, i + RATE_LIMIT.batchSize)
    const texts = batch.map(p => buildProductText(p))

    try {
      // Generate embeddings
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: texts,
      })

      metrics.apiCalls++
      metrics.tokensUsed += response.usage?.total_tokens || 0

      // Update products with embeddings
      for (let j = 0; j < batch.length; j++) {
        const product = batch[j]
        const embedding = response.data[j].embedding
        const semanticHash = generateSemanticHash(product)

        try {
          await prisma.$executeRaw`
            UPDATE products
            SET embedding = ${JSON.stringify(embedding)}::vector,
                "embeddingStatus" = 'COMPLETE',
                "embeddingUpdatedAt" = NOW(),
                "embeddingError" = NULL,
                "semanticHash" = ${semanticHash}
            WHERE id = ${product.id}
          `
          processed++
          metrics.processed++
        } catch (dbError) {
          console.error(`[Embedding] DB error for ${product.id}:`, dbError)
          await prisma.product.update({
            where: { id: product.id },
            data: {
              embeddingStatus: 'FAILED',
              embeddingError: String(dbError),
            },
          })
          failed++
          metrics.failed++
        }
      }

      // Rate limiting delay
      if (i + RATE_LIMIT.batchSize < needsEmbedding.length) {
        await new Promise(r => setTimeout(r, RATE_LIMIT.delayBetweenBatches))
      }

    } catch (apiError: any) {
      console.error(`[Embedding] OpenAI API error:`, apiError)

      // Mark batch as failed
      for (const product of batch) {
        await prisma.product.update({
          where: { id: product.id },
          data: {
            embeddingStatus: 'FAILED',
            embeddingError: apiError.message || 'OpenAI API error',
          },
        })
        failed++
        metrics.failed++
      }

      // If rate limited, throw to trigger retry with backoff
      if (apiError.status === 429) {
        throw new Error('Rate limited by OpenAI')
      }
    }
  }

  metrics.lastProcessedAt = new Date()
  const duration = Date.now() - startTime

  console.log(`[Embedding] Completed: ${processed} processed, ${failed} failed in ${duration}ms`)

  return {
    processed,
    failed,
    skipped: products.length - needsEmbedding.length,
    duration,
    tokensUsed: metrics.tokensUsed,
  }
}

// Worker instance
export const embeddingWorker = new Worker(
  QUEUE_NAMES.EMBEDDING,
  processEmbeddingJob,
  {
    connection: redisConnection,
    concurrency: 1, // Single concurrency to respect rate limits
    limiter: {
      max: 50,           // Max 50 jobs per minute
      duration: 60000,
    },
  }
)

embeddingWorker.on('completed', (job, result) => {
  console.log(`[Embedding] Job ${job.id} completed:`, result)
})

embeddingWorker.on('failed', (job, error) => {
  console.error(`[Embedding] Job ${job?.id} failed:`, error.message)
})

// Export metrics for monitoring
export function getEmbeddingMetrics() {
  return { ...metrics }
}
```

### 2.4 Integration with Writer Worker

```typescript
// apps/harvester/src/writer/index.ts

import { embeddingQueue } from '../config/queues'

// In the writer worker, after creating/updating a product:

// Queue embedding for new products
if (!existingProduct) {
  await embeddingQueue.add(
    'new-product',
    {
      productIds: [product.id],
      priority: 'normal',
      source: 'new_product',
    },
    {
      priority: 5, // Normal priority
      delay: 5000, // 5 second delay to batch nearby products
    }
  )
}

// Queue embedding for changed products (semantic content changed)
if (semanticContentChanged(existingProduct, newProductData)) {
  await embeddingQueue.add(
    'content-change',
    {
      productIds: [product.id],
      priority: 'low',
      source: 'content_change',
    },
    {
      priority: 10, // Lower priority than new products
    }
  )
}
```

### 2.5 Job Batching (Optimization)

```typescript
// apps/harvester/src/embedding/batcher.ts

import { embeddingQueue } from '../config/queues'

const pendingBatch: string[] = []
let batchTimer: NodeJS.Timeout | null = null
const BATCH_SIZE = 50
const BATCH_DELAY = 5000 // 5 seconds

export async function queueProductForEmbedding(
  productId: string,
  priority: 'critical' | 'high' | 'normal' | 'low' = 'normal',
  source: string = 'new_product'
) {
  pendingBatch.push(productId)

  // If batch is full, flush immediately
  if (pendingBatch.length >= BATCH_SIZE) {
    await flushBatch(priority, source)
    return
  }

  // Otherwise, set a timer to flush
  if (!batchTimer) {
    batchTimer = setTimeout(() => flushBatch(priority, source), BATCH_DELAY)
  }
}

async function flushBatch(priority: string, source: string) {
  if (batchTimer) {
    clearTimeout(batchTimer)
    batchTimer = null
  }

  if (pendingBatch.length === 0) return

  const productIds = [...pendingBatch]
  pendingBatch.length = 0

  await embeddingQueue.add(
    `batch-${Date.now()}`,
    {
      productIds,
      priority: priority as any,
      source: source as any,
    },
    {
      priority: priority === 'critical' ? 1 : priority === 'high' ? 3 : priority === 'normal' ? 5 : 10,
    }
  )

  console.log(`[Embedding Batcher] Queued ${productIds.length} products`)
}
```

---

## 3. Cost Analysis

### 3.1 OpenAI Pricing (text-embedding-3-small)

| Metric | Value |
|--------|-------|
| Price | $0.02 per 1M tokens |
| Avg tokens per product | ~150 tokens |
| Cost per product | $0.000003 |
| Cost per 1,000 products | $0.003 |

### 3.2 Steady-State Costs (100 Dealers)

```
100 dealers × 12 polls/hour × 24 hours = 28,800 feed processes/day
Assume 1% new products per feed = 288 new products/day needing embeddings

Daily cost: 288 × $0.000003 = $0.000864/day
Monthly cost: ~$0.03/month
```

**Conclusion**: Steady-state embedding costs are negligible (~$0.03/month).

### 3.3 Peak/Burst Costs

**Scenario: New large dealer onboarding (5,000 SKUs)**

```
5,000 products × 150 tokens = 750,000 tokens
Cost: 750,000 / 1,000,000 × $0.02 = $0.015
```

**Scenario: Full backfill (50,000 products)**

```
50,000 products × 150 tokens = 7,500,000 tokens
Cost: 7,500,000 / 1,000,000 × $0.02 = $0.15
```

### 3.4 Annual Cost Projection

| Scenario | Products/Year | Annual Cost |
|----------|---------------|-------------|
| Steady-state (100 dealers) | ~100,000 | $0.36 |
| With new dealer onboarding | ~200,000 | $0.72 |
| High churn/updates | ~500,000 | $1.80 |
| Full backfills (2x/year) | +100,000 | +$0.30 |
| **Total estimated** | - | **< $5/year** |

**Conclusion**: OpenAI embedding costs are not a concern. Even at 10x scale, costs remain under $50/year.

---

## 4. Operations & Monitoring

### 4.1 Health Checks

```typescript
// apps/api/src/routes/health.ts

router.get('/health/embedding', async (req, res) => {
  const queueStats = await embeddingQueue.getJobCounts()
  const metrics = getEmbeddingMetrics()

  // Check for problems
  const problems: string[] = []

  if (queueStats.waiting > 1000) {
    problems.push(`High queue depth: ${queueStats.waiting} waiting`)
  }

  if (queueStats.failed > 100) {
    problems.push(`High failure count: ${queueStats.failed} failed`)
  }

  // Check for stale processing
  if (metrics.lastProcessedAt) {
    const staleness = Date.now() - metrics.lastProcessedAt.getTime()
    if (staleness > 600000) { // 10 minutes
      problems.push(`Worker may be stalled: ${staleness}ms since last processing`)
    }
  }

  const status = problems.length === 0 ? 'healthy' : 'degraded'

  res.json({
    status,
    problems,
    queue: queueStats,
    metrics: {
      processed: metrics.processed,
      failed: metrics.failed,
      tokensUsed: metrics.tokensUsed,
      apiCalls: metrics.apiCalls,
      lastProcessedAt: metrics.lastProcessedAt,
    },
  })
})
```

### 4.2 Admin Dashboard Metrics

```typescript
// apps/api/src/routes/search.ts (add to existing admin routes)

router.get('/admin/embedding-queue-stats', requireAdmin, async (req, res) => {
  const queueStats = await embeddingQueue.getJobCounts()

  // Get product embedding status breakdown
  const statusCounts = await prisma.$queryRaw<Array<{
    status: string
    count: bigint
  }>>`
    SELECT "embeddingStatus" as status, COUNT(*) as count
    FROM products
    GROUP BY "embeddingStatus"
  `

  // Get recent failures
  const recentFailures = await prisma.product.findMany({
    where: {
      embeddingStatus: 'FAILED',
      updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    select: {
      id: true,
      name: true,
      embeddingError: true,
      updatedAt: true,
    },
    take: 20,
    orderBy: { updatedAt: 'desc' },
  })

  res.json({
    queue: queueStats,
    productStatus: statusCounts.map(s => ({
      status: s.status,
      count: Number(s.count),
    })),
    recentFailures,
  })
})
```

### 4.3 Alerting Rules

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Queue depth (waiting) | > 500 | > 2000 | Scale workers or investigate |
| Queue depth (failed) | > 50 | > 200 | Check OpenAI API status, review errors |
| Processing rate | < 10/min | < 1/min | Check worker health |
| API error rate | > 5% | > 20% | Check OpenAI status, API key |
| Worker staleness | > 10 min | > 30 min | Restart worker |

### 4.4 Operational Runbook

**Daily Checks:**
1. Review `/health/embedding` endpoint status
2. Check queue depth (should be < 100 in steady state)
3. Review failed job count

**Weekly Checks:**
1. Review products with `embeddingStatus = 'FAILED'`
2. Check token usage trends
3. Verify embedding coverage percentage

**Incident Response:**

**High Queue Depth:**
```bash
# Check queue status
curl http://localhost:8000/api/search/admin/embedding-queue-stats

# If backlogged, temporarily increase concurrency
# (modify worker config or scale horizontally)
```

**High Failure Rate:**
```bash
# Check recent failures
curl http://localhost:8000/api/search/admin/embedding-queue-stats | jq '.recentFailures'

# Common causes:
# - OpenAI rate limiting → Reduce batch size or add delays
# - OpenAI API outage → Wait and retry
# - Invalid product data → Fix data, re-queue
```

**Retry Failed Jobs:**
```typescript
// Admin endpoint to retry failed embeddings
router.post('/admin/retry-failed-embeddings', requireAdmin, async (req, res) => {
  const failed = await prisma.product.findMany({
    where: { embeddingStatus: 'FAILED' },
    select: { id: true },
    take: 1000,
  })

  if (failed.length > 0) {
    await embeddingQueue.add('retry-failed', {
      productIds: failed.map(p => p.id),
      priority: 'low',
      source: 'retry',
    })
  }

  res.json({ queued: failed.length })
})
```

---

## 5. Scaling Considerations

### 5.1 Current Capacity

With single worker at 50 req/min, 100 texts/req:
- **Throughput**: 5,000 embeddings/minute = 300,000/hour
- **New dealer onboarding**: 5,000 SKUs in ~1 minute
- **Full backfill (50K)**: ~10 minutes

**Conclusion**: Single worker handles 100+ dealers easily.

### 5.2 When to Scale

Scale to multiple workers when:
- Queue depth consistently > 1,000
- New dealer onboarding takes > 5 minutes
- Processing rate drops below target

### 5.3 Horizontal Scaling

```typescript
// Multiple workers can process the same queue
// BullMQ handles distribution automatically

// Worker 1 config
const embeddingWorker1 = new Worker(QUEUE_NAMES.EMBEDDING, processEmbeddingJob, {
  connection: redisConnection,
  concurrency: 1,
  limiter: { max: 25, duration: 60000 }, // 25 req/min per worker
})

// Worker 2 config (same)
const embeddingWorker2 = new Worker(QUEUE_NAMES.EMBEDDING, processEmbeddingJob, {
  connection: redisConnection,
  concurrency: 1,
  limiter: { max: 25, duration: 60000 },
})

// Combined: 50 req/min across both workers
```

---

## 6. Implementation Checklist

### Phase 1: Schema & Queue Setup
- [ ] Add `embeddingStatus`, `embeddingQueuedAt`, `embeddingUpdatedAt`, `embeddingError`, `semanticHash` to Product model
- [ ] Run migration
- [ ] Add embedding queue to `queues.ts`
- [ ] Create embedding worker file

### Phase 2: Worker Implementation
- [ ] Implement `processEmbeddingJob` function
- [ ] Add rate limiting and batching
- [ ] Add metrics collection
- [ ] Register worker in `worker.ts`

### Phase 3: Integration
- [ ] Modify writer worker to queue new products
- [ ] Add batch aggregation for efficiency
- [ ] Test with small batch

### Phase 4: Monitoring
- [ ] Add `/health/embedding` endpoint
- [ ] Add admin stats endpoint
- [ ] Configure alerts
- [ ] Document runbook

### Phase 5: Rollout
- [ ] Deploy to staging
- [ ] Test with synthetic load
- [ ] Deploy to production
- [ ] Monitor for 1 week
- [ ] Run full backfill if needed

---

## 7. Summary

| Aspect | Details |
|--------|---------|
| **Estimated Cost** | < $5/year at 100 dealers |
| **Processing Time** | ~1 min per 5,000 products |
| **Queue Capacity** | 300K embeddings/hour single worker |
| **Key Metrics** | Queue depth, failure rate, processing rate |
| **Scale Trigger** | Queue depth > 1,000 consistently |

**OpenAI costs are NOT a concern**. The primary operational focus should be on:
1. Monitoring queue health
2. Handling API failures gracefully
3. Ensuring new products get embeddings within minutes

---

*Last updated: December 16, 2025*
