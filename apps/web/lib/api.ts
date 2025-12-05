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
}

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
  return response.json()
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
  const response = await fetch(`${API_BASE_URL}/api/products/${productId}/price-history`)
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
  explanation?: string
}

export interface ExplicitFilters {
  caliber?: string
  purpose?: string
  caseMaterial?: string
  minPrice?: number
  maxPrice?: number
  minGrain?: number
  maxGrain?: number
  inStock?: boolean
  brand?: string
}

export interface AISearchParams {
  query: string
  page?: number
  limit?: number
  sortBy?: 'relevance' | 'price_asc' | 'price_desc' | 'date_desc' | 'date_asc'
  userId?: string // For tier-based result limits
  filters?: ExplicitFilters // Explicit filters that override AI intent
}

export interface AISearchResponse {
  products: (Product & { relevanceScore?: number })[]
  intent: SearchIntent
  facets: Record<string, Record<string, number>>
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
  searchMetadata: {
    parsedFilters: Record<string, any>
    aiEnhanced: boolean
    vectorSearchUsed: boolean
    processingTimeMs: number
  }
}

export interface ParsedFiltersResponse {
  filters: Record<string, any>
  intent: SearchIntent
  explanation: string
}

/**
 * AI-powered semantic search
 * Accepts natural language queries like "best ammo for long range AR15"
 * Optionally accepts explicit filters that override AI-parsed intent
 */
export async function aiSearch(params: AISearchParams): Promise<AISearchResponse> {
  const { userId, filters, ...searchParams } = params
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  
  // Pass user ID for tier-based result limits
  if (userId) {
    headers['X-User-Id'] = userId
  }
  
  // Build request body with filters if provided
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
 * Useful for showing users what the AI understood
 */
export async function parseQueryToFilters(query: string): Promise<ParsedFiltersResponse> {
  const response = await fetch(`${API_BASE_URL}/api/search/nl-to-filters`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
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
