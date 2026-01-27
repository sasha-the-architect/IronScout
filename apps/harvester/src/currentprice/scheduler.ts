/**
 * Current Price Recompute Scheduler
 *
 * Per ADR-015: Maintains freshness of the current_visible_prices derived table
 * via periodic FULL recomputes using BullMQ repeatable jobs.
 *
 * Design decisions:
 * - Runs every 5 minutes for acceptable freshness SLA
 * - Uses BullMQ repeatable job (same pattern as affiliate scheduler)
 * - Per ADR-001: Only one scheduler instance should run
 */

import { Worker, Job } from 'bullmq'
import { redisConnection } from '../config/redis'
import {
  QUEUE_NAMES,
  CurrentPriceRecomputeJobData,
  currentPriceRecomputeQueue,
  enqueueCurrentPriceRecompute,
} from '../config/queues'
import { logger } from '../config/logger'

const log = logger.currentprice

// Schedule: every 5 minutes
const RECOMPUTE_CRON = process.env.CURRENT_PRICE_RECOMPUTE_CRON || '*/5 * * * *'

let schedulerWorker: Worker | null = null
let isEnabled = false

/**
 * Start the Current Price Recompute scheduler
 *
 * IMPORTANT (ADR-001): Only one scheduler instance should run.
 * Enable via HARVESTER_SCHEDULER_ENABLED=true on exactly one harvester instance.
 *
 * Uses BullMQ repeatable jobs pattern (same as affiliate scheduler).
 */
export function startCurrentPriceScheduler(): void {
  if (schedulerWorker) {
    log.warn('CURRENT_PRICE_SCHEDULER_ALREADY_RUNNING', {
      event_name: 'CURRENT_PRICE_SCHEDULER_ALREADY_RUNNING',
    })
    return
  }

  log.info('CURRENT_PRICE_SCHEDULER_START', {
    event_name: 'CURRENT_PRICE_SCHEDULER_START',
    cronPattern: RECOMPUTE_CRON,
  })

  // Set up the repeatable job
  setupRepeatableJob()

  isEnabled = true
}

/**
 * Set up the repeatable scheduler job
 */
async function setupRepeatableJob(): Promise<void> {
  try {
    // Remove any existing repeatable jobs first
    const repeatableJobs = await currentPriceRecomputeQueue.getRepeatableJobs()
    for (const job of repeatableJobs) {
      if (job.name === 'SCHEDULED_RECOMPUTE') {
        await currentPriceRecomputeQueue.removeRepeatableByKey(job.key)
      }
    }

    // Add scheduled recompute job
    await currentPriceRecomputeQueue.add(
      'SCHEDULED_RECOMPUTE',
      {
        scope: 'FULL',
        trigger: 'SCHEDULED',
        triggeredBy: 'scheduler',
        correlationId: 'scheduled', // Will be replaced by actual job
      } satisfies CurrentPriceRecomputeJobData,
      {
        repeat: {
          pattern: RECOMPUTE_CRON,
        },
        jobId: 'current-price-scheduled-recompute',
      }
    )

    log.info('CURRENT_PRICE_SCHEDULER_REPEATABLE_JOB_CONFIGURED', {
      event_name: 'CURRENT_PRICE_SCHEDULER_REPEATABLE_JOB_CONFIGURED',
      cronPattern: RECOMPUTE_CRON,
    })
  } catch (error) {
    log.error(
      'CURRENT_PRICE_SCHEDULER_SETUP_FAILED',
      {
        event_name: 'CURRENT_PRICE_SCHEDULER_SETUP_FAILED',
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      error instanceof Error ? error : new Error(String(error))
    )
  }
}

/**
 * Stop the Current Price Recompute scheduler
 */
export function stopCurrentPriceScheduler(): void {
  if (isEnabled) {
    log.info('CURRENT_PRICE_SCHEDULER_STOP', {
      event_name: 'CURRENT_PRICE_SCHEDULER_STOP',
    })
    // Repeatable jobs are managed by BullMQ - they'll be cleaned up on next start
    isEnabled = false
  }
}

/**
 * Check if scheduler is running
 */
export function isCurrentPriceSchedulerRunning(): boolean {
  return isEnabled
}

/**
 * Get scheduler status
 */
export async function getCurrentPriceSchedulerStatus(): Promise<{
  enabled: boolean
  cronPattern: string
  nextRunAt: Date | null
  queuedJobs: number
}> {
  const queueCounts = await currentPriceRecomputeQueue.getJobCounts()

  let nextRunAt: Date | null = null
  if (isEnabled) {
    const repeatableJobs = await currentPriceRecomputeQueue.getRepeatableJobs()
    const scheduledJob = repeatableJobs.find((j) => j.name === 'SCHEDULED_RECOMPUTE')
    if (scheduledJob?.next != null) {
      nextRunAt = new Date(scheduledJob.next)
    }
  }

  return {
    enabled: isEnabled,
    cronPattern: RECOMPUTE_CRON,
    nextRunAt,
    queuedJobs: queueCounts.waiting + queueCounts.active,
  }
}

/**
 * Manually trigger a full recompute (for admin/testing)
 */
export async function triggerFullRecompute(triggeredBy?: string): Promise<string> {
  return enqueueCurrentPriceRecompute({
    scope: 'FULL',
    trigger: 'MANUAL',
    triggeredBy: triggeredBy ?? 'manual',
  })
}
