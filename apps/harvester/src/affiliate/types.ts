/**
 * Type definitions for Affiliate Feed pipeline
 * Per spec: context/specs/affiliate-feeds-v1.md
 */

import type {
  affiliate_feeds,
  affiliate_feed_runs,
  source_products,
  source_product_presence,
  sources,
  retailers,
} from '@ironscout/db/generated/prisma'

// Re-export Prisma types for convenience
export type { affiliate_feeds, affiliate_feed_runs, source_products, source_product_presence }

// Type aliases for backwards compatibility
export type AffiliateFeed = affiliate_feeds
export type AffiliateFeedRun = affiliate_feed_runs
export type SourceProduct = source_products
export type SourceProductPresence = source_product_presence

/**
 * Feed with included relations for worker context
 * Note: Relation field names use snake_case per Prisma schema
 */
export type AffiliateFeedWithRelations = affiliate_feeds & {
  sources: sources & {
    retailers: retailers | null
  }
}

/**
 * Feed run context passed through the pipeline
 */
export interface FeedRunContext {
  feed: AffiliateFeedWithRelations
  run: AffiliateFeedRun
  t0: Date // Run start timestamp - used for all presence updates
  sourceId: string
  retailerId: string
}

/**
 * Result of FTP/SFTP download
 */
export interface DownloadResult {
  content: Buffer
  mtime: Date | null
  size: bigint
  contentHash: string
  skipped: boolean
  skippedReason?: 'UNCHANGED_HASH' | 'UNCHANGED_MTIME'
}

/**
 * Parsed product from feed
 */
export interface ParsedFeedProduct {
  // Required fields
  name: string
  url: string
  price: number
  inStock: boolean

  // Identity fields (priority: impactItemId > sku > upc > urlHash)
  impactItemId?: string
  sku?: string
  upc?: string

  // Optional fields
  imageUrl?: string
  description?: string
  brand?: string
  category?: string
  originalPrice?: number
  currency?: string

  // Raw row number for error reporting
  rowNumber: number
}

/**
 * Result of parsing the feed
 */
export interface ParseResult {
  products: ParsedFeedProduct[]
  rowsRead: number
  rowsParsed: number
  errors: ParseError[]
}

/**
 * Parse error with context
 */
export interface ParseError {
  code: string
  message: string
  rowNumber?: number
  sample?: Record<string, unknown>
}

/**
 * Result of Phase 1 processing (ingest + stage)
 */
export interface ProcessorResult {
  productsUpserted: number
  pricesWritten: number
  productsRejected: number
  duplicateKeyCount: number
  urlHashFallbackCount: number
  errors: ParseError[]
}

/**
 * Result of circuit breaker evaluation
 */
export interface CircuitBreakerResult {
  passed: boolean
  reason?: 'SPIKE_THRESHOLD_EXCEEDED' | 'DATA_QUALITY_URL_HASH_SPIKE'
  metrics: CircuitBreakerMetrics
}

/**
 * Metrics computed by circuit breaker
 */
export interface CircuitBreakerMetrics {
  activeCountBefore: number
  seenSuccessCount: number
  wouldExpireCount: number
  urlHashFallbackCount: number
  expiryPercentage: number
}

/**
 * Thresholds for circuit breaker (from spec)
 * Per spec Section 8.4.4 and Q7.2.2: 30% threshold
 */
export const CIRCUIT_BREAKER_THRESHOLDS = {
  // Maximum percentage of products that can expire in one run
  // Per spec Q7.2.2: Block if (wouldExpire / activeBefore) > 30% AND wouldExpire >= 10
  MAX_EXPIRY_PERCENTAGE: 30,
  // Minimum absolute expiry count to trigger percentage-based spike detection
  // Per spec Q7.2.2: Only block on percentage if wouldExpire >= 10
  MIN_EXPIRY_COUNT_FOR_SPIKE: 10,
  // Absolute expiry cap - block regardless of percentage
  // Per spec Q7.2.2: Block if wouldExpire >= 500 (catastrophic data loss prevention)
  ABSOLUTE_EXPIRY_CAP: 500,
  // If URL_HASH fallback rate exceeds this percentage, block promotion
  MAX_URL_HASH_FALLBACK_PERCENTAGE: 50,
  // Absolute URL_HASH cap - block regardless of percentage
  // Per spec Q6.1.5: Block if >1000 products use URL_HASH (data quality gate)
  ABSOLUTE_URL_HASH_CAP: 1000,
  // Minimum active products before applying percentage thresholds
  MIN_ACTIVE_FOR_PERCENTAGE_CHECK: 100,
} as const

/**
 * Error codes for affiliate feed runs (from spec)
 */
export const ERROR_CODES = {
  // Connection errors
  CONNECTION_FAILED: 'CONNECTION_FAILED',
  CONNECTION_TIMEOUT: 'CONNECTION_TIMEOUT',
  AUTH_FAILED: 'AUTH_FAILED',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',

  // Download errors
  DOWNLOAD_FAILED: 'DOWNLOAD_FAILED',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  DECOMPRESS_FAILED: 'DECOMPRESS_FAILED',

  // Parse errors
  PARSE_FAILED: 'PARSE_FAILED',
  INVALID_FORMAT: 'INVALID_FORMAT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  INVALID_PRICE: 'INVALID_PRICE',
  INVALID_URL: 'INVALID_URL',
  TOO_MANY_ROWS: 'TOO_MANY_ROWS',

  // Processing errors
  DUPLICATE_IDENTITY: 'DUPLICATE_IDENTITY',
  DATABASE_ERROR: 'DATABASE_ERROR',
  CIRCUIT_BREAKER_TRIGGERED: 'CIRCUIT_BREAKER_TRIGGERED',
  VALIDATION_FAILURE: 'VALIDATION_FAILURE',
  UPSERT_FAILURE: 'UPSERT_FAILURE',

  // General
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

/**
 * Run status values
 * Per spec Q8.2.3: No SKIPPED status - use SUCCEEDED + skippedReason instead
 */
export const RUN_STATUS = {
  RUNNING: 'RUNNING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
} as const

export type RunStatus = (typeof RUN_STATUS)[keyof typeof RUN_STATUS]

/**
 * Trigger types
 */
export const TRIGGER_TYPES = {
  SCHEDULED: 'SCHEDULED',
  MANUAL: 'MANUAL',
  MANUAL_PENDING: 'MANUAL_PENDING',
  ADMIN_TEST: 'ADMIN_TEST',
  RETRY: 'RETRY',
} as const

export type TriggerType = (typeof TRIGGER_TYPES)[keyof typeof TRIGGER_TYPES]

/**
 * Identity type priority (higher = better)
 * Per spec Section 8.3: IMPACT_ITEM_ID > SKU > URL_HASH
 * Note: UPC is not used for identity in v1 (stored on SourceProduct for reference only)
 */
export const IDENTITY_PRIORITY = {
  IMPACT_ITEM_ID: 3,
  SKU: 2,
  URL_HASH: 1,
} as const

export type IdentityType = keyof typeof IDENTITY_PRIORITY

/**
 * Error classification for retry decisions
 * Per spec Section 16.2
 */
export const FAILURE_KIND = {
  /** Transient errors - worth retrying (timeouts, 5xx, network resets) */
  TRANSIENT: 'TRANSIENT',
  /** Permanent errors - will not heal (404, invalid format, schema mismatch) */
  PERMANENT: 'PERMANENT',
  /** Config errors - requires manual fix (bad credentials, missing env) */
  CONFIG: 'CONFIG',
} as const

export type FailureKind = (typeof FAILURE_KIND)[keyof typeof FAILURE_KIND]

/**
 * Typed error for affiliate feed operations
 * Used to classify errors for retry decisions
 */
export class AffiliateFeedError extends Error {
  readonly kind: FailureKind
  readonly code: ErrorCode
  readonly details?: Record<string, unknown>
  readonly retryable: boolean

  constructor(
    message: string,
    kind: FailureKind,
    code: ErrorCode,
    details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'AffiliateFeedError'
    this.kind = kind
    this.code = code
    this.details = details
    this.retryable = kind === FAILURE_KIND.TRANSIENT
  }

  /**
   * Create from HTTP status code
   */
  static fromHttpStatus(status: number, message: string, details?: Record<string, unknown>): AffiliateFeedError {
    if (status === 401 || status === 403) {
      return new AffiliateFeedError(message, FAILURE_KIND.CONFIG, ERROR_CODES.AUTH_FAILED, details)
    }
    if (status === 404) {
      return new AffiliateFeedError(message, FAILURE_KIND.PERMANENT, ERROR_CODES.FILE_NOT_FOUND, details)
    }
    if (status === 400 || status === 422) {
      return new AffiliateFeedError(message, FAILURE_KIND.PERMANENT, ERROR_CODES.INVALID_FORMAT, details)
    }
    if (status === 408 || status === 429 || status >= 500) {
      return new AffiliateFeedError(message, FAILURE_KIND.TRANSIENT, ERROR_CODES.CONNECTION_FAILED, details)
    }
    return new AffiliateFeedError(message, FAILURE_KIND.PERMANENT, ERROR_CODES.DOWNLOAD_FAILED, details)
  }

  /**
   * Create from network error code
   */
  static fromNetworkError(code: string | undefined, message: string, details?: Record<string, unknown>): AffiliateFeedError {
    const transientCodes = ['ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND']
    if (code && transientCodes.includes(code)) {
      return new AffiliateFeedError(message, FAILURE_KIND.TRANSIENT, ERROR_CODES.CONNECTION_TIMEOUT, { ...details, networkCode: code })
    }
    return new AffiliateFeedError(message, FAILURE_KIND.PERMANENT, ERROR_CODES.CONNECTION_FAILED, { ...details, networkCode: code })
  }

  /**
   * Create config error (bad credentials, missing env, etc.)
   */
  static configError(message: string, code: ErrorCode = ERROR_CODES.AUTH_FAILED, details?: Record<string, unknown>): AffiliateFeedError {
    return new AffiliateFeedError(message, FAILURE_KIND.CONFIG, code, details)
  }

  /**
   * Create permanent error (will not heal)
   */
  static permanentError(message: string, code: ErrorCode, details?: Record<string, unknown>): AffiliateFeedError {
    return new AffiliateFeedError(message, FAILURE_KIND.PERMANENT, code, details)
  }

  /**
   * Create transient error (worth retrying)
   */
  static transientError(message: string, code: ErrorCode, details?: Record<string, unknown>): AffiliateFeedError {
    return new AffiliateFeedError(message, FAILURE_KIND.TRANSIENT, code, details)
  }
}
