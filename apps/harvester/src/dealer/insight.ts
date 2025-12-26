/**
 * Dealer Insight Generation Worker
 * 
 * Analyzes dealer pricing against market benchmarks to generate actionable insights:
 * - OVERPRICED: Dealer price significantly above market median
 * - UNDERPRICED: Dealer price significantly below market (potential margin opportunity)
 * - STOCK_OPPORTUNITY: High-demand items the dealer doesn't stock
 * - ATTRIBUTE_GAP: Missing data preventing proper benchmarking
 */

import { Worker, Job } from 'bullmq'
import { prisma } from '@ironscout/db'
import { redisConnection } from '../config/redis'
import { QUEUE_NAMES, DealerInsightJobData } from '../config/queues'
import { logger } from '../config/logger'

const log = logger.dealer

// ============================================================================
// TYPES
// ============================================================================

interface InsightCandidate {
  type: 'OVERPRICED' | 'UNDERPRICED' | 'STOCK_OPPORTUNITY' | 'ATTRIBUTE_GAP'
  confidence: 'HIGH' | 'MEDIUM'
  dealerSkuId?: string
  canonicalSkuId?: string
  title: string
  message: string
  dealerPrice?: number
  marketMedian?: number
  marketMin?: number
  marketMax?: number
  sellerCount?: number
  priceDelta?: number
  deltaPercent?: number
  metadata?: Record<string, any>
}

// ============================================================================
// THRESHOLDS
// ============================================================================

const THRESHOLDS = {
  // Price difference thresholds (percentage)
  OVERPRICED_HIGH: 15,     // 15%+ above median = HIGH confidence overpriced
  OVERPRICED_MEDIUM: 8,    // 8-15% above median = MEDIUM confidence
  UNDERPRICED_HIGH: 15,    // 15%+ below median = HIGH confidence underpriced
  UNDERPRICED_MEDIUM: 8,   // 8-15% below median = MEDIUM confidence
  
  // Minimum benchmark requirements
  MIN_SELLERS_HIGH: 3,     // Need 3+ sellers for HIGH confidence
  MIN_SELLERS_MEDIUM: 2,   // Need 2+ sellers for MEDIUM confidence
}

// ============================================================================
// INSIGHT GENERATION
// ============================================================================

async function analyzeDealerSku(
  dealerId: string,
  sku: {
    id: string
    rawTitle: string
    rawPrice: number | { toNumber(): number } | any
    rawInStock: boolean
    canonicalSkuId: string | null
    needsReview: boolean
    mappingConfidence: string
  }
): Promise<InsightCandidate[]> {
  const insights: InsightCandidate[] = []
  const dealerPrice = Number(sku.rawPrice)
  
  // Check for attribute gap (no mapping)
  if (!sku.canonicalSkuId) {
    if (sku.needsReview || sku.mappingConfidence === 'NONE') {
      insights.push({
        type: 'ATTRIBUTE_GAP',
        confidence: 'MEDIUM',
        dealerSkuId: sku.id,
        title: 'Missing Product Data',
        message: `"${truncate(sku.rawTitle, 60)}" cannot be benchmarked due to missing attributes. Review and map this product to enable pricing insights.`,
        dealerPrice,
        metadata: {
          needsReview: sku.needsReview,
          mappingConfidence: sku.mappingConfidence,
        },
      })
    }
    return insights
  }
  
  // Get benchmark for this canonical SKU
  const benchmark = await prisma.benchmark.findUnique({
    where: { canonicalSkuId: sku.canonicalSkuId },
  })
  
  if (!benchmark || benchmark.confidence === 'NONE') {
    // No benchmark available - might be a stock opportunity for others
    return insights
  }
  
  const marketMedian = Number(benchmark.medianPrice)
  const marketMin = Number(benchmark.minPrice)
  const marketMax = Number(benchmark.maxPrice)
  const sellerCount = benchmark.sellerCount
  
  // Calculate price delta
  const priceDelta = dealerPrice - marketMedian
  const deltaPercent = (priceDelta / marketMedian) * 100
  
  // Determine confidence based on seller count
  const hasHighConfidence = sellerCount >= THRESHOLDS.MIN_SELLERS_HIGH && 
                            benchmark.confidence === 'HIGH'
  const hasMediumConfidence = sellerCount >= THRESHOLDS.MIN_SELLERS_MEDIUM
  
  // Check for overpriced
  if (deltaPercent >= THRESHOLDS.OVERPRICED_HIGH && hasHighConfidence) {
    insights.push({
      type: 'OVERPRICED',
      confidence: 'HIGH',
      dealerSkuId: sku.id,
      canonicalSkuId: sku.canonicalSkuId,
      title: 'Price Above Market',
      message: `"${truncate(sku.rawTitle, 50)}" is priced ${deltaPercent.toFixed(1)}% above the market median of $${marketMedian.toFixed(2)}. Consider adjusting to remain competitive.`,
      dealerPrice,
      marketMedian,
      marketMin,
      marketMax,
      sellerCount,
      priceDelta,
      deltaPercent,
    })
  } else if (deltaPercent >= THRESHOLDS.OVERPRICED_MEDIUM && hasMediumConfidence) {
    insights.push({
      type: 'OVERPRICED',
      confidence: 'MEDIUM',
      dealerSkuId: sku.id,
      canonicalSkuId: sku.canonicalSkuId,
      title: 'Price Slightly Above Market',
      message: `"${truncate(sku.rawTitle, 50)}" is priced ${deltaPercent.toFixed(1)}% above the market median. Monitor competitors' pricing.`,
      dealerPrice,
      marketMedian,
      marketMin,
      marketMax,
      sellerCount,
      priceDelta,
      deltaPercent,
    })
  }
  
  // Check for underpriced (potential margin opportunity)
  if (deltaPercent <= -THRESHOLDS.UNDERPRICED_HIGH && hasHighConfidence) {
    insights.push({
      type: 'UNDERPRICED',
      confidence: 'HIGH',
      dealerSkuId: sku.id,
      canonicalSkuId: sku.canonicalSkuId,
      title: 'Price Below Market',
      message: `"${truncate(sku.rawTitle, 50)}" is priced ${Math.abs(deltaPercent).toFixed(1)}% below the market median. You may have room to increase margin.`,
      dealerPrice,
      marketMedian,
      marketMin,
      marketMax,
      sellerCount,
      priceDelta,
      deltaPercent,
    })
  } else if (deltaPercent <= -THRESHOLDS.UNDERPRICED_MEDIUM && hasMediumConfidence) {
    insights.push({
      type: 'UNDERPRICED',
      confidence: 'MEDIUM',
      dealerSkuId: sku.id,
      canonicalSkuId: sku.canonicalSkuId,
      title: 'Price Slightly Below Market',
      message: `"${truncate(sku.rawTitle, 50)}" is priced ${Math.abs(deltaPercent).toFixed(1)}% below the market median. Consider if margin can be improved.`,
      dealerPrice,
      marketMedian,
      marketMin,
      marketMax,
      sellerCount,
      priceDelta,
      deltaPercent,
    })
  }
  
  return insights
}

async function findStockOpportunities(dealerId: string): Promise<InsightCandidate[]> {
  const insights: InsightCandidate[] = []
  
  // Find high-demand canonical SKUs that this dealer doesn't stock
  // "High demand" = many other dealers stock it with good benchmarks
  
  // Get canonical SKUs this dealer currently stocks
  const dealerCanonicalIds = await prisma.dealerSku.findMany({
    where: {
      dealerId,
      isActive: true,
      canonicalSkuId: { not: null },
    },
    select: { canonicalSkuId: true },
  })
  
  const stockedIds = new Set(
    dealerCanonicalIds
      .map(s => s.canonicalSkuId)
      .filter((id): id is string => id !== null)
  )
  
  // Find popular SKUs not stocked by this dealer
  const popularUnstocked = await prisma.canonicalSku.findMany({
    where: {
      id: { notIn: Array.from(stockedIds) },
      benchmark: {
        confidence: { in: ['HIGH', 'MEDIUM'] },
        sellerCount: { gte: 3 },
      },
    },
    include: {
      benchmark: true,
    },
    take: 10, // Limit to top 10 opportunities
    orderBy: {
      benchmark: {
        sellerCount: 'desc',
      },
    },
  })
  
  for (const sku of popularUnstocked) {
    if (!sku.benchmark) continue
    
    insights.push({
      type: 'STOCK_OPPORTUNITY',
      confidence: sku.benchmark.sellerCount >= 5 ? 'HIGH' : 'MEDIUM',
      canonicalSkuId: sku.id,
      title: 'Popular Item Not In Stock',
      message: `${sku.name} is carried by ${sku.benchmark.sellerCount} other dealers. Market price: $${Number(sku.benchmark.minPrice).toFixed(2)} - $${Number(sku.benchmark.maxPrice).toFixed(2)}.`,
      marketMedian: Number(sku.benchmark.medianPrice),
      marketMin: Number(sku.benchmark.minPrice),
      marketMax: Number(sku.benchmark.maxPrice),
      sellerCount: sku.benchmark.sellerCount,
      metadata: {
        caliber: sku.caliber,
        grain: sku.grain,
        brand: sku.brand,
        packSize: sku.packSize,
      },
    })
  }
  
  return insights
}

// ============================================================================
// INSIGHT PERSISTENCE
// ============================================================================

async function saveInsights(
  dealerId: string,
  candidates: InsightCandidate[]
): Promise<number> {
  let savedCount = 0
  
  for (const candidate of candidates) {
    // Check if similar insight already exists and is not dismissed
    const existing = await prisma.dealerInsight.findFirst({
      where: {
        dealerId,
        type: candidate.type,
        dealerSkuId: candidate.dealerSkuId || undefined,
        canonicalSkuId: candidate.canonicalSkuId || undefined,
        isActive: true,
        OR: [
          { dismissedUntil: null },
          { dismissedUntil: { lt: new Date() } },
        ],
      },
    })
    
    if (existing) {
      // Update existing insight
      await prisma.dealerInsight.update({
        where: { id: existing.id },
        data: {
          confidence: candidate.confidence,
          title: candidate.title,
          message: candidate.message,
          dealerPrice: candidate.dealerPrice,
          marketMedian: candidate.marketMedian,
          marketMin: candidate.marketMin,
          marketMax: candidate.marketMax,
          sellerCount: candidate.sellerCount,
          priceDelta: candidate.priceDelta,
          deltaPercent: candidate.deltaPercent,
          metadata: candidate.metadata,
          updatedAt: new Date(),
        },
      })
    } else {
      // Create new insight
      await prisma.dealerInsight.create({
        data: {
          dealerId,
          dealerSkuId: candidate.dealerSkuId,
          canonicalSkuId: candidate.canonicalSkuId,
          type: candidate.type,
          confidence: candidate.confidence,
          title: candidate.title,
          message: candidate.message,
          dealerPrice: candidate.dealerPrice,
          marketMedian: candidate.marketMedian,
          marketMin: candidate.marketMin,
          marketMax: candidate.marketMax,
          sellerCount: candidate.sellerCount,
          priceDelta: candidate.priceDelta,
          deltaPercent: candidate.deltaPercent,
          metadata: candidate.metadata,
          isActive: true,
        },
      })
      savedCount++
    }
  }
  
  return savedCount
}

async function deactivateStaleInsights(
  dealerId: string,
  activeSkuIds: string[]
): Promise<number> {
  // Deactivate insights for SKUs no longer active or no longer matching criteria
  const result = await prisma.dealerInsight.updateMany({
    where: {
      dealerId,
      isActive: true,
      dealerSkuId: { not: null },
      NOT: {
        dealerSkuId: { in: activeSkuIds },
      },
    },
    data: {
      isActive: false,
    },
  })
  
  return result.count
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength - 3) + '...'
}

// ============================================================================
// WORKER
// ============================================================================

async function processInsightGeneration(job: Job<DealerInsightJobData>) {
  const { dealerId, dealerSkuIds } = job.data

  log.info('Generating insights', { dealerId })

  // Check dealer subscription status before generating insights
  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: { subscriptionStatus: true },
  })

  if (!dealer) {
    log.debug('Dealer not found, skipping', { dealerId })
    return { skipped: true, reason: 'dealer_not_found' }
  }

  // Only generate insights for ACTIVE or EXPIRED (grace period) subscriptions
  if (dealer.subscriptionStatus !== 'ACTIVE' && dealer.subscriptionStatus !== 'EXPIRED') {
    log.debug('Dealer subscription inactive, skipping insights', {
      dealerId,
      subscriptionStatus: dealer.subscriptionStatus,
    })
    return { skipped: true, reason: 'subscription_inactive', status: dealer.subscriptionStatus }
  }
  
  // Get dealer SKUs to analyze
  let skus
  if (dealerSkuIds && dealerSkuIds.length > 0) {
    skus = await prisma.dealerSku.findMany({
      where: {
        id: { in: dealerSkuIds },
        dealerId,
        isActive: true,
      },
    })
  } else {
    // Analyze all active SKUs for this dealer
    skus = await prisma.dealerSku.findMany({
      where: {
        dealerId,
        isActive: true,
      },
    })
  }

  log.info('Analyzing SKUs', { count: skus.length })

  const allInsights: InsightCandidate[] = []
  const activeSkuIds: string[] = []
  
  // Analyze each SKU
  for (const sku of skus) {
    activeSkuIds.push(sku.id)
    const skuInsights = await analyzeDealerSku(dealerId, sku)
    allInsights.push(...skuInsights)
  }
  
  // Find stock opportunities
  const stockOpportunities = await findStockOpportunities(dealerId)
  allInsights.push(...stockOpportunities)

  log.info('Generated insight candidates', { count: allInsights.length })

  // Save insights
  const savedCount = await saveInsights(dealerId, allInsights)
  
  // Deactivate stale insights
  const deactivatedCount = await deactivateStaleInsights(dealerId, activeSkuIds)

  log.info('Insight generation completed', {
    savedCount,
    deactivatedCount,
  })

  return {
    analyzedSkus: skus.length,
    generatedInsights: allInsights.length,
    savedInsights: savedCount,
    deactivatedInsights: deactivatedCount,
  }
}

// ============================================================================
// WORKER EXPORT
// ============================================================================

export const dealerInsightWorker = new Worker(
  QUEUE_NAMES.DEALER_INSIGHT,
  processInsightGeneration,
  {
    connection: redisConnection,
    concurrency: 5,
  }
)

dealerInsightWorker.on('completed', (job) => {
  log.info('Job completed', { jobId: job.id })
})

dealerInsightWorker.on('failed', (job, error) => {
  log.error('Job failed', { jobId: job?.id, error: error.message }, error)
})
