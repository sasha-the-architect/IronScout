/**
 * Affiliate Feed Scheduler
 *
 * Runs as a repeatable job (every minute) to:
 * 1. Find feeds that are due for processing
 * 2. Enqueue them for the worker
 * 3. Update nextRunAt
 *
 * Uses FOR UPDATE SKIP LOCKED for safe concurrent scheduling.
 *
 * Per spec Section 8.1: Singleton scheduler with advisory locking.
 */

import { Worker, Job } from 'bullmq'
import { prisma, isAffiliateSchedulerEnabled } from '@ironscout/db'
import { redisConnection } from '../config/redis'
import {
  QUEUE_NAMES,
  AffiliateFeedSchedulerJobData,
  affiliateFeedQueue,
  affiliateFeedSchedulerQueue,
} from '../config/queues'
import { logger } from '../config/logger'

const log = logger.affiliate

// Run retention configuration (default 30 days)
const RUN_RETENTION_DAYS = Number(process.env.AFFILIATE_RUN_RETENTION_DAYS ?? 30)
const RUN_RETENTION_MS = RUN_RETENTION_DAYS * 24 * 60 * 60 * 1000

// Max deletes per cleanup batch to avoid long-running transactions
const CLEANUP_BATCH_SIZE = 1000

/**
 * Create and start the affiliate feed scheduler worker
 *
 * NOTE: The caller (worker.ts) is responsible for checking if the scheduler
 * should be enabled via isAffiliateSchedulerEnabled() from the database.
 * This function assumes it should run when called.
 */
export function createAffiliateFeedScheduler() {
  const worker = new Worker<AffiliateFeedSchedulerJobData>(
    QUEUE_NAMES.AFFILIATE_FEED_SCHEDULER,
    async (job: Job<AffiliateFeedSchedulerJobData>) => {
      const jobType = (job.data as { type?: string }).type || 'scheduler-tick'

      if (jobType === 'cleanup-runs') {
        return cleanupOldRuns()
      }

      return schedulerTick()
    },
    {
      connection: redisConnection,
      concurrency: 1, // Only one scheduler tick at a time
    }
  )

  worker.on('completed', (job) => {
    log.debug('Scheduler tick completed', { jobId: job.id })
  })

  worker.on('failed', (job, error) => {
    log.error('Scheduler tick failed', { jobId: job?.id }, error)
  })

  // Set up the repeatable job (every minute)
  setupRepeatableJob()

  log.info('Affiliate feed scheduler started')

  return worker
}

/**
 * Set up the repeatable scheduler jobs
 */
async function setupRepeatableJob() {
  try {
    // Remove any existing repeatable jobs first
    const repeatableJobs = await affiliateFeedSchedulerQueue.getRepeatableJobs()
    for (const job of repeatableJobs) {
      await affiliateFeedSchedulerQueue.removeRepeatableByKey(job.key)
    }

    // Add scheduler tick job (every minute)
    await affiliateFeedSchedulerQueue.add(
      'scheduler-tick',
      { type: 'scheduler-tick' },
      {
        repeat: {
          pattern: '* * * * *', // Every minute
        },
        jobId: 'affiliate-feed-scheduler-tick',
      }
    )

    // Add daily cleanup job (03:15 UTC daily)
    await affiliateFeedSchedulerQueue.add(
      'cleanup-runs',
      { type: 'cleanup-runs' },
      {
        repeat: {
          pattern: '15 3 * * *', // 03:15 UTC daily
        },
        jobId: 'affiliate-feed-cleanup-runs',
      }
    )

    log.info('Repeatable scheduler jobs configured', {
      schedulerTick: 'every minute',
      cleanup: '03:15 UTC daily',
      retentionDays: RUN_RETENTION_DAYS,
    })
  } catch (error) {
    log.error('Failed to set up repeatable scheduler jobs', {}, error as Error)
  }
}

/**
 * Scheduler tick: Find and enqueue due feeds
 *
 * Uses atomic claim pattern:
 * 1. SELECT + UPDATE in single transaction (claim feed by advancing nextRunAt)
 * 2. Enqueue job to BullMQ (outside transaction)
 *
 * This prevents double-enqueuing if scheduler crashes between claim and enqueue.
 * If enqueue fails after claim, the feed simply won't run until next scheduled time.
 */
async function schedulerTick(): Promise<{ processed: number }> {
  const now = new Date()
  let processed = 0
  const tickStart = Date.now()

  log.debug('AFFILIATE_SCHEDULER_TICK_START', {
    timestamp: now.toISOString(),
    tickId: `tick-${now.getTime()}`,
  })

  try {
    // Atomically claim due feeds by selecting AND updating nextRunAt in one transaction
    // This prevents double-enqueuing: once claimed, the feed won't be selected again
    log.debug('AFFILIATE_SCHEDULER_CLAIM_START', {
      timestamp: now.toISOString(),
    })
    const claimStart = Date.now()

    const claimedFeeds = await prisma.$transaction(async (tx) => {
      // Find feeds that are due for processing
      // Uses FOR UPDATE SKIP LOCKED to safely handle concurrent schedulers
      const dueFeeds = await tx.$queryRaw<
        Array<{
          id: string
          sourceId: string
          scheduleFrequencyHours: number | null
          nextRunAt: Date
        }>
      >`
        SELECT id, "sourceId", "scheduleFrequencyHours", "nextRunAt"
        FROM affiliate_feeds
        WHERE status = 'ENABLED'
          AND "nextRunAt" <= ${now}
          AND "manualRunPending" = false
        FOR UPDATE SKIP LOCKED
        LIMIT 10
      `

      log.debug('AFFILIATE_SCHEDULER_DUE_FEEDS_FOUND', {
        count: dueFeeds.length,
        feedIds: dueFeeds.map(f => f.id),
      })

      if (dueFeeds.length === 0) {
        return []
      }

      // Claim each feed by updating nextRunAt atomically
      // This happens BEFORE enqueuing, so if we crash after this,
      // the feed won't be re-claimed (it's scheduled for the future)
      for (const feed of dueFeeds) {
        if (feed.scheduleFrequencyHours && feed.nextRunAt) {
          // Calculate next run based on PREVIOUS nextRunAt to maintain schedule consistency
          // This ensures feeds stay on their configured schedule (e.g., every 6h at X:30)
          // rather than drifting based on when the job actually ran
          let nextRunAt = new Date(
            feed.nextRunAt.getTime() + feed.scheduleFrequencyHours * 3600000
          )
          // If the calculated next run is still in the past (feed was very delayed),
          // use now + frequency as fallback to avoid scheduling in the past
          if (nextRunAt <= now) {
            nextRunAt = new Date(now.getTime() + feed.scheduleFrequencyHours * 3600000)
          }
          await tx.affiliate_feeds.update({
            where: { id: feed.id },
            data: { nextRunAt },
          })
          log.debug('AFFILIATE_FEED_CLAIMED', {
            feedId: feed.id,
            sourceId: feed.sourceId,
            scheduleFrequencyHours: feed.scheduleFrequencyHours,
            previousNextRunAt: feed.nextRunAt.toISOString(),
            nextRunAt: nextRunAt.toISOString(),
          })
        }
      }

      return dueFeeds
    })

    log.debug('AFFILIATE_SCHEDULER_CLAIM_COMPLETE', {
      claimedCount: claimedFeeds.length,
      durationMs: Date.now() - claimStart,
    })

    if (claimedFeeds.length === 0) {
      log.debug('AFFILIATE_SCHEDULER_NO_FEEDS_DUE', {
        tickDurationMs: Date.now() - tickStart,
      })
      return { processed: 0 }
    }

    log.info('AFFILIATE_SCHEDULER_FEEDS_CLAIMED', {
      count: claimedFeeds.length,
      feedIds: claimedFeeds.map(f => f.id),
    })

    // Enqueue jobs for claimed feeds (outside transaction)
    // If this fails, the feed is already claimed (nextRunAt advanced),
    // so it won't be double-enqueued. It will run at next scheduled time.
    for (const feed of claimedFeeds) {
      try {
        const jobId = `${feed.id}-scheduled-${Date.now()}`
        log.debug('AFFILIATE_FEED_ENQUEUEING', {
          feedId: feed.id,
          sourceId: feed.sourceId,
          trigger: 'SCHEDULED',
          jobId,
        })

        await affiliateFeedQueue.add(
          'process',
          { feedId: feed.id, trigger: 'SCHEDULED' },
          { jobId }
        )
        processed++
        log.info('AFFILIATE_FEED_ENQUEUED', {
          feedId: feed.id,
          sourceId: feed.sourceId,
          trigger: 'SCHEDULED',
          jobId,
        })
      } catch (error) {
        // Feed was claimed but enqueue failed - will retry at next scheduled time
        log.error('AFFILIATE_FEED_ENQUEUE_FAILED', {
          feedId: feed.id,
          sourceId: feed.sourceId,
          error: error instanceof Error ? error.message : String(error),
        }, error as Error)
      }
    }

    // Also check for manual run pending feeds
    // Manual runs don't need atomic claiming - they use the manualRunPending flag
    log.debug('AFFILIATE_SCHEDULER_CHECK_MANUAL_PENDING')
    const manualPendingFeeds = await prisma.affiliate_feeds.findMany({
      where: {
        manualRunPending: true,
        status: { in: ['ENABLED', 'PAUSED', 'DISABLED'] },
      },
      select: { id: true },
      take: 10,
    })

    log.debug('AFFILIATE_SCHEDULER_MANUAL_PENDING_FOUND', {
      count: manualPendingFeeds.length,
      feedIds: manualPendingFeeds.map(f => f.id),
    })

    for (const feed of manualPendingFeeds) {
      try {
        // Check if there's already a job for this feed
        const existingJobs = await affiliateFeedQueue.getJobs(['waiting', 'active'])
        const hasExisting = existingJobs.some(
          (j) => j.data.feedId === feed.id && j.data.trigger === 'MANUAL'
        )

        if (hasExisting) {
          log.debug('AFFILIATE_MANUAL_FEED_ALREADY_QUEUED', {
            feedId: feed.id,
            decision: 'SKIP',
          })
          continue
        }

        const jobId = `${feed.id}-manual-${Date.now()}`
        log.debug('AFFILIATE_MANUAL_FEED_ENQUEUEING', {
          feedId: feed.id,
          trigger: 'MANUAL',
          jobId,
        })

        await affiliateFeedQueue.add(
          'process',
          { feedId: feed.id, trigger: 'MANUAL' },
          { jobId }
        )
        processed++
        log.info('AFFILIATE_MANUAL_FEED_ENQUEUED', {
          feedId: feed.id,
          trigger: 'MANUAL',
          jobId,
        })
      } catch (error) {
        log.error('AFFILIATE_MANUAL_FEED_ENQUEUE_FAILED', {
          feedId: feed.id,
          error: error instanceof Error ? error.message : String(error),
        }, error as Error)
      }
    }

    log.debug('AFFILIATE_SCHEDULER_TICK_COMPLETE', {
      processed,
      scheduledCount: claimedFeeds.length,
      manualCount: manualPendingFeeds.length,
      tickDurationMs: Date.now() - tickStart,
    })

    return { processed }
  } catch (error) {
    log.error('AFFILIATE_SCHEDULER_TICK_ERROR', {
      tickDurationMs: Date.now() - tickStart,
      error: error instanceof Error ? error.message : String(error),
    }, error as Error)
    throw error
  }
}

/**
 * Manually trigger the scheduler tick (for testing/admin use)
 */
export async function triggerSchedulerTick(): Promise<{ processed: number }> {
  return schedulerTick()
}

/**
 * Get scheduler status
 */
export async function getSchedulerStatus(): Promise<{
  enabled: boolean
  nextTickAt: Date | null
  dueFeeds: number
  pendingManualRuns: number
}> {
  const now = new Date()

  // Check if scheduler is enabled from database setting
  const enabled = await isAffiliateSchedulerEnabled()

  const dueFeeds = await prisma.affiliate_feeds.count({
    where: {
      status: 'ENABLED',
      nextRunAt: { lte: now },
    },
  })

  const pendingManualRuns = await prisma.affiliate_feeds.count({
    where: { manualRunPending: true },
  })

  // Get next repeatable job
  let nextTickAt: Date | null = null
  if (enabled) {
    const repeatableJobs = await affiliateFeedSchedulerQueue.getRepeatableJobs()
    if (repeatableJobs.length > 0 && repeatableJobs[0].next != null) {
      nextTickAt = new Date(repeatableJobs[0].next)
    }
  }

  return {
    enabled,
    nextTickAt,
    dueFeeds,
    pendingManualRuns,
  }
}

/**
 * Clean up old affiliate feed runs
 *
 * Deletes runs older than RUN_RETENTION_DAYS that are in terminal status.
 * Uses batching to avoid long-running transactions.
 *
 * Per spec Section 15.5: 30-day retention by default.
 */
async function cleanupOldRuns(): Promise<{ deleted: number }> {
  const cutoff = new Date(Date.now() - RUN_RETENTION_MS)
  let totalDeleted = 0

  log.info('Starting affiliate feed run cleanup', {
    cutoffDate: cutoff.toISOString(),
    retentionDays: RUN_RETENTION_DAYS,
  })

  try {
    // Delete in batches to avoid long-running transactions
    let batchDeleted: number

    do {
      // Find runs to delete (only terminal statuses)
      const runsToDelete = await prisma.affiliate_feed_runs.findMany({
        where: {
          finishedAt: { lt: cutoff },
          status: { in: ['SUCCEEDED', 'FAILED'] },
        },
        select: { id: true },
        take: CLEANUP_BATCH_SIZE,
      })

      if (runsToDelete.length === 0) {
        break
      }

      // Delete batch (cascades to AffiliateFeedRunError and SourceProductSeen)
      // Price.affiliateFeedRunId is SET NULL (prices preserved per ADR-004)
      const result = await prisma.affiliate_feed_runs.deleteMany({
        where: {
          id: { in: runsToDelete.map((r) => r.id) },
        },
      })

      batchDeleted = result.count
      totalDeleted += batchDeleted

      log.debug('Cleanup batch complete', {
        batchDeleted,
        totalDeleted,
        cutoffDate: cutoff.toISOString(),
      })
    } while (batchDeleted === CLEANUP_BATCH_SIZE)

    log.info('Affiliate feed run cleanup complete', {
      totalDeleted,
      cutoffDate: cutoff.toISOString(),
      retentionDays: RUN_RETENTION_DAYS,
    })

    return { deleted: totalDeleted }
  } catch (error) {
    log.error('Cleanup failed', { totalDeleted }, error as Error)
    throw error
  }
}

/**
 * Manually trigger cleanup (for testing/admin use)
 */
export async function triggerCleanup(): Promise<{ deleted: number }> {
  return cleanupOldRuns()
}
