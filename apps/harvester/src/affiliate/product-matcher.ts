/**
 * Product Matcher - UPC-based canonicalization
 *
 * Links source_products to canonical products via UPC matching.
 * Per spec: Uses normalized UPC for lookup, maintains run-local cache.
 *
 * v2: Writes to product_links (source of truth) with conflict guard.
 * - Don't replace MATCHED with anything
 * - Don't replace CREATED with different productId
 *
 * v1 MVP: UPC-only matching. Future iterations may add fuzzy matching.
 */

import { prisma } from '@ironscout/db'
import { ProductLinkStatus } from '@ironscout/db/generated/prisma'
import { logger } from '../config/logger'
import { createId } from '@paralleldrive/cuid2'

const log = logger.affiliate

// Version tracked in product_links.resolverVersion
const MATCHER_VERSION = 'ProductMatcher-v2.0'

// ============================================================================
// TYPES
// ============================================================================

/** Product match result */
export interface ProductMatchResult {
  sourceProductId: string
  productId: string | null
  /** Whether product_links row was written/updated */
  linkWritten: boolean
  /** Whether this item should be enqueued to resolver (unmatched) */
  needsResolver: boolean
}

/** Product link write result for batch operations */
interface ProductLinkWriteResult {
  sourceProductId: string
  written: boolean
  skippedReason?: 'ALREADY_MATCHED' | 'CREATED_DIFFERENT_PRODUCT' | 'ERROR'
}

// ============================================================================
// UPC NORMALIZATION
// ============================================================================

/**
 * Normalize UPC string for consistent matching
 *
 * Rules:
 * - Strip non-digit characters (hyphens, spaces, etc.)
 * - Preserve leading zeros (UPC/EAN/GTIN are fixed-length codes)
 * - Return null for empty/invalid UPCs
 *
 * Note: Leading zeros are significant in UPC codes. A UPC-A code is always
 * 12 digits, and "020892215513" is different from "20892215513". Stripping
 * leading zeros causes matching failures across sources that handle them
 * differently.
 *
 * Examples:
 * - "012345678901" -> "012345678901" (preserved)
 * - "0-12345-67890-1" -> "012345678901" (hyphens stripped)
 * - "020892215513" -> "020892215513" (12-digit UPC preserved)
 * - "" -> null
 * - "N/A" -> null
 */
export function normalizeUpc(upc: string | null | undefined): string | null {
  if (!upc) return null

  // Strip non-digit characters (hyphens, spaces, etc.)
  const digits = upc.replace(/\D/g, '')

  // Empty or all non-digits
  if (!digits) return null

  // Preserve leading zeros - UPC/EAN/GTIN are fixed-length codes where
  // leading zeros are significant (e.g., 020892215513 is a valid 12-digit UPC)

  // UPCs should be at least 3 digits (reject garbage values)
  if (digits.length < 3) return null

  return digits
}

// ============================================================================
// PRODUCT MATCHER
// ============================================================================

/**
 * Product Matcher class with run-local caching
 *
 * Usage:
 * 1. Create instance at start of run
 * 2. Call batchMatchByUpc() for each chunk of source products
 * 3. Matcher writes to product_links for matches
 * 4. Returns unmatched items for resolver enqueueing
 */
export class ProductMatcher {
  // Run-local cache: normalizedUpc -> productId
  private cache = new Map<string, string | null>()

  // Cache of existing product_links status to avoid redundant checks
  private linkStatusCache = new Map<string, ProductLinkStatus>()

  // Stats for logging
  private stats = {
    totalLookups: 0,
    cacheHits: 0,
    dbLookups: 0,
    matchesFound: 0,
    linksWritten: 0,
    linksSkipped: 0,
  }

  /**
   * Batch match source products to canonical products by UPC
   *
   * For each source product:
   * - If UPC matches a canonical product, writes to product_links with status=MATCHED
   * - If no match, marks needsResolver=true for resolver enqueueing
   *
   * Conflict guard policy:
   * - Don't replace MATCHED with anything
   * - Don't replace CREATED with different productId
   *
   * @param sourceProducts - Array of {id, upc} from source_products
   * @returns Array of results indicating match status and resolver needs
   */
  async batchMatchByUpc(
    sourceProducts: Array<{ id: string; upc: string | null }>
  ): Promise<ProductMatchResult[]> {
    const results: ProductMatchResult[] = []
    const batchStart = Date.now()
    let noUpcCount = 0
    let cacheMatchCount = 0
    let cacheNoMatchCount = 0
    let dbMatchCount = 0
    let dbNoMatchCount = 0

    log.debug('PRODUCT_MATCH_BATCH_START', {
      inputCount: sourceProducts.length,
      cacheSize: this.cache.size,
    })

    // Collect UPCs that need DB lookup
    const upcsToLookup: string[] = []
    const sourceProductByNormalizedUpc = new Map<string, Array<{ id: string; upc: string | null }>>()

    // Track items for product_links writing
    const matchedItems: Array<{ sourceProductId: string; productId: string; normalizedUpc: string }> = []
    const unmatchedItems: Array<{ sourceProductId: string }> = []

    for (const sp of sourceProducts) {
      this.stats.totalLookups++

      const normalizedUpc = normalizeUpc(sp.upc)
      if (!normalizedUpc) {
        // No valid UPC - needs resolver
        noUpcCount++
        unmatchedItems.push({ sourceProductId: sp.id })
        results.push({
          sourceProductId: sp.id,
          productId: null,
          linkWritten: false,
          needsResolver: true,
        })
        log.debug('PRODUCT_MATCH_DECISION', {
          sourceProductId: sp.id,
          rawUpc: sp.upc?.substring(0, 20) || null,
          normalizedUpc: null,
          decision: 'NO_UPC',
          productId: null,
          needsResolver: true,
        })
        continue
      }

      // Check cache first
      if (this.cache.has(normalizedUpc)) {
        this.stats.cacheHits++
        const cachedProductId = this.cache.get(normalizedUpc)!
        if (cachedProductId) {
          this.stats.matchesFound++
          cacheMatchCount++
          matchedItems.push({ sourceProductId: sp.id, productId: cachedProductId, normalizedUpc })
        } else {
          cacheNoMatchCount++
          unmatchedItems.push({ sourceProductId: sp.id })
        }
        // Note: linkWritten will be updated after batch write
        results.push({
          sourceProductId: sp.id,
          productId: cachedProductId,
          linkWritten: false, // Will update after batch write
          needsResolver: !cachedProductId,
        })
        log.debug('PRODUCT_MATCH_DECISION', {
          sourceProductId: sp.id,
          normalizedUpc,
          decision: cachedProductId ? 'CACHE_HIT_MATCHED' : 'CACHE_HIT_NO_MATCH',
          productId: cachedProductId,
          needsResolver: !cachedProductId,
        })
        continue
      }

      // Need DB lookup - track source products per UPC for later
      if (!sourceProductByNormalizedUpc.has(normalizedUpc)) {
        sourceProductByNormalizedUpc.set(normalizedUpc, [])
        upcsToLookup.push(normalizedUpc)
      }
      sourceProductByNormalizedUpc.get(normalizedUpc)!.push(sp)
    }

    // Batch lookup from DB if needed
    if (upcsToLookup.length > 0) {
      this.stats.dbLookups += upcsToLookup.length
      const dbStart = Date.now()
      const matchedProducts = await this.fetchProductsByUpc(upcsToLookup)
      const dbDurationMs = Date.now() - dbStart

      log.debug('PRODUCT_MATCH_DB_LOOKUP', {
        upcsQueried: upcsToLookup.length,
        productsFound: matchedProducts.size,
        durationMs: dbDurationMs,
        upcSample: upcsToLookup.slice(0, 5),
      })

      // Update cache and build results
      for (const normalizedUpc of upcsToLookup) {
        const productId = matchedProducts.get(normalizedUpc) ?? null
        this.cache.set(normalizedUpc, productId)

        const sourceProducts = sourceProductByNormalizedUpc.get(normalizedUpc) ?? []
        for (const sp of sourceProducts) {
          if (productId) {
            this.stats.matchesFound++
            dbMatchCount++
            matchedItems.push({ sourceProductId: sp.id, productId, normalizedUpc })
          } else {
            dbNoMatchCount++
            unmatchedItems.push({ sourceProductId: sp.id })
          }
          results.push({
            sourceProductId: sp.id,
            productId,
            linkWritten: false, // Will update after batch write
            needsResolver: !productId,
          })
          log.debug('PRODUCT_MATCH_DECISION', {
            sourceProductId: sp.id,
            normalizedUpc,
            decision: productId ? 'DB_MATCHED' : 'DB_NO_MATCH',
            productId,
            needsResolver: !productId,
          })
        }
      }
    }

    // Write product_links for matched items with conflict guard
    let linksWrittenCount = 0
    let linksSkippedCount = 0
    if (matchedItems.length > 0) {
      const writeResults = await this.batchWriteProductLinks(matchedItems)

      // Update results with linkWritten status
      const writeResultMap = new Map(writeResults.map((r) => [r.sourceProductId, r]))
      for (const result of results) {
        const writeResult = writeResultMap.get(result.sourceProductId)
        if (writeResult) {
          result.linkWritten = writeResult.written
          if (writeResult.written) {
            linksWrittenCount++
          } else {
            linksSkippedCount++
          }
        }
      }

      this.stats.linksWritten += linksWrittenCount
      this.stats.linksSkipped += linksSkippedCount
    }

    const batchDurationMs = Date.now() - batchStart
    log.debug('PRODUCT_MATCH_BATCH_COMPLETE', {
      inputCount: sourceProducts.length,
      resultsCount: results.length,
      noUpcCount,
      cacheHits: this.stats.cacheHits,
      cacheMatchCount,
      cacheNoMatchCount,
      dbLookups: upcsToLookup.length,
      dbMatches: dbMatchCount,
      dbNoMatchCount,
      totalMatches: this.stats.matchesFound,
      linksWritten: linksWrittenCount,
      linksSkipped: linksSkippedCount,
      needsResolver: unmatchedItems.length,
      cacheSize: this.cache.size,
      durationMs: batchDurationMs,
    })

    return results
  }

  /**
   * Write product_links for matched items with atomic WHERE-guarded UPSERT
   *
   * Conflict guard policy (enforced atomically in SQL):
   * - Never overwrite CREATED status
   * - Never change MATCHED to a different productId
   * - Can update NEEDS_REVIEW, ERROR, UNMATCHED, or same productId
   *
   * Uses raw SQL UPSERT with WHERE clause to eliminate race conditions
   * between check and write operations.
   */
  private async batchWriteProductLinks(
    items: Array<{ sourceProductId: string; productId: string; normalizedUpc: string }>
  ): Promise<ProductLinkWriteResult[]> {
    if (items.length === 0) return []

    const results: ProductLinkWriteResult[] = []
    const now = new Date()
    const skippedCounts = {
      ALREADY_MATCHED: 0,
      CREATED_DIFFERENT_PRODUCT: 0,
      CONFLICT_GUARD: 0,
      ERROR: 0,
    }

    // Process each item with atomic WHERE-guarded UPSERT
    // The WHERE clause ensures conflict guard is checked atomically with the write
    for (const item of items) {
      const evidence = JSON.stringify({
        matchMethod: 'upc',
        normalizedUpc: item.normalizedUpc,
        timestamp: now.toISOString(),
        matcher: MATCHER_VERSION,
      })

      try {
        // Atomic UPSERT with WHERE guard
        // INSERT if no row exists
        // UPDATE only if:
        //   - status NOT IN ('CREATED', 'MATCHED'), OR
        //   - status = 'MATCHED' AND productId = new productId (idempotent)
        const result = await prisma.$executeRaw`
          INSERT INTO "product_links" (
            "id", "sourceProductId", "productId", "matchType", "status",
            "confidence", "resolverVersion", "evidence", "resolvedAt",
            "createdAt", "updatedAt"
          )
          VALUES (
            ${createId()},
            ${item.sourceProductId},
            ${item.productId},
            'UPC'::"ProductLinkMatchType",
            'MATCHED'::"ProductLinkStatus",
            1.0,
            ${MATCHER_VERSION},
            ${evidence}::jsonb,
            ${now},
            ${now},
            ${now}
          )
          ON CONFLICT ("sourceProductId") DO UPDATE
          SET
            "productId" = EXCLUDED."productId",
            "matchType" = EXCLUDED."matchType",
            "status" = EXCLUDED."status",
            "confidence" = EXCLUDED."confidence",
            "resolverVersion" = EXCLUDED."resolverVersion",
            "evidence" = EXCLUDED."evidence",
            "resolvedAt" = EXCLUDED."resolvedAt",
            "updatedAt" = EXCLUDED."updatedAt"
          WHERE
            -- Conflict guard: allow update only if safe
            (
              -- Can update if status is not CREATED or MATCHED
              "product_links"."status" NOT IN ('CREATED', 'MATCHED')
              -- OR if MATCHED with same productId (idempotent)
              OR ("product_links"."status" = 'MATCHED' AND "product_links"."productId" = EXCLUDED."productId")
            )
        `

        // result = number of affected rows (0 = skipped by WHERE, 1 = written)
        const written = result > 0

        if (written) {
          results.push({ sourceProductId: item.sourceProductId, written: true })
          this.linkStatusCache.set(item.sourceProductId, ProductLinkStatus.MATCHED)
          log.debug('PRODUCT_LINK_UPSERT_OK', {
            sourceProductId: item.sourceProductId,
            productId: item.productId,
            matchType: 'UPC',
          })
        } else {
          // WHERE clause blocked the update - check why
          const existing = await prisma.product_links.findUnique({
            where: { sourceProductId: item.sourceProductId },
            select: { status: true, productId: true },
          })

          const skippedReason =
            existing?.status === 'CREATED'
              ? 'CREATED_DIFFERENT_PRODUCT'
              : existing?.status === 'MATCHED'
                ? 'ALREADY_MATCHED'
                : 'CONFLICT_GUARD'

          results.push({
            sourceProductId: item.sourceProductId,
            written: false,
            skippedReason: skippedReason as ProductLinkWriteResult['skippedReason'],
          })
          if (skippedReason && skippedReason in skippedCounts) {
            skippedCounts[skippedReason as keyof typeof skippedCounts]++
          }

          if (existing) {
            this.linkStatusCache.set(item.sourceProductId, existing.status as ProductLinkStatus)
          }

          log.debug('PRODUCT_LINK_UPSERT_SKIP', {
            sourceProductId: item.sourceProductId,
            reason: skippedReason,
            existingStatus: existing?.status,
            existingProductId: existing?.productId,
            newProductId: item.productId,
          })
        }
      } catch (err) {
        log.error('PRODUCT_LINK_UPSERT_ERROR', {
          error: err,
          sourceProductId: item.sourceProductId,
        })
        results.push({
          sourceProductId: item.sourceProductId,
          written: false,
          skippedReason: 'ERROR',
        })
        skippedCounts.ERROR++
      }
    }

    log.debug('PRODUCT_LINK_UPSERT_SUMMARY', {
      attempted: items.length,
      written: results.filter((r) => r.written).length,
      skipped: results.filter((r) => !r.written).length,
      skippedCounts,
    })

    return results
  }

  /**
   * Fetch products by normalized UPC from database
   *
   * Products table has a unique UPC field, but we need to handle:
   * 1. Products may store UPC with or without leading zeros
   * 2. We normalize both for comparison
   */
  private async fetchProductsByUpc(
    normalizedUpcs: string[]
  ): Promise<Map<string, string>> {
    if (normalizedUpcs.length === 0) return new Map()

    // Query products and normalize their UPCs for matching
    // Use raw SQL for efficient batch lookup
    // Note: Products may have UPCs stored differently, so we normalize on comparison
    const results = await prisma.$queryRaw<Array<{ id: string; upc: string }>>`
      SELECT id, upc
      FROM products
      WHERE upc IS NOT NULL
        AND TRIM(LEADING '0' FROM regexp_replace(upc, '[^0-9]', '', 'g'))
          = ANY(${normalizedUpcs}::text[])
    `

    // Build map: normalizedUpc -> productId
    const matchMap = new Map<string, string>()
    for (const row of results) {
      const normalizedRowUpc = normalizeUpc(row.upc)
      if (normalizedRowUpc) {
        matchMap.set(normalizedRowUpc, row.id)
      }
    }

    return matchMap
  }

  /**
   * Get matcher statistics for logging
   */
  getStats() {
    return {
      ...this.stats,
      cacheSize: this.cache.size,
      linkStatusCacheSize: this.linkStatusCache.size,
      hitRate:
        this.stats.totalLookups > 0
          ? ((this.stats.cacheHits / this.stats.totalLookups) * 100).toFixed(1)
          : '0',
      matchRate:
        this.stats.totalLookups > 0
          ? ((this.stats.matchesFound / this.stats.totalLookups) * 100).toFixed(1)
          : '0',
      linkWriteRate:
        this.stats.matchesFound > 0
          ? ((this.stats.linksWritten / this.stats.matchesFound) * 100).toFixed(1)
          : '0',
    }
  }
}

/**
 * Batch update source_products.productId after matching
 *
 * @deprecated Use ProductMatcher.batchMatchByUpc() which writes to product_links directly.
 * This function updates the legacy source_products.productId field.
 * Kept for backward compatibility during migration.
 *
 * @param matches - Array of {sourceProductId, productId} where productId is non-null
 */
export async function batchUpdateSourceProductIds(
  matches: Array<{ sourceProductId: string; productId: string }>
): Promise<number> {
  if (matches.length === 0) return 0

  const sourceProductIds = matches.map((m) => m.sourceProductId)
  const productIds = matches.map((m) => m.productId)

  // Use raw SQL for efficient batch update
  const updatedCount = await prisma.$executeRaw`
    UPDATE source_products
    SET "productId" = data."productId", "updatedAt" = NOW()
    FROM (
      SELECT
        unnest(${sourceProductIds}::text[]) AS id,
        unnest(${productIds}::text[]) AS "productId"
    ) AS data
    WHERE source_products.id = data.id
  `

  return updatedCount
}
