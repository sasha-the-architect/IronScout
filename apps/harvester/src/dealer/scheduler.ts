/**
 * Dealer Portal Job Scheduler
 *
 * Schedules recurring dealer portal jobs:
 * - Feed ingestion (hourly by default, per-feed schedule)
 * - Benchmark calculation (every 2 hours)
 * - Insight generation (after benchmarks)
 *
 * Features:
 * - Uses BullMQ repeatable jobs (safe for multiple replicas)
 * - Idempotent job creation per (feedId, scheduledWindow)
 * - Respects feed.enabled flag
 * - Applies scheduling jitter to prevent thundering herd
 * - Skips failed feeds until manually re-enabled
 */

import { prisma } from '@ironscout/db'
import { Worker, Job, Queue } from 'bullmq'
import { redisConnection } from '../config/redis'
import {
  dealerFeedIngestQueue,
  dealerBenchmarkQueue,
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
 * Schedule feed ingestion for all active dealer feeds
 * - Only schedules enabled feeds
 * - Applies random jitter to prevent thundering herd
 * - Idempotent: uses jobId based on (feedId, schedulingWindow)
 */
export async function scheduleDealerFeeds(): Promise<number> {
  const schedulingWindow = getSchedulingWindow()

  // Get all enabled feeds from active dealers that are not failed
  const feeds = await prisma.dealerFeed.findMany({
    where: {
      enabled: true, // Only enabled feeds
      dealer: {
        status: 'ACTIVE',
      },
      status: { not: 'FAILED' }, // Don't auto-retry failed feeds
    },
    include: {
      dealer: {
        select: { id: true, status: true },
      },
    },
  })

  let scheduledCount = 0
  let skippedCount = 0
  const now = new Date()

  for (const feed of feeds) {
    // Check if feed is due for refresh
    const lastRun = feed.lastRunAt || feed.lastSuccessAt || feed.createdAt
    const minutesSinceRun = (now.getTime() - lastRun.getTime()) / (1000 * 60)

    if (minutesSinceRun < feed.scheduleMinutes) {
      continue // Not due yet
    }

    // Idempotent job ID: only one job per feed per scheduling window
    const jobId = `feed-${feed.id}-${schedulingWindow}`

    // Check if job already exists (idempotency check)
    const existingJob = await dealerFeedIngestQueue.getJob(jobId)
    if (existingJob) {
      skippedCount++
      continue // Already scheduled in this window
    }

    // Update lastRunAt to prevent duplicate scheduling
    await prisma.dealerFeed.update({
      where: { id: feed.id },
      data: { lastRunAt: now },
    })

    // Create feed run record
    const feedRun = await prisma.dealerFeedRun.create({
      data: {
        dealerId: feed.dealerId,
        feedId: feed.id,
        status: 'PENDING',
      },
    })

    // Apply random jitter (0-2 minutes) to prevent thundering herd
    const jitterMs = getSchedulingJitter(2)

    // Queue the job with idempotent jobId
    await dealerFeedIngestQueue.add(
      'ingest',
      {
        dealerId: feed.dealerId,
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

    scheduledCount++
  }

  if (scheduledCount > 0 || skippedCount > 0) {
    log.info('Feed scheduling', { scheduledCount, skippedCount })
  }

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

  const feed = await prisma.dealerFeed.findUnique({
    where: { id: feedId },
    include: {
      dealer: {
        select: { id: true, status: true, businessName: true },
      },
    },
  })

  if (!feed) {
    throw new Error('Feed not found')
  }

  if (feed.dealer.status !== 'ACTIVE') {
    throw new Error('Dealer account is not active')
  }

  // Reset feed status if it was failed (manual trigger re-enables)
  if (feed.status === 'FAILED') {
    await prisma.dealerFeed.update({
      where: { id: feedId },
      data: {
        status: 'PENDING',
        lastError: null,
        primaryErrorCode: null,
      },
    })
  }

  // Create feed run record
  const feedRun = await prisma.dealerFeedRun.create({
    data: {
      dealerId: feed.dealerId,
      feedId: feed.id,
      status: 'PENDING',
    },
  })

  // Queue the job with high priority (no jitter for manual triggers)
  await dealerFeedIngestQueue.add(
    adminOverride ? 'ingest-admin-override' : 'ingest-immediate',
    {
      dealerId: feed.dealerId,
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
      businessName: feed.dealer.businessName,
      adminId: adminId || 'unknown',
    })
  }

  return feedRun.id
}

/**
 * Enable or disable a feed
 */
export async function setFeedEnabled(feedId: string, enabled: boolean): Promise<void> {
  await prisma.dealerFeed.update({
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
 * Schedule benchmark recalculation for all canonical SKUs
 * Idempotent: only one benchmark job per 2-hour window
 */
export async function scheduleBenchmarkRecalc(fullRecalc: boolean = false): Promise<boolean> {
  const benchmarkWindow = getBenchmarkWindow()
  const jobId = `benchmark-${fullRecalc ? 'full' : 'incremental'}-${benchmarkWindow}`

  // Check if job already exists (idempotency check)
  const existingJob = await dealerBenchmarkQueue.getJob(jobId)
  if (existingJob) {
    log.debug('Benchmark already scheduled for window', { benchmarkWindow })
    return false
  }

  await dealerBenchmarkQueue.add(
    'recalc',
    { fullRecalc },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30000 },
      jobId,
    }
  )

  log.info('Scheduled benchmark recalculation', { fullRecalc })
  return true
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
const DEALER_SCHEDULER_QUEUE = 'dealer-scheduler'

export interface DealerSchedulerJobData {
  type: 'feeds' | 'benchmarks'
}

// Create the scheduler queue
export const dealerSchedulerQueue = new Queue<DealerSchedulerJobData>(
  DEALER_SCHEDULER_QUEUE,
  { connection: redisConnection }
)

// Scheduler worker - processes repeatable scheduler jobs
let schedulerWorker: Worker<DealerSchedulerJobData> | null = null

/**
 * Start the dealer job scheduler using BullMQ repeatable jobs
 * Safe for multiple replicas - BullMQ ensures only one instance processes each job
 */
export async function startDealerScheduler(): Promise<void> {
  log.info('Starting with BullMQ repeatable jobs')

  // Create the worker to process scheduler jobs
  schedulerWorker = new Worker<DealerSchedulerJobData>(
    DEALER_SCHEDULER_QUEUE,
    async (job: Job<DealerSchedulerJobData>) => {
      const { type } = job.data

      try {
        if (type === 'feeds') {
          await withRetry(() => scheduleDealerFeeds(), {
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
  const existingRepeatableJobs = await dealerSchedulerQueue.getRepeatableJobs()
  for (const job of existingRepeatableJobs) {
    await dealerSchedulerQueue.removeRepeatableByKey(job.key)
  }

  // Add repeatable job for feed scheduling (every 5 minutes)
  await dealerSchedulerQueue.add(
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
  await dealerSchedulerQueue.add(
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
      await withRetry(() => scheduleDealerFeeds(), {
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
 * Stop the dealer job scheduler
 */
export async function stopDealerScheduler(): Promise<void> {
  if (schedulerWorker) {
    await schedulerWorker.close()
    schedulerWorker = null
  }

  log.info('Stopped')
}
