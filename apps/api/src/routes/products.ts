import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '@ironscout/db'
import { TIER_CONFIG, getMaxSearchResults, hasPriceHistoryAccess } from '../config/tiers'

const router: any = Router()

const searchSchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  brand: z.string().optional(),
  minPrice: z.string().optional(),
  maxPrice: z.string().optional(),
  inStock: z.string().optional(),
  // Ammo-specific filters
  caliber: z.string().optional(),
  grainWeight: z.string().optional(),
  caseMaterial: z.string().optional(),
  purpose: z.string().optional(),
  minRounds: z.string().optional(),
  maxRounds: z.string().optional(),
  sortBy: z.enum(['price_asc', 'price_desc', 'date_desc', 'date_asc', 'relevance']).default('relevance'),
  page: z.string().default('1'),
  limit: z.string().default('20')
})

/**
 * Get user tier from request
 * Checks X-User-Id header and looks up user tier
 * Falls back to FREE tier for anonymous users
 */
async function getUserTier(req: Request): Promise<keyof typeof TIER_CONFIG> {
  const userId = req.headers['x-user-id'] as string
  
  if (!userId) {
    return 'FREE'
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { tier: true }
    })
    return (user?.tier as keyof typeof TIER_CONFIG) || 'FREE'
  } catch {
    return 'FREE'
  }
}

router.get('/search', async (req: Request, res: Response) => {
  try {
    const params = searchSchema.parse(req.query)
    const {
      q, category, brand, minPrice, maxPrice, inStock,
      caliber, grainWeight, caseMaterial, purpose, minRounds, maxRounds,
      sortBy, page, limit
    } = params

    // Get user tier for result limiting
    const userTier = await getUserTier(req)
    const maxResults = getMaxSearchResults(userTier)

    const pageNum = parseInt(page)
    const requestedLimit = parseInt(limit)
    
    // Apply tier-based limit
    const limitNum = Math.min(requestedLimit, maxResults)
    const skip = (pageNum - 1) * limitNum

    // Build where clause for search
    const where: any = {}

    // Text search (optional)
    if (q) {
      where.OR = [
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

    // Add ammo-specific filters
    if (caliber) {
      where.caliber = { equals: caliber, mode: 'insensitive' }
    }
    if (grainWeight) {
      where.grainWeight = parseInt(grainWeight)
    }
    if (caseMaterial) {
      where.caseMaterial = { equals: caseMaterial, mode: 'insensitive' }
    }
    if (purpose) {
      where.purpose = { equals: purpose, mode: 'insensitive' }
    }
    if (minRounds || maxRounds) {
      where.roundCount = {}
      if (minRounds) where.roundCount.gte = parseInt(minRounds)
      if (maxRounds) where.roundCount.lte = parseInt(maxRounds)
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
      products = products.sort((a: any, b: any) => {
        const aPrice = a.prices[0]?.price || Infinity
        const bPrice = b.prices[0]?.price || Infinity
        const comparison = parseFloat(aPrice.toString()) - parseFloat(bPrice.toString())
        return sortBy === 'price_asc' ? comparison : -comparison
      })
    }

    // Transform to match API response format
    const formattedProducts = products.map((product: any) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      category: product.category,
      brand: product.brand,
      imageUrl: product.imageUrl,
      // Ammo-specific fields
      upc: product.upc,
      caliber: product.caliber,
      grainWeight: product.grainWeight,
      caseMaterial: product.caseMaterial,
      purpose: product.purpose,
      roundCount: product.roundCount,
      prices: product.prices.map((price: any) => ({
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

    // Build facets for filtering (show available options with counts)
    const facets: any = {}

    // Get unique values for each filterable field
    const allProducts = await prisma.product.findMany({
      where,
      select: {
        caliber: true,
        grainWeight: true,
        caseMaterial: true,
        purpose: true,
        brand: true,
        category: true
      }
    })

    // Count occurrences of each value
    const countValues = (field: keyof typeof allProducts[0]) => {
      const counts = new Map<string, number>()
      allProducts.forEach((p: any) => {
        const value = p[field]
        if (value !== null && value !== undefined) {
          const key = value.toString()
          counts.set(key, (counts.get(key) || 0) + 1)
        }
      })
      return Object.fromEntries(
        Array.from(counts.entries()).sort((a: any, b: any) => b[1] - a[1])
      )
    }

    facets.calibers = countValues('caliber')
    facets.grainWeights = countValues('grainWeight')
    facets.caseMaterials = countValues('caseMaterial')
    facets.purposes = countValues('purpose')
    facets.brands = countValues('brand')
    facets.categories = countValues('category')

    // Calculate if there are more results available (for upgrade prompt)
    const hasMoreResults = total > maxResults && userTier === 'FREE'

    res.json({
      products: formattedProducts,
      facets,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: userTier === 'FREE' ? Math.min(total, maxResults) : total,
        totalPages: Math.ceil(Math.min(total, maxResults) / limitNum),
        actualTotal: total // Always show the real total count
      },
      _meta: {
        tier: userTier,
        maxResults,
        resultsLimited: hasMoreResults,
        upgradeMessage: hasMoreResults 
          ? `Showing ${maxResults} of ${total} results. Upgrade to Premium to see all results.`
          : undefined
      }
    })
  } catch (error) {
    console.error('Search error:', error)
    res.status(400).json({ error: 'Invalid search parameters' })
  }
})

router.get('/:id', async (req: Request, res: Response) => {
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
      prices: product.prices.map((price: any) => ({
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

// Get price consolidation across all retailers
router.get('/:id/prices', async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        prices: {
          where: {
            createdAt: {
              // Get latest price from each retailer (within last 7 days)
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            }
          },
          include: {
            retailer: true
          },
          orderBy: {
            createdAt: 'desc'
          }
        }
      }
    })

    if (!product) {
      return res.status(404).json({ error: 'Product not found' })
    }

    // Get unique latest price for each retailer
    const pricesByRetailer = new Map()
    for (const price of product.prices) {
      if (!pricesByRetailer.has(price.retailerId)) {
        pricesByRetailer.set(price.retailerId, price)
      }
    }

    const uniquePrices = Array.from(pricesByRetailer.values())

    // Sort by price
    const sortedPrices = uniquePrices.sort((a, b) =>
      parseFloat(a.price.toString()) - parseFloat(b.price.toString())
    )

    // Find cheapest overall and cheapest in-stock
    const cheapest = sortedPrices[0]
    const inStockPrices = sortedPrices.filter(p => p.inStock)
    const cheapestInStock = inStockPrices[0]

    res.json({
      product: {
        id: product.id,
        name: product.name,
        description: product.description,
        imageUrl: product.imageUrl,
        category: product.category,
        brand: product.brand,
        // Ammo-specific fields
        upc: product.upc,
        caliber: product.caliber,
        grainWeight: product.grainWeight,
        caseMaterial: product.caseMaterial,
        purpose: product.purpose,
        roundCount: product.roundCount
      },
      prices: sortedPrices.map(price => ({
        retailer: price.retailer.name,
        retailerId: price.retailerId,
        price: parseFloat(price.price.toString()),
        inStock: price.inStock,
        url: price.url,
        tier: price.retailer.tier,
        lastUpdated: price.createdAt
      })),
      cheapest: cheapest ? {
        retailer: cheapest.retailer.name,
        price: parseFloat(cheapest.price.toString()),
        inStock: cheapest.inStock,
        url: cheapest.url
      } : null,
      cheapestInStock: cheapestInStock ? {
        retailer: cheapestInStock.retailer.name,
        price: parseFloat(cheapestInStock.price.toString()),
        url: cheapestInStock.url
      } : null
    })
  } catch (error) {
    console.error('Price consolidation error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Get price history for a product - PREMIUM ONLY
router.get('/:id/history', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { days = '30', retailerId } = req.query

    // Check user tier for price history access
    const userTier = await getUserTier(req)
    
    if (!hasPriceHistoryAccess(userTier)) {
      return res.status(403).json({
        error: 'Premium feature',
        message: 'Price history is only available for Premium subscribers.',
        tier: userTier,
        requiredTier: 'PREMIUM',
        upgradeUrl: '/pricing'
      })
    }

    const daysNum = parseInt(days as string)
    const startDate = new Date(Date.now() - daysNum * 24 * 60 * 60 * 1000)

    // Build where clause
    const where: any = {
      productId: id,
      createdAt: { gte: startDate }
    }

    if (retailerId) {
      where.retailerId = retailerId as string
    }

    const prices = await prisma.price.findMany({
      where,
      include: {
        retailer: {
          select: {
            id: true,
            name: true,
            tier: true
          }
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    })

    // Group by date and calculate daily stats
    const pricesByDate = new Map<string, number[]>()

    prices.forEach((price: any) => {
      const date = price.createdAt.toISOString().split('T')[0]
      if (!pricesByDate.has(date)) {
        pricesByDate.set(date, [])
      }
      pricesByDate.get(date)!.push(parseFloat(price.price.toString()))
    })

    const history = Array.from(pricesByDate.entries()).map(([date, prices]) => ({
      date,
      avgPrice: prices.reduce((a, b) => a + b, 0) / prices.length,
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      dataPoints: prices.length
    }))

    // Get product info
    const product = await prisma.product.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        imageUrl: true,
        category: true,
        brand: true
      }
    })

    if (!product) {
      return res.status(404).json({ error: 'Product not found' })
    }

    res.json({
      product,
      history,
      summary: {
        days: daysNum,
        dataPoints: prices.length,
        lowestPrice: history.length > 0 ? Math.min(...history.map((h: any) => h.minPrice)) : null,
        highestPrice: history.length > 0 ? Math.max(...history.map((h: any) => h.maxPrice)) : null,
        currentPrice: history.length > 0 ? history[history.length - 1].avgPrice : null
      }
    })
  } catch (error) {
    console.error('Price history error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export { router as productsRouter }
