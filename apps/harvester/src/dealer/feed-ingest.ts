/**
 * Dealer Feed Ingestion Worker
 *
 * Downloads and parses dealer product feeds using format-specific connectors.
 * Implements two-lane ingestion:
 * - Indexable Lane: Records with valid UPC -> DealerSku
 * - Quarantine Lane: Records without UPC -> QuarantinedRecord
 */

import { Worker, Job } from 'bullmq'
import { prisma, Prisma } from '@ironscout/db'
import type { FeedFormatType } from '@ironscout/db'
import { redisConnection } from '../config/redis'
import {
  QUEUE_NAMES,
  DealerFeedIngestJobData,
  dealerSkuMatchQueue,
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
  checkDealerSubscription,
  sendSubscriptionExpiryNotification,
} from './subscription'

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
  dealerId: string,
  feedId: string,
  currentStatus: 'HEALTHY' | 'WARNING' | 'FAILED',
  previousStatus: string,
  stats: NotificationStats
): Promise<void> {
  try {
    // Get dealer and feed info for notification
    const dealer = await prisma.dealer.findUnique({
      where: { id: dealerId },
      select: {
        businessName: true,
        contacts: {
          where: { communicationOptIn: true },
          select: { email: true },
          take: 1,
        },
      },
    })

    const feed = await prisma.dealerFeed.findUnique({
      where: { id: feedId },
      select: { formatType: true },
    })

    if (!dealer || !feed) {
      console.log('[Dealer Feed] Skipping notification - dealer or feed not found')
      return
    }

    const dealerEmail = dealer.contacts[0]?.email
    if (!dealerEmail) {
      console.log('[Dealer Feed] Skipping notification - no opted-in contact email')
      return
    }

    const feedInfo: FeedAlertInfo = {
      feedId,
      feedType: feed.formatType,
      dealerId,
      businessName: dealer.businessName,
      dealerEmail,
      errorMessage: stats.errorMessage,
    }

    // Send appropriate notification based on status transition
    if (currentStatus === 'FAILED') {
      console.log(`[Dealer Feed] Sending failure notification to ${dealerEmail}`)
      await notifyFeedFailed(feedInfo)
    } else if (currentStatus === 'WARNING' && previousStatus !== 'WARNING') {
      // Only send warning on first transition to WARNING
      console.log(`[Dealer Feed] Sending warning notification to ${dealerEmail}`)
      await notifyFeedWarning(feedInfo, {
        indexedCount: stats.indexedCount,
        quarantineCount: stats.quarantinedCount,
        quarantineRate: stats.quarantineRatio,
      })
    } else if (currentStatus === 'HEALTHY' && (previousStatus === 'FAILED' || previousStatus === 'WARNING')) {
      // Recovered from failed/warning state
      console.log(`[Dealer Feed] Sending recovery notification to ${dealerEmail}`)
      await notifyFeedRecovered(feedInfo)
    }
  } catch (error) {
    // Don't let notification failures break the feed processing
    console.error('[Dealer Feed] Failed to send notification:', error)
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

async function processFeedIngest(job: Job<DealerFeedIngestJobData>) {
  const { dealerId, feedId, feedRunId, accessType, formatType, url, username, password, adminOverride, adminId } = job.data

  const startTime = Date.now()
  let parseResult: FeedParseResult | null = null

  try {
    // =========================================================================
    // SUBSCRIPTION CHECK
    // =========================================================================
    // Check dealer subscription status before processing (unless admin override)
    if (!adminOverride) {
      const subscriptionResult = await checkDealerSubscription(dealerId)

      if (!subscriptionResult.isActive) {
        console.log(
          `[Dealer Feed] Skipping feed for dealer ${dealerId} - subscription ${subscriptionResult.status}: ${subscriptionResult.reason}`
        )

        // Update feed run as skipped
        await prisma.dealerFeedRun.update({
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
          await sendSubscriptionExpiryNotification(dealerId, feedId, subscriptionResult)
        }

        return {
          skipped: true,
          reason: 'subscription_expired',
          subscriptionStatus: subscriptionResult.status,
          message: subscriptionResult.reason,
        }
      }
    } else {
      console.log(
        `[Dealer Feed] Admin override active for dealer ${dealerId} (admin: ${adminId || 'unknown'})`
      )
    }

    // Update feed run status
    await prisma.dealerFeedRun.update({
      where: { id: feedRunId },
      data: { status: 'RUNNING' },
    })

    // Fetch feed content
    if (!url) {
      throw new Error('Feed URL is required')
    }

    console.log(`[Dealer Feed] Fetching feed for dealer ${dealerId}`)
    const content = await fetchFeed(url, accessType, username, password)

    // Calculate content hash for change detection
    const contentHash = createHash('sha256').update(content).digest('hex')

    // Check if content has changed
    const feed = await prisma.dealerFeed.findUnique({
      where: { id: feedId },
    })

    if (feed?.feedHash === contentHash) {
      console.log(`[Dealer Feed] No changes detected for dealer ${dealerId}`)
      await prisma.dealerFeedRun.update({
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
      return { skipped: true, reason: 'no_changes' }
    }

    // Get the appropriate connector
    const connector =
      formatType === 'GENERIC'
        ? detectConnector(content)
        : getConnector(formatType as FeedFormatType)

    console.log(`[Dealer Feed] Using connector: ${connector.name} for dealer ${dealerId}`)

    // Parse feed using connector
    console.log(`[Dealer Feed] Parsing feed for dealer ${dealerId}`)
    parseResult = await connector.parse(content)

    console.log(
      `[Dealer Feed] Parsed ${parseResult.totalRows} rows: ` +
        `${parseResult.indexableCount} indexable, ` +
        `${parseResult.quarantineCount} quarantine, ` +
        `${parseResult.rejectCount} rejected`
    )

    // Process records
    const dealerSkuIds: string[] = []
    const quarantinedIds: string[] = []
    const errors: Array<{ row: number; error: string; code?: string }> = []

    for (const result of parseResult.parsedRecords) {
      try {
        if (result.isIndexable) {
          // Indexable Lane: Create/update DealerSku
          const skuId = await processIndexableRecord(dealerId, feedId, feedRunId, result)
          if (skuId) {
            dealerSkuIds.push(skuId)
          }
        } else if (hasRequiredFields(result)) {
          // Quarantine Lane: Record has data but missing UPC
          const quarantineId = await processQuarantineRecord(dealerId, feedId, feedRunId, result)
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
        const processed = dealerSkuIds.length + quarantinedIds.length + errors.length
        if (processed % 100 === 0 && processed > 0) {
          console.log(`[Dealer Feed] Processed ${processed}/${parseResult.totalRows} items`)
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
    await prisma.dealerSku.updateMany({
      where: {
        dealerId,
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

    // Update feed status
    await prisma.dealerFeed.update({
      where: { id: feedId },
      data: {
        feedHash: contentHash,
        lastSuccessAt: feedStatus !== 'FAILED' ? new Date() : undefined,
        lastFailureAt: feedStatus === 'FAILED' ? new Date() : undefined,
        lastError: feedStatus === 'FAILED' ? `High rejection rate: ${(rejectRatio * 100).toFixed(1)}%` : null,
        primaryErrorCode,
        status: feedStatus,
      },
    })

    // Send notifications based on status changes
    await sendFeedNotifications(
      dealerId,
      feedId,
      feedStatus,
      previousStatus || 'PENDING',
      {
        indexedCount: dealerSkuIds.length,
        quarantinedCount: quarantinedIds.length,
        quarantineRatio,
        errorMessage: feedStatus === 'FAILED' ? `High rejection rate: ${(rejectRatio * 100).toFixed(1)}%` : undefined,
      }
    )

    // Update feed run with detailed counts
    await prisma.dealerFeedRun.update({
      where: { id: feedRunId },
      data: {
        status: feedStatus === 'FAILED' ? 'FAILURE' : feedStatus === 'WARNING' ? 'WARNING' : 'SUCCESS',
        completedAt: new Date(),
        duration: Date.now() - startTime,
        rowCount: parseResult.totalRows,
        indexedCount: dealerSkuIds.length,
        quarantinedCount: quarantinedIds.length,
        rejectedCount: errors.length,
        coercionCount: parseResult.parsedRecords.reduce((sum, r) => sum + r.coercions.length, 0),
        primaryErrorCode,
        errorCodes: parseResult.errorCodes,
        errors: errors.length > 0 ? errors.slice(0, 100) : undefined,
      },
    })

    // Queue SKU matching in batches
    if (dealerSkuIds.length > 0) {
      const BATCH_SIZE = 100
      for (let i = 0; i < dealerSkuIds.length; i += BATCH_SIZE) {
        const batch = dealerSkuIds.slice(i, i + BATCH_SIZE)
        await dealerSkuMatchQueue.add(
          'match-batch',
          {
            dealerId,
            feedRunId,
            dealerSkuIds: batch,
          },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
          }
        )
      }
    }

    console.log(
      `[Dealer Feed] Completed: ${dealerSkuIds.length} indexed, ` +
        `${quarantinedIds.length} quarantined, ${errors.length} rejected`
    )

    return {
      rowCount: parseResult.totalRows,
      indexedCount: dealerSkuIds.length,
      quarantinedCount: quarantinedIds.length,
      rejectedCount: errors.length,
      duration: Date.now() - startTime,
      status: feedStatus,
    }
  } catch (error) {
    console.error(`[Dealer Feed] Error for dealer ${dealerId}:`, error)

    // Determine error code
    const errorMessage = String(error)
    let primaryErrorCode: string = ERROR_CODES.PARSE_ERROR
    if (errorMessage.includes('fetch')) {
      primaryErrorCode = ERROR_CODES.FETCH_ERROR
    } else if (errorMessage.includes('timeout')) {
      primaryErrorCode = ERROR_CODES.TIMEOUT_ERROR
    }

    // Update feed status
    await prisma.dealerFeed.update({
      where: { id: feedId },
      data: {
        lastFailureAt: new Date(),
        lastError: String(error),
        primaryErrorCode,
        status: 'FAILED',
      },
    })

    // Update feed run
    await prisma.dealerFeedRun.update({
      where: { id: feedRunId },
      data: {
        status: 'FAILURE',
        completedAt: new Date(),
        duration: Date.now() - startTime,
        primaryErrorCode,
        errors: [{ row: 0, error: String(error), code: primaryErrorCode }],
      },
    })

    // Send failure notification
    await sendFeedNotifications(dealerId, feedId, 'FAILED', 'HEALTHY', {
      indexedCount: 0,
      quarantinedCount: 0,
      quarantineRatio: 0,
      errorMessage: String(error),
    })

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
  dealerId: string,
  feedId: string,
  feedRunId: string,
  result: ParsedRecordResult
): Promise<string | null> {
  const { record, coercions } = result

  const skuHash = generateSkuHash(record.title, record.upc, record.sku, record.price)

  const dealerSku = await prisma.dealerSku.upsert({
    where: {
      dealerId_dealerSkuHash: {
        dealerId,
        dealerSkuHash: skuHash,
      },
    },
    create: {
      dealerId,
      feedId,
      feedRunId,
      dealerSkuHash: skuHash,
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

  return dealerSku.id
}

/**
 * Process a quarantine record (missing UPC but has other data)
 */
async function processQuarantineRecord(
  dealerId: string,
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
  const quarantined = await prisma.quarantinedRecord.upsert({
    where: {
      feedId_matchKey: {
        feedId,
        matchKey,
      },
    },
    create: {
      dealerId,
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

export const dealerFeedIngestWorker = new Worker(QUEUE_NAMES.DEALER_FEED_INGEST, processFeedIngest, {
  connection: redisConnection,
  concurrency: 5,
})

dealerFeedIngestWorker.on('completed', (job) => {
  console.log(`[Dealer Feed] Job ${job.id} completed`)
})

dealerFeedIngestWorker.on('failed', (job, error) => {
  console.error(`[Dealer Feed] Job ${job?.id} failed:`, error)
})
