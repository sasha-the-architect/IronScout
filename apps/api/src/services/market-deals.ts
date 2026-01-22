/**
 * Market Deals Service
 *
 * Per dashboard_market_deals_v1_spec.md:
 * - Surfaces market-wide notable price events
 * - Eligibility: ≥15% below 30-day median, back in stock after 7+ days, or lowest in 90 days
 * - Hero selection: largest price drop %, then earliest timestamp, then productId ASC
 */

import { prisma } from '@ironscout/db'
import { CANONICAL_CALIBERS, type CaliberValue } from './gun-locker'

/**
 * Market Deal data contract per spec
 */
export interface MarketDeal {
  productId: string
  productName: string
  caliber: CaliberValue | null
  pricePerRound: number
  price: number
  retailerName: string
  retailerId: string
  url: string
  contextLine: string
  dropPercent: number | null
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

  // Get current best prices per product with caliber normalization
  // ADR-005: Apply full visibility predicate
  const currentPrices = await prisma.$queryRaw<
    Array<{
      productId: string
      productName: string
      caliber: string | null
      price: any
      pricePerRound: any
      retailerId: string
      retailerName: string
      url: string
      observedAt: Date
      roundCount: number | null
    }>
  >`
    WITH ranked_prices AS (
      SELECT
        p.id as "productId",
        p.name as "productName",
        p.caliber,
        p."roundCount",
        pr.price,
        CASE WHEN p."roundCount" > 0 THEN pr.price / p."roundCount" ELSE NULL END as "pricePerRound",
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
    LIMIT 500
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

  // Get products that were out of stock for 7+ days but now in stock
  // (Back in stock detection)
  const backInStockProducts = await prisma.$queryRaw<Array<{ productId: string }>>`
    WITH last_stock_check AS (
      SELECT
        pl."productId",
        MAX(CASE WHEN pr."inStock" = false THEN pr."observedAt" END) as last_oos,
        MAX(CASE WHEN pr."inStock" = true THEN pr."observedAt" END) as last_in_stock
      FROM product_links pl
      JOIN prices pr ON pr."sourceProductId" = pl."sourceProductId"
      WHERE pl."productId" = ANY(${productIds})
        AND pl.status IN ('MATCHED', 'CREATED')
        AND pr."observedAt" >= ${sevenDaysAgo}
      GROUP BY pl."productId"
    )
    SELECT "productId"
    FROM last_stock_check
    WHERE last_oos IS NOT NULL
      AND last_in_stock IS NOT NULL
      AND last_in_stock > last_oos
      AND last_oos >= ${sevenDaysAgo}
  `

  const backInStockSet = new Set(backInStockProducts.map((p) => p.productId))

  // Build deals list
  const deals: MarketDeal[] = []

  for (const current of currentPrices) {
    const currentPrice = parseFloat(current.price.toString())
    const median = medianMap.get(current.productId)
    const lowest90d = lowestMap.get(current.productId)

    // Normalize caliber to canonical enum
    const normalizedCaliber = normalizeCaliberToCanonical(current.caliber)

    // Check eligibility criteria
    let reason: MarketDeal['reason'] | null = null
    let dropPercent: number | null = null
    let contextLine = ''

    // Check ≥15% below 30-day median (need at least 5 price points)
    if (median && median.priceCount >= 5) {
      const medianPrice = parseFloat(median.medianPrice.toString())
      dropPercent = ((medianPrice - currentPrice) / medianPrice) * 100

      if (dropPercent >= 15) {
        reason = 'PRICE_DROP'
        contextLine = `${Math.round(dropPercent)}% below 30-day median`
      }
    }

    // Check lowest in 90 days (if not already a price drop deal)
    if (!reason && lowest90d !== undefined && currentPrice <= lowest90d) {
      reason = 'LOWEST_90D'
      contextLine = 'Lowest price in 90 days'
    }

    // Check back in stock after 7+ days
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
        pricePerRound: current.pricePerRound ? parseFloat(current.pricePerRound.toString()) : currentPrice,
        retailerName: current.retailerName,
        retailerId: current.retailerId,
        url: current.url,
        contextLine,
        dropPercent: reason === 'PRICE_DROP' ? dropPercent : null,
        detectedAt: current.observedAt,
        reason,
      })
    }
  }

  // Sort by hero selection rule: largest drop %, then earliest timestamp, then productId ASC
  deals.sort((a, b) => {
    // Price drops first, sorted by drop %
    if (a.reason === 'PRICE_DROP' && b.reason !== 'PRICE_DROP') return -1
    if (b.reason === 'PRICE_DROP' && a.reason !== 'PRICE_DROP') return 1

    if (a.reason === 'PRICE_DROP' && b.reason === 'PRICE_DROP') {
      const dropDiff = (b.dropPercent || 0) - (a.dropPercent || 0)
      if (dropDiff !== 0) return dropDiff
    }

    // Then by earliest detection timestamp
    const timeDiff = a.detectedAt.getTime() - b.detectedAt.getTime()
    if (timeDiff !== 0) return timeDiff

    // Finally by productId ASC (lexicographic)
    return a.productId.localeCompare(b.productId)
  })

  // Select hero (first item after sorting)
  const hero = deals.length > 0 ? deals[0] : null

  return {
    deals: deals.slice(0, 10), // Max 10 deals
    hero,
    lastCheckedAt: now.toISOString(),
  }
}

/**
 * Get market deals personalized by Gun Locker calibers
 */
export async function getMarketDealsWithGunLocker(
  userCalibers: CaliberValue[]
): Promise<{
  forYourGuns: MarketDeal[]
  otherDeals: MarketDeal[]
  hero: MarketDeal | null
  lastCheckedAt: string
}> {
  const { deals, hero, lastCheckedAt } = await getMarketDeals()

  if (userCalibers.length === 0) {
    return {
      forYourGuns: [],
      otherDeals: deals,
      hero,
      lastCheckedAt,
    }
  }

  const caliberSet = new Set(userCalibers)

  const forYourGuns = deals.filter((d) => d.caliber && caliberSet.has(d.caliber))
  const otherDeals = deals.filter((d) => !d.caliber || !caliberSet.has(d.caliber))

  // Re-select hero prioritizing user's calibers
  let newHero = hero
  if (forYourGuns.length > 0) {
    // Hero from user's calibers takes priority
    newHero = forYourGuns[0]
  }

  return {
    forYourGuns: forYourGuns.slice(0, 5),
    otherDeals: otherDeals.slice(0, 5),
    hero: newHero,
    lastCheckedAt,
  }
}

/**
 * Normalize a caliber string to canonical enum value
 * Returns null if not mappable
 */
function normalizeCaliberToCanonical(caliber: string | null): CaliberValue | null {
  if (!caliber) return null

  const normalized = caliber.toLowerCase().trim()

  // Direct matches
  if (CANONICAL_CALIBERS.includes(caliber as CaliberValue)) {
    return caliber as CaliberValue
  }

  // Alias mapping
  const aliasMap: Record<string, CaliberValue> = {
    '9mm luger': '9mm',
    '9mm parabellum': '9mm',
    '9x19': '9mm',
    '9x19mm': '9mm',
    '.45 acp': '.45_acp',
    '45 acp': '.45_acp',
    '.45acp': '.45_acp',
    '.40 s&w': '.40_sw',
    '40 s&w': '.40_sw',
    '.40sw': '.40_sw',
    '.380 acp': '.380_acp',
    '380 acp': '.380_acp',
    '.380acp': '.380_acp',
    '.380 auto': '.380_acp',
    '.22 lr': '.22_lr',
    '22 lr': '.22_lr',
    '.22lr': '.22_lr',
    '22lr': '.22_lr',
    '.22 long rifle': '.22_lr',
    '.223 rem': '.223_556',
    '.223 remington': '.223_556',
    '223 rem': '.223_556',
    '5.56': '.223_556',
    '5.56mm': '.223_556',
    '5.56x45': '.223_556',
    '5.56 nato': '.223_556',
    '.308 win': '.308_762x51',
    '.308 winchester': '.308_762x51',
    '308 win': '.308_762x51',
    '7.62x51': '.308_762x51',
    '7.62x51mm': '.308_762x51',
    '7.62 nato': '.308_762x51',
    '.30-06 springfield': '.30-06',
    '30-06': '.30-06',
    '.30-06 sprg': '.30-06',
    '6.5 creedmoor': '6.5_creedmoor',
    '6.5mm creedmoor': '6.5_creedmoor',
    '7.62x39mm': '7.62x39',
    '12 gauge': '12ga',
    '12 ga': '12ga',
    '12g': '12ga',
    '20 gauge': '20ga',
    '20 ga': '20ga',
    '20g': '20ga',
  }

  return aliasMap[normalized] || null
}
