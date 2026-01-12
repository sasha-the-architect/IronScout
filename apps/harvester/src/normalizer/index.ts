import { Worker, Job } from 'bullmq'
import { prisma } from '@ironscout/db'
import { redisConnection } from '../config/redis'
import { logger } from '../config/logger'
import { writeQueue, NormalizeJobData, NormalizedProduct } from '../config/queues'
import { normalizeAmmoProduct } from './ammo-utils'

const log = logger.normalizer

// Normalizer worker - standardizes extracted data into a common format
export const normalizerWorker = new Worker<NormalizeJobData>(
  'normalize',
  async (job: Job<NormalizeJobData>) => {
    const { executionId, sourceId, rawItems, contentHash } = job.data
    const stageStart = Date.now()

    // Create run-scoped logger with correlation IDs
    const runLog = log.child({ executionId, sourceId, jobId: job.id })

    runLog.debug('NORMALIZE_JOB_RECEIVED', {
      itemCount: rawItems.length,
      contentHashPrefix: contentHash?.slice(0, 16),
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts?.attempts ?? 3,
      timestamp: new Date().toISOString(),
    })

    try {
      // Get source info to determine retailer (moved up for logging context)
      runLog.debug('NORMALIZE_LOADING_SOURCE', { phase: 'init' })
      const sourceLoadStart = Date.now()
      const source = await prisma.sources.findUnique({
        where: { id: sourceId },
        include: { retailers: { select: { name: true } } },
      })

      if (!source) {
        runLog.error('NORMALIZE_SOURCE_NOT_FOUND', {
          phase: 'init',
          reason: 'Source record does not exist in database',
        })
        throw new Error(`Source ${sourceId} not found`)
      }

      const sourceName = source.name
      const retailerName = source.retailers?.name
      const sourceLoadDurationMs = Date.now() - sourceLoadStart

      runLog.debug('NORMALIZE_SOURCE_LOADED', {
        phase: 'init',
        sourceName,
        retailerName,
        sourceLoadDurationMs,
        sourceUrl: source.url?.slice(0, 100),
      })

      runLog.info('NORMALIZE_START', {
        phase: 'normalize',
        sourceName,
        retailerName,
        itemCount: rawItems.length,
      })

      await prisma.execution_logs.create({
        data: {
          executionId,
          level: 'INFO',
          event: 'NORMALIZE_START',
          message: `Starting normalization of ${rawItems.length} items`,
          metadata: {
            sourceId,
            itemCount: rawItems.length,
          },
        },
      })

      const normalizedItems: NormalizedProduct[] = []

      // Track normalization statistics
      const stats = {
        totalItems: rawItems.length,
        normalized: 0,
        skippedNoPrice: 0,
        skippedNoName: 0,
        errored: 0,
        categories: {} as Record<string, number>,
        brands: {} as Record<string, number>,
      }

      runLog.debug('NORMALIZE_LOOP_START', {
        phase: 'normalize',
        totalItems: rawItems.length,
      })

      for (let i = 0; i < rawItems.length; i++) {
        const rawItem = rawItems[i]
        try {
          const normalized = await normalizeItem(rawItem, source, runLog, i)
          if (normalized) {
            normalizedItems.push(normalized)
            stats.normalized++

            // Track category distribution
            stats.categories[normalized.category] = (stats.categories[normalized.category] || 0) + 1

            // Track brand distribution (top brands only)
            if (normalized.brand) {
              stats.brands[normalized.brand] = (stats.brands[normalized.brand] || 0) + 1
            }
          } else {
            // Item was skipped (no price or no name)
            const hasPrice = !!(rawItem.priceText || rawItem.price)
            const hasName = !!(rawItem.name || rawItem.title)
            if (!hasPrice) stats.skippedNoPrice++
            if (!hasName) stats.skippedNoName++
          }
        } catch (error) {
          stats.errored++
          const errorMsg = error instanceof Error ? error.message : 'Unknown error'
          runLog.warn('NORMALIZE_ITEM_ERROR', {
            phase: 'normalize',
            itemIndex: i,
            errorMessage: errorMsg,
            rawItemPreview: JSON.stringify(rawItem).slice(0, 200),
          })
          await prisma.execution_logs.create({
            data: {
              executionId,
              level: 'WARN',
              event: 'NORMALIZE_ITEM_FAIL',
              message: `Failed to normalize item: ${errorMsg}`,
              metadata: { rawItem },
            },
          })
        }
      }

      // Log normalization summary statistics
      runLog.debug('NORMALIZE_STATS', {
        phase: 'normalize',
        stats: {
          ...stats,
          // Limit brand list to top 10
          brands: Object.fromEntries(
            Object.entries(stats.brands)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 10)
          ),
        },
        successRate: rawItems.length > 0 ? ((stats.normalized / rawItems.length) * 100).toFixed(1) + '%' : 'N/A',
      })

      const normalizeDurationMs = Date.now() - stageStart
      const skippedCount = rawItems.length - normalizedItems.length

      await prisma.execution_logs.create({
        data: {
          executionId,
          level: 'INFO',
          event: 'NORMALIZE_OK',
          message: `Normalized ${normalizedItems.length}/${rawItems.length} items`,
          metadata: {
            // Timing
            durationMs: normalizeDurationMs,
            // Counters
            itemsInput: rawItems.length,
            itemsNormalized: normalizedItems.length,
            itemsSkipped: skippedCount,
            // Context
            sourceId,
          },
        },
      })

      // Queue write job with idempotent jobId
      await writeQueue.add('write', {
        executionId,
        sourceId,
        normalizedItems,
        contentHash, // Pass hash to be stored after successful write
      }, {
        jobId: `write_${executionId}`, // Idempotent: one write per execution
      })

      await prisma.execution_logs.create({
        data: {
          executionId,
          level: 'INFO',
          event: 'WRITE_QUEUED',
          message: 'Write job queued',
        },
      })

      return { success: true, normalizedCount: normalizedItems.length }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      await prisma.execution_logs.create({
        data: {
          executionId,
          level: 'ERROR',
          event: 'NORMALIZE_FAIL',
          message: `Normalization failed: ${errorMessage}`,
        },
      })

      await prisma.executions.update({
        where: { id: executionId },
        data: {
          status: 'FAILED',
          errorMessage: `Normalize failed: ${errorMessage}`,
          completedAt: new Date(),
        },
      })

      throw error
    }
  },
  {
    connection: redisConnection,
    concurrency: 3,
  }
)

// Normalize a single item
async function normalizeItem(
  rawItem: any,
  source: any,
  runLog: typeof log,
  itemIndex: number
): Promise<NormalizedProduct | null> {
  // Extract price from various formats
  const rawPriceValue = rawItem.priceText || rawItem.price || ''
  const price = extractPrice(rawPriceValue)

  if (!price || price <= 0) {
    // Log at DEBUG level for normal validation failures (not errors)
    if (itemIndex < 5 || itemIndex % 100 === 0) {
      // Only log first 5 and every 100th to avoid log spam
      runLog.debug('NORMALIZE_ITEM_SKIP_PRICE', {
        phase: 'normalize',
        itemIndex,
        reason: 'invalid_or_missing_price',
        rawPriceValue: String(rawPriceValue).slice(0, 50),
        extractedPrice: price,
      })
    }
    return null
  }

  // Extract name
  const name = (rawItem.name || rawItem.title || '').trim()
  if (!name) {
    if (itemIndex < 5 || itemIndex % 100 === 0) {
      runLog.debug('NORMALIZE_ITEM_SKIP_NAME', {
        phase: 'normalize',
        itemIndex,
        reason: 'missing_name',
        availableFields: Object.keys(rawItem).slice(0, 10),
      })
    }
    return null
  }

  // Determine category (basic categorization)
  const category = categorizeProduct(name, rawItem.description || '')

  // Build full URL
  let url = rawItem.url || rawItem.link || ''
  let urlNormalized = false
  if (url && !url.startsWith('http')) {
    const baseUrl = new URL(source.url).origin
    url = new URL(url, baseUrl).toString()
    urlNormalized = true
  }

  // Apply ammo-specific normalization
  const ammoData = normalizeAmmoProduct({
    name,
    upc: rawItem.upc || rawItem.UPC || rawItem.gtin || null,
    brand: rawItem.brand || extractBrand(name) || null,
  })

  // Log detailed normalization for first few items (helps debug format issues)
  if (itemIndex < 3) {
    runLog.debug('NORMALIZE_ITEM_DETAIL', {
      phase: 'normalize',
      itemIndex,
      inputFields: Object.keys(rawItem),
      extractedPrice: price,
      extractedName: name.slice(0, 50),
      category,
      urlNormalized,
      ammoDetected: !!(ammoData.caliber || ammoData.grainWeight),
      productIdType: ammoData.upc ? 'upc' : 'hash',
    })
  }

  return {
    name,
    description: (rawItem.description || '').trim() || undefined,
    category,
    brand: ammoData.brand || undefined,
    imageUrl: rawItem.imageUrl || rawItem.image || undefined,
    price,
    currency: 'USD', // Default to USD, could be extracted from source
    url: url || source.url,
    inStock: rawItem.inStock !== false, // Default to true unless explicitly false
    retailerName: source.name,
    retailerWebsite: new URL(source.url).origin,

    // Ammo-specific normalized fields
    upc: ammoData.upc || undefined,
    caliber: ammoData.caliber || undefined,
    grainWeight: ammoData.grainWeight || undefined,
    caseMaterial: ammoData.caseMaterial || undefined,
    purpose: ammoData.purpose || undefined,
    roundCount: ammoData.roundCount || undefined,
    productId: ammoData.productId, // Canonical product ID (UPC or hash)
  }
}

// Extract numeric price from text or number
function extractPrice(priceText: string | number): number | null {
  // If already a number, return it
  if (typeof priceText === 'number') {
    return priceText > 0 ? priceText : null
  }

  // Remove currency symbols and common formatting
  const cleaned = priceText.replace(/[$£€¥,]/g, '').trim()
  const match = cleaned.match(/\d+\.?\d*/)
  if (match) {
    return parseFloat(match[0])
  }
  return null
}

// Basic brand extraction from product name
function extractBrand(name: string): string | null {
  // Common brand patterns (first word, or word in caps)
  const words = name.split(' ')
  if (words.length > 0) {
    return words[0]
  }
  return null
}

// Basic product categorization
function categorizeProduct(name: string, description: string): string {
  const text = `${name} ${description}`.toLowerCase()

  if (
    text.includes('laptop') ||
    text.includes('computer') ||
    text.includes('monitor') ||
    text.includes('keyboard') ||
    text.includes('mouse')
  ) {
    return 'Electronics'
  }

  if (text.includes('phone') || text.includes('smartphone') || text.includes('mobile')) {
    return 'Electronics'
  }

  if (text.includes('watch') || text.includes('smartwatch')) {
    return 'Electronics'
  }

  if (
    text.includes('furniture') ||
    text.includes('chair') ||
    text.includes('desk') ||
    text.includes('table')
  ) {
    return 'Home'
  }

  if (text.includes('clothing') || text.includes('shirt') || text.includes('pants')) {
    return 'Fashion'
  }

  if (
    text.includes('sport') ||
    text.includes('fitness') ||
    text.includes('gym') ||
    text.includes('bike')
  ) {
    return 'Sports'
  }

  return 'General'
}

normalizerWorker.on('completed', (job) => {
  log.info('NORMALIZE_JOB_COMPLETED', {
    jobId: job.id,
    executionId: job.data?.executionId,
    sourceId: job.data?.sourceId,
    returnValue: job.returnvalue,
    attemptsMade: job.attemptsMade,
    processingDurationMs: job.processedOn ? Date.now() - job.processedOn : null,
    totalDurationMs: job.finishedOn && job.timestamp ? job.finishedOn - job.timestamp : null,
  })
})

normalizerWorker.on('failed', (job, err) => {
  log.error('NORMALIZE_JOB_FAILED', {
    jobId: job?.id,
    executionId: job?.data?.executionId,
    sourceId: job?.data?.sourceId,
    errorName: err.name,
    errorMessage: err.message,
    errorStack: err.stack?.slice(0, 500),
    attemptsMade: job?.attemptsMade,
    maxAttempts: job?.opts?.attempts ?? 3,
    willRetry: (job?.attemptsMade ?? 0) < (job?.opts?.attempts ?? 3),
  }, err)
})
