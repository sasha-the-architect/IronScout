/**
 * Affiliate Feed Worker
 *
 * BullMQ worker that processes affiliate feed jobs.
 * Orchestrates: Lock → Download → Parse → Process → Circuit Breaker → Finalize
 *
 * Per spec Section 8: Two-phase processing with circuit breaker protection.
 */

import { Worker, Job } from 'bullmq'
import { randomUUID } from 'crypto'
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
  const { feedId, trigger, runId: existingRunId, feedLockId: cachedLockIdStr } = job.data
  const t0 = new Date()
  const jobStartedAt = t0.toISOString()

  log.info('AFFILIATE_JOB_START', {
    feedId,
    trigger,
    jobId: job.id,
    startedAt: jobStartedAt,
    attemptsMade: job.attemptsMade,
    isRetry: !!existingRunId,
    workerPid: process.pid,
  })

  log.debug('Job data received', {
    feedId,
    trigger,
    existingRunId: existingRunId || null,
    cachedLockIdStr: cachedLockIdStr || null,
    jobAttempts: job.attemptsMade,
    maxAttempts: job.opts?.attempts,
  })

  // Load feed configuration (use cached feedLockId on retry if available)
  log.debug('Loading feed configuration', { feedId })
  const feedLoadStart = Date.now()
  const feed = await prisma.affiliate_feeds.findUnique({
    where: { id: feedId },
    include: { sources: { include: { retailers: true } } },
  })
  log.debug('Feed configuration loaded', {
    feedId,
    found: !!feed,
    loadTimeMs: Date.now() - feedLoadStart,
  })

  if (!feed) {
    log.error('Feed not found - aborting job', { feedId })
    throw new Error(`Feed not found: ${feedId}`)
  }

  // Parse cached feedLockId from string (BigInt can't be JSON serialized)
  const feedLockId = cachedLockIdStr ? BigInt(cachedLockIdStr) : feed.feedLockId
  log.debug('Feed lock ID resolved', {
    feedId,
    feedLockId: feedLockId.toString(),
    usedCached: !!cachedLockIdStr,
  })

  // Log feed configuration details
  log.debug('Feed configuration details', {
    feedId,
    sourceName: feed.sources.name,
    retailerName: feed.sources.retailers?.name,
    status: feed.status,
    transport: feed.transport,
    format: feed.format,
    network: feed.network,
    expiryHours: feed.expiryHours,
    scheduleFrequencyHours: feed.scheduleFrequencyHours,
    maxRowCount: feed.maxRowCount,
    consecutiveFailures: feed.consecutiveFailures,
    manualRunPending: feed.manualRunPending,
    lastRunAt: feed.lastRunAt?.toISOString(),
    lastContentHash: feed.lastContentHash?.slice(0, 16),
  })

  // Check eligibility
  if (feed.status === 'DRAFT') {
    log.warn('Skipping draft feed - not yet activated', {
      feedId,
      sourceName: feed.sources.name,
      retailerName: feed.sources.retailers?.name,
      decision: 'SKIP',
      reason: 'DRAFT_STATUS',
    })
    log.info('AFFILIATE_JOB_END', {
      feedId,
      trigger,
      jobId: job.id,
      startedAt: jobStartedAt,
      endedAt: new Date().toISOString(),
      durationMs: Date.now() - t0.getTime(),
      status: 'skipped',
      skipReason: 'DRAFT_STATUS',
    })
    return
  }

  if (feed.status === 'DISABLED' && trigger !== 'MANUAL' && trigger !== 'ADMIN_TEST') {
    log.warn('Skipping disabled feed - only manual/admin triggers allowed', {
      feedId,
      sourceName: feed.sources.name,
      retailerName: feed.sources.retailers?.name,
      trigger,
      decision: 'SKIP',
      reason: 'DISABLED_STATUS',
    })
    log.info('AFFILIATE_JOB_END', {
      feedId,
      trigger,
      jobId: job.id,
      startedAt: jobStartedAt,
      endedAt: new Date().toISOString(),
      durationMs: Date.now() - t0.getTime(),
      status: 'skipped',
      skipReason: 'DISABLED_STATUS',
    })
    return
  }

  log.debug('Feed eligibility check passed', {
    feedId,
    status: feed.status,
    trigger,
    decision: 'PROCEED',
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // LOCK ACQUISITION + RUN RECORD CREATION
  // Per spec §6.4.1: These steps must be atomic with job.updateData()
  // ═══════════════════════════════════════════════════════════════════════════

  let run: Awaited<ReturnType<typeof prisma.affiliate_feed_runs.findUniqueOrThrow>>
  let lockAcquired: boolean

  if (existingRunId) {
    // ═══════════════════════════════════════════════════════════════════════
    // RETRY PATH: Reuse existing run record
    // Per spec §6.4.1: runId in job.data means we already created a run
    // ═══════════════════════════════════════════════════════════════════════
    log.debug('Retry: reusing existing run', { runId: existingRunId, feedId })

    run = await prisma.affiliate_feed_runs.findUniqueOrThrow({
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
      log.info('AFFILIATE_JOB_END', {
        feedId,
        trigger,
        jobId: job.id,
        runId: existingRunId,
        startedAt: jobStartedAt,
        endedAt: new Date().toISOString(),
        durationMs: Date.now() - t0.getTime(),
        status: 'skipped',
        skipReason: 'RUN_STATUS_MISMATCH',
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
      log.info('AFFILIATE_JOB_END', {
        feedId,
        trigger,
        jobId: job.id,
        runId: existingRunId,
        startedAt: jobStartedAt,
        endedAt: new Date().toISOString(),
        durationMs: Date.now() - t0.getTime(),
        status: 'skipped',
        skipReason: 'RETRY_LOCK_CONFLICT',
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
      log.info('AFFILIATE_JOB_END', {
        feedId,
        trigger,
        jobId: job.id,
        startedAt: jobStartedAt,
        endedAt: new Date().toISOString(),
        durationMs: Date.now() - t0.getTime(),
        status: 'skipped',
        skipReason: 'LOCK_BUSY',
      })
      return
    }

    log.debug('ADVISORY_LOCK_ACQUIRED', { feedLockId: feedLockId.toString(), feedId })

    // Step 2: Create run record (now holds lock, safe to create)
    run = await prisma.affiliate_feed_runs.create({
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
    // Note: feedLockId is converted to string for JSON serialization (BigInt not supported)
    await job.updateData({
      ...job.data,
      runId: run.id,
      feedLockId: feedLockId.toString(),
    })

    log.info('RUN_START', {
      runId: run.id,
      feedId,
      sourceName: feed.sources.name,
      retailerName: feed.sources.retailers?.name,
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
    retailerId: feed.sources.retailerId,
  }

  // Track whether we should enqueue follow-up (read while holding lock)
  let shouldEnqueueFollowUp = false

  try {
    // Phase 1: Download → Parse → Process
    log.debug('Starting Phase 1: Download → Parse → Process', {
      feedId: feed.id,
      runId: run.id,
      sourceName: feed.sources.name,
    })
    const phase1Start = Date.now()
    const result = await executePhase1(context)
    const phase1Duration = Date.now() - phase1Start

    log.debug('Phase 1 completed', {
      feedId: feed.id,
      runId: run.id,
      phase1DurationMs: phase1Duration,
      skipped: result.skipped,
      skippedReason: result.skippedReason,
      metrics: result.skipped ? null : result.metrics,
    })

    if (result.skipped) {
      // Per spec Q8.2.3: Use SUCCEEDED + skippedReason, not separate SKIPPED status
      log.debug('Run skipped - finalizing with SUCCEEDED status', {
        feedId: feed.id,
        runId: run.id,
        skippedReason: result.skippedReason,
        decision: 'SKIP_UNCHANGED',
      })
      await finalizeRun(context, 'SUCCEEDED', {
        skippedReason: result.skippedReason,
      })
    } else {
      // Phase 2: Circuit Breaker → Promote
      log.debug('Starting Phase 2: Circuit Breaker → Promote', {
        feedId: feed.id,
        runId: run.id,
        productsToEvaluate: result.metrics.productsUpserted,
      })
      const phase2Start = Date.now()
      const phase2Result = await executePhase2(context, result)
      const phase2Duration = Date.now() - phase2Start

      log.debug('Phase 2 completed', {
        feedId: feed.id,
        runId: run.id,
        phase2DurationMs: phase2Duration,
        productsPromoted: phase2Result.productsPromoted,
        circuitBreakerBlocked: phase2Result.circuitBreakerBlocked,
      })

      // Check for processing failure:
      // - File has rows but all failed validation (rowsRead > 0, rowsParsed == 0)
      // - Validated products all failed to upsert (rowsParsed > 0, productsUpserted == 0)
      // This prevents saving content hash for broken feeds, which would cause
      // subsequent runs to skip reprocessing.
      const isProcessingFailure =
        result.metrics.rowsRead > 0 && result.metrics.productsUpserted === 0

      if (isProcessingFailure) {
        const failureReason =
          result.metrics.rowsParsed === 0
            ? `All ${result.metrics.rowsRead} rows failed validation (check CSV column names)`
            : `All ${result.metrics.rowsParsed} validated products failed to upsert`

        log.warn('Processing failure detected - no products saved', {
          feedId: feed.id,
          runId: run.id,
          rowsRead: result.metrics.rowsRead,
          rowsParsed: result.metrics.rowsParsed,
          productsUpserted: result.metrics.productsUpserted,
          productsRejected: result.metrics.productsRejected,
          errorCount: result.metrics.errorCount,
          failureReason,
        })
        // Mark as FAILED and don't update content hash
        await finalizeRun(context, 'FAILED', {
          ...result.metrics,
          productsPromoted: phase2Result.productsPromoted,
          failureKind: 'PROCESSING_ERROR',
          failureCode: result.metrics.rowsParsed === 0 ? 'VALIDATION_FAILURE' : 'UPSERT_FAILURE',
          errorMessage: failureReason,
        })
      } else {
        // Success - include both Phase 1 and Phase 2 metrics
        log.debug('Run succeeded - finalizing', {
          feedId: feed.id,
          runId: run.id,
          totalDurationMs: phase1Duration + phase2Duration,
          phase1Ms: phase1Duration,
          phase2Ms: phase2Duration,
        })
        await finalizeRun(context, 'SUCCEEDED', {
          ...result.metrics,
          productsPromoted: phase2Result.productsPromoted,
          // Include change detection data - only saved on true success
          changeDetection: result.changeDetection,
        })
      }
    }
  } catch (error) {
    // Generate correlation ID for this failure (for log correlation)
    const correlationId = randomUUID()

    // Classify error for retry decisions
    const feedError = classifyError(error)

    log.error('Affiliate feed processing failed', {
      correlationId,
      feedId,
      runId: run.id,
      failureKind: feedError.kind,
      failureCode: feedError.code,
      retryable: feedError.retryable,
      errorMessage: feedError.message,
    }, error as Error)

    await finalizeRun(context, 'FAILED', {
      correlationId,
      errorMessage: feedError.message,
      failureKind: feedError.kind,
      failureCode: feedError.code,
    })

    // Discard non-retryable errors to prevent wasted retry attempts
    if (!feedError.retryable) {
      log.warn('Discarding non-retryable job', {
        correlationId,
        feedId,
        runId: run.id,
        failureKind: feedError.kind,
        failureCode: feedError.code,
      })
      await job.discard()
    }

    log.info('AFFILIATE_JOB_END', {
      feedId,
      trigger,
      jobId: job.id,
      runId: run.id,
      startedAt: jobStartedAt,
      endedAt: new Date().toISOString(),
      durationMs: Date.now() - t0.getTime(),
      status: 'failed',
      failureKind: feedError.kind,
      failureCode: feedError.code,
      retryable: feedError.retryable,
      correlationId,
    })

    throw error // Re-throw for BullMQ to mark as failed
  } finally {
    // ═══════════════════════════════════════════════════════════════════════
    // Step 4: Read follow-up state WHILE STILL HOLDING LOCK
    // Per spec §6.4: Read manualRunPending WHILE HOLDING the advisory lock.
    // Moving this read AFTER unlock introduces a lost-run race.
    // ═══════════════════════════════════════════════════════════════════════
    const feedState = await prisma.affiliate_feeds.findUnique({
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

    // Step 7: Clear manualRunPending AFTER successfully enqueueing follow-up
    // Per spec §6.4: This ensures we don't lose the follow-up if we crash between
    // reading the flag and enqueueing the job.
    await prisma.affiliate_feeds.update({
      where: { id: feedId },
      data: { manualRunPending: false },
    })
    log.debug('Cleared manualRunPending after enqueueing follow-up', { feedId })
  }

  // Final job metrics for observability
  const jobEndedAt = new Date()
  const totalJobDurationMs = jobEndedAt.getTime() - t0.getTime()
  log.info('AFFILIATE_JOB_END', {
    feedId,
    trigger,
    jobId: job.id,
    runId: run.id,
    startedAt: jobStartedAt,
    endedAt: jobEndedAt.toISOString(),
    durationMs: totalJobDurationMs,
    status: 'completed',
    workerPid: process.pid,
  })
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
  // Change detection data - only saved to feed after successful processing
  changeDetection?: {
    mtime: Date | null
    size: bigint
    contentHash: string
  }
}

/**
 * Phase 1: Download → Parse → Process (update lastSeenAt)
 */
async function executePhase1(context: FeedRunContext): Promise<Phase1Result> {
  const { feed, run } = context
  const sourceName = feed.sources.name
  const retailerName = feed.sources.retailers?.name

  // Download
  log.info('Phase 1: Downloading feed', { feedId: feed.id, runId: run.id, sourceName, retailerName })
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

  // NOTE: Change detection fields (lastContentHash, etc.) are updated in finalizeRun
  // ONLY after successful processing. This prevents marking a failed run's hash as "seen"
  // which would cause subsequent runs to skip processing.

  // Parse (v1 only supports CSV)
  log.info('Phase 1: Parsing feed', { feedId: feed.id, runId: run.id, sourceName, bytes: downloadResult.content.length })
  if (feed.format !== 'CSV') {
    throw new Error(`Unsupported format: ${feed.format}. Only CSV is supported in v1.`)
  }
  const parseResult = await parseFeed(
    downloadResult.content.toString('utf-8'),
    feed.format,
    feed.maxRowCount || 500000,
    feed.id // Pass feedId for logging correlation
  )

  // Log parse errors
  if (parseResult.errors.length > 0) {
    await prisma.affiliate_feed_run_errors.createMany({
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
  log.info('Phase 1: Processing products', { feedId: feed.id, runId: run.id, sourceName, count: parseResult.products.length })
  const processResult = await processProducts(context, parseResult.products)

  // Log processing errors
  if (processResult.errors.length > 0) {
    await prisma.affiliate_feed_run_errors.createMany({
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
    // Change detection data - only saved to feed after successful processing
    changeDetection: {
      mtime: downloadResult.mtime,
      size: downloadResult.size,
      contentHash: downloadResult.contentHash,
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
  const sourceName = feed.sources.name
  const retailerName = feed.sources.retailers?.name

  // Evaluate circuit breaker
  log.info('Phase 2: Evaluating circuit breaker', { feedId: feed.id, runId: run.id, sourceName, retailerName })
  const cbResult = await evaluateCircuitBreaker(
    run.id,
    feed.id,
    feed.expiryHours,
    t0,
    phase1Result.metrics.urlHashFallbackCount,
    phase1Result.metrics.productsUpserted // Total products processed for URL_HASH percentage
  )

  // Update run with circuit breaker metrics
  await prisma.affiliate_feed_runs.update({
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
      runId: run.id,
      sourceName,
      retailerName,
      reason: cbResult.reason,
      metrics: cbResult.metrics,
    })

    await prisma.affiliate_feed_runs.update({
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
        feedName: feed.sources.name,  // Use source name as feed identifier
        sourceId: feed.sourceId,
        sourceName: feed.sources.name,
        retailerName: feed.sources.retailers?.name,
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
  log.info('Phase 2: Promoting products', { feedId: feed.id, runId: run.id, sourceName, retailerName })
  const productsPromoted = await promoteProducts(run.id, t0)

  log.info('Phase 2: Promotion complete', {
    feedId: feed.id,
    runId: run.id,
    sourceName,
    retailerName,
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
  await prisma.affiliate_feed_runs.update({
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
      correlationId: metrics.correlationId as string | undefined,
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
    // NOTE: manualRunPending is NOT cleared here - it's cleared AFTER enqueueing follow-up
    // in processAffiliateFeedJob to avoid race where we clear it before reading it.
    // See spec §6.4: Read manualRunPending under lock, clear after follow-up enqueued.

    // Check if this is a recovery (had previous failures, and not a skipped run)
    const wasRecovery = feed.consecutiveFailures > 0 && !metrics.skippedReason

    updateData.consecutiveFailures = 0

    // Schedule next run
    if (feed.scheduleFrequencyHours) {
      updateData.nextRunAt = new Date(
        finishedAt.getTime() + feed.scheduleFrequencyHours * 3600000
      )
    }

    // Update change detection fields ONLY on true success (not skipped runs without changeDetection)
    // This prevents marking a failed run's hash as "seen" which would skip reprocessing
    const changeDetection = metrics.changeDetection as { mtime: Date | null; size: bigint; contentHash: string } | undefined
    if (changeDetection) {
      updateData.lastRemoteMtime = changeDetection.mtime
      updateData.lastRemoteSize = changeDetection.size
      updateData.lastContentHash = changeDetection.contentHash
    }

    // Send recovery notification if we had previous failures (not for skipped runs)
    if (wasRecovery) {
      notifyAffiliateFeedRecovered(
        {
          feedId: feed.id,
          feedName: feed.sources.name,  // Use source name as feed identifier
          sourceId: feed.sourceId,
          sourceName: feed.sources.name,
          retailerName: feed.sources.retailers?.name,
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
        feedName: feed.sources.name,  // Use source name as feed identifier
        sourceId: feed.sourceId,
        sourceName: feed.sources.name,
        retailerName: feed.sources.retailers?.name,
        network: feed.network,
        runId: run.id,
        correlationId: metrics.correlationId as string | undefined,
      },
      (metrics.errorMessage as string) || 'Unknown error',
      newFailureCount
    ).catch((err) => log.error('Failed to send run failure notification', {}, err))

    // Auto-disable after MAX_CONSECUTIVE_FAILURES
    if (newFailureCount >= MAX_CONSECUTIVE_FAILURES) {
      log.warn('Auto-disabling feed after consecutive failures', {
        feedId: feed.id,
        runId: run.id,
        sourceName: feed.sources.name,
        retailerName: feed.sources.retailers?.name,
        failures: newFailureCount,
      })
      updateData.status = 'DISABLED'
      updateData.nextRunAt = null

      // Send Slack notification (fire-and-forget)
      notifyAffiliateFeedAutoDisabled(
        {
          feedId: feed.id,
          feedName: feed.sources.name,  // Use source name as feed identifier
          sourceId: feed.sourceId,
          sourceName: feed.sources.name,
          retailerName: feed.sources.retailers?.name,
          network: feed.network,
          runId: run.id,
          correlationId: metrics.correlationId as string | undefined,
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

  await prisma.affiliate_feeds.update({
    where: { id: feed.id },
    data: updateData,
  })

  log.info('RUN_COMPLETE', {
    feedId: feed.id,
    runId: run.id,
    sourceName: feed.sources.name,
    retailerName: feed.sources.retailers?.name,
    status,
    startedAt: t0.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs,
    productsUpserted: metrics.productsUpserted,
    productsPromoted: metrics.productsPromoted,
    pricesWritten: metrics.pricesWritten,
    errorCount: metrics.errorCount,
    skipped: !!metrics.skippedReason,
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
