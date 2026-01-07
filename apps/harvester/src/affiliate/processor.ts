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
import { ProductMatcher, batchUpdateSourceProductIds } from './product-matcher'
import type {
  FeedRunContext,
  ParsedFeedProduct,
  ProcessorResult,
  ParseError,
  IdentityType,
} from './types'
import { ERROR_CODES, AffiliateFeedError } from './types'

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
interface LastPriceEntry {
  sourceProductId: string
  priceSignatureHash: string
  createdAt: Date
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
  let duplicateKeyCount = 0
  let urlHashFallbackCount = 0
  let productsMatched = 0
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

      // Step 2: Batch upsert SourceProducts
      log.debug('Upserting source products', { runId: run.id, chunkNum, count: deduped.length })
      const upsertStart = Date.now()
      const upsertedProducts = await batchUpsertSourceProducts(
        sourceId,
        deduped,
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
      for (const { product, identityKey } of deduped) {
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
      const matchesToUpdate: Array<{ sourceProductId: string; productId: string }> = []

      for (const result of matchResults) {
        sourceProductIdToProductId.set(result.sourceProductId, result.productId)
        if (result.productId) {
          matchesToUpdate.push({
            sourceProductId: result.sourceProductId,
            productId: result.productId,
          })
        }
      }

      // Batch update source_products.productId for matches
      if (matchesToUpdate.length > 0) {
        await batchUpdateSourceProductIds(matchesToUpdate)
        productsMatched += matchesToUpdate.length
      }

      log.info('MATCH_OK', {
        runId: run.id,
        chunkNum,
        matchedCount: matchesToUpdate.length,
        unmatchedCount: sourceProductsForMatching.length - matchesToUpdate.length,
        durationMs: Date.now() - matchStart,
      })

      // Step 3: Batch update presence and seen records
      log.debug('Updating presence and seen records', { runId: run.id, chunkNum, count: sourceProductIds.length })
      const presenceStart = Date.now()
      await Promise.all([
        batchUpdatePresence(sourceProductIds, t0),
        batchRecordSeen(run.id, sourceProductIds),
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
      log.debug('Deciding price writes', { runId: run.id, chunkNum, productCount: deduped.length })
      const pricesToWrite = decidePriceWrites(
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

        // Update cache so later chunks see these writes
        // Per spec §4.2.1: Cache updated after each batch insert
        for (const price of pricesToWrite) {
          lastPriceCache.set(price.sourceProductId, {
            sourceProductId: price.sourceProductId,
            priceSignatureHash: price.priceSignatureHash,
            createdAt: t0,
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
    SELECT spi."sourceProductId", spi."idType"::text, spi."idValue", COALESCE(spi."namespace", '') as namespace
    FROM source_product_identifiers spi
    JOIN source_products sp ON sp.id = spi."sourceProductId"
    WHERE sp."sourceId" = ${sourceId}
      AND (spi."idType"::text, spi."idValue", COALESCE(spi."namespace", '')) IN (
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
    const updateNormalizedUrls = toUpdate.map((u) => normalizeUrl(u.product.product.url))

    // Batch update using unnest pattern
    await prisma.$executeRaw`
      UPDATE source_products AS sp SET
        "title" = u.title,
        "url" = u.url,
        "imageUrl" = u."imageUrl",
        "normalizedUrl" = u."normalizedUrl",
        "lastUpdatedByRunId" = ${runId},
        "updatedAt" = NOW()
      FROM (
        SELECT
          unnest(${updateIds}::text[]) AS id,
          unnest(${updateTitles}::text[]) AS title,
          unnest(${updateUrls}::text[]) AS url,
          unnest(${updateImageUrls}::text[]) AS "imageUrl",
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
    const insertTitles = toInsert.map((i) => i.product.product.name)
    const insertUrls = toInsert.map((i) => i.product.product.url)
    const insertImageUrls = toInsert.map((i) => i.product.product.imageUrl ?? null)
    const insertNormalizedUrls = toInsert.map((i) => normalizeUrl(i.product.product.url))

    // Bulk insert - no ON CONFLICT needed since we're generating unique IDs
    await prisma.$executeRaw`
      INSERT INTO source_products (
        "id", "sourceId", "title", "url", "imageUrl", "normalizedUrl",
        "createdByRunId", "lastUpdatedByRunId", "createdAt", "updatedAt"
      )
      SELECT
        unnest(${insertIds}::text[]),
        ${sourceId},
        unnest(${insertTitles}::text[]),
        unnest(${insertUrls}::text[]),
        unnest(${insertImageUrls}::text[]),
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
 */
async function batchFetchLastPrices(
  sourceProductIds: string[]
): Promise<LastPriceEntry[]> {
  if (sourceProductIds.length === 0) return []

  // Per spec: Use DISTINCT ON to get latest price per sourceProductId
  // Table name: prices (per Prisma @@map)
  const results = await prisma.$queryRaw<LastPriceEntry[]>`
    SELECT DISTINCT ON ("sourceProductId")
      "sourceProductId",
      "priceSignatureHash",
      "createdAt"
    FROM prices
    WHERE "sourceProductId" = ANY(${sourceProductIds}::text[])
    ORDER BY "sourceProductId", "createdAt" DESC
  `

  return results
}

/**
 * Decide which prices to write based on cache
 * Per spec §4.2.1: All decisions use run-local cache, no per-row DB reads
 */
function decidePriceWrites(
  products: ProductWithIdentity[],
  upsertedProducts: UpsertedSourceProduct[],
  retailerId: string,
  runId: string,
  t0: Date,
  lastPriceCache: Map<string, LastPriceEntry>,
  sourceProductIdToProductId: Map<string, string | null>
): NewPriceRecord[] {
  const pricesToWrite: NewPriceRecord[] = []

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

    // Determine if we should write
    const isNew = !lastPrice
    const signatureChanged = lastPrice && lastPrice.priceSignatureHash !== priceSignatureHash
    const heartbeatDue =
      lastPrice && t0.getTime() - lastPrice.createdAt.getTime() >= HEARTBEAT_MS

    if (!isNew && !signatureChanged && !heartbeatDue) {
      // Skip write - signature unchanged and heartbeat not due
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
      currency: product.currency || 'USD',
      url: product.url,
      inStock: product.inStock,
      originalPrice: product.originalPrice ?? null,
      priceType:
        product.originalPrice && product.price < product.originalPrice
          ? 'SALE'
          : 'REGULAR',
    })
  }

  return pricesToWrite
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
