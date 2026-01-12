import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '@ironscout/db'
import { hasPriceHistoryAccess, getPriceHistoryDays, shapePriceHistory } from '../config/tiers'
import { getUserTier } from '../middleware/auth'
import { loggers } from '../config/logger'
import { batchGetPricesViaProductLinks, getPricesViaProductLinks } from '../services/ai-search/price-resolver'

const log = loggers.products

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

router.get('/search', async (req: Request, res: Response) => {
  try {
    const params = searchSchema.parse(req.query)
    const {
      q, category, brand, minPrice, maxPrice, inStock,
      caliber, grainWeight, caseMaterial, purpose, minRounds, maxRounds,
      sortBy, page, limit
    } = params

    // V1: No tier-based result limits
    const pageNum = parseInt(page)
    const limitNum = parseInt(limit)
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

    // Get total count
    const total = await prisma.products.count({ where })

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

    // Fetch products
    // Per Spec v1.2 §0.0: Get prices through product_links
    let rawProducts = await prisma.products.findMany({
      where,
      skip,
      take: limitNum,
      orderBy
    })

    // Batch fetch prices via product_links
    const productIds = rawProducts.map(p => p.id)
    const pricesMap = await batchGetPricesViaProductLinks(productIds)

    // Merge prices into products and apply price/stock filters
    let products = rawProducts.map(p => {
      const prices = pricesMap.get(p.id) || []

      // Apply price/stock filters
      let filteredPrices = prices
      if (inStock === 'true') {
        filteredPrices = filteredPrices.filter((pr: any) => pr.inStock)
      }
      if (minPrice) {
        filteredPrices = filteredPrices.filter((pr: any) => parseFloat(pr.price.toString()) >= parseFloat(minPrice))
      }
      if (maxPrice) {
        filteredPrices = filteredPrices.filter((pr: any) => parseFloat(pr.price.toString()) <= parseFloat(maxPrice))
      }

      // Sort prices by retailer tier, then price
      filteredPrices.sort((a: any, b: any) => {
        const tierOrder: Record<string, number> = { 'PREMIUM': 2, 'STANDARD': 1 }
        const aTier = tierOrder[a.retailers?.tier || 'STANDARD'] || 0
        const bTier = tierOrder[b.retailers?.tier || 'STANDARD'] || 0
        if (aTier !== bTier) return bTier - aTier
        return parseFloat(a.price.toString()) - parseFloat(b.price.toString())
      })

      return { ...p, prices: filteredPrices }
    })

    // Filter out products with no matching prices if price/stock filters were applied
    if (inStock === 'true' || minPrice || maxPrice) {
      products = products.filter(p => p.prices.length > 0)
    }

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
        retailers: {
          id: price.retailers.id,
          name: price.retailers.name,
          tier: price.retailers.tier,
          logoUrl: price.retailers.logoUrl
        }
      }))
    }))

    // Build facets for filtering (show available options with counts)
    const facets: any = {}

    // Get unique values for each filterable field
    const allProducts = await prisma.products.findMany({
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

    // V1: No result limits
    res.json({
      products: formattedProducts,
      facets,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      }
    })
  } catch (error) {
    log.error('Search error', { error }, error as Error)
    res.status(400).json({ error: 'Invalid search parameters' })
  }
})

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    // Per Spec v1.2 §0.0: Get prices through product_links
    const product = await prisma.products.findUnique({
      where: { id }
    })

    if (!product) {
      return res.status(404).json({ error: 'Product not found' })
    }

    // Get prices via product_links
    const prices = await getPricesViaProductLinks(id)

    // Sort by retailer tier desc, then price asc
    const sortedPrices = [...prices].sort((a: any, b: any) => {
      const tierOrder: Record<string, number> = { 'PREMIUM': 2, 'STANDARD': 1 }
      const aTier = tierOrder[a.retailers?.tier || 'STANDARD'] || 0
      const bTier = tierOrder[b.retailers?.tier || 'STANDARD'] || 0
      if (aTier !== bTier) return bTier - aTier
      return parseFloat(a.price.toString()) - parseFloat(b.price.toString())
    })

    // Transform to match API response format
    const formattedProduct = {
      id: product.id,
      name: product.name,
      description: product.description,
      category: product.category,
      brand: product.brand,
      imageUrl: product.imageUrl,
      prices: sortedPrices.map((price: any) => ({
        id: price.id,
        price: parseFloat(price.price.toString()),
        currency: price.currency,
        url: price.url,
        inStock: price.inStock,
        retailers: {
          id: price.retailers?.id,
          name: price.retailers?.name,
          tier: price.retailers?.tier,
          logoUrl: price.retailers?.logoUrl
        }
      }))
    }

    res.json(formattedProduct)
  } catch (error) {
    log.error('Product fetch error', { error }, error as Error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Get price consolidation across all retailers
router.get('/:id/prices', async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    // Per Spec v1.2 §0.0: Get prices through product_links
    const product = await prisma.products.findUnique({
      where: { id }
    })

    if (!product) {
      return res.status(404).json({ error: 'Product not found' })
    }

    // Get prices via product_links
    const prices = await getPricesViaProductLinks(id)

    // Filter to prices from last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const recentPrices = prices.filter((p: any) =>
      p.createdAt && new Date(p.createdAt) >= sevenDaysAgo
    )

    // Get unique latest price for each retailer
    // Sort by createdAt desc first to get latest
    const sortedByDate = [...recentPrices].sort((a: any, b: any) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )

    const pricesByRetailer = new Map()
    for (const price of sortedByDate) {
      if (price.retailers?.id && !pricesByRetailer.has(price.retailers.id)) {
        pricesByRetailer.set(price.retailers.id, price)
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
      prices: sortedPrices.map((price: any) => ({
        retailers: price.retailers?.name,
        retailerId: price.retailers?.id,
        price: parseFloat(price.price.toString()),
        inStock: price.inStock,
        url: price.url,
        tier: price.retailers?.tier,
        lastUpdated: price.createdAt
      })),
      cheapest: cheapest ? {
        retailers: cheapest.retailers?.name,
        price: parseFloat(cheapest.price.toString()),
        inStock: cheapest.inStock,
        url: cheapest.url
      } : null,
      cheapestInStock: cheapestInStock ? {
        retailers: cheapestInStock.retailers?.name,
        price: parseFloat(cheapestInStock.price.toString()),
        url: cheapestInStock.url
      } : null
    })
  } catch (error) {
    log.error('Price consolidation error', { error }, error as Error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Get price history for a product
router.get('/:id/history', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { days = '30', retailerId } = req.query

    // Check user tier for price history access
    const userTier = await getUserTier(req)
    
    if (!hasPriceHistoryAccess(userTier)) {
      return res.status(403).json({
        error: 'Price history unavailable',
        message: 'Price history is not available for this request.',
        tier: userTier,
      })
    }

    // Enforce tier-based day limit
    const maxDays = getPriceHistoryDays(userTier)
    const requestedDays = parseInt(days as string)
    const daysNum = Math.min(requestedDays, maxDays)
    const startDate = new Date(Date.now() - daysNum * 24 * 60 * 60 * 1000)

    // Per Spec v1.2 §0.0: Query through product_links for price history
    let prices: Array<{
      price: any
      createdAt: Date
      retailerId: string
      retailerName: string
      retailerTier: string
    }>

    if (retailerId) {
      prices = await prisma.$queryRaw`
        SELECT pr.price, pr."createdAt", pr."retailerId",
               r.name as "retailerName", r.tier as "retailerTier"
        FROM prices pr
        JOIN product_links pl ON pl."sourceProductId" = pr."sourceProductId"
        JOIN retailers r ON r.id = pr."retailerId"
        WHERE pl."productId" = ${id}
          AND pl.status IN ('MATCHED', 'CREATED')
          AND pr."createdAt" >= ${startDate}
          AND r."visibilityStatus" = 'ELIGIBLE'
          AND pr."retailerId" = ${retailerId as string}
        ORDER BY pr."createdAt" ASC
      `
    } else {
      prices = await prisma.$queryRaw`
        SELECT pr.price, pr."createdAt", pr."retailerId",
               r.name as "retailerName", r.tier as "retailerTier"
        FROM prices pr
        JOIN product_links pl ON pl."sourceProductId" = pr."sourceProductId"
        JOIN retailers r ON r.id = pr."retailerId"
        WHERE pl."productId" = ${id}
          AND pl.status IN ('MATCHED', 'CREATED')
          AND pr."createdAt" >= ${startDate}
          AND r."visibilityStatus" = 'ELIGIBLE'
        ORDER BY pr."createdAt" ASC
      `
    }

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
    const product = await prisma.products.findUnique({
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

    const isLimited = requestedDays > maxDays

    // Shape history based on tier (FREE gets summary only, PREMIUM gets full history)
    const shapedHistory = shapePriceHistory(history, userTier)

    // V1: No tier restrictions on price history
    res.json({
      product,
      ...shapedHistory,
      summary: {
        days: daysNum,
        requestedDays,
        maxDays,
        dataPoints: prices.length,
        lowestPrice: history.length > 0 ? Math.min(...history.map((h: any) => h.minPrice)) : null,
        highestPrice: history.length > 0 ? Math.max(...history.map((h: any) => h.maxPrice)) : null,
        currentPrice: history.length > 0 ? history[history.length - 1].avgPrice : null
      }
    })
  } catch (error) {
    log.error('Price history error', { error }, error as Error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export { router as productsRouter }
