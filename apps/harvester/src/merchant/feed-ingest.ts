/**
 * Retailer Feed Ingestion Worker
 *
 * Downloads and parses retailer product feeds using format-specific connectors.
 * Implements two-lane ingestion:
 * - Indexable Lane: Records with valid UPC -> RetailerSku
 * - Quarantine Lane: Records without UPC -> QuarantinedRecord
 */

import { createHash } from 'crypto'
import { Worker, Job } from 'bullmq'
import { prisma, Prisma } from '@ironscout/db'
import type { FeedFormatType } from '@ironscout/db'
import { redisConnection } from '../config/redis'
import {
  QUEUE_NAMES,
  RetailerFeedIngestJobData,
} from '../config/queues'
import { generateSkuHash, generateContentHash } from './sku-hash'
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
import { createRunFileLogger, type RunFileLogger } from '../config/run-file-logger'
import { emitIngestRunSummary } from '../config/ingest-summary'

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

/**
 * Generate a stable identity hash for a SKU.
 * This hash identifies the LISTING, not its current state.
 * Price changes should NOT create new SKU records.
 */
// generateSkuHash and generateContentHash are shared to enforce test coverage.

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

export async function processFeedIngest(job: Job<RetailerFeedIngestJobData>) {
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

  // Create per-run file logger (writes to logs/datafeeds/retailers/<timestamp>.log)
  const runFileLogger = createRunFileLogger({
    type: 'retailer',
    runId: feedRunId,
    feedId,
  })

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
    // Per release criteria: admin override must NOT bypass subscription enforcement
    // If admin needs to help a merchant, they should reactivate subscription first
    if (adminOverride) {
      log.info('Admin-triggered feed (subscription still enforced)', {
        merchantId,
        merchantName,
        adminId: adminId || 'unknown',
      })
    }

    if (merchantId) {
      const subscriptionResult = await checkMerchantSubscription(merchantId)

      if (!subscriptionResult.isActive) {
        log.info('Skipping feed - subscription inactive', {
          merchantId,
          merchantName,
          subscriptionStatus: subscriptionResult.status,
          reason: subscriptionResult.reason,
          adminTriggered: adminOverride || false,
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
              error: `Feed skipped: ${subscriptionResult.reason}${adminOverride ? ' (admin-triggered but subscription expired)' : ''}`,
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
          adminTriggered: adminOverride || false,
        })
        runFileLogger.info('Run skipped - subscription expired', {
          subscriptionStatus: subscriptionResult.status,
          reason: subscriptionResult.reason,
          adminTriggered: adminOverride || false,
        })
        await runFileLogger.close().catch(() => {})

        return {
          skipped: true,
          reason: 'subscription_expired',
          subscriptionStatus: subscriptionResult.status,
          message: subscriptionResult.reason,
        }
      }
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
    runFileLogger.info('Fetch complete', {
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
      runFileLogger.info('Run skipped - no changes detected', {
        durationMs: Date.now() - startTime,
      })
      await runFileLogger.close().catch(() => {})
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
    runFileLogger.info('Parse complete', {
      durationMs: parseDurationMs,
      totalRows: parseResult.totalRows,
      indexableCount: parseResult.indexableCount,
      quarantineCount: parseResult.quarantineCount,
      rejectCount: parseResult.rejectCount,
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

    // Note: SKU matching queue removed for v1 (benchmark subsystem removed)
    // In v1, products are matched to canonical products via UPC during affiliate ingestion

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

    // Log summary to run file
    runFileLogger.info(`Run ${feedStatus === 'FAILED' ? 'FAILED' : feedStatus === 'WARNING' ? 'WARNING' : 'SUCCEEDED'}`, {
      durationMs: totalDurationMs,
      totalRows: parseResult.totalRows,
      indexedCount: merchantSkuIds.length,
      quarantinedCount: quarantinedIds.length,
      rejectedCount: errors.length,
      quarantineRatio: quarantineRatio.toFixed(3),
      rejectRatio: rejectRatio.toFixed(3),
    })

    // Emit standardized INGEST_RUN_SUMMARY event
    // This provides a consistent format for monitoring across all pipelines
    emitIngestRunSummary({
      pipeline: 'RETAILER',
      runId: feedRunId,
      sourceId: feedId,
      retailerId,
      status: feedStatus === 'FAILED' ? 'FAILED' : feedStatus === 'WARNING' ? 'WARNING' : 'SUCCESS',
      durationMs: totalDurationMs,
      timing: {
        fetchMs: fetchDurationMs,
        parseMs: parseDurationMs,
        processMs: processDurationMs,
      },
      input: {
        totalRows: parseResult.totalRows,
      },
      output: {
        listingsCreated: merchantSkuIds.length, // New SKUs created (retailer pipeline doesn't track updates separately)
        listingsUpdated: 0, // TODO: Track updates when contentHash changes
        pricesWritten: 0, // Retailer pipeline doesn't write to prices table yet
        quarantined: quarantinedIds.length,
        rejected: errors.length,
        matched: 0, // Retailer pipeline doesn't match to canonical products
        enqueuedForResolver: 0, // Retailer pipeline doesn't use resolver
      },
      errors: {
        count: errors.length,
        primaryCode: primaryErrorCode || undefined,
        codes: parseResult.errorCodes,
      },
    })

    // Close run file logger
    await runFileLogger.close().catch((err) => {
      log.warn('Failed to close run file logger', { feedRunId }, err)
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

    // Log error to run file and close
    runFileLogger.error('Run FAILED - exception thrown', {
      durationMs,
      primaryErrorCode,
      errorMessage: error instanceof Error ? error.message : String(error),
    }, error instanceof Error ? error : undefined)
    await runFileLogger.close().catch((err) => {
      log.warn('Failed to close run file logger', { feedRunId }, err)
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
export async function processIndexableRecord(
  retailerId: string,
  feedId: string,
  feedRunId: string,
  result: ParsedRecordResult
): Promise<string | null> {
  const { record, coercions } = result

  // Identity hash - stable across price changes
  const skuHash = generateSkuHash(record.title, record.upc, record.sku)

  // Content hash - detects when mutable fields change
  const contentHash = generateContentHash({
    price: record.price,
    inStock: record.inStock,
    description: record.description,
    imageUrl: record.imageUrl,
    caliber: record.caliber,
    grainWeight: record.grainWeight,
    roundCount: record.roundCount,
    brand: record.brand,
    bulletType: record.bulletType,
    caseType: record.caseType,
  })

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
      contentHash,
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
      lastSeenAt: new Date(),
    },
    update: {
      feedRunId,
      contentHash,
      rawPrice: record.price,
      rawInStock: record.inStock,
      rawDescription: record.description,
      rawImageUrl: record.imageUrl,
      coercionsApplied: coercions.length > 0 ? (coercions as unknown as Prisma.InputJsonValue) : undefined,
      isActive: true,
      lastSeenAt: new Date(),
      updatedAt: new Date(),
    },
  })

  // PR #2: Write price observation to unified prices table (append-only)
  // Check the last price for this specific SKU to avoid duplicate observations
  const lastPrice = await prisma.prices.findFirst({
    where: {
      retailerSkuId: retailerSku.id,
    },
    orderBy: { observedAt: 'desc' },
    select: { price: true, inStock: true },
  })

  // Only write if price or stock status changed
  const newPrice = record.price
  const shouldWritePrice = !lastPrice ||
    parseFloat(lastPrice.price.toString()) !== newPrice ||
    lastPrice.inStock !== record.inStock

  if (shouldWritePrice) {
    await prisma.prices.create({
      data: {
        retailerId,
        retailerSkuId: retailerSku.id,
        // productId is null - will be linked later when matched to canonical product
        price: newPrice,
        inStock: record.inStock,
        url: record.productUrl || '',
        observedAt: new Date(),
        ingestionRunType: 'RETAILER_FEED',
        ingestionRunId: feedRunId,
      },
    })
  }

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
      feedType: 'RETAILER',
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

export const retailerFeedIngestWorker = new Worker(QUEUE_NAMES.RETAILER_FEED_INGEST, processFeedIngest, {
  connection: redisConnection,
  concurrency: 5,
})

retailerFeedIngestWorker.on('completed', (job) => {
  log.info('Job completed', { jobId: job.id })
})

retailerFeedIngestWorker.on('failed', (job, error) => {
  log.error('Job failed', { jobId: job?.id, error: error.message }, error)
})
