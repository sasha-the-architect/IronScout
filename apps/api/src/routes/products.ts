import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '@zeroedin/db'

const router = Router()

const searchSchema = z.object({
  q: z.string().min(1),
  category: z.string().optional(),
  minPrice: z.string().optional(),
  maxPrice: z.string().optional(),
  page: z.string().default('1'),
  limit: z.string().default('20')
})

router.get('/search', async (req, res) => {
  try {
    const { q, category, minPrice, maxPrice, page, limit } = searchSchema.parse(req.query)
    
    const pageNum = parseInt(page)
    const limitNum = parseInt(limit)
    const skip = (pageNum - 1) * limitNum

    const mockProducts = [
      {
        id: '1',
        name: `${q} - Premium Product`,
        description: 'High-quality product from premium retailer',
        category: category || 'Electronics',
        brand: 'Premium Brand',
        imageUrl: 'https://via.placeholder.com/300x300',
        prices: [{
          id: '1',
          price: 299.99,
          currency: 'USD',
          url: 'https://example.com/product/1',
          inStock: true,
          retailer: {
            id: '1',
            name: 'Premium Electronics',
            tier: 'PREMIUM',
            logoUrl: 'https://via.placeholder.com/100x50'
          }
        }]
      },
      {
        id: '2',
        name: `${q} - Standard Product`,
        description: 'Quality product from standard retailer',
        category: category || 'Electronics',
        brand: 'Standard Brand',
        imageUrl: 'https://via.placeholder.com/300x300',
        prices: [{
          id: '2',
          price: 199.99,
          currency: 'USD',
          url: 'https://example.com/product/2',
          inStock: true,
          retailer: {
            id: '2',
            name: 'Standard Electronics',
            tier: 'STANDARD',
            logoUrl: 'https://via.placeholder.com/100x50'
          }
        }]
      }
    ]

    res.json({
      products: mockProducts,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: mockProducts.length,
        totalPages: Math.ceil(mockProducts.length / limitNum)
      }
    })
  } catch (error) {
    res.status(400).json({ error: 'Invalid search parameters' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params
    
    const mockProduct = {
      id,
      name: 'Sample Product',
      description: 'Detailed product description',
      category: 'Electronics',
      brand: 'Sample Brand',
      imageUrl: 'https://via.placeholder.com/600x400',
      prices: [
        {
          id: '1',
          price: 299.99,
          currency: 'USD',
          url: 'https://example.com/product/' + id,
          inStock: true,
          retailer: {
            id: '1',
            name: 'Premium Electronics',
            tier: 'PREMIUM'
          }
        }
      ]
    }

    res.json(mockProduct)
  } catch (error) {
    res.status(404).json({ error: 'Product not found' })
  }
})

export { router as productsRouter }
