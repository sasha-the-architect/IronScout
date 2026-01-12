/**
 * ============================================================================
 * HISTORICAL: Original Tier Configuration
 * ============================================================================
 * This file preserves the original FREE/PREMIUM tier system that was designed
 * but disabled for v1 launch. It is NOT imported anywhere at runtime.
 *
 * Preserved for reference when designing future premium features.
 * The actual v1 configuration lives in tiers.ts as V1_CAPABILITIES.
 *
 * Original Pricing (never launched):
 * - FREE: $0
 * - PREMIUM Monthly: $7.99/mo
 * - PREMIUM Annual: $69.99/yr (~$5.83/mo, 27% savings)
 *
 * Original Core Principle:
 * "Free helps you find deals.
 *  Premium gives you more context, faster signals, and fewer missed opportunities."
 * ============================================================================
 */

export const HISTORICAL_TIER_CONFIG = {
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
      basicPurposeDetection: true,
      advancedPurposeInterpretation: false,

      // Results & Ranking
      standardRanking: true,
      purposeOptimizedRanking: false,
      performanceAwareMatching: false,

      // AI Insights
      aiExplanations: false,
      pricePositionIndex: false,
      reliabilityInsights: false,

      // Advanced Features
      premiumFilters: false,
      advancedSorting: false,
      performanceBadges: false,

      // Alerts
      realTimeAlerts: false,
      productLevelAlerts: false,

      // Dashboard
      priceTimingSignal: false,
      flashDeals: false,
      stockIndicators: false,
      collections: false,
    }
  },
  PREMIUM: {
    // Alerts
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
      advancedPurposeInterpretation: true,

      // Results & Ranking
      standardRanking: true,
      purposeOptimizedRanking: true,
      performanceAwareMatching: true,

      // AI Insights
      aiExplanations: true,
      pricePositionIndex: true,
      reliabilityInsights: true,

      // Advanced Features
      premiumFilters: true,
      advancedSorting: true,
      performanceBadges: true,

      // Alerts
      realTimeAlerts: true,
      productLevelAlerts: true,

      // Dashboard (disabled per UX/ADR decisions, not tier-based)
      priceTimingSignal: false,
      flashDeals: false,
      stockIndicators: false,
      collections: false,
    }
  },
} as const

/**
 * Historical Stripe Price IDs (never used in production)
 */
export const HISTORICAL_STRIPE_PRICES = {
  PREMIUM_MONTHLY: 'price_premium_monthly',
  PREMIUM_ANNUAL: 'price_premium_annual',
} as const

/**
 * Historical pricing display values (never launched)
 */
export const HISTORICAL_PRICING = {
  PREMIUM_MONTHLY: 7.99,
  PREMIUM_ANNUAL: 69.99,
  PREMIUM_ANNUAL_MONTHLY_EQUIVALENT: 5.83,
  ANNUAL_SAVINGS_PERCENT: 27,
} as const
