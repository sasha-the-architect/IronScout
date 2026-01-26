/**
 * My Loadout Service
 *
 * Provides unified data for the My Loadout dashboard:
 * - Gun Locker ammo preferences with current prices
 * - Watching items with prices and status
 * - Market activity stats
 *
 * Per ADR-006: Assistive only, no recommendations or verdicts
 */

import { prisma } from '@ironscout/db'
import { getRedisClient } from '../config/redis'
import { loggers } from '../config/logger'
import { batchGetPricesViaProductLinks } from './ai-search/price-resolver'
import { getGuns, type Gun, type CaliberValue } from './gun-locker'
import { getPreferencesForFirearm, type AmmoPreference } from './firearm-ammo-preference'

const log = loggers.dashboard

// Cache configuration
const LOADOUT_CACHE_PREFIX = 'loadout:'
const LOADOUT_CACHE_TTL = 60 // 60 seconds

// ============================================================================
// TYPES
// ============================================================================

export interface AmmoItemWithPrice {
  id: string
  ammoSkuId: string
  name: string
  caliber: string | null
  brand: string | null
  grainWeight: number | null
  roundCount: number | null
  useCase: string
  firearmId: string
  firearmNickname: string | null
  firearmCaliber: string
  // Price data
  priceRange: {
    min: number
    max: number
    retailerCount: number
  } | null
  inStock: boolean
}

export interface WatchingItemWithPrice {
  id: string
  productId: string
  name: string
  caliber: string | null
  brand: string | null
  grainWeight: number | null
  bulletType: string | null
  roundCount: number | null
  imageUrl: string | null
  // Price data
  priceRange: {
    min: number
    max: number
    retailerCount: number
  } | null
  inStock: boolean
  // Status (existing watchlist statuses)
  status: 'lowest-90-days' | 'price-moved' | 'back-in-stock' | null
}

export interface MarketActivityStats {
  retailersTracked: number
  itemsInStock: number
  lastUpdated: string
  topCalibers: Array<{
    caliber: string
    count: number
  }>
}

export interface LoadoutData {
  gunLocker: {
    firearms: Array<{
      id: string
      caliber: string
      nickname: string | null
      imageUrl: string | null
      ammoItems: AmmoItemWithPrice[]
    }>
    totalAmmoItems: number
  }
  watching: {
    items: WatchingItemWithPrice[]
    totalCount: number
  }
  marketActivity: MarketActivityStats
  lastUpdatedAt: string
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Get My Loadout data for a user
 */
export async function getLoadoutData(userId: string): Promise<LoadoutData> {
  const functionStart = performance.now()

  // Check cache
  const cacheKey = `${LOADOUT_CACHE_PREFIX}${userId}`
  try {
    const redis = getRedisClient()
    const cached = await redis.get(cacheKey)
    if (cached) {
      log.debug('LOADOUT_CACHE_HIT', { userId })
      return JSON.parse(cached)
    }
  } catch (e) {
    log.warn('LOADOUT_CACHE_ERROR', { error: e instanceof Error ? e.message : String(e) })
  }

  const now = new Date()

  // Fetch data in parallel
  const [gunLockerData, watchingData, marketActivity] = await Promise.all([
    getGunLockerWithPrices(userId),
    getWatchingWithPrices(userId, now),
    getMarketActivityStats(),
  ])

  const result: LoadoutData = {
    gunLocker: gunLockerData,
    watching: watchingData,
    marketActivity,
    lastUpdatedAt: now.toISOString(),
  }

  // Cache result
  try {
    const redis = getRedisClient()
    await redis.setex(cacheKey, LOADOUT_CACHE_TTL, JSON.stringify(result))
  } catch (e) {
    log.warn('LOADOUT_CACHE_SET_ERROR', { error: e instanceof Error ? e.message : String(e) })
  }

  log.info('LOADOUT_TOTAL', {
    userId,
    durationMs: Math.round(performance.now() - functionStart),
    firearmCount: gunLockerData.firearms.length,
    ammoItemCount: gunLockerData.totalAmmoItems,
    watchingCount: watchingData.totalCount,
  })

  return result
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get Gun Locker firearms with ammo preferences and current prices
 */
async function getGunLockerWithPrices(userId: string): Promise<LoadoutData['gunLocker']> {
  // Get user's firearms
  const firearms = await getGuns(userId)

  if (firearms.length === 0) {
    return { firearms: [], totalAmmoItems: 0 }
  }

  // Get ammo preferences for all firearms
  const firearmDataPromises = firearms.map(async (firearm) => {
    const groups = await getPreferencesForFirearm(userId, firearm.id)

    // Flatten preferences from all groups
    const allPreferences: AmmoPreference[] = []
    for (const group of groups) {
      allPreferences.push(...group.preferences)
    }

    return {
      firearm,
      preferences: allPreferences,
    }
  })

  const firearmData = await Promise.all(firearmDataPromises)

  // Collect all ammo SKU IDs for batch price fetch
  const allAmmoSkuIds: string[] = []
  for (const { preferences } of firearmData) {
    for (const pref of preferences) {
      allAmmoSkuIds.push(pref.ammoSkuId)
    }
  }

  // Batch fetch prices
  const pricesMap = allAmmoSkuIds.length > 0
    ? await batchGetPricesViaProductLinks(allAmmoSkuIds)
    : new Map()

  // Build result with prices
  let totalAmmoItems = 0
  const result = firearmData.map(({ firearm, preferences }) => {
    const ammoItems: AmmoItemWithPrice[] = preferences.map((pref) => {
      const prices = pricesMap.get(pref.ammoSkuId) || []
      const inStockPrices = prices.filter((p: any) => p.inStock)

      let priceRange: AmmoItemWithPrice['priceRange'] = null
      if (inStockPrices.length > 0) {
        const priceValues = inStockPrices.map((p: any) => {
          const price = parseFloat(p.price.toString())
          const roundCount = pref.ammoSku.roundCount || 1
          return price / roundCount
        })
        priceRange = {
          min: Math.round(Math.min(...priceValues) * 1000) / 1000,
          max: Math.round(Math.max(...priceValues) * 1000) / 1000,
          retailerCount: inStockPrices.length,
        }
      }

      totalAmmoItems++

      return {
        id: pref.id,
        ammoSkuId: pref.ammoSkuId,
        name: pref.ammoSku.name,
        caliber: pref.ammoSku.caliber,
        brand: pref.ammoSku.brand,
        grainWeight: pref.ammoSku.grainWeight,
        roundCount: pref.ammoSku.roundCount,
        useCase: pref.useCase,
        firearmId: firearm.id,
        firearmNickname: firearm.nickname,
        firearmCaliber: firearm.caliber,
        priceRange,
        inStock: inStockPrices.length > 0,
      }
    })

    return {
      id: firearm.id,
      caliber: firearm.caliber,
      nickname: firearm.nickname,
      imageUrl: firearm.imageUrl,
      ammoItems,
    }
  })

  return {
    firearms: result,
    totalAmmoItems,
  }
}

/**
 * Get watching items with current prices and status
 */
async function getWatchingWithPrices(
  userId: string,
  now: Date
): Promise<LoadoutData['watching']> {
  // Get watchlist items
  // Per ADR-011A Section 17.2: All user-facing queries MUST include deletedAt: null
  const watchlistItems = await prisma.watchlist_items.findMany({
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
          grainWeight: true,
          bulletType: true,
          roundCount: true,
          imageUrl: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  const totalCount = watchlistItems.length

  if (totalCount === 0) {
    return { items: [], totalCount: 0 }
  }

  // Get product IDs for price fetch
  const productIds = watchlistItems
    .map((item: any) => item.products?.id)
    .filter((id): id is string => !!id)

  // Batch fetch prices
  const pricesMap = productIds.length > 0
    ? await batchGetPricesViaProductLinks(productIds)
    : new Map()

  // Get 90-day lowest prices for status calculation
  const ninetyDaysAgo = new Date(now)
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const lowestPrices = productIds.length > 0
    ? await prisma.$queryRaw<Array<{ productId: string; lowestPrice: any }>>`
        SELECT
          p.id as "productId",
          MIN(pr.price) as "lowestPrice"
        FROM products p
        JOIN product_links pl ON pl."productId" = p.id
        JOIN prices pr ON pr."sourceProductId" = pl."sourceProductId"
        JOIN retailers r ON r.id = pr."retailerId"
        LEFT JOIN merchant_retailers mr ON mr."retailerId" = r.id AND mr.status = 'ACTIVE'
        LEFT JOIN affiliate_feed_runs afr ON afr.id = pr."affiliateFeedRunId"
        WHERE p.id = ANY(${productIds})
          AND pl.status IN ('MATCHED', 'CREATED')
          AND pr."observedAt" >= ${ninetyDaysAgo}
          AND r."visibilityStatus" = 'ELIGIBLE'
          AND (mr.id IS NULL OR (mr."listingStatus" = 'LISTED' AND mr.status = 'ACTIVE'))
          AND (pr."affiliateFeedRunId" IS NULL OR afr."ignoredAt" IS NULL)
        GROUP BY p.id
      `
    : []

  const lowestMap = new Map(
    lowestPrices.map((l) => [l.productId, parseFloat(l.lowestPrice.toString())])
  )

  // Build items with prices and status
  const items: WatchingItemWithPrice[] = []

  for (const item of watchlistItems) {
    const product = (item as any).products
    if (!product) continue

    const prices = pricesMap.get(product.id) || []
    const inStockPrices = prices.filter((p: any) => p.inStock)

    let priceRange: WatchingItemWithPrice['priceRange'] = null
    let bestPrice: number | null = null

    if (inStockPrices.length > 0) {
      const roundCount = product.roundCount ?? 1
      const priceValues = inStockPrices.map((p: any) =>
        parseFloat(p.price.toString()) / roundCount
      )
      bestPrice = Math.min(...inStockPrices.map((p: any) => parseFloat(p.price.toString())))
      priceRange = {
        min: Math.round(Math.min(...priceValues) * 1000) / 1000,
        max: Math.round(Math.max(...priceValues) * 1000) / 1000,
        retailerCount: inStockPrices.length,
      }
    }

    // Determine status
    let status: WatchingItemWithPrice['status'] = null
    const lowest90d = lowestMap.get(product.id)

    if (bestPrice && lowest90d && bestPrice <= lowest90d) {
      status = 'lowest-90-days'
    }

    items.push({
      id: item.id,
      productId: product.id,
      name: product.name,
      caliber: product.caliber,
      brand: product.brand,
      grainWeight: product.grainWeight,
      bulletType: product.bulletType,
      roundCount: product.roundCount,
      imageUrl: product.imageUrl,
      priceRange,
      inStock: inStockPrices.length > 0,
      status,
    })
  }

  return { items, totalCount }
}

/**
 * Get market activity stats
 * These are aggregated stats, not user-specific
 */
async function getMarketActivityStats(): Promise<MarketActivityStats> {
  const now = new Date()
  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  // Count eligible retailers
  // ADR-005: Visibility predicate for retailer eligibility
  const retailerCount = await prisma.retailers.count({
    where: {
      visibilityStatus: 'ELIGIBLE',
    },
  })

  // Count in-stock items (deduplicated by product) from last 7 days
  const inStockCount = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(DISTINCT p.id) as count
    FROM products p
    JOIN product_links pl ON pl."productId" = p.id
    JOIN prices pr ON pr."sourceProductId" = pl."sourceProductId"
    JOIN retailers r ON r.id = pr."retailerId"
    LEFT JOIN merchant_retailers mr ON mr."retailerId" = r.id AND mr.status = 'ACTIVE'
    LEFT JOIN affiliate_feed_runs afr ON afr.id = pr."affiliateFeedRunId"
    WHERE pl.status IN ('MATCHED', 'CREATED')
      AND pr."inStock" = true
      AND pr."observedAt" >= ${sevenDaysAgo}
      AND r."visibilityStatus" = 'ELIGIBLE'
      AND (mr.id IS NULL OR (mr."listingStatus" = 'LISTED' AND mr.status = 'ACTIVE'))
      AND (pr."affiliateFeedRunId" IS NULL OR afr."ignoredAt" IS NULL)
  `

  // Get top calibers by in-stock count
  const topCalibers = await prisma.$queryRaw<Array<{ caliber: string; count: bigint }>>`
    SELECT p.caliber, COUNT(DISTINCT p.id) as count
    FROM products p
    JOIN product_links pl ON pl."productId" = p.id
    JOIN prices pr ON pr."sourceProductId" = pl."sourceProductId"
    JOIN retailers r ON r.id = pr."retailerId"
    LEFT JOIN merchant_retailers mr ON mr."retailerId" = r.id AND mr.status = 'ACTIVE'
    LEFT JOIN affiliate_feed_runs afr ON afr.id = pr."affiliateFeedRunId"
    WHERE pl.status IN ('MATCHED', 'CREATED')
      AND pr."inStock" = true
      AND pr."observedAt" >= ${sevenDaysAgo}
      AND r."visibilityStatus" = 'ELIGIBLE'
      AND (mr.id IS NULL OR (mr."listingStatus" = 'LISTED' AND mr.status = 'ACTIVE'))
      AND (pr."affiliateFeedRunId" IS NULL OR afr."ignoredAt" IS NULL)
      AND p.caliber IS NOT NULL
    GROUP BY p.caliber
    ORDER BY count DESC
    LIMIT 8
  `

  return {
    retailersTracked: retailerCount,
    itemsInStock: Number(inStockCount[0]?.count ?? 0),
    lastUpdated: now.toISOString(),
    topCalibers: topCalibers.map((c) => ({
      caliber: c.caliber,
      count: Number(c.count),
    })),
  }
}
