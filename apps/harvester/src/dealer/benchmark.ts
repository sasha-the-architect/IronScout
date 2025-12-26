/**
 * Dealer Benchmark Calculation Worker
 * 
 * Calculates price benchmarks for canonical SKUs based on:
 * 1. Dealer pricing data (PricingSnapshot)
 * 2. IronScout harvester data (Product/Price)
 * 
 * Confidence levels:
 * - HIGH: 3+ distinct dealers with fresh data
 * - MEDIUM: 2 dealers or slightly stale data
 * - NONE: 0-1 dealers (no meaningful benchmark)
 */

import { Worker, Job } from 'bullmq'
import { prisma } from '@ironscout/db'
import { redisConnection } from '../config/redis'
import { QUEUE_NAMES, DealerBenchmarkJobData, dealerInsightQueue } from '../config/queues'
import { logger } from '../config/logger'

const log = logger.dealer

// ============================================================================
// TYPES
// ============================================================================

interface PriceDataPoint {
  price: number
  dealerId: string
  createdAt: Date
}

interface BenchmarkResult {
  canonicalSkuId: string
  minPrice: number
  medianPrice: number
  maxPrice: number
  avgPrice: number
  sellerCount: number
  dataPoints: number
  source: 'INTERNAL' | 'EXTERNAL' | 'MIXED'
  confidence: 'HIGH' | 'MEDIUM' | 'NONE'
}

// ============================================================================
// STATISTICS HELPERS
// ============================================================================

function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0
  
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  
  return sorted[mid]
}

function calculateAverage(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function removeOutliers(values: number[]): number[] {
  if (values.length < 4) return values
  
  const sorted = [...values].sort((a, b) => a - b)
  const q1Index = Math.floor(sorted.length * 0.25)
  const q3Index = Math.floor(sorted.length * 0.75)
  const q1 = sorted[q1Index]
  const q3 = sorted[q3Index]
  const iqr = q3 - q1
  
  const lowerBound = q1 - 1.5 * iqr
  const upperBound = q3 + 1.5 * iqr
  
  return sorted.filter(v => v >= lowerBound && v <= upperBound)
}

// ============================================================================
// DATA COLLECTION
// ============================================================================

async function collectDealerPrices(canonicalSkuId: string): Promise<PriceDataPoint[]> {
  // Get recent pricing snapshots (last 7 days) from active dealers only
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  // First, get dealer IDs with active subscriptions
  const activeDealers = await prisma.dealer.findMany({
    where: {
      subscriptionStatus: { in: ['ACTIVE', 'EXPIRED'] }, // EXPIRED still in grace period
    },
    select: { id: true },
  })
  const activeDealerIds = activeDealers.map(d => d.id)

  // PricingSnapshot doesn't have a dealer relation, so filter by dealerId list
  const snapshots = await prisma.pricingSnapshot.findMany({
    where: {
      canonicalSkuId,
      createdAt: { gte: sevenDaysAgo },
      inStock: true,
      dealerId: { in: activeDealerIds },
    },
    orderBy: { createdAt: 'desc' },
  })

  // DealerSku has a dealer relation, so we can use it directly
  const dealerSkus = await prisma.dealerSku.findMany({
    where: {
      canonicalSkuId,
      isActive: true,
      rawInStock: true,
      dealer: {
        subscriptionStatus: { in: ['ACTIVE', 'EXPIRED'] }, // EXPIRED still in grace period
      },
    },
    select: {
      rawPrice: true,
      dealerId: true,
      updatedAt: true,
    },
  })
  
  const prices: PriceDataPoint[] = [
    ...snapshots.map(s => ({
      price: Number(s.price),
      dealerId: s.dealerId,
      createdAt: s.createdAt,
    })),
    ...dealerSkus.map(s => ({
      price: Number(s.rawPrice),
      dealerId: s.dealerId,
      createdAt: s.updatedAt,
    })),
  ]
  
  return prices
}

async function collectHarvesterPrices(canonicalSkuId: string): Promise<PriceDataPoint[]> {
  // Get canonical SKU to find linked Product
  const canonical = await prisma.canonicalSku.findUnique({
    where: { id: canonicalSkuId },
    include: {
      product: {
        include: {
          prices: {
            where: { inStock: true },
            orderBy: { createdAt: 'desc' },
            take: 50,
          },
        },
      },
    },
  })
  
  if (!canonical?.product?.prices) {
    return []
  }
  
  return canonical.product.prices.map(p => ({
    price: Number(p.price),
    dealerId: `harvester_${p.retailerId}`,
    createdAt: p.createdAt,
  }))
}

// ============================================================================
// BENCHMARK CALCULATION
// ============================================================================

async function calculateBenchmark(canonicalSkuId: string): Promise<BenchmarkResult | null> {
  // Collect prices from all sources
  const dealerPrices = await collectDealerPrices(canonicalSkuId)
  const harvesterPrices = await collectHarvesterPrices(canonicalSkuId)
  
  const allPrices = [...dealerPrices, ...harvesterPrices]
  
  if (allPrices.length === 0) {
    return null
  }
  
  // Get unique sellers
  const uniqueSellers = new Set(allPrices.map(p => p.dealerId))
  const sellerCount = uniqueSellers.size
  
  // Extract price values and remove outliers
  const priceValues = allPrices.map(p => p.price)
  const cleanPrices = removeOutliers(priceValues)
  
  if (cleanPrices.length === 0) {
    return null
  }
  
  // Calculate statistics
  const minPrice = Math.min(...cleanPrices)
  const maxPrice = Math.max(...cleanPrices)
  const medianPrice = calculateMedian(cleanPrices)
  const avgPrice = calculateAverage(cleanPrices)
  
  // Determine data source
  const hasDealer = dealerPrices.length > 0
  const hasHarvester = harvesterPrices.length > 0
  const source: 'INTERNAL' | 'EXTERNAL' | 'MIXED' = 
    hasDealer && hasHarvester ? 'MIXED' :
    hasDealer ? 'INTERNAL' : 'EXTERNAL'
  
  // Determine confidence
  let confidence: 'HIGH' | 'MEDIUM' | 'NONE'
  
  if (sellerCount >= 3 && cleanPrices.length >= 5) {
    confidence = 'HIGH'
  } else if (sellerCount >= 2 || cleanPrices.length >= 3) {
    confidence = 'MEDIUM'
  } else {
    confidence = 'NONE'
  }
  
  return {
    canonicalSkuId,
    minPrice,
    medianPrice,
    maxPrice,
    avgPrice,
    sellerCount,
    dataPoints: cleanPrices.length,
    source,
    confidence,
  }
}

// ============================================================================
// WORKER
// ============================================================================

async function processBenchmark(job: Job<DealerBenchmarkJobData>) {
  const { canonicalSkuIds, fullRecalc } = job.data
  
  let skuIds: string[]
  
  if (fullRecalc) {
    // Get all canonical SKUs with at least one dealer SKU
    const skus = await prisma.canonicalSku.findMany({
      where: {
        dealerSkus: {
          some: { isActive: true },
        },
      },
      select: { id: true },
    })
    skuIds = skus.map(s => s.id)
  } else if (canonicalSkuIds && canonicalSkuIds.length > 0) {
    skuIds = canonicalSkuIds
  } else {
    // Get SKUs that need recalculation (no benchmark or stale)
    const twoHoursAgo = new Date()
    twoHoursAgo.setHours(twoHoursAgo.getHours() - 2)
    
    const skus = await prisma.canonicalSku.findMany({
      where: {
        dealerSkus: {
          some: { isActive: true },
        },
        OR: [
          { benchmark: null },
          { benchmark: { updatedAt: { lt: twoHoursAgo } } },
        ],
      },
      select: { id: true },
      take: 500, // Process in batches
    })
    skuIds = skus.map(s => s.id)
  }

  log.info('Processing canonical SKUs', { count: skuIds.length })

  let calculatedCount = 0
  let skippedCount = 0
  const dealersToNotify = new Set<string>()
  
  for (const skuId of skuIds) {
    try {
      const result = await calculateBenchmark(skuId)
      
      if (!result) {
        skippedCount++
        continue
      }
      
      // Upsert benchmark
      await prisma.benchmark.upsert({
        where: { canonicalSkuId: skuId },
        create: {
          canonicalSkuId: skuId,
          minPrice: result.minPrice,
          medianPrice: result.medianPrice,
          maxPrice: result.maxPrice,
          avgPrice: result.avgPrice,
          sellerCount: result.sellerCount,
          dataPoints: result.dataPoints,
          source: result.source,
          confidence: result.confidence,
        },
        update: {
          minPrice: result.minPrice,
          medianPrice: result.medianPrice,
          maxPrice: result.maxPrice,
          avgPrice: result.avgPrice,
          sellerCount: result.sellerCount,
          dataPoints: result.dataPoints,
          source: result.source,
          confidence: result.confidence,
          updatedAt: new Date(),
        },
      })
      
      // Capture pricing snapshot for history (only from active subscriptions)
      const dealerSkus = await prisma.dealerSku.findMany({
        where: {
          canonicalSkuId: skuId,
          isActive: true,
          rawInStock: true,
          // Only create snapshots for dealers with active subscriptions
          dealer: {
            subscriptionStatus: { in: ['ACTIVE', 'EXPIRED'] }, // EXPIRED still in grace period
          },
        },
        select: {
          dealerId: true,
          rawPrice: true,
          rawPackSize: true,
          parsedPackSize: true,
        },
      })
      
      for (const sku of dealerSkus) {
        const packSize = sku.rawPackSize || sku.parsedPackSize || 1
        const price = Number(sku.rawPrice)
        
        await prisma.pricingSnapshot.create({
          data: {
            canonicalSkuId: skuId,
            dealerId: sku.dealerId,
            price,
            pricePerRound: price / packSize,
            packSize,
            inStock: true,
          },
        })
        
        dealersToNotify.add(sku.dealerId)
      }
      
      calculatedCount++

      if (calculatedCount % 50 === 0) {
        log.debug('Processing progress', { processed: calculatedCount, total: skuIds.length })
      }

    } catch (error) {
      log.error('Error processing SKU', { skuId, error: error instanceof Error ? error.message : String(error) }, error instanceof Error ? error : undefined)
    }
  }
  
  // Queue insight generation for affected dealers with idempotent jobIds
  // Use 2-hour time bucket to dedupe insights within same benchmark window
  const insightWindow = new Date()
  insightWindow.setMinutes(0, 0, 0)
  const hours = Math.floor(insightWindow.getHours() / 2) * 2
  insightWindow.setHours(hours)
  const insightBucket = insightWindow.toISOString()

  for (const dealerId of dealersToNotify) {
    await dealerInsightQueue.add(
      'generate-insights',
      { dealerId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        // Idempotent: one insight job per dealer per 2-hour window
        jobId: `insight:${dealerId}:${insightBucket}`,
      }
    )
  }

  log.info('Benchmark calculation completed', {
    calculatedCount,
    skippedCount,
  })

  return { calculatedCount, skippedCount }
}

// ============================================================================
// WORKER EXPORT
// ============================================================================

export const dealerBenchmarkWorker = new Worker(
  QUEUE_NAMES.DEALER_BENCHMARK,
  processBenchmark,
  {
    connection: redisConnection,
    concurrency: 3,
    settings: {
      // Retry settings for transient failures (DB connection, network issues)
      backoffStrategy: (attemptsMade: number) => {
        // Exponential backoff: 5s, 15s, 45s
        return Math.min(5000 * Math.pow(3, attemptsMade - 1), 60000)
      },
    },
  }
)

dealerBenchmarkWorker.on('completed', (job) => {
  log.info('Job completed', { jobId: job.id })
})

dealerBenchmarkWorker.on('failed', (job, error) => {
  log.error('Job failed', { jobId: job?.id, error: error.message }, error)
})
