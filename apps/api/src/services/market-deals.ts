/**
 * Market Deals Service
 *
 * Per dashboard_market_deals_v1_spec.md:
 * - Surfaces market-wide notable price events
 * - Eligibility: ≥15% below 30-day median, back in stock after 7+ days OOS, or lowest in 90 days
 * - Hero selection: largest price drop %, then earliest timestamp, then productId ASC (deterministic)
 * - Products with unmapped calibers are EXCLUDED (per normalization requirement)
 * - Gun Locker affects ordering/labeling ONLY, not hero selection
 */

import { prisma } from '@ironscout/db'
import { CANONICAL_CALIBERS, normalizeCaliber, type CaliberValue } from './gun-locker'

// ============================================================================
// CONFIGURATION
// Per spec: These limits should be documented and configurable
// ============================================================================

/** Maximum products to evaluate for deals (query limit) */
const MAX_PRODUCTS_TO_EVALUATE = 500

/** Maximum deals to return in response */
const MAX_DEALS_RETURNED = 10

/** Minimum price drop percentage to qualify as PRICE_DROP deal */
const PRICE_DROP_THRESHOLD_PERCENT = 15

/** Minimum price points required for median calculation */
const MIN_PRICE_POINTS_FOR_MEDIAN = 5

/**
 * Market Deal data contract per spec
 * Note: caliber is non-null because we exclude unmapped calibers
 */
export interface MarketDeal {
  productId: string
  productName: string
  caliber: CaliberValue  // NOT nullable - unmapped calibers are excluded
  pricePerRound: number | null  // null if roundCount unavailable
  price: number
  retailerName: string
  retailerId: string
  url: string
  contextLine: string
  detectedAt: Date
  reason: 'PRICE_DROP' | 'BACK_IN_STOCK' | 'LOWEST_90D'
}

export interface MarketDealsResponse {
  deals: MarketDeal[]
  hero: MarketDeal | null
  lastCheckedAt: string
}

/**
 * Get market deals based on eligibility criteria
 */
export async function getMarketDeals(): Promise<MarketDealsResponse> {
  const now = new Date()
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const ninetyDaysAgo = new Date(now)
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  // Get current best prices per product
  // ADR-005: Apply full visibility predicate
  const currentPrices = await prisma.$queryRaw<
    Array<{
      productId: string
      productName: string
      caliber: string | null
      price: any
      roundCount: number | null
      retailerId: string
      retailerName: string
      url: string
      observedAt: Date
    }>
  >`
    WITH ranked_prices AS (
      SELECT
        p.id as "productId",
        p.name as "productName",
        p.caliber,
        p."roundCount",
        pr.price,
        r.id as "retailerId",
        r.name as "retailerName",
        pr.url,
        pr."observedAt",
        ROW_NUMBER() OVER (PARTITION BY p.id ORDER BY pr.price ASC) as rn
      FROM products p
      JOIN product_links pl ON pl."productId" = p.id
      JOIN prices pr ON pr."sourceProductId" = pl."sourceProductId"
      JOIN retailers r ON r.id = pr."retailerId"
      LEFT JOIN merchant_retailers mr ON mr."retailerId" = r.id AND mr.status = 'ACTIVE'
      WHERE pl.status IN ('MATCHED', 'CREATED')
        AND pr."inStock" = true
        AND pr."observedAt" >= ${sevenDaysAgo}
        AND r."visibilityStatus" = 'ELIGIBLE'
        AND (mr.id IS NULL OR (mr."listingStatus" = 'LISTED' AND mr.status = 'ACTIVE'))
    )
    SELECT * FROM ranked_prices WHERE rn = 1
    LIMIT 500 -- MAX_PRODUCTS_TO_EVALUATE: documented limit to prevent unbounded queries
  `

  if (currentPrices.length === 0) {
    return {
      deals: [],
      hero: null,
      lastCheckedAt: now.toISOString(),
    }
  }

  // Get 30-day median prices per product
  const productIds = currentPrices.map((p) => p.productId)
  const medianPrices = await prisma.$queryRaw<
    Array<{ productId: string; medianPrice: any; priceCount: number }>
  >`
    WITH daily_best AS (
      SELECT
        p.id as "productId",
        DATE_TRUNC('day', pr."observedAt") as day,
        MIN(pr.price) as daily_best
      FROM products p
      JOIN product_links pl ON pl."productId" = p.id
      JOIN prices pr ON pr."sourceProductId" = pl."sourceProductId"
      JOIN retailers r ON r.id = pr."retailerId"
      LEFT JOIN merchant_retailers mr ON mr."retailerId" = r.id AND mr.status = 'ACTIVE'
      WHERE p.id = ANY(${productIds})
        AND pl.status IN ('MATCHED', 'CREATED')
        AND pr."observedAt" >= ${thirtyDaysAgo}
        AND r."visibilityStatus" = 'ELIGIBLE'
        AND (mr.id IS NULL OR (mr."listingStatus" = 'LISTED' AND mr.status = 'ACTIVE'))
      GROUP BY p.id, DATE_TRUNC('day', pr."observedAt")
    )
    SELECT
      "productId",
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY daily_best) as "medianPrice",
      COUNT(*)::int as "priceCount"
    FROM daily_best
    GROUP BY "productId"
  `

  const medianMap = new Map(medianPrices.map((m) => [m.productId, m]))

  // Get 90-day lowest prices per product
  const lowestPrices = await prisma.$queryRaw<
    Array<{ productId: string; lowestPrice: any }>
  >`
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

  const lowestMap = new Map(lowestPrices.map((l) => [l.productId, parseFloat(l.lowestPrice.toString())]))

  // Get products that were out of stock (zero visible offers) for ≥7 consecutive days
  // Per spec: "Product had zero visible offers for ≥7 consecutive days, now has ≥1"
  // This requires checking for a gap of at least 7 days with no in-stock offers
  const backInStockProducts = await prisma.$queryRaw<Array<{ productId: string }>>`
    WITH daily_stock AS (
      SELECT
        pl."productId",
        DATE_TRUNC('day', pr."observedAt" AT TIME ZONE 'UTC') as day,
        MAX(CASE WHEN pr."inStock" THEN 1 ELSE 0 END) as had_stock
      FROM product_links pl
      JOIN prices pr ON pr."sourceProductId" = pl."sourceProductId"
      JOIN retailers r ON r.id = pr."retailerId"
      LEFT JOIN merchant_retailers mr ON mr."retailerId" = r.id AND mr.status = 'ACTIVE'
      WHERE pl."productId" = ANY(${productIds})
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
        MIN(day) as streak_start,
        MAX(day) as streak_end,
        COUNT(*) as streak_days
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
    SELECT "productId" FROM recently_restocked
  `

  const backInStockSet = new Set(backInStockProducts.map((p) => p.productId))

  // Build deals list - EXCLUDING products with unmapped calibers
  const deals: MarketDeal[] = []

  for (const current of currentPrices) {
    const currentPrice = parseFloat(current.price.toString())
    const median = medianMap.get(current.productId)
    const lowest90d = lowestMap.get(current.productId)

    // Normalize caliber to canonical enum - SKIP if unmapped
    const normalizedCaliber = normalizeCaliber(current.caliber || '')
    if (!normalizedCaliber) {
      // Per spec: "Products with unmapped calibers are excluded from Market Deals"
      continue
    }

    // Calculate price per round - null if roundCount unavailable (per spec)
    const pricePerRound = current.roundCount && current.roundCount > 0
      ? currentPrice / current.roundCount
      : null

    // Check eligibility criteria
    let reason: MarketDeal['reason'] | null = null
    let contextLine = ''

    // Check ≥15% below 30-day median (need at least 5 price points)
    if (median && median.priceCount >= MIN_PRICE_POINTS_FOR_MEDIAN) {
      const medianPrice = parseFloat(median.medianPrice.toString())
      const dropPercent = ((medianPrice - currentPrice) / medianPrice) * 100

      if (dropPercent >= PRICE_DROP_THRESHOLD_PERCENT) {
        reason = 'PRICE_DROP'
        // Per spec: context line states the eligibility threshold (not a ranking score)
        contextLine = `${PRICE_DROP_THRESHOLD_PERCENT}%+ below 30-day median`
      }
    }

    // Check lowest in 90 days (if not already a price drop deal)
    if (!reason && lowest90d !== undefined && currentPrice <= lowest90d) {
      reason = 'LOWEST_90D'
      contextLine = 'Lowest price in 90 days'
    }

    // Check back in stock after 7+ consecutive days OOS
    if (!reason && backInStockSet.has(current.productId)) {
      reason = 'BACK_IN_STOCK'
      contextLine = 'Back in stock'
    }

    if (reason) {
      deals.push({
        productId: current.productId,
        productName: current.productName,
        caliber: normalizedCaliber,
        price: currentPrice,
        pricePerRound,
        retailerName: current.retailerName,
        retailerId: current.retailerId,
        url: current.url,
        contextLine,
        detectedAt: current.observedAt,
        reason,
      })
    }
  }

  // Sort by hero selection rule (deterministic):
  // 1. PRICE_DROP deals first (implicit priority by being notable)
  // 2. Then by earliest detection timestamp
  // 3. Finally by productId ASC (lexicographic)
  deals.sort((a, b) => {
    // Price drops first
    if (a.reason === 'PRICE_DROP' && b.reason !== 'PRICE_DROP') return -1
    if (b.reason === 'PRICE_DROP' && a.reason !== 'PRICE_DROP') return 1

    // Then by earliest detection timestamp
    const timeDiff = a.detectedAt.getTime() - b.detectedAt.getTime()
    if (timeDiff !== 0) return timeDiff

    // Finally by productId ASC (lexicographic)
    return a.productId.localeCompare(b.productId)
  })

  // Select hero (first item after deterministic sorting)
  const hero = deals.length > 0 ? deals[0] : null

  return {
    deals: deals.slice(0, MAX_DEALS_RETURNED),
    hero,
    lastCheckedAt: now.toISOString(),
  }
}

/**
 * Get market deals with Gun Locker calibers for personalized ordering
 * Per spec: Gun Locker affects ordering and labeling ONLY, NOT hero selection
 */
export async function getMarketDealsWithGunLocker(
  userCalibers: CaliberValue[]
): Promise<{
  forYourGuns: MarketDeal[]
  otherDeals: MarketDeal[]
  hero: MarketDeal | null  // Hero is deterministic, NOT personalized
  lastCheckedAt: string
}> {
  // Get base deals with deterministic hero
  const { deals, hero, lastCheckedAt } = await getMarketDeals()

  if (userCalibers.length === 0) {
    return {
      forYourGuns: [],
      otherDeals: deals,
      hero,  // Keep deterministic hero
      lastCheckedAt,
    }
  }

  const caliberSet = new Set(userCalibers)

  // Split deals by matching caliber - Gun Locker affects ORDERING only
  const forYourGuns = deals.filter((d) => caliberSet.has(d.caliber))
  const otherDeals = deals.filter((d) => !caliberSet.has(d.caliber))

  return {
    forYourGuns: forYourGuns.slice(0, 5),
    otherDeals: otherDeals.slice(0, 5),
    hero,  // Hero stays deterministic - NOT re-selected based on Gun Locker
    lastCheckedAt,
  }
}
