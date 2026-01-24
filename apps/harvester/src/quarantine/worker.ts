/**
 * Quarantine Reprocess Worker
 *
 * Processes quarantined records that admin has marked for reprocessing.
 * This is used after logic/matcher/resolver updates to re-validate
 * previously failed records.
 *
 * Flow:
 * 1. Fetch quarantine record
 * 2. Validate rawData against current validation rules
 * 3. If valid: create source_product, write price, enqueue for resolver
 * 4. Update quarantine status based on outcome
 */

import { Worker, Job } from 'bullmq'
import { prisma } from '@ironscout/db'
import { createId } from '@paralleldrive/cuid2'
import { createHash } from 'crypto'
import { redisConnection } from '../config/redis'
import {
  QUEUE_NAMES,
  QuarantineReprocessJobData,
  quarantineReprocessQueue,
  enqueueProductResolve,
} from '../config/queues'
import { RESOLVER_VERSION } from '../resolver'
import { logger } from '../config/logger'

const log = logger.quarantine

// Metrics (per worker lifetime)
let processedCount = 0
let resolvedCount = 0
let stillQuarantinedCount = 0
let errorCount = 0

// Batch tracking for progress logging
let currentBatchId: string | null = null
let batchProcessedCount = 0
let batchResolvedCount = 0
let batchStillQuarantinedCount = 0
const PROGRESS_LOG_INTERVAL = 10 // Log progress every N jobs

/**
 * Quarantine Reprocess Worker instance
 */
export let quarantineReprocessWorker: Worker<QuarantineReprocessJobData> | null = null

/**
 * Raw data structure stored in quarantined records (affiliate feed)
 */
interface AffiliateRawData {
  name?: string
  url?: string
  price?: number
  inStock?: boolean
  brand?: string
  sku?: string
  upc?: string
  impactItemId?: string
  grainWeight?: number
  roundCount?: number
  caliber?: string
  imageUrl?: string
  currency?: string
  originalPrice?: number
}

/**
 * Compute URL hash for identity key (consistent with affiliate processor)
 */
function computeUrlHash(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 16)
}

/**
 * Compute price signature hash
 */
function computePriceSignature(price: number, currency: string, originalPrice?: number | null): string {
  const signatureData = JSON.stringify({
    price,
    currency: currency || 'USD',
    originalPrice,
  })
  return createHash('sha256').update(signatureData).digest('hex')
}

/**
 * Validate affiliate raw data for reprocessing
 * Returns validation errors or empty array if valid
 */
function validateAffiliateRawData(rawData: AffiliateRawData): Array<{ code: string; message: string }> {
  const errors: Array<{ code: string; message: string }> = []

  // Must have URL
  if (!rawData.url) {
    errors.push({ code: 'MISSING_URL', message: 'Product is missing URL' })
  }

  // Must have price
  if (typeof rawData.price !== 'number' || rawData.price <= 0) {
    errors.push({ code: 'INVALID_PRICE', message: 'Product has invalid or missing price' })
  }

  // Must have caliber (trust-critical field)
  if (!rawData.caliber) {
    errors.push({ code: 'MISSING_CALIBER', message: 'Product is missing caliber field' })
  }

  return errors
}

/**
 * Process a single affiliate quarantine record
 */
async function processAffiliateRecord(
  record: {
    id: string
    feedId: string
    runId: string | null
    sourceId: string | null
    rawData: unknown
    matchKey: string
  },
  batchId: string,
  triggeredBy: string
): Promise<{ resolved: boolean; errors: Array<{ code: string; message: string }> }> {
  const rawData = record.rawData as AffiliateRawData

  // Validate against current rules
  const validationErrors = validateAffiliateRawData(rawData)

  if (validationErrors.length > 0) {
    // Still failing validation - update record but keep quarantined
    await prisma.quarantined_records.update({
      where: { id: record.id },
      data: {
        blockingErrors: validationErrors,
        updatedAt: new Date(),
      },
    })

    log.info('QUARANTINE_REPROCESS_STILL_INVALID', {
      recordId: record.id,
      batchId,
      errors: validationErrors.map(e => e.code),
    })

    return { resolved: false, errors: validationErrors }
  }

  // Validation passed! Create source_product and write price
  const url = rawData.url!
  const identityKey = `URL_HASH:${computeUrlHash(url)}`

  // Get source to find retailerId
  if (!record.sourceId) {
    log.error('QUARANTINE_REPROCESS_MISSING_SOURCE', {
      recordId: record.id,
      batchId,
    })
    return {
      resolved: false,
      errors: [{ code: 'MISSING_SOURCE_ID', message: 'Record is missing sourceId' }],
    }
  }

  const source = await prisma.sources.findUnique({
    where: { id: record.sourceId },
    select: { id: true, retailerId: true },
  })

  if (!source || !source.retailerId) {
    log.error('QUARANTINE_REPROCESS_SOURCE_NO_RETAILER', {
      recordId: record.id,
      sourceId: record.sourceId,
      batchId,
    })
    return {
      resolved: false,
      errors: [{ code: 'SOURCE_NO_RETAILER', message: 'Source has no retailer mapping' }],
    }
  }

  const now = new Date()
  const reprocessRunId = `REPROCESS_${batchId}`

  // Check if source_product already exists
  let sourceProductId: string
  const existingSourceProduct = await prisma.source_products.findFirst({
    where: {
      sourceId: record.sourceId,
      identityKey,
    },
    select: { id: true },
  })

  if (existingSourceProduct) {
    sourceProductId = existingSourceProduct.id
    // Update existing
    await prisma.source_products.update({
      where: { id: sourceProductId },
      data: {
        title: rawData.name || 'Unknown',
        imageUrl: rawData.imageUrl,
        brand: rawData.brand,
        caliber: rawData.caliber,
        grainWeight: rawData.grainWeight,
        roundCount: rawData.roundCount,
        lastUpdatedByRunId: reprocessRunId,
        updatedAt: now,
      },
    })
  } else {
    // Create new source_product
    sourceProductId = createId()
    await prisma.source_products.create({
      data: {
        id: sourceProductId,
        sourceId: record.sourceId,
        identityKey,
        title: rawData.name || 'Unknown',
        url,
        imageUrl: rawData.imageUrl,
        brand: rawData.brand,
        caliber: rawData.caliber,
        grainWeight: rawData.grainWeight,
        roundCount: rawData.roundCount,
        createdByRunId: reprocessRunId,
        lastUpdatedByRunId: reprocessRunId,
        updatedAt: now,
      },
    })
  }

  // Write price record
  const priceSignatureHash = computePriceSignature(
    rawData.price!,
    rawData.currency || 'USD',
    rawData.originalPrice
  )

  await prisma.prices.create({
    data: {
      id: createId(),
      sourceProductId,
      retailerId: source.retailerId,
      price: rawData.price!,
      currency: rawData.currency || 'USD',
      url,
      inStock: rawData.inStock ?? true,
      originalPrice: rawData.originalPrice,
      priceType: rawData.originalPrice && rawData.price! < rawData.originalPrice ? 'SALE' : 'REGULAR',
      priceSignatureHash,
      ingestionRunType: 'AFFILIATE_FEED',
      ingestionRunId: reprocessRunId,
      observedAt: now,
      createdAt: now,
    },
  })

  // Update quarantine record to RESOLVED
  await prisma.quarantined_records.update({
    where: { id: record.id },
    data: {
      status: 'RESOLVED',
      updatedAt: now,
    },
  })

  // Enqueue for product resolver
  await enqueueProductResolve(sourceProductId, 'INGEST', RESOLVER_VERSION, {
    sourceId: record.sourceId,
    identityKey,
    affiliateFeedRunId: reprocessRunId,
  })

  log.info('QUARANTINE_REPROCESS_RESOLVED', {
    recordId: record.id,
    sourceProductId,
    batchId,
    triggeredBy,
  })

  return { resolved: true, errors: [] }
}

/**
 * Process a reprocess job
 */
async function processReprocessJob(job: Job<QuarantineReprocessJobData>): Promise<{
  resolved: boolean
  errors: Array<{ code: string; message: string }>
}> {
  const { quarantineRecordId, feedType, triggeredBy, batchId } = job.data

  log.info('QUARANTINE_REPROCESS_JOB_START', {
    jobId: job.id,
    recordId: quarantineRecordId,
    feedType,
    batchId,
  })

  // Fetch the quarantine record
  const record = await prisma.quarantined_records.findUnique({
    where: { id: quarantineRecordId },
  })

  if (!record) {
    log.warn('QUARANTINE_REPROCESS_RECORD_NOT_FOUND', {
      recordId: quarantineRecordId,
      batchId,
    })
    return { resolved: false, errors: [{ code: 'NOT_FOUND', message: 'Record not found' }] }
  }

  // Skip if not in QUARANTINED status
  if (record.status !== 'QUARANTINED') {
    log.debug('QUARANTINE_REPROCESS_SKIP_STATUS', {
      recordId: quarantineRecordId,
      currentStatus: record.status,
      batchId,
    })
    return { resolved: false, errors: [{ code: 'WRONG_STATUS', message: `Record status is ${record.status}` }] }
  }

  // Route to appropriate processor based on feedType
  if (feedType === 'AFFILIATE') {
    return processAffiliateRecord(
      {
        id: record.id,
        feedId: record.feedId,
        runId: record.runId,
        sourceId: record.sourceId,
        rawData: record.rawData,
        matchKey: record.matchKey,
      },
      batchId,
      triggeredBy
    )
  } else {
    // RETAILER feed reprocessing - similar logic but with retailer-specific handling
    // For now, just log and skip (retailer reprocessing requires different flow)
    log.warn('QUARANTINE_REPROCESS_RETAILER_NOT_IMPLEMENTED', {
      recordId: quarantineRecordId,
      batchId,
    })
    return {
      resolved: false,
      errors: [{ code: 'NOT_IMPLEMENTED', message: 'Retailer feed reprocessing not yet implemented' }],
    }
  }
}

/**
 * Start the Quarantine Reprocess worker
 */
export async function startQuarantineReprocessWorker(options?: {
  concurrency?: number
}): Promise<Worker<QuarantineReprocessJobData>> {
  const concurrency = options?.concurrency ?? 10

  console.log(`[Quarantine] Starting worker on queue "${QUEUE_NAMES.QUARANTINE_REPROCESS}" with concurrency=${concurrency}`)
  log.info('QUARANTINE_REPROCESS_WORKER_START', {
    event_name: 'QUARANTINE_REPROCESS_WORKER_START',
    concurrency,
    queueName: QUEUE_NAMES.QUARANTINE_REPROCESS,
  })

  quarantineReprocessWorker = new Worker<QuarantineReprocessJobData>(
    QUEUE_NAMES.QUARANTINE_REPROCESS,
    async (job: Job<QuarantineReprocessJobData>) => {
      return processReprocessJob(job)
    },
    {
      connection: redisConnection,
      concurrency,
    }
  )

  // Event handlers
  quarantineReprocessWorker.on('active', (job: Job<QuarantineReprocessJobData>) => {
    console.log(`[Quarantine] Job picked up: ${job.id} feedType=${job.data.feedType} batchId=${job.data.batchId}`)
    log.info('QUARANTINE_REPROCESS_JOB_ACTIVE', {
      event_name: 'QUARANTINE_REPROCESS_JOB_ACTIVE',
      jobId: job.id,
      recordId: job.data.quarantineRecordId,
      feedType: job.data.feedType,
      batchId: job.data.batchId,
    })
  })

  quarantineReprocessWorker.on('completed', (job: Job<QuarantineReprocessJobData>, result: any) => {
    processedCount++
    batchProcessedCount++

    if (result?.resolved) {
      resolvedCount++
      batchResolvedCount++
    } else {
      stillQuarantinedCount++
      batchStillQuarantinedCount++
    }

    // Track batch changes
    const jobBatchId = job.data.batchId
    if (currentBatchId !== jobBatchId) {
      // New batch started - reset batch counters
      if (currentBatchId !== null) {
        // Log summary for previous batch
        log.warn('QUARANTINE_REPROCESS_BATCH_COMPLETE', {
          batchId: currentBatchId,
          processed: batchProcessedCount - 1, // Exclude current job
          resolved: batchResolvedCount - (result?.resolved ? 1 : 0),
          stillQuarantined: batchStillQuarantinedCount - (result?.resolved ? 0 : 1),
        })
      }
      currentBatchId = jobBatchId
      batchProcessedCount = 1
      batchResolvedCount = result?.resolved ? 1 : 0
      batchStillQuarantinedCount = result?.resolved ? 0 : 1
      log.warn('QUARANTINE_REPROCESS_BATCH_START', {
        batchId: jobBatchId,
        triggeredBy: job.data.triggeredBy,
      })
    }

    // Log progress periodically (every N jobs) at WARN level so it's visible
    if (batchProcessedCount % PROGRESS_LOG_INTERVAL === 0) {
      log.warn('QUARANTINE_REPROCESS_PROGRESS', {
        batchId: jobBatchId,
        processed: batchProcessedCount,
        resolved: batchResolvedCount,
        stillQuarantined: batchStillQuarantinedCount,
      })
    }

    log.info('QUARANTINE_REPROCESS_JOB_COMPLETED', {
      jobId: job.id,
      recordId: job.data.quarantineRecordId,
      resolved: result?.resolved,
      batchId: job.data.batchId,
    })
  })

  quarantineReprocessWorker.on('failed', (job: Job<QuarantineReprocessJobData> | undefined, error: Error) => {
    errorCount++
    log.error('QUARANTINE_REPROCESS_JOB_FAILED', {
      jobId: job?.id,
      recordId: job?.data?.quarantineRecordId,
      batchId: job?.data?.batchId,
      error: error.message,
    }, error)
  })

  // Log when queue is drained (all jobs processed)
  quarantineReprocessWorker.on('drained', () => {
    if (currentBatchId !== null && batchProcessedCount > 0) {
      log.warn('QUARANTINE_REPROCESS_BATCH_DRAINED', {
        batchId: currentBatchId,
        totalProcessed: batchProcessedCount,
        resolved: batchResolvedCount,
        stillQuarantined: batchStillQuarantinedCount,
        lifetimeProcessed: processedCount,
        lifetimeResolved: resolvedCount,
        lifetimeStillQuarantined: stillQuarantinedCount,
        lifetimeErrors: errorCount,
      })
      // Reset batch tracking for next batch
      currentBatchId = null
      batchProcessedCount = 0
      batchResolvedCount = 0
      batchStillQuarantinedCount = 0
    }
  })

  return quarantineReprocessWorker
}

/**
 * Stop the Quarantine Reprocess worker gracefully
 */
export async function stopQuarantineReprocessWorker(): Promise<void> {
  if (quarantineReprocessWorker) {
    await quarantineReprocessWorker.close()
    quarantineReprocessWorker = null
    log.info('QUARANTINE_REPROCESS_WORKER_STOPPED', {
      event_name: 'QUARANTINE_REPROCESS_WORKER_STOPPED',
      processedCount,
      resolvedCount,
      stillQuarantinedCount,
      errorCount,
    })
  }
}

/**
 * Get worker metrics
 */
export function getQuarantineReprocessMetrics() {
  return {
    processedCount,
    resolvedCount,
    stillQuarantinedCount,
    errorCount,
  }
}
