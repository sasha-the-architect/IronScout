import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { aiSearch, getSearchSuggestions, parseSearchIntent, backfillProductEmbeddings, updateProductEmbedding, ParseOptions } from '../services/ai-search'
import { enqueueEmbeddingBatch, getEmbeddingQueueStats } from '../services/ai-search/embedding-queue'
import { prisma, isAiSearchEnabled, isVectorSearchEnabled } from '@ironscout/db'
import { requireAdmin, rateLimit } from '../middleware/auth'
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

    // Check if vector search is enabled
    const vectorEnabled = await isVectorSearchEnabled()

    // V1: All users get full capabilities
    const result = await aiSearch(query, {
      page,
      limit,
      sortBy,
      useVectorSearch: vectorEnabled,
      explicitFilters: filters,
      userTier: 'PREMIUM',
    })

    res.json(result)
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
 * V1: All users get enhanced intent parsing with environment, barrel length, etc.
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

    // V1: All users get full parsing capabilities
    const parseOptions: ParseOptions = { userTier: 'PREMIUM' }

    const intent = await parseSearchIntent(query, parseOptions)

    res.json({
      intent,
      // V1: Enhanced parsing always available
      premiumParsing: !!intent.premiumIntent
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
 *
 * V1: All users get full filter capabilities
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

    // V1: All users get full parsing capabilities
    const parseOptions: ParseOptions = { userTier: 'PREMIUM' }

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

    // V1: All advanced filters available to all users
    const advancedFilters: Record<string, any> = {}
    if (intent.premiumIntent) {
      if (intent.premiumIntent.preferredBulletTypes?.length) {
        advancedFilters.bulletType = intent.premiumIntent.preferredBulletTypes[0]
        advancedFilters.bulletTypeOptions = intent.premiumIntent.preferredBulletTypes
      }

      if (intent.premiumIntent.suppressorUse) {
        advancedFilters.suppressorSafe = true
      }

      if (intent.premiumIntent.barrelLength === 'short') {
        advancedFilters.shortBarrelOptimized = true
      }

      if (intent.premiumIntent.safetyConstraints?.includes('low-flash')) {
        advancedFilters.lowFlash = true
      }

      if (intent.premiumIntent.safetyConstraints?.includes('low-recoil')) {
        advancedFilters.lowRecoil = true
      }
    }

    res.json({
      filters,
      advancedFilters,
      intent,
      explanation: generateExplanation(intent)
    })
  } catch (error) {
    log.error('NL to filters error', {}, error)
    res.status(500).json({ error: 'Conversion failed' })
  }
})

/**
 * Generate human-readable explanation of parsed intent
 * V1: All users get enhanced explanations
 */
function generateExplanation(intent: any): string {
  // Use enhanced explanation if available
  if (intent.premiumIntent?.explanation) {
    return intent.premiumIntent.explanation
  }

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

  if (parts.length === 0) {
    return 'Searching all products'
  }

  return `Looking for: ${parts.join(', ')}`
}

/**
 * Get available advanced filters for UI
 * GET /api/search/premium-filters
 *
 * V1: Returns all filter definitions for all users
 */
router.get('/premium-filters', async (_req: Request, res: Response) => {
  try {
    // V1: All filters available to all users
    res.json({
      available: true,
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
      }
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
 * Trigger embedding backfill via queue (enqueues jobs to harvester)
 * POST /api/search/admin/backfill-embeddings
 *
 * Routes through the embedding-generate queue so all embeddings use
 * the same code path (harvester worker) regardless of trigger source.
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

  try {
    // Query products without embeddings
    const productsWithoutEmbedding = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM products WHERE embedding IS NULL
    `

    if (productsWithoutEmbedding.length === 0) {
      return res.json({
        message: 'No products need embeddings',
        total: 0,
        enqueued: 0
      })
    }

    backfillInProgress = true
    backfillProgress = { processed: 0, total: productsWithoutEmbedding.length, errors: [] }

    // Enqueue all products to the embedding queue
    const productIds = productsWithoutEmbedding.map(p => p.id)
    const { enqueued, skipped } = await enqueueEmbeddingBatch(productIds)

    backfillProgress.processed = enqueued
    backfillInProgress = false

    log.info('Backfill jobs enqueued', { total: productIds.length, enqueued, skipped })

    res.json({
      message: 'Backfill jobs enqueued to embedding queue',
      total: productIds.length,
      enqueued,
      skipped,
      note: 'Jobs will be processed by harvester embedding worker'
    })
  } catch (error: any) {
    backfillInProgress = false
    backfillProgress.errors.push(error.message)
    log.error('Backfill enqueue failed', {}, error)
    res.status(500).json({ error: error.message || 'Failed to enqueue backfill jobs' })
  }
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
 * Get embedding statistics
 * GET /api/search/admin/embedding-stats
 */
router.get('/admin/embedding-stats', requireAdmin, async (req: Request, res: Response) => {
  try {
    const [totalProducts, productsWithEmbedding] = await Promise.all([
      prisma.products.count(),
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM products WHERE embedding IS NOT NULL
      `.then(r => Number(r[0].count)),
    ])

    const productsWithoutEmbedding = totalProducts - productsWithEmbedding
    const coveragePercent = totalProducts > 0
      ? Math.round((productsWithEmbedding / totalProducts) * 100)
      : 0

    res.json({
      totalProducts,
      productsWithEmbedding,
      productsWithoutEmbedding,
      coveragePercent,
      backfillInProgress,
      backfillProgress: backfillInProgress ? backfillProgress : null,
    })
  } catch (error) {
    log.error('Embedding stats error', {}, error)
    res.status(500).json({ error: 'Failed to get embedding stats' })
  }
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
router.get('/debug/calibers', requireAdmin, async (req: Request, res: Response) => {
  try {
    const calibers = await prisma.products.groupBy({
      by: ['caliber'],
      _count: { caliber: true },
      orderBy: { _count: { caliber: 'desc' } },
      take: 50
    })

    res.json({
      calibers: calibers.map((c: { caliber: string | null; _count: { caliber: number } }) => ({ value: c.caliber, count: c._count.caliber }))
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
router.get('/debug/purposes', requireAdmin, async (req: Request, res: Response) => {
  try {
    const purposes = await prisma.products.groupBy({
      by: ['purpose'],
      _count: { purpose: true },
      orderBy: { _count: { purpose: 'desc' } },
      take: 50
    })

    res.json({
      purposes: purposes.map((p: { purpose: string | null; _count: { purpose: number } }) => ({ value: p.purpose, count: p._count.purpose }))
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
router.get('/debug/bullet-types', requireAdmin, async (req: Request, res: Response) => {
  try {
    const bulletTypes = await prisma.products.groupBy({
      by: ['bulletType'],
      _count: { bulletType: true },
      orderBy: { _count: { bulletType: 'desc' } },
      take: 50
    })

    res.json({
      bulletTypes: bulletTypes.map((b: { bulletType: string | null; _count: { bulletType: number } }) => ({ value: b.bulletType, count: b._count.bulletType }))
    })
  } catch (error) {
    log.error('Debug bullet types error', {}, error)
    res.status(500).json({ error: 'Failed to get bullet types' })
  }
})

export { router as searchRouter }
