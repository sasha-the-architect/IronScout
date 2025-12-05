import { prisma, Prisma } from '@ironscout/db'
import { parseSearchIntent, SearchIntent } from './intent-parser'
import { QUALITY_INDICATORS, CASE_MATERIAL_BY_PURPOSE } from './ammo-knowledge'
import { generateEmbedding, buildProductText } from './embedding-service'

/**
 * Explicit filters that can override AI intent
 */
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

/**
 * Search result with AI-enhanced ranking
 */
export interface AISearchResult {
  products: any[]
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
    explicitFilters: ExplicitFilters
    aiEnhanced: boolean
    vectorSearchUsed: boolean
    processingTimeMs: number
  }
}

/**
 * AI-powered semantic search with optional explicit filter overrides
 * 
 * The search process:
 * 1. Parse natural language query to extract intent (caliber, purpose, grain, etc.)
 * 2. Merge explicit filters on top of AI intent (explicit filters take priority)
 * 3. Execute hybrid search (vector + structured)
 * 4. Re-rank results based on combined intent
 */
export async function aiSearch(
  query: string,
  options: {
    page?: number
    limit?: number
    sortBy?: 'relevance' | 'price_asc' | 'price_desc' | 'date_desc' | 'date_asc'
    useVectorSearch?: boolean
    explicitFilters?: ExplicitFilters // Explicit filters override AI intent
  } = {}
): Promise<AISearchResult> {
  const startTime = Date.now()
  const { 
    page = 1, 
    limit = 20, 
    sortBy = 'relevance', 
    useVectorSearch = true,
    explicitFilters = {}
  } = options
  
  // 1. Parse the natural language query into structured intent
  const intent = await parseSearchIntent(query)
  
  // 2. Merge explicit filters with AI intent (explicit takes priority)
  const mergedIntent = mergeFiltersWithIntent(intent, explicitFilters)
  
  // 3. Build Prisma where clause from merged intent
  const where = buildWhereClause(mergedIntent, explicitFilters)
  
  // 4. Build price/stock conditions
  const priceConditions = buildPriceConditions(mergedIntent, explicitFilters)
  if (Object.keys(priceConditions).length > 0) {
    where.prices = { some: priceConditions }
  }
  
  // 5. Get total count
  const total = await prisma.product.count({ where })
  
  // 6. Fetch products - use vector search if enabled and sorting by relevance
  const skip = (page - 1) * limit
  let products: any[]
  let vectorSearchUsed = false
  
  if (useVectorSearch && sortBy === 'relevance') {
    try {
      // Try vector-enhanced search
      products = await vectorEnhancedSearch(query, mergedIntent, explicitFilters, { skip, limit: limit * 2 })
      vectorSearchUsed = true
    } catch (error) {
      console.warn('Vector search failed, falling back to standard search:', error)
      products = await standardSearch(where, skip, limit * 2)
    }
  } else {
    products = await standardSearch(where, skip, limit * 2)
  }
  
  // 7. AI-enhanced re-ranking based on intent (if not already vector-ranked)
  if (sortBy === 'relevance' && mergedIntent.confidence > 0.5 && !vectorSearchUsed) {
    products = reRankProducts(products, mergedIntent)
  }
  
  // 8. Apply sorting
  if (sortBy === 'price_asc' || sortBy === 'price_desc') {
    products = products.sort((a: any, b: any) => {
      const aPrice = a.prices[0]?.price || Infinity
      const bPrice = b.prices[0]?.price || Infinity
      const comparison = parseFloat(aPrice.toString()) - parseFloat(bPrice.toString())
      return sortBy === 'price_asc' ? comparison : -comparison
    })
  }
  
  // 9. Trim to requested limit
  products = products.slice(0, limit)
  
  // 10. Format products
  const formattedProducts = products.map(formatProduct)
  
  // 11. Build facets
  const facets = await buildFacets(where)
  
  const processingTimeMs = Date.now() - startTime
  
  return {
    products: formattedProducts,
    intent,
    facets,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    },
    searchMetadata: {
      parsedFilters: {
        calibers: intent.calibers,
        purpose: intent.purpose,
        grainWeights: intent.grainWeights,
        caseMaterials: intent.caseMaterials,
        qualityLevel: intent.qualityLevel,
      },
      explicitFilters,
      aiEnhanced: intent.confidence > 0.5,
      vectorSearchUsed,
      processingTimeMs
    }
  }
}

/**
 * Merge explicit filters with AI-parsed intent
 * Explicit filters take priority over AI interpretation
 */
function mergeFiltersWithIntent(intent: SearchIntent, filters: ExplicitFilters): SearchIntent {
  const merged = { ...intent }
  
  // Explicit caliber overrides AI-detected calibers
  if (filters.caliber) {
    merged.calibers = [filters.caliber]
  }
  
  // Explicit purpose overrides AI-detected purpose
  if (filters.purpose) {
    merged.purpose = filters.purpose
  }
  
  // Explicit case material overrides AI-detected
  if (filters.caseMaterial) {
    merged.caseMaterials = [filters.caseMaterial]
  }
  
  // Explicit grain range overrides AI-detected
  if (filters.minGrain !== undefined || filters.maxGrain !== undefined) {
    // Build grain weights array from range
    if (filters.minGrain !== undefined && filters.maxGrain !== undefined) {
      // We'll handle this in the where clause instead
      merged.grainWeights = undefined
    }
  }
  
  // Explicit price range
  if (filters.minPrice !== undefined) {
    merged.minPrice = filters.minPrice
  }
  if (filters.maxPrice !== undefined) {
    merged.maxPrice = filters.maxPrice
  }
  
  // Explicit in-stock filter
  if (filters.inStock !== undefined) {
    merged.inStockOnly = filters.inStock
  }
  
  // Explicit brand
  if (filters.brand) {
    merged.brands = [filters.brand]
  }
  
  return merged
}

/**
 * Standard Prisma-based search
 */
async function standardSearch(where: any, skip: number, take: number): Promise<any[]> {
  return prisma.product.findMany({
    where,
    skip,
    take,
    include: {
      prices: {
        include: {
          retailer: true
        },
        orderBy: [
          { retailer: { tier: 'desc' } },
          { price: 'asc' }
        ]
      }
    },
    orderBy: { createdAt: 'desc' }
  })
}

/**
 * Vector-enhanced semantic search using pgvector
 */
async function vectorEnhancedSearch(
  query: string,
  intent: SearchIntent,
  explicitFilters: ExplicitFilters,
  options: { skip: number; limit: number }
): Promise<any[]> {
  const { skip, limit } = options
  
  // Build the search text - combine original query with intent understanding
  const searchText = [
    query,
    intent.purpose ? `for ${intent.purpose.toLowerCase()}` : '',
    intent.calibers?.join(' ') || '',
    intent.qualityLevel || '',
  ].filter(Boolean).join(' ')
  
  // Generate query embedding
  const queryEmbedding = await generateEmbedding(searchText)
  const embeddingStr = `[${queryEmbedding.join(',')}]`
  
  // Build filter conditions for SQL
  const conditions: string[] = ['embedding IS NOT NULL']
  const params: any[] = []
  
  // Use explicit caliber if provided, otherwise use AI-detected
  const calibers = explicitFilters.caliber ? [explicitFilters.caliber] : intent.calibers
  if (calibers?.length) {
    conditions.push(`caliber ILIKE ANY($${params.length + 1})`)
    params.push(calibers.map(c => `%${c}%`))
  }
  
  // Use explicit purpose if provided, otherwise use AI-detected
  const purpose = explicitFilters.purpose || intent.purpose
  if (purpose) {
    conditions.push(`purpose ILIKE $${params.length + 1}`)
    params.push(`%${purpose}%`)
  }
  
  // Use explicit case material if provided
  const caseMaterials = explicitFilters.caseMaterial ? [explicitFilters.caseMaterial] : intent.caseMaterials
  if (caseMaterials?.length) {
    conditions.push(`"caseMaterial" ILIKE ANY($${params.length + 1})`)
    params.push(caseMaterials.map(c => `%${c}%`))
  }
  
  // Use explicit brand if provided
  const brands = explicitFilters.brand ? [explicitFilters.brand] : intent.brands
  if (brands?.length) {
    conditions.push(`brand ILIKE ANY($${params.length + 1})`)
    params.push(brands.map(b => `%${b}%`))
  }
  
  // Grain weight range filter
  if (explicitFilters.minGrain !== undefined) {
    conditions.push(`"grainWeight" >= $${params.length + 1}`)
    params.push(explicitFilters.minGrain)
  }
  if (explicitFilters.maxGrain !== undefined) {
    conditions.push(`"grainWeight" <= $${params.length + 1}`)
    params.push(explicitFilters.maxGrain)
  }
  
  const whereClause = conditions.join(' AND ')
  
  // Hybrid search: vector similarity + filter matching
  // Score = 0.7 * vector_similarity + 0.3 * filter_bonus
  const productIds = await prisma.$queryRawUnsafe<Array<{ id: string; similarity: number }>>(`
    SELECT 
      id,
      1 - (embedding <=> '${embeddingStr}'::vector) as similarity
    FROM products
    WHERE ${whereClause}
    ORDER BY embedding <=> '${embeddingStr}'::vector
    LIMIT ${limit + skip}
    OFFSET ${skip}
  `, ...params)
  
  if (productIds.length === 0) {
    return []
  }
  
  // Fetch full product details
  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds.map(p => p.id) }
    },
    include: {
      prices: {
        include: {
          retailer: true
        },
        orderBy: [
          { retailer: { tier: 'desc' } },
          { price: 'asc' }
        ]
      }
    }
  })
  
  // Create similarity map and sort by similarity
  const similarityMap = new Map(productIds.map(p => [p.id, p.similarity]))
  
  return products
    .map(p => ({
      ...p,
      _relevanceScore: Math.round((similarityMap.get(p.id) || 0) * 100),
      _vectorSimilarity: similarityMap.get(p.id) || 0
    }))
    .sort((a, b) => b._vectorSimilarity - a._vectorSimilarity)
}

/**
 * Build Prisma where clause from search intent and explicit filters
 */
function buildWhereClause(intent: SearchIntent, explicitFilters: ExplicitFilters): any {
  const where: any = {}
  const orConditions: any[] = []
  
  // Caliber filter (explicit takes priority)
  const calibers = explicitFilters.caliber ? [explicitFilters.caliber] : intent.calibers
  if (calibers && calibers.length > 0) {
    where.caliber = { in: calibers, mode: 'insensitive' }
  }
  
  // Purpose filter (explicit takes priority)
  const purpose = explicitFilters.purpose || intent.purpose
  if (purpose) {
    where.purpose = { equals: purpose, mode: 'insensitive' }
  }
  
  // Grain weight filter - explicit range or AI-detected specific weights
  if (explicitFilters.minGrain !== undefined || explicitFilters.maxGrain !== undefined) {
    where.grainWeight = {}
    if (explicitFilters.minGrain !== undefined) {
      where.grainWeight.gte = explicitFilters.minGrain
    }
    if (explicitFilters.maxGrain !== undefined) {
      where.grainWeight.lte = explicitFilters.maxGrain
    }
  } else if (intent.grainWeights && intent.grainWeights.length > 0) {
    where.grainWeight = { in: intent.grainWeights }
  }
  
  // Case material filter (explicit takes priority)
  const caseMaterials = explicitFilters.caseMaterial ? [explicitFilters.caseMaterial] : intent.caseMaterials
  if (caseMaterials && caseMaterials.length > 0) {
    where.caseMaterial = { in: caseMaterials, mode: 'insensitive' }
  }
  
  // Brand filter (explicit takes priority)
  const brands = explicitFilters.brand ? [explicitFilters.brand] : intent.brands
  if (brands && brands.length > 0) {
    where.brand = { in: brands, mode: 'insensitive' }
  }
  
  // If no structured filters matched, fall back to text search
  if (Object.keys(where).length === 0 && intent.originalQuery) {
    const keywords = intent.keywords || intent.originalQuery.split(/\s+/).filter(w => w.length > 2)
    
    if (keywords.length > 0) {
      // Build OR conditions for each keyword
      keywords.forEach(keyword => {
        orConditions.push(
          { name: { contains: keyword, mode: 'insensitive' } },
          { description: { contains: keyword, mode: 'insensitive' } },
          { brand: { contains: keyword, mode: 'insensitive' } }
        )
      })
      
      where.OR = orConditions
    }
  }
  
  return where
}

/**
 * Build price/stock conditions
 */
function buildPriceConditions(intent: SearchIntent, explicitFilters: ExplicitFilters): any {
  const conditions: any = {}
  
  // Explicit price range takes priority
  const minPrice = explicitFilters.minPrice ?? intent.minPrice
  const maxPrice = explicitFilters.maxPrice ?? intent.maxPrice
  
  if (minPrice !== undefined) {
    conditions.price = { gte: minPrice }
  }
  
  if (maxPrice !== undefined) {
    conditions.price = conditions.price 
      ? { ...conditions.price, lte: maxPrice }
      : { lte: maxPrice }
  }
  
  // Explicit in-stock takes priority
  const inStock = explicitFilters.inStock ?? intent.inStockOnly
  if (inStock) {
    conditions.inStock = true
  }
  
  return conditions
}

/**
 * Re-rank products based on AI intent analysis
 */
function reRankProducts(products: any[], intent: SearchIntent): any[] {
  return products.map(product => {
    let score = 0
    
    // Score by grain weight match
    if (intent.grainWeights && product.grainWeight) {
      if (intent.grainWeights.includes(product.grainWeight)) {
        score += 30
      } else {
        // Partial credit for close grain weights
        const closestMatch = intent.grainWeights.reduce((prev, curr) =>
          Math.abs(curr - product.grainWeight) < Math.abs(prev - product.grainWeight) ? curr : prev
        )
        const diff = Math.abs(closestMatch - product.grainWeight)
        if (diff <= 5) score += 20
        else if (diff <= 10) score += 10
      }
    }
    
    // Score by quality level
    if (intent.qualityLevel) {
      const productName = (product.name || '').toLowerCase()
      
      if (intent.qualityLevel === 'match-grade') {
        if (QUALITY_INDICATORS.matchGrade.some(q => productName.includes(q))) {
          score += 25
        }
      } else if (intent.qualityLevel === 'budget') {
        if (QUALITY_INDICATORS.budget.some(q => productName.includes(q))) {
          score += 20
        }
        // Also score lower prices
        const lowestPrice = product.prices[0]?.price
        if (lowestPrice && parseFloat(lowestPrice.toString()) < 0.50) {
          score += 15 // Under $0.50/round is budget-friendly
        }
      } else if (intent.qualityLevel === 'premium') {
        if (QUALITY_INDICATORS.premium.some(q => productName.includes(q))) {
          score += 20
        }
      }
    }
    
    // Score by case material preference
    if (intent.caseMaterials && product.caseMaterial) {
      if (intent.caseMaterials.includes(product.caseMaterial)) {
        score += 15
      }
    } else if (intent.purpose && product.caseMaterial) {
      // Apply purpose-based case material preference
      const preferredMaterials = CASE_MATERIAL_BY_PURPOSE[intent.purpose]
      if (preferredMaterials?.includes(product.caseMaterial)) {
        score += 10
      }
    }
    
    // Score by brand match
    if (intent.brands && product.brand) {
      if (intent.brands.some(b => b.toLowerCase() === product.brand.toLowerCase())) {
        score += 20
      }
    }
    
    // Score by in-stock availability
    const hasInStock = product.prices.some((p: any) => p.inStock)
    if (hasInStock) {
      score += 10
    }
    
    // Score by retailer tier (premium retailers first)
    const hasPremiumRetailer = product.prices.some((p: any) => p.retailer.tier === 'PREMIUM')
    if (hasPremiumRetailer) {
      score += 5
    }
    
    return { ...product, _relevanceScore: score }
  }).sort((a, b) => b._relevanceScore - a._relevanceScore)
}

/**
 * Format product for API response
 */
function formatProduct(product: any): any {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    category: product.category,
    brand: product.brand,
    imageUrl: product.imageUrl,
    upc: product.upc,
    caliber: product.caliber,
    grainWeight: product.grainWeight,
    caseMaterial: product.caseMaterial,
    purpose: product.purpose,
    roundCount: product.roundCount,
    relevanceScore: product._relevanceScore,
    prices: product.prices.map((price: any) => ({
      id: price.id,
      price: parseFloat(price.price.toString()),
      currency: price.currency,
      url: price.url,
      inStock: price.inStock,
      retailer: {
        id: price.retailer.id,
        name: price.retailer.name,
        tier: price.retailer.tier,
        logoUrl: price.retailer.logoUrl
      }
    }))
  }
}

/**
 * Build facets for filtering UI
 */
async function buildFacets(where: any): Promise<Record<string, Record<string, number>>> {
  const allProducts = await prisma.product.findMany({
    where,
    select: {
      caliber: true,
      grainWeight: true,
      caseMaterial: true,
      purpose: true,
      brand: true,
      category: true
    }
  })
  
  const countValues = (field: string) => {
    const counts = new Map<string, number>()
    allProducts.forEach((p: any) => {
      const value = p[field]
      if (value !== null && value !== undefined) {
        const key = value.toString()
        counts.set(key, (counts.get(key) || 0) + 1)
      }
    })
    return Object.fromEntries(
      Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
    )
  }
  
  return {
    calibers: countValues('caliber'),
    grainWeights: countValues('grainWeight'),
    caseMaterials: countValues('caseMaterial'),
    purposes: countValues('purpose'),
    brands: countValues('brand'),
    categories: countValues('category')
  }
}

/**
 * Get search suggestions based on partial query
 */
export async function getSearchSuggestions(partialQuery: string): Promise<string[]> {
  const suggestions: string[] = []
  const lowerQuery = partialQuery.toLowerCase()
  
  // Suggest based on common platforms
  const platforms = ['AR-15', 'AR-10', 'AK-47', 'Glock', '1911', 'Shotgun']
  platforms.forEach(p => {
    if (p.toLowerCase().includes(lowerQuery)) {
      suggestions.push(`${p} ammo`)
      suggestions.push(`${p} target practice`)
      suggestions.push(`${p} defense ammo`)
    }
  })
  
  // Suggest based on common calibers
  const calibers = ['9mm', '.223', '5.56', '.308', '.45 ACP', '12 gauge']
  calibers.forEach(c => {
    if (c.toLowerCase().includes(lowerQuery)) {
      suggestions.push(`${c} ammo`)
      suggestions.push(`${c} target ammo`)
      suggestions.push(`${c} defense ammo`)
      suggestions.push(`${c} bulk`)
    }
  })
  
  // Suggest based on purposes
  if ('target'.includes(lowerQuery) || 'practice'.includes(lowerQuery)) {
    suggestions.push('target practice ammo')
    suggestions.push('range ammo')
    suggestions.push('bulk target ammo')
  }
  
  if ('defense'.includes(lowerQuery) || 'self'.includes(lowerQuery)) {
    suggestions.push('self defense ammo')
    suggestions.push('home defense ammo')
    suggestions.push('hollow point')
  }
  
  // Remove duplicates and limit
  return [...new Set(suggestions)].slice(0, 8)
}
