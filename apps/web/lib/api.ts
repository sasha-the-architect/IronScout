const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export interface Product {
  id: string
  name: string
  description?: string
  category: string
  brand?: string
  imageUrl?: string
  prices: Price[]
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
  minPrice?: string
  maxPrice?: string
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
