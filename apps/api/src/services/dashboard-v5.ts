/**
 * Dashboard v5 Service
 *
 * @deprecated This service is deprecated in favor of the loadout service (loadout.ts).
 * The loadout service provides a cleaner, more modular approach with:
 * - Gun Locker with ammo preferences and prices
 * - Watching items with status
 * - Market activity stats
 *
 * This file is kept for backwards compatibility but should not be used for new features.
 * TODO: Remove once all consumers have migrated to /api/dashboard/loadout
 *
 * ---
 * Legacy documentation (for reference):
 * Per ADR-020 and dashboard-product-spec-v5.md:
 * - Status-oriented monitoring surface
 * - Spotlight: single synthesized signal
 * - Watchlist: status lines, no badges
 * - Price Movement: folded from market deals
 * - Back in Stock: separate section
 * - Gun Locker matches: contextual
 *
 * Section limits: Spotlight (1), Watchlist (10), Price Movement (5),
 * Back in Stock (5), Gun Locker (5)
 */

import { prisma } from '@ironscout/db'
import { getRedisClient } from '../config/redis'
import { loggers } from '../config/logger'
import { getUserCalibers, normalizeCaliber, type CaliberValue } from './gun-locker'
import { batchGetPricesViaProductLinks } from './ai-search/price-resolver'

const log = loggers.dashboard

// Cache configuration
const DASHBOARD_V5_CACHE_PREFIX = 'dashboard:v5:'
const DASHBOARD_V5_CACHE_TTL = 60 // 60 seconds

// Section limits per spec
const WATCHLIST_LIMIT = 10
const PRICE_MOVEMENT_LIMIT = 5
const BACK_IN_STOCK_LIMIT = 5
const GUN_LOCKER_LIMIT = 5

// Signal age thresholds (hours)
const ACTIVE_THRESHOLD_HOURS = 24
const STALE_THRESHOLD_HOURS = 168 // 7 days

// ============================================================================
// TYPES
// ============================================================================

type SignalAge = 'ACTIVE' | 'STALE' | 'CLEARED'
type BadgeType = '90-day-low' | 'price-drop' | 'back-in-stock'
type WatchlistStatus = 'lowest-90-days' | 'price-moved' | 'back-in-stock' | null
type SpotlightSignalType = 'largest-price-movement' | 'back-in-stock-watched' | 'lowest-90-days'

interface SpotlightData {
  productId: string
  productName: string
  attributes: string
  pricePerRound: number
  retailerName: string
  signalType: SpotlightSignalType
  signalAge: SignalAge
  changePercent?: number
  previousPrice?: number
}

interface WatchlistItem {
  id: string
  productId: string
  productName: string
  attributes: string
  pricePerRound: number | null
  status: WatchlistStatus
  inStock: boolean
}

interface AlertItem {
  id: string
  productId: string
  productName: string
  attributes: string
  pricePerRound: number
  retailerName: string
  badgeType: BadgeType
  signalAge: SignalAge
  explanation: string
}

interface GunLockerMatchItem {
  id: string
  productId: string
  productName: string
  attributes: string
  pricePerRound: number
  matchedCaliber: string
}

export interface DashboardV5Data {
  spotlight: SpotlightData | null
  watchlist: {
    items: WatchlistItem[]
    totalCount: number
  }
  priceMovement: AlertItem[]
  backInStock: AlertItem[]
  gunLockerMatches: GunLockerMatchItem[]
  hasGunLocker: boolean
  lastUpdatedAt: string
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Get Dashboard v5 data for a user
 */
export async function getDashboardV5Data(userId: string): Promise<DashboardV5Data> {
  const functionStart = performance.now()

  // Check cache
  const cacheKey = `${DASHBOARD_V5_CACHE_PREFIX}${userId}`
  try {
    const redis = getRedisClient()
    const cached = await redis.get(cacheKey)
    if (cached) {
      log.debug('DASHBOARD_V5_CACHE_HIT', { userId })
      return JSON.parse(cached)
    }
  } catch (e) {
    log.warn('DASHBOARD_V5_CACHE_ERROR', { error: e instanceof Error ? e.message : String(e) })
  }

  const now = new Date()

  // Get user's gun locker calibers
  const userCalibers = await getUserCalibers(userId)
  const hasGunLocker = userCalibers.length > 0
  const caliberSet = new Set(userCalibers)

  // Get watchlist items
  const watchlistResult = await getWatchlistItems(userId, now)

  // Get price movement signals (from watchlist and gun locker)
  const priceMovement = await getPriceMovementSignals(userId, userCalibers, now)

  // Get back-in-stock signals
  const backInStock = await getBackInStockSignals(userId, now)

  // Get gun locker matches (excluding items already in watchlist or alerts)
  const watchlistProductIds = new Set(watchlistResult.items.map(i => i.productId))
  const alertProductIds = new Set([
    ...priceMovement.map(i => i.productId),
    ...backInStock.map(i => i.productId),
  ])
  const gunLockerMatches = hasGunLocker
    ? await getGunLockerMatches(userCalibers, watchlistProductIds, alertProductIds)
    : []

  // Select spotlight (largest change since last visit)
  const spotlight = selectSpotlight(priceMovement, backInStock, watchlistResult.items, now)

  const result: DashboardV5Data = {
    spotlight,
    watchlist: watchlistResult,
    priceMovement: priceMovement.slice(0, PRICE_MOVEMENT_LIMIT),
    backInStock: backInStock.slice(0, BACK_IN_STOCK_LIMIT),
    gunLockerMatches: gunLockerMatches.slice(0, GUN_LOCKER_LIMIT),
    hasGunLocker,
    lastUpdatedAt: now.toISOString(),
  }

  // Cache result
  try {
    const redis = getRedisClient()
    await redis.setex(cacheKey, DASHBOARD_V5_CACHE_TTL, JSON.stringify(result))
  } catch (e) {
    log.warn('DASHBOARD_V5_CACHE_SET_ERROR', { error: e instanceof Error ? e.message : String(e) })
  }

  log.info('DASHBOARD_V5_TOTAL', {
    userId,
    durationMs: Math.round(performance.now() - functionStart),
    watchlistCount: watchlistResult.totalCount,
    priceMovementCount: priceMovement.length,
    backInStockCount: backInStock.length,
    gunLockerMatchCount: gunLockerMatches.length,
    hasSpotlight: !!spotlight,
  })

  return result
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get watchlist items with status
 */
async function getWatchlistItems(
  userId: string,
  now: Date
): Promise<{ items: WatchlistItem[]; totalCount: number }> {
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
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  const totalCount = watchlistItems.length

  // Get current prices for products
  const productIds = watchlistItems
    .map((item: any) => item.products?.id)
    .filter((id): id is string => !!id)

  const pricesMap = productIds.length > 0
    ? await batchGetPricesViaProductLinks(productIds)
    : new Map()

  // Get 90-day lowest prices
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
        WHERE p.id = ANY(${productIds})
          AND pl.status IN ('MATCHED', 'CREATED')
          AND pr."observedAt" >= ${ninetyDaysAgo}
          AND r."visibilityStatus" = 'ELIGIBLE'
          AND (mr.id IS NULL OR (mr."listingStatus" = 'LISTED' AND mr.status = 'ACTIVE'))
        GROUP BY p.id
      `
    : []

  const lowestMap = new Map(
    lowestPrices.map((l) => [l.productId, parseFloat(l.lowestPrice.toString())])
  )

  // Build watchlist items with status
  const items: WatchlistItem[] = []

  for (const item of watchlistItems) {
    const product = (item as any).products
    if (!product) continue

    const prices = pricesMap.get(product.id) || []
    const inStockPrices = prices.filter((p: any) => p.inStock)
    const bestPrice = inStockPrices.length > 0
      ? Math.min(...inStockPrices.map((p: any) => parseFloat(p.price.toString())))
      : null

    const roundCount = product.roundCount ?? 0
    const pricePerRound = bestPrice && roundCount > 0
      ? Math.round((bestPrice / roundCount) * 1000) / 1000
      : null

    // Determine status
    let status: WatchlistStatus = null
    const lowest90d = lowestMap.get(product.id)

    if (bestPrice && lowest90d && bestPrice <= lowest90d) {
      status = 'lowest-90-days'
    }
    // Note: 'price-moved' and 'back-in-stock' require tracking last-seen state
    // which would need additional user-specific tracking (future enhancement)

    // Build attributes string
    const attrs = [
      product.caliber,
      product.bulletType,
      product.grainWeight ? `${product.grainWeight}gr` : null,
    ].filter(Boolean).join(' · ')

    items.push({
      id: item.id,
      productId: product.id,
      productName: product.name,
      attributes: attrs,
      pricePerRound,
      status,
      inStock: inStockPrices.length > 0,
    })
  }

  return {
    items: items.slice(0, WATCHLIST_LIMIT),
    totalCount,
  }
}

/**
 * Get price movement signals
 */
async function getPriceMovementSignals(
  userId: string,
  userCalibers: CaliberValue[],
  now: Date
): Promise<AlertItem[]> {
  const ninetyDaysAgo = new Date(now)
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  // Get products from watchlist OR matching user calibers
  // Per ADR-011A Section 17.2: All user-facing queries MUST include deletedAt: null
  const watchlistProductIds = await prisma.watchlist_items.findMany({
    where: { userId, deletedAt: null },
    select: { products: { select: { id: true } } },
  }).then((items: any[]) =>
    items.map((i: any) => i.products?.id).filter((id): id is string => !!id)
  )

  // Build caliber filter
  const calibers = userCalibers.length > 0 ? userCalibers : []

  // Query for products with significant price movements
  const priceMovements = await prisma.$queryRaw<
    Array<{
      productId: string
      productName: string
      caliber: string | null
      brand: string | null
      bulletType: string | null
      grainWeight: number | null
      roundCount: number | null
      currentPrice: any
      medianPrice: any
      lowestPrice: any
      retailerName: string
      observedAt: Date
    }>
  >`
    WITH current_best AS (
      SELECT
        p.id as "productId",
        p.name as "productName",
        p.caliber,
        p.brand,
        p."bulletType",
        p."grainWeight",
        p."roundCount",
        pr.price as "currentPrice",
        r.name as "retailerName",
        pr."observedAt",
        ROW_NUMBER() OVER (PARTITION BY p.id ORDER BY pr.price ASC) as rn
      FROM products p
      JOIN product_links pl ON pl."productId" = p.id
      JOIN prices pr ON pr."sourceProductId" = pl."sourceProductId"
      JOIN retailers r ON r.id = pr."retailerId"
      LEFT JOIN merchant_retailers mr ON mr."retailerId" = r.id AND mr.status = 'ACTIVE'
      WHERE pl.status IN ('MATCHED', 'CREATED')
        AND pr."inStock" = true
        AND pr."observedAt" >= ${thirtyDaysAgo}
        AND r."visibilityStatus" = 'ELIGIBLE'
        AND (mr.id IS NULL OR (mr."listingStatus" = 'LISTED' AND mr.status = 'ACTIVE'))
        AND (
          p.id = ANY(${watchlistProductIds.length > 0 ? watchlistProductIds : ['__none__']})
          OR p.caliber = ANY(${calibers.length > 0 ? calibers : ['__none__']})
        )
    ),
    with_median AS (
      SELECT
        cb.*,
        (
          SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pr2.price)
          FROM prices pr2
          JOIN product_links pl2 ON pl2."sourceProductId" = pr2."sourceProductId"
          JOIN retailers r2 ON r2.id = pr2."retailerId"
          LEFT JOIN merchant_retailers mr2 ON mr2."retailerId" = r2.id AND mr2.status = 'ACTIVE'
          WHERE pl2."productId" = cb."productId"
            AND pl2.status IN ('MATCHED', 'CREATED')
            AND pr2."observedAt" >= ${thirtyDaysAgo}
            AND r2."visibilityStatus" = 'ELIGIBLE'
            AND (mr2.id IS NULL OR (mr2."listingStatus" = 'LISTED' AND mr2.status = 'ACTIVE'))
        ) as "medianPrice",
        (
          SELECT MIN(pr3.price)
          FROM prices pr3
          JOIN product_links pl3 ON pl3."sourceProductId" = pr3."sourceProductId"
          JOIN retailers r3 ON r3.id = pr3."retailerId"
          LEFT JOIN merchant_retailers mr3 ON mr3."retailerId" = r3.id AND mr3.status = 'ACTIVE'
          WHERE pl3."productId" = cb."productId"
            AND pl3.status IN ('MATCHED', 'CREATED')
            AND pr3."observedAt" >= ${ninetyDaysAgo}
            AND r3."visibilityStatus" = 'ELIGIBLE'
            AND (mr3.id IS NULL OR (mr3."listingStatus" = 'LISTED' AND mr3.status = 'ACTIVE'))
        ) as "lowestPrice"
      FROM current_best cb
      WHERE cb.rn = 1
    )
    SELECT *
    FROM with_median
    WHERE "currentPrice" <= "lowestPrice" * 1.01  -- At or near 90-day low
       OR "currentPrice" <= "medianPrice" * 0.85   -- 15%+ below median
    ORDER BY
      CASE WHEN "currentPrice" <= "medianPrice" * 0.85 THEN 0 ELSE 1 END,
      "observedAt" DESC
    LIMIT 20
  `

  // Convert to AlertItem format
  const alerts: AlertItem[] = []

  for (const pm of priceMovements) {
    const currentPrice = parseFloat(pm.currentPrice.toString())
    const medianPrice = pm.medianPrice ? parseFloat(pm.medianPrice.toString()) : null
    const lowestPrice = pm.lowestPrice ? parseFloat(pm.lowestPrice.toString()) : null
    const roundCount = pm.roundCount ?? 0

    // Determine badge type and explanation
    let badgeType: BadgeType
    let explanation: string

    if (medianPrice && currentPrice <= medianPrice * 0.85) {
      const dropPercent = Math.round(((medianPrice - currentPrice) / medianPrice) * 100)
      badgeType = 'price-drop'
      explanation = `Price dropped ${dropPercent}% below 30-day median`
    } else if (lowestPrice && currentPrice <= lowestPrice * 1.01) {
      badgeType = '90-day-low'
      explanation = 'Lowest price observed in last 90 days'
    } else {
      continue // Skip if doesn't meet criteria
    }

    // Calculate signal age
    const signalAge = calculateSignalAge(pm.observedAt, now)

    // Build attributes
    const attrs = [
      pm.caliber,
      pm.bulletType,
      pm.grainWeight ? `${pm.grainWeight}gr` : null,
    ].filter(Boolean).join(' · ')

    alerts.push({
      id: `pm-${pm.productId}`,
      productId: pm.productId,
      productName: pm.productName,
      attributes: attrs,
      pricePerRound: roundCount > 0
        ? Math.round((currentPrice / roundCount) * 1000) / 1000
        : currentPrice,
      retailerName: pm.retailerName,
      badgeType,
      signalAge,
      explanation,
    })
  }

  return alerts
}

/**
 * Get back-in-stock signals
 */
async function getBackInStockSignals(
  userId: string,
  now: Date
): Promise<AlertItem[]> {
  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  // Get user's watchlist product IDs
  const watchlistProductIds = await prisma.watchlist_items.findMany({
    where: { userId, deletedAt: null },
    select: { products: { select: { id: true } } },
  }).then((items: any[]) =>
    items.map((i: any) => i.products?.id).filter((id): id is string => !!id)
  )

  if (watchlistProductIds.length === 0) {
    return []
  }

  // Find products that were OOS for 7+ days and are now back in stock
  const backInStock = await prisma.$queryRaw<
    Array<{
      productId: string
      productName: string
      caliber: string | null
      bulletType: string | null
      grainWeight: number | null
      roundCount: number | null
      price: any
      retailerName: string
      observedAt: Date
    }>
  >`
    WITH daily_stock AS (
      SELECT
        pl."productId",
        DATE_TRUNC('day', pr."observedAt" AT TIME ZONE 'UTC') as day,
        MAX(CASE WHEN pr."inStock" THEN 1 ELSE 0 END) as had_stock
      FROM product_links pl
      JOIN prices pr ON pr."sourceProductId" = pl."sourceProductId"
      JOIN retailers r ON r.id = pr."retailerId"
      LEFT JOIN merchant_retailers mr ON mr."retailerId" = r.id AND mr.status = 'ACTIVE'
      WHERE pl."productId" = ANY(${watchlistProductIds})
        AND pl.status IN ('MATCHED', 'CREATED')
        AND pr."observedAt" >= ${thirtyDaysAgo}
        AND r."visibilityStatus" = 'ELIGIBLE'
        AND (mr.id IS NULL OR (mr."listingStatus" = 'LISTED' AND mr.status = 'ACTIVE'))
      GROUP BY pl."productId", DATE_TRUNC('day', pr."observedAt" AT TIME ZONE 'UTC')
    ),
    with_gaps AS (
      SELECT
        "productId",
        day,
        had_stock,
        day - (ROW_NUMBER() OVER (PARTITION BY "productId", had_stock ORDER BY day) * INTERVAL '1 day') as grp
      FROM daily_stock
    ),
    oos_streaks AS (
      SELECT
        "productId",
        MAX(day) as streak_end
      FROM with_gaps
      WHERE had_stock = 0
      GROUP BY "productId", grp
      HAVING COUNT(*) >= 7
    ),
    recently_restocked AS (
      SELECT DISTINCT os."productId"
      FROM oos_streaks os
      JOIN daily_stock ds ON ds."productId" = os."productId"
      WHERE ds.day > os.streak_end
        AND ds.had_stock = 1
        AND ds.day >= ${sevenDaysAgo}
    )
    SELECT
      p.id as "productId",
      p.name as "productName",
      p.caliber,
      p."bulletType",
      p."grainWeight",
      p."roundCount",
      pr.price,
      r.name as "retailerName",
      pr."observedAt"
    FROM recently_restocked rr
    JOIN products p ON p.id = rr."productId"
    JOIN product_links pl ON pl."productId" = p.id
    JOIN prices pr ON pr."sourceProductId" = pl."sourceProductId"
    JOIN retailers r ON r.id = pr."retailerId"
    LEFT JOIN merchant_retailers mr ON mr."retailerId" = r.id AND mr.status = 'ACTIVE'
    WHERE pl.status IN ('MATCHED', 'CREATED')
      AND pr."inStock" = true
      AND pr."observedAt" >= ${sevenDaysAgo}
      AND r."visibilityStatus" = 'ELIGIBLE'
      AND (mr.id IS NULL OR (mr."listingStatus" = 'LISTED' AND mr.status = 'ACTIVE'))
    ORDER BY pr."observedAt" DESC
    LIMIT 10
  `

  return backInStock.map((item) => {
    const price = parseFloat(item.price.toString())
    const roundCount = item.roundCount ?? 0

    const attrs = [
      item.caliber,
      item.bulletType,
      item.grainWeight ? `${item.grainWeight}gr` : null,
    ].filter(Boolean).join(' · ')

    return {
      id: `bis-${item.productId}`,
      productId: item.productId,
      productName: item.productName,
      attributes: attrs,
      pricePerRound: roundCount > 0
        ? Math.round((price / roundCount) * 1000) / 1000
        : price,
      retailerName: item.retailerName,
      badgeType: 'back-in-stock' as BadgeType,
      signalAge: calculateSignalAge(item.observedAt, now),
      explanation: 'Back in stock after 7+ days unavailable',
    }
  })
}

/**
 * Get gun locker matches (products matching user's calibers)
 */
async function getGunLockerMatches(
  userCalibers: CaliberValue[],
  excludeProductIds: Set<string>,
  excludeAlertProductIds: Set<string>
): Promise<GunLockerMatchItem[]> {
  if (userCalibers.length === 0) {
    return []
  }

  // Get products matching user calibers with current prices
  const matches = await prisma.$queryRaw<
    Array<{
      productId: string
      productName: string
      caliber: string
      bulletType: string | null
      grainWeight: number | null
      roundCount: number | null
      price: any
    }>
  >`
    WITH ranked AS (
      SELECT
        p.id as "productId",
        p.name as "productName",
        p.caliber,
        p."bulletType",
        p."grainWeight",
        p."roundCount",
        pr.price,
        ROW_NUMBER() OVER (PARTITION BY p.id ORDER BY pr.price ASC) as rn
      FROM products p
      JOIN product_links pl ON pl."productId" = p.id
      JOIN prices pr ON pr."sourceProductId" = pl."sourceProductId"
      JOIN retailers r ON r.id = pr."retailerId"
      LEFT JOIN merchant_retailers mr ON mr."retailerId" = r.id AND mr.status = 'ACTIVE'
      WHERE p.caliber = ANY(${userCalibers})
        AND pl.status IN ('MATCHED', 'CREATED')
        AND pr."inStock" = true
        AND pr."observedAt" >= NOW() - INTERVAL '7 days'
        AND r."visibilityStatus" = 'ELIGIBLE'
        AND (mr.id IS NULL OR (mr."listingStatus" = 'LISTED' AND mr.status = 'ACTIVE'))
    )
    SELECT * FROM ranked WHERE rn = 1
    ORDER BY price ASC
    LIMIT 20
  `

  // Filter out products already in watchlist or alerts
  const excludeIds = new Set(Array.from(excludeProductIds).concat(Array.from(excludeAlertProductIds)))

  return matches
    .filter((m) => !excludeIds.has(m.productId))
    .slice(0, GUN_LOCKER_LIMIT)
    .map((m) => {
      const price = parseFloat(m.price.toString())
      const roundCount = m.roundCount ?? 0

      const attrs = [
        m.caliber,
        m.bulletType,
        m.grainWeight ? `${m.grainWeight}gr` : null,
      ].filter(Boolean).join(' · ')

      return {
        id: `gl-${m.productId}`,
        productId: m.productId,
        productName: m.productName,
        attributes: attrs,
        pricePerRound: roundCount > 0
          ? Math.round((price / roundCount) * 1000) / 1000
          : price,
        matchedCaliber: m.caliber,
      }
    })
}

/**
 * Select spotlight signal
 * Per spec: "Largest change since your last visit"
 */
function selectSpotlight(
  priceMovement: AlertItem[],
  backInStock: AlertItem[],
  watchlistItems: WatchlistItem[],
  now: Date
): SpotlightData | null {
  // Priority: price drops > back in stock (watched) > 90-day lows
  const watchlistProductIds = new Set(watchlistItems.map((i) => i.productId))

  // Check for price drops first
  const priceDrop = priceMovement.find((a) => a.badgeType === 'price-drop')
  if (priceDrop) {
    // Extract change percent from explanation
    const match = priceDrop.explanation.match(/(\d+)%/)
    const changePercent = match ? -parseInt(match[1], 10) : undefined

    return {
      productId: priceDrop.productId,
      productName: priceDrop.productName,
      attributes: priceDrop.attributes,
      pricePerRound: priceDrop.pricePerRound,
      retailerName: priceDrop.retailerName,
      signalType: 'largest-price-movement',
      signalAge: priceDrop.signalAge,
      changePercent,
    }
  }

  // Check for back-in-stock on watched items
  const watchedBackInStock = backInStock.find((a) =>
    watchlistProductIds.has(a.productId)
  )
  if (watchedBackInStock) {
    return {
      productId: watchedBackInStock.productId,
      productName: watchedBackInStock.productName,
      attributes: watchedBackInStock.attributes,
      pricePerRound: watchedBackInStock.pricePerRound,
      retailerName: watchedBackInStock.retailerName,
      signalType: 'back-in-stock-watched',
      signalAge: watchedBackInStock.signalAge,
    }
  }

  // Check for 90-day lows
  const low90Day = priceMovement.find((a) => a.badgeType === '90-day-low')
  if (low90Day) {
    return {
      productId: low90Day.productId,
      productName: low90Day.productName,
      attributes: low90Day.attributes,
      pricePerRound: low90Day.pricePerRound,
      retailerName: low90Day.retailerName,
      signalType: 'lowest-90-days',
      signalAge: low90Day.signalAge,
    }
  }

  return null
}

/**
 * Calculate signal age based on timestamp
 */
function calculateSignalAge(timestamp: Date, now: Date): SignalAge {
  const hoursSince = (now.getTime() - timestamp.getTime()) / (1000 * 60 * 60)

  if (hoursSince < ACTIVE_THRESHOLD_HOURS) {
    return 'ACTIVE'
  }
  if (hoursSince < STALE_THRESHOLD_HOURS) {
    return 'STALE'
  }
  return 'CLEARED'
}
