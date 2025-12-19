/**
 * Dealer Portal Job Scheduler
 *
 * Schedules recurring dealer portal jobs:
 * - Feed ingestion (hourly by default, per-feed schedule)
 * - Benchmark calculation (every 2 hours)
 * - Insight generation (after benchmarks)
 *
 * Features:
 * - Respects feed.enabled flag
 * - Applies scheduling jitter to prevent thundering herd
 * - Skips failed feeds until manually re-enabled
 */

import { prisma } from '@ironscout/db'
import {
  dealerFeedIngestQueue,
  dealerBenchmarkQueue,
} from '../config/queues'

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
 */
export async function scheduleDealerFeeds(): Promise<number> {
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
  const now = new Date()

  for (const feed of feeds) {
    // Check if feed is due for refresh
    const lastRun = feed.lastRunAt || feed.lastSuccessAt || feed.createdAt
    const minutesSinceRun = (now.getTime() - lastRun.getTime()) / (1000 * 60)

    if (minutesSinceRun < feed.scheduleMinutes) {
      continue // Not due yet
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

    // Queue the job with jitter delay
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
        jobId: `feed-${feed.id}-${now.getTime()}`,
        delay: jitterMs, // Apply jitter
      }
    )

    scheduledCount++
  }

  if (scheduledCount > 0) {
    console.log(`[Dealer Scheduler] Scheduled ${scheduledCount} feed ingestion jobs`)
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
    console.log(
      `[Dealer Scheduler] Admin override feed ingestion for ${feed.dealer.businessName} (admin: ${adminId || 'unknown'})`
    )
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

  console.log(`[Dealer Scheduler] Feed ${feedId} ${enabled ? 'enabled' : 'disabled'}`)
}

// ============================================================================
// BENCHMARK SCHEDULING
// ============================================================================

/**
 * Schedule benchmark recalculation for all canonical SKUs
 */
export async function scheduleBenchmarkRecalc(fullRecalc: boolean = false): Promise<void> {
  await dealerBenchmarkQueue.add(
    'recalc',
    { fullRecalc },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30000 },
      jobId: `benchmark-${fullRecalc ? 'full' : 'incremental'}-${Date.now()}`,
    }
  )
  
  console.log(`[Dealer Scheduler] Scheduled ${fullRecalc ? 'full' : 'incremental'} benchmark recalculation`)
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
      console.log(
        `[Dealer Scheduler] ${label} failed (attempt ${attempt}/${maxAttempts}), ` +
          `retrying in ${delayMs / 1000}s: ${lastError.message?.substring(0, 100)}`
      )

      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }

  throw lastError
}

// ============================================================================
// SCHEDULED RUNNER
// ============================================================================

let feedSchedulerInterval: NodeJS.Timeout | null = null
let benchmarkSchedulerInterval: NodeJS.Timeout | null = null

/**
 * Start the dealer job scheduler
 */
export function startDealerScheduler(): void {
  console.log('[Dealer Scheduler] Starting...')

  // Schedule feed ingestion every 5 minutes (jobs will check individual feed schedules)
  feedSchedulerInterval = setInterval(async () => {
    try {
      await withRetry(() => scheduleDealerFeeds(), {
        label: 'Feed scheduling',
        maxAttempts: 3,
      })
    } catch (error) {
      console.error('[Dealer Scheduler] Feed scheduling error:', error)
    }
  }, 5 * 60 * 1000) // 5 minutes

  // Schedule benchmark recalculation every 2 hours
  benchmarkSchedulerInterval = setInterval(async () => {
    try {
      await withRetry(() => scheduleBenchmarkRecalc(false), {
        label: 'Benchmark scheduling',
        maxAttempts: 3,
      })
    } catch (error) {
      console.error('[Dealer Scheduler] Benchmark scheduling error:', error)
    }
  }, 2 * 60 * 60 * 1000) // 2 hours

  // Run initial scheduling with retry (connection may not be ready immediately)
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
      console.error('[Dealer Scheduler] Initial scheduling failed after retries:', error)
    }
  }, 10000) // 10 seconds after startup

  console.log('[Dealer Scheduler] Started')
}

/**
 * Stop the dealer job scheduler
 */
export function stopDealerScheduler(): void {
  if (feedSchedulerInterval) {
    clearInterval(feedSchedulerInterval)
    feedSchedulerInterval = null
  }
  
  if (benchmarkSchedulerInterval) {
    clearInterval(benchmarkSchedulerInterval)
    benchmarkSchedulerInterval = null
  }
  
  console.log('[Dealer Scheduler] Stopped')
}
