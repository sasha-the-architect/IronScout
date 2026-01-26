import { Prisma } from '@ironscout/db'
// Import visibility predicate directly to avoid triggering Prisma client creation during tests
import { visibleRetailerPriceWhere as sharedVisibleRetailerPriceWhere } from '@ironscout/db/visibility.js'

/**
 * ============================================================================
 * V1 CAPABILITIES
 * ============================================================================
 * In v1, all users receive identical capabilities. There is no tier system.
 *
 * This file contains:
 * - V1_CAPABILITIES: The single source of truth for what users can do
 * - Helper functions that return these values directly (tier parameter ignored)
 * - Visibility filters for retailer/price queries
 *
 * Historical tier configuration has been moved to tiers.legacy.ts for reference.
 * ============================================================================
 */

/**
 * V1 capabilities - what all users get.
 * These are the actual runtime values used by the application.
 */
export const V1_CAPABILITIES = {
  // Alerts
  maxActiveAlerts: -1, // Unlimited
  alertDelayMinutes: 0, // Real-time notifications

  // Search
  maxSearchResults: -1, // Unlimited

  // Price History
  priceHistoryDays: 365, // Full year

  // Comparisons
  maxComparisons: -1, // Unlimited

  // Dashboard
  maxMarketPulseCalibrs: -1, // Unlimited
  maxDealsForYou: 20,
  maxWatchlistItems: -1, // Unlimited

  // Feature flags (not tier-based, just product decisions)
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

    // Dashboard (disabled per UX/ADR decisions)
    priceTimingSignal: false,
    flashDeals: false,
    stockIndicators: false,
    collections: false,
  }
} as const

export type V1Features = typeof V1_CAPABILITIES['features']

// Legacy type for API compatibility (tier parameter is ignored)
export type UserTier = 'FREE' | 'PREMIUM'
export type TierFeatures = V1Features

// ============================================================================
// CAPABILITY ACCESSORS
// ============================================================================
// These functions provide V1 capability values.
// The _tier parameter is preserved for API compatibility but ignored.

/**
 * Get tier configuration. V1: Always returns V1_CAPABILITIES.
 * @deprecated Use V1_CAPABILITIES directly
 */
export function getTierConfig(_tier?: UserTier | string) {
  return V1_CAPABILITIES
}

/**
 * Check if user has reached alert limit.
 * V1: Always checks against maxActiveAlerts (3).
 */
export function hasReachedAlertLimit(_tier: UserTier | string, currentAlertCount: number): boolean {
  const max: number = V1_CAPABILITIES.maxActiveAlerts
  if (max === -1) return false
  return currentAlertCount >= max
}

/**
 * Get notification delay in milliseconds.
 * V1: Always 0 (real-time).
 */
export function getNotificationDelayMs(_tier?: UserTier | string): number {
  return V1_CAPABILITIES.alertDelayMinutes * 60 * 1000
}

/**
 * Check if price history is accessible.
 * V1: Always true (365 days available).
 */
export function hasPriceHistoryAccess(_tier?: UserTier | string): boolean {
  return V1_CAPABILITIES.priceHistoryDays > 0
}

/**
 * Get price history days limit.
 * V1: Always 365.
 */
export function getPriceHistoryDays(_tier?: UserTier | string): number {
  return V1_CAPABILITIES.priceHistoryDays
}

/**
 * Get max search results.
 * V1: Unlimited (-1).
 */
export function getMaxSearchResults(_tier?: UserTier | string): number {
  return V1_CAPABILITIES.maxSearchResults
}

/**
 * Check if user has reached search results limit.
 * V1: Always false (unlimited).
 */
export function hasReachedSearchLimit(_tier: UserTier | string, currentCount: number): boolean {
  const limit = V1_CAPABILITIES.maxSearchResults
  if (limit === -1) return false
  return currentCount >= limit
}

/**
 * Get max comparisons.
 * V1: Always -1 (unlimited).
 */
export function getMaxComparisons(_tier?: UserTier | string): number {
  return V1_CAPABILITIES.maxComparisons
}

/**
 * Check if a feature is enabled.
 * V1: Returns the feature value from V1_CAPABILITIES.features.
 */
export function hasFeature(_tier: UserTier | string, feature: keyof V1Features): boolean {
  return V1_CAPABILITIES.features[feature] ?? false
}

/**
 * Get all features. V1: Returns V1_CAPABILITIES.features.
 * @deprecated Use V1_CAPABILITIES.features directly
 */
export function getTierFeatures(_tier?: UserTier | string): V1Features {
  return V1_CAPABILITIES.features
}

/**
 * Get max Market Pulse calibers.
 * V1: Always -1 (unlimited).
 */
export function getMaxMarketPulseCalibers(_tier?: UserTier | string): number {
  return V1_CAPABILITIES.maxMarketPulseCalibrs
}

/**
 * Get max Deals For You count.
 * V1: Always 20.
 */
export function getMaxDealsForYou(_tier?: UserTier | string): number {
  return V1_CAPABILITIES.maxDealsForYou
}

/**
 * Get max watchlist items.
 * V1: Always -1 (unlimited).
 */
export function getMaxWatchlistItems(_tier?: UserTier | string): number {
  return V1_CAPABILITIES.maxWatchlistItems
}

/**
 * Check if watchlist limit reached.
 * V1: Always false (unlimited).
 */
export function hasReachedWatchlistLimit(_tier: UserTier | string, currentCount: number): boolean {
  const limit = V1_CAPABILITIES.maxWatchlistItems
  if (limit === -1) return false
  return currentCount >= limit
}

// ============================================================================
// PRICE HISTORY SHAPING
// ============================================================================

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
 * Shape price history for API response.
 * V1: Returns full day-by-day history (up to 365 days).
 */
export function shapePriceHistory(
  history: PriceHistoryDataPoint[],
  _tier?: UserTier | string
): { history: PriceHistoryDataPoint[] } {
  const maxDays = V1_CAPABILITIES.priceHistoryDays
  const trimmedHistory = history.slice(-maxDays)
  return { history: trimmedHistory }
}

// ============================================================================
// RETAILER VISIBILITY FILTERS
// ============================================================================

export function visibleDealerPriceWhere(): Prisma.pricesWhereInput {
  // DEPRECATED: Use visibleRetailerPriceWhere() instead
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
 * IMPORTANT: Apply this filter to ALL consumer-facing queries that include prices.
 */
export function visibleRetailerPriceWhere(): Prisma.pricesWhereInput {
  return sharedVisibleRetailerPriceWhere()
}

// ============================================================================
// ADR-015: RUN IGNORE FILTERS
// ============================================================================

/**
 * Prisma where clause to exclude prices from ignored runs.
 * Per ADR-015: Ignored runs are excluded from all user-visible reads.
 */
export function nonIgnoredRunPriceWhere(): Prisma.pricesWhereInput {
  return {
    OR: [
      { affiliateFeedRunId: null },
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
 * Visibility filter for historical price reads.
 * Applies retailer eligibility + listing and ignored-run exclusion.
 * Does NOT apply current-price lookback.
 */
export function visibleHistoricalPriceWhere(): Prisma.pricesWhereInput {
  return {
    AND: [
      visibleRetailerPriceWhere(),
      nonIgnoredRunPriceWhere(),
    ],
  }
}

// ============================================================================
// PRICE LOOKBACK FILTER (per search-lens-v1.md)
// ============================================================================

/**
 * Get the current price lookback days setting.
 * Per search-lens-v1.md: visible offers must be within CURRENT_PRICE_LOOKBACK_DAYS.
 * Default: 7 days
 */
export function getPriceLookbackDays(): number {
  return parseInt(process.env.CURRENT_PRICE_LOOKBACK_DAYS || '7', 10)
}

/**
 * Prisma where clause to filter prices by lookback window.
 * Per search-lens-v1.md: only prices observed within CURRENT_PRICE_LOOKBACK_DAYS
 * are considered "current" for lens evaluation.
 */
export function priceLookbackWhere(): Prisma.pricesWhereInput {
  const lookbackDays = getPriceLookbackDays()
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - lookbackDays)

  return {
    observedAt: {
      gte: cutoffDate,
    },
  }
}

/**
 * Complete visibility filter for consumer-facing price queries.
 * Combines ADR-005 (retailer visibility), ADR-015 (run ignore), and
 * search-lens-v1.md (price lookback).
 */
export function visiblePriceWhere(): Prisma.pricesWhereInput {
  return {
    AND: [
      visibleRetailerPriceWhere(),
      nonIgnoredRunPriceWhere(),
      priceLookbackWhere(),
    ],
  }
}
