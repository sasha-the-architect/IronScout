/**
 * Dashboard State Service
 *
 * Implements Dashboard v4 state resolution per dashboard-product-spec.md.
 * State is resolved server-side and returned as a resolved enum to the frontend.
 *
 * States (in evaluation order):
 * - BRAND_NEW: 0 watchlist items
 * - NEW: 1-4 watchlist items
 * - NEEDS_ALERTS: >=5 items, at least 1 missing active alerts
 * - POWER_USER: >=7 items + alerts delivered this week
 * - RETURNING: >=5 items + alerts delivered this week
 * - HEALTHY: >=5 items, all alerts active
 */

import { prisma } from '@ironscout/db'
import { batchGetPricesViaProductLinks } from './ai-search/price-resolver'

export type DashboardState =
  | 'BRAND_NEW'
  | 'NEW'
  | 'NEEDS_ALERTS'
  | 'HEALTHY'
  | 'RETURNING'
  | 'POWER_USER'

export interface DashboardStateContext {
  state: DashboardState
  watchlistCount: number
  alertsConfigured: number
  alertsMissing: number
  priceDropsThisWeek: number
}

export interface WatchlistPreviewItem {
  id: string
  productId: string
  name: string
  caliber: string | null
  brand: string | null
  price: number | null
  pricePerRound: number | null
  inStock: boolean
  imageUrl: string | null
  notificationsEnabled: boolean
  createdAt: Date
}

/**
 * Resolve dashboard state for a user
 *
 * Resolution order matters - evaluated top to bottom:
 * 1. BRAND_NEW (0 items)
 * 2. NEW (1-4 items)
 * 3. NEEDS_ALERTS (>=5 items, missing alerts)
 * 4. POWER_USER (>=7 items + alerts this week)
 * 5. RETURNING (>=5 items + alerts this week)
 * 6. HEALTHY (>=5 items, all alerts active)
 */
export async function resolveDashboardState(
  userId: string
): Promise<DashboardStateContext> {
  // Get watchlist items with notification status
  // Per ADR-011A Section 17.2: All user-facing queries MUST include deletedAt: null
  const watchlistItems = await prisma.watchlist_items.findMany({
    where: {
      userId,
      deletedAt: null,
    },
    select: {
      id: true,
      notificationsEnabled: true,
      lastPriceNotifiedAt: true,
      lastStockNotifiedAt: true,
    },
  })

  const watchlistCount = watchlistItems.length

  // Count items with notifications enabled (alerts configured)
  const alertsConfigured = watchlistItems.filter(
    (item) => item.notificationsEnabled
  ).length
  const alertsMissing = watchlistCount - alertsConfigured

  // Count alerts delivered this week (price drops caught)
  // Use lastPriceNotifiedAt or lastStockNotifiedAt within last 7 days
  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

  const priceDropsThisWeek = watchlistItems.filter((item) => {
    const priceNotified = item.lastPriceNotifiedAt
      ? new Date(item.lastPriceNotifiedAt) > oneWeekAgo
      : false
    const stockNotified = item.lastStockNotifiedAt
      ? new Date(item.lastStockNotifiedAt) > oneWeekAgo
      : false
    return priceNotified || stockNotified
  }).length

  // Resolve state in priority order
  let state: DashboardState

  if (watchlistCount === 0) {
    state = 'BRAND_NEW'
  } else if (watchlistCount <= 4) {
    state = 'NEW'
  } else if (alertsMissing > 0) {
    state = 'NEEDS_ALERTS'
  } else if (watchlistCount >= 7 && priceDropsThisWeek > 0) {
    state = 'POWER_USER'
  } else if (priceDropsThisWeek > 0) {
    state = 'RETURNING'
  } else {
    state = 'HEALTHY'
  }

  return {
    state,
    watchlistCount,
    alertsConfigured,
    alertsMissing,
    priceDropsThisWeek,
  }
}

/**
 * Get watchlist preview items for dashboard display
 *
 * Returns a subset of watchlist items with product details for dashboard preview.
 * Limit is determined by dashboard state (3 for most, 7 for POWER_USER).
 */
export async function getWatchlistPreview(
  userId: string,
  limit: number = 3
): Promise<WatchlistPreviewItem[]> {
  // Per ADR-011A Section 17.2: All user-facing queries MUST include deletedAt: null
  const items = await prisma.watchlist_items.findMany({
    where: {
      userId,
      deletedAt: null,
    },
    include: {
      products: {
        select: {
          id: true,
          name: true,
          caliber: true,
          brand: true,
          imageUrl: true,
          roundCount: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  // Get current best prices for these products
  // Per Spec v1.2 §0.0: Query through product_links for prices
  const productIds = items
    .map((item: any) => item.products?.id)
    .filter((id): id is string => id !== null && id !== undefined)

  // Build price lookup (best price per product)
  const priceByProduct = new Map<string, { price: number; inStock: boolean }>()

  if (productIds.length > 0) {
    const pricesMap = await batchGetPricesViaProductLinks(productIds)

    for (const [productId, prices] of pricesMap.entries()) {
      // Filter for in-stock and sort by price
      const inStockPrices = prices
        .filter((p: any) => p.inStock)
        .sort((a: any, b: any) => parseFloat(a.price.toString()) - parseFloat(b.price.toString()))

      if (inStockPrices.length > 0) {
        priceByProduct.set(productId, {
          price: parseFloat(inStockPrices[0].price.toString()),
          inStock: true,
        })
      } else if (prices.length > 0) {
        // No in-stock prices, use cheapest anyway
        const sortedPrices = [...prices].sort(
          (a: any, b: any) => parseFloat(a.price.toString()) - parseFloat(b.price.toString())
        )
        priceByProduct.set(productId, {
          price: parseFloat(sortedPrices[0].price.toString()),
          inStock: false,
        })
      }
    }
  }

  return items
    .filter((item: any) => item.products !== null)
    .map((item: any) => {
      const product = item.products!
      const priceData = priceByProduct.get(product.id)
      const roundCount = product.roundCount ?? 0

      return {
        id: item.id,
        productId: product.id,
        name: product.name,
        caliber: product.caliber,
        brand: product.brand,
        price: priceData?.price ?? null,
        pricePerRound:
          priceData && roundCount > 0
            ? Math.round((priceData.price / roundCount) * 1000) / 1000
            : null,
        inStock: priceData?.inStock ?? false,
        imageUrl: product.imageUrl,
        notificationsEnabled: item.notificationsEnabled,
        createdAt: item.createdAt,
      }
    })
}
