// AI-powered semantic search module

// Intent parsing
export { parseSearchIntent } from './intent-parser'
export type {
  SearchIntent,
  PremiumSearchIntent,
  SafetyConstraint,
  ParseOptions
} from './intent-parser'

// Main search service
export { aiSearch, getSearchSuggestions } from './search-service'
export type {
  AISearchResult,
  ExplicitFilters,
  AISearchOptions
} from './search-service'

// Premium ranking
export { applyPremiumRanking, applyFreeRanking } from './premium-ranking'
export type {
  ProductForRanking,
  PremiumRankedProduct,
  PremiumRankingOptions
} from './premium-ranking'

// Price Signal Index (descriptive context, not recommendations)
export {
  calculatePriceSignalIndex,
  batchCalculatePriceSignalIndex,
  clearPriceStatsCache,
  warmPriceStatsCache
} from './price-signal-index'
export type {
  PriceSignalIndex,
  ContextBand,
  PriceContextMeta
} from './price-signal-index'

// Domain knowledge
export * from './ammo-knowledge'

// Embedding service
export * from './embedding-service'
