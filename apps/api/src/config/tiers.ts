/**
 * Tier-based feature configuration
 * Defines limits and features for each user tier
 */

export const TIER_CONFIG = {
  FREE: {
    // Alerts
    maxActiveAlerts: 5,
    alertDelayMinutes: 60, // 1 hour delay on notifications
    
    // Search
    maxSearchResults: 10,
    
    // Price History
    priceHistoryAccess: false,
    
    // Other features
    prioritySupport: false,
  },
  PREMIUM: {
    // Alerts
    maxActiveAlerts: 100, // Effectively unlimited for normal use
    alertDelayMinutes: 0, // Real-time notifications
    
    // Search
    maxSearchResults: 100, // Full results
    
    // Price History
    priceHistoryAccess: true,
    
    // Other features
    prioritySupport: true,
  },
} as const

export type UserTier = keyof typeof TIER_CONFIG

/**
 * Get tier configuration for a user tier
 */
export function getTierConfig(tier: UserTier) {
  return TIER_CONFIG[tier] || TIER_CONFIG.FREE
}

/**
 * Check if a user has reached their alert limit
 */
export function hasReachedAlertLimit(tier: UserTier, currentAlertCount: number): boolean {
  const config = getTierConfig(tier)
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
  return config.priceHistoryAccess
}

/**
 * Get max search results for a tier
 */
export function getMaxSearchResults(tier: UserTier): number {
  const config = getTierConfig(tier)
  return config.maxSearchResults
}
