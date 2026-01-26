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
import { getRedisClient } from '../config/redis'
import { loggers } from '../config/logger'

const log = loggers.dashboard

// Cache configuration
const MARKET_DEALS_CACHE_KEY = 'dashboard:market-deals'
const MARKET_DEALS_CACHE_TTL = 60 // 60 seconds

// ============================================================================
// CONFIGURATION
// Per spec: These limits should be documented and configurable
// ⚠️ WARNING: These limits can silently drop eligible deals and affect hero selection.
// If products or deals exceed limits, results may not include all eligible items.
// ============================================================================

/**
 * Maximum products to evaluate for deals (query limit)
 * ⚠️ If more than this many products have recent prices, only the first 500
 * (by lowest price) are evaluated. This can cause eligible deals to be missed.
 */
const MAX_PRODUCTS_TO_EVALUATE = 500

/**
 * Maximum deals to return in response
 * ⚠️ If more deals are eligible, only the top 10 (by deterministic sort order)
 * are returned. This truncation is logged when it occurs.
 */
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
  const functionStart = performance.now()

  // Check cache first
  try {
    const redis = getRedisClient()
    const cached = await redis.get(MARKET_DEALS_CACHE_KEY)
    if (cached) {
      const parsed = JSON.parse(cached) as MarketDealsResponse
      // Restore Date objects from ISO strings
      parsed.deals = parsed.deals.map(d => ({
        ...d,
        detectedAt: new Date(d.detectedAt)
      }))
      if (parsed.hero) {
        parsed.hero.detectedAt = new Date(parsed.hero.detectedAt)
      }
      log.debug('MARKET_DEALS_CACHE_HIT', {
        durationMs: Math.round(performance.now() - functionStart)
      })
      return parsed
    }
    log.debug('MARKET_DEALS_CACHE_MISS')
  } catch (cacheError) {
    log.warn('MARKET_DEALS_CACHE_ERROR', {
      error: cacheError instanceof Error ? cacheError.message : String(cacheError)
    })
  }

  const now = new Date()
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const ninetyDaysAgo = new Date(now)
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  // ============================================================================
  // QUERY 1: Current best prices per product
  // ============================================================================
  const query1Start = performance.now()

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
      LEFT JOIN affiliate_feed_runs afr ON afr.id = pr."affiliateFeedRunId"
      WHERE pl.status IN ('MATCHED', 'CREATED')
        AND pr."inStock" = true
        AND pr."observedAt" >= ${sevenDaysAgo}
        AND r."visibilityStatus" = 'ELIGIBLE'
        AND (mr.id IS NULL OR (mr."listingStatus" = 'LISTED' AND mr.status = 'ACTIVE'))
        AND (pr."affiliateFeedRunId" IS NULL OR afr."ignoredAt" IS NULL) -- ADR-015: Exclude ignored runs
    )
    SELECT * FROM ranked_prices WHERE rn = 1
    LIMIT 500 -- MAX_PRODUCTS_TO_EVALUATE: documented limit to prevent unbounded queries
  `

  const query1DurationMs = Math.round(performance.now() - query1Start)
  log.info('MARKET_DEALS_QUERY_1_CURRENT_PRICES', {
    durationMs: query1DurationMs,
    rowCount: currentPrices.length
  })

  if (currentPrices.length === 0) {
    const result = {
      deals: [],
      hero: null,
      lastCheckedAt: now.toISOString(),
    }
    log.info('MARKET_DEALS_TOTAL', {
      durationMs: Math.round(performance.now() - functionStart),
      dealsFound: 0,
      cacheHit: false
    })
    return result
  }

  // ============================================================================
  // QUERY 2: 30-day median prices per product
  // ============================================================================
  const query2Start = performance.now()

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
      LEFT JOIN affiliate_feed_runs afr ON afr.id = pr."affiliateFeedRunId"
      WHERE p.id = ANY(${productIds})
        AND pl.status IN ('MATCHED', 'CREATED')
        AND pr."observedAt" >= ${thirtyDaysAgo}
        AND r."visibilityStatus" = 'ELIGIBLE'
        AND (mr.id IS NULL OR (mr."listingStatus" = 'LISTED' AND mr.status = 'ACTIVE'))
        AND (pr."affiliateFeedRunId" IS NULL OR afr."ignoredAt" IS NULL) -- ADR-015: Exclude ignored runs
      GROUP BY p.id, DATE_TRUNC('day', pr."observedAt")
    )
    SELECT
      "productId",
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY daily_best) as "medianPrice",
      COUNT(*)::int as "priceCount"
    FROM daily_best
    GROUP BY "productId"
  `

  const query2DurationMs = Math.round(performance.now() - query2Start)
  log.info('MARKET_DEALS_QUERY_2_MEDIAN_PRICES', {
    durationMs: query2DurationMs,
    rowCount: medianPrices.length,
    productCount: productIds.length
  })

  const medianMap = new Map(medianPrices.map((m) => [m.productId, m]))

  // ============================================================================
  // QUERY 3: 90-day lowest prices per product
  // ============================================================================
  const query3Start = performance.now()

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
    LEFT JOIN affiliate_feed_runs afr ON afr.id = pr."affiliateFeedRunId"
    WHERE p.id = ANY(${productIds})
      AND pl.status IN ('MATCHED', 'CREATED')
      AND pr."observedAt" >= ${ninetyDaysAgo}
      AND r."visibilityStatus" = 'ELIGIBLE'
      AND (mr.id IS NULL OR (mr."listingStatus" = 'LISTED' AND mr.status = 'ACTIVE'))
      AND (pr."affiliateFeedRunId" IS NULL OR afr."ignoredAt" IS NULL) -- ADR-015: Exclude ignored runs
    GROUP BY p.id
  `

  const query3DurationMs = Math.round(performance.now() - query3Start)
  log.info('MARKET_DEALS_QUERY_3_LOWEST_PRICES', {
    durationMs: query3DurationMs,
    rowCount: lowestPrices.length
  })

  const lowestMap = new Map(lowestPrices.map((l) => [l.productId, parseFloat(l.lowestPrice.toString())]))

  // ============================================================================
  // QUERY 4: Back-in-stock detection (gap analysis)
  // ============================================================================
  const query4Start = performance.now()

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
      LEFT JOIN affiliate_feed_runs afr ON afr.id = pr."affiliateFeedRunId"
      WHERE pl."productId" = ANY(${productIds})
        AND pl.status IN ('MATCHED', 'CREATED')
        AND pr."observedAt" >= ${thirtyDaysAgo}
        AND r."visibilityStatus" = 'ELIGIBLE'
        AND (mr.id IS NULL OR (mr."listingStatus" = 'LISTED' AND mr.status = 'ACTIVE'))
        AND (pr."affiliateFeedRunId" IS NULL OR afr."ignoredAt" IS NULL) -- ADR-015: Exclude ignored runs
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

  const query4DurationMs = Math.round(performance.now() - query4Start)
  log.info('MARKET_DEALS_QUERY_4_BACK_IN_STOCK', {
    durationMs: query4DurationMs,
    rowCount: backInStockProducts.length
  })

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

  // Log warning if limits caused truncation (for operational visibility)
  if (currentPrices.length >= MAX_PRODUCTS_TO_EVALUATE) {
    log.warn('MARKET_DEALS_PRODUCT_LIMIT_REACHED', {
      limit: MAX_PRODUCTS_TO_EVALUATE,
      message: 'Some eligible deals may have been missed due to query limit',
    })
  }
  if (deals.length > MAX_DEALS_RETURNED) {
    log.warn('MARKET_DEALS_LIMIT_REACHED', {
      totalEligible: deals.length,
      returned: MAX_DEALS_RETURNED,
      truncated: deals.length - MAX_DEALS_RETURNED,
    })
  }

  const result = {
    deals: deals.slice(0, MAX_DEALS_RETURNED),
    hero,
    lastCheckedAt: now.toISOString(),
  }

  // Cache the result
  try {
    const redis = getRedisClient()
    await redis.setex(MARKET_DEALS_CACHE_KEY, MARKET_DEALS_CACHE_TTL, JSON.stringify(result))
    log.debug('MARKET_DEALS_CACHE_SET', { ttlSeconds: MARKET_DEALS_CACHE_TTL })
  } catch (cacheError) {
    log.warn('MARKET_DEALS_CACHE_SET_ERROR', {
      error: cacheError instanceof Error ? cacheError.message : String(cacheError)
    })
  }

  // Log total timing
  const totalDurationMs = Math.round(performance.now() - functionStart)
  log.info('MARKET_DEALS_TOTAL', {
    durationMs: totalDurationMs,
    query1Ms: query1DurationMs,
    query2Ms: query2DurationMs,
    query3Ms: query3DurationMs,
    query4Ms: query4DurationMs,
    dealsFound: deals.length,
    heroProductId: hero?.productId ?? null,
    cacheHit: false
  })

  return result
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
