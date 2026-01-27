/**
 * Current Price Recompute BullMQ Worker
 *
 * Per ADR-015: Processes RECOMPUTE jobs to rebuild the current_visible_prices
 * derived table. This ensures hot paths (Search, Dashboard, Alerts) can read
 * pre-computed visible prices without evaluating corrections at query time.
 *
 * Triggered:
 * - After correction create/revoke
 * - After run ignore/unignore
 * - Scheduled periodic full recompute (every 5 minutes)
 * - Manual admin trigger
 */

import { Worker, Job } from 'bullmq'
import { redisConnection } from '../config/redis'
import { QUEUE_NAMES, CurrentPriceRecomputeJobData } from '../config/queues'
import { logger } from '../config/logger'
import { recomputeCurrentPrices, getRecomputeStatus } from './recompute'

const log = logger.currentprice

// Metrics
let processedCount = 0
let errorCount = 0
let lastProcessedAt: Date | null = null
let lastFullRecomputeAt: Date | null = null

/**
 * Current Price Recompute Worker instance
 * Created lazily by startCurrentPriceRecomputeWorker()
 */
export let currentPriceRecomputeWorker: Worker<CurrentPriceRecomputeJobData> | null = null

/**
 * Process a single recompute job
 */
async function processRecomputeJob(job: Job<CurrentPriceRecomputeJobData>): Promise<void> {
  const { scope, scopeId, trigger, triggeredBy, correlationId } = job.data
  const startTime = Date.now()

  log.info('RECOMPUTE_JOB_START', {
    event_name: 'RECOMPUTE_JOB_START',
    jobId: job.id,
    scope,
    scopeId,
    trigger,
    triggeredBy,
    correlationId,
  })

  try {
    const result = await recomputeCurrentPrices(scope, scopeId, correlationId)

    // Track full recompute timing
    if (scope === 'FULL') {
      lastFullRecomputeAt = new Date()
    }

    log.info('RECOMPUTE_JOB_COMPLETED', {
      event_name: 'RECOMPUTE_JOB_COMPLETED',
      jobId: job.id,
      scope,
      scopeId,
      trigger,
      correlationId,
      processed: result.processed,
      inserted: result.inserted,
      deleted: result.deleted,
      durationMs: result.durationMs,
    })
  } catch (error) {
    const durationMs = Date.now() - startTime
    log.error(
      'RECOMPUTE_JOB_ERROR',
      {
        event_name: 'RECOMPUTE_JOB_ERROR',
        jobId: job.id,
        scope,
        scopeId,
        trigger,
        correlationId,
        durationMs,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      error instanceof Error ? error : new Error(String(error))
    )
    throw error // Re-throw for BullMQ retry
  }
}

/**
 * Start the Current Price Recompute worker
 */
export async function startCurrentPriceRecomputeWorker(options?: {
  concurrency?: number
}): Promise<Worker<CurrentPriceRecomputeJobData>> {
  const concurrency = options?.concurrency ?? 5

  log.info('CURRENT_PRICE_WORKER_START', {
    event_name: 'CURRENT_PRICE_WORKER_START',
    concurrency,
    queueName: QUEUE_NAMES.CURRENT_PRICE_RECOMPUTE,
  })

  currentPriceRecomputeWorker = new Worker<CurrentPriceRecomputeJobData>(
    QUEUE_NAMES.CURRENT_PRICE_RECOMPUTE,
    async (job: Job<CurrentPriceRecomputeJobData>) => {
      return processRecomputeJob(job)
    },
    {
      connection: redisConnection,
      concurrency,
    }
  )

  // Event handlers for observability
  currentPriceRecomputeWorker.on('completed', (job: Job<CurrentPriceRecomputeJobData>) => {
    processedCount++
    lastProcessedAt = new Date()
  })

  currentPriceRecomputeWorker.on(
    'failed',
    (job: Job<CurrentPriceRecomputeJobData> | undefined, error: Error) => {
      errorCount++
      log.error(
        'RECOMPUTE_JOB_FAILED',
        {
          event_name: 'RECOMPUTE_JOB_FAILED',
          jobId: job?.id,
          scope: job?.data?.scope,
          scopeId: job?.data?.scopeId,
          trigger: job?.data?.trigger,
          correlationId: job?.data?.correlationId,
          errorMessage: error.message,
          errorCount,
        },
        error
      )
    }
  )

  currentPriceRecomputeWorker.on('error', (error: Error) => {
    // Transient network errors are expected in long-running processes
    log.warn('CURRENT_PRICE_WORKER_ERROR', {
      event_name: 'CURRENT_PRICE_WORKER_ERROR',
      errorMessage: error.message,
    })
  })

  return currentPriceRecomputeWorker
}

/**
 * Stop the Current Price Recompute worker gracefully
 */
export async function stopCurrentPriceRecomputeWorker(): Promise<void> {
  if (currentPriceRecomputeWorker) {
    log.info('CURRENT_PRICE_WORKER_STOPPING', {
      event_name: 'CURRENT_PRICE_WORKER_STOPPING',
      processedCount,
      errorCount,
    })
    await currentPriceRecomputeWorker.close()
    currentPriceRecomputeWorker = null
  }
}

/**
 * Get worker metrics
 */
export function getCurrentPriceWorkerMetrics() {
  return {
    processedCount,
    errorCount,
    lastProcessedAt,
    lastFullRecomputeAt,
  }
}

/**
 * Get full status including derived table metrics
 */
export async function getCurrentPriceRecomputeStatus() {
  const workerMetrics = getCurrentPriceWorkerMetrics()
  const tableStatus = await getRecomputeStatus()

  return {
    ...workerMetrics,
    ...tableStatus,
  }
}
