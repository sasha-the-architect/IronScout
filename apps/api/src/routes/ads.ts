import { Router, Request, Response } from 'express'
import { z } from 'zod'

const router: any = Router()

const placeholderAdImage = (label: string) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200" role="img" aria-label="${label}"><rect width="400" height="200" fill="#e5e7eb"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#374151" font-family="Arial, sans-serif" font-size="20">${label}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const placementSchema = z.object({
  position: z.enum(['top', 'middle', 'bottom', 'sidebar']).default('middle'),
  category: z.string().optional(),
  limit: z.string().default('3')
})

router.get('/placement', async (req: Request, res: Response) => {
  try {
    const { position, category, limit } = placementSchema.parse(req.query)
    const limitNum = parseInt(limit)

    const mockAds = [
      {
        id: '1',
        title: 'Premium Electronics Sale',
        description: 'Up to 50% off on premium electronics. Limited time offer!',
        imageUrl: placeholderAdImage('Featured Offer'),
        targetUrl: 'https://example.com/sale/electronics',
        adType: 'DISPLAY',
        priority: 10
      },
      {
        id: '2',
        title: 'Best Deals on Home & Garden',
        description: 'Transform your space with our curated selection',
        imageUrl: placeholderAdImage('Home & Garden'),
        targetUrl: 'https://example.com/category/home-garden',
        adType: 'SPONSORED_PRODUCT',
        priority: 8
      },
      {
        id: '3',
        title: 'Fashion Forward',
        description: 'Discover the latest trends in fashion',
        imageUrl: placeholderAdImage('Style Picks'),
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
