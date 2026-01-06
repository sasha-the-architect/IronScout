import { Prisma } from '@ironscout/db'
// Import visibility predicate directly to avoid triggering Prisma client creation during tests
import { visibleRetailerPriceWhere as sharedVisibleRetailerPriceWhere } from '@ironscout/db/visibility.js'
import { premiumEnabled, getEffectiveTier } from '../lib/features'

/**
 * Tier-based feature configuration
 * Defines limits and features for each user tier
 *
 * Pricing:
 * - FREE: $0
 * - PREMIUM Monthly: $7.99/mo
 * - PREMIUM Annual: $69.99/yr (~$5.83/mo, 27% savings)
 *
 * Core Principle:
 * "Free helps you find deals.
 *  Premium gives you more context, faster signals, and fewer missed opportunities."
 */

export const TIER_CONFIG = {
  FREE: {
    // Alerts
    maxActiveAlerts: 3, // Caliber-level only, delayed
    alertDelayMinutes: 60, // Delayed notifications (daily digest planned)

    // Search
    maxSearchResults: 20,

    // Price History
    priceHistoryDays: 7, // Limited history (7 days) - teaser for Premium

    // Comparisons
    maxComparisons: 3,

    // Dashboard
    maxMarketPulseCalibrs: 2, // 2 calibers max
    maxDealsForYou: 5, // 5 deals max
    maxWatchlistItems: 5, // 5 items max

    // AI Features
    features: {
      // Search & Filtering
      basicSearch: true,
      allFilters: true,
      naturalLanguageSearch: true,

      // AI Purpose Detection
      basicPurposeDetection: true,      // Detects primary purpose only
      advancedPurposeInterpretation: false, // Deep semantic analysis

      // Results & Ranking
      standardRanking: true,            // Basic relevance + price
      purposeOptimizedRanking: false,   // Results ranked for user's purpose
      performanceAwareMatching: false,  // Bullet type, reliability, etc.

      // AI Insights
      aiExplanations: false,            // "These loads are optimized for..."
      pricePositionIndex: false,        // Normalized price position vs. reference set
      reliabilityInsights: false,       // Brand/product reliability data

      // Advanced Features
      premiumFilters: false,            // +P, subsonic, velocity, etc.
      advancedSorting: false,           // Best Match, Best Value, Most Reliable
      performanceBadges: false,         // "Low flash", "Short-barrel optimized"

      // Alerts
      realTimeAlerts: false,
      productLevelAlerts: false,        // Premium only

      // Dashboard
      priceTimingSignal: false,         // Premium only
      flashDeals: false,                // Premium only
      stockIndicators: false,           // Premium only
      collections: false,               // Premium only
    }
  },
  PREMIUM: {
    // Alerts
    // Premium improves speed only; volume and scope stay aligned with Free
    maxActiveAlerts: 3, // Same cap as Free
    alertDelayMinutes: 0, // Real-time notifications

    // Search
    maxSearchResults: 100,

    // Price History
    priceHistoryDays: 365, // Full year

    // Comparisons
    maxComparisons: -1, // Unlimited

    // Dashboard
    maxMarketPulseCalibrs: -1, // Unlimited
    maxDealsForYou: 20, // 20 deals + flash deals
    maxWatchlistItems: -1, // Unlimited

    // AI Features
    features: {
      // Search & Filtering
      basicSearch: true,
      allFilters: true,
      naturalLanguageSearch: true,

      // AI Purpose Detection
      basicPurposeDetection: true,
      advancedPurposeInterpretation: true, // Full semantic analysis

      // Results & Ranking
      standardRanking: true,
      purposeOptimizedRanking: true,    // Results ranked for user's purpose
      performanceAwareMatching: true,   // Bullet type, reliability, etc.

      // AI Insights
      aiExplanations: true,             // "These loads are optimized for..."
      pricePositionIndex: true,         // Normalized price position vs. reference set
      reliabilityInsights: true,        // Brand/product reliability data

      // Advanced Features
      premiumFilters: true,             // +P, subsonic, velocity, etc.
      advancedSorting: true,            // Best Match, Best Value, Most Reliable
      performanceBadges: true,          // "Low flash", "Short-barrel optimized"

      // Alerts
      realTimeAlerts: true,
      productLevelAlerts: true,         // Can alert on specific SKUs

      // Dashboard
      priceTimingSignal: false,         // Disabled per UX/ADR (no scores)
      flashDeals: false,                // Disabled (no urgency)
      stockIndicators: false,           // Disabled (no urgency)
      collections: false,               // Deferred
    }
  },
} as const

export type UserTier = keyof typeof TIER_CONFIG
export type TierFeatures = typeof TIER_CONFIG[UserTier]['features']

/**
 * Stripe Price IDs
 * Update these after creating/updating products in Stripe Dashboard
 */
export const STRIPE_PRICES = {
  PREMIUM_MONTHLY: process.env.STRIPE_PRICE_PREMIUM_MONTHLY || 'price_premium_monthly',
  PREMIUM_ANNUAL: process.env.STRIPE_PRICE_PREMIUM_ANNUAL || 'price_premium_annual',
} as const

/**
 * Pricing display values
 */
export const PRICING = {
  PREMIUM_MONTHLY: 7.99,
  PREMIUM_ANNUAL: 69.99,
  PREMIUM_ANNUAL_MONTHLY_EQUIVALENT: 5.83, // $69.99 / 12
  ANNUAL_SAVINGS_PERCENT: 27,
} as const

/**
 * Get tier configuration for a user tier.
 *
 * IMPORTANT: When FEATURE_PREMIUM_ENABLED=false, this always returns FREE tier config
 * regardless of the user's actual tier. This ensures all premium features are disabled
 * consistently across the application.
 */
export function getTierConfig(tier: UserTier) {
  // Apply feature flag - force FREE tier when premium is disabled
  const effectiveTier = getEffectiveTier(tier)
  return TIER_CONFIG[effectiveTier] || TIER_CONFIG.FREE
}

/**
 * Check if a user has reached their alert limit
 * Returns false for unlimited (-1)
 */
export function hasReachedAlertLimit(tier: UserTier, currentAlertCount: number): boolean {
  const config = getTierConfig(tier)
  const maxAlerts: number = config.maxActiveAlerts
  if (maxAlerts === -1) return false
  return currentAlertCount >= maxAlerts
}

/**
 * Get the notification delay in milliseconds for a tier
 */
export function getNotificationDelayMs(tier: UserTier): number {
  const config = getTierConfig(tier)
  return config.alertDelayMinutes * 60 * 1000
}

/**
 * Check if a tier has access to price history
 */
export function hasPriceHistoryAccess(tier: UserTier): boolean {
  const config = getTierConfig(tier)
  return config.priceHistoryDays > 0
}

/**
 * Get price history days limit for a tier
 */
export function getPriceHistoryDays(tier: UserTier): number {
  const config = getTierConfig(tier)
  return config.priceHistoryDays
}

/**
 * Get max search results for a tier
 */
export function getMaxSearchResults(tier: UserTier): number {
  const config = getTierConfig(tier)
  return config.maxSearchResults
}

/**
 * Get max comparisons for a tier
 * Returns -1 for unlimited
 */
export function getMaxComparisons(tier: UserTier): number {
  const config = getTierConfig(tier)
  return config.maxComparisons
}

/**
 * Check if a tier has a specific feature
 */
export function hasFeature(tier: UserTier, feature: keyof TierFeatures): boolean {
  const config = getTierConfig(tier)
  return config.features[feature] ?? false
}

/**
 * Get all features for a tier
 */
export function getTierFeatures(tier: UserTier): TierFeatures {
  const config = getTierConfig(tier)
  return config.features
}

/**
 * Get max Market Pulse calibers for a tier
 * Returns -1 for unlimited
 */
export function getMaxMarketPulseCalibers(tier: UserTier): number {
  const config = getTierConfig(tier)
  return config.maxMarketPulseCalibrs
}

/**
 * Get max Deals For You count for a tier
 */
export function getMaxDealsForYou(tier: UserTier): number {
  const config = getTierConfig(tier)
  return config.maxDealsForYou
}

/**
 * Get max watchlist items for a tier
 * Returns -1 for unlimited
 */
export function getMaxWatchlistItems(tier: UserTier): number {
  const config = getTierConfig(tier)
  return config.maxWatchlistItems
}

/**
 * Check if a user has reached their watchlist limit
 * Returns false for unlimited (-1)
 */
export function hasReachedWatchlistLimit(tier: UserTier, currentCount: number): boolean {
  const limit = getMaxWatchlistItems(tier)
  if (limit === -1) return false
  return currentCount >= limit
}

/**
 * Price history data point type
 */
export interface PriceHistoryDataPoint {
  date: string
  avgPrice: number
  minPrice: number
  maxPrice: number
  dataPoints: number
}

/**
 * Shape price history based on user tier.
 * FREE users get summary only (current, recentAvg, trend) - no day-by-day data.
 * PREMIUM users get full day-by-day history limited to their tier's allowed days.
 *
 * IMPORTANT: Always call this before res.json() to ensure FREE users never
 * receive raw history data. The UI should not be responsible for trimming.
 */
export function shapePriceHistory(
  history: PriceHistoryDataPoint[],
  tier: UserTier
): { current: number | null; recentAvg: number | null; trend: 'UP' | 'DOWN' | 'STABLE' } | { history: PriceHistoryDataPoint[] } {
  // Enforce tier-based day limit first
  const maxDays = getPriceHistoryDays(tier)
  const trimmedHistory = history.slice(-maxDays)

  if (tier === 'FREE') {
    // FREE tier: summary only, no day-by-day data
    if (trimmedHistory.length === 0) {
      return {
        current: null,
        recentAvg: null,
        trend: 'STABLE' as const,
      }
    }

    const currentPrice = trimmedHistory[trimmedHistory.length - 1].avgPrice
    const recentAvg = trimmedHistory.reduce((sum, h) => sum + h.avgPrice, 0) / trimmedHistory.length

    // Calculate trend based on first vs last price
    let trend: 'UP' | 'DOWN' | 'STABLE' = 'STABLE'
    if (trimmedHistory.length > 1) {
      const firstPrice = trimmedHistory[0].avgPrice
      const pctChange = ((currentPrice - firstPrice) / firstPrice) * 100
      if (pctChange > 3) trend = 'UP'
      else if (pctChange < -3) trend = 'DOWN'
    }

    return {
      current: Math.round(currentPrice * 100) / 100,
      recentAvg: Math.round(recentAvg * 100) / 100,
      trend,
    }
  }

  // PREMIUM tier: full history (already trimmed to maxDays)
  return { history: trimmedHistory }
}

// ============================================================================
// RETAILER VISIBILITY FILTERS
// ============================================================================

export function visibleDealerPriceWhere(): Prisma.pricesWhereInput {
  // DEPRECATED: Use visibleRetailerPriceWhere() instead
  // This function uses the legacy dealer relation which is being phased out
  return visibleRetailerPriceWhere()
}

/**
 * Prisma where clause to filter prices by retailer visibility.
 *
 * Per Merchant-and-Retailer-Reference (Option A):
 *
 * | visibilityStatus | Merchant Relationships      | Result              |
 * |------------------|-----------------------------|--------------------|
 * | ELIGIBLE         | none                        | Visible (crawl-only)|
 * | ELIGIBLE         | >=1 ACTIVE + LISTED         | Visible            |
 * | ELIGIBLE         | >=1 ACTIVE, all UNLISTED    | Hidden             |
 * | ELIGIBLE         | all SUSPENDED               | Visible (crawl-only)|
 * | INELIGIBLE       | any                         | Hidden             |
 *
 * Consumer visibility = retailers.visibilityStatus=ELIGIBLE
 *   AND (no merchant_retailers OR at least one ACTIVE+LISTED relationship)
 *
 * IMPORTANT: Apply this filter to ALL consumer-facing queries that include prices.
 * This prevents ineligible or unlisted retailers from appearing in search, alerts, watchlist, etc.
 *
 * Usage in Prisma queries:
 * ```ts
 * prices: {
 *   where: visibleRetailerPriceWhere(),
 *   ...
 * }
 * ```
 *
 * Or for standalone price queries:
 * ```ts
 * prisma.price.findMany({
 *   where: {
 *     ...otherConditions,
 *     ...visibleRetailerPriceWhere(),
 *   }
 * })
 * ```
 */
export function visibleRetailerPriceWhere(): Prisma.pricesWhereInput {
  // In development, allow bypassing merchant_retailer checks for simpler test data
  // NODE_ENV is 'development' or undefined in local dev
  const isDev = !process.env.NODE_ENV || process.env.NODE_ENV === 'development'
  const skipMerchantCheck = isDev && process.env.SKIP_MERCHANT_RETAILER_CHECK === 'true'

  if (skipMerchantCheck) {
    return {
      retailers: {
        is: {
          visibilityStatus: 'ELIGIBLE',
        },
      },
    }
  }

  // Use shared A1 visibility predicate from @ironscout/db
  // See packages/db/visibility.js for truth table and semantics
  return sharedVisibleRetailerPriceWhere()
}

// ============================================================================
// ADR-015: RUN IGNORE FILTERS
// ============================================================================

/**
 * Prisma where clause to exclude prices from ignored runs.
 *
 * Per ADR-015: Ignored runs are excluded from all user-visible reads.
 * This filters out prices where:
 * - affiliateFeedRunId points to an ignored affiliate_feed_run
 *
 * Note: For SCRAPE and MERCHANT_FEED run types, the relation is via
 * ingestionRunId which requires raw SQL for efficient filtering.
 * For now, we focus on affiliate feeds which are the primary source.
 *
 * Usage: Combine with visibleRetailerPriceWhere() for complete filtering:
 * ```ts
 * prices: {
 *   where: {
 *     ...visibleRetailerPriceWhere(),
 *     ...nonIgnoredRunPriceWhere(),
 *   }
 * }
 * ```
 */
export function nonIgnoredRunPriceWhere(): Prisma.pricesWhereInput {
  return {
    // For affiliate-sourced prices, filter via the relation
    OR: [
      // No affiliate run link (legacy scrape data, manual, etc.)
      { affiliateFeedRunId: null },
      // Affiliate run exists but is NOT ignored
      {
        affiliate_feed_runs: {
          is: {
            ignoredAt: null,
          },
        },
      },
    ],
  }
}

/**
 * Complete visibility filter for consumer-facing price queries.
 *
 * Combines:
 * - ADR-005: Retailer visibility (ELIGIBLE + LISTED + ACTIVE)
 * - ADR-015: Run ignore semantics (exclude ignored runs)
 *
 * IMPORTANT: Use this for ALL consumer-facing price queries.
 *
 * Usage:
 * ```ts
 * prices: {
 *   where: visiblePriceWhere(),
 *   ...
 * }
 * ```
 */
export function visiblePriceWhere(): Prisma.pricesWhereInput {
  return {
    AND: [
      visibleRetailerPriceWhere(),
      nonIgnoredRunPriceWhere(),
    ],
  }
}
