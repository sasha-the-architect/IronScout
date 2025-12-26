/**
 * Watchlist Routes (DEPRECATED - ADR-011)
 *
 * This route is deprecated. Use /api/saved-items instead.
 * These endpoints redirect to the new unified Saved Items service.
 *
 * @deprecated Use /api/saved-items endpoints instead
 */

import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '@ironscout/db'
import { saveItem, unsaveItem, getSavedItems, countSavedItems } from '../services/saved-items'
import { getUserTier, getAuthenticatedUserId } from '../middleware/auth'
import { getMaxWatchlistItems, hasReachedWatchlistLimit, hasFeature } from '../config/tiers'
import { loggers } from '../config/logger'

const log = loggers.watchlist

const router: any = Router()

const createWatchlistItemSchema = z.object({
  productId: z.string(),
  targetPrice: z.number().optional(),
  collectionId: z.string().optional()
})

/**
 * @deprecated Use GET /api/saved-items instead
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = getAuthenticatedUserId(req)
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const userTier = await getUserTier(req)
    const maxItems = getMaxWatchlistItems(userTier)
    const hasCollections = hasFeature(userTier, 'collections')

    const items = await getSavedItems(userId)

    // Return in legacy format
    const formattedItems = items.map(item => ({
      id: item.id,
      productId: item.productId,
      targetPrice: null, // Deprecated field
      createdAt: item.savedAt,
      product: {
        id: item.productId,
        name: item.name,
        caliber: item.caliber,
        brand: item.brand,
        imageUrl: item.imageUrl,
        currentPrice: item.price,
        retailer: null,
        inStock: item.inStock,
      },
      collection: null,
      lowestPriceSeen: null,
      lowestPriceSeenAt: null,
      isLowestSeen: false,
      savingsVsTarget: null,
    }))

    res.json({
      items: formattedItems,
      collections: hasCollections ? [] : undefined,
      _meta: {
        tier: userTier,
        itemCount: items.length,
        itemLimit: maxItems,
        canAddMore: maxItems === -1 || items.length < maxItems,
        hasCollections,
      },
      _deprecated: 'This endpoint is deprecated. Use GET /api/saved-items instead.',
    })
  } catch (error) {
    log.error('Get watchlist error (deprecated)', { error }, error as Error)
    res.status(500).json({ error: 'Failed to fetch watchlist' })
  }
})

/**
 * @deprecated Use POST /api/saved-items/:productId instead
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = getAuthenticatedUserId(req)
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const data = createWatchlistItemSchema.parse(req.body)
    const userTier = await getUserTier(req)

    // Check tier limit
    const currentCount = await countSavedItems(userId)
    if (hasReachedWatchlistLimit(userTier, currentCount)) {
      const limit = getMaxWatchlistItems(userTier)
      return res.status(403).json({
        error: 'Watchlist limit reached',
        message: `Free accounts are limited to ${limit} watchlist items. Upgrade to Premium for unlimited tracking.`,
        currentCount,
        limit,
        tier: userTier,
      })
    }

    const item = await saveItem(userId, data.productId)

    res.status(201).json({
      item: {
        id: item.id,
        productId: item.productId,
        product: {
          id: item.productId,
          name: item.name,
          caliber: item.caliber,
          brand: item.brand,
          imageUrl: item.imageUrl,
        },
      },
      _meta: {
        itemsUsed: currentCount + 1,
        itemsLimit: getMaxWatchlistItems(userTier),
        tier: userTier,
      },
      _deprecated: 'This endpoint is deprecated. Use POST /api/saved-items/:productId instead.',
    })
  } catch (error: any) {
    log.error('Create watchlist item error (deprecated)', { error }, error as Error)
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid data', details: error.errors })
    }
    if (error.message === 'Product not found') {
      return res.status(404).json({ error: 'Product not found' })
    }
    res.status(500).json({ error: 'Failed to add to watchlist' })
  }
})

/**
 * @deprecated Use PATCH /api/saved-items/:productId instead
 */
router.put('/:id', async (req: Request, res: Response) => {
  res.status(410).json({
    error: 'This endpoint is deprecated',
    message: 'Use PATCH /api/saved-items/:productId instead',
  })
})

/**
 * @deprecated Use DELETE /api/saved-items/:productId instead
 */
router.delete('/:id', async (req: Request, res: Response) => {
  res.status(410).json({
    error: 'This endpoint is deprecated',
    message: 'Use DELETE /api/saved-items/:productId instead',
  })
})

// ============================================================================
// COLLECTIONS ENDPOINTS (Premium only) - Still deprecated
// ============================================================================

router.get('/collections', async (req: Request, res: Response) => {
  res.status(410).json({
    error: 'Collections feature is deprecated',
    message: 'Collections have been removed in the new Saved Items system.',
  })
})

router.post('/collections', async (req: Request, res: Response) => {
  res.status(410).json({
    error: 'Collections feature is deprecated',
    message: 'Collections have been removed in the new Saved Items system.',
  })
})

router.delete('/collections/:id', async (req: Request, res: Response) => {
  res.status(410).json({
    error: 'Collections feature is deprecated',
    message: 'Collections have been removed in the new Saved Items system.',
  })
})

export { router as watchlistRouter }
