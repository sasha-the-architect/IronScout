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
  visiblePriceWhere
} from '../config/tiers'
import { getUserTier, getAuthenticatedUserId } from '../middleware/auth'
import { loggers } from '../config/logger'

const log = loggers.dashboard

const router: any = Router()

// ============================================================================
// MARKET PULSE ENDPOINT
// Returns price context indicators for user's top calibers
// Free: 2 calibers max, current price + 7-day trend
// Premium: All calibers, price timing signal (1-100), charts
// ============================================================================

router.get('/pulse', async (req: Request, res: Response) => {
  try {
    // Get authenticated user from JWT
    const userId = getAuthenticatedUserId(req)
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' })
    }

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
    watchlistItems.forEach((w) => {
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
    const pulseData = await Promise.all(
      calibers.map(async caliber => {
        // Get current average price for this caliber
        const currentPrices = await prisma.prices.findMany({
          where: {
            products: { caliber },
            inStock: true,
            ...visiblePriceWhere(),
          },
          select: { price: true },
          orderBy: { createdAt: 'desc' },
          take: 50
        })

        if (currentPrices.length === 0) {
          return {
            caliber,
            currentAvg: null,
            trend: 'STABLE' as const,
            trendPercent: 0,
            priceTimingSignal: showPriceTimingSignal ? null : undefined,
            priceContext: 'INSUFFICIENT_DATA' as const,
            contextMeta: {
              windowDays: 7,
              sampleCount: 0,
              asOf: new Date().toISOString()
            }
          }
        }

        const currentAvg =
          currentPrices.reduce((sum, p) => sum + parseFloat(p.price.toString()), 0) /
          currentPrices.length

        // Get 7-day historical average for trend
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

        const historicalPrices = await prisma.prices.findMany({
          where: {
            products: { caliber },
            createdAt: { lt: sevenDaysAgo },
            ...visiblePriceWhere(),
          },
          select: { price: true },
          take: 50
        })

        let trend: 'UP' | 'DOWN' | 'STABLE' = 'STABLE'
        let trendPercent = 0

        if (historicalPrices.length > 0) {
          const historicalAvg =
            historicalPrices.reduce((sum, p) => sum + parseFloat(p.price.toString()), 0) /
            historicalPrices.length

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
            windowDays: 7,
            sampleCount: currentPrices.length,
            asOf: new Date().toISOString()
          }
        }
      })
    )

    res.json({
      pulse: pulseData,
      _meta: {
        tier: userTier,
        calibersShown: calibers.length,
        calibersLimit: maxCalibers
      }
    })
  } catch (error) {
    log.error('Market pulse error', { error }, error as Error)
    res.status(500).json({ error: 'Failed to fetch market pulse' })
  }
})

// ============================================================================
// PERSONALIZED FEED ENDPOINT
// Returns personalized items based on alerts/watchlist
// Free: 5 items max, basic ranking
// Premium: 20 items, stock indicators, relative value context
// ============================================================================

router.get('/deals', async (req: Request, res: Response) => {
  try {
    // Get authenticated user from JWT
    const userId = getAuthenticatedUserId(req)
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const userTier = await getUserTier(req)
    const maxDeals = getMaxDealsForYou(userTier)
    const showPricePosition = hasFeature(userTier, 'pricePositionIndex')
    const showStockIndicators = hasFeature(userTier, 'stockIndicators')
    const showExplanations = hasFeature(userTier, 'aiExplanations')

    // Get user's calibers from saved items (watchlist) for personalization
    // Per ADR-011A Section 17.2: All user-facing queries MUST include deletedAt: null
    const watchlistItems = await prisma.watchlist_items.findMany({
      where: { userId, deletedAt: null },
      include: { products: { select: { caliber: true, id: true } } }
    })

    // Extract calibers and product IDs for personalization
    const calibersSet = new Set<string>()
    const watchedProductIds = new Set<string>()

    // Products may be null for SEARCH intent items; filter safely
    watchlistItems.forEach((w) => {
      if (w.products?.caliber) calibersSet.add(w.products.caliber)
      if (w.products?.id) watchedProductIds.add(w.products.id)
    })

    const calibers = Array.from(calibersSet)

    // Build where clause - prioritize user's calibers if they have any
    const whereClause: any = {
      inStock: true,
      ...visiblePriceWhere(),
    }

    if (calibers.length > 0) {
      whereClause.products = { caliber: { in: calibers } }
    }

    // Get deals with best prices
    const prices = await prisma.prices.findMany({
      where: whereClause,
      include: {
        products: {
          select: {
            id: true,
            name: true,
            caliber: true,
            brand: true,
            imageUrl: true,
            roundCount: true,
            grainWeight: true
          }
        },
        retailers: {
          select: {
            id: true,
            name: true,
            tier: true,
            logoUrl: true
          }
        }
      },
      orderBy: [{ retailers: { tier: 'desc' } }, { price: 'asc' }],
      take: maxDeals * 2 // Fetch extra for deduplication
    })

    // Deduplicate by product (keep best price per product)
    const seenProducts = new Set<string>()
    const deals = prices
      .filter(p => {
        // Skip prices without a productId or products
        if (!p.productId || !p.products) return false
        if (seenProducts.has(p.productId)) return false
        seenProducts.add(p.productId)
        return true
      })
      .slice(0, maxDeals)
      .map(price => {
        // price.products is guaranteed non-null by the filter above
        const product = price.products!
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
          isWatched: price.productId ? watchedProductIds.has(price.productId) : false
        }

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

        return deal
      })

    res.json({
      items: deals,
      _meta: {
        tier: userTier,
        itemsShown: deals.length,
        itemsLimit: maxDeals,
        personalized: calibers.length > 0,
        calibersUsed: calibers
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
// Free: Blocked (returns upgrade CTA)
// Premium: 30/90/365 day charts
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

    const { caliber } = req.params
    const { days } = priceHistorySchema.parse(req.query)

    const userTier = await getUserTier(req)

    // Check if user has access to price history
    if (!hasPriceHistoryAccess(userTier)) {
      return res.status(403).json({
        error: 'Price history is a Premium feature',
        message: 'Upgrade to Premium to view price history charts',
        upgradeUrl: '/pricing',
        tier: userTier
      })
    }

    // Enforce tier-based history limit
    const maxDays = getPriceHistoryDays(userTier)
    const effectiveDays = Math.min(days, maxDays)

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - effectiveDays)

    // Get price history aggregated by day
    const prices = await prisma.prices.findMany({
      where: {
        products: { caliber: decodeURIComponent(caliber) },
        createdAt: { gte: startDate },
        ...visiblePriceWhere(),
      },
      select: {
        price: true,
        createdAt: true
      },
      orderBy: { createdAt: 'asc' }
    })

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
          upgradeMessage: 'Upgrade to Premium for full price history charts',
          upgradeUrl: '/pricing'
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
