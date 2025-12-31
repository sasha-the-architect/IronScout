import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { aiSearch, getSearchSuggestions, parseSearchIntent, backfillProductEmbeddings, updateProductEmbedding, ParseOptions } from '../services/ai-search'
import { prisma, isAiSearchEnabled, isVectorSearchEnabled } from '@ironscout/db'
import { requireAdmin, rateLimit, getUserTier } from '../middleware/auth'
import { getMaxSearchResults, hasPriceHistoryAccess } from '../config/tiers'
import { loggers } from '../config/logger'

const log = loggers.search

const router: any = Router()

// Valid bullet types for Premium filter validation
const BULLET_TYPES = [
  'JHP', 'HP', 'BJHP', 'XTP', 'HST', 'GDHP', 'VMAX',
  'FMJ', 'TMJ', 'CMJ', 'MC', 'BALL',
  'SP', 'JSP', 'PSP', 'RN', 'FPRN',
  'FRANGIBLE', 'AP', 'TRACER', 'BLANK', 'WADCUTTER', 'SWC', 'LSWC',
  'BUCKSHOT', 'BIRDSHOT', 'SLUG', 'OTHER'
] as const

// Valid pressure ratings for Premium filter validation
const PRESSURE_RATINGS = ['STANDARD', 'PLUS_P', 'PLUS_P_PLUS', 'NATO', 'UNKNOWN'] as const

/**
 * AI-powered semantic search with optional explicit filters
 * POST /api/search/semantic
 * 
 * Accepts natural language queries like:
 * - "best ammo for target practice at long range with AR15"
 * - "cheap 9mm bulk ammo in stock"
 * - "match grade .308 for precision rifle competition"
 * 
 * Also accepts explicit filters that override/narrow AI intent:
 * - Basic: caliber, purpose, caseMaterial, minPrice, maxPrice, minGrain, maxGrain, inStock
 * - Premium: bulletType, pressureRating, isSubsonic, shortBarrelOptimized, suppressorSafe, etc.
 */
const semanticSearchSchema = z.object({
  query: z.string().min(1).max(500),
  page: z.number().int().positive().default(1),
  limit: z.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['relevance', 'price_asc', 'price_desc', 'date_desc', 'date_asc', 'price_context']).default('relevance'),
  // Explicit filters that override AI intent
  filters: z.object({
    // Basic filters (FREE + PREMIUM)
    caliber: z.string().optional(),
    purpose: z.string().optional(),
    caseMaterial: z.string().optional(),
    minPrice: z.number().optional(),
    maxPrice: z.number().optional(),
    minGrain: z.number().optional(),
    maxGrain: z.number().optional(),
    inStock: z.boolean().optional(),
    brand: z.string().optional(),
    
    // Premium filters (PREMIUM only - will be ignored for FREE users)
    bulletType: z.enum(BULLET_TYPES).optional(),
    pressureRating: z.enum(PRESSURE_RATINGS).optional(),
    isSubsonic: z.boolean().optional(),
    shortBarrelOptimized: z.boolean().optional(),
    suppressorSafe: z.boolean().optional(),
    lowFlash: z.boolean().optional(),
    lowRecoil: z.boolean().optional(),
    matchGrade: z.boolean().optional(),
    controlledExpansion: z.boolean().optional(),
    minVelocity: z.number().optional(),
    maxVelocity: z.number().optional(),
  }).optional(),
})

router.post('/semantic', async (req: Request, res: Response) => {
  try {
    log.debug('Semantic search request', { body: req.body })

    // Check if AI search is enabled
    const aiEnabled = await isAiSearchEnabled()
    if (!aiEnabled) {
      log.info('AI search disabled via admin settings')
      return res.status(503).json({
        error: 'AI search is temporarily disabled',
        code: 'AI_SEARCH_DISABLED'
      })
    }

    const { query, page, limit, sortBy, filters } = semanticSearchSchema.parse(req.body)

    log.debug('Parsed filters', { filters })

    // Get user tier
    const userTier = await getUserTier(req)
    const maxResults = getMaxSearchResults(userTier)
    const isPremium = userTier === 'PREMIUM'
    
    // Strip Premium filters for FREE users
    let effectiveFilters = filters
    if (!isPremium && filters) {
      const { 
        bulletType, pressureRating, isSubsonic, 
        shortBarrelOptimized, suppressorSafe, lowFlash, lowRecoil,
        matchGrade, controlledExpansion, minVelocity, maxVelocity,
        ...basicFilters 
      } = filters
      effectiveFilters = basicFilters
      
      // Log if Premium filters were stripped
      const strippedCount = Object.keys(filters).length - Object.keys(basicFilters).length
      if (strippedCount > 0) {
        log.debug('Stripped premium filters for FREE user', { strippedCount })
      }
    }
    
    // Apply tier-based limit
    const tierLimitedLimit = Math.min(limit, maxResults)
    
    // Prevent FREE users from using price_context sort
    const effectiveSortBy = (!isPremium && sortBy === 'price_context') ? 'relevance' : sortBy

    // Check if vector search is enabled
    const vectorEnabled = await isVectorSearchEnabled()

    const result = await aiSearch(query, {
      page,
      limit: tierLimitedLimit,
      sortBy: effectiveSortBy,
      useVectorSearch: vectorEnabled, // Controlled via admin settings
      explicitFilters: effectiveFilters,
      userTier, // Pass user tier to enable Premium features
    })
    
    // Check if results are limited
    const hasMoreResults = result.pagination.total > maxResults && userTier === 'FREE'
    
    // Build meta response
    const metaResponse: any = {
      tier: userTier,
      maxResults,
      resultsLimited: hasMoreResults,
    }
    
    if (hasMoreResults) {
      metaResponse.upgradeMessage = `Showing ${maxResults} of ${result.pagination.total} results. Upgrade to Premium to see all results.`
    }
    
    // Add Premium feature hints for FREE users
    if (!isPremium) {
      metaResponse.premiumFeatures = {
        priceContextSort: 'Upgrade to Premium to sort by price context',
        advancedFilters: 'Upgrade to Premium for bullet type, pressure rating, and performance filters',
        performanceBadges: 'Upgrade to Premium to see performance badges and detailed explanations'
      }
    }
    
    // Adjust pagination info for tier limits
    const adjustedResult = {
      ...result,
      pagination: {
        ...result.pagination,
        total: userTier === 'FREE' ? Math.min(result.pagination.total, maxResults) : result.pagination.total,
        totalPages: Math.ceil(Math.min(result.pagination.total, maxResults) / tierLimitedLimit),
        actualTotal: result.pagination.total
      },
      _meta: metaResponse
    }
    
    res.json(adjustedResult)
  } catch (error) {
    log.error('Semantic search error', {}, error)

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid request parameters',
        details: error.issues
      })
    }
    
    res.status(500).json({ error: 'Search failed' })
  }
})

/**
 * Parse a query without searching (for debugging/preview)
 * POST /api/search/parse
 * 
 * Premium users get enhanced intent parsing with environment, barrel length, etc.
 */
const parseSchema = z.object({
  query: z.string().min(1).max(500),
})

router.post('/parse', async (req: Request, res: Response) => {
  try {
    // Check if AI search is enabled
    const aiEnabled = await isAiSearchEnabled()
    if (!aiEnabled) {
      return res.status(503).json({
        error: 'AI search is temporarily disabled',
        code: 'AI_SEARCH_DISABLED'
      })
    }

    const { query } = parseSchema.parse(req.body)

    // Get user tier for Premium parsing
    const userTier = await getUserTier(req)
    const parseOptions: ParseOptions = { userTier }

    const intent = await parseSearchIntent(query, parseOptions)
    
    res.json({ 
      intent,
      tier: userTier,
      // Indicate if Premium parsing was used
      premiumParsing: userTier === 'PREMIUM' && !!intent.premiumIntent
    })
  } catch (error) {
    log.error('Parse error', {}, error)

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid request parameters',
        details: error.issues
      })
    }
    
    res.status(500).json({ error: 'Parse failed' })
  }
})

/**
 * Get search suggestions/autocomplete
 * GET /api/search/suggestions?q=ar1
 */
const suggestionsSchema = z.object({
  q: z.string().min(1).max(100),
})

router.get('/suggestions', async (req: Request, res: Response) => {
  try {
    const { q } = suggestionsSchema.parse(req.query)
    
    const suggestions = await getSearchSuggestions(q)
    
    res.json({ suggestions })
  } catch (error) {
    log.error('Suggestions error', {}, error)

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid request parameters',
        details: error.issues
      })
    }
    
    res.status(500).json({ error: 'Suggestions failed' })
  }
})

/**
 * Natural language to filters (for hybrid UI)
 * Allows users to type naturally, then see/edit extracted filters
 * 
 * POST /api/search/nl-to-filters
 */
router.post('/nl-to-filters', async (req: Request, res: Response) => {
  try {
    // Check if AI search is enabled
    const aiEnabled = await isAiSearchEnabled()
    if (!aiEnabled) {
      return res.status(503).json({
        error: 'AI search is temporarily disabled',
        code: 'AI_SEARCH_DISABLED'
      })
    }

    const { query } = parseSchema.parse(req.body)

    // Get user tier for Premium parsing
    const userTier = await getUserTier(req)
    const parseOptions: ParseOptions = { userTier }

    const intent = await parseSearchIntent(query, parseOptions)
    
    // Convert intent to filter format matching existing search API
    const filters: Record<string, any> = {}
    
    if (intent.calibers?.length) {
      filters.caliber = intent.calibers[0]
      filters.caliberOptions = intent.calibers
    }
    
    if (intent.purpose) {
      filters.purpose = intent.purpose
    }
    
    if (intent.grainWeights?.length) {
      filters.grainWeight = intent.grainWeights[0]
      filters.grainWeightOptions = intent.grainWeights
    }
    
    if (intent.caseMaterials?.length) {
      filters.caseMaterial = intent.caseMaterials[0]
    }
    
    if (intent.brands?.length) {
      filters.brand = intent.brands[0]
    }
    
    if (intent.minPrice !== undefined) {
      filters.minPrice = intent.minPrice
    }
    
    if (intent.maxPrice !== undefined) {
      filters.maxPrice = intent.maxPrice
    }
    
    if (intent.inStockOnly) {
      filters.inStock = true
    }
    
    // Add Premium filters if available and user is Premium
    const premiumFilters: Record<string, any> = {}
    if (userTier === 'PREMIUM' && intent.premiumIntent) {
      if (intent.premiumIntent.preferredBulletTypes?.length) {
        premiumFilters.bulletType = intent.premiumIntent.preferredBulletTypes[0]
        premiumFilters.bulletTypeOptions = intent.premiumIntent.preferredBulletTypes
      }
      
      if (intent.premiumIntent.suppressorUse) {
        premiumFilters.suppressorSafe = true
      }
      
      if (intent.premiumIntent.barrelLength === 'short') {
        premiumFilters.shortBarrelOptimized = true
      }
      
      if (intent.premiumIntent.safetyConstraints?.includes('low-flash')) {
        premiumFilters.lowFlash = true
      }
      
      if (intent.premiumIntent.safetyConstraints?.includes('low-recoil')) {
        premiumFilters.lowRecoil = true
      }
    }
    
    res.json({
      filters,
      premiumFilters: userTier === 'PREMIUM' ? premiumFilters : undefined,
      intent,
      explanation: generateExplanation(intent, userTier === 'PREMIUM'),
      tier: userTier
    })
  } catch (error) {
    log.error('NL to filters error', {}, error)
    res.status(500).json({ error: 'Conversion failed' })
  }
})

/**
 * Generate human-readable explanation of parsed intent
 */
function generateExplanation(intent: any, isPremium: boolean): string {
  const parts: string[] = []
  
  if (intent.calibers?.length) {
    parts.push(`caliber: ${intent.calibers.join(' or ')}`)
  }
  
  if (intent.purpose) {
    parts.push(`for ${intent.purpose.toLowerCase()}`)
  }
  
  if (intent.grainWeights?.length) {
    parts.push(`${intent.grainWeights.join('/')}gr bullets`)
  }
  
  if (intent.qualityLevel) {
    parts.push(`${intent.qualityLevel} quality`)
  }
  
  if (intent.caseMaterials?.length) {
    parts.push(`${intent.caseMaterials.join('/')} case`)
  }
  
  if (intent.inStockOnly) {
    parts.push('in stock only')
  }
  
  // Add Premium explanation if available
  if (isPremium && intent.premiumIntent?.explanation) {
    return intent.premiumIntent.explanation
  }
  
  if (parts.length === 0) {
    return 'Searching all products'
  }
  
  return `Looking for: ${parts.join(', ')}`
}

/**
 * Get available Premium filters for UI
 * GET /api/search/premium-filters
 * 
 * Returns the list of Premium filters with their options
 */
router.get('/premium-filters', async (req: Request, res: Response) => {
  try {
    const userTier = await getUserTier(req)
    
    // Return filter definitions even for FREE users (for UI display)
    // but indicate they require Premium
    res.json({
      available: userTier === 'PREMIUM',
      filters: {
        bulletType: {
          label: 'Bullet Type',
          type: 'select',
          options: [
            { value: 'JHP', label: 'Jacketed Hollow Point (JHP)', category: 'defensive' },
            { value: 'HP', label: 'Hollow Point (HP)', category: 'defensive' },
            { value: 'BJHP', label: 'Bonded JHP', category: 'defensive' },
            { value: 'HST', label: 'Federal HST', category: 'defensive' },
            { value: 'GDHP', label: 'Gold Dot HP', category: 'defensive' },
            { value: 'FMJ', label: 'Full Metal Jacket (FMJ)', category: 'training' },
            { value: 'TMJ', label: 'Total Metal Jacket (TMJ)', category: 'training' },
            { value: 'SP', label: 'Soft Point (SP)', category: 'hunting' },
            { value: 'JSP', label: 'Jacketed Soft Point (JSP)', category: 'hunting' },
            { value: 'FRANGIBLE', label: 'Frangible', category: 'specialty' },
          ]
        },
        pressureRating: {
          label: 'Pressure Rating',
          type: 'select',
          options: [
            { value: 'STANDARD', label: 'Standard' },
            { value: 'PLUS_P', label: '+P' },
            { value: 'PLUS_P_PLUS', label: '+P+' },
            { value: 'NATO', label: 'NATO Spec' },
          ]
        },
        isSubsonic: {
          label: 'Subsonic',
          type: 'boolean',
          description: 'Ammunition traveling below 1,125 fps'
        },
        shortBarrelOptimized: {
          label: 'Short Barrel Optimized',
          type: 'boolean',
          description: 'Designed for compact pistols (<4" barrel)'
        },
        suppressorSafe: {
          label: 'Suppressor Safe',
          type: 'boolean',
          description: 'Safe for use with suppressors'
        },
        lowFlash: {
          label: 'Low Flash',
          type: 'boolean',
          description: 'Reduced muzzle flash for low-light'
        },
        lowRecoil: {
          label: 'Low Recoil',
          type: 'boolean',
          description: 'Reduced felt recoil'
        },
        matchGrade: {
          label: 'Match Grade',
          type: 'boolean',
          description: 'Competition/precision quality'
        },
        velocityRange: {
          label: 'Muzzle Velocity',
          type: 'range',
          min: 700,
          max: 3500,
          unit: 'fps'
        }
      },
      upgradeMessage: userTier === 'FREE' 
        ? 'Upgrade to Premium to access advanced filters and performance-based search'
        : undefined
    })
  } catch (error) {
    log.error('Premium filters error', {}, error)
    res.status(500).json({ error: 'Failed to get premium filters' })
  }
})

// ============================================
// Admin Endpoints for Vector Embedding Management
// ============================================

/**
 * Get embedding statistics
 * GET /api/search/admin/embedding-stats
 */
router.get('/admin/embedding-stats', requireAdmin, async (req: Request, res: Response) => {
  try {
    const stats = await prisma.$queryRaw<Array<{
      total: bigint
      with_embedding: bigint
      without_embedding: bigint
    }>>`
      SELECT 
        COUNT(*) as total,
        COUNT(embedding) as with_embedding,
        COUNT(*) - COUNT(embedding) as without_embedding
      FROM products
    `
    
    const result = stats[0]
    
    res.json({
      total: Number(result.total),
      withEmbedding: Number(result.with_embedding),
      withoutEmbedding: Number(result.without_embedding),
      percentComplete: result.total > 0 
        ? Math.round((Number(result.with_embedding) / Number(result.total)) * 100)
        : 0
    })
  } catch (error) {
    log.error('Embedding stats error', {}, error)
    res.status(500).json({ error: 'Failed to get embedding stats' })
  }
})

/**
 * Get ballistic field statistics (Phase 2)
 * GET /api/search/admin/ballistic-stats
 */
router.get('/admin/ballistic-stats', requireAdmin, async (req: Request, res: Response) => {
  try {
    const stats = await prisma.$queryRaw<Array<{
      total: bigint
      with_bullet_type: bigint
      with_pressure_rating: bigint
      with_velocity: bigint
      with_subsonic: bigint
      with_short_barrel: bigint
      with_suppressor_safe: bigint
      with_low_flash: bigint
      with_match_grade: bigint
    }>>`
      SELECT 
        COUNT(*) as total,
        COUNT("bulletType") as with_bullet_type,
        COUNT("pressureRating") as with_pressure_rating,
        COUNT("muzzleVelocityFps") as with_velocity,
        COUNT("isSubsonic") as with_subsonic,
        COUNT("shortBarrelOptimized") as with_short_barrel,
        COUNT("suppressorSafe") as with_suppressor_safe,
        COUNT("lowFlash") as with_low_flash,
        COUNT("matchGrade") as with_match_grade
      FROM products
    `
    
    const result = stats[0]
    const total = Number(result.total)
    
    res.json({
      total,
      fields: {
        bulletType: { 
          count: Number(result.with_bullet_type), 
          percent: total > 0 ? Math.round((Number(result.with_bullet_type) / total) * 100) : 0 
        },
        pressureRating: { 
          count: Number(result.with_pressure_rating), 
          percent: total > 0 ? Math.round((Number(result.with_pressure_rating) / total) * 100) : 0 
        },
        muzzleVelocityFps: { 
          count: Number(result.with_velocity), 
          percent: total > 0 ? Math.round((Number(result.with_velocity) / total) * 100) : 0 
        },
        isSubsonic: { 
          count: Number(result.with_subsonic), 
          percent: total > 0 ? Math.round((Number(result.with_subsonic) / total) * 100) : 0 
        },
        shortBarrelOptimized: { 
          count: Number(result.with_short_barrel), 
          percent: total > 0 ? Math.round((Number(result.with_short_barrel) / total) * 100) : 0 
        },
        suppressorSafe: { 
          count: Number(result.with_suppressor_safe), 
          percent: total > 0 ? Math.round((Number(result.with_suppressor_safe) / total) * 100) : 0 
        },
        lowFlash: { 
          count: Number(result.with_low_flash), 
          percent: total > 0 ? Math.round((Number(result.with_low_flash) / total) * 100) : 0 
        },
        matchGrade: { 
          count: Number(result.with_match_grade), 
          percent: total > 0 ? Math.round((Number(result.with_match_grade) / total) * 100) : 0 
        },
      }
    })
  } catch (error) {
    log.error('Ballistic stats error', {}, error)
    res.status(500).json({ error: 'Failed to get ballistic stats' })
  }
})

/**
 * Trigger embedding backfill (async - returns immediately)
 * POST /api/search/admin/backfill-embeddings
 */
let backfillInProgress = false
let backfillProgress = { processed: 0, total: 0, errors: [] as string[] }

router.post('/admin/backfill-embeddings', requireAdmin, rateLimit({ max: 1, windowMs: 60000 }), async (req: Request, res: Response) => {
  if (backfillInProgress) {
    return res.status(409).json({ 
      error: 'Backfill already in progress',
      progress: backfillProgress
    })
  }
  
  backfillInProgress = true
  backfillProgress = { processed: 0, total: 0, errors: [] }
  
  backfillProductEmbeddings({
    batchSize: 50,
    onProgress: (processed, total) => {
      backfillProgress.processed = processed
      backfillProgress.total = total
    }
  }).then(result => {
    backfillProgress.errors = result.errors
    backfillInProgress = false
    log.info('Backfill complete', { processed: result.processed, errors: result.errors.length })
  }).catch(error => {
    backfillProgress.errors.push(error.message)
    backfillInProgress = false
    log.error('Backfill failed', {}, error)
  })
  
  res.json({ 
    message: 'Backfill started',
    status: 'running'
  })
})

/**
 * Get backfill progress
 * GET /api/search/admin/backfill-progress
 */
router.get('/admin/backfill-progress', requireAdmin, (req: Request, res: Response) => {
  res.json({
    inProgress: backfillInProgress,
    ...backfillProgress,
    percentComplete: backfillProgress.total > 0 
      ? Math.round((backfillProgress.processed / backfillProgress.total) * 100)
      : 0
  })
})

/**
 * Update embedding for a single product
 * POST /api/search/admin/update-embedding/:productId
 */
router.post('/admin/update-embedding/:productId', requireAdmin, rateLimit({ max: 100, windowMs: 60000 }), async (req: Request, res: Response) => {
  try {
    const { productId } = req.params
    
    await updateProductEmbedding(productId)
    
    res.json({ success: true, productId })
  } catch (error: any) {
    log.error('Update embedding error', { productId: req.params.productId }, error)
    res.status(500).json({ error: error.message || 'Failed to update embedding' })
  }
})

/**
 * Debug endpoint - get unique caliber values in database
 * GET /api/search/debug/calibers
 */
router.get('/debug/calibers', async (req: Request, res: Response) => {
  try {
    const calibers = await prisma.product.groupBy({
      by: ['caliber'],
      _count: { caliber: true },
      orderBy: { _count: { caliber: 'desc' } },
      take: 50
    })
    
    res.json({
      calibers: calibers.map(c => ({ value: c.caliber, count: c._count.caliber }))
    })
  } catch (error) {
    log.error('Debug calibers error', {}, error)
    res.status(500).json({ error: 'Failed to get calibers' })
  }
})

/**
 * Debug endpoint - get unique purpose values in database
 * GET /api/search/debug/purposes
 */
router.get('/debug/purposes', async (req: Request, res: Response) => {
  try {
    const purposes = await prisma.product.groupBy({
      by: ['purpose'],
      _count: { purpose: true },
      orderBy: { _count: { purpose: 'desc' } },
      take: 50
    })
    
    res.json({
      purposes: purposes.map(p => ({ value: p.purpose, count: p._count.purpose }))
    })
  } catch (error) {
    log.error('Debug purposes error', {}, error)
    res.status(500).json({ error: 'Failed to get purposes' })
  }
})

/**
 * Debug endpoint - get unique bullet types in database
 * GET /api/search/debug/bullet-types
 */
router.get('/debug/bullet-types', async (req: Request, res: Response) => {
  try {
    const bulletTypes = await prisma.product.groupBy({
      by: ['bulletType'],
      _count: { bulletType: true },
      orderBy: { _count: { bulletType: 'desc' } },
      take: 50
    })
    
    res.json({
      bulletTypes: bulletTypes.map(b => ({ value: b.bulletType, count: b._count.bulletType }))
    })
  } catch (error) {
    log.error('Debug bullet types error', {}, error)
    res.status(500).json({ error: 'Failed to get bullet types' })
  }
})

export { router as searchRouter }
