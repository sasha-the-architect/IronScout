/**
 * Merchant Benchmark Calculation Worker
 *
 * Calculates price benchmarks for canonical SKUs based on:
 * 1. Merchant pricing data (PricingSnapshot)
 * 2. IronScout harvester data (Product/Price)
 *
 * Confidence levels:
 * - HIGH: 3+ distinct merchants with fresh data
 * - MEDIUM: 2 merchants or slightly stale data
 * - NONE: 0-1 merchants (no meaningful benchmark)
 */

import { Worker, Job } from 'bullmq'
import { prisma, createProvenance } from '@ironscout/db'
import { redisConnection } from '../config/redis'
import { QUEUE_NAMES, MerchantBenchmarkJobData, merchantInsightQueue } from '../config/queues'
import { logger } from '../config/logger'

const log = logger.merchant

// ============================================================================
// TYPES
// ============================================================================

interface PriceDataPoint {
  price: number
  merchantId: string
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

async function collectMerchantPrices(canonicalSkuId: string): Promise<PriceDataPoint[]> {
  // Get recent pricing snapshots (last 7 days) from active merchants only
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  // First, get merchant IDs with active subscriptions
  const activeMerchants = await prisma.merchants.findMany({
    where: {
      subscriptionStatus: { in: ['ACTIVE', 'EXPIRED'] }, // EXPIRED still in grace period
    },
    select: { id: true },
  })
  const activeMerchantIds = activeMerchants.map(d => d.id)

  // PricingSnapshot doesn't have a merchant relation, so filter by merchantId list
  const snapshots = await prisma.pricing_snapshots.findMany({
    where: {
      canonicalSkuId,
      createdAt: { gte: sevenDaysAgo },
      inStock: true,
      merchantId: { in: activeMerchantIds },
    },
    orderBy: { createdAt: 'desc' },
  })

  // RetailerSku has a retailers relation, so we can use it directly
  const retailerSkus = await prisma.retailer_skus.findMany({
    where: {
      canonicalSkuId,
      isActive: true,
      rawInStock: true,
      retailers: {
        merchant_retailers: {
          some: {
            merchants: {
              subscriptionStatus: { in: ['ACTIVE', 'EXPIRED'] }, // EXPIRED still in grace period
            },
          },
        },
      },
    },
    select: {
      rawPrice: true,
      retailerId: true,
      updatedAt: true,
    },
  })
  
  const prices: PriceDataPoint[] = [
    ...snapshots.map(s => ({
      price: Number(s.price),
      merchantId: s.merchantId,
      createdAt: s.createdAt,
    })),
    ...retailerSkus.map(s => ({
      price: Number(s.rawPrice),
      merchantId: s.retailerId,
      createdAt: s.updatedAt,
    })),
  ]
  
  return prices
}

async function collectHarvesterPrices(canonicalSkuId: string): Promise<PriceDataPoint[]> {
  // Get canonical SKU to find linked Product
  const canonical = await prisma.canonical_skus.findUnique({
    where: { id: canonicalSkuId },
    include: {
      products: {
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

  if (!canonical?.products?.prices) {
    return []
  }

  return canonical.products.prices.map((p: { price: number | { toNumber(): number }; retailerId: string; createdAt: Date }) => ({
    price: Number(p.price),
    merchantId: `harvester_${p.retailerId}`,
    createdAt: p.createdAt,
  }))
}

// ============================================================================
// BENCHMARK CALCULATION
// ============================================================================

async function calculateBenchmark(canonicalSkuId: string): Promise<BenchmarkResult | null> {
  // Collect prices from all sources
  const merchantPrices = await collectMerchantPrices(canonicalSkuId)
  const harvesterPrices = await collectHarvesterPrices(canonicalSkuId)
  
  const allPrices = [...merchantPrices, ...harvesterPrices]
  
  if (allPrices.length === 0) {
    return null
  }
  
  // Get unique sellers
  const uniqueSellers = new Set(allPrices.map(p => p.merchantId))
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
  const hasMerchant = merchantPrices.length > 0
  const hasHarvester = harvesterPrices.length > 0
  const source: 'INTERNAL' | 'EXTERNAL' | 'MIXED' = 
    hasMerchant && hasHarvester ? 'MIXED' :
    hasMerchant ? 'INTERNAL' : 'EXTERNAL'
  
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

async function processBenchmark(job: Job<MerchantBenchmarkJobData>) {
  const { canonicalSkuIds, fullRecalc } = job.data
  
  let skuIds: string[]
  
  if (fullRecalc) {
    // Get all canonical SKUs with at least one retailer SKU
    const skus = await prisma.canonical_skus.findMany({
      where: {
        retailer_skus: {
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
    
    const skus = await prisma.canonical_skus.findMany({
      where: {
        retailer_skus: {
          some: { isActive: true },
        },
        OR: [
          { benchmarks: null },
          { benchmarks: { updatedAt: { lt: twoHoursAgo } } },
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
  const merchantsToNotify = new Set<string>()
  
  for (const skuId of skuIds) {
    try {
      const result = await calculateBenchmark(skuId)
      
      if (!result) {
        skippedCount++
        continue
      }
      
      // Upsert benchmark
      await prisma.benchmarks.upsert({
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
      const retailerSkus = await prisma.retailer_skus.findMany({
        where: {
          canonicalSkuId: skuId,
          isActive: true,
          rawInStock: true,
          // Only create snapshots for merchants with active subscriptions
          retailers: {
            merchant_retailers: {
              some: {
                merchants: {
                  subscriptionStatus: { in: ['ACTIVE', 'EXPIRED'] }, // EXPIRED still in grace period
                },
              },
            },
          },
        },
        select: {
          retailerId: true,
          rawPrice: true,
          rawPackSize: true,
          parsedPackSize: true,
        },
      })
      
      // ADR-015: Create provenance for all snapshots in this batch
      // observedAt is explicitly set (not relying on DB default)
      const benchmarkRunId = `benchmark-${new Date().toISOString().slice(0, 10)}`
      const provenance = createProvenance('MANUAL', benchmarkRunId)

      for (const sku of retailerSkus) {
        const packSize = sku.rawPackSize || sku.parsedPackSize || 1
        const price = Number(sku.rawPrice)

        // Note: retailerId is intentionally NOT set for merchant benchmark snapshots.
        // If retailerId is set in future write paths, use assertPricingSnapshotValid()
        // from @ironscout/db to validate the (retailerId, merchantId) pair.
        await prisma.pricing_snapshots.create({
          data: {
            canonicalSkuId: skuId,
            merchantId: sku.retailerId,
            // retailerId: null - merchant benchmarks have no retailer association
            price,
            pricePerRound: price / packSize,
            packSize,
            inStock: true,
            // ADR-015 provenance via createProvenance() helper
            ...provenance,
          },
        })
        
        merchantsToNotify.add(sku.retailerId)
      }
      
      calculatedCount++

      if (calculatedCount % 50 === 0) {
        log.debug('Processing progress', { processed: calculatedCount, total: skuIds.length })
      }

    } catch (error) {
      log.error('Error processing SKU', { skuId, error: error instanceof Error ? error.message : String(error) }, error instanceof Error ? error : undefined)
    }
  }
  
  // Queue insight generation for affected merchants with idempotent jobIds
  // Use 2-hour time bucket to dedupe insights within same benchmark window
  const insightWindow = new Date()
  insightWindow.setMinutes(0, 0, 0)
  const hours = Math.floor(insightWindow.getHours() / 2) * 2
  insightWindow.setHours(hours)
  // Sanitize timestamp for BullMQ job ID (colons not allowed)
  const insightBucket = insightWindow.toISOString().replace(/:/g, '-')

  for (const merchantId of merchantsToNotify) {
    await merchantInsightQueue.add(
      'generate-insights',
      { merchantId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        // Idempotent: one insight job per merchant per 2-hour window
        jobId: `insight--${merchantId}--${insightBucket}`,
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

export const merchantBenchmarkWorker = new Worker(
  QUEUE_NAMES.MERCHANT_BENCHMARK,
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

merchantBenchmarkWorker.on('completed', (job) => {
  log.info('Job completed', { jobId: job.id })
})

merchantBenchmarkWorker.on('failed', (job, error) => {
  log.error('Job failed', { jobId: job?.id, error: error.message }, error)
})
