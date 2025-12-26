import { prisma, Prisma } from '@ironscout/db'
import { parseSearchIntent, SearchIntent, ParseOptions } from './intent-parser'
import { QUALITY_INDICATORS, CASE_MATERIAL_BY_PURPOSE } from './ammo-knowledge'
import { generateEmbedding, buildProductText } from './embedding-service'
import {
  applyPremiumRanking,
  applyFreeRanking,
  ProductForRanking,
  PremiumRankedProduct
} from './premium-ranking'
import { batchCalculatePriceSignalIndex, PriceSignalIndex } from './price-signal-index'
import { BulletType, PressureRating, BULLET_TYPE_CATEGORIES } from '../../types/product-metadata'
import { visibleDealerPriceWhere } from '../../config/tiers'
import { loggers } from '../../config/logger'

const log = loggers.ai

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
  
  // =============================================
  // Premium Filters (NEW - Phase 2)
  // =============================================
  bulletType?: BulletType
  pressureRating?: PressureRating
  isSubsonic?: boolean
  
  // Performance characteristic filters
  shortBarrelOptimized?: boolean
  suppressorSafe?: boolean
  lowFlash?: boolean
  lowRecoil?: boolean
  matchGrade?: boolean
  controlledExpansion?: boolean
  
  // Velocity range (Premium)
  minVelocity?: number
  maxVelocity?: number
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
    userTier: 'FREE' | 'PREMIUM'
    premiumFeaturesUsed?: string[]
  }
}

/**
 * Search options
 */
export interface AISearchOptions {
  page?: number
  limit?: number
  sortBy?: 'relevance' | 'price_asc' | 'price_desc' | 'date_desc' | 'date_asc' | 'price_context'
  useVectorSearch?: boolean
  explicitFilters?: ExplicitFilters
  userTier?: 'FREE' | 'PREMIUM'
}

/**
 * AI-powered semantic search with optional explicit filter overrides
 * 
 * The search process:
 * 1. Parse natural language query to extract intent (caliber, purpose, grain, etc.)
 * 2. Merge explicit filters on top of AI intent (explicit filters take priority)
 * 3. Execute hybrid search (vector + structured)
 * 4. Apply tier-appropriate ranking:
 *    - FREE: Basic relevance ranking
 *    - PREMIUM: Performance-aware ranking with Best Value scores
 */
export async function aiSearch(
  query: string,
  options: AISearchOptions = {}
): Promise<AISearchResult> {
  const startTime = Date.now()
  const { 
    page = 1, 
    limit = 20, 
    sortBy = 'relevance', 
    useVectorSearch = true,
    explicitFilters = {},
    userTier = 'FREE'
  } = options
  
  const isPremium = userTier === 'PREMIUM'
  const premiumFeaturesUsed: string[] = []
  
  log.debug('Starting search', {
    query,
    page,
    limit,
    sortBy,
    userTier,
    explicitFilters,
    hasFilters: Object.keys(explicitFilters).length > 0
  })
  
  // Track Premium filter usage
  if (explicitFilters.bulletType) premiumFeaturesUsed.push('bulletType filter')
  if (explicitFilters.pressureRating) premiumFeaturesUsed.push('pressureRating filter')
  if (explicitFilters.isSubsonic !== undefined) premiumFeaturesUsed.push('subsonic filter')
  if (explicitFilters.shortBarrelOptimized) premiumFeaturesUsed.push('shortBarrel filter')
  if (explicitFilters.suppressorSafe) premiumFeaturesUsed.push('suppressorSafe filter')
  if (sortBy === 'price_context') premiumFeaturesUsed.push('price_context sort')
  
  // 1. Parse the natural language query into structured intent
  const parseOptions: ParseOptions = { userTier }
  const intent = await parseSearchIntent(query, parseOptions)
  
  // 2. Merge explicit filters with AI intent (explicit takes priority)
  const mergedIntent = mergeFiltersWithIntent(intent, explicitFilters)
  
  // 3. Build Prisma where clause from merged intent (including Premium filters)
  const where = buildWhereClause(mergedIntent, explicitFilters, isPremium)
  
  // 4. Build price/stock conditions
  const priceConditions = buildPriceConditions(mergedIntent, explicitFilters)
  if (Object.keys(priceConditions).length > 0) {
    where.prices = { some: priceConditions }
  }
  
  // 5. Fetch products - use vector search if enabled and sorting by relevance
  const skip = (page - 1) * limit
  let products: any[]
  let vectorSearchUsed = false
  let total: number
  const hasExplicitFilters = Object.keys(explicitFilters).length > 0

  if (useVectorSearch && (sortBy === 'relevance' || sortBy === 'price_context') && !hasExplicitFilters) {
    try {
      // Try vector-enhanced search (only when no explicit filters)
      products = await vectorEnhancedSearch(query, mergedIntent, explicitFilters, { skip, limit: limit * 2 }, isPremium)
      vectorSearchUsed = true
      // For vector search, count products with embeddings matching the intent filters
      // Use a simplified count that matches vector search conditions
      const vectorCountWhere = {
        ...where,
        embedding: { not: null }
      }
      total = await prisma.product.count({ where: vectorCountWhere })
      log.debug('Vector search returned', { productsCount: products.length, total })
    } catch (error) {
      log.warn('Vector search failed, falling back to standard search', { error })
      products = await standardSearch(where, skip, limit * 2, isPremium)
      total = await prisma.product.count({ where })
    }
  } else {
    // Use standard Prisma search with explicit filters
    log.debug('Using standard search', { hasExplicitFilters })
    products = await standardSearch(where, skip, limit * 2, isPremium)
    total = await prisma.product.count({ where })
    log.debug('Standard search returned', { productsCount: products.length, total })
  }

  // Ensure total is at least the number of products returned on this page
  // This handles edge cases where count query doesn't match actual results
  if (page === 1 && products.length > total) {
    log.warn('Count mismatch - adjusting', { productsLength: products.length, total })
    total = products.length
  }
  
  // 7. Apply tier-appropriate ranking
  let rankedProducts: any[]
  
  if (isPremium && (sortBy === 'relevance' || sortBy === 'price_context')) {
    // PREMIUM: Apply performance-aware ranking with price context
    premiumFeaturesUsed.push('premium_ranking')

    const premiumRanked = await applyPremiumRanking(products as ProductForRanking[], {
      premiumIntent: intent.premiumIntent,
      userPurpose: mergedIntent.purpose,
      includePriceSignal: sortBy === 'price_context' || sortBy === 'relevance',
      limit: limit * 2
    })

    // Sort by price context (lower prices first) if requested
    if (sortBy === 'price_context') {
      premiumRanked.sort((a, b) => {
        // Sort by position in range (lower = better price context)
        const aPos = a.premiumRanking.priceSignal?.positionInRange ?? 0.5
        const bPos = b.premiumRanking.priceSignal?.positionInRange ?? 0.5
        return aPos - bPos
      })
    }

    rankedProducts = premiumRanked
  } else if (!isPremium && sortBy === 'relevance' && mergedIntent.confidence > 0.5 && !vectorSearchUsed) {
    // FREE: Basic re-ranking
    rankedProducts = reRankProducts(products, mergedIntent)
  } else {
    rankedProducts = products
  }
  
  // 8. Apply price sorting if requested
  if (sortBy === 'price_asc' || sortBy === 'price_desc') {
    rankedProducts = rankedProducts.sort((a: any, b: any) => {
      const aPrice = a.prices[0]?.price || Infinity
      const bPrice = b.prices[0]?.price || Infinity
      const comparison = parseFloat(aPrice.toString()) - parseFloat(bPrice.toString())
      return sortBy === 'price_asc' ? comparison : -comparison
    })
  }
  
  // 9. Trim to requested limit
  rankedProducts = rankedProducts.slice(0, limit)

  // 10. Calculate price context for ALL users (verdict for everyone, depth for premium)
  // For premium users with premiumRanking, use existing priceSignal
  // For all others, calculate it now
  const productsNeedingPriceSignal = rankedProducts.filter(
    (p: any) => !p.premiumRanking?.priceSignal
  )

  let priceSignalMap = new Map<string, PriceSignalIndex>()
  if (productsNeedingPriceSignal.length > 0) {
    priceSignalMap = await batchCalculatePriceSignalIndex(productsNeedingPriceSignal)
  }

  // Merge price signals into products
  rankedProducts = rankedProducts.map((p: any) => {
    // Use existing priceSignal from premiumRanking if available
    const existingSignal = p.premiumRanking?.priceSignal
    const calculatedSignal = priceSignalMap.get(p.id)
    return {
      ...p,
      _priceSignal: existingSignal || calculatedSignal
    }
  })

  // 11. Format products (with Premium data if applicable)
  const formattedProducts = rankedProducts.map(p => formatProduct(p, isPremium))

  // 12. Build facets (with Premium facets if applicable)
  const facets = await buildFacets(where, isPremium)

  const processingTimeMs = Date.now() - startTime

  // 12. Strip premium explanation fields for FREE users
  const sanitizedIntent = stripPremiumExplanations(intent, isPremium)

  return {
    products: formattedProducts,
    intent: sanitizedIntent,
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
        // Premium parsed fields
        ...(isPremium && intent.premiumIntent ? {
          environment: intent.premiumIntent.environment,
          barrelLength: intent.premiumIntent.barrelLength,
          suppressorUse: intent.premiumIntent.suppressorUse,
          safetyConstraints: intent.premiumIntent.safetyConstraints,
          preferredBulletTypes: intent.premiumIntent.preferredBulletTypes
        } : {})
      },
      explicitFilters,
      aiEnhanced: intent.confidence > 0.5,
      vectorSearchUsed,
      processingTimeMs,
      userTier,
      ...(premiumFeaturesUsed.length > 0 ? { premiumFeaturesUsed } : {})
    }
  }
}

/**
 * Merge explicit filters with AI-parsed intent
 * Explicit filters take priority over AI interpretation
 */
function mergeFiltersWithIntent(intent: SearchIntent, filters: ExplicitFilters): SearchIntent {
  const merged = { ...intent }
  
  // Track if caliber was explicitly changed from AI interpretation
  const caliberExplicitlyChanged = filters.caliber &&
    !intent.calibers?.some(c => c.toLowerCase().includes(filters.caliber!.toLowerCase()))

  // Explicit caliber overrides AI-detected calibers
  if (filters.caliber) {
    merged.calibers = [filters.caliber]

    // If caliber changed, discard AI grain weights (they're caliber-specific)
    if (caliberExplicitlyChanged) {
      log.debug('Caliber explicitly changed - discarding AI grain weights')
      merged.grainWeights = undefined
    }
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
    merged.grainWeights = undefined
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
  
  // Premium filters - update premiumIntent if present
  if (merged.premiumIntent) {
    if (filters.bulletType) {
      merged.premiumIntent.preferredBulletTypes = [filters.bulletType]
    }
    if (filters.suppressorSafe) {
      merged.premiumIntent.suppressorUse = true
    }
  }
  
  log.debug('Merged intent', {
    calibers: merged.calibers,
    purpose: merged.purpose,
    grainWeights: merged.grainWeights,
    caliberExplicitlyChanged
  })
  
  return merged
}

/**
 * Build Prisma where clause from search intent and explicit filters
 */
function buildWhereClause(intent: SearchIntent, explicitFilters: ExplicitFilters, isPremium: boolean): any {
  const where: any = {}
  const orConditions: any[] = []
  
  // Caliber filter (explicit takes priority)
  const calibers = explicitFilters.caliber ? [explicitFilters.caliber] : intent.calibers
  if (calibers && calibers.length > 0) {
    where.OR = calibers.map(cal => ({
      caliber: { contains: cal, mode: 'insensitive' }
    }))
  }
  
  // Purpose filter (explicit takes priority)
  const purpose = explicitFilters.purpose || intent.purpose
  if (purpose) {
    if (where.OR) {
      where.AND = [
        { OR: where.OR },
        { purpose: { contains: purpose, mode: 'insensitive' } }
      ]
      delete where.OR
    } else {
      where.purpose = { contains: purpose, mode: 'insensitive' }
    }
  }
  
  // Grain weight filter
  if (explicitFilters.minGrain !== undefined || explicitFilters.maxGrain !== undefined) {
    const grainCondition: any = {}
    if (explicitFilters.minGrain !== undefined) {
      grainCondition.gte = explicitFilters.minGrain
    }
    if (explicitFilters.maxGrain !== undefined) {
      grainCondition.lte = explicitFilters.maxGrain
    }
    addCondition(where, { grainWeight: grainCondition })
  } else if (intent.grainWeights && intent.grainWeights.length > 0) {
    addCondition(where, { grainWeight: { in: intent.grainWeights } })
  }
  
  // Case material filter
  const caseMaterials = explicitFilters.caseMaterial ? [explicitFilters.caseMaterial] : intent.caseMaterials
  if (caseMaterials && caseMaterials.length > 0) {
    addCondition(where, {
      OR: caseMaterials.map(mat => ({
        caseMaterial: { contains: mat, mode: 'insensitive' }
      }))
    })
  }
  
  // Brand filter
  const brands = explicitFilters.brand ? [explicitFilters.brand] : intent.brands
  if (brands && brands.length > 0) {
    addCondition(where, {
      OR: brands.map(b => ({
        brand: { contains: b, mode: 'insensitive' }
      }))
    })
  }
  
  // =============================================
  // Premium Filters (NEW - Phase 2)
  // =============================================
  
  if (isPremium) {
    // Bullet type filter
    if (explicitFilters.bulletType) {
      addCondition(where, { bulletType: explicitFilters.bulletType })
    }
    
    // Pressure rating filter
    if (explicitFilters.pressureRating) {
      addCondition(where, { pressureRating: explicitFilters.pressureRating })
    }
    
    // Subsonic filter
    if (explicitFilters.isSubsonic !== undefined) {
      addCondition(where, { isSubsonic: explicitFilters.isSubsonic })
    }
    
    // Performance characteristic filters
    if (explicitFilters.shortBarrelOptimized) {
      addCondition(where, { shortBarrelOptimized: true })
    }
    if (explicitFilters.suppressorSafe) {
      addCondition(where, { suppressorSafe: true })
    }
    if (explicitFilters.lowFlash) {
      addCondition(where, { lowFlash: true })
    }
    if (explicitFilters.lowRecoil) {
      addCondition(where, { lowRecoil: true })
    }
    if (explicitFilters.matchGrade) {
      addCondition(where, { matchGrade: true })
    }
    if (explicitFilters.controlledExpansion) {
      addCondition(where, { controlledExpansion: true })
    }
    
    // Velocity range filter
    if (explicitFilters.minVelocity !== undefined || explicitFilters.maxVelocity !== undefined) {
      const velocityCondition: any = {}
      if (explicitFilters.minVelocity !== undefined) {
        velocityCondition.gte = explicitFilters.minVelocity
      }
      if (explicitFilters.maxVelocity !== undefined) {
        velocityCondition.lte = explicitFilters.maxVelocity
      }
      addCondition(where, { muzzleVelocityFps: velocityCondition })
    }
  }
  
  // If no structured filters matched, fall back to text search
  if (Object.keys(where).length === 0 && intent.originalQuery) {
    const keywords = intent.keywords || intent.originalQuery.split(/\s+/).filter(w => w.length > 2)
    
    if (keywords.length > 0) {
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
  
  log.debug('Built where clause', { where })
  
  return where
}

/**
 * Helper to add condition to where clause
 */
function addCondition(where: any, condition: any): void {
  if (where.AND) {
    where.AND.push(condition)
  } else if (where.OR) {
    where.AND = [{ OR: where.OR }, condition]
    delete where.OR
  } else {
    Object.assign(where, condition)
  }
}

/**
 * Standard Prisma-based search
 */
async function standardSearch(where: any, skip: number, take: number, includePremiumFields: boolean): Promise<any[]> {
  return prisma.product.findMany({
    where,
    skip,
    take,
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      brand: true,
      imageUrl: true,
      upc: true,
      caliber: true,
      grainWeight: true,
      caseMaterial: true,
      purpose: true,
      roundCount: true,
      createdAt: true,
      // Premium fields
      ...(includePremiumFields ? {
        bulletType: true,
        pressureRating: true,
        muzzleVelocityFps: true,
        isSubsonic: true,
        shortBarrelOptimized: true,
        suppressorSafe: true,
        lowFlash: true,
        lowRecoil: true,
        controlledExpansion: true,
        matchGrade: true,
        factoryNew: true,
        dataSource: true,
        dataConfidence: true,
        metadata: true,
      } : {}),
      prices: {
        where: visibleDealerPriceWhere(),
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
  options: { skip: number; limit: number },
  isPremium: boolean
): Promise<any[]> {
  const { skip, limit } = options
  
  // Build the search text
  const searchText = [
    query,
    intent.purpose ? `for ${intent.purpose.toLowerCase()}` : '',
    intent.calibers?.join(' ') || '',
    intent.qualityLevel || '',
    // Add Premium intent context for better matching
    ...(isPremium && intent.premiumIntent ? [
      intent.premiumIntent.environment || '',
      intent.premiumIntent.preferredBulletTypes?.join(' ') || ''
    ] : [])
  ].filter(Boolean).join(' ')
  
  // Generate query embedding
  const queryEmbedding = await generateEmbedding(searchText)
  const embeddingStr = `[${queryEmbedding.join(',')}]`
  
  // Build filter conditions for SQL
  const conditions: string[] = ['embedding IS NOT NULL']
  const params: any[] = []
  
  // Caliber filter
  const calibers = explicitFilters.caliber ? [explicitFilters.caliber] : intent.calibers
  if (calibers?.length) {
    conditions.push(`caliber ILIKE ANY($${params.length + 1})`)
    params.push(calibers.map(c => `%${c}%`))
  }
  
  // Purpose filter
  const purpose = explicitFilters.purpose || intent.purpose
  if (purpose) {
    conditions.push(`purpose ILIKE $${params.length + 1}`)
    params.push(`%${purpose}%`)
  }
  
  // Case material filter
  const caseMaterials = explicitFilters.caseMaterial ? [explicitFilters.caseMaterial] : intent.caseMaterials
  if (caseMaterials?.length) {
    conditions.push(`"caseMaterial" ILIKE ANY($${params.length + 1})`)
    params.push(caseMaterials.map(c => `%${c}%`))
  }
  
  // Brand filter
  const brands = explicitFilters.brand ? [explicitFilters.brand] : intent.brands
  if (brands?.length) {
    conditions.push(`brand ILIKE ANY($${params.length + 1})`)
    params.push(brands.map(b => `%${b}%`))
  }
  
  // Grain weight range
  if (explicitFilters.minGrain !== undefined) {
    conditions.push(`"grainWeight" >= $${params.length + 1}`)
    params.push(explicitFilters.minGrain)
  }
  if (explicitFilters.maxGrain !== undefined) {
    conditions.push(`"grainWeight" <= $${params.length + 1}`)
    params.push(explicitFilters.maxGrain)
  }
  
  const whereClause = conditions.join(' AND ')
  
  // Execute vector search
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
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      brand: true,
      imageUrl: true,
      upc: true,
      caliber: true,
      grainWeight: true,
      caseMaterial: true,
      purpose: true,
      roundCount: true,
      createdAt: true,
      // Premium fields
      ...(isPremium ? {
        bulletType: true,
        pressureRating: true,
        muzzleVelocityFps: true,
        isSubsonic: true,
        shortBarrelOptimized: true,
        suppressorSafe: true,
        lowFlash: true,
        lowRecoil: true,
        controlledExpansion: true,
        matchGrade: true,
        factoryNew: true,
        dataSource: true,
        dataConfidence: true,
        metadata: true,
      } : {}),
      prices: {
        where: visibleDealerPriceWhere(),
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
 * Build price/stock conditions
 */
function buildPriceConditions(intent: SearchIntent, explicitFilters: ExplicitFilters): any {
  const conditions: any = {}
  
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
  
  const inStock = explicitFilters.inStock ?? intent.inStockOnly
  if (inStock) {
    conditions.inStock = true
  }
  
  return conditions
}

/**
 * Re-rank products based on AI intent analysis (FREE tier)
 */
function reRankProducts(products: any[], intent: SearchIntent): any[] {
  return products.map(product => {
    let score = 0
    
    // Score by grain weight match
    if (intent.grainWeights && product.grainWeight) {
      if (intent.grainWeights.includes(product.grainWeight)) {
        score += 30
      } else {
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
        const lowestPrice = product.prices[0]?.price
        if (lowestPrice && parseFloat(lowestPrice.toString()) < 0.50) {
          score += 15
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
    
    // Score by retailer tier
    const hasPremiumRetailer = product.prices.some((p: any) => p.retailer.tier === 'PREMIUM')
    if (hasPremiumRetailer) {
      score += 5
    }
    
    return { ...product, _relevanceScore: score }
  }).sort((a, b) => b._relevanceScore - a._relevanceScore)
}

/**
 * Strip premium explanation fields from intent for FREE users.
 * Premium intent contains AI-generated explanations and reasoning
 * that should only be shown to Premium subscribers.
 */
function stripPremiumExplanations(intent: SearchIntent, isPremium: boolean): SearchIntent {
  if (isPremium) {
    // Premium users get the full intent with explanations
    return intent
  }

  // FREE users: strip explanation and reasoning from premiumIntent
  if (!intent.premiumIntent) {
    return intent
  }

  const { explanation, reasoning, ...restPremiumIntent } = intent.premiumIntent

  return {
    ...intent,
    premiumIntent: {
      ...restPremiumIntent,
      // Remove explanation and reasoning for FREE users
      explanation: undefined as any,
      reasoning: undefined,
    },
  }
}

/**
 * Format product for API response
 *
 * Price context tiering (The Rule):
 * - Everyone gets the conclusion (contextBand)
 * - Premium gets the reasoning (relativePricePct, positionInRange, meta)
 */
function formatProduct(product: any, isPremium: boolean): any {
  // Build price context - verdict for everyone, depth for premium
  let priceContext: any = undefined
  const priceSignal = product._priceSignal

  if (priceSignal && priceSignal.contextBand) {
    if (isPremium) {
      // Premium: Full depth - quantification, history, confidence
      priceContext = {
        contextBand: priceSignal.contextBand,
        relativePricePct: priceSignal.relativePricePct,
        positionInRange: priceSignal.positionInRange,
        meta: priceSignal.meta
      }
    } else {
      // FREE: Just the verdict - no numbers, no charts, no tuning knobs
      priceContext = {
        contextBand: priceSignal.contextBand
      }
    }
  }

  const base = {
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
    // Price context - everyone gets verdict, premium gets depth
    ...(priceContext && { priceContext }),
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
  
  // Add Premium fields if available
  if (isPremium) {
    const premiumFields: any = {}
    
    // Structured ballistic fields
    if (product.bulletType) premiumFields.bulletType = product.bulletType
    if (product.pressureRating) premiumFields.pressureRating = product.pressureRating
    if (product.muzzleVelocityFps) premiumFields.muzzleVelocityFps = product.muzzleVelocityFps
    if (product.isSubsonic !== null) premiumFields.isSubsonic = product.isSubsonic
    
    // Performance characteristics
    if (product.shortBarrelOptimized) premiumFields.shortBarrelOptimized = product.shortBarrelOptimized
    if (product.suppressorSafe) premiumFields.suppressorSafe = product.suppressorSafe
    if (product.lowFlash) premiumFields.lowFlash = product.lowFlash
    if (product.lowRecoil) premiumFields.lowRecoil = product.lowRecoil
    if (product.controlledExpansion) premiumFields.controlledExpansion = product.controlledExpansion
    if (product.matchGrade) premiumFields.matchGrade = product.matchGrade
    if (product.factoryNew !== null) premiumFields.factoryNew = product.factoryNew
    
    // Data quality
    if (product.dataSource) premiumFields.dataSource = product.dataSource
    if (product.dataConfidence) premiumFields.dataConfidence = parseFloat(product.dataConfidence.toString())
    
    // Premium ranking data
    if (product.premiumRanking) {
      premiumFields.premiumRanking = {
        finalScore: product.premiumRanking.finalScore,
        breakdown: product.premiumRanking.breakdown,
        badges: product.premiumRanking.badges,
        explanation: product.premiumRanking.explanation,
        // Price signal: descriptive context only (ADR-006 compliant)
        priceSignal: product.premiumRanking.priceSignal ? {
          relativePricePct: product.premiumRanking.priceSignal.relativePricePct,
          positionInRange: product.premiumRanking.priceSignal.positionInRange,
          contextBand: product.premiumRanking.priceSignal.contextBand,
          meta: product.premiumRanking.priceSignal.meta
        } : undefined
      }
    }
    
    if (Object.keys(premiumFields).length > 0) {
      return { ...base, premium: premiumFields }
    }
  }
  
  return base
}

/**
 * Build facets for filtering UI
 */
async function buildFacets(where: any, isPremium: boolean): Promise<Record<string, Record<string, number>>> {
  const selectFields: any = {
    caliber: true,
    grainWeight: true,
    caseMaterial: true,
    purpose: true,
    brand: true,
    category: true,
  }
  
  // Add Premium facet fields
  if (isPremium) {
    selectFields.bulletType = true
    selectFields.pressureRating = true
    selectFields.isSubsonic = true
  }
  
  const allProducts = await prisma.product.findMany({
    where,
    select: selectFields
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
  
  const facets: Record<string, Record<string, number>> = {
    calibers: countValues('caliber'),
    grainWeights: countValues('grainWeight'),
    caseMaterials: countValues('caseMaterial'),
    purposes: countValues('purpose'),
    brands: countValues('brand'),
    categories: countValues('category')
  }
  
  // Add Premium facets
  if (isPremium) {
    facets.bulletTypes = countValues('bulletType')
    facets.pressureRatings = countValues('pressureRating')
    
    // Boolean facet for subsonic
    const subsonicCount = allProducts.filter((p: any) => p.isSubsonic === true).length
    const nonSubsonicCount = allProducts.filter((p: any) => p.isSubsonic === false).length
    if (subsonicCount > 0 || nonSubsonicCount > 0) {
      facets.isSubsonic = {
        'true': subsonicCount,
        'false': nonSubsonicCount
      }
    }
  }
  
  return facets
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
