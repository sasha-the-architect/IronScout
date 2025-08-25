import { Router } from 'express'
import { z } from 'zod'

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

router.post('/', async (req, res) => {
  try {
    const alertData = createAlertSchema.parse(req.body)
    
    const mockAlert = {
      id: Date.now().toString(),
      ...alertData,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    res.status(201).json(mockAlert)
  } catch (error) {
    res.status(400).json({ error: 'Invalid alert data' })
  }
})

router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params
    
    const mockAlerts = [
      {
        id: '1',
        userId,
        productId: '1',
        targetPrice: 250.00,
        alertType: 'PRICE_DROP',
        isActive: true,
        createdAt: new Date().toISOString(),
        product: {
          id: '1',
          name: 'Sample Product',
          imageUrl: 'https://via.placeholder.com/100x100'
        }
      }
    ]

    res.json(mockAlerts)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch alerts' })
  }
})

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const updateData = updateAlertSchema.parse(req.body)
    
    const mockUpdatedAlert = {
      id,
      ...updateData,
      updatedAt: new Date().toISOString()
    }

    res.json(mockUpdatedAlert)
  } catch (error) {
    res.status(400).json({ error: 'Invalid update data' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params
    
    res.json({ message: 'Alert deleted successfully', id })
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete alert' })
  }
})

export { router as alertsRouter }
