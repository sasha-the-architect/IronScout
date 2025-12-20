/**
 * Dashboard TypeScript Types
 *
 * Types for the trading terminal-style dashboard components.
 * Aligned with API responses from /api/dashboard/* endpoints.
 */

// ============================================================================
// Verdict & Status Types
// ============================================================================

/** Market verdict indicating buy/wait recommendation */
export type Verdict = 'BUY' | 'WAIT' | 'STABLE'

/** Deal label indicating deal type */
export type DealLabel = 'HOT_DEAL' | 'NEW_LOW' | 'BULK_VALUE'

/** Price trend direction */
export type Trend = 'UP' | 'DOWN' | 'STABLE'

/** User subscription tier */
export type UserTier = 'FREE' | 'PREMIUM'

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
  /** Buy/Wait score 0-100 (Premium only) */
  buyWaitScore?: number
  /** Calculated verdict based on score or trend */
  verdict: Verdict
}

/** Market Pulse API response */
export interface MarketPulseResponse {
  pulse: MarketPulseItem[]
  _meta: {
    tier: UserTier
    calibersShown: number
    calibersLimit: number
    hasBuyWaitScore: boolean
  }
}

// ============================================================================
// Deals For You Types
// ============================================================================

/** Single deal item from personalized feed */
export interface DealItem {
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
  /** Composite value score 0-100 (Premium only) */
  bestValueScore?: number
  /** Why this deal was recommended (Premium only) */
  explanation?: string
}

/** Deals For You API response */
export interface DealsResponse {
  deals: DealItem[]
  _meta: {
    tier: UserTier
    dealsShown: number
    dealsLimit: number
    personalized: boolean
    calibersUsed: string[]
  }
}

// ============================================================================
// Savings Tracker Types
// ============================================================================

/** Single savings breakdown item */
export interface SavingsBreakdownItem {
  productId: string
  productName: string
  targetPrice: number
  currentPrice: number
  savings: number
}

/** Verified savings data (Premium only) */
export interface VerifiedSavings {
  thisMonth: number
  allTime: number
  purchaseCount: number
  message?: string
}

/** Savings data from API */
export interface SavingsData {
  potentialSavings: number
  breakdown: SavingsBreakdownItem[]
  alertsWithSavings: number
  totalAlerts: number
  verifiedSavings?: VerifiedSavings
}

/** Savings API response */
export interface SavingsResponse {
  savings: SavingsData
  _meta: {
    tier: UserTier
    hasVerifiedSavings: boolean
  }
}

// ============================================================================
// Watchlist Types
// ============================================================================

/** Single watchlist item */
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

/** Props for VerdictChip component */
export interface VerdictChipProps {
  verdict: Verdict
  /** Show tooltip on hover explaining verdict */
  showTooltip?: boolean
  /** Size variant */
  size?: 'sm' | 'md' | 'lg'
}

/** Props for DealTag component */
export interface DealTagProps {
  label: DealLabel
  /** Size variant */
  size?: 'sm' | 'md'
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

/** Props for DealCard component */
export interface DealCardProps {
  deal: DealItem
  /** Show premium features like explanation */
  isPremium?: boolean
  /** Callback when Buy Now clicked */
  onBuyClick?: () => void
  /** Callback when Add to Watchlist clicked */
  onWatchlistClick?: () => void
}

/** Props for PulseRow component */
export interface PulseRowProps {
  pulse: MarketPulseItem
  /** Show full chart on click (Premium) */
  isPremium?: boolean
  /** Callback when row clicked */
  onClick?: () => void
}

/** Props for SavingsCard component */
export interface SavingsCardProps {
  savings: SavingsData
  /** Show verified vs potential */
  isPremium?: boolean
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
  addItem: (productId: string, targetPrice?: number) => Promise<void>
  removeItem: (id: string) => Promise<void>
  updateItem: (id: string, updates: { targetPrice?: number | null }) => Promise<void>
}

// ============================================================================
// Upgrade Copy Constants
// ============================================================================

/** Centralized upgrade copy for A/B testing */
export const UPGRADE_COPY = {
  MARKET_PULSE_EXPAND: 'Unlock price timing and savings context →',
  PRICE_HISTORY: 'See full price history with Premium',
  DEAL_EXPLANATION: 'Premium users see why this deal is recommended',
  SAVINGS_VERIFIED: 'Premium paid for itself this month.',
  WATCHLIST_LIMIT: 'Upgrade to Premium for unlimited tracking.',
  COLLECTIONS: 'Organize into collections with Premium',
} as const
