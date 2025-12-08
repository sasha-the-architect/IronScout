/**
 * Best Value Score Service
 * 
 * Calculates a composite "Best Value" score (0-100) for ammunition products.
 * This is a PREMIUM feature that helps users find the best deals based on:
 * - Price vs category average
 * - Shipping cost impact
 * - Retailer reliability
 * - Brand quality tier
 * - Purpose fit
 * 
 * The score answers: "Is this a good deal for what I need?"
 */

import { prisma, Prisma } from '@ironscout/db'
type Decimal = Prisma.Decimal

/**
 * Best Value Score breakdown
 */
export interface BestValueScore {
  score: number           // 0-100 composite score
  grade: 'A' | 'B' | 'C' | 'D' | 'F'  // Letter grade
  factors: {
    priceVsAverage: number      // -50 to +50 (positive = below average)
    shippingValue: number       // 0 to 20
    retailerTrust: number       // 0 to 15
    brandQuality: number        // 0 to 10
    purposeFit: number          // 0 to 15
  }
  summary: string               // Human-readable summary
  details: {
    currentPricePerRound: number
    averagePricePerRound: number
    percentVsAverage: number    // negative = below average (good)
    shippingCost: number | null
    retailerTier: string
    brandTier: string
  }
}

/**
 * Product data needed for Best Value calculation
 */
interface ProductForScoring {
  id: string
  caliber: string | null
  grainWeight: number | null
  brand: string | null
  purpose: string | null
  roundCount: number | null
  bulletType?: string | null
  matchGrade?: boolean | null
  prices: Array<{
    price: Decimal | number
    inStock: boolean
    shippingCost?: Decimal | number | null
    retailer: {
      tier: string
    }
  }>
}

/**
 * Caliber price averages cache
 * Updated periodically (every hour or on-demand)
 */
let priceAveragesCache: Map<string, { avg: number; min: number; max: number; updatedAt: Date }> = new Map()
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

/**
 * Brand quality tiers
 */
const BRAND_TIERS: Record<string, 'budget' | 'mid-tier' | 'premium' | 'match-grade'> = {
  // Budget brands
  'tula': 'budget',
  'wolf': 'budget',
  'barnaul': 'budget',
  'brown bear': 'budget',
  'red army standard': 'budget',
  'steel case': 'budget',
  'monarch': 'budget',
  
  // Mid-tier brands
  'winchester': 'mid-tier',
  'remington': 'mid-tier',
  'pmc': 'mid-tier',
  'magtech': 'mid-tier',
  'fiocchi': 'mid-tier',
  'aguila': 'mid-tier',
  'cci': 'mid-tier',
  'blazer': 'mid-tier',
  'american eagle': 'mid-tier',
  'perfecta': 'mid-tier',
  'sellier & bellot': 'mid-tier',
  's&b': 'mid-tier',
  'prvi partizan': 'mid-tier',
  'ppu': 'mid-tier',
  
  // Premium brands
  'federal': 'premium',
  'federal premium': 'premium',
  'hornady': 'premium',
  'speer': 'premium',
  'speer gold dot': 'premium',
  'barnes': 'premium',
  'nosler': 'premium',
  'sig sauer': 'premium',
  'underwood': 'premium',
  'buffalo bore': 'premium',
  
  // Match-grade brands
  'lapua': 'match-grade',
  'berger': 'match-grade',
  'sierra': 'match-grade',
  'black hills': 'match-grade',
  'federal gold medal': 'match-grade',
  'hornady match': 'match-grade',
  'nosler match': 'match-grade',
}

/**
 * Get brand tier for a product
 */
function getBrandTier(brand: string | null): 'budget' | 'mid-tier' | 'premium' | 'match-grade' | 'unknown' {
  if (!brand) return 'unknown'
  
  const lowerBrand = brand.toLowerCase()
  
  // Check exact matches first
  if (BRAND_TIERS[lowerBrand]) {
    return BRAND_TIERS[lowerBrand]
  }
  
  // Check partial matches
  for (const [key, tier] of Object.entries(BRAND_TIERS)) {
    if (lowerBrand.includes(key) || key.includes(lowerBrand)) {
      return tier
    }
  }
  
  return 'unknown'
}

/**
 * Calculate price per round
 */
function calculatePricePerRound(price: Decimal | number, roundCount: number | null): number {
  const priceNum = typeof price === 'number' ? price : parseFloat(price.toString())
  const rounds = roundCount || 50 // Default assumption
  return priceNum / rounds
}

/**
 * Get average price per round for a caliber
 */
async function getCaliberPriceStats(caliber: string): Promise<{ avg: number; min: number; max: number }> {
  const cacheKey = caliber.toLowerCase()
  const cached = priceAveragesCache.get(cacheKey)
  
  if (cached && (Date.now() - cached.updatedAt.getTime()) < CACHE_TTL_MS) {
    return { avg: cached.avg, min: cached.min, max: cached.max }
  }
  
  // Calculate from database
  const products = await prisma.product.findMany({
    where: {
      caliber: { contains: caliber, mode: 'insensitive' },
      roundCount: { not: null, gt: 0 },
    },
    select: {
      roundCount: true,
      prices: {
        where: { inStock: true },
        select: { price: true },
        take: 1,
        orderBy: { price: 'asc' }
      }
    },
    take: 500 // Sample size
  })
  
  const pricesPerRound = products
    .filter(p => p.prices.length > 0 && p.roundCount)
    .map(p => calculatePricePerRound(p.prices[0].price, p.roundCount))
    .filter(ppr => ppr > 0 && ppr < 10) // Filter outliers
  
  if (pricesPerRound.length === 0) {
    return { avg: 0.50, min: 0.20, max: 2.00 } // Defaults
  }
  
  const avg = pricesPerRound.reduce((a, b) => a + b, 0) / pricesPerRound.length
  const min = Math.min(...pricesPerRound)
  const max = Math.max(...pricesPerRound)
  
  // Cache the result
  priceAveragesCache.set(cacheKey, { avg, min, max, updatedAt: new Date() })
  
  return { avg, min, max }
}

/**
 * Calculate Best Value Score for a product
 */
export async function calculateBestValueScore(
  product: ProductForScoring,
  userPurpose?: string
): Promise<BestValueScore> {
  const factors = {
    priceVsAverage: 0,
    shippingValue: 0,
    retailerTrust: 0,
    brandQuality: 0,
    purposeFit: 0,
  }
  
  // Get the best (lowest) in-stock price
  const inStockPrices = product.prices.filter(p => p.inStock)
  if (inStockPrices.length === 0) {
    return {
      score: 0,
      grade: 'F',
      factors,
      summary: 'Out of stock',
      details: {
        currentPricePerRound: 0,
        averagePricePerRound: 0,
        percentVsAverage: 0,
        shippingCost: null,
        retailerTier: 'unknown',
        brandTier: 'unknown',
      }
    }
  }
  
  const bestPrice = inStockPrices.sort((a, b) => {
    const aPrice = typeof a.price === 'number' ? a.price : parseFloat(a.price.toString())
    const bPrice = typeof b.price === 'number' ? b.price : parseFloat(b.price.toString())
    return aPrice - bPrice
  })[0]
  
  const pricePerRound = calculatePricePerRound(bestPrice.price, product.roundCount)
  
  // =============================================
  // Factor 1: Price vs Average (up to 50 points)
  // =============================================
  let priceStats = { avg: 0.50, min: 0.20, max: 2.00 }
  if (product.caliber) {
    priceStats = await getCaliberPriceStats(product.caliber)
  }
  
  const percentVsAverage = ((pricePerRound - priceStats.avg) / priceStats.avg) * 100
  
  // Score: +50 for 50% below average, 0 for average, -50 for 50% above
  factors.priceVsAverage = Math.max(-50, Math.min(50, -percentVsAverage))
  
  // =============================================
  // Factor 2: Shipping Value (up to 20 points)
  // =============================================
  const shippingCost = bestPrice.shippingCost 
    ? (typeof bestPrice.shippingCost === 'number' ? bestPrice.shippingCost : parseFloat(bestPrice.shippingCost.toString()))
    : null
  
  if (shippingCost === null || shippingCost === 0) {
    factors.shippingValue = 20 // Free shipping bonus
  } else if (shippingCost < 10) {
    factors.shippingValue = 15
  } else if (shippingCost < 20) {
    factors.shippingValue = 10
  } else if (shippingCost < 30) {
    factors.shippingValue = 5
  } else {
    factors.shippingValue = 0
  }
  
  // =============================================
  // Factor 3: Retailer Trust (up to 15 points)
  // =============================================
  if (bestPrice.retailer.tier === 'PREMIUM') {
    factors.retailerTrust = 15
  } else {
    factors.retailerTrust = 8 // Standard retailers still get some points
  }
  
  // =============================================
  // Factor 4: Brand Quality (up to 10 points)
  // =============================================
  const brandTier = getBrandTier(product.brand)
  
  switch (brandTier) {
    case 'match-grade':
      factors.brandQuality = 10
      break
    case 'premium':
      factors.brandQuality = 8
      break
    case 'mid-tier':
      factors.brandQuality = 6
      break
    case 'budget':
      factors.brandQuality = 3
      break
    default:
      factors.brandQuality = 5 // Unknown brands get middle score
  }
  
  // =============================================
  // Factor 5: Purpose Fit (up to 15 points)
  // =============================================
  if (userPurpose && product.purpose) {
    const productPurpose = product.purpose.toLowerCase()
    const targetPurpose = userPurpose.toLowerCase()
    
    if (productPurpose === targetPurpose || productPurpose.includes(targetPurpose)) {
      factors.purposeFit = 15 // Exact match
    } else if (
      (targetPurpose === 'defense' && (productPurpose.includes('defense') || productPurpose.includes('self'))) ||
      (targetPurpose === 'target' && (productPurpose.includes('target') || productPurpose.includes('range')))
    ) {
      factors.purposeFit = 12 // Close match
    } else {
      factors.purposeFit = 5 // Some fit
    }
  } else if (product.bulletType) {
    // Infer purpose fit from bullet type
    const bulletType = product.bulletType.toUpperCase()
    if (userPurpose?.toLowerCase() === 'defense') {
      if (['JHP', 'HP', 'BJHP', 'HST', 'GDHP', 'XTP'].includes(bulletType)) {
        factors.purposeFit = 15
      } else if (bulletType === 'FMJ') {
        factors.purposeFit = 3 // FMJ not ideal for defense
      }
    } else if (userPurpose?.toLowerCase() === 'target') {
      if (['FMJ', 'TMJ', 'BALL'].includes(bulletType)) {
        factors.purposeFit = 15
      }
    }
  } else {
    factors.purposeFit = 8 // Default middle score
  }
  
  // =============================================
  // Calculate Final Score
  // =============================================
  // Base score starts at 50 (average)
  // Factors add or subtract from there
  const rawScore = 50 + 
    factors.priceVsAverage + 
    factors.shippingValue + 
    factors.retailerTrust + 
    factors.brandQuality + 
    factors.purposeFit - 30 // Subtract 30 to normalize (max factors = 60)
  
  const score = Math.max(0, Math.min(100, Math.round(rawScore)))
  
  // =============================================
  // Generate Summary
  // =============================================
  const summaryParts: string[] = []
  
  if (percentVsAverage < -15) {
    summaryParts.push(`${Math.abs(Math.round(percentVsAverage))}% below avg`)
  } else if (percentVsAverage > 15) {
    summaryParts.push(`${Math.round(percentVsAverage)}% above avg`)
  }
  
  if (shippingCost === null || shippingCost === 0) {
    summaryParts.push('free shipping')
  }
  
  if (bestPrice.retailer.tier === 'PREMIUM') {
    summaryParts.push('trusted retailer')
  }
  
  if (brandTier === 'premium' || brandTier === 'match-grade') {
    summaryParts.push('quality brand')
  }
  
  const summary = summaryParts.length > 0 
    ? summaryParts.join(', ')
    : 'Average value'
  
  // =============================================
  // Determine Grade
  // =============================================
  let grade: 'A' | 'B' | 'C' | 'D' | 'F'
  if (score >= 85) grade = 'A'
  else if (score >= 70) grade = 'B'
  else if (score >= 55) grade = 'C'
  else if (score >= 40) grade = 'D'
  else grade = 'F'
  
  return {
    score,
    grade,
    factors,
    summary,
    details: {
      currentPricePerRound: Math.round(pricePerRound * 100) / 100,
      averagePricePerRound: Math.round(priceStats.avg * 100) / 100,
      percentVsAverage: Math.round(percentVsAverage),
      shippingCost,
      retailerTier: bestPrice.retailer.tier,
      brandTier,
    }
  }
}

/**
 * Batch calculate Best Value Scores for multiple products
 */
export async function batchCalculateBestValueScores(
  products: ProductForScoring[],
  userPurpose?: string
): Promise<Map<string, BestValueScore>> {
  const scores = new Map<string, BestValueScore>()
  
  // Process in parallel with limited concurrency
  const BATCH_SIZE = 10
  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE)
    const batchScores = await Promise.all(
      batch.map(p => calculateBestValueScore(p, userPurpose))
    )
    batch.forEach((product, index) => {
      scores.set(product.id, batchScores[index])
    })
  }
  
  return scores
}

/**
 * Clear the price averages cache
 */
export function clearPriceCache(): void {
  priceAveragesCache.clear()
}

/**
 * Pre-warm the cache for common calibers
 */
export async function warmPriceCache(): Promise<void> {
  const commonCalibers = [
    '9mm', '.223', '5.56', '.308', '.45 ACP', 
    '.40 S&W', '.380', '12 Gauge', '.22 LR'
  ]
  
  await Promise.all(commonCalibers.map(cal => getCaliberPriceStats(cal)))
}
