import { Queue } from 'bullmq'
import { redisConnection } from './redis'
import { getQueueHistorySettings } from '@ironscout/db'

// Queue names
export const QUEUE_NAMES = {
  CRAWL: 'crawl',
  FETCH: 'fetch',
  EXTRACT: 'extract',
  NORMALIZE: 'normalize',
  WRITE: 'write',
  ALERT: 'alert',
  // Merchant Portal queues
  MERCHANT_FEED_INGEST: 'merchant-feed-ingest',
  MERCHANT_SKU_MATCH: 'merchant-sku-match',
  MERCHANT_BENCHMARK: 'merchant-benchmark',
  MERCHANT_INSIGHT: 'merchant-insight',
  // Affiliate Feed queues
  AFFILIATE_FEED: 'affiliate-feed',
  AFFILIATE_FEED_SCHEDULER: 'affiliate-feed-scheduler',
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
    console.error('[Queues] Failed to load history settings, using defaults:', error)
    queueHistorySettings = {
      retentionCount: 100,
      queues: {
        crawl: true,
        fetch: true,
        extract: true,
        normalize: true,
        write: true,
        alert: true,
        'merchant-feed-ingest': true,
        'merchant-sku-match': true,
        'merchant-benchmark': true,
        'merchant-insight': true,
        'affiliate-feed': true,
        'affiliate-feed-scheduler': true,
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
// MERCHANT PORTAL QUEUES
// ============================================================================

export interface MerchantFeedIngestJobData {
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

export interface MerchantSkuMatchJobData {
  retailerId: string
  feedRunId: string
  merchantSkuIds: string[] // Batch of SKU IDs to process
}

export interface MerchantBenchmarkJobData {
  canonicalSkuIds?: string[] // Optional: specific SKUs to recalculate
  fullRecalc?: boolean // If true, recalculate all benchmarks
}

export interface MerchantInsightJobData {
  merchantId: string
  merchantSkuIds?: string[] // Optional: specific SKUs to analyze
}

export const merchantFeedIngestQueue = new Queue<MerchantFeedIngestJobData>(
  QUEUE_NAMES.MERCHANT_FEED_INGEST,
  { connection: redisConnection, defaultJobOptions: getJobOptions('merchant-feed-ingest') }
)

export const merchantSkuMatchQueue = new Queue<MerchantSkuMatchJobData>(
  QUEUE_NAMES.MERCHANT_SKU_MATCH,
  { connection: redisConnection, defaultJobOptions: getJobOptions('merchant-sku-match') }
)

export const merchantBenchmarkQueue = new Queue<MerchantBenchmarkJobData>(
  QUEUE_NAMES.MERCHANT_BENCHMARK,
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000, // 5s, 15s, 45s
      },
      ...getJobOptions('merchant-benchmark'),
    },
  }
)

export const merchantInsightQueue = new Queue<MerchantInsightJobData>(
  QUEUE_NAMES.MERCHANT_INSIGHT,
  { connection: redisConnection, defaultJobOptions: getJobOptions('merchant-insight') }
)

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

// Export all queues
export const queues = {
  crawl: crawlQueue,
  fetch: fetchQueue,
  extract: extractQueue,
  normalize: normalizeQueue,
  write: writeQueue,
  alert: alertQueue,
  // Merchant queues
  merchantFeedIngest: merchantFeedIngestQueue,
  merchantSkuMatch: merchantSkuMatchQueue,
  merchantBenchmark: merchantBenchmarkQueue,
  merchantInsight: merchantInsightQueue,
  // Affiliate queues
  affiliateFeed: affiliateFeedQueue,
  affiliateFeedScheduler: affiliateFeedSchedulerQueue,
}
