#!/usr/bin/env node

/**
 * Harvester Worker
 * Starts all pipeline workers to process crawl jobs
 *
 * TODO: Improve database resilience for maintenance windows
 * - Add infinite retry with longer backoff for scheduler during extended outages
 * - Consider health check endpoint that reports DB connectivity status
 * - Evaluate graceful degradation (queue jobs locally, replay when DB returns)
 * See: https://github.com/your-org/ironscout/issues/XXX (create ticket when ready)
 */

// Load environment variables first, before any other imports
import 'dotenv/config'

import { prisma } from '@ironscout/db'
import { warmupRedis } from './config/redis'
import { logger } from './config/logger'
import { schedulerWorker } from './scheduler'
import { fetcherWorker } from './fetcher'
import { extractorWorker } from './extractor'
import { normalizerWorker } from './normalizer'
import { writerWorker } from './writer'
import { alerterWorker } from './alerter'

// Dealer Portal Workers
import { dealerFeedIngestWorker } from './dealer/feed-ingest'
import { dealerSkuMatchWorker } from './dealer/sku-match'
import { dealerBenchmarkWorker } from './dealer/benchmark'
import { dealerInsightWorker } from './dealer/insight'
import { startDealerScheduler, stopDealerScheduler } from './dealer/scheduler'

// Affiliate Feed Workers
import { createAffiliateFeedWorker, createAffiliateFeedScheduler } from './affiliate'

// Create affiliate workers (lazy initialization)
let affiliateFeedWorker: ReturnType<typeof createAffiliateFeedWorker> | null = null
let affiliateFeedScheduler: ReturnType<typeof createAffiliateFeedScheduler> | null = null

/**
 * Check if scheduler is enabled via environment variable.
 *
 * IMPORTANT (ADR-001): Only ONE harvester instance should run schedulers.
 * Set HARVESTER_SCHEDULER_ENABLED=true on exactly one instance in production.
 * All other instances should omit this variable or set it to false.
 *
 * Running multiple schedulers causes duplicate ingestion and data corruption.
 */
const SCHEDULER_ENABLED = process.env.HARVESTER_SCHEDULER_ENABLED === 'true'

const log = logger.worker
const dbLog = logger.database

/**
 * Warm up database connection with retries
 */
async function warmupDatabase(maxAttempts = 5): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      dbLog.info('Connection attempt', { attempt, maxAttempts })
      await prisma.$queryRaw`SELECT 1`
      dbLog.info('Connection established successfully')
      return true
    } catch (error) {
      const err = error as Error
      dbLog.error('Connection failed', { error: err.message })

      if (attempt < maxAttempts) {
        const delayMs = Math.min(2000 * Math.pow(2, attempt - 1), 30000)
        dbLog.info('Retrying', { delayMs })
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    }
  }

  dbLog.error('Failed to establish connection after all attempts', { maxAttempts })
  return false
}

log.info('Starting IronScout.ai Harvester Workers', {
  schedulerEnabled: SCHEDULER_ENABLED,
  workers: [
    'scheduler',
    'fetcher',
    'extractor',
    'normalizer',
    'writer',
    'alerter',
  ],
  dealerWorkers: [
    'feed-ingest',
    'sku-match',
    'benchmark',
    'insight',
  ],
  affiliateWorkers: [
    'affiliate-feed',
    'affiliate-feed-scheduler',
  ],
})

// Warm up Redis and database connections before starting workers
async function startup() {
  // Redis must be available for BullMQ workers to function
  const redisConnected = await warmupRedis()
  if (!redisConnected) {
    log.error('Redis not available - cannot start workers')
    process.exit(1)
  }

  if (!SCHEDULER_ENABLED) {
    log.info('Scheduler disabled - this instance will only process jobs, not create them')
    return
  }

  // Database is only required for scheduler
  const dbConnected = await warmupDatabase()
  if (dbConnected) {
    log.info('Starting dealer scheduler')
    await startDealerScheduler()

    // Start affiliate feed scheduler and worker
    log.info('Starting affiliate feed workers')
    affiliateFeedWorker = createAffiliateFeedWorker()
    affiliateFeedScheduler = createAffiliateFeedScheduler()
  } else {
    log.error('Database not ready - scheduler will not start')
  }
}

startup()

// Track if shutdown is in progress to prevent double-shutdown
let isShuttingDown = false

// Graceful shutdown
const shutdown = async (signal: string) => {
  if (isShuttingDown) {
    log.warn('Shutdown already in progress')
    return
  }
  isShuttingDown = true

  const shutdownStart = Date.now()
  log.info('Starting graceful shutdown', { signal })

  try {
    // 1. Stop scheduling new jobs (if scheduler was enabled)
    if (SCHEDULER_ENABLED) {
      log.info('Stopping scheduler')
      stopDealerScheduler()
    }

    // 2. Close workers (waits for current jobs to complete)
    log.info('Waiting for workers to finish current jobs')
    await Promise.all([
      schedulerWorker.close(),
      fetcherWorker.close(),
      extractorWorker.close(),
      normalizerWorker.close(),
      writerWorker.close(),
      alerterWorker.close(),
      // Dealer workers
      dealerFeedIngestWorker.close(),
      dealerSkuMatchWorker.close(),
      dealerBenchmarkWorker.close(),
      dealerInsightWorker.close(),
      // Affiliate workers (if started)
      affiliateFeedWorker?.close(),
      affiliateFeedScheduler?.close(),
    ])
    log.info('All workers closed')

    // 3. Disconnect from database
    log.info('Disconnecting from database')
    await prisma.$disconnect()

    const durationMs = Date.now() - shutdownStart
    log.info('Graceful shutdown complete', { durationMs })
    process.exit(0)
  } catch (error) {
    const err = error as Error
    log.error('Error during shutdown', { error: err.message })
    process.exit(1)
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

log.info('Workers are running')
