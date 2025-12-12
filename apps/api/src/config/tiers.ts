/**
 * Tier-based feature configuration
 * Defines limits and features for each user tier
 * 
 * Pricing:
 * - FREE: $0
 * - PREMIUM Monthly: $4.99/mo
 * - PREMIUM Annual: $49.99/yr (~$4.17/mo, 17% savings)
 */

export const TIER_CONFIG = {
  FREE: {
    // Alerts
    maxActiveAlerts: 3, // Up to 3 alerts, daily digest
    alertDelayMinutes: 60, // Delayed notifications (daily digest planned)
    
    // Search
    maxSearchResults: 20,
    
    // Price History
    priceHistoryDays: 0, // No history
    
    // Comparisons
    maxComparisons: 3,
    
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
  PREMIUM_MONTHLY: 4.99,
  PREMIUM_ANNUAL: 49.99,
  PREMIUM_ANNUAL_MONTHLY_EQUIVALENT: 4.17, // $49.99 / 12
  ANNUAL_SAVINGS_PERCENT: 17,
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
