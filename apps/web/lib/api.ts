const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

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
      baseRelevance: number
      performanceMatch: number
      bestValueScore: number
      safetyBonus: number
    }
    badges: PerformanceBadge[]
    explanation?: string
    bestValue?: {
      score: number
      grade: 'A' | 'B' | 'C' | 'D' | 'F'
      summary: string
    }
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
    brand?: string
    currentPrice: number | null
    retailer: Retailer | null
    inStock: boolean
  }
}

export interface CreateAlertParams {
  userId: string
  productId: string
  targetPrice?: number
  alertType?: 'PRICE_DROP' | 'BACK_IN_STOCK' | 'NEW_PRODUCT'
}

export interface UpdateAlertParams {
  targetPrice?: number
  isActive?: boolean
}

export async function createAlert(params: CreateAlertParams): Promise<Alert> {
  const response = await fetch(`${API_BASE_URL}/api/alerts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(params)
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to create alert')
  }
  return response.json()
}

export async function getUserAlerts(userId: string, activeOnly: boolean = false): Promise<Alert[]> {
  const params = new URLSearchParams()
  if (activeOnly) params.append('activeOnly', 'true')

  const response = await fetch(`${API_BASE_URL}/api/alerts/${userId}?${params}`)
  if (!response.ok) {
    throw new Error('Failed to fetch alerts')
  }
  const data = await response.json()
  return Array.isArray(data) ? data : (data.alerts || [])
}

export async function updateAlert(alertId: string, params: UpdateAlertParams): Promise<Alert> {
  const response = await fetch(`${API_BASE_URL}/api/alerts/${alertId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(params)
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to update alert')
  }
  return response.json()
}

export async function deleteAlert(alertId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/alerts/${alertId}`, {
    method: 'DELETE'
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
  userId?: string
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
  const { userId, filters, ...searchParams } = params
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  
  if (userId) {
    headers['X-User-Id'] = userId
  }
  
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
    throw new Error('AI search failed')
  }
  
  return response.json()
}

/**
 * Parse a natural language query into structured filters
 */
export async function parseQueryToFilters(query: string, userId?: string): Promise<ParsedFiltersResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  
  if (userId) {
    headers['X-User-Id'] = userId
  }
  
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
export async function getPremiumFilters(userId?: string): Promise<PremiumFiltersResponse> {
  const headers: Record<string, string> = {}
  
  if (userId) {
    headers['X-User-Id'] = userId
  }
  
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
