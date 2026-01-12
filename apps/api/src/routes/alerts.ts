/**
 * Alerts Routes (DEPRECATED - ADR-011)
 *
 * This route is deprecated. Use /api/saved-items instead.
 * These endpoints redirect to the new unified Saved Items service.
 *
 * @deprecated Use /api/saved-items endpoints instead
 */

import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { saveItem, getSavedItems } from '../services/saved-items'
import { getAuthenticatedUserId } from '../middleware/auth'
import { loggers } from '../config/logger'

const log = loggers.alerts

const router: any = Router()

const createAlertSchema = z.object({
  productId: z.string(),
  targetPrice: z.number().optional(),
  alertType: z.enum(['PRICE_DROP', 'BACK_IN_STOCK', 'NEW_PRODUCT']).default('PRICE_DROP')
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

    const alertData = createAlertSchema.parse(req.body)

    // Redirect to new saved-items service
    const item = await saveItem(userId, alertData.productId)

    // Return in legacy format for backwards compatibility
    res.status(201).json({
      id: item.id,
      userId,
      productId: item.productId,
      alertType: 'PRICE_DROP',
      isActive: item.notificationsEnabled,
      createdAt: item.savedAt,
      product: {
        id: item.productId,
        name: item.name,
        caliber: item.caliber,
        brand: item.brand,
        imageUrl: item.imageUrl,
      },
      _deprecated: 'This endpoint is deprecated. Use POST /api/saved-items/:productId instead.',
    })
  } catch (error: any) {
    log.error('Create alert error (deprecated)', { error }, error as Error)
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid alert data', details: error.issues })
    }
    if (error.message === 'Product not found') {
      return res.status(404).json({ error: 'Product not found' })
    }
    res.status(500).json({ error: 'Failed to create alert' })
  }
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

    const items = await getSavedItems(userId)

    // Return in legacy format
    const alerts = items.map(item => ({
      id: item.id,
      userId,
      productId: item.productId,
      alertType: 'PRICE_DROP',
      isActive: item.notificationsEnabled,
      createdAt: item.savedAt,
      product: {
        id: item.productId,
        name: item.name,
        caliber: item.caliber,
        brand: item.brand,
        imageUrl: item.imageUrl,
        currentPrice: item.price,
        inStock: item.inStock,
      },
    }))

    // V1: Unlimited alerts for all users
    res.json({
      alerts,
      _meta: {
        activeCount: alerts.length,
        limit: -1, // Unlimited
        canCreateMore: true,
      },
      _deprecated: 'This endpoint is deprecated. Use GET /api/saved-items instead.',
    })
  } catch (error) {
    log.error('Fetch alerts error (deprecated)', { error }, error as Error)
    res.status(500).json({ error: 'Failed to fetch alerts' })
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

export { router as alertsRouter }
