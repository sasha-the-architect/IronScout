/**
 * Saved Items Routes (ADR-011 Phase 2)
 *
 * Unified endpoints for the Saved Items concept.
 * Replaces separate /api/watchlist and /api/alerts endpoints.
 *
 * Routes:
 * - GET    /api/saved-items          - List all saved items
 * - POST   /api/saved-items/:productId - Save an item (idempotent)
 * - DELETE /api/saved-items/:productId - Unsave an item
 * - PATCH  /api/saved-items/:productId - Update preferences
 */

import { Router, Request, Response } from 'express'
import { z } from 'zod'
import {
  saveItem,
  unsaveItem,
  getSavedItems,
  getSavedItemByProductId,
  updateSavedItemPrefs,
  countSavedItems,
  getAlertHistory,
} from '../services/saved-items'
import { getAuthenticatedUserId } from '../middleware/auth'
import { loggers } from '../config/logger'

const log = loggers.watchlist

const router: any = Router()

// ============================================================================
// Validation Schemas
// ============================================================================

const updatePrefsSchema = z.object({
  notificationsEnabled: z.boolean().optional(),
  priceDropEnabled: z.boolean().optional(),
  backInStockEnabled: z.boolean().optional(),
  minDropPercent: z.number().int().min(0).max(100).optional(),
  minDropAmount: z.number().min(0).optional(),
  stockAlertCooldownHours: z.number().int().min(1).max(168).optional(),
})

// ============================================================================
// GET /api/saved-items/history - Get alert notification history
// ============================================================================

const historyQuerySchema = z.object({
  limit: z.string().default('50'),
  offset: z.string().default('0'),
})

router.get('/history', async (req: Request, res: Response) => {
  try {
    const userId = getAuthenticatedUserId(req)
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const { limit, offset } = historyQuerySchema.parse(req.query)
    const limitNum = Math.min(parseInt(limit), 100) // Max 100 per request
    const offsetNum = parseInt(offset)

    const { history, total } = await getAlertHistory(userId, limitNum, offsetNum)

    res.json({
      history,
      _meta: {
        total,
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + history.length < total,
      },
    })
  } catch (error) {
    const err = error as Error
    log.error('Get alert history error', { message: err.message }, err)
    res.status(500).json({ error: 'Failed to fetch alert history' })
  }
})

// ============================================================================
// GET /api/saved-items - List all saved items
// ============================================================================

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = getAuthenticatedUserId(req)
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const items = await getSavedItems(userId)

    // V1: Unlimited saved items for all users
    res.json({
      items,
      _meta: {
        itemCount: items.length,
        itemLimit: -1, // Unlimited
        canAddMore: true,
      },
    })
  } catch (error) {
    const err = error as Error
    log.error('Get saved items error', { message: err.message }, err)
    res.status(500).json({
      error: 'Failed to fetch saved items',
      // Include details in dev for debugging
      ...(process.env.NODE_ENV !== 'production' && { details: err.message })
    })
  }
})

// ============================================================================
// POST /api/saved-items/:productId - Save an item (idempotent)
// ============================================================================

router.post('/:productId', async (req: Request, res: Response) => {
  try {
    const userId = getAuthenticatedUserId(req)
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const productId = req.params.productId as string

    // Check if item already exists (for idempotent response)
    const existing = await getSavedItemByProductId(userId, productId)

    // V1: No limits on saved items

    const item = await saveItem(userId, productId)
    const newCount = await countSavedItems(userId)

    res.status(existing ? 200 : 201).json({
      ...item,
      _meta: {
        itemCount: newCount,
        itemLimit: -1, // Unlimited
        canAddMore: true,
        wasExisting: !!existing,
      },
    })
  } catch (error: any) {
    log.error('Save item error', { error }, error as Error)

    if (error.message === 'Product not found') {
      return res.status(404).json({ error: 'Product not found' })
    }

    res.status(500).json({ error: 'Failed to save item' })
  }
})

// ============================================================================
// DELETE /api/saved-items/:productId - Unsave an item
// ============================================================================

router.delete('/:productId', async (req: Request, res: Response) => {
  try {
    const userId = getAuthenticatedUserId(req)
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const productId = req.params.productId as string

    await unsaveItem(userId, productId)

    res.json({ message: 'Item removed', productId })
  } catch (error: any) {
    log.error('Unsave item error', { error }, error as Error)

    if (error.message === 'Item not found') {
      return res.status(404).json({ error: 'Item not found' })
    }

    res.status(500).json({ error: 'Failed to remove item' })
  }
})

// ============================================================================
// PATCH /api/saved-items/:productId - Update preferences
// ============================================================================

router.patch('/:productId', async (req: Request, res: Response) => {
  try {
    const userId = getAuthenticatedUserId(req)
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const productId = req.params.productId as string
    const prefs = updatePrefsSchema.parse(req.body)

    const item = await updateSavedItemPrefs(userId, productId, prefs)

    res.json(item)
  } catch (error: any) {
    log.error('Update prefs error', { error }, error as Error)

    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid data', details: error.issues })
    }

    if (error.message === 'Item not found') {
      return res.status(404).json({ error: 'Item not found' })
    }

    if (error.message?.includes('must be')) {
      return res.status(400).json({ error: error.message })
    }

    res.status(500).json({ error: 'Failed to update preferences' })
  }
})

// ============================================================================
// GET /api/saved-items/:productId - Get single item (optional, for checking status)
// ============================================================================

router.get('/:productId', async (req: Request, res: Response) => {
  try {
    const userId = getAuthenticatedUserId(req)
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const productId = req.params.productId as string
    const item = await getSavedItemByProductId(userId, productId)

    if (!item) {
      return res.status(404).json({ error: 'Item not saved', isSaved: false })
    }

    res.json({ ...item, isSaved: true })
  } catch (error) {
    log.error('Get saved item error', { error }, error as Error)
    res.status(500).json({ error: 'Failed to fetch item' })
  }
})

export { router as savedItemsRouter }
