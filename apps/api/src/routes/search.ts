import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { aiSearch, getSearchSuggestions, parseSearchIntent, backfillProductEmbeddings, updateProductEmbedding } from '../services/ai-search'
import { prisma } from '@ironscout/db'
import { requireAdmin, rateLimit } from '../middleware/auth'
import { TIER_CONFIG, getMaxSearchResults, hasPriceHistoryAccess } from '../config/tiers'

const router: any = Router()

/**
 * Get user tier from request
 * Checks X-User-Id header and looks up user tier
 * Falls back to FREE tier for anonymous users
 */
async function getUserTier(req: Request): Promise<keyof typeof TIER_CONFIG> {
  const userId = req.headers['x-user-id'] as string
  
  if (!userId) {
    return 'FREE'
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { tier: true }
    })
    return (user?.tier as keyof typeof TIER_CONFIG) || 'FREE'
  } catch {
    return 'FREE'
  }
}

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
 * - caliber, purpose, caseMaterial, minPrice, maxPrice, minGrain, maxGrain, inStock
 */
const semanticSearchSchema = z.object({
  query: z.string().min(1).max(500),
  page: z.number().int().positive().default(1),
  limit: z.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['relevance', 'price_asc', 'price_desc', 'date_desc', 'date_asc']).default('relevance'),
  // Explicit filters that override AI intent
  filters: z.object({
    caliber: z.string().optional(),
    purpose: z.string().optional(),
    caseMaterial: z.string().optional(),
    minPrice: z.number().optional(),
    maxPrice: z.number().optional(),
    minGrain: z.number().optional(),
    maxGrain: z.number().optional(),
    inStock: z.boolean().optional(),
    brand: z.string().optional(),
  }).optional(),
})

router.post('/semantic', async (req: Request, res: Response) => {
  try {
    const { query, page, limit, sortBy, filters } = semanticSearchSchema.parse(req.body)
    
    // Get user tier for result limiting
    const userTier = await getUserTier(req)
    const maxResults = getMaxSearchResults(userTier)
    
    // Apply tier-based limit
    const tierLimitedLimit = Math.min(limit, maxResults)
    
    const result = await aiSearch(query, { 
      page, 
      limit: tierLimitedLimit, 
      sortBy,
      explicitFilters: filters, // Pass explicit filters to AI search
    })
    
    // Check if results are limited
    const hasMoreResults = result.pagination.total > maxResults && userTier === 'FREE'
    
    // Adjust pagination info for tier limits
    const adjustedResult = {
      ...result,
      pagination: {
        ...result.pagination,
        total: userTier === 'FREE' ? Math.min(result.pagination.total, maxResults) : result.pagination.total,
        totalPages: Math.ceil(Math.min(result.pagination.total, maxResults) / tierLimitedLimit),
        actualTotal: result.pagination.total // Always show the real total count
      },
      _meta: {
        tier: userTier,
        maxResults,
        resultsLimited: hasMoreResults,
        upgradeMessage: hasMoreResults 
          ? `Showing ${maxResults} of ${result.pagination.total} results. Upgrade to Premium to see all results.`
          : undefined
      }
    }
    
    res.json(adjustedResult)
  } catch (error) {
    console.error('Semantic search error:', error)
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid request parameters',
        details: error.errors 
      })
    }
    
    res.status(500).json({ error: 'Search failed' })
  }
})

/**
 * Parse a query without searching (for debugging/preview)
 * POST /api/search/parse
 */
const parseSchema = z.object({
  query: z.string().min(1).max(500),
})

router.post('/parse', async (req: Request, res: Response) => {
  try {
    const { query } = parseSchema.parse(req.body)
    
    const intent = await parseSearchIntent(query)
    
    res.json({ intent })
  } catch (error) {
    console.error('Parse error:', error)
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid request parameters',
        details: error.errors 
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
    console.error('Suggestions error:', error)
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid request parameters',
        details: error.errors 
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
    const { query } = parseSchema.parse(req.body)
    
    const intent = await parseSearchIntent(query)
    
    // Convert intent to filter format matching existing search API
    const filters: Record<string, any> = {}
    
    if (intent.calibers?.length) {
      filters.caliber = intent.calibers[0] // Primary caliber for filter UI
      filters.caliberOptions = intent.calibers // All matching calibers
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
    
    res.json({
      filters,
      intent,
      explanation: intent.explanation || generateExplanation(intent),
    })
  } catch (error) {
    console.error('NL to filters error:', error)
    res.status(500).json({ error: 'Conversion failed' })
  }
})

/**
 * Generate human-readable explanation of parsed intent
 */
function generateExplanation(intent: any): string {
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

// ============================================
// Admin Endpoints for Vector Embedding Management
// ============================================

/**
 * Get embedding statistics
 * GET /api/search/admin/embedding-stats
 * 
 * Requires: X-Admin-Key header or authenticated admin user
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
    console.error('Embedding stats error:', error)
    res.status(500).json({ error: 'Failed to get embedding stats' })
  }
})

/**
 * Trigger embedding backfill (async - returns immediately)
 * POST /api/search/admin/backfill-embeddings
 * 
 * Requires: X-Admin-Key header or authenticated admin user
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
  
  // Start backfill in background
  backfillProductEmbeddings({
    batchSize: 50,
    onProgress: (processed, total) => {
      backfillProgress.processed = processed
      backfillProgress.total = total
    }
  }).then(result => {
    backfillProgress.errors = result.errors
    backfillInProgress = false
    console.log('Backfill complete:', result)
  }).catch(error => {
    backfillProgress.errors.push(error.message)
    backfillInProgress = false
    console.error('Backfill failed:', error)
  })
  
  res.json({ 
    message: 'Backfill started',
    status: 'running'
  })
})

/**
 * Get backfill progress
 * GET /api/search/admin/backfill-progress
 * 
 * Requires: X-Admin-Key header or authenticated admin user
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
 * 
 * Requires: X-Admin-Key header or authenticated admin user
 */
router.post('/admin/update-embedding/:productId', requireAdmin, rateLimit({ max: 100, windowMs: 60000 }), async (req: Request, res: Response) => {
  try {
    const { productId } = req.params
    
    await updateProductEmbedding(productId)
    
    res.json({ success: true, productId })
  } catch (error: any) {
    console.error('Update embedding error:', error)
    res.status(500).json({ error: error.message || 'Failed to update embedding' })
  }
})

export { router as searchRouter }
