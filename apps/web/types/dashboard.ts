/**
 * Dashboard TypeScript Types
 *
 * Types for the dashboard components.
 * Aligned with API responses from /api/dashboard/* endpoints.
 *
 * IMPORTANT (ADR-006): All types must be descriptive, not prescriptive.
 * - No "verdict", "recommendation", "deal" terminology
 * - Price context is comparative only
 */

// ============================================================================
// Price Context Types (ADR-006 Compliant)
// ============================================================================

/** Price context relative to recent observations - descriptive only */
export type PriceContext = 'LOWER_THAN_RECENT' | 'WITHIN_RECENT_RANGE' | 'HIGHER_THAN_RECENT' | 'INSUFFICIENT_DATA'

/** Price trend direction */
export type Trend = 'UP' | 'DOWN' | 'STABLE'

/** User subscription tier */
export type UserTier = 'FREE' | 'PREMIUM'

/** Context metadata for transparency */
export interface PriceContextMeta {
  windowDays: number
  sampleCount: number
  asOf: string
}

// ============================================================================
// Market Pulse Types
// ============================================================================

/** Single caliber market status */
export interface MarketPulseItem {
  /** Caliber name (e.g., "9mm FMJ", ".223 Rem") */
  caliber: string
  /** Current average price per round */
  currentAvg: number | null
  /** 7-day price trend direction */
  trend: Trend
  /** Percentage change over period */
  trendPercent: number
  /** Price timing signal 0-100 (Premium only) */
  priceTimingSignal?: number
  /** Descriptive price context (not a recommendation) */
  priceContext: PriceContext
  /** Context metadata for transparency */
  contextMeta?: PriceContextMeta
}

/** Market Pulse API response */
export interface MarketPulseResponse {
  pulse: MarketPulseItem[]
  _meta: {
    tier: UserTier
    calibersShown: number
    calibersLimit: number
    hasPriceTimingSignal: boolean
  }
}

// ============================================================================
// Deals For You Types
// ============================================================================

/** Single product item from personalized feed */
export interface ProductFeedItem {
  id: string
  product: {
    id: string
    name: string
    caliber: string
    brand: string
    imageUrl?: string | null
    roundCount?: number | null
    grainWeight?: number | null
  }
  retailer: {
    id: string
    name: string
    tier: string
    logoUrl?: string | null
  }
  /** Total price in dollars */
  price: number
  /** Price per round in dollars */
  pricePerRound: number | null
  /** Link to retailer product page */
  url: string
  /** Stock availability */
  inStock: boolean
  /** Whether user has this product in watchlist */
  isWatched: boolean
  /** Price context signal (Premium only) */
  priceSignal?: {
    relativePricePct: number
    positionInRange: number
    contextBand: PriceContext
  }
  /** AI-generated context explanation (Premium only) */
  explanation?: string
}

/** Product feed API response */
export interface ProductFeedResponse {
  items: ProductFeedItem[]
  _meta: {
    tier: UserTier
    itemsShown: number
    itemsLimit: number
    personalized: boolean
    calibersUsed: string[]
  }
}

// Legacy type alias for backwards compatibility during migration
/** @deprecated Use ProductFeedItem instead */
export type DealItem = ProductFeedItem
/** @deprecated Use ProductFeedResponse instead */
export type DealsResponse = ProductFeedResponse

// ============================================================================
// Price Delta Types (formerly "Savings Tracker")
// Purely arithmetic comparison vs user's target prices - not a claim of savings
// ============================================================================

/** Single price delta breakdown item */
export interface PriceDeltaItem {
  productId: string
  productName: string
  baselinePrice: number           // User's target price
  baselineType: 'USER_TARGET'     // Enum for future extension (AVG_7D, MSRP, etc.)
  currentPrice: number
  deltaAmount: number             // Positive = below baseline
  deltaPercent: number
}

/** Price delta data from API */
export interface PriceDeltaData {
  totalDeltaAmount: number
  breakdown: PriceDeltaItem[]
  alertsBelowTarget: number
  totalAlerts: number
}

/** Legacy savings breakdown item (for backwards compatibility) */
export interface SavingsBreakdownItem {
  productId: string
  productName: string
  targetPrice: number
  currentPrice: number
  savings: number
}

/** Legacy savings data (for backwards compatibility during migration) */
export interface SavingsData {
  potentialSavings: number
  breakdown: SavingsBreakdownItem[]
  alertsWithSavings: number
  totalAlerts: number
}

/** Price Delta API response */
export interface PriceDeltaResponse {
  priceDelta: PriceDeltaData
  savings: SavingsData  // Legacy field for backwards compatibility
  _meta: {
    tier: UserTier
  }
}

/** @deprecated Use PriceDeltaResponse instead */
export type SavingsResponse = PriceDeltaResponse

// ============================================================================
// Saved Items Types (ADR-011: Unified Watchlist + Alerts)
// ============================================================================

/** Notification rule types for saved items */
export type SavedItemRuleType = 'PRICE_DROP' | 'BACK_IN_STOCK' | 'NEW_PRODUCT'

/**
 * SavedItemDTO - Unified UI contract for saved items
 *
 * This is the ONLY type the UI should use for saved items.
 * It abstracts over the underlying WatchlistItem and Alert tables.
 *
 * @see ADR-011: Unified Saved Items
 */
export interface SavedItemDTO {
  /** Unique identifier (from watchlist or alert) */
  id: string
  /** Product ID */
  productId: string
  /** Product name */
  name: string
  /** Current price in dollars, null if unavailable */
  price: number | null
  /** Stock availability */
  inStock: boolean
  /** Product image URL */
  imageUrl: string | null
  /** Caliber/category */
  caliber: string
  /** Brand name */
  brand: string
  /** When the item was saved */
  savedAt: string
  /** Whether notifications are enabled for this item */
  notificationsEnabled: boolean
  /** Active notification rules */
  activeRules: SavedItemRuleType[]
  /** User's target price, if set */
  targetPrice: number | null
  /** Lowest price seen (Premium) */
  lowestPriceSeen: number | null
  /** Whether current price is the lowest seen (Premium) */
  isLowestSeen: boolean
}

/** Saved Items API response */
export interface SavedItemsResponse {
  items: SavedItemDTO[]
  _meta: {
    tier: UserTier
    itemCount: number
    itemLimit: number
    canAddMore: boolean
  }
}

// ============================================================================
// Watchlist Types (Legacy - migrate to SavedItemDTO)
// ============================================================================

/** @deprecated Use SavedItemDTO instead */
export interface WatchlistItem {
  id: string
  productId: string
  targetPrice: number | null
  createdAt: string
  product: {
    id: string
    name: string
    caliber: string
    brand: string
    imageUrl?: string | null
    currentPrice: number | null
    retailer: {
      id: string
      name: string
      tier: string
      logoUrl?: string | null
    } | null
    inStock: boolean
  }
  collection?: {
    id: string
    name: string
  } | null
  lowestPriceSeen: number | null
  lowestPriceSeenAt: string | null
  isLowestSeen: boolean
  savingsVsTarget: number | null
}

/** Watchlist collection (Premium only) */
export interface WatchlistCollection {
  id: string
  name: string
  _count: {
    items: number
  }
}

/** Watchlist API response */
export interface WatchlistResponse {
  items: WatchlistItem[]
  collections?: WatchlistCollection[]
  _meta: {
    tier: UserTier
    itemCount: number
    itemLimit: number
    canAddMore: boolean
    hasCollections: boolean
  }
}

// ============================================================================
// Price History Types
// ============================================================================

/** Single day price history entry */
export interface PriceHistoryEntry {
  date: string
  avgPrice: number
  minPrice: number
  maxPrice: number
  dataPoints: number
}

/** Price History API response */
export interface PriceHistoryResponse {
  caliber: string
  days: number
  history: PriceHistoryEntry[]
  _meta: {
    tier: UserTier
    requestedDays: number
    effectiveDays: number
    maxDaysAllowed: number
  }
}

// ============================================================================
// Component Props Types
// ============================================================================

/** Props for ContextChip component (ADR-006 compliant) */
export interface ContextChipProps {
  context: PriceContext
  /** Show tooltip on hover explaining context */
  showTooltip?: boolean
  /** Size variant */
  size?: 'sm' | 'md' | 'lg'
}

/** Props for PriceDelta component */
export interface PriceDeltaProps {
  /** Percentage change */
  percent: number
  /** Show arrow indicator */
  showArrow?: boolean
  /** Size variant */
  size?: 'sm' | 'md'
}

/** Props for Sparkline component */
export interface SparklineProps {
  /** Data points (normalized 0-1) */
  data: number[]
  /** Color based on trend */
  trend?: Trend
  /** Width in pixels */
  width?: number
  /** Height in pixels */
  height?: number
}

/** Props for ProductCard component (ADR-006 compliant) */
export interface ProductCardProps {
  item: ProductFeedItem
  /** Callback when View clicked */
  onViewClick?: () => void
  /** Callback when Save clicked (ADR-011: unified saved items) */
  onWatchlistClick?: () => void
}

/** Props for PulseRow component */
export interface PulseRowProps {
  pulse: MarketPulseItem
  /** Callback when row clicked */
  onClick?: () => void
}

/** Props for SavingsCard component */
export interface SavingsCardProps {
  savings: SavingsData
}

// ============================================================================
// Hook Return Types
// ============================================================================

/** Base hook result shape */
interface BaseHookResult<T> {
  data: T | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export type UseMarketPulseResult = BaseHookResult<MarketPulseResponse>
export type UseDealsResult = BaseHookResult<DealsResponse>
export type UseSavingsResult = BaseHookResult<SavingsResponse>
export type UseWatchlistResult = BaseHookResult<WatchlistResponse> & {
  addItem: (productId: string, targetPrice?: number) => Promise<boolean>
  removeItem: (id: string) => Promise<boolean>
  updateItem: (id: string, updates: { targetPrice?: number | null }) => Promise<boolean>
}

// ============================================================================
// Upgrade Copy Constants
// ============================================================================

/** Centralized upgrade copy for A/B testing (ADR-006 compliant) */
export const UPGRADE_COPY = {
  MARKET_PULSE_EXPAND: 'Price timing and historical context',
  PRICE_HISTORY: 'Price history availability varies by product',
  PRICE_CONTEXT: 'Detailed price context is provided when available',
  WATCHLIST_LIMIT: 'Watchlist limits are not enforced in v1.',
  COLLECTIONS: 'Collections are not available in v1.',
} as const

