/**
 * Affiliate Feed Worker
 *
 * BullMQ worker that processes affiliate feed jobs.
 * Orchestrates: Lock → Download → Parse → Process → Circuit Breaker → Finalize
 *
 * Per spec Section 8: Two-phase processing with circuit breaker protection.
 */

import { Worker, Job } from 'bullmq'
import { prisma, Prisma } from '@ironscout/db'
import { redisConnection } from '../config/redis'
import {
  QUEUE_NAMES,
  AffiliateFeedJobData,
  affiliateFeedQueue,
} from '../config/queues'
import { logger } from '../config/logger'
import {
  notifyAffiliateFeedRunFailed,
  notifyCircuitBreakerTriggered,
  notifyAffiliateFeedAutoDisabled,
  notifyAffiliateFeedRecovered,
} from '@ironscout/notifications'
import { acquireAdvisoryLock, releaseAdvisoryLock } from './lock'
import { downloadFeed } from './fetcher'
import { parseFeed } from './parser'
import { processProducts } from './processor'
import { evaluateCircuitBreaker, promoteProducts } from './circuit-breaker'
import { AffiliateFeedError, FAILURE_KIND, ERROR_CODES } from './types'
import type { FeedRunContext, RunStatus, FailureKind, ErrorCode } from './types'

const log = logger.affiliate

// Maximum consecutive failures before auto-disable
const MAX_CONSECUTIVE_FAILURES = 3

/**
 * Create and start the affiliate feed worker
 */
export function createAffiliateFeedWorker() {
  const worker = new Worker<AffiliateFeedJobData>(
    QUEUE_NAMES.AFFILIATE_FEED,
    async (job: Job<AffiliateFeedJobData>) => {
      return processAffiliateFeedJob(job)
    },
    {
      connection: redisConnection,
      concurrency: 5, // Process up to 5 feeds concurrently
      limiter: {
        max: 10,
        duration: 60000, // 10 jobs per minute max
      },
    }
  )

  worker.on('completed', (job) => {
    log.info('Affiliate feed job completed', { jobId: job.id, feedId: job.data.feedId })
  })

  worker.on('failed', (job, error) => {
    log.error('Affiliate feed job failed', { jobId: job?.id, feedId: job?.data.feedId }, error)
  })

  log.info('Affiliate feed worker started')

  return worker
}

/**
 * Main job processor
 *
 * Per spec §6.4.1: Run Record Creation Invariant
 * On first attempt, these steps MUST complete atomically before any throwable I/O:
 * 1. Acquire advisory lock
 * 2. Create run record
 * 3. Call job.updateData({ runId, feedLockId })
 *
 * On retry (runId in job.data): Reuse existing run record.
 */
async function processAffiliateFeedJob(job: Job<AffiliateFeedJobData>): Promise<void> {
  const { feedId, trigger, runId: existingRunId, feedLockId: cachedLockId } = job.data
  const t0 = new Date()

  log.info('Processing affiliate feed job', {
    feedId,
    trigger,
    jobId: job.id,
    isRetry: !!existingRunId,
  })

  // Load feed configuration (use cached feedLockId on retry if available)
  const feed = await prisma.affiliateFeed.findUnique({
    where: { id: feedId },
    include: { source: { include: { retailer: true } } },
  })

  if (!feed) {
    throw new Error(`Feed not found: ${feedId}`)
  }

  const feedLockId = cachedLockId ?? feed.feedLockId

  // Check eligibility
  if (feed.status === 'DRAFT') {
    log.warn('Skipping draft feed', { feedId })
    return
  }

  if (feed.status === 'DISABLED' && trigger !== 'MANUAL' && trigger !== 'ADMIN_TEST') {
    log.warn('Skipping disabled feed', { feedId })
    return
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LOCK ACQUISITION + RUN RECORD CREATION
  // Per spec §6.4.1: These steps must be atomic with job.updateData()
  // ═══════════════════════════════════════════════════════════════════════════

  let run: Awaited<ReturnType<typeof prisma.affiliateFeedRun.findUniqueOrThrow>>
  let lockAcquired: boolean

  if (existingRunId) {
    // ═══════════════════════════════════════════════════════════════════════
    // RETRY PATH: Reuse existing run record
    // Per spec §6.4.1: runId in job.data means we already created a run
    // ═══════════════════════════════════════════════════════════════════════
    log.debug('Retry: reusing existing run', { runId: existingRunId, feedId })

    run = await prisma.affiliateFeedRun.findUniqueOrThrow({
      where: { id: existingRunId },
    })

    // Guard for orphaned/mismatched runs (invariant violation)
    if (run.status !== 'RUNNING') {
      log.error('RUN_STATUS_MISMATCH', {
        runId: existingRunId,
        expectedStatus: 'RUNNING',
        actualStatus: run.status,
        feedId,
        message: 'Retry found run not in RUNNING status - potential duplicate or stale retry',
      })
      // Don't proceed - this indicates something went wrong
      return
    }

    // Re-acquire lock (may have been released on previous failure)
    lockAcquired = await acquireAdvisoryLock(feedLockId)
    if (!lockAcquired) {
      log.warn('RETRY_LOCK_CONFLICT', {
        runId: existingRunId,
        feedId,
        feedLockId: feedLockId.toString(),
        message: 'Another run started - this retry is obsolete',
      })
      return
    }
  } else {
    // ═══════════════════════════════════════════════════════════════════════
    // FIRST ATTEMPT: Atomic lock acquisition + run creation + updateData
    // Per spec §6.4.1: No throwable operations between these three steps
    // ═══════════════════════════════════════════════════════════════════════

    // Step 1: Acquire lock
    lockAcquired = await acquireAdvisoryLock(feedLockId)

    if (!lockAcquired) {
      // Lock busy - handle based on trigger type
      if (trigger === 'MANUAL' || trigger === 'MANUAL_PENDING') {
        // Per spec §6.3.2: Keep manualRunPending = true, don't create run
        log.debug('MANUAL_RUN_DEFERRED', { feedId, feedLockId: feedLockId.toString() })
      } else {
        // Per spec §6.3.1: Scheduled runs skip silently
        log.debug('SKIPPED_LOCK_BUSY', { feedId, feedLockId: feedLockId.toString(), trigger })
      }
      return
    }

    log.debug('ADVISORY_LOCK_ACQUIRED', { feedLockId: feedLockId.toString(), feedId })

    // Step 2: Create run record (now holds lock, safe to create)
    run = await prisma.affiliateFeedRun.create({
      data: {
        feedId,
        sourceId: feed.sourceId,
        trigger,
        status: 'RUNNING',
        startedAt: t0,
      },
    })

    // Step 3: IMMEDIATELY persist runId to job data
    // Per spec §6.4.1: If this fails, BullMQ will retry and create duplicate run
    // If this succeeds but later I/O fails, retry will reuse this run
    await job.updateData({
      ...job.data,
      runId: run.id,
      feedLockId: feedLockId,
    })

    log.info('RUN_START', {
      runId: run.id,
      feedId,
      trigger,
      workerPid: process.pid,
    })

    // ONLY NOW is it safe to proceed with throwable I/O
  }

  const context: FeedRunContext = {
    feed,
    run,
    t0,
    sourceId: feed.sourceId,
    retailerId: feed.source.retailerId,
  }

  // Track whether we should enqueue follow-up (read while holding lock)
  let shouldEnqueueFollowUp = false

  try {
    // Phase 1: Download → Parse → Process
    const result = await executePhase1(context)

    if (result.skipped) {
      // Per spec Q8.2.3: Use SUCCEEDED + skippedReason, not separate SKIPPED status
      await finalizeRun(context, 'SUCCEEDED', {
        skippedReason: result.skippedReason,
      })
    } else {
      // Phase 2: Circuit Breaker → Promote
      const phase2Result = await executePhase2(context, result)

      // Success - include both Phase 1 and Phase 2 metrics
      await finalizeRun(context, 'SUCCEEDED', {
        ...result.metrics,
        productsPromoted: phase2Result.productsPromoted,
      })
    }
  } catch (error) {
    // Classify error for retry decisions
    const feedError = classifyError(error)

    log.error('Affiliate feed processing failed', {
      feedId,
      runId: run.id,
      failureKind: feedError.kind,
      failureCode: feedError.code,
      retryable: feedError.retryable,
    }, error as Error)

    await finalizeRun(context, 'FAILED', {
      errorMessage: feedError.message,
      failureKind: feedError.kind,
      failureCode: feedError.code,
    })

    // Discard non-retryable errors to prevent wasted retry attempts
    if (!feedError.retryable) {
      log.warn('Discarding non-retryable job', {
        feedId,
        runId: run.id,
        failureKind: feedError.kind,
        failureCode: feedError.code,
      })
      await job.discard()
    }

    throw error // Re-throw for BullMQ to mark as failed
  } finally {
    // ═══════════════════════════════════════════════════════════════════════
    // Step 4: Read follow-up state WHILE STILL HOLDING LOCK
    // Per spec §6.4: Read manualRunPending WHILE HOLDING the advisory lock.
    // Moving this read AFTER unlock introduces a lost-run race.
    // ═══════════════════════════════════════════════════════════════════════
    const feedState = await prisma.affiliateFeed.findUnique({
      where: { id: feedId },
      select: { manualRunPending: true, status: true },
    })
    shouldEnqueueFollowUp =
      feedState?.manualRunPending === true && feedState?.status === 'ENABLED'

    log.debug('MANUAL_RUN_PENDING_CHECK', {
      feedId,
      pending: feedState?.manualRunPending,
      enqueuingFollowUp: shouldEnqueueFollowUp,
    })

    // Step 5: Release lock (AFTER reading manualRunPending - see invariant above)
    await releaseAdvisoryLock(feedLockId)
    log.debug('ADVISORY_LOCK_RELEASED', { feedLockId: feedLockId.toString(), runId: run.id })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 6: Enqueue follow-up AFTER lock release (if needed)
  // Per spec §6.4: Only enqueue if: (1) pending flag was set, (2) feed is still ENABLED
  // This prevents surprise runs after admin pauses feed mid-run
  // ═══════════════════════════════════════════════════════════════════════════
  if (shouldEnqueueFollowUp) {
    log.info('Queuing follow-up manual run', { feedId })
    await affiliateFeedQueue.add(
      'process',
      { feedId, trigger: 'MANUAL_PENDING' },
      { jobId: `${feedId}-manual-followup-${Date.now()}` }
    )
  }
}

interface Phase1Result {
  skipped: boolean
  skippedReason?: string
  metrics: {
    downloadBytes: number
    rowsRead: number
    rowsParsed: number
    productsUpserted: number
    pricesWritten: number
    productsRejected: number
    duplicateKeyCount: number
    urlHashFallbackCount: number
    errorCount: number
  }
}

/**
 * Phase 1: Download → Parse → Process (update lastSeenAt)
 */
async function executePhase1(context: FeedRunContext): Promise<Phase1Result> {
  const { feed, run } = context

  // Download
  log.info('Phase 1: Downloading feed', { feedId: feed.id })
  const downloadResult = await downloadFeed(feed)

  // Check if skipped due to unchanged content
  if (downloadResult.skipped) {
    return {
      skipped: true,
      skippedReason: downloadResult.skippedReason,
      metrics: {
        downloadBytes: 0,
        rowsRead: 0,
        rowsParsed: 0,
        productsUpserted: 0,
        pricesWritten: 0,
        productsRejected: 0,
        duplicateKeyCount: 0,
        urlHashFallbackCount: 0,
        errorCount: 0,
      },
    }
  }

  // Update change detection fields
  await prisma.affiliateFeed.update({
    where: { id: feed.id },
    data: {
      lastRemoteMtime: downloadResult.mtime,
      lastRemoteSize: downloadResult.size,
      lastContentHash: downloadResult.contentHash,
    },
  })

  // Parse (v1 only supports CSV)
  log.info('Phase 1: Parsing feed', { feedId: feed.id, bytes: downloadResult.content.length })
  if (feed.format !== 'CSV') {
    throw new Error(`Unsupported format: ${feed.format}. Only CSV is supported in v1.`)
  }
  const parseResult = await parseFeed(
    downloadResult.content.toString('utf-8'),
    feed.format,
    feed.maxRowCount || 500000
  )

  // Log parse errors
  if (parseResult.errors.length > 0) {
    await prisma.affiliateFeedRunError.createMany({
      data: parseResult.errors.slice(0, 100).map((err) => ({
        runId: run.id,
        code: err.code,
        message: err.message,
        rowNumber: err.rowNumber,
        sample: err.sample as Prisma.InputJsonValue,
      })),
    })
  }

  // Process products (Phase 1: update lastSeenAt)
  log.info('Phase 1: Processing products', { feedId: feed.id, count: parseResult.products.length })
  const processResult = await processProducts(context, parseResult.products)

  // Log processing errors
  if (processResult.errors.length > 0) {
    await prisma.affiliateFeedRunError.createMany({
      data: processResult.errors.slice(0, 100).map((err) => ({
        runId: run.id,
        code: err.code,
        message: err.message,
        rowNumber: err.rowNumber,
        sample: err.sample as Prisma.InputJsonValue,
      })),
    })
  }

  return {
    skipped: false,
    metrics: {
      downloadBytes: downloadResult.content.length,
      rowsRead: parseResult.rowsRead,
      rowsParsed: parseResult.rowsParsed,
      productsUpserted: processResult.productsUpserted,
      pricesWritten: processResult.pricesWritten,
      productsRejected: processResult.productsRejected,
      duplicateKeyCount: processResult.duplicateKeyCount,
      urlHashFallbackCount: processResult.urlHashFallbackCount,
      errorCount: parseResult.errors.length + processResult.errors.length,
    },
  }
}

interface Phase2Result {
  productsPromoted: number
  circuitBreakerBlocked: boolean
}

/**
 * Phase 2: Circuit Breaker → Promote (update lastSeenSuccessAt)
 *
 * Returns the actual row count from promoteProducts for accurate metrics.
 */
async function executePhase2(
  context: FeedRunContext,
  phase1Result: Phase1Result
): Promise<Phase2Result> {
  const { feed, run, t0 } = context

  // Evaluate circuit breaker
  log.info('Phase 2: Evaluating circuit breaker', { feedId: feed.id })
  const cbResult = await evaluateCircuitBreaker(
    run.id,
    feed.id,
    feed.expiryHours,
    t0,
    phase1Result.metrics.urlHashFallbackCount,
    phase1Result.metrics.productsUpserted // Total products processed for URL_HASH percentage
  )

  // Update run with circuit breaker metrics
  await prisma.affiliateFeedRun.update({
    where: { id: run.id },
    data: {
      activeCountBefore: cbResult.metrics.activeCountBefore,
      seenSuccessCount: cbResult.metrics.seenSuccessCount,
      wouldExpireCount: cbResult.metrics.wouldExpireCount,
      urlHashFallbackCount: cbResult.metrics.urlHashFallbackCount,
    },
  })

  if (!cbResult.passed) {
    // Circuit breaker triggered - block promotion
    log.warn('Circuit breaker triggered', {
      feedId: feed.id,
      reason: cbResult.reason,
      metrics: cbResult.metrics,
    })

    await prisma.affiliateFeedRun.update({
      where: { id: run.id },
      data: {
        expiryBlocked: true,
        expiryBlockedReason: cbResult.reason,
      },
    })

    // Send Slack notification (fire-and-forget)
    notifyCircuitBreakerTriggered(
      {
        feedId: feed.id,
        feedName: feed.source.name,  // Use source name as feed identifier
        sourceId: feed.sourceId,
        sourceName: feed.source.name,
        retailerName: feed.source.retailer?.name,
        network: feed.network,
        runId: run.id,
      },
      cbResult.reason!,
      cbResult.metrics
    ).catch((err) => log.error('Failed to send circuit breaker notification', {}, err))

    return { productsPromoted: 0, circuitBreakerBlocked: true }
  }

  // Promote products (update lastSeenSuccessAt)
  // Per spec: Capture actual DB rowCount for accurate metrics
  log.info('Phase 2: Promoting products', { feedId: feed.id })
  const productsPromoted = await promoteProducts(run.id, t0)

  log.info('Phase 2: Promotion complete', {
    feedId: feed.id,
    runId: run.id,
    productsPromoted,
  })

  return { productsPromoted, circuitBreakerBlocked: false }
}

/**
 * Finalize run and update feed status
 */
async function finalizeRun(
  context: FeedRunContext,
  status: RunStatus,
  metrics: Record<string, unknown>
): Promise<void> {
  const { feed, run, t0 } = context
  const finishedAt = new Date()
  const durationMs = finishedAt.getTime() - t0.getTime()

  // Update run record
  // Per spec: Use actual DB rowCount for pricesWritten and productsPromoted
  await prisma.affiliateFeedRun.update({
    where: { id: run.id },
    data: {
      status,
      finishedAt,
      durationMs,
      downloadBytes: metrics.downloadBytes as bigint | undefined,
      rowsRead: metrics.rowsRead as number | undefined,
      rowsParsed: metrics.rowsParsed as number | undefined,
      productsUpserted: metrics.productsUpserted as number | undefined,
      pricesWritten: metrics.pricesWritten as number | undefined,
      productsPromoted: metrics.productsPromoted as number | undefined,
      productsRejected: metrics.productsRejected as number | undefined,
      duplicateKeyCount: metrics.duplicateKeyCount as number | undefined,
      urlHashFallbackCount: metrics.urlHashFallbackCount as number | undefined,
      errorCount: metrics.errorCount as number | undefined,
      skippedReason: metrics.skippedReason as string | undefined,
      // Failure classification for retry decisions and UI display
      failureKind: metrics.failureKind as string | undefined,
      failureCode: metrics.failureCode as string | undefined,
      failureMessage: metrics.errorMessage as string | undefined,
      isPartial:
        (metrics.errorCount as number) > 0 &&
        (metrics.productsUpserted as number) > 0,
    },
  })

  // Update feed status
  const updateData: Record<string, unknown> = {
    lastRunAt: finishedAt,
  }

  if (status === 'SUCCEEDED') {
    // Per spec Q8.2.3: Clear manualRunPending unconditionally on success
    // (regardless of trigger type - scheduled runs should also clear pending manual requests)
    updateData.manualRunPending = false

    // Check if this is a recovery (had previous failures, and not a skipped run)
    const wasRecovery = feed.consecutiveFailures > 0 && !metrics.skippedReason

    updateData.consecutiveFailures = 0

    // Schedule next run
    if (feed.scheduleFrequencyHours) {
      updateData.nextRunAt = new Date(
        finishedAt.getTime() + feed.scheduleFrequencyHours * 3600000
      )
    }

    // Send recovery notification if we had previous failures (not for skipped runs)
    if (wasRecovery) {
      notifyAffiliateFeedRecovered(
        {
          feedId: feed.id,
          feedName: feed.source.name,  // Use source name as feed identifier
          sourceId: feed.sourceId,
          sourceName: feed.source.name,
          retailerName: feed.source.retailer?.name,
          network: feed.network,
          runId: run.id,
        },
        {
          productsProcessed: (metrics.productsUpserted as number) || 0,
          productsPromoted: (metrics.productsPromoted as number) || 0,
          pricesWritten: (metrics.pricesWritten as number) || 0,
          durationMs,
        }
      ).catch((err) => log.error('Failed to send recovery notification', {}, err))
    }
  } else if (status === 'FAILED') {
    const newFailureCount = feed.consecutiveFailures + 1
    updateData.consecutiveFailures = newFailureCount

    // Send failure notification (fire-and-forget)
    notifyAffiliateFeedRunFailed(
      {
        feedId: feed.id,
        feedName: feed.source.name,  // Use source name as feed identifier
        sourceId: feed.sourceId,
        sourceName: feed.source.name,
        retailerName: feed.source.retailer?.name,
        network: feed.network,
        runId: run.id,
      },
      (metrics.errorMessage as string) || 'Unknown error',
      newFailureCount
    ).catch((err) => log.error('Failed to send run failure notification', {}, err))

    // Auto-disable after MAX_CONSECUTIVE_FAILURES
    if (newFailureCount >= MAX_CONSECUTIVE_FAILURES) {
      log.warn('Auto-disabling feed after consecutive failures', {
        feedId: feed.id,
        failures: newFailureCount,
      })
      updateData.status = 'DISABLED'
      updateData.nextRunAt = null

      // Send Slack notification (fire-and-forget)
      notifyAffiliateFeedAutoDisabled(
        {
          feedId: feed.id,
          feedName: feed.source.name,  // Use source name as feed identifier
          sourceId: feed.sourceId,
          sourceName: feed.source.name,
          retailerName: feed.source.retailer?.name,
          network: feed.network,
          runId: run.id,
        },
        newFailureCount,
        (metrics.errorMessage as string) || 'Unknown error'
      ).catch((err) => log.error('Failed to send auto-disable notification', {}, err))
    } else {
      // Schedule retry
      if (feed.scheduleFrequencyHours) {
        updateData.nextRunAt = new Date(
          finishedAt.getTime() + feed.scheduleFrequencyHours * 3600000
        )
      }
    }
  }

  await prisma.affiliateFeed.update({
    where: { id: feed.id },
    data: updateData,
  })

  log.info('RUN_COMPLETE', {
    feedId: feed.id,
    runId: run.id,
    status,
    durationMs,
    productsUpserted: metrics.productsUpserted,
  })

  // NOTE: Follow-up enqueue is handled in processAffiliateFeedJob after lock release
  // per spec §6.4 to avoid race conditions
}

/**
 * Classify an error for retry decisions
 * Returns an AffiliateFeedError with kind, code, and retryable flag
 */
function classifyError(error: unknown): AffiliateFeedError {
  // Already classified
  if (error instanceof AffiliateFeedError) {
    return error
  }

  // Network errors (from Node.js or FTP libraries)
  if (error instanceof Error) {
    const err = error as Error & { code?: string; statusCode?: number }

    // Check for network error codes
    if (err.code) {
      return AffiliateFeedError.fromNetworkError(err.code, err.message)
    }

    // Check for HTTP status codes (some libraries attach these)
    if (err.statusCode) {
      return AffiliateFeedError.fromHttpStatus(err.statusCode, err.message)
    }

    // Check for common error patterns in message
    const msg = err.message.toLowerCase()

    // Auth failures
    if (msg.includes('authentication') || msg.includes('login') || msg.includes('permission denied')) {
      return AffiliateFeedError.configError(err.message, ERROR_CODES.AUTH_FAILED)
    }

    // File not found
    if (msg.includes('no such file') || msg.includes('not found') || msg.includes('does not exist')) {
      return AffiliateFeedError.permanentError(err.message, ERROR_CODES.FILE_NOT_FOUND)
    }

    // Timeout
    if (msg.includes('timeout') || msg.includes('timed out')) {
      return AffiliateFeedError.transientError(err.message, ERROR_CODES.CONNECTION_TIMEOUT)
    }

    // Connection issues
    if (msg.includes('econnreset') || msg.includes('econnrefused') || msg.includes('connection')) {
      return AffiliateFeedError.transientError(err.message, ERROR_CODES.CONNECTION_FAILED)
    }

    // Parse/format errors
    if (msg.includes('parse') || msg.includes('invalid') || msg.includes('format')) {
      return AffiliateFeedError.permanentError(err.message, ERROR_CODES.PARSE_FAILED)
    }

    // Default to transient (safer to retry unknown errors)
    return AffiliateFeedError.transientError(err.message, ERROR_CODES.UNKNOWN_ERROR)
  }

  // Unknown error type
  return AffiliateFeedError.transientError(
    String(error),
    ERROR_CODES.UNKNOWN_ERROR
  )
}
