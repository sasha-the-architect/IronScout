/**
 * Merchant Feed Ingestion Worker
 *
 * Downloads and parses merchant product feeds using format-specific connectors.
 * Implements two-lane ingestion:
 * - Indexable Lane: Records with valid UPC -> MerchantSku
 * - Quarantine Lane: Records without UPC -> QuarantinedRecord
 */

import { Worker, Job } from 'bullmq'
import { prisma, Prisma } from '@ironscout/db'
import type { FeedFormatType } from '@ironscout/db'
import { redisConnection } from '../config/redis'
import {
  QUEUE_NAMES,
  MerchantFeedIngestJobData,
  merchantSkuMatchQueue,
} from '../config/queues'
import { createHash } from 'crypto'
import {
  getConnector,
  detectConnector,
  type FeedParseResult,
  type ParsedRecordResult,
  ERROR_CODES,
} from './connectors'
import {
  notifyFeedFailed,
  notifyFeedRecovered,
  notifyFeedWarning,
  type FeedAlertInfo,
} from '@ironscout/notifications'
import {
  checkMerchantSubscription,
  sendSubscriptionExpiryNotification,
} from './subscription'
import { fetchFeedViaFtp } from './ftp-fetcher'
import { logger } from '../config/logger'

const log = logger.merchant

// ============================================================================
// NOTIFICATION HELPERS
// ============================================================================

interface NotificationStats {
  indexedCount: number
  quarantinedCount: number
  quarantineRatio: number
  errorMessage?: string
}

/**
 * Send feed notifications based on status changes
 * - FAILED: Send failure notification
 * - WARNING: Send warning notification (high quarantine rate)
 * - HEALTHY (from FAILED/WARNING): Send recovered notification
 */
async function sendFeedNotifications(
  merchantId: string,
  feedId: string,
  currentStatus: 'HEALTHY' | 'WARNING' | 'FAILED',
  previousStatus: string,
  stats: NotificationStats
): Promise<void> {
  try {
    // Get merchant and feed info for notification
    const merchant = await prisma.merchants.findUnique({
      where: { id: merchantId },
      select: {
        businessName: true,
        merchant_contacts: {
          where: { communicationOptIn: true },
          select: { email: true },
          take: 1,
        },
      },
    })

    const feed = await prisma.retailer_feeds.findUnique({
      where: { id: feedId },
      select: { formatType: true },
    })

    if (!merchant || !feed) {
      log.debug('Skipping notification - merchant or feed not found')
      return
    }

    const merchantEmail = merchant.merchant_contacts[0]?.email
    if (!merchantEmail) {
      log.debug('Skipping notification - no opted-in contact email')
      return
    }

    const feedInfo: FeedAlertInfo = {
      feedId,
      feedType: feed.formatType,
      merchantId,
      businessName: merchant.businessName,
      merchantEmail,
      errorMessage: stats.errorMessage,
    }

    // Send appropriate notification based on status transition
    if (currentStatus === 'FAILED') {
      log.info('Sending failure notification', { merchantEmail })
      await notifyFeedFailed(feedInfo)
    } else if (currentStatus === 'WARNING' && previousStatus !== 'WARNING') {
      // Only send warning on first transition to WARNING
      log.info('Sending warning notification', { merchantEmail })
      await notifyFeedWarning(feedInfo, {
        indexedCount: stats.indexedCount,
        quarantineCount: stats.quarantinedCount,
        quarantineRate: stats.quarantineRatio,
      })
    } else if (currentStatus === 'HEALTHY' && (previousStatus === 'FAILED' || previousStatus === 'WARNING')) {
      // Recovered from failed/warning state
      log.info('Sending recovery notification', { merchantEmail })
      await notifyFeedRecovered(feedInfo)
    }
  } catch (error) {
    // Don't let notification failures break the feed processing
    log.error('Failed to send notification', { error: error instanceof Error ? error.message : String(error) }, error instanceof Error ? error : undefined)
  }
}

// ============================================================================
// FEED FETCHING
// ============================================================================

async function fetchFeed(
  url: string,
  accessType: string,
  username?: string,
  password?: string
): Promise<string> {
  // Handle FTP/SFTP access types
  if (accessType === 'FTP' || accessType === 'SFTP') {
    return fetchFeedViaFtp(url, accessType, username, password)
  }

  // Handle HTTP/HTTPS access types
  const headers: Record<string, string> = {}

  if (accessType === 'AUTH_URL' && username && password) {
    const auth = Buffer.from(`${username}:${password}`).toString('base64')
    headers['Authorization'] = `Basic ${auth}`
  }

  const response = await fetch(url, { headers })

  if (!response.ok) {
    throw new Error(`Feed fetch failed: ${response.status} ${response.statusText}`)
  }

  return response.text()
}

// ============================================================================
// SKU HASH FOR DEDUPLICATION
// ============================================================================

function generateSkuHash(title: string, upc?: string, sku?: string, price?: number): string {
  const components = [
    title.toLowerCase().trim(),
    upc || '',
    sku || '',
    price ? String(price) : '',
  ]

  const hash = createHash('sha256')
    .update(components.join('|'))
    .digest('hex')

  return hash.substring(0, 32)
}

/**
 * Generate a match key for quarantine deduplication
 * Uses title + sku as fallback when no UPC
 */
function generateMatchKey(title: string, sku?: string): string {
  const components = [title.toLowerCase().trim(), sku || '']

  const hash = createHash('sha256')
    .update(components.join('|'))
    .digest('hex')

  return hash.substring(0, 32)
}

// ============================================================================
// WORKER
// ============================================================================

async function processFeedIngest(job: Job<MerchantFeedIngestJobData>) {
  const { retailerId, feedId, feedRunId, accessType, formatType, url, username, password, adminOverride, adminId } = job.data

  const startTime = Date.now()
  const jobStartedAt = new Date().toISOString()
  let parseResult: FeedParseResult | null = null

  // Fetch retailer info for readable logs (via merchant_retailers join)
  const retailerInfo = await prisma.retailers.findUnique({
    where: { id: retailerId },
    select: {
      name: true,
      merchant_retailers: {
        select: {
          merchants: {
            select: { id: true, businessName: true },
          },
        },
        take: 1,
      },
    },
  })
  const merchantName = retailerInfo?.merchant_retailers[0]?.merchants.businessName || retailerInfo?.name || 'Unknown'
  const merchantId = retailerInfo?.merchant_retailers[0]?.merchants.id

  log.info('MERCHANT_JOB_START', {
    jobId: job.id,
    feedId,
    feedRunId,
    merchantId,
    merchantName,
    accessType,
    formatType,
    hasUrl: !!url,
    startedAt: jobStartedAt,
    adminOverride: adminOverride || false,
    adminId: adminId || null,
    attemptsMade: job.attemptsMade,
    workerPid: process.pid,
  })

  try {
    // =========================================================================
    // SUBSCRIPTION CHECK
    // =========================================================================
    // Check merchant subscription status before processing (unless admin override)
    if (!adminOverride && merchantId) {
      const subscriptionResult = await checkMerchantSubscription(merchantId)

      if (!subscriptionResult.isActive) {
        log.info('Skipping feed - subscription inactive', {
          merchantId,
          merchantName,
          subscriptionStatus: subscriptionResult.status,
          reason: subscriptionResult.reason,
        })

        // Update feed run as skipped
        await prisma.retailer_feed_runs.update({
          where: { id: feedRunId },
          data: {
            status: 'SKIPPED',
            completedAt: new Date(),
            duration: Date.now() - startTime,
            primaryErrorCode: 'SUBSCRIPTION_EXPIRED',
            errors: [{
              row: 0,
              error: `Feed skipped: ${subscriptionResult.reason}`,
              code: 'SUBSCRIPTION_EXPIRED',
            }],
          },
        })

        // Send notification (rate-limited to once per day)
        if (subscriptionResult.shouldNotify) {
          await sendSubscriptionExpiryNotification(merchantId, feedId, subscriptionResult)
        }

        log.info('MERCHANT_JOB_END', {
          feedId,
          feedRunId,
          merchantId,
          merchantName,
          jobId: job.id,
          status: 'skipped',
          skipReason: 'SUBSCRIPTION_EXPIRED',
          startedAt: jobStartedAt,
          endedAt: new Date().toISOString(),
          durationMs: Date.now() - startTime,
          workerPid: process.pid,
        })

        return {
          skipped: true,
          reason: 'subscription_expired',
          subscriptionStatus: subscriptionResult.status,
          message: subscriptionResult.reason,
        }
      }
    } else if (adminOverride) {
      log.info('Admin override active', { merchantId, merchantName, adminId: adminId || 'unknown' })
    }

    // Update feed run status
    await prisma.retailer_feed_runs.update({
      where: { id: feedRunId },
      data: { status: 'RUNNING' },
    })

    // Fetch feed content
    if (!url) {
      throw new Error('Feed URL is required')
    }

    const fetchStart = Date.now()
    log.debug('FETCH_START', {
      feedId,
      feedRunId,
      merchantId,
      merchantName,
      accessType,
      urlHost: url ? new URL(url).host : null,
    })
    const content = await fetchFeed(url, accessType, username, password)
    const fetchDurationMs = Date.now() - fetchStart
    log.info('FETCH_OK', {
      feedId,
      feedRunId,
      merchantId,
      merchantName,
      durationMs: fetchDurationMs,
      contentBytes: content.length,
    })

    // Calculate content hash for change detection
    const contentHash = createHash('sha256').update(content).digest('hex')

    // Check if content has changed
    const feed = await prisma.retailer_feeds.findUnique({
      where: { id: feedId },
    })

    if (feed?.feedHash === contentHash) {
      log.debug('No changes detected', { merchantId, merchantName })
      await prisma.retailer_feed_runs.update({
        where: { id: feedRunId },
        data: {
          status: 'SUCCESS',
          completedAt: new Date(),
          duration: Date.now() - startTime,
          rowCount: 0,
          indexedCount: 0,
          quarantinedCount: 0,
          rejectedCount: 0,
        },
      })
      log.info('MERCHANT_JOB_END', {
        feedId,
        feedRunId,
        merchantId,
        merchantName,
        jobId: job.id,
        status: 'skipped',
        skipReason: 'NO_CHANGES',
        startedAt: jobStartedAt,
        endedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        workerPid: process.pid,
      })
      return { skipped: true, reason: 'no_changes' }
    }

    // Get the appropriate connector
    const connector =
      formatType === 'GENERIC'
        ? detectConnector(content)
        : getConnector(formatType as FeedFormatType)

    log.debug('CONNECTOR_SELECTED', {
      feedId,
      feedRunId,
      connectorName: connector.name,
      formatType,
      merchantId,
      merchantName,
    })

    // Parse feed using connector
    const parseStart = Date.now()
    log.debug('PARSE_START', {
      feedId,
      feedRunId,
      merchantId,
      merchantName,
      connectorName: connector.name,
      contentBytes: content.length,
    })
    parseResult = await connector.parse(content)
    const parseDurationMs = Date.now() - parseStart

    log.info('PARSE_OK', {
      feedId,
      feedRunId,
      merchantId,
      merchantName,
      durationMs: parseDurationMs,
      totalRows: parseResult.totalRows,
      indexableCount: parseResult.indexableCount,
      quarantineCount: parseResult.quarantineCount,
      rejectCount: parseResult.rejectCount,
      errorCodes: Object.keys(parseResult.errorCodes),
    })

    // Process records
    const processStart = Date.now()
    log.debug('PROCESS_START', {
      feedId,
      feedRunId,
      merchantId,
      merchantName,
      recordCount: parseResult.parsedRecords.length,
    })

    const merchantSkuIds: string[] = []
    const quarantinedIds: string[] = []
    const errors: Array<{ row: number; error: string; code?: string }> = []

    for (const result of parseResult.parsedRecords) {
      try {
        if (result.isIndexable) {
          // Indexable Lane: Create/update RetailerSku
          const skuId = await processIndexableRecord(retailerId, feedId, feedRunId, result)
          if (skuId) {
            merchantSkuIds.push(skuId)
          }
        } else if (hasRequiredFields(result)) {
          // Quarantine Lane: Record has data but missing UPC
          const quarantineId = await processQuarantineRecord(retailerId, feedId, feedRunId, result)
          if (quarantineId) {
            quarantinedIds.push(quarantineId)
          }
        } else {
          // Reject Lane: Missing required fields
          const primaryError = result.errors[0]
          errors.push({
            row: result.record.rowIndex + 1,
            error: primaryError?.message || 'Missing required fields',
            code: primaryError?.code,
          })
        }

        // Log progress every 100 items
        const processed = merchantSkuIds.length + quarantinedIds.length + errors.length
        if (processed % 100 === 0 && processed > 0) {
          log.debug('Processing progress', { processed, total: parseResult.totalRows })
        }
      } catch (error) {
        errors.push({
          row: result.record.rowIndex + 1,
          error: String(error),
          code: ERROR_CODES.PARSE_ERROR,
        })
      }
    }

    // Mark SKUs not in this feed run as inactive
    await prisma.retailer_skus.updateMany({
      where: {
        retailerId,
        feedId,
        feedRunId: { not: feedRunId },
        isActive: true,
      },
      data: { isActive: false },
    })

    // Determine feed health status
    const totalProcessable = parseResult.indexableCount + parseResult.quarantineCount
    const quarantineRatio = totalProcessable > 0 ? parseResult.quarantineCount / totalProcessable : 0
    const rejectRatio = parseResult.totalRows > 0 ? parseResult.rejectCount / parseResult.totalRows : 0

    let feedStatus: 'HEALTHY' | 'WARNING' | 'FAILED' = 'HEALTHY'
    let primaryErrorCode: string | null = null

    if (rejectRatio > 0.5) {
      feedStatus = 'FAILED'
      primaryErrorCode = getMostCommonErrorCode(parseResult.errorCodes)
    } else if (quarantineRatio > 0.3 || rejectRatio > 0.1) {
      feedStatus = 'WARNING'
      primaryErrorCode = getMostCommonErrorCode(parseResult.errorCodes)
    }

    // Get previous feed status for notification logic
    const previousStatus = feed?.status

    // Update feed status and timing
    const completedAt = new Date()
    await prisma.retailer_feeds.update({
      where: { id: feedId },
      data: {
        feedHash: contentHash,
        // Update lastRunAt to actual completion time for accurate next run calculation
        lastRunAt: completedAt,
        lastSuccessAt: feedStatus !== 'FAILED' ? completedAt : undefined,
        lastFailureAt: feedStatus === 'FAILED' ? completedAt : undefined,
        lastError: feedStatus === 'FAILED' ? `High rejection rate: ${(rejectRatio * 100).toFixed(1)}%` : null,
        primaryErrorCode,
        status: feedStatus,
      },
    })

    // Send notifications based on status changes (only if we have a merchant association)
    if (merchantId) {
      await sendFeedNotifications(
        merchantId,
        feedId,
        feedStatus,
        previousStatus || 'PENDING',
        {
          indexedCount: merchantSkuIds.length,
          quarantinedCount: quarantinedIds.length,
          quarantineRatio,
          errorMessage: feedStatus === 'FAILED' ? `High rejection rate: ${(rejectRatio * 100).toFixed(1)}%` : undefined,
        }
      )
    }

    // Update feed run with detailed counts
    await prisma.retailer_feed_runs.update({
      where: { id: feedRunId },
      data: {
        status: feedStatus === 'FAILED' ? 'FAILURE' : feedStatus === 'WARNING' ? 'WARNING' : 'SUCCESS',
        completedAt: new Date(),
        duration: Date.now() - startTime,
        rowCount: parseResult.totalRows,
        indexedCount: merchantSkuIds.length,
        quarantinedCount: quarantinedIds.length,
        rejectedCount: errors.length,
        coercionCount: parseResult.parsedRecords.reduce((sum, r) => sum + r.coercions.length, 0),
        primaryErrorCode,
        errorCodes: parseResult.errorCodes,
        errors: errors.length > 0 ? errors.slice(0, 100) : undefined,
      },
    })

    // Queue SKU matching in batches with idempotent jobIds
    if (merchantSkuIds.length > 0) {
      const BATCH_SIZE = 100
      for (let i = 0; i < merchantSkuIds.length; i += BATCH_SIZE) {
        const batchNum = Math.floor(i / BATCH_SIZE)
        const batch = merchantSkuIds.slice(i, i + BATCH_SIZE)
        await merchantSkuMatchQueue.add(
          'match-batch',
          {
            retailerId,
            feedRunId,
            merchantSkuIds: batch,
          },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
            jobId: `sku-match--${feedRunId}--${batchNum}`, // Idempotent: one match job per feedRun batch
          }
        )
      }
    }

    const processDurationMs = Date.now() - processStart
    const totalDurationMs = Date.now() - startTime

    const jobEndedAt = new Date().toISOString()
    log.info('MERCHANT_JOB_END', {
      feedId,
      feedRunId,
      merchantId,
      merchantName,
      jobId: job.id,
      status: feedStatus === 'FAILED' ? 'failed' : 'completed',
      feedStatus,
      startedAt: jobStartedAt,
      endedAt: jobEndedAt,
      durationMs: totalDurationMs,
      fetchDurationMs,
      parseDurationMs,
      processDurationMs,
      totalRows: parseResult.totalRows,
      indexedCount: merchantSkuIds.length,
      quarantinedCount: quarantinedIds.length,
      rejectedCount: errors.length,
      quarantineRatio: quarantineRatio.toFixed(3),
      rejectRatio: rejectRatio.toFixed(3),
      skuMatchBatchesQueued: Math.ceil(merchantSkuIds.length / 100),
      workerPid: process.pid,
    })

    return {
      rowCount: parseResult.totalRows,
      indexedCount: merchantSkuIds.length,
      quarantinedCount: quarantinedIds.length,
      rejectedCount: errors.length,
      duration: totalDurationMs,
      status: feedStatus,
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    const errorMessage = String(error)

    // Determine error code
    let primaryErrorCode: string = ERROR_CODES.PARSE_ERROR
    if (errorMessage.includes('fetch')) {
      primaryErrorCode = ERROR_CODES.FETCH_ERROR
    } else if (errorMessage.includes('timeout')) {
      primaryErrorCode = ERROR_CODES.TIMEOUT_ERROR
    }

    const jobEndedAt = new Date().toISOString()
    log.info('MERCHANT_JOB_END', {
      feedId,
      feedRunId,
      merchantId,
      merchantName,
      jobId: job.id,
      status: 'failed',
      feedStatus: 'FAILED',
      startedAt: jobStartedAt,
      endedAt: jobEndedAt,
      durationMs,
      primaryErrorCode,
      errorMessage: error instanceof Error ? error.message : String(error),
      workerPid: process.pid,
    })

    log.error('FEED_INGEST_FAILED', {
      feedId,
      feedRunId,
      merchantId,
      merchantName,
      durationMs,
      primaryErrorCode,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack?.split('\n').slice(0, 5).join('\n') : undefined,
    }, error instanceof Error ? error : undefined)

    // Update feed status and timing
    const failedAt = new Date()
    await prisma.retailer_feeds.update({
      where: { id: feedId },
      data: {
        // Update lastRunAt so next run calculation is accurate even after failure
        lastRunAt: failedAt,
        lastFailureAt: failedAt,
        lastError: String(error),
        primaryErrorCode,
        status: 'FAILED',
      },
    })

    // Update feed run
    await prisma.retailer_feed_runs.update({
      where: { id: feedRunId },
      data: {
        status: 'FAILURE',
        completedAt: new Date(),
        duration: Date.now() - startTime,
        primaryErrorCode,
        errors: [{ row: 0, error: String(error), code: primaryErrorCode }],
      },
    })

    // Send failure notification (only if we have a merchant association)
    if (merchantId) {
      await sendFeedNotifications(merchantId, feedId, 'FAILED', 'HEALTHY', {
        indexedCount: 0,
        quarantinedCount: 0,
        quarantineRatio: 0,
        errorMessage: String(error),
      })
    }

    throw error
  }
}

// ============================================================================
// RECORD PROCESSORS
// ============================================================================

/**
 * Process an indexable record (has valid UPC)
 */
async function processIndexableRecord(
  retailerId: string,
  feedId: string,
  feedRunId: string,
  result: ParsedRecordResult
): Promise<string | null> {
  const { record, coercions } = result

  const skuHash = generateSkuHash(record.title, record.upc, record.sku, record.price)

  const retailerSku = await prisma.retailer_skus.upsert({
    where: {
      retailerId_retailerSkuHash: {
        retailerId,
        retailerSkuHash: skuHash,
      },
    },
    create: {
      retailerId,
      feedId,
      feedRunId,
      retailerSkuHash: skuHash,
      rawTitle: record.title,
      rawDescription: record.description,
      rawPrice: record.price,
      rawUpc: record.upc,
      rawSku: record.sku,
      rawCaliber: record.caliber,
      rawGrain: record.grainWeight ? String(record.grainWeight) : undefined,
      rawCase: record.caseType,
      rawBulletType: record.bulletType,
      rawBrand: record.brand,
      rawPackSize: record.roundCount,
      rawInStock: record.inStock,
      rawUrl: record.productUrl,
      rawImageUrl: record.imageUrl,
      coercionsApplied: coercions.length > 0 ? (coercions as unknown as Prisma.InputJsonValue) : undefined,
      isActive: true,
    },
    update: {
      feedRunId,
      rawPrice: record.price,
      rawInStock: record.inStock,
      rawDescription: record.description,
      rawImageUrl: record.imageUrl,
      coercionsApplied: coercions.length > 0 ? (coercions as unknown as Prisma.InputJsonValue) : undefined,
      isActive: true,
      updatedAt: new Date(),
    },
  })

  return retailerSku.id
}

/**
 * Process a quarantine record (missing UPC but has other data)
 */
async function processQuarantineRecord(
  retailerId: string,
  feedId: string,
  feedRunId: string,
  result: ParsedRecordResult
): Promise<string | null> {
  const { record, errors } = result

  const matchKey = generateMatchKey(record.title, record.sku)

  // Prepare blocking errors
  const blockingErrors = errors.map((e) => ({
    field: e.field,
    code: e.code,
    message: e.message,
    rawValue: e.rawValue,
  }))

  // Upsert quarantine record
  const quarantined = await prisma.quarantined_records.upsert({
    where: {
      feedId_matchKey: {
        feedId,
        matchKey,
      },
    },
    create: {
      retailerId,
      feedId,
      runId: feedRunId,
      matchKey,
      rawData: record.rawRow as Prisma.InputJsonValue,
      parsedFields: {
        title: record.title,
        price: record.price,
        sku: record.sku,
        brand: record.brand,
        caliber: record.caliber,
        inStock: record.inStock,
      },
      blockingErrors: blockingErrors as unknown as Prisma.InputJsonValue,
      status: 'QUARANTINED',
    },
    update: {
      runId: feedRunId,
      rawData: record.rawRow as Prisma.InputJsonValue,
      parsedFields: {
        title: record.title,
        price: record.price,
        sku: record.sku,
        brand: record.brand,
        caliber: record.caliber,
        inStock: record.inStock,
      },
      blockingErrors: blockingErrors as unknown as Prisma.InputJsonValue,
      // Don't update status if already RESOLVED
      updatedAt: new Date(),
    },
  })

  return quarantined.id
}

/**
 * Check if a record has required fields (title and price)
 */
function hasRequiredFields(result: ParsedRecordResult): boolean {
  return !!result.record.title && result.record.price > 0
}

/**
 * Get the most common error code from error counts
 */
function getMostCommonErrorCode(errorCodes: Record<string, number>): string | null {
  const entries = Object.entries(errorCodes)
  if (entries.length === 0) return null

  return entries.reduce((a, b) => (b[1] > a[1] ? b : a))[0]
}

// ============================================================================
// WORKER EXPORT
// ============================================================================

export const merchantFeedIngestWorker = new Worker(QUEUE_NAMES.MERCHANT_FEED_INGEST, processFeedIngest, {
  connection: redisConnection,
  concurrency: 5,
})

merchantFeedIngestWorker.on('completed', (job) => {
  log.info('Job completed', { jobId: job.id })
})

merchantFeedIngestWorker.on('failed', (job, error) => {
  log.error('Job failed', { jobId: job?.id, error: error.message }, error)
})
