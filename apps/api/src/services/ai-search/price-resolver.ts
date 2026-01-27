/**
 * Price Resolver Utilities
 *
 * Helper functions for accessing prices through the Product Resolver's
 * product_links table. Per Spec v1.2 §0.0, this is the canonical path
 * for price grouping.
 *
 * Per ADR-015: Hot-path queries now read from current_visible_prices
 * derived table instead of evaluating corrections at query time.
 *
 * Query path: products → product_links → source_products → current_visible_prices
 */

import { prisma, Prisma } from '@ironscout/db'
import { currentVisiblePriceWhere } from '../../config/tiers'

/**
 * Get prices for a canonical product through product_links
 *
 * Per ADR-015: Now reads from current_visible_prices derived table
 * instead of evaluating corrections at query time.
 *
 * Query path: product_links → source_products → current_visible_prices
 *
 * @param productId - Canonical product ID
 * @returns Prices with retailer info (denormalized in derived table)
 */
export async function getPricesViaProductLinks(productId: string) {
  // Find all source_products linked to this canonical product
  // Per Spec v1.2 §0.0: Query path must include both MATCHED and CREATED links
  const links = await prisma.product_links.findMany({
    where: {
      productId,
      status: { in: ['MATCHED', 'CREATED'] },
    },
    select: {
      sourceProductId: true,
      confidence: true,
      matchType: true,
    },
  })

  if (links.length === 0) {
    return []
  }

  const sourceProductIds = links.map(l => l.sourceProductId)

  // ADR-015: Query derived table instead of prices with corrections overlay
  // The derived table already has retailer info denormalized
  const prices = await prisma.current_visible_prices.findMany({
    where: {
      sourceProductId: { in: sourceProductIds },
      ...currentVisiblePriceWhere(),
    },
    orderBy: [
      { retailerTier: 'desc' },
      { visiblePrice: 'asc' },
    ],
  })

  // Transform to match the previous return shape for API compatibility
  return prices.map(p => ({
    ...p,
    price: p.visiblePrice, // Use corrected price as the visible price
    retailers: {
      id: p.retailerId,
      name: p.retailerName,
      tier: p.retailerTier,
    },
  }))
}

/**
 * Result from batch price resolution including confidence.
 */
export interface BatchPriceResult {
  /** Map of productId → prices */
  pricesMap: Map<string, any[]>
  /** Map of productId → max product_links.confidence (ProductResolver.matchScore) */
  confidenceMap: Map<string, number>
}

/**
 * Get prices for multiple canonical products through product_links
 * Optimized for batch operations
 *
 * @param productIds - Array of canonical product IDs
 * @returns Map of productId → prices
 */
export async function batchGetPricesViaProductLinks(
  productIds: string[]
): Promise<Map<string, any[]>> {
  const result = await batchGetPricesWithConfidence(productIds)
  return result.pricesMap
}

/**
 * Get prices and confidence for multiple canonical products through product_links.
 * Per search-lens-v1.md: canonicalConfidence source = ProductResolver.matchScore
 *
 * Per ADR-015: Now reads from current_visible_prices derived table
 * instead of evaluating corrections at query time.
 *
 * @param productIds - Array of canonical product IDs
 * @returns Prices and max confidence per product
 */
export async function batchGetPricesWithConfidence(
  productIds: string[]
): Promise<BatchPriceResult> {
  // Find all source_products linked to these canonical products
  // Per Spec v1.2 §0.0: Query path must include both MATCHED and CREATED links
  const links = await prisma.product_links.findMany({
    where: {
      productId: { in: productIds },
      status: { in: ['MATCHED', 'CREATED'] },
    },
    select: {
      sourceProductId: true,
      productId: true,
      confidence: true,
    },
  })

  if (links.length === 0) {
    return {
      pricesMap: new Map(productIds.map(id => [id, []])),
      confidenceMap: new Map(productIds.map(id => [id, 0])),
    }
  }

  // Build sourceProductId → productId mapping
  const sourceToProduct = new Map<string, string>()
  // Track max confidence per productId for canonicalConfidence
  const confidenceMap = new Map<string, number>(productIds.map(id => [id, 0]))

  for (const link of links) {
    if (link.productId) {
      sourceToProduct.set(link.sourceProductId, link.productId)
      // Track max confidence per product (ProductResolver.matchScore)
      const currentMax = confidenceMap.get(link.productId) ?? 0
      const linkConfidence = Number(link.confidence)
      if (linkConfidence > currentMax) {
        confidenceMap.set(link.productId, linkConfidence)
      }
    }
  }

  const sourceProductIds = Array.from(sourceToProduct.keys())

  // ADR-015: Query derived table instead of prices with corrections overlay
  const prices = await prisma.current_visible_prices.findMany({
    where: {
      sourceProductId: { in: sourceProductIds },
      ...currentVisiblePriceWhere(),
    },
    orderBy: [
      { retailerTier: 'desc' },
      { visiblePrice: 'asc' },
    ],
  })

  // Group prices by canonical product
  const pricesMap = new Map<string, any[]>(productIds.map(id => [id, []]))

  for (const price of prices) {
    if (price.sourceProductId) {
      const productId = sourceToProduct.get(price.sourceProductId)
      if (productId) {
        // Transform to match expected shape for API compatibility
        pricesMap.get(productId)?.push({
          ...price,
          price: price.visiblePrice, // Use corrected price
          retailers: {
            id: price.retailerId,
            name: price.retailerName,
            tier: price.retailerTier,
          },
        })
      }
    }
  }

  return { pricesMap, confidenceMap }
}

/**
 * Search products and get prices via product_links
 *
 * This is the spec-compliant search that JOINs through product_links
 * for price grouping. Use this for new code paths.
 *
 * @param where - Prisma where clause for products
 * @param options - Pagination and field selection options
 * @returns Products with prices resolved through product_links
 */
export async function searchWithResolvedPrices(
  where: Prisma.productsWhereInput,
  options: {
    skip?: number
    take?: number
    select?: Prisma.productsSelect
    includePremiumFields?: boolean
  } = {}
): Promise<any[]> {
  const { skip = 0, take = 20, includePremiumFields = false } = options

  // First, get products
  const products = await prisma.products.findMany({
    where,
    skip,
    take,
    select: options.select || {
      id: true,
      name: true,
      description: true,
      category: true,
      brand: true,
      imageUrl: true,
      upc: true,
      caliber: true,
      grainWeight: true,
      caseMaterial: true,
      purpose: true,
      roundCount: true,
      createdAt: true,
      canonicalKey: true,
      ...(includePremiumFields ? {
        bulletType: true,
        pressureRating: true,
        muzzleVelocityFps: true,
        isSubsonic: true,
        shortBarrelOptimized: true,
        suppressorSafe: true,
        lowFlash: true,
        lowRecoil: true,
        controlledExpansion: true,
        matchGrade: true,
        factoryNew: true,
        dataSource: true,
        dataConfidence: true,
        metadata: true,
      } : {}),
    },
    orderBy: { createdAt: 'desc' },
  })

  if (products.length === 0) {
    return []
  }

  // Batch get prices through product_links
  const productIds = products.map((p: { id: string }) => p.id)
  const pricesMap = await batchGetPricesViaProductLinks(productIds)

  // Merge prices into products
  return products.map((p: { id: string }) => ({
    ...p,
    prices: pricesMap.get(p.id) || [],
  }))
}

/**
 * Check if a product has prices resolved through product_links
 * Useful for determining if a product is using the new resolver path
 *
 * @param productId - Canonical product ID
 * @returns True if product has linked prices
 */
export async function hasResolvedPrices(productId: string): Promise<boolean> {
  // Per Spec v1.2 §0.0: Both MATCHED and CREATED links represent resolved prices
  const count = await prisma.product_links.count({
    where: {
      productId,
      status: { in: ['MATCHED', 'CREATED'] },
    },
  })
  return count > 0
}

/**
 * Get resolver statistics for a product
 * Useful for debugging and admin UI
 *
 * @param productId - Canonical product ID
 * @returns Link stats including match types and confidence
 */
export async function getProductLinkStats(productId: string) {
  const links = await prisma.product_links.findMany({
    where: { productId },
    select: {
      status: true,
      matchType: true,
      confidence: true,
      resolverVersion: true,
      resolvedAt: true,
    },
  })

  return {
    totalLinks: links.length,
    matchedLinks: links.filter(l => l.status === 'MATCHED').length,
    byMatchType: links.reduce((acc, l) => {
      acc[l.matchType] = (acc[l.matchType] || 0) + 1
      return acc
    }, {} as Record<string, number>),
    avgConfidence: links.length > 0
      ? links.reduce((sum, l) => sum + Number(l.confidence), 0) / links.length
      : 0,
    resolverVersions: [...new Set(links.map(l => l.resolverVersion))],
  }
}
