import { logger } from './logger'
import { env, isE2E } from './env'

const API_BASE_URL = env.NEXT_PUBLIC_API_URL

/**
 * Custom error class for authentication failures (401)
 * Hooks can check for this to trigger re-authentication
 */
export class AuthError extends Error {
  constructor(message: string = 'Session expired. Please sign in again.') {
    super(message)
    this.name = 'AuthError'
  }
}

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
 * Handle API response, throwing AuthError on 401
 */
async function handleAuthResponse(response: Response, errorMessage: string): Promise<void> {
  if (response.status === 401) {
    throw new AuthError()
  }
  if (!response.ok) {
    throw new Error(errorMessage)
  }
}

// Session refresh helpers - imported dynamically to avoid circular deps
let refreshSessionToken: (() => Promise<string | null>) | null = null
let showSessionExpiredToast: (() => void) | null = null

/**
 * Initialize session refresh helpers (called from client components)
 * This avoids importing client-only code at module level
 */
export function initSessionHelpers(
  refreshFn: () => Promise<string | null>,
  toastFn: () => void
) {
  refreshSessionToken = refreshFn
  showSessionExpiredToast = toastFn
}

/**
 * Make an authenticated API request with automatic token refresh on 401.
 * If the first request fails with 401, attempts to refresh the token and retry.
 * If refresh fails, shows a toast prompting user to sign in.
 *
 * @param url - Full URL to fetch
 * @param token - Current access token
 * @param options - Fetch options (method, body, etc.)
 * @returns Response object
 */
export async function fetchWithAuth(
  url: string,
  token: string,
  options: RequestInit = {}
): Promise<Response> {
  // First attempt
  const response = await fetch(url, {
    ...options,
    headers: {
      ...buildAuthHeaders(token),
      ...options.headers,
    },
  })

  // If not 401 or no refresh helper available, return as-is
  if (response.status !== 401 || !refreshSessionToken) {
    return response
  }

  // Try to refresh the token
  logger.api.info('API returned 401, attempting token refresh')
  const newToken = await refreshSessionToken()

  if (!newToken) {
    // Refresh failed - show toast and return original 401 response
    logger.api.warn('Token refresh failed, prompting user to sign in')
    if (showSessionExpiredToast) {
      showSessionExpiredToast()
    }
    return response
  }

  // Retry with new token
  logger.api.info('Token refreshed, retrying request')
  return fetch(url, {
    ...options,
    headers: {
      ...buildAuthHeaders(newToken),
      ...options.headers,
    },
  })
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

function getE2eSearchResponse(params: AISearchParams): AISearchResponse {
  const now = new Date().toISOString()
  return {
    products: [
      {
        id: 'e2e-product-1',
        name: 'E2E 9mm FMJ 115gr (50 rd)',
        category: 'HANDGUN',
        brand: 'E2E Ammo',
        caliber: '9mm',
        grainWeight: 115,
        roundCount: 50,
        prices: [
          {
            id: 'e2e-price-1',
            price: 14.99,
            currency: 'USD',
            url: 'https://e2e.example/9mm-fmj',
            inStock: true,
            retailer: {
              id: 'e2e-retailer-1',
              name: 'E2E Retailer',
              tier: 'STANDARD',
            },
          },
        ],
        priceContext: {
          contextBand: 'TYPICAL',
          meta: { windowDays: 30, sampleCount: 12, asOf: now },
        },
      },
    ],
    intent: {
      originalQuery: params.query,
      confidence: 0.9,
      explanation: 'E2E mock intent',
    },
    facets: {},
    pagination: {
      page: params.page || 1,
      limit: params.limit || 20,
      total: 1,
      totalPages: 1,
    },
    searchMetadata: {
      parsedFilters: {},
      aiEnhanced: false,
      vectorSearchUsed: false,
      processingTimeMs: 1,
    },
    _meta: {
      tier: 'FREE',
      maxResults: 1,
      resultsLimited: false,
    },
  }
}

/**
 * AI-powered semantic search
 */
export async function aiSearch(params: AISearchParams): Promise<AISearchResponse> {
  if (isE2E) {
    return getE2eSearchResponse(params)
  }

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
  await handleAuthResponse(response, 'Failed to fetch market pulse')
  return response.json()
}

// ============================================================================
// Dashboard v4 State API
// ============================================================================

/**
 * Dashboard state context for v4 state-driven rendering
 */
export interface DashboardStateContext {
  state: 'BRAND_NEW' | 'NEW' | 'NEEDS_ALERTS' | 'HEALTHY' | 'RETURNING' | 'POWER_USER'
  watchlistCount: number
  alertsConfigured: number
  alertsMissing: number
  priceDropsThisWeek: number
}

/**
 * Watchlist preview item for dashboard display
 */
export interface WatchlistPreviewItem {
  id: string
  productId: string
  name: string
  caliber: string | null
  brand: string | null
  price: number | null
  pricePerRound: number | null
  inStock: boolean
  imageUrl: string | null
  notificationsEnabled: boolean
  createdAt: string
}

export interface WatchlistPreviewResponse {
  items: WatchlistPreviewItem[]
  _meta: {
    itemsReturned: number
    limit: number
  }
}

/**
 * Get dashboard state for v4 state-driven rendering
 * State resolution is server-side per dashboard-product-spec.md
 */
export async function getDashboardState(token: string): Promise<DashboardStateContext> {
  const response = await fetch(`${API_BASE_URL}/api/dashboard/state`, {
    headers: buildAuthHeaders(token),
  })
  await handleAuthResponse(response, 'Failed to fetch dashboard state')
  return response.json()
}

/**
 * Get watchlist preview for dashboard display
 */
export async function getWatchlistPreview(
  token: string,
  limit: number = 3
): Promise<WatchlistPreviewResponse> {
  const params = new URLSearchParams({ limit: limit.toString() })
  const response = await fetch(`${API_BASE_URL}/api/dashboard/watchlist-preview?${params}`, {
    headers: buildAuthHeaders(token),
  })
  await handleAuthResponse(response, 'Failed to fetch watchlist preview')
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
  await handleAuthResponse(response, 'Failed to fetch savings')
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
  await handleAuthResponse(response, 'Failed to fetch watchlist')
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

const E2E_SAVED_ITEMS_LIMIT = 10
let e2eSavedItems: SavedItem[] = [
  {
    id: 'e2e-saved-1',
    productId: 'e2e-product-1',
    name: 'E2E 9mm FMJ 115gr (50 rd)',
    brand: 'E2E Ammo',
    caliber: '9mm',
    price: 14.99,
    inStock: true,
    imageUrl: null,
    savedAt: new Date().toISOString(),
    notificationsEnabled: true,
    priceDropEnabled: true,
    backInStockEnabled: true,
    minDropPercent: 5,
    minDropAmount: 5,
    stockAlertCooldownHours: 24,
  },
]

function buildE2eSavedItemsResponse(): SavedItemsResponse {
  return {
    items: e2eSavedItems,
    _meta: {
      tier: 'FREE',
      itemCount: e2eSavedItems.length,
      itemLimit: E2E_SAVED_ITEMS_LIMIT,
      canAddMore: e2eSavedItems.length < E2E_SAVED_ITEMS_LIMIT,
    },
  }
}

/**
 * Get all saved items for the authenticated user
 */
export async function getSavedItems(token: string): Promise<SavedItemsResponse> {
  if (isE2E) {
    return buildE2eSavedItemsResponse()
  }

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
  if (isE2E) {
    const existing = e2eSavedItems.find((item) => item.productId === productId)
    if (existing) {
      return {
        ...existing,
        _meta: {
          tier: 'FREE',
          itemCount: e2eSavedItems.length,
          itemLimit: E2E_SAVED_ITEMS_LIMIT,
          canAddMore: e2eSavedItems.length < E2E_SAVED_ITEMS_LIMIT,
          wasExisting: true,
        },
      }
    }

    const newItem: SavedItem = {
      id: `e2e-saved-${Date.now()}`,
      productId,
      name: 'E2E Saved Item',
      brand: 'E2E Ammo',
      caliber: '9mm',
      price: 14.99,
      inStock: true,
      imageUrl: null,
      savedAt: new Date().toISOString(),
      notificationsEnabled: true,
      priceDropEnabled: true,
      backInStockEnabled: true,
      minDropPercent: 5,
      minDropAmount: 5,
      stockAlertCooldownHours: 24,
    }

    e2eSavedItems = [newItem, ...e2eSavedItems]

    return {
      ...newItem,
      _meta: {
        tier: 'FREE',
        itemCount: e2eSavedItems.length,
        itemLimit: E2E_SAVED_ITEMS_LIMIT,
        canAddMore: e2eSavedItems.length < E2E_SAVED_ITEMS_LIMIT,
        wasExisting: false,
      },
    }
  }

  const response = await fetch(`${API_BASE_URL}/api/saved-items/${productId}`, {
    method: 'POST',
    headers: buildAuthHeaders(token),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    // Use message field if available (contains helpful limit info), else fall back to error
    throw new Error(error.message || error.error || 'Failed to save item')
  }

  return response.json()
}

/**
 * Unsave a product
 */
export async function unsaveItem(token: string, productId: string): Promise<void> {
  if (isE2E) {
    e2eSavedItems = e2eSavedItems.filter((item) => item.productId !== productId)
    return
  }

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
  if (isE2E) {
    const existing = e2eSavedItems.find((item) => item.productId === productId)
    if (!existing) {
      throw new Error('Saved item not found')
    }

    const updated = { ...existing, ...prefs }
    e2eSavedItems = e2eSavedItems.map((item) =>
      item.productId === productId ? updated : item
    )

    return updated
  }

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

// ============================================
// Gun Locker API
// ============================================

/**
 * Canonical calibers per spec - constrained enum
 */
/**
 * Canonical caliber values per gun_locker_v1_spec.md
 * Values must match the API canonical enum exactly
 */
export const CALIBERS = [
  { value: '9mm', label: '9mm' },
  { value: '.38 Special', label: '.38 Special' },
  { value: '.357 Magnum', label: '.357 Magnum' },
  { value: '.25 ACP', label: '.25 ACP' },
  { value: '.32 ACP', label: '.32 ACP' },
  { value: '10mm Auto', label: '10mm Auto' },
  { value: '.45 ACP', label: '.45 ACP' },
  { value: '.45 Colt', label: '.45 Colt' },
  { value: '.40 S&W', label: '.40 S&W' },
  { value: '.380 ACP', label: '.380 ACP' },
  { value: '.22 LR', label: '.22 LR' },
  { value: '.22 WMR', label: '.22 WMR (.22 Magnum)' },
  { value: '.17 HMR', label: '.17 HMR' },
  { value: '.223/5.56', label: '.223 Remington / 5.56 NATO' },
  { value: '.308/7.62x51', label: '.308 Winchester / 7.62x51 NATO' },
  { value: '.30-06', label: '.30-06' },
  { value: '.300 AAC Blackout', label: '.300 AAC Blackout' },
  { value: '6.5 Creedmoor', label: '6.5 Creedmoor' },
  { value: '7.62x39', label: '7.62x39' },
  { value: '.243 Winchester', label: '.243 Winchester' },
  { value: '.270 Winchester', label: '.270 Winchester' },
  { value: '.30-30 Winchester', label: '.30-30 Winchester' },
  { value: '12ga', label: '12 Gauge' },
  { value: '20ga', label: '20 Gauge' },
  { value: '16ga', label: '16 Gauge' },
  { value: '.410 Bore', label: '.410 Bore' },
  { value: 'Other', label: 'Other' },
] as const

export type CaliberValue = typeof CALIBERS[number]['value']

/**
 * Gun in the user's Gun Locker
 */
export interface Gun {
  id: string
  caliber: CaliberValue
  nickname: string | null
  imageUrl: string | null
  createdAt: string
}

export interface GunLockerResponse {
  guns: Gun[]
  _meta: {
    count: number
  }
}

export interface AddGunResponse {
  gun: Gun
  _meta: {
    count: number
  }
}

// E2E mock state
let e2eGuns: Gun[] = []

/**
 * Get all guns in the user's Gun Locker
 */
export async function getGunLocker(token: string): Promise<GunLockerResponse> {
  if (isE2E) {
    return {
      guns: e2eGuns,
      _meta: { count: e2eGuns.length },
    }
  }

  const response = await fetch(`${API_BASE_URL}/api/gun-locker`, {
    headers: buildAuthHeaders(token),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to fetch gun locker')
  }

  return response.json()
}

/**
 * Add a gun to the user's Gun Locker
 */
export async function addGun(
  token: string,
  caliber: CaliberValue,
  nickname?: string | null
): Promise<AddGunResponse> {
  if (isE2E) {
    const newGun: Gun = {
      id: `e2e-gun-${Date.now()}`,
      caliber,
      nickname: nickname || null,
      imageUrl: null,
      createdAt: new Date().toISOString(),
    }
    e2eGuns = [...e2eGuns, newGun]
    return {
      gun: newGun,
      _meta: { count: e2eGuns.length },
    }
  }

  const response = await fetch(`${API_BASE_URL}/api/gun-locker`, {
    method: 'POST',
    headers: buildAuthHeaders(token),
    body: JSON.stringify({ caliber, nickname }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to add gun')
  }

  return response.json()
}

/**
 * Remove a gun from the user's Gun Locker
 */
export async function removeGun(token: string, gunId: string): Promise<void> {
  if (isE2E) {
    e2eGuns = e2eGuns.filter((g) => g.id !== gunId)
    return
  }

  const response = await fetch(`${API_BASE_URL}/api/gun-locker/${gunId}`, {
    method: 'DELETE',
    headers: buildAuthHeaders(token),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to remove gun')
  }
}

/**
 * Update a gun in the user's Gun Locker
 */
export async function updateGun(
  token: string,
  gunId: string,
  updates: { nickname?: string | null }
): Promise<{ gun: Gun }> {
  if (isE2E) {
    const gun = e2eGuns.find((g) => g.id === gunId)
    if (!gun) throw new Error('Gun not found')
    if (updates.nickname !== undefined) gun.nickname = updates.nickname
    return { gun }
  }

  const response = await fetch(`${API_BASE_URL}/api/gun-locker/${gunId}`, {
    method: 'PATCH',
    headers: buildAuthHeaders(token),
    body: JSON.stringify(updates),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to update gun')
  }

  return response.json()
}

/**
 * Upload or overwrite a gun image
 */
export async function uploadGunImage(
  token: string,
  gunId: string,
  imageDataUrl: string
): Promise<{ gun: Gun; message: string }> {
  if (isE2E) {
    const gun = e2eGuns.find((g) => g.id === gunId)
    if (!gun) throw new Error('Gun not found')
    gun.imageUrl = imageDataUrl
    return { gun, message: 'Image uploaded' }
  }

  const response = await fetch(`${API_BASE_URL}/api/gun-locker/${gunId}/image`, {
    method: 'POST',
    headers: buildAuthHeaders(token),
    body: JSON.stringify({ imageDataUrl }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to upload image')
  }

  return response.json()
}

/**
 * Delete a gun image
 */
export async function deleteGunImage(
  token: string,
  gunId: string
): Promise<{ gun: Gun; message: string }> {
  if (isE2E) {
    const gun = e2eGuns.find((g) => g.id === gunId)
    if (!gun) throw new Error('Gun not found')
    gun.imageUrl = null
    return { gun, message: 'Image deleted' }
  }

  const response = await fetch(`${API_BASE_URL}/api/gun-locker/${gunId}/image`, {
    method: 'DELETE',
    headers: buildAuthHeaders(token),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to delete image')
  }

  return response.json()
}

// ============================================
// Firearm Ammo Preferences API
// Per firearm_preferred_ammo_mapping_spec_v3.md
// ============================================

/**
 * Use case for firearm ammo preference
 * Per spec: descriptive only, no hierarchy
 */
export type AmmoUseCase = 'TRAINING' | 'CARRY' | 'COMPETITION' | 'GENERAL'

/**
 * Display order for use cases per spec: CARRY, TRAINING, COMPETITION, GENERAL
 */
export const AMMO_USE_CASE_ORDER: AmmoUseCase[] = ['CARRY', 'TRAINING', 'COMPETITION', 'GENERAL']

/**
 * Human-readable labels for use cases
 */
export const AMMO_USE_CASE_LABELS: Record<AmmoUseCase, string> = {
  CARRY: 'Carry',
  TRAINING: 'Training',
  COMPETITION: 'Competition',
  GENERAL: 'General',
}

/**
 * Ammo SKU info resolved from product
 */
export interface AmmoSku {
  id: string
  name: string
  brand: string | null
  caliber: string | null
  grainWeight: number | null
  roundCount: number | null
  isActive: boolean
}

/**
 * Ammo preference for a firearm
 */
export interface AmmoPreference {
  id: string
  firearmId: string
  ammoSkuId: string
  useCase: AmmoUseCase
  createdAt: string
  updatedAt: string
  ammoSku: AmmoSku
}

/**
 * Grouped preferences by use case
 */
export interface AmmoPreferenceGroup {
  useCase: AmmoUseCase
  preferences: AmmoPreference[]
}

export interface FirearmAmmoPreferencesResponse {
  groups: AmmoPreferenceGroup[]
  _meta: {
    firearmId: string
    totalPreferences: number
  }
}

export interface UserAmmoPreferencesResponse {
  preferences: AmmoPreference[]
  _meta: {
    count: number
  }
}

/**
 * Get ammo preferences for a specific firearm, grouped by use case
 */
export async function getFirearmAmmoPreferences(
  token: string,
  firearmId: string
): Promise<FirearmAmmoPreferencesResponse> {
  if (isE2E) {
    return {
      groups: [],
      _meta: { firearmId, totalPreferences: 0 },
    }
  }

  const response = await fetch(`${API_BASE_URL}/api/gun-locker/${firearmId}/ammo-preferences`, {
    headers: buildAuthHeaders(token),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to fetch ammo preferences')
  }

  return response.json()
}

/**
 * Get all ammo preferences for the user (for My Loadout)
 */
export async function getUserAmmoPreferences(
  token: string
): Promise<UserAmmoPreferencesResponse> {
  if (isE2E) {
    return {
      preferences: [],
      _meta: { count: 0 },
    }
  }

  const response = await fetch(`${API_BASE_URL}/api/ammo-preferences`, {
    headers: buildAuthHeaders(token),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to fetch ammo preferences')
  }

  return response.json()
}

/**
 * Add an ammo preference for a firearm
 */
export async function addAmmoPreference(
  token: string,
  firearmId: string,
  ammoSkuId: string,
  useCase: AmmoUseCase
): Promise<{ preference: AmmoPreference }> {
  if (isE2E) {
    const preference: AmmoPreference = {
      id: `e2e-pref-${Date.now()}`,
      firearmId,
      ammoSkuId,
      useCase,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ammoSku: {
        id: ammoSkuId,
        name: 'E2E Ammo',
        brand: 'E2E',
        caliber: '9mm',
        grainWeight: 115,
        roundCount: 50,
        isActive: true,
      },
    }
    return { preference }
  }

  const response = await fetch(`${API_BASE_URL}/api/gun-locker/${firearmId}/ammo-preferences`, {
    method: 'POST',
    headers: buildAuthHeaders(token),
    body: JSON.stringify({ ammoSkuId, useCase }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to add ammo preference')
  }

  return response.json()
}

/**
 * Update ammo preference use case
 */
export async function updateAmmoPreferenceUseCase(
  token: string,
  firearmId: string,
  preferenceId: string,
  newUseCase: AmmoUseCase
): Promise<{ preference: AmmoPreference }> {
  if (isE2E) {
    throw new Error('Not implemented in E2E mode')
  }

  const response = await fetch(
    `${API_BASE_URL}/api/gun-locker/${firearmId}/ammo-preferences/${preferenceId}`,
    {
      method: 'PATCH',
      headers: buildAuthHeaders(token),
      body: JSON.stringify({ useCase: newUseCase }),
    }
  )

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to update ammo preference')
  }

  return response.json()
}

/**
 * Remove an ammo preference
 */
export async function removeAmmoPreference(
  token: string,
  firearmId: string,
  preferenceId: string
): Promise<void> {
  if (isE2E) {
    return
  }

  const response = await fetch(
    `${API_BASE_URL}/api/gun-locker/${firearmId}/ammo-preferences/${preferenceId}`,
    {
      method: 'DELETE',
      headers: buildAuthHeaders(token),
    }
  )

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to remove ammo preference')
  }
}

/**
 * Get firearm caliber for scoped search
 */
export async function getFirearmCaliber(
  token: string,
  firearmId: string
): Promise<{ caliber: string | null }> {
  if (isE2E) {
    const gun = e2eGuns.find((g) => g.id === firearmId)
    return { caliber: gun?.caliber || null }
  }

  const response = await fetch(`${API_BASE_URL}/api/gun-locker/${firearmId}/caliber`, {
    headers: buildAuthHeaders(token),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to get firearm caliber')
  }

  return response.json()
}

// ============================================
// Price Check API
// ============================================

export type PriceClassification = 'LOWER' | 'TYPICAL' | 'HIGHER' | 'INSUFFICIENT_DATA'

export interface PriceCheckResult {
  classification: PriceClassification
  enteredPricePerRound: number
  caliber: CaliberValue
  context: {
    minPrice: number | null
    maxPrice: number | null
    medianPrice: number | null
    pricePointCount: number
    daysWithData: number
  }
  freshnessIndicator: string
  message: string
  _meta: {
    hasGunLocker: boolean
    authenticated: boolean
  }
}

export interface PriceCheckParams {
  caliber: CaliberValue
  pricePerRound: number
  brand?: string
  grain?: number
}

/**
 * Check a price against recent market data
 * Per mobile_price_check_v1_spec.md
 */
export async function checkPrice(params: PriceCheckParams, token?: string): Promise<PriceCheckResult> {
  if (isE2E) {
    return {
      classification: 'TYPICAL',
      enteredPricePerRound: params.pricePerRound,
      caliber: params.caliber,
      context: {
        minPrice: 0.25,
        maxPrice: 0.45,
        medianPrice: 0.32,
        pricePointCount: 50,
        daysWithData: 28,
      },
      freshnessIndicator: 'Based on prices from the last 28 days',
      message: 'Typical range',
      _meta: {
        hasGunLocker: false,
        authenticated: false,
      },
    }
  }

  const response = await fetch(`${API_BASE_URL}/api/price-check`, {
    method: 'POST',
    headers: token ? buildAuthHeaders(token) : { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to check price')
  }

  return response.json()
}

// ============================================
// UPC Lookup API
// ============================================

/**
 * Product data returned from UPC lookup
 */
export interface UpcLookupProduct {
  id: string
  name: string
  caliber: string | null
  brand: string | null
  grainWeight: number | null
  roundCount: number | null
  imageUrl: string | null
}

/**
 * UPC lookup result
 */
export interface UpcLookupResult {
  found: boolean
  product: UpcLookupProduct | null
}

// ============================================
// UPC Lookup API
// ============================================

/**
 * Look up a product by UPC code (for barcode scanning)
 */
export async function lookupProductByUpc(upc: string): Promise<UpcLookupResult> {
  if (isE2E) {
    // E2E mock: return a found product for any valid-looking UPC
    if (upc && upc.length >= 8) {
      return {
        found: true,
        product: {
          id: 'e2e-product-1',
          name: 'E2E 9mm FMJ 115gr (50 rd)',
          caliber: '9mm',
          brand: 'E2E Ammo',
          grainWeight: 115,
          roundCount: 50,
          imageUrl: null,
        },
      }
    }
    return { found: false, product: null }
  }

  const response = await fetch(`${API_BASE_URL}/api/products/lookup/upc/${encodeURIComponent(upc)}`)

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to lookup UPC')
  }

  return response.json()
}

// ============================================
// Account Deletion API
// ============================================

/**
 * Deletion blocker info
 */
export interface DeletionBlocker {
  code: string
  message: string
  resolution?: string
}

/**
 * Account deletion eligibility status
 */
export interface DeletionEligibility {
  eligible: boolean
  blockers: DeletionBlocker[]
  pendingDeletion: {
    requestedAt: string
    scheduledFor: string
  } | null
}

/**
 * Check if user can delete their account
 */
export async function checkDeletionEligibility(token: string): Promise<DeletionEligibility> {
  if (isE2E) {
    return {
      eligible: true,
      blockers: [],
      pendingDeletion: null,
    }
  }

  const response = await fetch(`${API_BASE_URL}/api/users/me/deletion-eligibility`, {
    headers: buildAuthHeaders(token),
  })

  await handleAuthResponse(response, 'Failed to check deletion eligibility')
  return response.json()
}

/**
 * Request account deletion (14-day cooling-off period)
 */
export async function requestAccountDeletion(
  token: string,
  confirmation: string
): Promise<{ message: string; scheduledFor: string }> {
  if (isE2E) {
    return {
      message: 'Account deletion scheduled',
      scheduledFor: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    }
  }

  const response = await fetch(`${API_BASE_URL}/api/users/me/delete`, {
    method: 'POST',
    headers: buildAuthHeaders(token),
    body: JSON.stringify({ confirmation }),
  })

  await handleAuthResponse(response, 'Failed to request account deletion')
  return response.json()
}

/**
 * Cancel pending account deletion
 */
export async function cancelAccountDeletion(token: string): Promise<{ message: string }> {
  if (isE2E) {
    return { message: 'Deletion cancelled' }
  }

  const response = await fetch(`${API_BASE_URL}/api/users/me/cancel-deletion`, {
    method: 'POST',
    headers: buildAuthHeaders(token),
  })

  await handleAuthResponse(response, 'Failed to cancel account deletion')
  return response.json()
}
