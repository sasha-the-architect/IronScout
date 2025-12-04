import { prisma, Prisma } from '@ironscout/db'
import { parseSearchIntent, SearchIntent } from './intent-parser'
import { QUALITY_INDICATORS, CASE_MATERIAL_BY_PURPOSE } from './ammo-knowledge'
import { generateEmbedding, buildProductText } from './embedding-service'

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
    aiEnhanced: boolean
    vectorSearchUsed: boolean
    processingTimeMs: number
  }
}

/**
 * AI-powered semantic search
 */
export async function aiSearch(
  query: string,
  options: {
    page?: number
    limit?: number
    sortBy?: 'relevance' | 'price_asc' | 'price_desc' | 'date_desc'
    useVectorSearch?: boolean // Enable pgvector semantic search
  } = {}
): Promise<AISearchResult> {
  const startTime = Date.now()
  const { page = 1, limit = 20, sortBy = 'relevance', useVectorSearch = true } = options
  
  // 1. Parse the natural language query into structured intent
  const intent = await parseSearchIntent(query)
  
  // 2. Build Prisma where clause from intent
  const where = buildWhereClause(intent)
  
  // 3. Build price/stock conditions
  const priceConditions = buildPriceConditions(intent)
  if (Object.keys(priceConditions).length > 0) {
    where.prices = { some: priceConditions }
  }
  
  // 4. Get total count
  const total = await prisma.product.count({ where })
  
  // 5. Fetch products - use vector search if enabled and sorting by relevance
  const skip = (page - 1) * limit
  let products: any[]
  let vectorSearchUsed = false
  
  if (useVectorSearch && sortBy === 'relevance') {
    try {
      // Try vector-enhanced search
      products = await vectorEnhancedSearch(query, intent, { skip, limit: limit * 2 })
      vectorSearchUsed = true
    } catch (error) {
      console.warn('Vector search failed, falling back to standard search:', error)
      products = await standardSearch(where, skip, limit * 2)
    }
  } else {
    products = await standardSearch(where, skip, limit * 2)
  }
  
  // 6. AI-enhanced re-ranking based on intent (if not already vector-ranked)
  if (sortBy === 'relevance' && intent.confidence > 0.5 && !vectorSearchUsed) {
    products = reRankProducts(products, intent)
  }
  
  // 7. Apply sorting
  if (sortBy === 'price_asc' || sortBy === 'price_desc') {
    products = products.sort((a: any, b: any) => {
      const aPrice = a.prices[0]?.price || Infinity
      const bPrice = b.prices[0]?.price || Infinity
      const comparison = parseFloat(aPrice.toString()) - parseFloat(bPrice.toString())
      return sortBy === 'price_asc' ? comparison : -comparison
    })
  }
  
  // 8. Trim to requested limit
  products = products.slice(0, limit)
  
  // 9. Format products
  const formattedProducts = products.map(formatProduct)
  
  // 10. Build facets
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
      aiEnhanced: intent.confidence > 0.5,
      vectorSearchUsed,
      processingTimeMs
    }
  }
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
  
  if (intent.calibers?.length) {
    conditions.push(`caliber ILIKE ANY(${params.length + 1})`)
    params.push(intent.calibers.map(c => `%${c}%`))
  }
  
  if (intent.purpose) {
    conditions.push(`purpose ILIKE ${params.length + 1}`)
    params.push(`%${intent.purpose}%`)
  }
  
  if (intent.caseMaterials?.length) {
    conditions.push(`"caseMaterial" ILIKE ANY(${params.length + 1})`)
    params.push(intent.caseMaterials.map(c => `%${c}%`))
  }
  
  if (intent.brands?.length) {
    conditions.push(`brand ILIKE ANY(${params.length + 1})`)
    params.push(intent.brands.map(b => `%${b}%`))
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
 * Build Prisma where clause from search intent
 */
function buildWhereClause(intent: SearchIntent): any {
  const where: any = {}
  const orConditions: any[] = []
  
  // Caliber filter (with variations)
  if (intent.calibers && intent.calibers.length > 0) {
    where.caliber = { in: intent.calibers, mode: 'insensitive' }
  }
  
  // Purpose filter
  if (intent.purpose) {
    where.purpose = { equals: intent.purpose, mode: 'insensitive' }
  }
  
  // Grain weight filter
  if (intent.grainWeights && intent.grainWeights.length > 0) {
    where.grainWeight = { in: intent.grainWeights }
  }
  
  // Case material filter
  if (intent.caseMaterials && intent.caseMaterials.length > 0) {
    where.caseMaterial = { in: intent.caseMaterials, mode: 'insensitive' }
  }
  
  // Brand filter
  if (intent.brands && intent.brands.length > 0) {
    where.brand = { in: intent.brands, mode: 'insensitive' }
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
function buildPriceConditions(intent: SearchIntent): any {
  const conditions: any = {}
  
  if (intent.minPrice !== undefined) {
    conditions.price = { gte: intent.minPrice }
  }
  
  if (intent.maxPrice !== undefined) {
    conditions.price = conditions.price 
      ? { ...conditions.price, lte: intent.maxPrice }
      : { lte: intent.maxPrice }
  }
  
  if (intent.inStockOnly) {
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
