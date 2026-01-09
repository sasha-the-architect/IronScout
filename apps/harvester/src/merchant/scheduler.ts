/**
 * Retailer Portal Job Scheduler
 *
 * Schedules recurring retailer portal jobs:
 * - Feed ingestion (hourly by default, per-feed schedule)
 *
 * Features:
 * - Uses BullMQ repeatable jobs (inherently idempotent across replicas)
 * - Idempotent job creation per (feedId, scheduledWindow)
 * - Respects feed.enabled flag
 * - Applies scheduling jitter to prevent thundering herd
 * - Skips failed feeds until manually re-enabled
 *
 * ADR-001 Scope Clarification:
 * ADR-001 (Singleton Harvester Scheduler) applies to the CRAWL scheduler
 * which creates execution_logs and requires explicit singleton enforcement
 * via HARVESTER_SCHEDULER_ENABLED.
 *
 * This retailer scheduler uses BullMQ repeatable jobs which handle
 * deduplication internally - multiple instances scheduling the same
 * repeatable job is safe because BullMQ deduplicates by jobId.
 * This achieves the "no duplicate runs" invariant through a different
 * mechanism than explicit singleton enforcement.
 */

import { prisma } from '@ironscout/db'
import { Worker, Job, Queue } from 'bullmq'
import { redisConnection } from '../config/redis'
import {
  retailerFeedIngestQueue,
  QUEUE_NAMES,
} from '../config/queues'
import { logger } from '../config/logger'

const log = logger.scheduler

// ============================================================================
// SCHEDULING QUEUE (for repeatable scheduler jobs)
// ============================================================================

/**
 * Get the current scheduling window (5-minute bucket)
 * Used for idempotency: only one job per feed per window
 */
function getSchedulingWindow(): string {
  const now = new Date()
  // Round down to 5-minute boundary
  const minutes = Math.floor(now.getMinutes() / 5) * 5
  now.setMinutes(minutes, 0, 0)
  return now.toISOString()
}

/**
 * Get the current hourly window (for crawl scheduling)
 */
function getHourlyWindow(): string {
  const now = new Date()
  now.setMinutes(0, 0, 0)
  return now.toISOString()
}

// ============================================================================
// SCHEDULING UTILITIES
// ============================================================================

/**
 * Generate a random jitter value in milliseconds
 * @param maxJitterMinutes Maximum jitter in minutes (default: 2)
 */
function getSchedulingJitter(maxJitterMinutes: number = 2): number {
  return Math.floor(Math.random() * maxJitterMinutes * 60 * 1000)
}

// ============================================================================
// FEED SCHEDULING
// ============================================================================

/**
 * Schedule feed ingestion for all active retailer feeds
 * - Only schedules enabled feeds
 * - Applies random jitter to prevent thundering herd
 * - Idempotent: uses jobId based on (feedId, schedulingWindow)
 */
export async function scheduleRetailerFeeds(): Promise<number> {
  const schedulingWindow = getSchedulingWindow()

  log.debug('RETAILER_FEED_SCHEDULE_START', {
    schedulingWindow,
    timestamp: new Date().toISOString(),
  })

  // Get all enabled feeds from active retailers (with merchant associations) that are not failed
  const queryStart = Date.now()
  const feeds = await prisma.retailer_feeds.findMany({
    where: {
      enabled: true, // Only enabled feeds
      retailers: {
        merchant_retailers: {
          some: {
            merchants: {
              status: 'ACTIVE',
            },
          },
        },
      },
      status: { not: 'FAILED' }, // Don't auto-retry failed feeds
    },
    include: {
      retailers: {
        select: { id: true },
      },
    },
  })

  log.debug('RETAILER_FEEDS_LOADED', {
    feedCount: feeds.length,
    queryDurationMs: Date.now() - queryStart,
    schedulingWindow,
  })

  let scheduledCount = 0
  let skippedCount = 0
  let notDueCount = 0
  let alreadyScheduledCount = 0
  let errorCount = 0
  const now = new Date()

  for (const feed of feeds) {
    try {
      // Check if feed is due for refresh
      const lastRun = feed.lastRunAt || feed.lastSuccessAt || feed.createdAt
      const minutesSinceRun = (now.getTime() - lastRun.getTime()) / (1000 * 60)

      if (minutesSinceRun < feed.scheduleMinutes) {
        notDueCount++
        log.debug('RETAILER_FEED_NOT_DUE', {
          feedId: feed.id,
          retailerId: feed.retailerId,
          minutesSinceRun: Math.round(minutesSinceRun),
          scheduleMinutes: feed.scheduleMinutes,
          nextDueInMinutes: Math.round(feed.scheduleMinutes - minutesSinceRun),
          decision: 'SKIP_NOT_DUE',
        })
        continue // Not due yet
      }

      // Idempotent job ID: only one job per feed per scheduling window
      // BullMQ job IDs cannot contain colons, so sanitize the ISO timestamp
      const sanitizedWindow = schedulingWindow.replace(/[:.]/g, '-')
      const jobId = `feed-${feed.id}-${sanitizedWindow}`

      // Check if job already exists (idempotency check)
      const existingJob = await retailerFeedIngestQueue.getJob(jobId)
      if (existingJob) {
        alreadyScheduledCount++
        skippedCount++
        log.debug('RETAILER_FEED_ALREADY_SCHEDULED', {
          feedId: feed.id,
          retailerId: feed.retailerId,
          jobId,
          existingJobState: await existingJob.getState(),
          decision: 'SKIP_IDEMPOTENT',
        })
        continue // Already scheduled in this window
      }

      log.debug('RETAILER_FEED_SCHEDULING', {
        feedId: feed.id,
        retailerId: feed.retailerId,
        minutesSinceRun: Math.round(minutesSinceRun),
        scheduleMinutes: feed.scheduleMinutes,
        jobId,
      })

      // Create feed run record
      const feedRun = await prisma.retailer_feed_runs.create({
        data: {
          retailerId: feed.retailerId,
          feedId: feed.id,
          status: 'PENDING',
        },
      })

      // Apply random jitter (0-2 minutes) to prevent thundering herd
      const jitterMs = getSchedulingJitter(2)

      // Queue the job with idempotent jobId
      // SECURITY: Must add to queue BEFORE updating lastRunAt
      // If Redis fails, the job should be retried on next scheduler run
      await retailerFeedIngestQueue.add(
        'ingest',
        {
          retailerId: feed.retailerId,
          feedId: feed.id,
          feedRunId: feedRun.id,
          accessType: feed.accessType,
          formatType: feed.formatType,
          url: feed.url || undefined,
          username: feed.username || undefined,
          password: feed.password || undefined,
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 30000 },
          jobId, // Idempotent job ID
          delay: jitterMs, // Apply jitter
        }
      )

      // Update lastRunAt ONLY AFTER successful enqueue
      // This prevents missed ingestion if Redis fails
      await prisma.retailer_feeds.update({
        where: { id: feed.id },
        data: { lastRunAt: now },
      })

      log.debug('RETAILER_FEED_SCHEDULED', {
        feedId: feed.id,
        retailerId: feed.retailerId,
        feedRunId: feedRun.id,
        jobId,
        jitterMs,
        decision: 'SCHEDULED',
      })

      scheduledCount++
    } catch (error) {
      // Log error but continue with remaining feeds
      errorCount++
      log.error('RETAILER_FEED_SCHEDULE_ERROR', {
        feedId: feed.id,
        retailerId: feed.retailerId,
        error: error instanceof Error ? error.message : String(error),
        decision: 'CONTINUE_LOOP',
      }, error instanceof Error ? error : undefined)
    }
  }

  log.info('RETAILER_FEED_SCHEDULE_TICK', {
    schedulingWindow,
    feedsEvaluated: feeds.length,
    scheduledCount,
    skippedCount,
    notDueCount,
    alreadyScheduledCount,
    errorCount,
  })

  return scheduledCount
}

/**
 * Options for immediate feed ingestion
 */
export interface ImmediateFeedIngestOptions {
  adminOverride?: boolean // Bypass subscription checks
  adminId?: string // Admin who triggered the run (for audit logging)
}

/**
 * Schedule a single feed for immediate ingestion
 * - Ignores enabled flag (manual trigger)
 * - Resets feed status if previously failed
 * - Supports admin override to bypass subscription checks
 */
export async function scheduleImmediateFeedIngest(
  feedId: string,
  options: ImmediateFeedIngestOptions = {}
): Promise<string> {
  const { adminOverride = false, adminId } = options

  const feed = await prisma.retailer_feeds.findUnique({
    where: { id: feedId },
    include: {
      retailers: {
        select: {
          id: true,
          merchant_retailers: {
            select: {
              merchants: {
                select: { id: true, status: true, businessName: true },
              },
            },
          },
        },
      },
    },
  })

  if (!feed) {
    throw new Error('Feed not found')
  }

  // Check if any associated merchant is active
  const activeMerchant = feed.retailers.merchant_retailers.find(
    (mr) => mr.merchants.status === 'ACTIVE'
  )
  if (!activeMerchant) {
    throw new Error('No active merchant account associated with this retailer')
  }

  // Reset feed status if it was failed (manual trigger re-enables)
  if (feed.status === 'FAILED') {
    await prisma.retailer_feeds.update({
      where: { id: feedId },
      data: {
        status: 'PENDING',
        lastError: null,
        primaryErrorCode: null,
      },
    })
  }

  // Create feed run record
  const feedRun = await prisma.retailer_feed_runs.create({
    data: {
      retailerId: feed.retailerId,
      feedId: feed.id,
      status: 'PENDING',
    },
  })

  // Queue the job with high priority (no jitter for manual triggers)
  await retailerFeedIngestQueue.add(
    adminOverride ? 'ingest-admin-override' : 'ingest-immediate',
    {
      retailerId: feed.retailerId,
      feedId: feed.id,
      feedRunId: feedRun.id,
      accessType: feed.accessType,
      formatType: feed.formatType,
      url: feed.url || undefined,
      username: feed.username || undefined,
      password: feed.password || undefined,
      // Admin override fields
      adminOverride,
      adminId,
    },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 10000 },
      priority: 1, // High priority
    }
  )

  if (adminOverride) {
    log.info('Admin override feed ingestion', {
      businessName: activeMerchant.merchants.businessName,
      adminId: adminId || 'unknown',
    })
  }

  return feedRun.id
}

/**
 * Enable or disable a feed
 */
export async function setFeedEnabled(feedId: string, enabled: boolean): Promise<void> {
  await prisma.retailer_feeds.update({
    where: { id: feedId },
    data: {
      enabled,
      // Clear error state when re-enabling
      ...(enabled && {
        status: 'PENDING',
        lastError: null,
        primaryErrorCode: null,
      }),
    },
  })

  log.info('Feed status changed', { feedId, enabled })
}

// ============================================================================
// BENCHMARK SCHEDULING
// ============================================================================

/**
 * Get the current 2-hour window (for benchmark scheduling)
 */
function getBenchmarkWindow(): string {
  const now = new Date()
  // Round down to 2-hour boundary
  const hours = Math.floor(now.getHours() / 2) * 2
  now.setHours(hours, 0, 0, 0)
  return now.toISOString()
}

/**
 * Schedule benchmark recalculation - STUB for v1
 * Note: Benchmark subsystem removed for v1
 */
export async function scheduleBenchmarkRecalc(_fullRecalc: boolean = false): Promise<boolean> {
  // Benchmark subsystem removed for v1
  return false
}

// ============================================================================
// RETRY UTILITIES
// ============================================================================

/**
 * Execute a function with exponential backoff retry
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number
    initialDelayMs?: number
    maxDelayMs?: number
    label?: string
  } = {}
): Promise<T> {
  const {
    maxAttempts = 5,
    initialDelayMs = 5000,
    maxDelayMs = 60000,
    label = 'operation',
  } = options

  let lastError: Error | undefined

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error

      const isConnectionError =
        lastError.message?.includes('ECONNREFUSED') ||
        lastError.message?.includes('connection') ||
        (lastError as { code?: string }).code === 'ECONNREFUSED'

      if (!isConnectionError || attempt === maxAttempts) {
        throw lastError
      }

      const delayMs = Math.min(initialDelayMs * Math.pow(2, attempt - 1), maxDelayMs)
      log.warn('Operation failed, retrying', {
        label,
        attempt,
        maxAttempts,
        retryInSeconds: delayMs / 1000,
        error: lastError.message?.substring(0, 100),
      })

      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }

  throw lastError
}

// ============================================================================
// BULLMQ REPEATABLE SCHEDULER
// ============================================================================

// Scheduler queue for repeatable jobs
const RETAILER_SCHEDULER_QUEUE = 'retailer-scheduler'

export interface RetailerSchedulerJobData {
  type: 'feeds' | 'benchmarks'
}

// Create the scheduler queue
export const retailerSchedulerQueue = new Queue<RetailerSchedulerJobData>(
  RETAILER_SCHEDULER_QUEUE,
  { connection: redisConnection }
)

// Scheduler worker - processes repeatable scheduler jobs
let schedulerWorker: Worker<RetailerSchedulerJobData> | null = null

/**
 * Start the retailer job scheduler using BullMQ repeatable jobs
 * Safe for multiple replicas - BullMQ ensures only one instance processes each job
 */
export async function startRetailerScheduler(): Promise<void> {
  log.info('Starting with BullMQ repeatable jobs')

  // Create the worker to process scheduler jobs
  schedulerWorker = new Worker<RetailerSchedulerJobData>(
    RETAILER_SCHEDULER_QUEUE,
    async (job: Job<RetailerSchedulerJobData>) => {
      const { type } = job.data

      try {
        if (type === 'feeds') {
          await withRetry(() => scheduleRetailerFeeds(), {
            label: 'Feed scheduling',
            maxAttempts: 3,
          })
        } else if (type === 'benchmarks') {
          await withRetry(() => scheduleBenchmarkRecalc(false), {
            label: 'Benchmark scheduling',
            maxAttempts: 3,
          })
        }
      } catch (error) {
        log.error('Scheduling error', { type, error: error instanceof Error ? error.message : String(error) }, error instanceof Error ? error : undefined)
        throw error // Let BullMQ handle retry
      }
    },
    {
      connection: redisConnection,
      concurrency: 1, // Process one scheduler job at a time
    }
  )

  schedulerWorker.on('completed', (job) => {
    log.info('Job completed', { type: job.data.type })
  })

  schedulerWorker.on('failed', (job, err) => {
    log.error('Job failed', { type: job?.data?.type, error: err.message }, err)
  })

  // Remove any existing repeatable jobs before adding new ones
  const existingRepeatableJobs = await retailerSchedulerQueue.getRepeatableJobs()
  for (const job of existingRepeatableJobs) {
    await retailerSchedulerQueue.removeRepeatableByKey(job.key)
  }

  // Add repeatable job for feed scheduling (every 5 minutes)
  await retailerSchedulerQueue.add(
    'schedule-feeds',
    { type: 'feeds' },
    {
      repeat: {
        every: 5 * 60 * 1000, // 5 minutes
      },
      jobId: 'repeatable-feeds', // Stable ID for deduplication
    }
  )

  // Add repeatable job for benchmark scheduling (every 2 hours)
  await retailerSchedulerQueue.add(
    'schedule-benchmarks',
    { type: 'benchmarks' },
    {
      repeat: {
        every: 2 * 60 * 60 * 1000, // 2 hours
      },
      jobId: 'repeatable-benchmarks', // Stable ID for deduplication
    }
  )

  // Run initial scheduling after startup delay
  setTimeout(async () => {
    try {
      await withRetry(() => scheduleRetailerFeeds(), {
        label: 'Initial feed scheduling',
        maxAttempts: 5,
        initialDelayMs: 5000,
      })
      await withRetry(() => scheduleBenchmarkRecalc(false), {
        label: 'Initial benchmark scheduling',
        maxAttempts: 5,
        initialDelayMs: 5000,
      })
    } catch (error) {
      log.error('Initial scheduling failed after retries', { error: error instanceof Error ? error.message : String(error) }, error instanceof Error ? error : undefined)
    }
  }, 10000) // 10 seconds after startup

  log.info('Started with repeatable jobs', {
    feedSchedule: 'every 5 minutes',
    benchmarkSchedule: 'every 2 hours',
  })
}

/**
 * Stop the retailer job scheduler
 */
export async function stopRetailerScheduler(): Promise<void> {
  if (schedulerWorker) {
    await schedulerWorker.close()
    schedulerWorker = null
  }

  log.info('Stopped')
}
