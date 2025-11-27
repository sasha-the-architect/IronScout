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
  type: 'RSS' | 'HTML' | 'JSON' | 'JS_RENDERED'
}

export interface ExtractJobData {
  executionId: string
  sourceId: string
  content: string
  sourceType: 'RSS' | 'HTML' | 'JSON' | 'JS_RENDERED'
}

export interface NormalizeJobData {
  executionId: string
  sourceId: string
  rawItems: any[]
}

export interface WriteJobData {
  executionId: string
  sourceId: string
  normalizedItems: NormalizedProduct[]
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

// Export all queues
export const queues = {
  crawl: crawlQueue,
  fetch: fetchQueue,
  extract: extractQueue,
  normalize: normalizeQueue,
  write: writeQueue,
  alert: alertQueue,
}
