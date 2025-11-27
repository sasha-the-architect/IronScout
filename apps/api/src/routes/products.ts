import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '@zeroedin/db'

const router = Router()

const searchSchema = z.object({
  q: z.string().min(1),
  category: z.string().optional(),
  brand: z.string().optional(),
  minPrice: z.string().optional(),
  maxPrice: z.string().optional(),
  inStock: z.string().optional(),
  sortBy: z.enum(['price_asc', 'price_desc', 'date_desc', 'date_asc', 'relevance']).default('relevance'),
  page: z.string().default('1'),
  limit: z.string().default('20')
})

router.get('/search', async (req, res) => {
  try {
    const { q, category, brand, minPrice, maxPrice, inStock, sortBy, page, limit } = searchSchema.parse(req.query)

    const pageNum = parseInt(page)
    const limitNum = parseInt(limit)
    const skip = (pageNum - 1) * limitNum

    // Build where clause for search
    const where: any = {
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { brand: { contains: q, mode: 'insensitive' } }
      ]
    }

    // Add category filter if provided
    if (category) {
      where.category = { equals: category, mode: 'insensitive' }
    }

    // Add brand filter if provided
    if (brand) {
      where.brand = { equals: brand, mode: 'insensitive' }
    }

    // Build price filter conditions
    const priceConditions: any = {}
    if (minPrice) priceConditions.price = { gte: parseFloat(minPrice) }
    if (maxPrice) {
      priceConditions.price = priceConditions.price
        ? { ...priceConditions.price, lte: parseFloat(maxPrice) }
        : { lte: parseFloat(maxPrice) }
    }
    if (inStock === 'true') priceConditions.inStock = true

    // Add price/stock filter if any conditions exist
    if (Object.keys(priceConditions).length > 0) {
      where.prices = { some: priceConditions }
    }

    // Get total count
    const total = await prisma.product.count({ where })

    // Determine sort order
    let orderBy: any
    switch (sortBy) {
      case 'price_asc':
      case 'price_desc':
        // For price sorting, we'll sort in memory after fetching
        orderBy = { createdAt: 'desc' }
        break
      case 'date_asc':
        orderBy = { createdAt: 'asc' }
        break
      case 'date_desc':
        orderBy = { createdAt: 'desc' }
        break
      case 'relevance':
      default:
        orderBy = { createdAt: 'desc' }
        break
    }

    // Fetch products with prices and retailers
    let products = await prisma.product.findMany({
      where,
      skip,
      take: limitNum,
      include: {
        prices: {
          include: {
            retailer: true
          },
          orderBy: [
            // Sort by retailer tier (PREMIUM first, then STANDARD)
            { retailer: { tier: 'desc' } },
            // Then by price ascending
            { price: 'asc' }
          ]
        }
      },
      orderBy
    })

    // Apply price sorting if needed (sort by lowest price)
    if (sortBy === 'price_asc' || sortBy === 'price_desc') {
      products = products.sort((a, b) => {
        const aPrice = a.prices[0]?.price || Infinity
        const bPrice = b.prices[0]?.price || Infinity
        const comparison = parseFloat(aPrice.toString()) - parseFloat(bPrice.toString())
        return sortBy === 'price_asc' ? comparison : -comparison
      })
    }

    // Transform to match API response format
    const formattedProducts = products.map(product => ({
      id: product.id,
      name: product.name,
      description: product.description,
      category: product.category,
      brand: product.brand,
      imageUrl: product.imageUrl,
      prices: product.prices.map(price => ({
        id: price.id,
        price: parseFloat(price.price.toString()),
        currency: price.currency,
        url: price.url,
        inStock: price.inStock,
        retailer: {
          id: price.retailer.id,
          name: price.retailer.name,
          tier: price.retailer.tier,
          logoUrl: price.retailer.logoUrl
        }
      }))
    }))

    res.json({
      products: formattedProducts,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    })
  } catch (error) {
    console.error('Search error:', error)
    res.status(400).json({ error: 'Invalid search parameters' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        prices: {
          include: {
            retailer: true
          },
          orderBy: [
            // Sort by retailer tier (PREMIUM first, then STANDARD)
            { retailer: { tier: 'desc' } },
            // Then by price ascending
            { price: 'asc' }
          ]
        }
      }
    })

    if (!product) {
      return res.status(404).json({ error: 'Product not found' })
    }

    // Transform to match API response format
    const formattedProduct = {
      id: product.id,
      name: product.name,
      description: product.description,
      category: product.category,
      brand: product.brand,
      imageUrl: product.imageUrl,
      prices: product.prices.map(price => ({
        id: price.id,
        price: parseFloat(price.price.toString()),
        currency: price.currency,
        url: price.url,
        inStock: price.inStock,
        retailer: {
          id: price.retailer.id,
          name: price.retailer.name,
          tier: price.retailer.tier,
          logoUrl: price.retailer.logoUrl
        }
      }))
    }

    res.json(formattedProduct)
  } catch (error) {
    console.error('Product fetch error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export { router as productsRouter }
