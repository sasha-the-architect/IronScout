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
      bestValueScore: false,            // Composite value scoring
      reliabilityInsights: false,       // Brand/product reliability data

      // Advanced Features
      premiumFilters: false,            // +P, subsonic, velocity, etc.
      advancedSorting: false,           // Best Match, Best Value, Most Reliable
      performanceBadges: false,         // "Low flash", "Short-barrel optimized"

      // Alerts
      realTimeAlerts: false,
      productLevelAlerts: false,        // Premium only

      // Dashboard
      buyWaitScore: false,              // Premium only
      verifiedSavings: false,           // Premium only (shows potential only)
      flashDeals: false,                // Premium only
      stockIndicators: false,           // Premium only
      collections: false,               // Premium only
    }
  },
  PREMIUM: {
    // Alerts
    maxActiveAlerts: -1, // Unlimited
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
      bestValueScore: true,             // Composite value scoring
      reliabilityInsights: true,        // Brand/product reliability data

      // Advanced Features
      premiumFilters: true,             // +P, subsonic, velocity, etc.
      advancedSorting: true,            // Best Match, Best Value, Most Reliable
      performanceBadges: true,          // "Low flash", "Short-barrel optimized"

      // Alerts
      realTimeAlerts: true,
      productLevelAlerts: true,         // Can alert on specific SKUs

      // Dashboard
      buyWaitScore: true,               // 1-100 score
      verifiedSavings: true,            // With purchase attribution
      flashDeals: true,                 // Time-sensitive deals
      stockIndicators: true,            // "Only X left"
      collections: true,                // Organize watchlist into loadouts
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
 * Get tier configuration for a user tier
 */
export function getTierConfig(tier: UserTier) {
  return TIER_CONFIG[tier] || TIER_CONFIG.FREE
}

/**
 * Check if a user has reached their alert limit
 * Returns false for unlimited (-1)
 */
export function hasReachedAlertLimit(tier: UserTier, currentAlertCount: number): boolean {
  const config = getTierConfig(tier)
  if (config.maxActiveAlerts === -1) return false
  return currentAlertCount >= config.maxActiveAlerts
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
