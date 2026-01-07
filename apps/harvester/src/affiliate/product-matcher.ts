/**
 * Product Matcher - UPC-based canonicalization
 *
 * Links source_products to canonical products via UPC matching.
 * Per spec: Uses normalized UPC for lookup, maintains run-local cache.
 *
 * v1 MVP: UPC-only matching. Future iterations may add fuzzy matching.
 */

import { prisma } from '@ironscout/db'
import { logger } from '../config/logger'

const log = logger.affiliate

// ============================================================================
// TYPES
// ============================================================================

/** Matched product entry for cache */
interface MatchedProduct {
  upc: string
  productId: string
}

/** Product match result */
export interface ProductMatchResult {
  sourceProductId: string
  productId: string | null
}

// ============================================================================
// UPC NORMALIZATION
// ============================================================================

/**
 * Normalize UPC string for consistent matching
 *
 * Rules:
 * - Strip non-digit characters
 * - Remove leading zeros (for comparison)
 * - Return null for empty/invalid UPCs
 *
 * Examples:
 * - "012345678901" -> "12345678901"
 * - "0-12345-67890-1" -> "12345678901"
 * - "00000123" -> "123"
 * - "" -> null
 * - "N/A" -> null
 */
export function normalizeUpc(upc: string | null | undefined): string | null {
  if (!upc) return null

  // Strip non-digit characters
  const digits = upc.replace(/\D/g, '')

  // Empty or all non-digits
  if (!digits) return null

  // Remove leading zeros for comparison
  // Keep at least 1 character (in case UPC is "0")
  const normalized = digits.replace(/^0+/, '') || '0'

  // UPCs should be at least 6 digits after normalization (typical minimum)
  // Accept shorter for SKU-like values that may be in UPC field
  if (normalized.length < 3) return null

  return normalized
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
 * 3. Matcher maintains cache across chunks to avoid repeated lookups
 */
export class ProductMatcher {
  // Run-local cache: normalizedUpc -> productId
  private cache = new Map<string, string | null>()

  // Stats for logging
  private stats = {
    totalLookups: 0,
    cacheHits: 0,
    dbLookups: 0,
    matchesFound: 0,
  }

  /**
   * Batch match source products to canonical products by UPC
   *
   * @param sourceProducts - Array of {id, upc} from source_products
   * @returns Array of {sourceProductId, productId} for matched products
   */
  async batchMatchByUpc(
    sourceProducts: Array<{ id: string; upc: string | null }>
  ): Promise<ProductMatchResult[]> {
    const results: ProductMatchResult[] = []

    // Collect UPCs that need DB lookup
    const upcsToLookup: string[] = []
    const sourceProductByNormalizedUpc = new Map<string, string[]>()

    for (const sp of sourceProducts) {
      this.stats.totalLookups++

      const normalizedUpc = normalizeUpc(sp.upc)
      if (!normalizedUpc) {
        // No valid UPC - no match possible
        results.push({ sourceProductId: sp.id, productId: null })
        continue
      }

      // Check cache first
      if (this.cache.has(normalizedUpc)) {
        this.stats.cacheHits++
        const cachedProductId = this.cache.get(normalizedUpc)!
        results.push({
          sourceProductId: sp.id,
          productId: cachedProductId,
        })
        if (cachedProductId) {
          this.stats.matchesFound++
        }
        continue
      }

      // Need DB lookup - track source products per UPC for later
      if (!sourceProductByNormalizedUpc.has(normalizedUpc)) {
        sourceProductByNormalizedUpc.set(normalizedUpc, [])
        upcsToLookup.push(normalizedUpc)
      }
      sourceProductByNormalizedUpc.get(normalizedUpc)!.push(sp.id)
    }

    // Batch lookup from DB if needed
    if (upcsToLookup.length > 0) {
      this.stats.dbLookups += upcsToLookup.length
      const matchedProducts = await this.fetchProductsByUpc(upcsToLookup)

      // Update cache and build results
      for (const normalizedUpc of upcsToLookup) {
        const productId = matchedProducts.get(normalizedUpc) ?? null
        this.cache.set(normalizedUpc, productId)

        const sourceProductIds = sourceProductByNormalizedUpc.get(normalizedUpc) ?? []
        for (const sourceProductId of sourceProductIds) {
          results.push({ sourceProductId, productId })
          if (productId) {
            this.stats.matchesFound++
          }
        }
      }
    }

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
      hitRate:
        this.stats.totalLookups > 0
          ? ((this.stats.cacheHits / this.stats.totalLookups) * 100).toFixed(1)
          : '0',
      matchRate:
        this.stats.totalLookups > 0
          ? ((this.stats.matchesFound / this.stats.totalLookups) * 100).toFixed(1)
          : '0',
    }
  }
}

/**
 * Batch update source_products.productId after matching
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
