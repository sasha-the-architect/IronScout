import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '@ironscout/db'
import {
  getMaxWatchlistItems,
  hasReachedWatchlistLimit,
  hasFeature,
  UserTier
} from '../config/tiers'
import { getUserTier, getAuthenticatedUserId } from '../middleware/auth'

const router: any = Router()

// ============================================================================
// WATCHLIST CRUD ENDPOINTS
// Free: 5 items max, no collections
// Premium: Unlimited items, collections support
// ============================================================================

const createWatchlistItemSchema = z.object({
  productId: z.string(),
  targetPrice: z.number().optional(),
  collectionId: z.string().optional()
})

const updateWatchlistItemSchema = z.object({
  targetPrice: z.number().optional().nullable(),
  collectionId: z.string().optional().nullable()
})

const createCollectionSchema = z.object({
  name: z.string().min(1).max(50)
})

// ============================================================================
// GET /api/watchlist - Get all watchlist items for authenticated user
// ============================================================================

router.get('/', async (req: Request, res: Response) => {
  try {
    // Get authenticated user from JWT
    const userId = getAuthenticatedUserId(req)
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const userTier = await getUserTier(req)
    const maxItems = getMaxWatchlistItems(userTier)
    const hasCollections = hasFeature(userTier, 'collections')

    const items = await prisma.watchlistItem.findMany({
      where: { userId },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            caliber: true,
            brand: true,
            imageUrl: true,
            roundCount: true,
            grainWeight: true,
            prices: {
              where: { inStock: true },
              orderBy: [{ retailer: { tier: 'desc' } }, { price: 'asc' }],
              take: 1,
              include: {
                retailer: {
                  select: { id: true, name: true, tier: true, logoUrl: true }
                }
              }
            }
          }
        },
        collection: hasCollections
          ? { select: { id: true, name: true } }
          : false
      },
      orderBy: { createdAt: 'desc' }
    })

    // Get collections if user has access
    let collections: any[] = []
    if (hasCollections) {
      collections = await prisma.watchlistCollection.findMany({
        where: { userId },
        include: {
          _count: { select: { items: true } }
        },
        orderBy: { createdAt: 'desc' }
      })
    }

    // Format items with current price and savings info
    const formattedItems = items.map(item => {
      const currentPrice = item.product.prices[0]
        ? parseFloat(item.product.prices[0].price.toString())
        : null

      const targetPrice = item.targetPrice
        ? parseFloat(item.targetPrice.toString())
        : null

      let savingsVsTarget: number | null = null
      if (currentPrice && targetPrice && currentPrice < targetPrice) {
        savingsVsTarget = Math.round((targetPrice - currentPrice) * 100) / 100
      }

      // Check if this is lowest price seen
      let isLowestSeen = false
      if (item.lowestPriceSeen && currentPrice) {
        const lowest = parseFloat(item.lowestPriceSeen.toString())
        isLowestSeen = currentPrice <= lowest
      }

      return {
        id: item.id,
        productId: item.productId,
        targetPrice,
        createdAt: item.createdAt,
        product: {
          ...item.product,
          currentPrice,
          retailer: item.product.prices[0]?.retailer || null,
          inStock: item.product.prices.length > 0 && item.product.prices[0].inStock
        },
        collection: hasCollections ? item.collection : undefined,
        lowestPriceSeen: item.lowestPriceSeen
          ? parseFloat(item.lowestPriceSeen.toString())
          : null,
        lowestPriceSeenAt: item.lowestPriceSeenAt,
        isLowestSeen,
        savingsVsTarget
      }
    })

    res.json({
      items: formattedItems,
      collections: hasCollections ? collections : undefined,
      _meta: {
        tier: userTier,
        itemCount: items.length,
        itemLimit: maxItems,
        canAddMore: maxItems === -1 || items.length < maxItems,
        hasCollections
      }
    })
  } catch (error) {
    console.error('Get watchlist error:', error)
    res.status(500).json({ error: 'Failed to fetch watchlist' })
  }
})

// ============================================================================
// POST /api/watchlist - Add item to watchlist
// ============================================================================

router.post('/', async (req: Request, res: Response) => {
  try {
    // Get authenticated user from JWT
    const userId = getAuthenticatedUserId(req)
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const data = createWatchlistItemSchema.parse(req.body)
    const userTier = await getUserTier(req)
    const hasCollections = hasFeature(userTier, 'collections')

    // Check if product exists
    const product = await prisma.product.findUnique({
      where: { id: data.productId }
    })

    if (!product) {
      return res.status(404).json({ error: 'Product not found' })
    }

    // Check for duplicate
    const existing = await prisma.watchlistItem.findUnique({
      where: {
        userId_productId: {
          userId,
          productId: data.productId
        }
      }
    })

    if (existing) {
      return res.status(409).json({ error: 'Product already in watchlist' })
    }

    // Check tier limit
    const currentCount = await prisma.watchlistItem.count({
      where: { userId }
    })

    if (hasReachedWatchlistLimit(userTier, currentCount)) {
      const limit = getMaxWatchlistItems(userTier)
      return res.status(403).json({
        error: 'Watchlist limit reached',
        message: `Free accounts are limited to ${limit} watchlist items. Upgrade to Premium for unlimited tracking.`,
        currentCount,
        limit,
        tier: userTier
      })
    }

    // If collectionId provided, verify user owns it and has access
    if (data.collectionId) {
      if (!hasCollections) {
        return res.status(403).json({
          error: 'Collections are a Premium feature',
          message: 'Upgrade to Premium to organize your watchlist into collections.'
        })
      }

      const collection = await prisma.watchlistCollection.findFirst({
        where: { id: data.collectionId, userId }
      })

      if (!collection) {
        return res.status(404).json({ error: 'Collection not found' })
      }
    }

    // Get current lowest price for initialization
    const currentPrice = await prisma.price.findFirst({
      where: { productId: data.productId, inStock: true },
      orderBy: { price: 'asc' },
      select: { price: true }
    })

    // Create watchlist item
    const item = await prisma.watchlistItem.create({
      data: {
        userId,
        productId: data.productId,
        targetPrice: data.targetPrice,
        collectionId: hasCollections ? data.collectionId : undefined,
        lowestPriceSeen: currentPrice?.price,
        lowestPriceSeenAt: currentPrice ? new Date() : undefined
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            caliber: true,
            brand: true,
            imageUrl: true
          }
        }
      }
    })

    res.status(201).json({
      item,
      _meta: {
        itemsUsed: currentCount + 1,
        itemsLimit: getMaxWatchlistItems(userTier),
        tier: userTier
      }
    })
  } catch (error) {
    console.error('Create watchlist item error:', error)
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid data', details: error.errors })
    }
    res.status(500).json({ error: 'Failed to add to watchlist' })
  }
})

// ============================================================================
// PUT /api/watchlist/:id - Update watchlist item
// ============================================================================

router.put('/:id', async (req: Request, res: Response) => {
  try {
    // Get authenticated user from JWT
    const userId = getAuthenticatedUserId(req)
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const { id } = req.params
    const data = updateWatchlistItemSchema.parse(req.body)

    // Get existing item
    const existing = await prisma.watchlistItem.findUnique({
      where: { id },
      select: { id: true, userId: true }
    })

    if (!existing) {
      return res.status(404).json({ error: 'Watchlist item not found' })
    }

    // Verify user owns this item
    if (existing.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const userTier = await getUserTier(req)
    const hasCollections = hasFeature(userTier, 'collections')

    // If updating collection, verify access
    if (data.collectionId !== undefined) {
      if (!hasCollections) {
        return res.status(403).json({
          error: 'Collections are a Premium feature'
        })
      }

      if (data.collectionId !== null) {
        const collection = await prisma.watchlistCollection.findFirst({
          where: { id: data.collectionId, userId }
        })

        if (!collection) {
          return res.status(404).json({ error: 'Collection not found' })
        }
      }
    }

    const updated = await prisma.watchlistItem.update({
      where: { id },
      data: {
        ...(data.targetPrice !== undefined && { targetPrice: data.targetPrice }),
        ...(data.collectionId !== undefined && hasCollections && {
          collectionId: data.collectionId
        })
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            caliber: true,
            brand: true,
            imageUrl: true
          }
        }
      }
    })

    res.json(updated)
  } catch (error) {
    console.error('Update watchlist item error:', error)
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid data', details: error.errors })
    }
    res.status(500).json({ error: 'Failed to update watchlist item' })
  }
})

// ============================================================================
// DELETE /api/watchlist/:id - Remove item from watchlist
// ============================================================================

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    // Get authenticated user from JWT
    const userId = getAuthenticatedUserId(req)
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const { id } = req.params

    const existing = await prisma.watchlistItem.findUnique({
      where: { id },
      select: { id: true, userId: true }
    })

    if (!existing) {
      return res.status(404).json({ error: 'Watchlist item not found' })
    }

    // Verify user owns this item
    if (existing.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    await prisma.watchlistItem.delete({ where: { id } })

    res.json({ message: 'Removed from watchlist', id })
  } catch (error) {
    console.error('Delete watchlist item error:', error)
    res.status(500).json({ error: 'Failed to remove from watchlist' })
  }
})

// ============================================================================
// COLLECTIONS ENDPOINTS (Premium only)
// ============================================================================

// GET /api/watchlist/collections
router.get('/collections', async (req: Request, res: Response) => {
  try {
    // Get authenticated user from JWT
    const userId = getAuthenticatedUserId(req)
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const userTier = await getUserTier(req)

    if (!hasFeature(userTier, 'collections')) {
      return res.status(403).json({
        error: 'Collections are a Premium feature',
        message: 'Upgrade to Premium to organize your watchlist into collections like "Home Defense" or "Range Day".'
      })
    }

    const collections = await prisma.watchlistCollection.findMany({
      where: { userId },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                caliber: true,
                imageUrl: true
              }
            }
          }
        },
        _count: { select: { items: true } }
      },
      orderBy: { createdAt: 'desc' }
    })

    res.json({ collections })
  } catch (error) {
    console.error('Get collections error:', error)
    res.status(500).json({ error: 'Failed to fetch collections' })
  }
})

// POST /api/watchlist/collections
router.post('/collections', async (req: Request, res: Response) => {
  try {
    // Get authenticated user from JWT
    const userId = getAuthenticatedUserId(req)
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const data = createCollectionSchema.parse(req.body)
    const userTier = await getUserTier(req)

    if (!hasFeature(userTier, 'collections')) {
      return res.status(403).json({
        error: 'Collections are a Premium feature'
      })
    }

    const collection = await prisma.watchlistCollection.create({
      data: {
        userId,
        name: data.name
      }
    })

    res.status(201).json(collection)
  } catch (error) {
    console.error('Create collection error:', error)
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid data', details: error.errors })
    }
    res.status(500).json({ error: 'Failed to create collection' })
  }
})

// DELETE /api/watchlist/collections/:id
router.delete('/collections/:id', async (req: Request, res: Response) => {
  try {
    // Get authenticated user from JWT
    const userId = getAuthenticatedUserId(req)
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const { id } = req.params

    const existing = await prisma.watchlistCollection.findUnique({
      where: { id },
      select: { id: true, userId: true }
    })

    if (!existing) {
      return res.status(404).json({ error: 'Collection not found' })
    }

    // Verify user owns this collection
    if (existing.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    // Items will have collectionId set to null via onDelete: SetNull
    await prisma.watchlistCollection.delete({ where: { id } })

    res.json({ message: 'Collection deleted', id })
  } catch (error) {
    console.error('Delete collection error:', error)
    res.status(500).json({ error: 'Failed to delete collection' })
  }
})

export { router as watchlistRouter }
