import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '@zeroedin/db'

const router = Router()

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
router.post('/', async (req, res) => {
  try {
    const alertData = createAlertSchema.parse(req.body)

    // Verify user and product exist
    const [user, product] = await Promise.all([
      prisma.user.findUnique({ where: { id: alertData.userId } }),
      prisma.product.findUnique({ where: { id: alertData.productId } })
    ])

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
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

    res.status(201).json(alert)
  } catch (error) {
    console.error('Create alert error:', error)
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid alert data', details: error.errors })
    }
    res.status(500).json({ error: 'Failed to create alert' })
  }
})

// Get alerts for a user
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params
    const { activeOnly } = req.query

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

    // Format response with current price info
    const formattedAlerts = alerts.map(alert => ({
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

    res.json(formattedAlerts)
  } catch (error) {
    console.error('Fetch alerts error:', error)
    res.status(500).json({ error: 'Failed to fetch alerts' })
  }
})

// Update alert
router.put('/:id', async (req, res) => {
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
router.delete('/:id', async (req, res) => {
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
