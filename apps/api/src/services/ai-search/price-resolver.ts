/**
 * Price Resolver Utilities
 *
 * Helper functions for accessing prices through the Product Resolver's
 * product_links table. Per Spec v1.2 §0.0, this is the canonical path
 * for price grouping.
 *
 * Query path: products → product_links → source_products → prices
 */

import { prisma, Prisma } from '@ironscout/db'
import { visiblePriceWhere } from '../../config/tiers'

/**
 * Get prices for a canonical product through product_links
 *
 * This implements the spec-compliant query path:
 * products ← product_links ← source_products → prices
 *
 * @param productId - Canonical product ID
 * @returns Prices with retailer info, grouped by source_product
 */
export async function getPricesViaProductLinks(productId: string) {
  // Find all source_products linked to this canonical product
  const links = await prisma.product_links.findMany({
    where: {
      productId,
      status: 'MATCHED', // Only consider matched links
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

  // Get prices for all linked source_products
  const prices = await prisma.prices.findMany({
    where: {
      sourceProductId: { in: sourceProductIds },
      ...visiblePriceWhere(),
    },
    include: {
      retailers: true,
      source_products: {
        select: {
          id: true,
          title: true,
          url: true,
        },
      },
    },
    orderBy: [
      { retailers: { tier: 'desc' } },
      { price: 'asc' },
    ],
  })

  return prices
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
  // Find all source_products linked to these canonical products
  const links = await prisma.product_links.findMany({
    where: {
      productId: { in: productIds },
      status: 'MATCHED',
    },
    select: {
      sourceProductId: true,
      productId: true,
      confidence: true,
    },
  })

  if (links.length === 0) {
    return new Map(productIds.map(id => [id, []]))
  }

  // Build sourceProductId → productId mapping
  const sourceToProduct = new Map<string, string>()
  for (const link of links) {
    if (link.productId) {
      sourceToProduct.set(link.sourceProductId, link.productId)
    }
  }

  const sourceProductIds = Array.from(sourceToProduct.keys())

  // Get all prices for linked source_products
  const prices = await prisma.prices.findMany({
    where: {
      sourceProductId: { in: sourceProductIds },
      ...visiblePriceWhere(),
    },
    include: {
      retailers: true,
    },
    orderBy: [
      { retailers: { tier: 'desc' } },
      { price: 'asc' },
    ],
  })

  // Group prices by canonical product
  const result = new Map<string, any[]>(productIds.map(id => [id, []]))

  for (const price of prices) {
    if (price.sourceProductId) {
      const productId = sourceToProduct.get(price.sourceProductId)
      if (productId) {
        result.get(productId)?.push(price)
      }
    }
  }

  return result
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
  const count = await prisma.product_links.count({
    where: {
      productId,
      status: 'MATCHED',
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
