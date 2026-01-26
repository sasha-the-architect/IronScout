// Dashboard hooks
export { useMarketPulse } from './use-market-pulse'
export { useSavings } from './use-savings'
export { useDashboardStats } from './use-dashboard-stats'

// Saved Items (ADR-011 - replaces watchlist/alerts)
export { useSavedItems } from './use-saved-items'
export type { UseSavedItemsResult } from './use-saved-items'

// Legacy (deprecated - use useSavedItems instead)
/** @deprecated Use useSavedItems instead */
export { useWatchlist } from './use-watchlist'
