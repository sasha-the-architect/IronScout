import { Queue } from 'bullmq'
import { redisConnection } from './redis'

// Queue names
export const QUEUE_NAMES = {
  CRAWL: 'crawl',
  FETCH: 'fetch',
  EXTRACT: 'extract',
  NORMALIZE: 'normalize',
  WRITE: 'write',
  ALERT: 'alert',
  // Dealer Portal queues
  DEALER_FEED_INGEST: 'dealer-feed-ingest',
  DEALER_SKU_MATCH: 'dealer-sku-match',
  DEALER_BENCHMARK: 'dealer-benchmark',
  DEALER_INSIGHT: 'dealer-insight',
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

// Create queues
export const crawlQueue = new Queue<CrawlJobData>(QUEUE_NAMES.CRAWL, {
  connection: redisConnection,
})

export const fetchQueue = new Queue<FetchJobData>(QUEUE_NAMES.FETCH, {
  connection: redisConnection,
})

export const extractQueue = new Queue<ExtractJobData>(QUEUE_NAMES.EXTRACT, {
  connection: redisConnection,
})

export const normalizeQueue = new Queue<NormalizeJobData>(QUEUE_NAMES.NORMALIZE, {
  connection: redisConnection,
})

export const writeQueue = new Queue<WriteJobData>(QUEUE_NAMES.WRITE, {
  connection: redisConnection,
})

export const alertQueue = new Queue<AlertJobData>(QUEUE_NAMES.ALERT, {
  connection: redisConnection,
})

// ============================================================================
// DEALER PORTAL QUEUES
// ============================================================================

export interface DealerFeedIngestJobData {
  dealerId: string
  feedId: string
  feedRunId: string
  accessType: 'URL' | 'AUTH_URL' | 'FTP' | 'SFTP' | 'UPLOAD'
  formatType: 'GENERIC' | 'AMMOSEEK_V1' | 'GUNENGINE_V2'
  url?: string
  username?: string
  password?: string
  // Admin override: bypass subscription check
  adminOverride?: boolean
  adminId?: string // For audit logging
}

export interface DealerSkuMatchJobData {
  dealerId: string
  feedRunId: string
  dealerSkuIds: string[] // Batch of SKU IDs to process
}

export interface DealerBenchmarkJobData {
  canonicalSkuIds?: string[] // Optional: specific SKUs to recalculate
  fullRecalc?: boolean // If true, recalculate all benchmarks
}

export interface DealerInsightJobData {
  dealerId: string
  dealerSkuIds?: string[] // Optional: specific SKUs to analyze
}

export const dealerFeedIngestQueue = new Queue<DealerFeedIngestJobData>(
  QUEUE_NAMES.DEALER_FEED_INGEST,
  { connection: redisConnection }
)

export const dealerSkuMatchQueue = new Queue<DealerSkuMatchJobData>(
  QUEUE_NAMES.DEALER_SKU_MATCH,
  { connection: redisConnection }
)

export const dealerBenchmarkQueue = new Queue<DealerBenchmarkJobData>(
  QUEUE_NAMES.DEALER_BENCHMARK,
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000, // 5s, 15s, 45s
      },
      removeOnComplete: 100, // Keep last 100 completed jobs
      removeOnFail: 500, // Keep last 500 failed jobs for debugging
    },
  }
)

export const dealerInsightQueue = new Queue<DealerInsightJobData>(
  QUEUE_NAMES.DEALER_INSIGHT,
  { connection: redisConnection }
)

// Export all queues
export const queues = {
  crawl: crawlQueue,
  fetch: fetchQueue,
  extract: extractQueue,
  normalize: normalizeQueue,
  write: writeQueue,
  alert: alertQueue,
  // Dealer queues
  dealerFeedIngest: dealerFeedIngestQueue,
  dealerSkuMatch: dealerSkuMatchQueue,
  dealerBenchmark: dealerBenchmarkQueue,
  dealerInsight: dealerInsightQueue,
}
