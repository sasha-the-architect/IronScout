import { Router } from 'express'
import { z } from 'zod'

const router = Router()

const placementSchema = z.object({
  position: z.enum(['top', 'middle', 'bottom', 'sidebar']).default('middle'),
  category: z.string().optional(),
  limit: z.string().default('3')
})

router.get('/placement', async (req, res) => {
  try {
    const { position, category, limit } = placementSchema.parse(req.query)
    const limitNum = parseInt(limit)

    const mockAds = [
      {
        id: '1',
        title: 'Premium Electronics Sale',
        description: 'Up to 50% off on premium electronics. Limited time offer!',
        imageUrl: 'https://images.unsplash.com/photo-1510552776732-01acc9a4c1d6?w=400&h=200&fit=crop',
        targetUrl: 'https://example.com/sale/electronics',
        adType: 'DISPLAY',
        priority: 10
      },
      {
        id: '2',
        title: 'Best Deals on Home & Garden',
        description: 'Transform your space with our curated selection',
        imageUrl: 'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?w=400&h=200&fit=crop',
        targetUrl: 'https://example.com/category/home-garden',
        adType: 'SPONSORED_PRODUCT',
        priority: 8
      },
      {
        id: '3',
        title: 'Fashion Forward',
        description: 'Discover the latest trends in fashion',
        imageUrl: 'https://images.unsplash.com/photo-1514996937319-344454492b37?w=400&h=200&fit=crop',
        targetUrl: 'https://example.com/category/fashion',
        adType: 'BANNER',
        priority: 5
      }
    ]

    const ads = mockAds
      .sort((a, b) => b.priority - a.priority)
      .slice(0, limitNum)

    res.json({
      ads,
      placement: position,
      category
    })
  } catch (error) {
    res.status(400).json({ error: 'Invalid placement parameters' })
  }
})

export { router as adsRouter }
