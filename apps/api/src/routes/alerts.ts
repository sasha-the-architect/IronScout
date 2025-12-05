import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '@ironscout/db'
import { TIER_CONFIG, hasReachedAlertLimit } from '../config/tiers'

const router: any = Router()

const createAlertSchema = z.object({
  userId: z.string(),
  productId: z.string(),
  targetPrice: z.number().optional(),
  alertType: z.enum(['PRICE_DROP', 'BACK_IN_STOCK', 'NEW_PRODUCT']).default('PRICE_DROP')
})

const updateAlertSchema = z.object({
  targetPrice: z.number().optional(),
  isActive: z.boolean().optional()
})

// Create new alert
router.post('/', async (req: Request, res: Response) => {
  try {
    const alertData = createAlertSchema.parse(req.body)

    // Verify user exists and get their tier
    const user = await prisma.user.findUnique({ 
      where: { id: alertData.userId },
      select: { id: true, tier: true }
    })

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Verify product exists
    const product = await prisma.product.findUnique({ 
      where: { id: alertData.productId } 
    })

    if (!product) {
      return res.status(404).json({ error: 'Product not found' })
    }

    // Check for duplicate alert
    const existingAlert = await prisma.alert.findFirst({
      where: {
        userId: alertData.userId,
        productId: alertData.productId,
        isActive: true
      }
    })

    if (existingAlert) {
      return res.status(409).json({ error: 'Alert already exists for this product' })
    }

    // Check tier-based alert limit
    const activeAlertCount = await prisma.alert.count({
      where: {
        userId: alertData.userId,
        isActive: true
      }
    })

    const userTier = user.tier as keyof typeof TIER_CONFIG
    const tierConfig = TIER_CONFIG[userTier] || TIER_CONFIG.FREE

    if (hasReachedAlertLimit(userTier, activeAlertCount)) {
      return res.status(403).json({ 
        error: 'Alert limit reached',
        message: `Free accounts are limited to ${tierConfig.maxActiveAlerts} active alerts. Upgrade to Premium for unlimited alerts.`,
        currentCount: activeAlertCount,
        limit: tierConfig.maxActiveAlerts,
        tier: userTier
      })
    }

    // Create alert
    const alert = await prisma.alert.create({
      data: {
        userId: alertData.userId,
        productId: alertData.productId,
        targetPrice: alertData.targetPrice,
        alertType: alertData.alertType,
        isActive: true
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
            category: true,
            brand: true
          }
        }
      }
    })

    res.status(201).json({
      ...alert,
      _meta: {
        alertsUsed: activeAlertCount + 1,
        alertsLimit: tierConfig.maxActiveAlerts,
        tier: userTier
      }
    })
  } catch (error) {
    console.error('Create alert error:', error)
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid alert data', details: error.errors })
    }
    res.status(500).json({ error: 'Failed to create alert' })
  }
})

// Get alerts for a user
router.get('/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params
    const { activeOnly } = req.query

    // Get user tier
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { tier: true }
    })

    const userTier = (user?.tier || 'FREE') as keyof typeof TIER_CONFIG
    const tierConfig = TIER_CONFIG[userTier] || TIER_CONFIG.FREE

    const alerts = await prisma.alert.findMany({
      where: {
        userId,
        ...(activeOnly === 'true' && { isActive: true })
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
            category: true,
            brand: true,
            prices: {
              take: 1,
              orderBy: [
                { retailer: { tier: 'desc' } },
                { price: 'asc' }
              ],
              include: {
                retailer: {
                  select: {
                    id: true,
                    name: true,
                    tier: true,
                    logoUrl: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    // Count active alerts for limit info
    const activeAlertCount = alerts.filter((a: any) => a.isActive).length

    // Format response with current price info
    const formattedAlerts = alerts.map((alert: any) => ({
      id: alert.id,
      userId: alert.userId,
      productId: alert.productId,
      targetPrice: alert.targetPrice ? parseFloat(alert.targetPrice.toString()) : null,
      alertType: alert.alertType,
      isActive: alert.isActive,
      createdAt: alert.createdAt,
      updatedAt: alert.updatedAt,
      product: {
        ...alert.product,
        currentPrice: alert.product.prices[0] ? parseFloat(alert.product.prices[0].price.toString()) : null,
        retailer: alert.product.prices[0]?.retailer || null,
        inStock: alert.product.prices[0]?.inStock || false
      }
    }))

    res.json({
      alerts: formattedAlerts,
      _meta: {
        activeCount: activeAlertCount,
        limit: tierConfig.maxActiveAlerts,
        tier: userTier,
        canCreateMore: activeAlertCount < tierConfig.maxActiveAlerts
      }
    })
  } catch (error) {
    console.error('Fetch alerts error:', error)
    res.status(500).json({ error: 'Failed to fetch alerts' })
  }
})

// Update alert
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const updateData = updateAlertSchema.parse(req.body)

    // Check if alert exists
    const existingAlert = await prisma.alert.findUnique({ where: { id } })
    if (!existingAlert) {
      return res.status(404).json({ error: 'Alert not found' })
    }

    const updatedAlert = await prisma.alert.update({
      where: { id },
      data: {
        ...(updateData.targetPrice !== undefined && { targetPrice: updateData.targetPrice }),
        ...(updateData.isActive !== undefined && { isActive: updateData.isActive })
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
            category: true,
            brand: true
          }
        }
      }
    })

    res.json(updatedAlert)
  } catch (error) {
    console.error('Update alert error:', error)
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid update data', details: error.errors })
    }
    res.status(500).json({ error: 'Failed to update alert' })
  }
})

// Delete alert
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    // Check if alert exists
    const existingAlert = await prisma.alert.findUnique({ where: { id } })
    if (!existingAlert) {
      return res.status(404).json({ error: 'Alert not found' })
    }

    await prisma.alert.delete({ where: { id } })

    res.json({ message: 'Alert deleted successfully', id })
  } catch (error) {
    console.error('Delete alert error:', error)
    res.status(500).json({ error: 'Failed to delete alert' })
  }
})

export { router as alertsRouter }
