import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '@ironscout/db'
import {
  getTierConfig,
  getMaxMarketPulseCalibers,
  getMaxDealsForYou,
  hasFeature,
  hasPriceHistoryAccess,
  getPriceHistoryDays,
  shapePriceHistory,
} from '../config/tiers'
import { batchGetPricesViaProductLinks } from '../services/ai-search/price-resolver'
import { getUserTier, getAuthenticatedUserId } from '../middleware/auth'
import { loggers } from '../config/logger'
import {
  resolveDashboardState,
  getWatchlistPreview,
  type DashboardState,
  type DashboardStateContext
} from '../services/dashboard-state'
import { getMarketDeals, getMarketDealsWithGunLocker } from '../services/market-deals'
import { getUserCalibers, type CaliberValue } from '../services/gun-locker'
import { getDashboardV5Data } from '../services/dashboard-v5'
import { getLoadoutData } from '../services/loadout'

const log = loggers.dashboard

const router: any = Router()

// ============================================================================
// DASHBOARD V5 ENDPOINT (DEPRECATED)
// @deprecated Use GET /api/dashboard/loadout instead
// Kept for backwards compatibility - will be removed in future release
//
// Legacy: Per ADR-020 and dashboard-product-spec-v5.md
// ============================================================================

router.get('/v5', async (req: Request, res: Response) => {
  try {
    const userId = getAuthenticatedUserId(req)
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const data = await getDashboardV5Data(userId)

    res.json(data)
  } catch (error) {
    log.error('Dashboard v5 error', { error }, error as Error)
    res.status(500).json({ error: 'Failed to load dashboard' })
  }
})

// ============================================================================
// MY LOADOUT ENDPOINT
// Returns unified data for My Loadout dashboard:
// - Gun Locker firearms with ammo preferences and current prices
// - Watching items with prices and status
// - Market activity stats
// Per ADR-006: Assistive only, no recommendations or verdicts
// ============================================================================

router.get('/loadout', async (req: Request, res: Response) => {
  try {
    const userId = getAuthenticatedUserId(req)
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const data = await getLoadoutData(userId)

    res.json(data)
  } catch (error) {
    log.error('Loadout error', { error }, error as Error)
    res.status(500).json({ error: 'Failed to load My Loadout' })
  }
})

// ============================================================================
// DASHBOARD STATE ENDPOINT (v4)
// Returns resolved dashboard state for state-driven UI rendering
// Per dashboard-product-spec.md: state resolution is server-side
// ============================================================================

router.get('/state', async (req: Request, res: Response) => {
  try {
    const userId = getAuthenticatedUserId(req)
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const stateContext = await resolveDashboardState(userId)

    res.json(stateContext)
  } catch (error) {
    log.error('Dashboard state error', { error }, error as Error)
    res.status(500).json({ error: 'Failed to resolve dashboard state' })
  }
})

// ============================================================================
// WATCHLIST PREVIEW ENDPOINT (v4)
// Returns subset of watchlist items for dashboard preview
// Limit varies by state: 3 for most, 7 for POWER_USER
// ============================================================================

const watchlistPreviewSchema = z.object({
  limit: z.coerce.number().int().min(1).max(10).default(3)
})

router.get('/watchlist-preview', async (req: Request, res: Response) => {
  try {
    const userId = getAuthenticatedUserId(req)
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const { limit } = watchlistPreviewSchema.parse(req.query)
    const items = await getWatchlistPreview(userId, limit)

    res.json({
      items,
      _meta: {
        itemsReturned: items.length,
        limit
      }
    })
  } catch (error) {
    log.error('Watchlist preview error', { error }, error as Error)
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid parameters', details: error.issues })
    }
    res.status(500).json({ error: 'Failed to fetch watchlist preview' })
  }
})

// ============================================================================
// MARKET DEALS ENDPOINT (dashboard_market_deals_v1_spec.md)
// Returns notable market-wide price events for dashboard display
// Eligibility: ≥15% below 30-day median, back in stock after 7+ days, lowest in 90 days
// Hero selection: largest drop %, then earliest timestamp, then productId ASC
// ============================================================================

router.get('/market-deals', async (req: Request, res: Response) => {
  try {
    // Auth is optional - market deals are public, but Gun Locker personalization requires auth
    const userId = getAuthenticatedUserId(req)

    if (userId) {
      // Get user's Gun Locker calibers for personalization
      const userCalibers = await getUserCalibers(userId)

      if (userCalibers.length > 0) {
        const { forYourGuns, otherDeals, hero, lastCheckedAt } = await getMarketDealsWithGunLocker(userCalibers)

        return res.json({
          hero,
          sections: [
            { title: 'Fits Your Gun Locker', deals: forYourGuns },
            { title: 'Other Notable Deals', deals: otherDeals },
          ],
          lastCheckedAt,
          _meta: {
            personalized: true,
            userCalibers,
          },
        })
      }
    }

    // Non-personalized: "Notable Deals Today"
    const { deals, hero, lastCheckedAt } = await getMarketDeals()

    res.json({
      hero,
      sections: [{ title: 'Notable Deals Today', deals: deals.slice(0, 5) }],
      lastCheckedAt,
      _meta: {
        personalized: false,
      },
    })
  } catch (error) {
    log.error('Market deals error', { error }, error as Error)
    res.status(500).json({ error: 'Failed to fetch market deals' })
  }
})

// ============================================================================
// MARKET PULSE ENDPOINT
// Returns price context indicators for user's top calibers
// Free: 2 calibers max, current price + trend
// Premium: All calibers, price timing signal (1-100), charts
//
// Query params:
//   windowDays=1|7 (default 7) - trend comparison window
// ============================================================================

const pulseQuerySchema = z.object({
  windowDays: z.enum(['1', '7']).default('7').transform(v => parseInt(v, 10) as 1 | 7)
})

router.get('/pulse', async (req: Request, res: Response) => {
  try {
    // Parse and validate query params
    const { windowDays } = pulseQuerySchema.parse(req.query)

    // Get authenticated user from JWT
    const userId = getAuthenticatedUserId(req)
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    // Anchor timestamp for consistency across all caliber calculations
    const asOf = new Date()

    const userTier = await getUserTier(req)
    const maxCalibers = getMaxMarketPulseCalibers(userTier)

    // Get user's calibers from saved items (watchlist)
    // Per ADR-011A Section 17.2: All user-facing queries MUST include deletedAt: null
    const watchlistItems = await prisma.watchlist_items.findMany({
      where: { userId, deletedAt: null },
      include: { products: { select: { caliber: true } } }
    })

    // Extract unique calibers (products may be null for SEARCH intent items)
    const calibersSet = new Set<string>()
    watchlistItems.forEach((w: any) => {
      if (w.products?.caliber) calibersSet.add(w.products.caliber)
    })

    // Default calibers if user has none tracked
    if (calibersSet.size === 0) {
      calibersSet.add('9mm')
      calibersSet.add('.223 Rem')
    }

    let calibers = Array.from(calibersSet)

    // Apply tier limit
    if (maxCalibers !== -1 && calibers.length > maxCalibers) {
      calibers = calibers.slice(0, maxCalibers)
    }

    // Check feature availability
    const showPriceTimingSignal = hasFeature(userTier, 'priceTimingSignal')

    // Calculate market pulse for each caliber
    // Per Spec v1.2 §0.0: Query through product_links for prices
    const pulseData = await Promise.all(
      calibers.map(async caliber => {
        // Get products for this caliber
        const products = await prisma.products.findMany({
          where: { caliber },
          select: { id: true },
          take: 100
        })

        if (products.length === 0) {
          return {
            caliber,
            currentAvg: null,
            trend: 'STABLE' as const,
            trendPercent: 0,
            priceTimingSignal: showPriceTimingSignal ? null : undefined,
            priceContext: 'INSUFFICIENT_DATA' as const,
            contextMeta: {
              windowDays,
              sampleCount: 0,
              asOf: asOf.toISOString()
            }
          }
        }

        // Get prices through product_links
        const productIds = products.map(p => p.id)
        const pricesMap = await batchGetPricesViaProductLinks(productIds)

        // Collect current in-stock prices
        const currentPrices: number[] = []
        for (const prices of pricesMap.values()) {
          for (const price of prices) {
            if (price.inStock) {
              currentPrices.push(parseFloat(price.price.toString()))
            }
          }
        }

        // Take top 50 for calculation
        const sampledPrices = currentPrices.slice(0, 50)

        if (sampledPrices.length === 0) {
          return {
            caliber,
            currentAvg: null,
            trend: 'STABLE' as const,
            trendPercent: 0,
            priceTimingSignal: showPriceTimingSignal ? null : undefined,
            priceContext: 'INSUFFICIENT_DATA' as const,
            contextMeta: {
              windowDays,
              sampleCount: 0,
              asOf: asOf.toISOString()
            }
          }
        }

        const currentAvg =
          sampledPrices.reduce((sum, p) => sum + p, 0) / sampledPrices.length

        // Get historical average for trend based on windowDays
        // Query historical prices through product_links
        const windowStart = new Date(asOf)
        windowStart.setDate(windowStart.getDate() - windowDays)

        // ADR-005: Apply full visibility predicate with A1 semantics
        // - Crawl-only retailers (no ACTIVE merchant relationships) are visible
        // - Merchant-managed retailers need ACTIVE + LISTED relationship
        const historicalPricesRaw = await prisma.$queryRaw<Array<{ price: any }>>`
          SELECT pr.price
          FROM prices pr
          JOIN product_links pl ON pl."sourceProductId" = pr."sourceProductId"
          JOIN products p ON p.id = pl."productId"
          JOIN retailers r ON r.id = pr."retailerId"
          LEFT JOIN merchant_retailers mr ON mr."retailerId" = r.id AND mr.status = 'ACTIVE'
          WHERE p.caliber = ${caliber}
            AND pl.status IN ('MATCHED', 'CREATED')
            AND pr."createdAt" < ${windowStart}
            AND r."visibilityStatus" = 'ELIGIBLE'
            AND (
              mr.id IS NULL
              OR (mr."listingStatus" = 'LISTED' AND mr.status = 'ACTIVE')
            )
          ORDER BY pr."createdAt" DESC
          LIMIT 50
        `

        let trend: 'UP' | 'DOWN' | 'STABLE' = 'STABLE'
        let trendPercent = 0

        if (historicalPricesRaw.length > 0) {
          const historicalAvg =
            historicalPricesRaw.reduce((sum, p) => sum + parseFloat(p.price.toString()), 0) /
            historicalPricesRaw.length

          trendPercent = ((currentAvg - historicalAvg) / historicalAvg) * 100

          if (trendPercent < -3) {
            trend = 'DOWN'
          } else if (trendPercent > 3) {
            trend = 'UP'
          }
        }

        // Determine price context (ADR-006: descriptive, not prescriptive)
        // Uses 30th/70th percentile thresholds
        let priceContext: 'LOWER_THAN_RECENT' | 'WITHIN_RECENT_RANGE' | 'HIGHER_THAN_RECENT' = 'WITHIN_RECENT_RANGE'
        if (trend === 'DOWN') priceContext = 'LOWER_THAN_RECENT'
        else if (trend === 'UP') priceContext = 'HIGHER_THAN_RECENT'

        return {
          caliber,
          currentAvg: Math.round(currentAvg * 100) / 100,
          trend,
          trendPercent: Math.round(trendPercent * 10) / 10,
          priceContext,
          // Context metadata for transparency
          contextMeta: {
            windowDays,
            sampleCount: sampledPrices.length,
            asOf: asOf.toISOString()
          }
        }
      })
    )

    // Cache for 5 minutes, keyed by windowDays (handled by CDN/proxy via Vary header)
    res.set('Cache-Control', 'private, max-age=300')
    res.set('Vary', 'Authorization')

    res.json({
      pulse: pulseData,
      _meta: {
        tier: userTier,
        calibersShown: calibers.length,
        calibersLimit: maxCalibers,
        windowDays,
        asOf: asOf.toISOString()
      }
    })
  } catch (error) {
    log.error('Market pulse error', { error }, error as Error)
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid parameters', details: error.issues })
    }
    res.status(500).json({ error: 'Failed to fetch market pulse' })
  }
})

// ============================================================================
// PERSONALIZED FEED ENDPOINT
// Returns personalized items based on alerts/watchlist
// Free: 5 items max, basic ranking
// Premium: 20 items, stock indicators, relative value context
//
// Query params:
//   scope=global  - Non-personalized, all calibers (for Best Prices section)
//   scope=watchlist - Personalized based on user's watchlist (default)
//   limit=N - Override max items returned (for global scope only)
// ============================================================================

const dealsQuerySchema = z.object({
  scope: z.enum(['global', 'watchlist']).default('watchlist'),
  limit: z.coerce.number().int().min(1).max(20).optional()
})

router.get('/deals', async (req: Request, res: Response) => {
  try {
    // Parse query params
    const { scope, limit: queryLimit } = dealsQuerySchema.parse(req.query)
    const isGlobalScope = scope === 'global'

    // For global scope, auth is optional (public endpoint)
    // For watchlist scope, auth is required
    const userId = getAuthenticatedUserId(req)
    if (!isGlobalScope && !userId) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const userTier = userId ? await getUserTier(req) : 'FREE'

    // Determine max deals
    // For global scope: use limit param (default 5), cap at 20
    // For watchlist scope: use tier-based limit
    const maxDeals = isGlobalScope
      ? Math.min(queryLimit ?? 5, 20)
      : getMaxDealsForYou(userTier)

    const showPricePosition = !isGlobalScope && hasFeature(userTier, 'pricePositionIndex')
    const showStockIndicators = !isGlobalScope && hasFeature(userTier, 'stockIndicators')
    const showExplanations = !isGlobalScope && hasFeature(userTier, 'aiExplanations')

    // For global scope: no personalization
    // For watchlist scope: personalize based on user's watchlist
    let calibers: string[] = []
    let watchedProductIds = new Set<string>()

    if (!isGlobalScope && userId) {
      // Get user's calibers from saved items (watchlist) for personalization
      // Per ADR-011A Section 17.2: All user-facing queries MUST include deletedAt: null
      const watchlistItems = await prisma.watchlist_items.findMany({
        where: { userId, deletedAt: null },
        include: { products: { select: { caliber: true, id: true } } }
      })

      // Extract calibers and product IDs for personalization
      const calibersSet = new Set<string>()

      // Products may be null for SEARCH intent items; filter safely
      watchlistItems.forEach((w: any) => {
        if (w.products?.caliber) calibersSet.add(w.products.caliber)
        if (w.products?.id) watchedProductIds.add(w.products.id)
      })

      calibers = Array.from(calibersSet)
    }

    // Get deals with best prices
    // Per Spec v1.2 §0.0: Query through product_links for prices
    let productWhere: any = {}
    if (!isGlobalScope && calibers.length > 0) {
      productWhere.caliber = { in: calibers }
    }

    // Get products (optionally filtered by caliber)
    const products = await prisma.products.findMany({
      where: productWhere,
      select: {
        id: true,
        name: true,
        caliber: true,
        brand: true,
        imageUrl: true,
        roundCount: true,
        grainWeight: true
      },
      take: maxDeals * 10 // Fetch more to have options after price filtering
    })

    if (products.length === 0) {
      return res.json({
        items: [],
        _meta: {
          scope,
          tier: isGlobalScope ? null : userTier,
          itemsShown: 0,
          itemsLimit: maxDeals,
          personalized: !isGlobalScope && calibers.length > 0,
          ...(isGlobalScope ? {} : { calibersUsed: calibers })
        }
      })
    }

    // Get prices through product_links
    const productIds = products.map(p => p.id)
    const pricesMap = await batchGetPricesViaProductLinks(productIds)

    // Build deals list with best price per product
    interface DealCandidate {
      productId: string
      product: typeof products[0]
      price: any
    }
    const dealCandidates: DealCandidate[] = []

    for (const product of products) {
      const prices = pricesMap.get(product.id) || []

      // Filter for in-stock and apply freshness filter for global scope
      const twentyFourHoursAgo = new Date()
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24)

      const eligiblePrices = prices.filter(p => {
        if (!p.inStock) return false
        if (isGlobalScope && p.observedAt && new Date(p.observedAt) < twentyFourHoursAgo) {
          return false
        }
        return true
      })

      if (eligiblePrices.length > 0) {
        // Sort by retailer tier desc, then price asc
        eligiblePrices.sort((a, b) => {
          if (!isGlobalScope) {
            // Prefer premium retailers for watchlist scope
            const tierOrder: Record<string, number> = { 'PREMIUM': 2, 'STANDARD': 1 }
            const aTier = tierOrder[a.retailers?.tier || 'STANDARD'] || 0
            const bTier = tierOrder[b.retailers?.tier || 'STANDARD'] || 0
            if (aTier !== bTier) return bTier - aTier
          }
          return parseFloat(a.price.toString()) - parseFloat(b.price.toString())
        })

        dealCandidates.push({
          productId: product.id,
          product,
          price: eligiblePrices[0]
        })
      }
    }

    // Sort by price for global scope, by tier+price for watchlist
    dealCandidates.sort((a, b) => {
      if (!isGlobalScope) {
        const tierOrder: Record<string, number> = { 'PREMIUM': 2, 'STANDARD': 1 }
        const aTier = tierOrder[a.price.retailers?.tier || 'STANDARD'] || 0
        const bTier = tierOrder[b.price.retailers?.tier || 'STANDARD'] || 0
        if (aTier !== bTier) return bTier - aTier
      }
      return parseFloat(a.price.price.toString()) - parseFloat(b.price.price.toString())
    })

    // Take top deals
    const deals = dealCandidates.slice(0, maxDeals).map(({ productId, product, price }) => {
      const pricePerRound =
        product.roundCount && product.roundCount > 0
          ? parseFloat(price.price.toString()) / product.roundCount
          : null

      const deal: any = {
        id: price.id,
        product: product,
        retailer: price.retailers,
        price: parseFloat(price.price.toString()),
        pricePerRound: pricePerRound ? Math.round(pricePerRound * 1000) / 1000 : null,
        url: price.url,
        inStock: price.inStock,
        updatedAt: price.observedAt?.toISOString() ?? null
      }

      // For watchlist scope, include user-specific fields
      // For global scope, omit them entirely
      if (!isGlobalScope) {
        deal.isWatched = watchedProductIds.has(productId)

        // Premium features: Price Position Index
        // Normalized price position vs. reference set (0-100 scale)
        // 0 = at or above 90th percentile of reference prices
        // 100 = at or below 10th percentile of reference prices
        // This is a descriptive position, not a value judgment
        if (showPricePosition) {
          // TODO: Implement actual calculation using reference set
          // Formula: 100 - ((currentPrice - minRef) / (maxRef - minRef) * 100)
          // For now, return null to indicate not yet calculated
          deal.pricePosition = {
            index: null, // number 0-100 when calculated
            basis: 'SKU_MARKET_7D' as const, // Reference: same SKU across retailers, last 7 days
            referenceSampleSize: 0, // Number of price observations in reference set
            calculatedAt: null // ISO timestamp when last calculated
          }
        }

        if (showExplanations && deal.isWatched) {
          deal.explanation = 'Matches your watchlist preferences'
        }
      }

      return deal
    })

    res.json({
      items: deals,
      _meta: {
        scope,
        tier: isGlobalScope ? null : userTier,
        itemsShown: deals.length,
        itemsLimit: maxDeals,
        personalized: !isGlobalScope && calibers.length > 0,
        ...(isGlobalScope ? {} : { calibersUsed: calibers })
      }
    })
  } catch (error) {
    log.error('Deals for you error', { error }, error as Error)
    res.status(500).json({ error: 'Failed to fetch deals' })
  }
})

// ============================================================================
// PRICE DELTA ENDPOINT
// Returns price differences vs user's target prices (from alerts)
// This is purely arithmetic comparison - not a claim of actual savings
// Both tiers get the same data; no "verified savings" claims
// ============================================================================

router.get('/savings', async (req: Request, res: Response) => {
  try {
    // Get authenticated user from JWT
    const userId = getAuthenticatedUserId(req)
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const userTier = await getUserTier(req)

    // Price Delta feature was deprecated with ADR-011
    // targetPrice no longer exists on the data model
    // Return empty data for backwards compatibility
    const deltaBreakdown: Array<{
      productId: string
      productName: string
      baselinePrice: number
      baselineType: 'USER_TARGET'
      currentPrice: number
      deltaAmount: number
      deltaPercent: number
    }> = []
    const totalDeltaAmount = 0

    res.json({
      priceDelta: {
        totalDeltaAmount: 0,
        breakdown: deltaBreakdown,
        alertsBelowTarget: 0,
        totalAlerts: 0
      },
      // Legacy field names for backwards compatibility during migration
      savings: {
        potentialSavings: 0,
        breakdown: [],
        alertsWithSavings: 0,
        totalAlerts: 0
      },
      _meta: {
        tier: userTier
      },
      _deprecated: 'Price delta/savings feature was deprecated with ADR-011. targetPrice no longer exists.'
    })
  } catch (error) {
    log.error('Savings error', { error }, error as Error)
    res.status(500).json({ error: 'Failed to fetch savings' })
  }
})

// ============================================================================
// PRICE HISTORY ENDPOINT
// Returns price history for a caliber
  // V1: 30/90/365 day charts for all users
// ============================================================================

const priceHistorySchema = z.object({
  days: z.coerce.number().int().min(7).max(365).default(30)
})

router.get('/price-history/:caliber', async (req: Request, res: Response) => {
  try {
    // Get authenticated user from JWT
    const userId = getAuthenticatedUserId(req)
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const caliber = req.params.caliber as string
    const { days } = priceHistorySchema.parse(req.query)

    const userTier = await getUserTier(req)

    // Check if user has access to price history
    if (!hasPriceHistoryAccess(userTier)) {
        return res.status(403).json({
          error: 'Price history unavailable',
          message: 'Price history is not available for this request.',
          tier: userTier
        })
    }

    // Enforce tier-based history limit
    const maxDays = getPriceHistoryDays(userTier)
    const effectiveDays = Math.min(days, maxDays)

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - effectiveDays)

    // Get price history aggregated by day
    // Per Spec v1.2 §0.0: Query through product_links for prices
    // ADR-005: Apply full visibility predicate with A1 semantics
    // - Crawl-only retailers (no ACTIVE merchant relationships) are visible
    // - Merchant-managed retailers need ACTIVE + LISTED relationship
    const decodedCaliber = decodeURIComponent(caliber)
    const prices = await prisma.$queryRaw<Array<{ price: any; createdAt: Date }>>`
      SELECT pr.price, pr."createdAt"
      FROM prices pr
      JOIN product_links pl ON pl."sourceProductId" = pr."sourceProductId"
      JOIN products p ON p.id = pl."productId"
      JOIN retailers r ON r.id = pr."retailerId"
      LEFT JOIN merchant_retailers mr ON mr."retailerId" = r.id AND mr.status = 'ACTIVE'
      WHERE p.caliber = ${decodedCaliber}
        AND pl.status IN ('MATCHED', 'CREATED')
        AND pr."createdAt" >= ${startDate}
        AND r."visibilityStatus" = 'ELIGIBLE'
        AND (
          mr.id IS NULL
          OR (mr."listingStatus" = 'LISTED' AND mr.status = 'ACTIVE')
        )
      ORDER BY pr."createdAt" ASC
    `

    // Aggregate by day
    const dailyData: Record<string, { prices: number[]; date: string }> = {}

    for (const price of prices) {
      const dateKey = price.createdAt.toISOString().split('T')[0]
      if (!dailyData[dateKey]) {
        dailyData[dateKey] = { prices: [], date: dateKey }
      }
      // price is a Decimal-like object; convert explicitly to number
      dailyData[dateKey].prices.push(parseFloat(price.price.toString()))
    }

    // Calculate daily averages
    const history = Object.values(dailyData).map(day => ({
      date: day.date,
      avgPrice: Math.round((day.prices.reduce((a, b) => a + b, 0) / day.prices.length) * 100) / 100,
      minPrice: Math.round(Math.min(...day.prices) * 100) / 100,
      maxPrice: Math.round(Math.max(...day.prices) * 100) / 100,
      dataPoints: day.prices.length
    }))

    // Shape history based on tier (FREE gets summary only, PREMIUM gets full history)
    const shapedHistory = shapePriceHistory(history, userTier)

    res.json({
      caliber: decodeURIComponent(caliber),
      days: effectiveDays,
      ...shapedHistory,
      _meta: {
        tier: userTier,
        requestedDays: days,
        effectiveDays,
        maxDaysAllowed: maxDays,
        ...(userTier === 'FREE' && {
          upgradeMessage: 'Price history availability varies by product.'
        })
      }
    })
  } catch (error) {
    log.error('Price history error', { error }, error as Error)
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid parameters', details: error.issues })
    }
    res.status(500).json({ error: 'Failed to fetch price history' })
  }
})

export { router as dashboardRouter }
