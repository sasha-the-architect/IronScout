import { Worker, Job } from 'bullmq'
import { prisma } from '@ironscout/db'
import { redisConnection } from '../config/redis'
import { writeQueue, NormalizeJobData, NormalizedProduct } from '../config/queues'
import { normalizeAmmoProduct } from './ammo-utils'

// Normalizer worker - standardizes extracted data into a common format
export const normalizerWorker = new Worker<NormalizeJobData>(
  'normalize',
  async (job: Job<NormalizeJobData>) => {
    const { executionId, sourceId, rawItems, contentHash } = job.data
    const stageStart = Date.now()

    console.log(`[Normalizer] Normalizing ${rawItems.length} items`)

    try {
      await prisma.executionLog.create({
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

      // Get source info to determine retailer
      const source = await prisma.source.findUnique({
        where: { id: sourceId },
      })

      if (!source) {
        throw new Error(`Source ${sourceId} not found`)
      }

      const normalizedItems: NormalizedProduct[] = []

      for (const rawItem of rawItems) {
        try {
          const normalized = await normalizeItem(rawItem, source)
          if (normalized) {
            normalizedItems.push(normalized)
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error'
          await prisma.executionLog.create({
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

      const normalizeDurationMs = Date.now() - stageStart
      const skippedCount = rawItems.length - normalizedItems.length

      await prisma.executionLog.create({
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
        jobId: `write:${executionId}`, // Idempotent: one write per execution
      })

      await prisma.executionLog.create({
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

      await prisma.executionLog.create({
        data: {
          executionId,
          level: 'ERROR',
          event: 'NORMALIZE_FAIL',
          message: `Normalization failed: ${errorMessage}`,
        },
      })

      await prisma.execution.update({
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
async function normalizeItem(rawItem: any, source: any): Promise<NormalizedProduct | null> {
  // Extract price from various formats
  const price = extractPrice(rawItem.priceText || rawItem.price || '')
  if (!price || price <= 0) {
    return null
  }

  // Extract name
  const name = (rawItem.name || rawItem.title || '').trim()
  if (!name) {
    return null
  }

  // Determine category (basic categorization)
  const category = categorizeProduct(name, rawItem.description || '')

  // Build full URL
  let url = rawItem.url || rawItem.link || ''
  if (url && !url.startsWith('http')) {
    const baseUrl = new URL(source.url).origin
    url = new URL(url, baseUrl).toString()
  }

  // Apply ammo-specific normalization
  const ammoData = normalizeAmmoProduct({
    name,
    upc: rawItem.upc || rawItem.UPC || rawItem.gtin || null,
    brand: rawItem.brand || extractBrand(name) || null,
  })

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
  console.log(`[Normalizer] Job ${job.id} completed`)
})

normalizerWorker.on('failed', (job, err) => {
  console.error(`[Normalizer] Job ${job?.id} failed:`, err.message)
})
