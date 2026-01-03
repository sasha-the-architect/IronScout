import { logger } from './logger'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

/**
 * Build headers with authentication token
 * All authenticated API calls should use this to pass the JWT
 */
function buildAuthHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

/**
 * Price context band classification
 * Everyone gets the verdict (contextBand)
 * Premium gets the reasoning (relativePricePct, positionInRange, meta)
 */
export type ContextBand = 'LOW' | 'TYPICAL' | 'HIGH' | 'INSUFFICIENT_DATA'

/**
 * Price context - available to ALL users (verdict)
 * Premium users get additional depth fields
 */
export interface PriceContext {
  /** Descriptive classification - available to ALL users */
  contextBand: ContextBand

  // Premium-only fields (depth/reasoning)
  /** Percentage relative to trailing median (negative = below median) */
  relativePricePct?: number
  /** Position within observed range (0 = min, 1 = max) */
  positionInRange?: number
  /** Data coverage metadata */
  meta?: {
    windowDays: number
    sampleCount: number
    asOf: string
  }
}

export interface Product {
  id: string
  name: string
  description?: string
  category: string
  brand?: string
  imageUrl?: string
  prices: Price[]
  // Ammo-specific fields
  upc?: string
  caliber?: string
  grainWeight?: number
  caseMaterial?: string
  purpose?: string
  roundCount?: number
  relevanceScore?: number

  // Price context - verdict for all, depth for premium
  priceContext?: PriceContext

  // Premium fields (only populated for Premium users)
  premium?: PremiumProductData
}

/**
 * Premium-only product data
 * Contains ballistic fields, performance badges, and AI insights
 */
export interface PremiumProductData {
  // Structured ballistic fields
  bulletType?: BulletType
  pressureRating?: PressureRating
  muzzleVelocityFps?: number
  isSubsonic?: boolean
  
  // Performance characteristics
  shortBarrelOptimized?: boolean
  suppressorSafe?: boolean
  lowFlash?: boolean
  lowRecoil?: boolean
  controlledExpansion?: boolean
  matchGrade?: boolean
  factoryNew?: boolean
  
  // Data quality
  dataSource?: DataSource
  dataConfidence?: number
  
  // Premium ranking data
  premiumRanking?: {
    finalScore: number
    breakdown: {
      baseRelevance: number      // From basic search (0-40)
      performanceMatch: number   // From Premium fields (0-30)
      priceContextBonus: number  // From price positioning (0-20), descriptive only
      safetyBonus: number        // Safety constraint bonus (0-10)
    }
    badges: PerformanceBadge[]
    explanation?: string
  }
}

// Enum types matching backend
export type BulletType = 
  | 'JHP' | 'HP' | 'BJHP' | 'XTP' | 'HST' | 'GDHP' | 'VMAX'
  | 'FMJ' | 'TMJ' | 'CMJ' | 'MC' | 'BALL'
  | 'SP' | 'JSP' | 'PSP' | 'RN' | 'FPRN'
  | 'FRANGIBLE' | 'AP' | 'TRACER' | 'BLANK' | 'WADCUTTER' | 'SWC' | 'LSWC'
  | 'BUCKSHOT' | 'BIRDSHOT' | 'SLUG'
  | 'OTHER'

export type PressureRating = 'STANDARD' | 'PLUS_P' | 'PLUS_P_PLUS' | 'NATO' | 'UNKNOWN'

export type DataSource = 'MANUFACTURER' | 'RETAILER_FEED' | 'PARSED' | 'MANUAL' | 'AI_INFERRED' | 'UNKNOWN'

export type PerformanceBadge = 
  | 'short-barrel-optimized'
  | 'suppressor-safe'
  | 'low-flash'
  | 'low-recoil'
  | 'match-grade'
  | 'subsonic'
  | '+P'
  | '+P+'
  | 'nato-spec'
  | 'controlled-expansion'
  | 'high-expansion'
  | 'bonded'
  | 'barrier-blind'
  | 'frangible'
  | 'lead-free'

export interface Price {
  id: string
  price: number
  currency: string
  url: string
  inStock: boolean
  retailer: Retailer
}

export interface Retailer {
  id: string
  name: string
  tier: 'STANDARD' | 'PREMIUM'
  logoUrl?: string
}

export interface Advertisement {
  id: string
  title: string
  description: string
  imageUrl?: string
  targetUrl: string
  adType: 'DISPLAY' | 'SPONSORED_PRODUCT' | 'BANNER'
  priority: number
}

export interface SearchParams {
  q: string
  category?: string
  brand?: string
  minPrice?: string
  maxPrice?: string
  inStock?: string
  sortBy?: 'price_asc' | 'price_desc' | 'date_desc' | 'date_asc' | 'relevance'
  page?: string
  limit?: string
}

export interface SearchResponse {
  products: Product[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface AdsResponse {
  ads: Advertisement[]
  placement: string
  category?: string
}

export async function searchProducts(params: SearchParams): Promise<SearchResponse> {
  const searchParams = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value) searchParams.append(key, value)
  })

  const response = await fetch(`${API_BASE_URL}/api/products/search?${searchParams}`)
  if (!response.ok) {
    throw new Error('Failed to search products')
  }
  return response.json()
}

export async function getAds(placement: string = 'middle', category?: string): Promise<AdsResponse> {
  const searchParams = new URLSearchParams({ position: placement })
  if (category) searchParams.append('category', category)

  const response = await fetch(`${API_BASE_URL}/api/ads/placement?${searchParams}`)
  if (!response.ok) {
    throw new Error('Failed to fetch ads')
  }
  return response.json()
}

export async function getProduct(id: string): Promise<Product> {
  const response = await fetch(`${API_BASE_URL}/api/products/${id}`)
  if (!response.ok) {
    throw new Error('Failed to fetch product')
  }
  return response.json()
}

export interface Alert {
  id: string
  userId: string
  productId: string
  targetPrice: number | null
  alertType: 'PRICE_DROP' | 'BACK_IN_STOCK' | 'NEW_PRODUCT'
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  product: {
    id: string
    name: string
    imageUrl?: string
    category: string
    caliber?: string
    brand?: string
    currentPrice: number | null
    retailer: Retailer | null
    inStock: boolean
  }
}

export interface CreateAlertParams {
  productId: string
  targetPrice?: number
  alertType?: 'PRICE_DROP' | 'BACK_IN_STOCK' | 'NEW_PRODUCT'
  token: string // JWT token for authentication
}

export interface UpdateAlertParams {
  targetPrice?: number
  isActive?: boolean
}

export async function createAlert(params: CreateAlertParams): Promise<Alert> {
  const { token, ...alertData } = params
  const response = await fetch(`${API_BASE_URL}/api/alerts`, {
    method: 'POST',
    headers: buildAuthHeaders(token),
    body: JSON.stringify(alertData)
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to create alert')
  }
  return response.json()
}

export async function getUserAlerts(token: string, activeOnly: boolean = false): Promise<Alert[]> {
  const params = new URLSearchParams()
  if (activeOnly) params.append('activeOnly', 'true')

  const response = await fetch(`${API_BASE_URL}/api/alerts?${params}`, {
    headers: buildAuthHeaders(token),
  })
  if (!response.ok) {
    throw new Error('Failed to fetch alerts')
  }
  const data = await response.json()
  return Array.isArray(data) ? data : (data.alerts || [])
}

export async function updateAlert(alertId: string, params: UpdateAlertParams, token: string): Promise<Alert> {
  const response = await fetch(`${API_BASE_URL}/api/alerts/${alertId}`, {
    method: 'PUT',
    headers: buildAuthHeaders(token),
    body: JSON.stringify(params)
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to update alert')
  }
  return response.json()
}

export async function deleteAlert(alertId: string, token: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/alerts/${alertId}`, {
    method: 'DELETE',
    headers: buildAuthHeaders(token),
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to delete alert')
  }
}

// Stripe Checkout
export interface CreateCheckoutParams {
  priceId: string
  userId: string
  successUrl: string
  cancelUrl: string
}

export interface CheckoutSession {
  url: string
  sessionId: string
}

export async function createCheckoutSession(params: CreateCheckoutParams): Promise<CheckoutSession> {
  const response = await fetch(`${API_BASE_URL}/api/payments/create-checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(params)
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to create checkout session')
  }
  return response.json()
}

// Price History
export interface PriceHistoryPoint {
  date: string
  price: number
  retailerId: string
  retailerName: string
  inStock: boolean
}

export interface PriceHistory {
  timeline: PriceHistoryPoint[]
  stats: {
    lowestPrice: number
    highestPrice: number
    averagePrice: number
    currentPrice: number
  }
  history?: Array<{
    retailer: string
    data: PriceHistoryPoint[]
  }>
}

export async function getProductPriceHistory(productId: string): Promise<PriceHistory> {
  const response = await fetch(`${API_BASE_URL}/api/products/${productId}/history`)
  if (!response.ok) {
    throw new Error('Failed to fetch price history')
  }
  return response.json()
}

// ============================================
// AI-Powered Semantic Search
// ============================================

export interface SearchIntent {
  calibers?: string[]
  purpose?: string
  grainWeights?: number[]
  caseMaterials?: string[]
  brands?: string[]
  minPrice?: number
  maxPrice?: number
  inStockOnly?: boolean
  qualityLevel?: 'budget' | 'standard' | 'premium' | 'match-grade'
  rangePreference?: 'short' | 'medium' | 'long'
  originalQuery: string
  keywords?: string[]
  confidence: number
  purposeDetected?: string
  explanation?: string
  
  // Premium intent (only populated for Premium users)
  premiumIntent?: PremiumSearchIntent
}

/**
 * Premium-only search intent fields
 */
export interface PremiumSearchIntent {
  environment?: 'indoor' | 'outdoor' | 'both'
  barrelLength?: 'short' | 'standard' | 'long'
  suppressorUse?: boolean
  safetyConstraints?: Array<'low-overpenetration' | 'low-flash' | 'low-recoil' | 'barrier-blind' | 'frangible'>
  priorityFocus?: 'performance' | 'value' | 'balanced'
  preferredBulletTypes?: string[]
  explanation: string
  reasoning?: {
    environmentReason?: string
    barrelReason?: string
    safetyReason?: string
    bulletTypeReason?: string
  }
}

export interface ExplicitFilters {
  // Basic filters (FREE + PREMIUM)
  caliber?: string
  purpose?: string
  caseMaterial?: string
  minPrice?: number
  maxPrice?: number
  minGrain?: number
  maxGrain?: number
  inStock?: boolean
  brand?: string
  
  // Premium filters
  bulletType?: BulletType
  pressureRating?: PressureRating
  isSubsonic?: boolean
  shortBarrelOptimized?: boolean
  suppressorSafe?: boolean
  lowFlash?: boolean
  lowRecoil?: boolean
  matchGrade?: boolean
  controlledExpansion?: boolean
  minVelocity?: number
  maxVelocity?: number
}

export interface AISearchParams {
  query: string
  page?: number
  limit?: number
  sortBy?: 'relevance' | 'price_asc' | 'price_desc' | 'date_desc' | 'date_asc' | 'best_value'
  token?: string // JWT token for authenticated requests
  filters?: ExplicitFilters
}

export interface AISearchResponse {
  products: Product[]
  intent: SearchIntent
  facets: Record<string, Record<string, number>>
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    actualTotal?: number
  }
  searchMetadata: {
    parsedFilters: Record<string, any>
    explicitFilters?: ExplicitFilters
    aiEnhanced: boolean
    vectorSearchUsed: boolean
    processingTimeMs: number
    userTier?: 'FREE' | 'PREMIUM'
    premiumFeaturesUsed?: string[]
  }
  _meta?: {
    tier: 'FREE' | 'PREMIUM'
    maxResults: number
    resultsLimited: boolean
    upgradeMessage?: string
    premiumFeatures?: {
      bestValueSort: string
      advancedFilters: string
      performanceBadges: string
    }
  }
}

export interface ParsedFiltersResponse {
  filters: Record<string, any>
  premiumFilters?: Record<string, any>
  intent: SearchIntent
  explanation: string
  tier: 'FREE' | 'PREMIUM'
}

/**
 * Premium filter definitions from API
 */
export interface PremiumFilterDefinition {
  label: string
  type: 'select' | 'boolean' | 'range'
  description?: string
  options?: Array<{ value: string; label: string; category?: string }>
  min?: number
  max?: number
  unit?: string
}

export interface PremiumFiltersResponse {
  available: boolean
  filters: Record<string, PremiumFilterDefinition>
  upgradeMessage?: string
}

/**
 * AI-powered semantic search
 */
export async function aiSearch(params: AISearchParams): Promise<AISearchResponse> {
  const { token, filters, ...searchParams } = params

  const headers = buildAuthHeaders(token)

  const body: any = { ...searchParams }
  if (filters && Object.keys(filters).length > 0) {
    body.filters = filters
  }

  const response = await fetch(`${API_BASE_URL}/api/search/semantic`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    logger.api.error('AI search request failed', {
      status: response.status,
      statusText: response.statusText,
      url: `${API_BASE_URL}/api/search/semantic`,
      body,
      errorText: errorText?.slice(0, 500),
    })
    throw new Error(`AI search failed (${response.status})`)
  }

  return response.json()
}

/**
 * Parse a natural language query into structured filters
 */
export async function parseQueryToFilters(query: string, token?: string): Promise<ParsedFiltersResponse> {
  const headers = buildAuthHeaders(token)

  const response = await fetch(`${API_BASE_URL}/api/search/nl-to-filters`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query })
  })

  if (!response.ok) {
    throw new Error('Query parsing failed')
  }

  return response.json()
}

/**
 * Get search suggestions/autocomplete
 */
export async function getSearchSuggestions(query: string): Promise<string[]> {
  const response = await fetch(`${API_BASE_URL}/api/search/suggestions?q=${encodeURIComponent(query)}`)
  
  if (!response.ok) {
    return []
  }
  
  const data = await response.json()
  return data.suggestions || []
}

/**
 * Get available Premium filters
 */
export async function getPremiumFilters(token?: string): Promise<PremiumFiltersResponse> {
  const headers = buildAuthHeaders(token)

  const response = await fetch(`${API_BASE_URL}/api/search/premium-filters`, {
    headers
  })

  if (!response.ok) {
    throw new Error('Failed to get premium filters')
  }

  return response.json()
}

// ============================================
// Helper Functions
// ============================================

/**
 * Human-readable bullet type labels
 */
export const BULLET_TYPE_LABELS: Record<BulletType, string> = {
  JHP: 'Jacketed Hollow Point',
  HP: 'Hollow Point',
  BJHP: 'Bonded JHP',
  XTP: 'XTP (Hornady)',
  HST: 'HST (Federal)',
  GDHP: 'Gold Dot HP',
  VMAX: 'V-Max',
  FMJ: 'Full Metal Jacket',
  TMJ: 'Total Metal Jacket',
  CMJ: 'Complete Metal Jacket',
  MC: 'Metal Case',
  BALL: 'Ball',
  SP: 'Soft Point',
  JSP: 'Jacketed Soft Point',
  PSP: 'Pointed Soft Point',
  RN: 'Round Nose',
  FPRN: 'Flat Point RN',
  FRANGIBLE: 'Frangible',
  AP: 'Armor Piercing',
  TRACER: 'Tracer',
  BLANK: 'Blank',
  WADCUTTER: 'Wadcutter',
  SWC: 'Semi-Wadcutter',
  LSWC: 'Lead SWC',
  BUCKSHOT: 'Buckshot',
  BIRDSHOT: 'Birdshot',
  SLUG: 'Slug',
  OTHER: 'Other',
}

/**
 * Pressure rating labels
 */
export const PRESSURE_RATING_LABELS: Record<PressureRating, string> = {
  STANDARD: 'Standard',
  PLUS_P: '+P',
  PLUS_P_PLUS: '+P+',
  NATO: 'NATO Spec',
  UNKNOWN: 'Unknown',
}

/**
 * Performance badge display configuration
 */
export const BADGE_CONFIG: Record<PerformanceBadge, { label: string; color: string; icon?: string }> = {
  'short-barrel-optimized': { label: 'Short Barrel', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300' },
  'suppressor-safe': { label: 'Suppressor Safe', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300' },
  'low-flash': { label: 'Low Flash', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300' },
  'low-recoil': { label: 'Low Recoil', color: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300' },
  'match-grade': { label: 'Match Grade', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' },
  'subsonic': { label: 'Subsonic', color: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300' },
  '+P': { label: '+P', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300' },
  '+P+': { label: '+P+', color: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300' },
  'nato-spec': { label: 'NATO', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300' },
  'controlled-expansion': { label: 'Controlled Expansion', color: 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300' },
  'high-expansion': { label: 'High Expansion', color: 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300' },
  'bonded': { label: 'Bonded', color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/50 dark:text-cyan-300' },
  'barrier-blind': { label: 'Barrier Blind', color: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300' },
  'frangible': { label: 'Frangible', color: 'bg-lime-100 text-lime-800 dark:bg-lime-900/50 dark:text-lime-300' },
  'lead-free': { label: 'Lead Free', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300' },
}

// ============================================
// Dashboard API - Trading Terminal
// ============================================

import type {
  MarketPulseResponse,
  DealsResponse,
  SavingsResponse,
  WatchlistResponse,
  PriceHistoryResponse,
} from '@/types/dashboard'

/**
 * Get Market Pulse data for user's calibers
 * Free: 2 calibers max, trend only
 * Premium: Unlimited calibers, Buy/Wait score
 */
export async function getMarketPulse(token: string): Promise<MarketPulseResponse> {
  const response = await fetch(`${API_BASE_URL}/api/dashboard/pulse`, {
    headers: buildAuthHeaders(token),
  })
  if (!response.ok) {
    throw new Error('Failed to fetch market pulse')
  }
  return response.json()
}

/**
 * Get personalized deals feed
 * Free: 5 deals max
 * Premium: 20 deals + explanations
 */
export async function getDealsForYou(token: string): Promise<DealsResponse> {
  const response = await fetch(`${API_BASE_URL}/api/dashboard/deals`, {
    headers: buildAuthHeaders(token),
  })
  if (!response.ok) {
    throw new Error('Failed to fetch deals')
  }
  return response.json()
}

/**
 * Get savings tracking data
 * Free: Potential savings only
 * Premium: Verified savings with attribution
 */
export async function getSavings(token: string): Promise<SavingsResponse> {
  const response = await fetch(`${API_BASE_URL}/api/dashboard/savings`, {
    headers: buildAuthHeaders(token),
  })
  if (!response.ok) {
    throw new Error('Failed to fetch savings')
  }
  return response.json()
}

/**
 * Get price history for a caliber (Premium only)
 */
export async function getCaliberPriceHistory(
  token: string,
  caliber: string,
  days: number = 30
): Promise<PriceHistoryResponse> {
  const params = new URLSearchParams({ days: days.toString() })
  const response = await fetch(
    `${API_BASE_URL}/api/dashboard/price-history/${encodeURIComponent(caliber)}?${params}`,
    {
      headers: buildAuthHeaders(token),
    }
  )
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to fetch price history')
  }
  return response.json()
}

// ============================================
// Watchlist API
// ============================================

/**
 * Get user's watchlist
 * Free: 5 items max, no collections
 * Premium: Unlimited items, collections
 */
export async function getWatchlist(token: string): Promise<WatchlistResponse> {
  const response = await fetch(`${API_BASE_URL}/api/watchlist`, {
    headers: buildAuthHeaders(token),
  })
  if (!response.ok) {
    throw new Error('Failed to fetch watchlist')
  }
  return response.json()
}

/**
 * Add item to watchlist
 */
export async function addToWatchlist(
  token: string,
  productId: string,
  targetPrice?: number,
  collectionId?: string
): Promise<{ item: any; _meta: any }> {
  const response = await fetch(`${API_BASE_URL}/api/watchlist`, {
    method: 'POST',
    headers: buildAuthHeaders(token),
    body: JSON.stringify({ productId, targetPrice, collectionId }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to add to watchlist')
  }
  return response.json()
}

/**
 * Update watchlist item
 */
export async function updateWatchlistItem(
  id: string,
  updates: { targetPrice?: number | null; collectionId?: string | null },
  token: string
): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/api/watchlist/${id}`, {
    method: 'PUT',
    headers: buildAuthHeaders(token),
    body: JSON.stringify(updates),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to update watchlist item')
  }
  return response.json()
}

/**
 * Remove item from watchlist
 */
export async function removeFromWatchlist(id: string, token: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/watchlist/${id}`, {
    method: 'DELETE',
    headers: buildAuthHeaders(token),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to remove from watchlist')
  }
}

/**
 * Get user's watchlist collections (Premium only)
 */
export async function getWatchlistCollections(token: string): Promise<{ collections: any[] }> {
  const response = await fetch(`${API_BASE_URL}/api/watchlist/collections`, {
    headers: buildAuthHeaders(token),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to fetch collections')
  }
  return response.json()
}

/**
 * Create watchlist collection (Premium only)
 */
export async function createWatchlistCollection(token: string, name: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/api/watchlist/collections`, {
    method: 'POST',
    headers: buildAuthHeaders(token),
    body: JSON.stringify({ name }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to create collection')
  }
  return response.json()
}

/**
 * Delete watchlist collection (Premium only)
 * @deprecated Use saved items API instead
 */
export async function deleteWatchlistCollection(id: string, token: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/watchlist/collections/${id}`, {
    method: 'DELETE',
    headers: buildAuthHeaders(token),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to delete collection')
  }
}

// ============================================
// Saved Items API (ADR-011 - replaces watchlist/alerts)
// ============================================

/**
 * Saved item with product info and notification preferences
 */
export interface SavedItem {
  id: string
  productId: string
  name: string
  brand: string
  caliber: string
  price: number | null
  inStock: boolean
  imageUrl: string | null
  savedAt: string

  // Notification preferences
  notificationsEnabled: boolean
  priceDropEnabled: boolean
  backInStockEnabled: boolean
  minDropPercent: number
  minDropAmount: number
  stockAlertCooldownHours: number
}

export interface SavedItemsResponse {
  items: SavedItem[]
  _meta: {
    tier: 'FREE' | 'PREMIUM'
    itemCount: number
    itemLimit: number
    canAddMore: boolean
  }
}

export interface SaveItemResponse extends SavedItem {
  _meta: {
    tier: 'FREE' | 'PREMIUM'
    itemCount: number
    itemLimit: number
    canAddMore: boolean
    wasExisting: boolean
  }
}

export interface UpdateSavedItemPrefs {
  notificationsEnabled?: boolean
  priceDropEnabled?: boolean
  backInStockEnabled?: boolean
  minDropPercent?: number
  minDropAmount?: number
  stockAlertCooldownHours?: number
}

/**
 * Get all saved items for the authenticated user
 */
export async function getSavedItems(token: string): Promise<SavedItemsResponse> {
  const response = await fetch(`${API_BASE_URL}/api/saved-items`, {
    headers: buildAuthHeaders(token),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    const message = error.details
      ? `${error.error}: ${error.details}`
      : error.error || `Failed to fetch saved items (${response.status})`
    throw new Error(message)
  }
  return response.json()
}

/**
 * Save a product (idempotent - returns existing if already saved)
 */
export async function saveItem(token: string, productId: string): Promise<SaveItemResponse> {
  const response = await fetch(`${API_BASE_URL}/api/saved-items/${productId}`, {
    method: 'POST',
    headers: buildAuthHeaders(token),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to save item')
  }

  return response.json()
}

/**
 * Unsave a product
 */
export async function unsaveItem(token: string, productId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/saved-items/${productId}`, {
    method: 'DELETE',
    headers: buildAuthHeaders(token),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to remove saved item')
  }
}

/**
 * Update notification preferences for a saved item
 */
export async function updateSavedItemPrefs(
  token: string,
  productId: string,
  prefs: UpdateSavedItemPrefs
): Promise<SavedItem> {
  const response = await fetch(`${API_BASE_URL}/api/saved-items/${productId}`, {
    method: 'PATCH',
    headers: buildAuthHeaders(token),
    body: JSON.stringify(prefs),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to update preferences')
  }

  return response.json()
}

/**
 * Check if a product is saved
 */
export async function isSaved(token: string, productId: string): Promise<boolean> {
  const response = await fetch(`${API_BASE_URL}/api/saved-items/${productId}`, {
    headers: buildAuthHeaders(token),
  })

  if (response.status === 404) {
    return false
  }

  if (!response.ok) {
    throw new Error('Failed to check saved status')
  }

  const data = await response.json()
  return data.isSaved === true
}

/**
 * Get a single saved item with full details
 */
export async function getSavedItem(token: string, productId: string): Promise<SavedItem | null> {
  const response = await fetch(`${API_BASE_URL}/api/saved-items/${productId}`, {
    headers: buildAuthHeaders(token),
  })

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new Error('Failed to fetch saved item')
  }

  return response.json()
}
