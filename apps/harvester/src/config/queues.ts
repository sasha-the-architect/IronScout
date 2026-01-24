import { Queue } from 'bullmq'
import { redisConnection } from './redis'
import { getQueueHistorySettings, prisma } from '@ironscout/db'
import { createId } from '@paralleldrive/cuid2'
import { rootLogger } from './logger'

// Queue names
export const QUEUE_NAMES = {
  CRAWL: 'crawl',
  FETCH: 'fetch',
  EXTRACT: 'extract',
  NORMALIZE: 'normalize',
  WRITE: 'write',
  ALERT: 'alert',
  // Retailer Portal queues
  RETAILER_FEED_INGEST: 'retailer-feed-ingest',
  // Note: sku-match, benchmark, insight queues removed for v1 (benchmark subsystem removed)
  // Affiliate Feed queues
  AFFILIATE_FEED: 'affiliate-feed',
  AFFILIATE_FEED_SCHEDULER: 'affiliate-feed-scheduler',
  // Product Resolver queue (Spec v1.2)
  PRODUCT_RESOLVE: 'product-resolve',
  // Embedding Generation queue
  EMBEDDING_GENERATE: 'embedding-generate',
  // Quarantine Reprocess queue (Admin-triggered bulk reprocessing)
  QUARANTINE_REPROCESS: 'quarantine-reprocess',
} as const

// Job data interfaces
export interface CrawlJobData {
  sourceId: string
  executionId: string
}

export interface FetchJobData {
  sourceId: string
  executionId: string
  url: string
  type: 'RSS' | 'HTML' | 'JSON' | 'JS_RENDERED' | 'FEED_CSV' | 'FEED_XML' | 'FEED_JSON'
}

export interface ExtractJobData {
  executionId: string
  sourceId: string
  content: string
  sourceType: 'RSS' | 'HTML' | 'JSON' | 'JS_RENDERED' | 'FEED_CSV' | 'FEED_XML' | 'FEED_JSON'
  contentHash?: string // Hash of fetched content for caching
}

export interface NormalizeJobData {
  executionId: string
  sourceId: string
  rawItems: any[]
  contentHash?: string // Hash to be stored after successful write
  chunkInfo?: { index: number; total: number; isLast: boolean } // For chunked processing
}

export interface WriteJobData {
  executionId: string
  sourceId: string
  normalizedItems: NormalizedProduct[]
  contentHash?: string // Hash to be stored after successful write
}

export interface AlertJobData {
  executionId: string
  productId: string
  oldPrice?: number
  newPrice?: number
  inStock?: boolean
}

export interface NormalizedProduct {
  name: string
  description?: string
  category: string
  brand?: string
  imageUrl?: string
  price: number
  currency: string
  url: string
  inStock: boolean
  retailerName: string
  retailerWebsite: string

  // Ammo-specific normalized fields
  productId: string      // Canonical product ID (UPC or hash-based)
  upc?: string          // Universal Product Code
  caliber?: string      // e.g., "9mm", ".223 Remington"
  grainWeight?: number  // Bullet weight in grains
  caseMaterial?: string // "Brass", "Steel", etc.
  purpose?: string      // "Target", "Defense", "Hunting", etc.
  roundCount?: number   // Rounds per box/case
}

// =============================================================================
// Queue History Settings (loaded from DB at startup)
// =============================================================================

let queueHistorySettings: { retentionCount: number; queues: Record<string, boolean> } | null = null

/**
 * Get job options for a queue based on settings
 */
function getJobOptions(queueName: string) {
  if (!queueHistorySettings) {
    // Fallback before settings are loaded
    return { removeOnComplete: 100, removeOnFail: 500 }
  }

  const historyEnabled = queueHistorySettings.queues[queueName] ?? true
  const count = queueHistorySettings.retentionCount

  return {
    removeOnComplete: historyEnabled ? count : true,
    removeOnFail: historyEnabled ? count * 5 : true, // Keep more failed jobs for debugging
  }
}

/**
 * Initialize queue history settings from database
 * Call this once at harvester startup
 */
export async function initQueueSettings(): Promise<void> {
  try {
    queueHistorySettings = await getQueueHistorySettings()
    console.log('[Queues] Loaded history settings:', {
      retentionCount: queueHistorySettings.retentionCount,
      enabledQueues: Object.entries(queueHistorySettings.queues)
        .filter(([, v]) => v)
        .map(([k]) => k),
    })
  } catch (error) {
    rootLogger.error(
      'Queue history settings load failed; using defaults',
      { retentionCount: 100 },
      error
    )
    queueHistorySettings = {
      retentionCount: 100,
      queues: {
        crawl: true,
        fetch: true,
        extract: true,
        normalize: true,
        write: true,
        alert: true,
        'retailer-feed-ingest': true,
        'affiliate-feed': true,
        'affiliate-feed-scheduler': true,
        'embedding-generate': true,
      },
    }
  }
}

// =============================================================================
// Create queues (with dynamic job options based on settings)
// =============================================================================

export const crawlQueue = new Queue<CrawlJobData>(QUEUE_NAMES.CRAWL, {
  connection: redisConnection,
  defaultJobOptions: getJobOptions('crawl'),
})

export const fetchQueue = new Queue<FetchJobData>(QUEUE_NAMES.FETCH, {
  connection: redisConnection,
  defaultJobOptions: getJobOptions('fetch'),
})

export const extractQueue = new Queue<ExtractJobData>(QUEUE_NAMES.EXTRACT, {
  connection: redisConnection,
  defaultJobOptions: getJobOptions('extract'),
})

export const normalizeQueue = new Queue<NormalizeJobData>(QUEUE_NAMES.NORMALIZE, {
  connection: redisConnection,
  defaultJobOptions: getJobOptions('normalize'),
})

export const writeQueue = new Queue<WriteJobData>(QUEUE_NAMES.WRITE, {
  connection: redisConnection,
  defaultJobOptions: getJobOptions('write'),
})

export const alertQueue = new Queue<AlertJobData>(QUEUE_NAMES.ALERT, {
  connection: redisConnection,
  defaultJobOptions: getJobOptions('alert'),
})

// ============================================================================
// RETAILER PORTAL QUEUES
// ============================================================================

export interface RetailerFeedIngestJobData {
  retailerId: string
  feedId: string
  feedRunId: string
  accessType: 'URL' | 'AUTH_URL' | 'FTP' | 'SFTP' | 'UPLOAD'
  formatType: 'GENERIC' | 'AMMOSEEK_V1' | 'GUNENGINE_V2' | 'IMPACT'
  url?: string
  username?: string
  password?: string
  // Admin override: bypass subscription check
  adminOverride?: boolean
  adminId?: string // For audit logging
}

// Note: RetailerSkuMatchJobData, RetailerBenchmarkJobData, RetailerInsightJobData removed for v1

export const retailerFeedIngestQueue = new Queue<RetailerFeedIngestJobData>(
  QUEUE_NAMES.RETAILER_FEED_INGEST,
  { connection: redisConnection, defaultJobOptions: getJobOptions('retailer-feed-ingest') }
)

// Note: retailerSkuMatchQueue, retailerBenchmarkQueue, retailerInsightQueue removed for v1

// ============================================================================
// AFFILIATE FEED QUEUES
// ============================================================================

export interface AffiliateFeedJobData {
  feedId: string
  trigger: 'SCHEDULED' | 'MANUAL' | 'MANUAL_PENDING' | 'ADMIN_TEST' | 'RETRY'
  // Per spec §6.4.1: Set after first lock acquisition, reused on retry
  runId?: string
  // Cached to avoid re-query on retry (stored as string for JSON serialization)
  feedLockId?: string
}

export interface AffiliateFeedSchedulerJobData {
  // Empty - scheduler tick job has no data
}

export const affiliateFeedQueue = new Queue<AffiliateFeedJobData>(
  QUEUE_NAMES.AFFILIATE_FEED,
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000, // 5s, 15s, 45s
      },
      ...getJobOptions('affiliate-feed'),
    },
  }
)

export const affiliateFeedSchedulerQueue = new Queue<AffiliateFeedSchedulerJobData>(
  QUEUE_NAMES.AFFILIATE_FEED_SCHEDULER,
  {
    connection: redisConnection,
    defaultJobOptions: getJobOptions('affiliate-feed-scheduler'),
  }
)

// ============================================================================
// PRODUCT RESOLVER QUEUE (Spec v1.2)
// ============================================================================

/**
 * Product Resolver job data
 * Per Spec v1.2 §0.3: Job contract for RESOLVE_SOURCE_PRODUCT
 */
export interface ProductResolveJobData {
  sourceProductId: string
  trigger: 'INGEST' | 'RECONCILE' | 'MANUAL'
  resolverVersion: string
  /** Originating feed run ID for log correlation (optional for RECONCILE/MANUAL) */
  affiliateFeedRunId?: string
}

/**
 * Product Resolver queue
 * Per Spec v1.2:
 * - JobId format: RESOLVE_SOURCE_PRODUCT_<sourceProductId>
 * - Retry: system errors only, max 3 attempts
 * - Debounce: 10-30s per sourceProductId (handled by jobId deduplication)
 */
export const productResolveQueue = new Queue<ProductResolveJobData>(
  QUEUE_NAMES.PRODUCT_RESOLVE,
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000, // 1s, 5s, 25s
      },
      ...getJobOptions('product-resolve'),
    },
  }
)

/**
 * Enqueue a product resolution job with database-level deduplication
 *
 * Per Spec v1.2 §0.3: JobId = RESOLVE_SOURCE_PRODUCT_<sourceProductId>
 *
 * Uses product_resolve_requests table as source of truth for dedup:
 * - Inserts new request if none exists
 * - Resets FAILED → PENDING for retry
 * - Ignores if already PENDING/PROCESSING/COMPLETED
 * - Only enqueues to BullMQ if row transitions to PENDING
 *
 * @param sourceProductId - The source product to resolve
 * @param sourceId - The source ID (for idempotencyKey)
 * @param identityKey - The identity key (for idempotencyKey)
 * @param trigger - What triggered the resolution
 * @param resolverVersion - Current resolver version
 * @param options - Optional delay
 * @returns Request ID if enqueued, null if deduplicated
 */
export async function enqueueProductResolve(
  sourceProductId: string,
  trigger: ProductResolveJobData['trigger'],
  resolverVersion: string,
  options?: { delay?: number; sourceId?: string; identityKey?: string; affiliateFeedRunId?: string }
): Promise<string | null> {
  // ADR-009: Fail-closed when sourceId is missing
  // sourceId has FK constraint to sources table, so 'unknown' will fail with 23503
  if (!options?.sourceId) {
    console.warn(
      '[enqueueProductResolve] Missing sourceId - skipping enqueue (ADR-009 fail-closed)',
      { sourceProductId, trigger }
    )
    return null
  }

  const sourceId = options.sourceId

  // Build idempotency key: sourceId:identityKey or fallback to sourceProductId
  const idempotencyKey = options.identityKey
    ? `${sourceId}:${options.identityKey}`
    : `sp:${sourceProductId}` // Fallback for backward compatibility

  try {
    // Atomic upsert with state machine logic
    // Only transitions FAILED → PENDING; ignores PENDING/PROCESSING/COMPLETED
    const result = await prisma.$queryRaw<Array<{ id: string; status: string; was_updated: boolean }>>`
      INSERT INTO "product_resolve_requests" (
        "id", "idempotencyKey", "sourceProductId", "sourceId",
        "status", "attempts", "createdAt", "updatedAt"
      )
      VALUES (
        ${createId()},
        ${idempotencyKey},
        ${sourceProductId},
        ${sourceId},
        'PENDING'::"ProductResolveRequestStatus",
        0,
        NOW(),
        NOW()
      )
      ON CONFLICT ("idempotencyKey") DO UPDATE
      SET
        "status" = CASE
          WHEN "product_resolve_requests"."status" = 'FAILED' THEN 'PENDING'::"ProductResolveRequestStatus"
          ELSE "product_resolve_requests"."status"
        END,
        "updatedAt" = NOW()
      RETURNING
        "id",
        "status"::text,
        (xmax = 0) AS was_inserted
    `

    if (result.length === 0) {
      return null // Should not happen
    }

    const { id: requestId, status } = result[0]

    // Only enqueue if status is now PENDING
    // (either new insert or FAILED → PENDING transition)
    if (status === 'PENDING') {
      // BullMQ doesn't allow colons in job IDs - use underscore instead
      const jobId = `RESOLVE_SOURCE_PRODUCT_${sourceProductId}`
      await productResolveQueue.add(
        'RESOLVE_SOURCE_PRODUCT',
        { sourceProductId, trigger, resolverVersion, affiliateFeedRunId: options?.affiliateFeedRunId },
        {
          jobId,
          delay: options?.delay ?? 10_000, // 10s debounce default
        }
      )
      return requestId
    }

    // Request exists in non-FAILED state, don't re-enqueue
    return null
  } catch (err) {
    // Log but don't throw - dedup failures shouldn't block price writes
    rootLogger.error(
      '[enqueueProductResolve] Failed to enqueue resolve request',
      { sourceProductId, trigger, sourceId },
      err
    )
    return null
  }
}

/**
 * Legacy enqueue function without database dedupe (for backward compatibility)
 * @deprecated Use enqueueProductResolve with sourceId and identityKey instead
 */
export async function enqueueProductResolveLegacy(
  sourceProductId: string,
  trigger: ProductResolveJobData['trigger'],
  resolverVersion: string,
  options?: { delay?: number }
): Promise<void> {
  // BullMQ doesn't allow colons in job IDs - use underscore instead
  const jobId = `RESOLVE_SOURCE_PRODUCT_${sourceProductId}`
  await productResolveQueue.add(
    'RESOLVE_SOURCE_PRODUCT',
    { sourceProductId, trigger, resolverVersion },
    {
      jobId,
      delay: options?.delay ?? 10_000,
    }
  )
}

// ============================================================================
// EMBEDDING GENERATION QUEUE
// ============================================================================

/**
 * Embedding Generation job data
 * Triggered after successful product resolution to generate vector embeddings
 */
export interface EmbeddingGenerateJobData {
  productId: string
  trigger: 'RESOLVE' | 'MANUAL' | 'BACKFILL'
  /** Resolver version that created/updated the product (for traceability) */
  resolverVersion?: string
  /** Originating feed run ID for log correlation */
  affiliateFeedRunId?: string
}

/**
 * Embedding Generation queue
 * - JobId format: EMBED_<productId> (dedup by productId)
 * - Retry: max 3 attempts with exponential backoff
 * - Lower concurrency than resolver (OpenAI API rate limits)
 */
export const embeddingGenerateQueue = new Queue<EmbeddingGenerateJobData>(
  QUEUE_NAMES.EMBEDDING_GENERATE,
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000, // 2s, 8s, 32s (longer delays for API rate limits)
      },
      ...getJobOptions('embedding-generate'),
    },
  }
)

/**
 * Enqueue an embedding generation job with deduplication by productId
 *
 * Uses jobId = EMBED_<productId> for BullMQ-level deduplication.
 * If a job for this product is already queued, it will be ignored.
 *
 * @param productId - The canonical product ID to generate embedding for
 * @param trigger - What triggered the embedding generation
 * @param options - Optional resolverVersion and affiliateFeedRunId for traceability
 * @returns true if enqueued, false if deduplicated
 */
export async function enqueueEmbeddingGenerate(
  productId: string,
  trigger: EmbeddingGenerateJobData['trigger'],
  options?: { resolverVersion?: string; affiliateFeedRunId?: string; delay?: number }
): Promise<boolean> {
  try {
    const jobId = `EMBED_${productId}`
    await embeddingGenerateQueue.add(
      'GENERATE_EMBEDDING',
      {
        productId,
        trigger,
        resolverVersion: options?.resolverVersion,
        affiliateFeedRunId: options?.affiliateFeedRunId,
      },
      {
        jobId,
        delay: options?.delay ?? 5_000, // 5s delay to let resolver batch settle
      }
    )
    return true
  } catch (err: any) {
    // Job with same ID already exists - this is expected deduplication
    if (err?.message?.includes('Job already exists')) {
      return false
    }
    rootLogger.error(
      '[enqueueEmbeddingGenerate] Failed to enqueue embedding job',
      { productId, trigger },
      err
    )
    return false
  }
}

// ============================================================================
// QUARANTINE REPROCESS QUEUE
// ============================================================================

/**
 * Quarantine Reprocess job data
 * Admin-triggered reprocessing of quarantined records
 */
export interface QuarantineReprocessJobData {
  /** ID of the quarantined record to reprocess */
  quarantineRecordId: string
  /** Feed type for routing to correct processor */
  feedType: 'AFFILIATE' | 'RETAILER'
  /** Admin user who triggered the reprocess (for audit) */
  triggeredBy: string
  /** Batch ID for grouping related reprocess jobs */
  batchId: string
}

/**
 * Quarantine Reprocess queue
 * - Processes quarantined records that admin has marked for reprocessing
 * - Validates records against current logic
 * - Creates source_products and enqueues for resolver if valid
 * - Updates quarantine status based on outcome
 */
export const quarantineReprocessQueue = new Queue<QuarantineReprocessJobData>(
  QUEUE_NAMES.QUARANTINE_REPROCESS,
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 2,
      backoff: {
        type: 'fixed',
        delay: 5000,
      },
      ...getJobOptions('quarantine-reprocess'),
    },
  }
)

/**
 * Enqueue quarantine records for reprocessing
 *
 * @param recordIds - Array of quarantined record IDs to reprocess
 * @param triggeredBy - Admin user email who triggered the reprocess
 * @returns Batch ID for tracking
 */
export async function enqueueQuarantineReprocess(
  records: Array<{ id: string; feedType: 'AFFILIATE' | 'RETAILER' }>,
  triggeredBy: string
): Promise<string> {
  const batchId = createId()

  const jobs = records.map((record) => ({
    name: 'REPROCESS_QUARANTINE',
    data: {
      quarantineRecordId: record.id,
      feedType: record.feedType,
      triggeredBy,
      batchId,
    } satisfies QuarantineReprocessJobData,
    opts: {
      jobId: `QUARANTINE_REPROCESS_${record.id}`,
    },
  }))

  await quarantineReprocessQueue.addBulk(jobs)
  return batchId
}

// Export all queues
export const queues = {
  crawl: crawlQueue,
  fetch: fetchQueue,
  extract: extractQueue,
  normalize: normalizeQueue,
  write: writeQueue,
  alert: alertQueue,
  // Retailer queues
  retailerFeedIngest: retailerFeedIngestQueue,
  // Note: retailerSkuMatch, retailerBenchmark, retailerInsight removed for v1
  // Affiliate queues
  affiliateFeed: affiliateFeedQueue,
  affiliateFeedScheduler: affiliateFeedSchedulerQueue,
  // Product Resolver queue
  productResolve: productResolveQueue,
  // Embedding Generation queue
  embeddingGenerate: embeddingGenerateQueue,
  // Quarantine Reprocess queue
  quarantineReprocess: quarantineReprocessQueue,
}

