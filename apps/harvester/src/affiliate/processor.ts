/**
 * Affiliate Feed Processor
 *
 * Phase 1: Ingest products and update lastSeenAt.
 * - Resolve identity (IMPACT_ITEM_ID > SKU > URL_HASH per spec)
 * - Upsert SourceProduct records (batched)
 * - Update SourceProductPresence.lastSeenAt (batched)
 * - Write Price records (append-only, batched)
 * - Record SourceProductSeen for circuit breaker (batched)
 *
 * Per spec Section 4.2.1 and 8.3: Batched processing with run-local cache.
 *
 * CRITICAL: Per spec §4.2.1, per-row DB reads are forbidden.
 * This implementation uses:
 * - Batch-fetch last prices using DISTINCT ON
 * - Run-local lastPriceCache maintained across chunks
 * - Bulk insert with ON CONFLICT DO NOTHING (partial unique index)
 * - Memory guard to prevent OOM on high-density feeds
 * - Actual row count from DB for accurate metrics
 */

import { prisma } from '@ironscout/db'
import { createHash } from 'crypto'
import { createId } from '@paralleldrive/cuid2'
import { logger } from '../config/logger'
import { computeUrlHash, normalizeUrl } from './parser'
import { ProductMatcher } from './product-matcher'
import { enqueueProductResolve, alertQueue, type AlertJobData } from '../config/queues'
import { RESOLVER_VERSION } from '../resolver'
import type {
  FeedRunContext,
  ParsedFeedProduct,
  ProcessorResult,
  ParseError,
  IdentityType,
} from './types'
import { ERROR_CODES, AffiliateFeedError } from './types'
import { emitIngestRunSummary } from '../config/ingest-summary'

const log = logger.affiliate

// Batch sizes for database operations
// Per spec §7.3: 500-5000 rows per batch (using 1000 as default)
const BATCH_SIZE = Number(process.env.AFFILIATE_BATCH_SIZE ?? 1000)

// Default limits per spec §7.3.1
const DEFAULT_MAX_ROW_COUNT = 500_000

// Heartbeat interval: write price even if unchanged after this duration
// Ensures price history shows "still at this price" confirmations
const HEARTBEAT_HOURS = Number(process.env.PRICE_HEARTBEAT_HOURS ?? 24)
const HEARTBEAT_MS = HEARTBEAT_HOURS * 60 * 60 * 1000

// ============================================================================
// TYPES
// ============================================================================

/** Cached last price entry for a sourceProduct */
export interface LastPriceEntry {
  sourceProductId: string
  priceSignatureHash: string
  createdAt: Date
  // Extended for alert detection (per affiliate-feed-alerts-v1 spec)
  // Nullable fields reflect DB reality per spec Known Limitations
  price: number
  inStock: boolean | null
  currency: string | null
}

/** New price record to insert */
interface NewPriceRecord {
  retailerId: string
  sourceProductId: string
  productId: string | null // FK to canonical product (from UPC matching)
  affiliateFeedRunId: string
  priceSignatureHash: string
  price: number
  currency: string
  url: string
  inStock: boolean
  originalPrice: number | null
  priceType: 'REGULAR' | 'SALE'
}

/**
 * Price change detected for alert queueing
 * Per affiliate-feed-alerts-v1 spec §3.3
 */
export interface AffiliatePriceChange {
  productId: string
  sourceProductId: string
  oldPrice: number
  newPrice: number
}

/**
 * Stock change detected for alert queueing
 * Per affiliate-feed-alerts-v1 spec §3.3
 */
export interface AffiliateStockChange {
  productId: string
  sourceProductId: string
  inStock: true // Only back-in-stock triggers alerts
}

/**
 * Skip counters for alert detection observability
 * Per affiliate-feed-alerts-v1 spec: Structured skip logging
 */
export interface AlertDetectionSkips {
  nullProductId: number
  noChange: number
  currencyMismatch: number
  unknownPriorState: number
}

/**
 * Result of alert change detection for a single product
 * Per affiliate-feed-alerts-v1 spec §6
 */
export interface AlertDetectionResult {
  priceChange: AffiliatePriceChange | null
  stockChange: AffiliateStockChange | null
  skipReason: 'NULL_PRODUCT_ID' | 'NEW_PRODUCT' | 'CURRENCY_MISMATCH' | 'UNKNOWN_PRIOR_STATE' | null
}

/**
 * Result of decidePriceWrites including change lists for alerts
 * Per affiliate-feed-alerts-v1 spec §3.4
 */
interface PriceWriteResult {
  pricesToWrite: NewPriceRecord[]
  priceChanges: AffiliatePriceChange[]
  stockChanges: AffiliateStockChange[]
  alertSkips: AlertDetectionSkips
}

/** Resolved identity for a product (canonical identity for backward compat) */
interface ResolvedIdentity {
  type: IdentityType
  value: string
}

/** Identifier extracted from a product for the new identifiers table */
interface ExtractedIdentifier {
  idType: 'NETWORK_ITEM_ID' | 'SKU' | 'UPC' | 'URL_HASH' | 'URL'
  idValue: string
  namespace: string // Empty string for no namespace (not null, for unique constraint compat)
  isCanonical: boolean
  normalizedValue: string | null
}

/** Product with resolved identity for batch processing */
interface ProductWithIdentity {
  product: ParsedFeedProduct
  identity: ResolvedIdentity
  identityKey: string
  allIdentifiers: ExtractedIdentifier[]
}

/** Result of upserting source products */
interface UpsertedSourceProduct {
  id: string
  identityKey: string
}

/**
 * Process parsed products in Phase 1
 *
 * Per spec §4.2.1: Uses batched processing with run-local cache
 * - Batch-fetch last prices (no per-row queries)
 * - Run-local lastPriceCache maintained across chunks
 * - Bulk insert with ON CONFLICT DO NOTHING
 * - Memory guard on unique products
 * - Actual row count from DB for accurate metrics
 *
 * Per spec §4.2.2: "Last row wins" deduplication
 * - Pre-scan to identify last occurrence of each identity
 * - Only process rows that are "winners" for their identity
 */
export async function processProducts(
  context: FeedRunContext,
  products: ParsedFeedProduct[]
): Promise<ProcessorResult> {
  const { feed, run, sourceId, retailerId, t0 } = context
  const maxRowCount = feed.maxRowCount ?? DEFAULT_MAX_ROW_COUNT

  log.info('PROCESS_START', {
    runId: run.id,
    feedId: feed.id,
    sourceId,
    retailerId,
    productCount: products.length,
    maxRowCount,
    batchSize: BATCH_SIZE,
    expectedBatches: Math.ceil(products.length / BATCH_SIZE),
    heartbeatHours: HEARTBEAT_HOURS,
  })

  let productsUpserted = 0
  let pricesWritten = 0
  let productsRejected = 0
  let productsQuarantined = 0
  let duplicateKeyCount = 0
  let urlHashFallbackCount = 0
  let productsMatched = 0
  let missingBrandCount = 0
  let missingRoundCountCount = 0
  const errors: ParseError[] = []

  // Run-local price cache - maintained across all chunks
  // Per spec §4.2.1: This prevents cross-chunk staleness
  const lastPriceCache = new Map<string, LastPriceEntry>()

  // Product matcher for UPC-based canonicalization
  // Creates/maintains run-local cache for efficient matching
  const productMatcher = new ProductMatcher()

  // ═══════════════════════════════════════════════════════════════════════════
  // PRE-SCAN: Identify "winning" row for each identity
  // Per spec §4.2.2: "Last row wins" - only process the last occurrence
  // This avoids processing duplicates across chunks and ensures consistency.
  // ═══════════════════════════════════════════════════════════════════════════
  log.debug('Starting identity pre-scan', { runId: run.id, productCount: products.length })
  const prescanStart = Date.now()
  const { winningRows, totalDuplicates, totalUrlHashFallbacks } = prescanIdentities(products)
  duplicateKeyCount = totalDuplicates
  urlHashFallbackCount = totalUrlHashFallbacks

  log.info('PRESCAN_OK', {
    runId: run.id,
    durationMs: Date.now() - prescanStart,
    totalRows: products.length,
    uniqueIdentities: winningRows.size,
    duplicatesSkipped: totalDuplicates,
    duplicatePercentage: products.length > 0 ? ((totalDuplicates / products.length) * 100).toFixed(2) : 0,
    urlHashFallbacks: totalUrlHashFallbacks,
    urlHashPercentage: products.length > 0 ? ((totalUrlHashFallbacks / products.length) * 100).toFixed(2) : 0,
  })

  // Process in chunks
  const totalChunks = Math.ceil(products.length / BATCH_SIZE)
  log.debug('Starting chunk processing', {
    runId: run.id,
    totalChunks,
    batchSize: BATCH_SIZE,
  })

  for (let chunkStart = 0; chunkStart < products.length; chunkStart += BATCH_SIZE) {
    const chunk = products.slice(chunkStart, chunkStart + BATCH_SIZE)
    const chunkNum = Math.floor(chunkStart / BATCH_SIZE) + 1
    const chunkStartTime = Date.now()

    log.debug('Processing chunk', {
      runId: run.id,
      chunkNum,
      totalChunks,
      chunkSize: chunk.length,
      chunkStartIndex: chunkStart,
    })

    try {
      // Step 1: Filter chunk to only include winning rows
      // Per spec §4.2.2: "Last row wins" - skip non-winning rows (duplicates)
      const deduped = filterToWinningRows(chunk, chunkStart, winningRows)

      log.debug('Chunk deduplication complete', {
        runId: run.id,
        chunkNum,
        originalSize: chunk.length,
        dedupedSize: deduped.length,
        duplicatesRemoved: chunk.length - deduped.length,
      })

      if (deduped.length === 0) {
        log.debug('Chunk skipped - all duplicates', { runId: run.id, chunkNum })
        continue
      }

      // Step 1b: Quarantine products missing caliber (trust-critical field)
      // Products without caliber can't be matched to canonical products effectively
      const { valid: validProducts, quarantined: toQuarantine } = filterMissingCaliber(deduped)

      // Track quality metrics (not blocking, just metrics)
      for (const { product } of deduped) {
        if (!product.brand) missingBrandCount++
        if (!product.roundCount) missingRoundCountCount++
      }

      // Quarantine products missing caliber
      if (toQuarantine.length > 0) {
        await batchQuarantineProducts(feed.id, run.id, sourceId, toQuarantine)
        productsQuarantined += toQuarantine.length

        log.info('QUARANTINE_BATCH', {
          runId: run.id,
          chunkNum,
          quarantinedCount: toQuarantine.length,
          reason: 'MISSING_CALIBER',
        })
      }

      if (validProducts.length === 0) {
        log.debug('Chunk skipped - all quarantined', { runId: run.id, chunkNum })
        continue
      }

      // Step 2: Batch upsert SourceProducts
      log.debug('Upserting source products', { runId: run.id, chunkNum, count: validProducts.length })
      const upsertStart = Date.now()
      const upsertedProducts = await batchUpsertSourceProducts(
        sourceId,
        validProducts,
        run.id
      )
      log.debug('Source products upserted', {
        runId: run.id,
        chunkNum,
        count: upsertedProducts.length,
        durationMs: Date.now() - upsertStart,
      })

      const sourceProductIds = upsertedProducts.map((sp) => sp.id)

      // Step 2b: Match source products to canonical products via UPC
      // Build lookup from identityKey to product (for UPC access)
      const identityKeyToProduct = new Map<string, ParsedFeedProduct>()
      for (const { product, identityKey } of validProducts) {
        identityKeyToProduct.set(identityKey, product)
      }

      // Build source products with UPCs for matching
      const sourceProductsForMatching = upsertedProducts.map((sp) => ({
        id: sp.id,
        upc: identityKeyToProduct.get(sp.identityKey)?.upc ?? null,
      }))

      log.debug('Matching source products to canonical products', {
        runId: run.id,
        chunkNum,
        count: sourceProductsForMatching.length,
      })
      const matchStart = Date.now()
      const matchResults = await productMatcher.batchMatchByUpc(sourceProductsForMatching)

      // Build lookup: sourceProductId -> productId for price writes
      const sourceProductIdToProductId = new Map<string, string | null>()
      // Build lookup: sourceProductId -> identityKey for resolver enqueue
      const sourceProductIdToIdentityKey = new Map<string, string>()
      for (const sp of upsertedProducts) {
        sourceProductIdToIdentityKey.set(sp.id, sp.identityKey)
      }

      const itemsNeedingResolver: Array<{ sourceProductId: string; identityKey: string }> = []
      let matchedCount = 0
      let linksWrittenCount = 0

      for (const result of matchResults) {
        sourceProductIdToProductId.set(result.sourceProductId, result.productId)
        if (result.productId) {
          matchedCount++
        }
        if (result.linkWritten) {
          linksWrittenCount++
        }
        if (result.needsResolver) {
          const identityKey = sourceProductIdToIdentityKey.get(result.sourceProductId)
          if (identityKey) {
            itemsNeedingResolver.push({ sourceProductId: result.sourceProductId, identityKey })
          }
        }
      }

      productsMatched += matchedCount

      // Enqueue resolver for unmatched items
      // Per hybrid architecture: ProductMatcher handles UPC hits, Resolver handles rest
      if (itemsNeedingResolver.length > 0) {
        const enqueueStart = Date.now()
        await Promise.all(
          itemsNeedingResolver.map(({ sourceProductId, identityKey }) =>
            enqueueProductResolve(sourceProductId, 'INGEST', RESOLVER_VERSION, {
              sourceId,
              identityKey,
              affiliateFeedRunId: run.id,
            })
          )
        )
        log.debug('RESOLVER_ENQUEUE_OK', {
          runId: run.id,
          chunkNum,
          enqueuedCount: itemsNeedingResolver.length,
          durationMs: Date.now() - enqueueStart,
        })
      }

      log.info('MATCH_OK', {
        runId: run.id,
        chunkNum,
        matchedCount,
        linksWrittenCount,
        unmatchedCount: sourceProductsForMatching.length - matchedCount,
        enqueuedForResolver: itemsNeedingResolver.length,
        durationMs: Date.now() - matchStart,
      })

      // Step 3: Batch update presence and seen records
      // Deduplicate sourceProductIds - multiple products may have resolved to the same ID
      // (e.g., due to identifier collision). Without dedup, ON CONFLICT fails with:
      // "ON CONFLICT DO UPDATE command cannot affect row a second time"
      const uniqueSourceProductIds = [...new Set(sourceProductIds)]
      log.debug('Updating presence and seen records', {
        runId: run.id,
        chunkNum,
        count: uniqueSourceProductIds.length,
        duplicatesRemoved: sourceProductIds.length - uniqueSourceProductIds.length,
      })
      const presenceStart = Date.now()
      await Promise.all([
        batchUpdatePresence(uniqueSourceProductIds, t0),
        batchRecordSeen(run.id, uniqueSourceProductIds),
      ])
      log.debug('Presence and seen records updated', {
        runId: run.id,
        chunkNum,
        durationMs: Date.now() - presenceStart,
      })

      // Step 4: Batch-fetch last prices for uncached IDs
      // Per spec §4.2.1: Only fetch for IDs not already in cache
      const uncachedIds = sourceProductIds.filter((id) => !lastPriceCache.has(id))
      if (uncachedIds.length > 0) {
        log.debug('Fetching last prices for uncached products', {
          runId: run.id,
          chunkNum,
          uncachedCount: uncachedIds.length,
          cachedCount: sourceProductIds.length - uncachedIds.length,
        })
        const fetchStart = Date.now()
        const fetchedPrices = await batchFetchLastPrices(uncachedIds)
        for (const lp of fetchedPrices) {
          lastPriceCache.set(lp.sourceProductId, lp)
        }
        log.debug('Last prices fetched', {
          runId: run.id,
          chunkNum,
          fetchedCount: fetchedPrices.length,
          durationMs: Date.now() - fetchStart,
        })
      } else {
        log.debug('All products in cache - skipping price fetch', { runId: run.id, chunkNum })
      }

      // ═══════════════════════════════════════════════════════════════════════
      // MEMORY GUARD: Abort if cache exceeds maxRowCount
      // Per spec §4.2.1: Prevents OOM from feeds with more unique products
      // than expected. The cache grows with unique products, not rows.
      // ═══════════════════════════════════════════════════════════════════════
      if (lastPriceCache.size > maxRowCount) {
        log.error('Memory guard triggered - unique product limit exceeded', {
          runId: run.id,
          chunkNum,
          cacheSize: lastPriceCache.size,
          maxRowCount,
        })
        throw AffiliateFeedError.permanentError(
          `Unique product limit exceeded: ${lastPriceCache.size} > ${maxRowCount}`,
          ERROR_CODES.TOO_MANY_ROWS,
          { cacheSize: lastPriceCache.size, maxRowCount }
        )
      }

      // Step 5: Decide writes in-memory and collect prices to insert
      // Per spec §4.2.1: No per-row DB reads - all decisions use cache
      // Per affiliate-feed-alerts-v1: Also returns price/stock changes for alerting
      log.debug('Deciding price writes', { runId: run.id, chunkNum, productCount: deduped.length })
      const { pricesToWrite, priceChanges, stockChanges } = decidePriceWrites(
        deduped,
        upsertedProducts,
        retailerId,
        run.id,
        t0,
        lastPriceCache,
        sourceProductIdToProductId
      )
      log.debug('Price write decisions made', {
        runId: run.id,
        chunkNum,
        pricesToWrite: pricesToWrite.length,
        priceChanges: priceChanges.length,
        stockChanges: stockChanges.length,
        skipped: deduped.length - pricesToWrite.length,
      })

      // Step 6: Bulk insert prices with ON CONFLICT DO NOTHING
      // Per spec §4.2.1: Use raw SQL with partial unique index for idempotency
      let actualInserted = 0
      if (pricesToWrite.length > 0) {
        log.debug('Inserting prices', { runId: run.id, chunkNum, count: pricesToWrite.length })
        const insertStart = Date.now()
        actualInserted = await bulkInsertPrices(pricesToWrite, t0)
        log.debug('Prices inserted', {
          runId: run.id,
          chunkNum,
          requested: pricesToWrite.length,
          actualInserted,
          duplicatesRejected: pricesToWrite.length - actualInserted,
          durationMs: Date.now() - insertStart,
        })

        // ═══════════════════════════════════════════════════════════════════════
        // Step 6b: Queue alerts AFTER successful price writes
        // Per affiliate-feed-alerts-v1 spec §4: Only enqueue after bulkInsertPrices succeeds
        // ═══════════════════════════════════════════════════════════════════════
        if (priceChanges.length > 0 || stockChanges.length > 0) {
          const alertStart = Date.now()
          const { priceDropsEnqueued, backInStockEnqueued } = await queueAffiliateAlerts(
            priceChanges,
            stockChanges,
            run.id
          )

          if (priceDropsEnqueued > 0 || backInStockEnqueued > 0) {
            log.info('AFFILIATE_ALERTS_ENQUEUED', {
              event_name: 'AFFILIATE_ALERTS_ENQUEUED',
              runId: run.id,
              chunkNum,
              priceDropsEnqueued,
              backInStockEnqueued,
              durationMs: Date.now() - alertStart,
            })
          }
        }

        // Update cache so later chunks see these writes
        // Per spec §4.2.1: Cache updated after each batch insert
        // Per affiliate-feed-alerts-v1: Include price, inStock, currency for change detection
        for (const price of pricesToWrite) {
          lastPriceCache.set(price.sourceProductId, {
            sourceProductId: price.sourceProductId,
            priceSignatureHash: price.priceSignatureHash,
            createdAt: t0,
            price: price.price,
            inStock: price.inStock,
            currency: price.currency,
          })
        }
      }

      productsUpserted += upsertedProducts.length
      pricesWritten += actualInserted

      const chunkDuration = Date.now() - chunkStartTime
      log.info('CHUNK_OK', {
        runId: run.id,
        chunkNum,
        totalChunks,
        chunkDurationMs: chunkDuration,
        productsUpserted: upsertedProducts.length,
        pricesWritten: actualInserted,
        cacheSize: lastPriceCache.size,
        percentComplete: ((chunkNum / totalChunks) * 100).toFixed(1),
      })
    } catch (err) {
      // Chunk failed - log error and continue with next chunk
      // Per spec §7.4: Partial failures keep successful data
      if (err instanceof AffiliateFeedError && err.code === ERROR_CODES.TOO_MANY_ROWS) {
        // Memory guard triggered - rethrow to abort entire run
        throw err
      }

      productsRejected += chunk.length
      const message = err instanceof Error ? err.message : 'Chunk processing error'
      errors.push({
        code: ERROR_CODES.DATABASE_ERROR,
        message: `Chunk ${chunkNum} failed: ${message}`,
        rowNumber: chunk[0]?.rowNumber,
        sample: { chunkSize: chunk.length },
      })

      log.error('Chunk processing failed', {
        runId: run.id,
        chunkNum,
        error: message,
      })
    }
  }

  // Log final progress
  const matcherStats = productMatcher.getStats()
  const totalDurationMs = Date.now() - t0.getTime()

  log.info('Processing complete', {
    runId: run.id,
    productsUpserted,
    pricesWritten,
    productsMatched,
    duplicateKeyCount,
    urlHashFallbackCount,
    errors: errors.length,
    uniqueProductsSeen: lastPriceCache.size,
    productMatchStats: matcherStats,
  })

  // Emit standardized INGEST_RUN_SUMMARY event
  // This provides a consistent format for monitoring across all pipelines
  emitIngestRunSummary({
    pipeline: 'AFFILIATE',
    runId: run.id,
    sourceId: sourceId,
    retailerId: retailerId,
    status: errors.length > 0 ? 'WARNING' : 'SUCCESS',
    durationMs: totalDurationMs,
    input: {
      totalRows: products.length,
    },
    output: {
      listingsCreated: productsUpserted - (matcherStats.cacheHits + matcherStats.matchesFound),
      listingsUpdated: matcherStats.cacheHits + matcherStats.matchesFound,
      pricesWritten,
      quarantined: productsQuarantined,
      rejected: productsRejected,
      matched: productsMatched,
      enqueuedForResolver: productsUpserted - productsMatched,
    },
    errors: {
      count: errors.length,
      primaryCode: errors.length > 0 ? errors[0].code : undefined,
    },
    deduplication: {
      duplicatesSkipped: duplicateKeyCount,
      urlHashFallbacks: urlHashFallbackCount,
    },
    qualityMetrics: {
      missingBrand: missingBrandCount,
      missingRoundCount: missingRoundCountCount,
    },
  })

  return {
    productsUpserted,
    pricesWritten,
    productsRejected,
    duplicateKeyCount,
    urlHashFallbackCount,
    errors,
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Resolve canonical identity for a product (backward compatibility)
 * Priority per spec: IMPACT_ITEM_ID > SKU > URL_HASH
 * Note: UPC is not used for canonical identity in v1 (stored for reference only)
 */
function resolveIdentity(product: ParsedFeedProduct): ResolvedIdentity {
  // IMPACT_ITEM_ID has highest priority
  if (product.impactItemId && product.impactItemId.trim()) {
    return { type: 'IMPACT_ITEM_ID', value: product.impactItemId.trim() }
  }

  // SKU is next
  if (product.sku && product.sku.trim()) {
    return { type: 'SKU', value: product.sku.trim() }
  }

  // Fallback to URL_HASH (UPC not used for identity in v1 per spec)
  const urlHash = computeUrlHash(product.url)
  return { type: 'URL_HASH', value: urlHash }
}

/**
 * Extract ALL identifiers from a product for the new identifiers table
 * This enables "find by any identifier" upsert strategy.
 *
 * Priority for canonical marking (highest wins):
 * 1. NETWORK_ITEM_ID (e.g., Impact's catalogItemId)
 * 2. SKU
 * 3. UPC
 * 4. URL_HASH
 */
function extractAllIdentifiers(product: ParsedFeedProduct): ExtractedIdentifier[] {
  const identifiers: ExtractedIdentifier[] = []
  const urlHash = computeUrlHash(product.url)

  // Determine canonical type based on priority
  let canonicalType: ExtractedIdentifier['idType'] | null = null
  if (product.impactItemId?.trim()) {
    canonicalType = 'NETWORK_ITEM_ID'
  } else if (product.sku?.trim()) {
    canonicalType = 'SKU'
  } else {
    canonicalType = 'URL_HASH'
  }

  // 1. Network Item ID (Impact's catalogItemId)
  if (product.impactItemId?.trim()) {
    identifiers.push({
      idType: 'NETWORK_ITEM_ID',
      idValue: product.impactItemId.trim(),
      namespace: 'IMPACT', // Hardcoded for now; will be dynamic per-feed later
      isCanonical: canonicalType === 'NETWORK_ITEM_ID',
      normalizedValue: product.impactItemId.trim().toUpperCase(),
    })
  }

  // 2. SKU (namespace empty string for consistency - PostgreSQL NULL != NULL in unique)
  if (product.sku?.trim()) {
    identifiers.push({
      idType: 'SKU',
      idValue: product.sku.trim(),
      namespace: '', // Empty string, not null (for unique constraint compatibility)
      isCanonical: canonicalType === 'SKU',
      normalizedValue: product.sku.trim().toUpperCase(),
    })
  }

  // 3. UPC (never canonical in current system, but useful for matching)
  if (product.upc?.trim()) {
    identifiers.push({
      idType: 'UPC',
      idValue: product.upc.trim(),
      namespace: '', // Empty string, not null
      isCanonical: false, // UPC is never canonical identity
      normalizedValue: product.upc.trim().replace(/^0+/, ''), // Strip leading zeros
    })
  }

  // 4. URL_HASH (fallback identity)
  identifiers.push({
    idType: 'URL_HASH',
    idValue: urlHash,
    namespace: '', // Empty string, not null
    isCanonical: canonicalType === 'URL_HASH',
    normalizedValue: urlHash,
  })

  // 5. URL (never canonical, but useful for lookups)
  const normalizedUrl = normalizeUrl(product.url)
  identifiers.push({
    idType: 'URL',
    idValue: product.url,
    namespace: '', // Empty string, not null
    isCanonical: false,
    normalizedValue: normalizedUrl,
  })

  return identifiers
}

/**
 * Compute price signature hash for deduplication
 */
function computePriceSignature(product: ParsedFeedProduct): string {
  const signatureData = JSON.stringify({
    price: product.price,
    currency: product.currency || 'USD',
    originalPrice: product.originalPrice,
  })
  return createHash('sha256').update(signatureData).digest('hex')
}

/**
 * Pre-scan all products to identify the "winning" row for each identity
 *
 * Per spec §4.2.2: "Last row wins" - when duplicate identities appear in a feed,
 * only the last occurrence should be processed. This pre-scan identifies which
 * row index wins for each identity, enabling efficient cross-batch deduplication.
 *
 * @returns Map of array index -> ProductWithIdentity for winning rows only
 */
function prescanIdentities(products: ParsedFeedProduct[]): {
  winningRows: Map<number, ProductWithIdentity>
  totalDuplicates: number
  totalUrlHashFallbacks: number
} {
  // Track last occurrence of each identity (identityKey -> array index)
  const lastOccurrence = new Map<string, number>()
  // Track identity info for each index
  const identityByIndex = new Map<number, {
    product: ParsedFeedProduct
    identity: ResolvedIdentity
    identityKey: string
    allIdentifiers: ExtractedIdentifier[]
  }>()
  let totalUrlHashFallbacks = 0

  // First pass: identify last occurrence of each identity
  for (let i = 0; i < products.length; i++) {
    const product = products[i]
    const identity = resolveIdentity(product)
    const identityKey = `${identity.type}:${identity.value}`
    const allIdentifiers = extractAllIdentifiers(product)

    if (identity.type === 'URL_HASH') {
      totalUrlHashFallbacks++
    }

    // Always update - "last row wins"
    lastOccurrence.set(identityKey, i)
    identityByIndex.set(i, { product, identity, identityKey, allIdentifiers })
  }

  // Second pass: build winning rows map (only indices that are the last occurrence)
  const winningRows = new Map<number, ProductWithIdentity>()
  const winningIdentities = new Set<string>()

  for (const [identityKey, winningIndex] of lastOccurrence) {
    const info = identityByIndex.get(winningIndex)!
    winningRows.set(winningIndex, {
      product: info.product,
      identity: info.identity,
      identityKey: info.identityKey,
      allIdentifiers: info.allIdentifiers,
    })
    winningIdentities.add(identityKey)
  }

  // Count duplicates: total rows - unique identities
  const totalDuplicates = products.length - winningIdentities.size

  return { winningRows, totalDuplicates, totalUrlHashFallbacks }
}

/**
 * Filter a chunk to only include winning rows
 *
 * Per spec §4.2.2: "Last row wins" - only process rows that are the last
 * occurrence of their identity across the entire feed.
 *
 * @param chunk - Products in this chunk
 * @param chunkStart - Starting index of this chunk in the full products array
 * @param winningRows - Map of array index -> ProductWithIdentity from prescan
 */
function filterToWinningRows(
  chunk: ParsedFeedProduct[],
  chunkStart: number,
  winningRows: Map<number, ProductWithIdentity>
): ProductWithIdentity[] {
  const result: ProductWithIdentity[] = []

  for (let i = 0; i < chunk.length; i++) {
    const globalIndex = chunkStart + i
    const winning = winningRows.get(globalIndex)

    if (winning) {
      result.push(winning)
    }
    // Non-winning rows are silently skipped (they're duplicates)
  }

  return result
}

/**
 * Filter out products missing caliber (trust-critical field).
 * Products without caliber cannot be effectively matched to canonical products.
 */
function filterMissingCaliber(
  products: ProductWithIdentity[]
): { valid: ProductWithIdentity[]; quarantined: ProductWithIdentity[] } {
  const valid: ProductWithIdentity[] = []
  const quarantined: ProductWithIdentity[] = []

  for (const p of products) {
    if (p.product.caliber) {
      valid.push(p)
    } else {
      quarantined.push(p)
    }
  }

  return { valid, quarantined }
}

/**
 * Batch quarantine products missing trust-critical fields.
 * Inserts records into unified quarantined_records table with feedType='AFFILIATE'.
 */
async function batchQuarantineProducts(
  feedId: string,
  runId: string,
  sourceId: string,
  products: ProductWithIdentity[]
): Promise<void> {
  if (products.length === 0) return

  const now = new Date()

  // Batch upsert quarantine records
  for (const p of products) {
    // Use identityKey as matchKey for deduplication
    const matchKey = p.identityKey

    await prisma.quarantined_records.upsert({
      where: {
        feedId_matchKey: {
          feedId,
          matchKey,
        },
      },
      create: {
        id: createId(),
        feedType: 'AFFILIATE',
        feedId,
        runId,
        sourceId,
        matchKey,
        rawData: {
          name: p.product.name,
          url: p.product.url,
          price: p.product.price,
          inStock: p.product.inStock,
          brand: p.product.brand,
          sku: p.product.sku,
          upc: p.product.upc,
          impactItemId: p.product.impactItemId,
          grainWeight: p.product.grainWeight,
          roundCount: p.product.roundCount,
        },
        blockingErrors: [{ code: 'MISSING_CALIBER', message: 'Product is missing caliber field' }],
        status: 'QUARANTINED',
        updatedAt: now,
      },
      update: {
        runId,
        rawData: {
          name: p.product.name,
          url: p.product.url,
          price: p.product.price,
          inStock: p.product.inStock,
          brand: p.product.brand,
          sku: p.product.sku,
          upc: p.product.upc,
          impactItemId: p.product.impactItemId,
          grainWeight: p.product.grainWeight,
          roundCount: p.product.roundCount,
        },
        blockingErrors: [{ code: 'MISSING_CALIBER', message: 'Product is missing caliber field' }],
        updatedAt: now,
      },
    })
  }
}

/**
 * Batch upsert SourceProducts using "find by any identifier" strategy
 *
 * Algorithm:
 * 1. Build candidate identifiers for each incoming product
 * 2. Query source_product_identifiers for matches within same source scope
 * 3. If match found, use that source_product_id
 * 4. If multiple matches return different source_product_ids, pick deterministic winner
 * 5. If no match, create new source_products row
 * 6. Insert any missing identifiers for that source_product_id
 * 7. Continue dual-writing to old columns for backward compatibility
 */
async function batchUpsertSourceProducts(
  sourceId: string,
  products: ProductWithIdentity[],
  runId: string
): Promise<UpsertedSourceProduct[]> {
  if (products.length === 0) return []

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: Build all candidate identifiers for lookup
  // ═══════════════════════════════════════════════════════════════════════════
  const allLookupIdentifiers: Array<{
    productIndex: number
    idType: string
    idValue: string
    namespace: string
  }> = []

  for (let i = 0; i < products.length; i++) {
    for (const id of products[i].allIdentifiers) {
      allLookupIdentifiers.push({
        productIndex: i,
        idType: id.idType,
        idValue: id.idValue,
        namespace: id.namespace,
      })
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: Query existing identifiers in one batch
  // We join with source_products to filter by sourceId (same source scope)
  // ═══════════════════════════════════════════════════════════════════════════
  const idTypes = allLookupIdentifiers.map((id) => id.idType)
  const idValues = allLookupIdentifiers.map((id) => id.idValue)
  const namespaces = allLookupIdentifiers.map((id) => id.namespace)

  const existingMatches = await prisma.$queryRaw<Array<{
    sourceProductId: string
    idType: string
    idValue: string
    namespace: string
  }>>`
    SELECT spi."sourceProductId", spi."idType"::text, spi."idValue", spi."namespace"
    FROM source_product_identifiers spi
    JOIN source_products sp ON sp.id = spi."sourceProductId"
    WHERE sp."sourceId" = ${sourceId}
      AND (spi."idType"::text, spi."idValue", spi."namespace") IN (
        SELECT
          unnest(${idTypes}::text[]),
          unnest(${idValues}::text[]),
          unnest(${namespaces}::text[])
      )
  `

  // Build lookup map: "idType:idValue:namespace" -> sourceProductId
  const identifierToSourceProductId = new Map<string, string>()
  for (const match of existingMatches) {
    const key = `${match.idType}:${match.idValue}:${match.namespace}`
    identifierToSourceProductId.set(key, match.sourceProductId)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: Resolve each product to existing or new source_product_id
  // ═══════════════════════════════════════════════════════════════════════════
  const productResolutions: Array<{
    productIndex: number
    existingSourceProductId: string | null
    matchedBy: string | null // For logging collision detection
    collisions: string[] // Multiple different source_product_ids found
  }> = []

  for (let i = 0; i < products.length; i++) {
    const product = products[i]
    const foundIds = new Set<string>()
    let matchedBy: string | null = null

    for (const id of product.allIdentifiers) {
      const key = `${id.idType}:${id.idValue}:${id.namespace}`
      const existingId = identifierToSourceProductId.get(key)
      if (existingId) {
        foundIds.add(existingId)
        if (!matchedBy) {
          matchedBy = key
        }
      }
    }

    const foundIdsArray = Array.from(foundIds)
    if (foundIdsArray.length > 1) {
      // Collision: multiple identifiers point to different source_products
      // Log for remediation and pick deterministic winner (first alphabetically)
      foundIdsArray.sort()
      log.warn('IDENTIFIER_COLLISION', {
        runId,
        productIndex: i,
        identityKey: product.identityKey,
        matchedSourceProductIds: foundIdsArray,
        selectedWinner: foundIdsArray[0],
      })
    }

    productResolutions.push({
      productIndex: i,
      existingSourceProductId: foundIdsArray[0] ?? null,
      matchedBy,
      collisions: foundIdsArray.length > 1 ? foundIdsArray : [],
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 4: Split into existing (update) vs new (insert)
  // ═══════════════════════════════════════════════════════════════════════════
  const toUpdate: Array<{ resolution: typeof productResolutions[0]; product: ProductWithIdentity }> = []
  const toInsert: Array<{ productIndex: number; product: ProductWithIdentity }> = []

  for (const resolution of productResolutions) {
    const product = products[resolution.productIndex]
    if (resolution.existingSourceProductId) {
      toUpdate.push({ resolution, product })
    } else {
      toInsert.push({ productIndex: resolution.productIndex, product })
    }
  }

  log.debug('Upsert resolution', {
    runId,
    total: products.length,
    existing: toUpdate.length,
    new: toInsert.length,
    collisions: productResolutions.filter((r) => r.collisions.length > 0).length,
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 5: Update existing source_products
  // ═══════════════════════════════════════════════════════════════════════════
  const results: UpsertedSourceProduct[] = []

  if (toUpdate.length > 0) {
    const updateIds = toUpdate.map((u) => u.resolution.existingSourceProductId!)
    const updateTitles = toUpdate.map((u) => u.product.product.name)
    const updateUrls = toUpdate.map((u) => u.product.product.url)
    const updateImageUrls = toUpdate.map((u) => u.product.product.imageUrl ?? null)
    const updateBrands = toUpdate.map((u) => u.product.product.brand ?? null)
    const updateDescriptions = toUpdate.map((u) => u.product.product.description ?? null)
    const updateCategories = toUpdate.map((u) => u.product.product.category ?? null)
    const updateNormalizedUrls = toUpdate.map((u) => normalizeUrl(u.product.product.url))
    const updateCalibers = toUpdate.map((u) => u.product.product.caliber ?? null)
    const updateGrainWeights = toUpdate.map((u) => u.product.product.grainWeight ?? null)
    const updateRoundCounts = toUpdate.map((u) => u.product.product.roundCount ?? null)

    // Batch update using unnest pattern
    // Note: brand/description/category are persisted for resolver fingerprinting
    await prisma.$executeRaw`
      UPDATE source_products AS sp SET
        "title" = u.title,
        "url" = u.url,
        "imageUrl" = u."imageUrl",
        "brand" = u.brand,
        "description" = u.description,
        "category" = u.category,
        "caliber" = u.caliber,
        "grainWeight" = u."grainWeight",
        "roundCount" = u."roundCount",
        "normalizedUrl" = u."normalizedUrl",
        "lastUpdatedByRunId" = ${runId},
        "updatedAt" = NOW()
      FROM (
        SELECT
          unnest(${updateIds}::text[]) AS id,
          unnest(${updateTitles}::text[]) AS title,
          unnest(${updateUrls}::text[]) AS url,
          unnest(${updateImageUrls}::text[]) AS "imageUrl",
          unnest(${updateBrands}::text[]) AS brand,
          unnest(${updateDescriptions}::text[]) AS description,
          unnest(${updateCategories}::text[]) AS category,
          unnest(${updateCalibers}::text[]) AS caliber,
          unnest(${updateGrainWeights}::int[]) AS "grainWeight",
          unnest(${updateRoundCounts}::int[]) AS "roundCount",
          unnest(${updateNormalizedUrls}::text[]) AS "normalizedUrl"
      ) AS u
      WHERE sp.id = u.id
    `

    // Add to results
    for (const u of toUpdate) {
      results.push({
        id: u.resolution.existingSourceProductId!,
        identityKey: u.product.identityKey,
      })
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 6: Insert new source_products
  // Generate IDs client-side so we can track them for identifier insertion
  // ═══════════════════════════════════════════════════════════════════════════
  if (toInsert.length > 0) {
    // Generate IDs client-side using cuid pattern (matches Prisma default)
    const insertIds = toInsert.map(() => createId())
    const insertIdentityKeys = toInsert.map((i) => i.product.identityKey)
    const insertTitles = toInsert.map((i) => i.product.product.name)
    const insertUrls = toInsert.map((i) => i.product.product.url)
    const insertImageUrls = toInsert.map((i) => i.product.product.imageUrl ?? null)
    const insertBrands = toInsert.map((i) => i.product.product.brand ?? null)
    const insertDescriptions = toInsert.map((i) => i.product.product.description ?? null)
    const insertCategories = toInsert.map((i) => i.product.product.category ?? null)
    const insertNormalizedUrls = toInsert.map((i) => normalizeUrl(i.product.product.url))
    const insertCalibers = toInsert.map((i) => i.product.product.caliber ?? null)
    const insertGrainWeights = toInsert.map((i) => i.product.product.grainWeight ?? null)
    const insertRoundCounts = toInsert.map((i) => i.product.product.roundCount ?? null)

    // Bulk insert - no ON CONFLICT needed since we're generating unique IDs
    // Note: brand/description/category are persisted for resolver fingerprinting
    await prisma.$executeRaw`
      INSERT INTO source_products (
        "id", "sourceId", "identityKey", "title", "url", "imageUrl", "brand", "description", "category",
        "caliber", "grainWeight", "roundCount", "normalizedUrl",
        "createdByRunId", "lastUpdatedByRunId", "createdAt", "updatedAt"
      )
      SELECT
        unnest(${insertIds}::text[]),
        ${sourceId},
        unnest(${insertIdentityKeys}::text[]),
        unnest(${insertTitles}::text[]),
        unnest(${insertUrls}::text[]),
        unnest(${insertImageUrls}::text[]),
        unnest(${insertBrands}::text[]),
        unnest(${insertDescriptions}::text[]),
        unnest(${insertCategories}::text[]),
        unnest(${insertCalibers}::text[]),
        unnest(${insertGrainWeights}::int[]),
        unnest(${insertRoundCounts}::int[]),
        unnest(${insertNormalizedUrls}::text[]),
        ${runId},
        ${runId},
        NOW(),
        NOW()
    `

    // Add to results with the IDs we generated
    for (let i = 0; i < toInsert.length; i++) {
      results.push({
        id: insertIds[i],
        identityKey: toInsert[i].product.identityKey,
      })
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 7: Insert identifiers into source_product_identifiers (new table)
  // This enables future "find by any identifier" lookups
  // ═══════════════════════════════════════════════════════════════════════════
  await batchInsertIdentifiers(products, results, runId)

  return results
}

/**
 * Insert identifiers into source_product_identifiers table
 * Uses ON CONFLICT DO NOTHING for idempotency
 */
async function batchInsertIdentifiers(
  products: ProductWithIdentity[],
  upsertedProducts: UpsertedSourceProduct[],
  runId: string
): Promise<void> {
  // Build lookup from identityKey to sourceProductId
  const idLookup = new Map<string, string>()
  for (const sp of upsertedProducts) {
    idLookup.set(sp.identityKey, sp.id)
  }

  // Collect all identifiers to insert
  const identifiersToInsert: Array<{
    sourceProductId: string
    idType: string
    idValue: string
    namespace: string
    isCanonical: boolean
    normalizedValue: string | null
  }> = []

  for (const { identityKey, allIdentifiers } of products) {
    const sourceProductId = idLookup.get(identityKey)
    if (!sourceProductId) continue

    for (const id of allIdentifiers) {
      identifiersToInsert.push({
        sourceProductId,
        idType: id.idType,
        idValue: id.idValue,
        namespace: id.namespace,
        isCanonical: id.isCanonical,
        normalizedValue: id.normalizedValue,
      })
    }
  }

  if (identifiersToInsert.length === 0) return

  // Extract arrays for unnest
  const sourceProductIds = identifiersToInsert.map((i) => i.sourceProductId)
  const idTypes = identifiersToInsert.map((i) => i.idType)
  const idValues = identifiersToInsert.map((i) => i.idValue)
  const namespaces = identifiersToInsert.map((i) => i.namespace)
  const isCanonicals = identifiersToInsert.map((i) => i.isCanonical)
  const normalizedValues = identifiersToInsert.map((i) => i.normalizedValue)

  // Bulk insert with ON CONFLICT DO NOTHING
  const inserted = await prisma.$executeRaw`
    INSERT INTO source_product_identifiers (
      "id", "sourceProductId", "idType", "idValue", "namespace",
      "isCanonical", "normalizedValue", "createdAt", "updatedAt"
    )
    SELECT
      gen_random_uuid()::text,
      unnest(${sourceProductIds}::text[]),
      unnest(${idTypes}::text[])::"IdentifierType",
      unnest(${idValues}::text[]),
      unnest(${namespaces}::text[]),
      unnest(${isCanonicals}::boolean[]),
      unnest(${normalizedValues}::text[]),
      NOW(),
      NOW()
    ON CONFLICT ("sourceProductId", "idType", "idValue", "namespace") DO NOTHING
  `

  log.debug('Identifiers inserted', {
    runId,
    requested: identifiersToInsert.length,
    inserted,
  })
}

/**
 * Batch update SourceProductPresence.lastSeenAt
 * Uses raw SQL for efficient bulk upsert
 */
async function batchUpdatePresence(
  sourceProductIds: string[],
  t0: Date
): Promise<void> {
  if (sourceProductIds.length === 0) return

  // Use raw SQL for efficient bulk upsert with ON CONFLICT
  // Per spec: Phase 1 only updates lastSeenAt, NOT lastSeenSuccessAt
  // Table name: source_product_presence (per Prisma @@map)
  // Schema: id, sourceProductId, lastSeenAt, lastSeenSuccessAt, updatedAt (no createdAt)
  await prisma.$executeRaw`
    INSERT INTO source_product_presence ("id", "sourceProductId", "lastSeenAt", "updatedAt")
    SELECT gen_random_uuid(), id, ${t0}, NOW()
    FROM unnest(${sourceProductIds}::text[]) AS id
    ON CONFLICT ("sourceProductId") DO UPDATE SET
      "lastSeenAt" = ${t0},
      "updatedAt" = NOW()
  `
}

/**
 * Batch record SourceProductSeen for circuit breaker
 * Uses raw SQL for efficient bulk insert
 */
async function batchRecordSeen(
  runId: string,
  sourceProductIds: string[]
): Promise<void> {
  if (sourceProductIds.length === 0) return

  // Use raw SQL for efficient bulk insert with ON CONFLICT DO NOTHING
  // Table name: source_product_seen (per Prisma @@map)
  await prisma.$executeRaw`
    INSERT INTO source_product_seen ("id", "runId", "sourceProductId", "createdAt")
    SELECT gen_random_uuid(), ${runId}, id, NOW()
    FROM unnest(${sourceProductIds}::text[]) AS id
    ON CONFLICT ("runId", "sourceProductId") DO NOTHING
  `
}

/**
 * Batch fetch last prices for source products
 * Per spec §4.2.1: Uses DISTINCT ON for efficient single-query fetch
 * Per affiliate-feed-alerts-v1 spec: Includes price, inStock, currency for alert detection
 */
async function batchFetchLastPrices(
  sourceProductIds: string[]
): Promise<LastPriceEntry[]> {
  if (sourceProductIds.length === 0) return []

  // Per spec: Use DISTINCT ON to get latest price per sourceProductId
  // Per affiliate-feed-alerts-v1: Include price::float8, inStock, currency for change detection
  // Table name: prices (per Prisma @@map)
  const results = await prisma.$queryRaw<LastPriceEntry[]>`
    SELECT DISTINCT ON ("sourceProductId")
      "sourceProductId",
      "priceSignatureHash",
      "createdAt",
      "price"::float8 AS price,
      "inStock",
      "currency"
    FROM prices
    WHERE "sourceProductId" = ANY(${sourceProductIds}::text[])
    ORDER BY "sourceProductId", "createdAt" DESC
  `

  return results
}

/**
 * Detect alert-worthy changes for a single product
 * Exported for unit testing per spec requirement
 *
 * Per affiliate-feed-alerts-v1 spec §6:
 * - Price drop: same currency AND price decreased
 * - Back-in-stock: was explicitly false, now true
 * - Skip if productId null, new product, currency mismatch, or unknown prior state
 *
 * Per ADR-009: Fail closed on ambiguous data (skip + log when currency unknown)
 */
export function detectAlertChanges(
  currentPrice: number,
  currentInStock: boolean,
  currentCurrency: string | null,
  productId: string | null,
  sourceProductId: string,
  lastPrice: LastPriceEntry | null
): AlertDetectionResult {
  // Skip if no productId (can't send alerts for unresolved products per spec §5)
  if (!productId) {
    return { priceChange: null, stockChange: null, skipReason: 'NULL_PRODUCT_ID' }
  }

  // No prior price = new product, no alerts (no prior state to compare)
  if (!lastPrice) {
    return { priceChange: null, stockChange: null, skipReason: 'NEW_PRODUCT' }
  }

  let priceChange: AffiliatePriceChange | null = null
  let stockChange: AffiliateStockChange | null = null

  // Per ADR-009: Fail closed when current currency is unknown
  // Do not default to USD - skip alert detection entirely
  if (!currentCurrency) {
    return { priceChange: null, stockChange: null, skipReason: 'CURRENCY_MISMATCH' }
  }

  const oldCurrency = lastPrice.currency

  // Price drop detection (per spec §6.1):
  // - Same currency AND price decreased
  // - Skip if prior currency is null (unknown state)
  if (oldCurrency && oldCurrency === currentCurrency && lastPrice.price > currentPrice) {
    priceChange = {
      productId,
      sourceProductId,
      oldPrice: lastPrice.price,
      newPrice: currentPrice,
    }
  } else if (!oldCurrency || oldCurrency !== currentCurrency) {
    // Currency mismatch or unknown prior currency - could be real price drop but we can't tell
    // Only return this skip reason if we would have detected a price drop otherwise
    if (lastPrice.price > currentPrice) {
      return { priceChange: null, stockChange: null, skipReason: 'CURRENCY_MISMATCH' }
    }
  }

  // Back-in-stock detection (per spec §6.2):
  // - Was explicitly false, now true
  // - Skip if prior inStock is null (unknown state per spec Known Limitations)
  const normalizedNewInStock = currentInStock === true
  if (lastPrice.inStock === false && normalizedNewInStock) {
    stockChange = {
      productId,
      sourceProductId,
      inStock: true,
    }
  } else if (lastPrice.inStock === null && normalizedNewInStock) {
    // Unknown prior state - can't determine if this is back-in-stock
    // Only flag if we have no price change either
    if (!priceChange) {
      return { priceChange: null, stockChange: null, skipReason: 'UNKNOWN_PRIOR_STATE' }
    }
  }

  return { priceChange, stockChange, skipReason: null }
}

/**
 * Decide which prices to write based on cache
 * Per spec §4.2.1: All decisions use run-local cache, no per-row DB reads
 * Per affiliate-feed-alerts-v1 spec: Returns structured change lists for alert queueing
 */
function decidePriceWrites(
  products: ProductWithIdentity[],
  upsertedProducts: UpsertedSourceProduct[],
  retailerId: string,
  runId: string,
  t0: Date,
  lastPriceCache: Map<string, LastPriceEntry>,
  sourceProductIdToProductId: Map<string, string | null>
): PriceWriteResult {
  const pricesToWrite: NewPriceRecord[] = []
  const priceChanges: AffiliatePriceChange[] = []
  const stockChanges: AffiliateStockChange[] = []

  // Per affiliate-feed-alerts-v1 spec: Track skip reasons for observability
  const alertSkips: AlertDetectionSkips = {
    nullProductId: 0,
    noChange: 0,
    currencyMismatch: 0,
    unknownPriorState: 0,
  }

  // Build lookup from identityKey to sourceProductId
  const idLookup = new Map<string, string>()
  for (const sp of upsertedProducts) {
    idLookup.set(sp.identityKey, sp.id)
  }

  for (const { product, identityKey } of products) {
    const sourceProductId = idLookup.get(identityKey)
    if (!sourceProductId) continue

    const priceSignatureHash = computePriceSignature(product)
    const lastPrice = lastPriceCache.get(sourceProductId)

    // Normalize currency for PRICE WRITES (default to USD for data integrity)
    // Per ADR-009: Alert detection handles missing currency separately (fail-closed)
    const normalizedCurrency = product.currency || 'USD'
    const normalizedNewInStock = product.inStock === true

    // Determine if we should write
    const isNew = !lastPrice
    const signatureChanged = lastPrice && lastPrice.priceSignatureHash !== priceSignatureHash
    const heartbeatDue =
      lastPrice && t0.getTime() - lastPrice.createdAt.getTime() >= HEARTBEAT_MS

    // Per affiliate-feed-alerts-v1 spec: Stock-only changes must be written even if signature unchanged
    // Normalize old inStock: treat null/undefined as unknown (not comparable)
    const normalizedOldInStock = lastPrice?.inStock === true
    const stockChanged = lastPrice && normalizedOldInStock !== normalizedNewInStock

    if (!isNew && !signatureChanged && !heartbeatDue && !stockChanged) {
      // Skip write - no changes detected
      alertSkips.noChange++
      continue
    }

    // Get productId from UPC matching (may be null if no match)
    const productId = sourceProductIdToProductId.get(sourceProductId) ?? null

    pricesToWrite.push({
      retailerId,
      sourceProductId,
      productId,
      affiliateFeedRunId: runId,
      priceSignatureHash,
      price: product.price,
      currency: normalizedCurrency,
      url: product.url,
      inStock: product.inStock,
      originalPrice: product.originalPrice ?? null,
      priceType:
        product.originalPrice && product.price < product.originalPrice
          ? 'SALE'
          : 'REGULAR',
    })

    // ═══════════════════════════════════════════════════════════════════════════
    // ALERT CHANGE DETECTION
    // Per affiliate-feed-alerts-v1 spec §6 - using exported helper for testability
    // Per ADR-009: Pass raw currency (possibly null) to fail-closed on unknown
    // ═══════════════════════════════════════════════════════════════════════════

    const alertResult = detectAlertChanges(
      product.price,
      product.inStock,
      product.currency ?? null, // Pass raw value for fail-closed behavior
      productId,
      sourceProductId,
      lastPrice ?? null
    )

    // Track skip reasons for observability logging
    if (alertResult.skipReason) {
      switch (alertResult.skipReason) {
        case 'NULL_PRODUCT_ID':
          alertSkips.nullProductId++
          break
        case 'NEW_PRODUCT':
          // New products are expected, don't count as skips
          break
        case 'CURRENCY_MISMATCH':
          alertSkips.currencyMismatch++
          break
        case 'UNKNOWN_PRIOR_STATE':
          alertSkips.unknownPriorState++
          break
      }
    }

    // Collect detected changes
    if (alertResult.priceChange) {
      priceChanges.push(alertResult.priceChange)
    }
    if (alertResult.stockChange) {
      stockChanges.push(alertResult.stockChange)
    }
  }

  // Per affiliate-feed-alerts-v1 spec: Log skip summary for observability
  const totalSkips = alertSkips.nullProductId + alertSkips.currencyMismatch + alertSkips.unknownPriorState
  if (totalSkips > 0) {
    log.info('Alert detection skips', {
      runId,
      retailerId,
      skips: alertSkips,
      priceChangesDetected: priceChanges.length,
      stockChangesDetected: stockChanges.length,
    })
  }

  return { pricesToWrite, priceChanges, stockChanges, alertSkips }
}

/**
 * Bulk insert prices using raw SQL with ON CONFLICT DO NOTHING
 *
 * Per spec §4.2.1 and Section 2.6:
 * - Uses ON CONFLICT DO NOTHING (no target) for retry-safe idempotency
 * - Partial unique index `prices_affiliate_dedupe` handles deduplication
 * - Returns actual inserted count from DB, not array length
 *
 * CRITICAL: The `prices` table must have NO other unique constraints.
 * This is enforced via migration test (Section 18.1.1).
 */
async function bulkInsertPrices(
  pricesToWrite: NewPriceRecord[],
  createdAt: Date
): Promise<number> {
  if (pricesToWrite.length === 0) return 0

  // Extract arrays for unnest - per spec pattern
  const sourceProductIds = pricesToWrite.map((p) => p.sourceProductId)
  const productIds = pricesToWrite.map((p) => p.productId) // FK to canonical product
  const retailerIds = pricesToWrite.map((p) => p.retailerId)
  const prices = pricesToWrite.map((p) => p.price)
  const currencies = pricesToWrite.map((p) => p.currency)
  const urls = pricesToWrite.map((p) => p.url)
  const inStocks = pricesToWrite.map((p) => p.inStock)
  const originalPrices = pricesToWrite.map((p) => p.originalPrice)
  const priceTypes = pricesToWrite.map((p) => p.priceType)
  const runIds = pricesToWrite.map((p) => p.affiliateFeedRunId)
  const signatureHashes = pricesToWrite.map((p) => p.priceSignatureHash)

  // Bulk insert with ON CONFLICT DO NOTHING
  // Per spec: Returns actual row count, which may be less than array length
  // if duplicates were suppressed by prices_affiliate_dedupe index
  // Table name: prices (per Prisma @@map)
  const insertedCount = await prisma.$executeRaw`
    INSERT INTO prices (
      "id",
      "sourceProductId",
      "productId",
      "retailerId",
      "price",
      "currency",
      "url",
      "inStock",
      "originalPrice",
      "priceType",
      "affiliateFeedRunId",
      "priceSignatureHash",
      "createdAt",
      "observedAt",
      "ingestionRunType",
      "ingestionRunId"
    )
    SELECT
      gen_random_uuid(),
      unnest(${sourceProductIds}::text[]),
      unnest(${productIds}::text[]),
      unnest(${retailerIds}::text[]),
      unnest(${prices}::numeric[]),
      unnest(${currencies}::text[]),
      unnest(${urls}::text[]),
      unnest(${inStocks}::boolean[]),
      unnest(${originalPrices}::numeric[]),
      unnest(${priceTypes}::text[])::"PriceType",
      unnest(${runIds}::text[]),
      unnest(${signatureHashes}::text[]),
      ${createdAt},
      ${createdAt},
      'AFFILIATE_FEED'::"IngestionRunType",
      unnest(${runIds}::text[])
    ON CONFLICT DO NOTHING
  `

  return insertedCount
}

/**
 * Queue affiliate alerts for price drops and back-in-stock events
 * Per affiliate-feed-alerts-v1 spec §4
 *
 * @param priceChanges - Price drop changes to alert
 * @param stockChanges - Back-in-stock changes to alert
 * @param runId - Affiliate feed run ID for traceability
 * @returns Counts of enqueued alerts
 */
async function queueAffiliateAlerts(
  priceChanges: AffiliatePriceChange[],
  stockChanges: AffiliateStockChange[],
  runId: string
): Promise<{ priceDropsEnqueued: number; backInStockEnqueued: number }> {
  let priceDropsEnqueued = 0
  let backInStockEnqueued = 0

  // Queue price drop alerts
  for (const change of priceChanges) {
    try {
      const jobData: AlertJobData = {
        executionId: runId,
        productId: change.productId,
        oldPrice: change.oldPrice,
        newPrice: change.newPrice,
      }
      // Per spec: Do not set jobId (alerter enforces cooldowns and claim logic)
      await alertQueue.add('PRICE_DROP', jobData)
      priceDropsEnqueued++
    } catch (err) {
      log.error('AFFILIATE_ALERTS_QUEUE_FAILED', {
        event_name: 'AFFILIATE_ALERTS_QUEUE_FAILED',
        runId,
        alertType: 'PRICE_DROP',
        productId: change.productId,
        error: err instanceof Error ? err.message : String(err),
      })
      // Continue - alerts are best-effort per spec
    }
  }

  // Queue back-in-stock alerts
  for (const change of stockChanges) {
    try {
      const jobData: AlertJobData = {
        executionId: runId,
        productId: change.productId,
        inStock: change.inStock,
      }
      // Per spec: Do not set jobId (alerter enforces cooldowns and claim logic)
      await alertQueue.add('BACK_IN_STOCK', jobData)
      backInStockEnqueued++
    } catch (err) {
      log.error('AFFILIATE_ALERTS_QUEUE_FAILED', {
        event_name: 'AFFILIATE_ALERTS_QUEUE_FAILED',
        runId,
        alertType: 'BACK_IN_STOCK',
        productId: change.productId,
        error: err instanceof Error ? err.message : String(err),
      })
      // Continue - alerts are best-effort per spec
    }
  }

  return { priceDropsEnqueued, backInStockEnqueued }
}
