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

import {
  prisma,
  isHarvesterSchedulerEnabled,
  isAffiliateSchedulerEnabled,
  getHarvesterLogLevel,
  getHarvesterLogLevelOptional,
} from '@ironscout/db'
import { setLogLevel, type LogLevel, flushLogs } from '@ironscout/logger'
import { warmupRedis } from './config/redis'
import { initQueueSettings } from './config/queues'
import { logger } from './config/logger'
import { schedulerWorker } from './scheduler'
import { fetcherWorker } from './fetcher'
import { extractorWorker } from './extractor'
import { normalizerWorker } from './normalizer'
import { writerWorker } from './writer'
import { alerterWorker, delayedNotificationWorker } from './alerter'

// Retailer Portal Workers
import { retailerFeedIngestWorker } from './merchant/feed-ingest'
// Note: sku-match, benchmark, insight workers removed for v1 (benchmark subsystem removed)
import { startRetailerScheduler, stopRetailerScheduler } from './merchant/scheduler'

// Affiliate Feed Workers
import { createAffiliateFeedWorker, createAffiliateFeedScheduler } from './affiliate'

// Product Resolver Worker (Spec v1.2)
import {
  startProductResolverWorker,
  stopProductResolverWorker,
  startProcessingSweeper,
  stopProcessingSweeper,
} from './resolver'

// Embedding Generation Worker
import {
  startEmbeddingWorker,
  stopEmbeddingWorker,
} from './embedding/worker'

// Quarantine Reprocess Worker
import {
  startQuarantineReprocessWorker,
  stopQuarantineReprocessWorker,
} from './quarantine/worker'

// Current Price Recompute Worker (ADR-015)
import {
  startCurrentPriceRecomputeWorker,
  stopCurrentPriceRecomputeWorker,
  startCurrentPriceScheduler,
  stopCurrentPriceScheduler,
} from './currentprice'

import type { Worker } from 'bullmq'

// Create affiliate workers (lazy initialization)
let affiliateFeedWorker: ReturnType<typeof createAffiliateFeedWorker> | null = null
let affiliateFeedScheduler: ReturnType<typeof createAffiliateFeedScheduler> | null = null

// Product resolver worker (lazy initialization)
let resolverWorker: Worker | null = null

// Embedding generation worker (lazy initialization)
let embeddingWorker: Worker | null = null

// Quarantine reprocess worker (lazy initialization)
let quarantineReprocessWorker: Worker | null = null

// Current price recompute worker (ADR-015, lazy initialization)
let currentPriceRecomputeWorker: Worker | null = null

/**
 * Scheduler enabled flags (set during startup from database/env)
 *
 * IMPORTANT (ADR-001): Only ONE harvester instance should run schedulers.
 * Enable via admin settings or HARVESTER_SCHEDULER_ENABLED env var on exactly one instance.
 * All other instances should leave disabled or omit the variable.
 *
 * Running multiple schedulers causes duplicate ingestion and data corruption.
 */
let harvesterSchedulerEnabled = false
let affiliateSchedulerEnabled = false

const log = logger.worker
const dbLog = logger.database

// Log level polling interval handle
let logLevelPollInterval: NodeJS.Timeout | null = null
const LOG_LEVEL_POLL_MS = 30_000 // Check every 30 seconds

/**
 * Resolve desired log level.
 * Precedence:
 *   1) LOG_LEVEL env (always wins)
 *   2) HARVESTER_LOG_LEVEL env / DB (if explicitly set)
 *   3) null (leave current logger level unchanged)
 */
async function resolveDesiredLogLevel(): Promise<{ level: LogLevel | null; source: string | null }> {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel | undefined
  if (envLevel) {
    return { level: envLevel, source: 'LOG_LEVEL env' }
  }

  const dbLevel = (await getHarvesterLogLevelOptional()) as LogLevel | null
  if (dbLevel) {
    return { level: dbLevel, source: 'HARVESTER_LOG_LEVEL setting' }
  }

  return { level: null, source: null }
}

/**
 * Poll for log level changes from admin settings
 * Updates the logger dynamically without restart
 */
async function pollLogLevel(): Promise<void> {
  try {
    const { level, source } = await resolveDesiredLogLevel()
    if (level) {
      setLogLevel(level)
      // Info-level so we can see it even before debug is enabled
      log.info('Log level applied', { level, source })
    } else {
      log.info('Log level unchanged (no explicit setting found)')
    }
  } catch (error) {
    // Silently ignore errors - we'll retry next poll
    // Don't log errors here to avoid spam if DB is temporarily unavailable
  }
}

/**
 * Start log level polling
 */
async function startLogLevelPolling(): Promise<void> {
  // Set initial level (await so we confirm once at startup)
  await pollLogLevel()

  // Poll periodically for changes
  logLevelPollInterval = setInterval(pollLogLevel, LOG_LEVEL_POLL_MS)
  log.info('Log level polling started', { intervalMs: LOG_LEVEL_POLL_MS })
}

/**
 * Stop log level polling
 */
function stopLogLevelPolling(): void {
  if (logLevelPollInterval) {
    clearInterval(logLevelPollInterval)
    logLevelPollInterval = null
  }
}

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
  workers: [
    'scheduler',
    'fetcher',
    'extractor',
    'normalizer',
    'writer',
    'alerter',
    'resolver',
  ],
  retailerWorkers: [
    'feed-ingest',
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
    await flushLogs()
    process.exit(1)
  }

  // Database is required to check scheduler settings
  const dbConnected = await warmupDatabase()
  if (!dbConnected) {
    log.error('Database not ready - scheduler settings cannot be checked')
    log.info('This instance will only process jobs, not create them')
    return
  }

  // Initialize queue history settings from database
  await initQueueSettings()

  // Check scheduler settings from database (with env var fallback)
  harvesterSchedulerEnabled = await isHarvesterSchedulerEnabled()
  affiliateSchedulerEnabled = await isAffiliateSchedulerEnabled()

  log.info('Scheduler settings loaded', {
    harvesterSchedulerEnabled,
    affiliateSchedulerEnabled,
  })

  // Start log level polling for dynamic updates
  await startLogLevelPolling()

  // Always start affiliate feed worker to process jobs (including manual ones)
  // The worker must run regardless of scheduler state to process manually-triggered jobs
  log.info('Starting affiliate feed worker')
  affiliateFeedWorker = createAffiliateFeedWorker()

  // Start product resolver worker (always on - processes RESOLVE jobs from writer)
  log.info('Starting product resolver worker')
  resolverWorker = await startProductResolverWorker({ concurrency: 5 })

  // Start embedding generation worker (always on - processes embedding jobs from resolver)
  // Lower concurrency due to OpenAI API rate limits
  log.info('Starting embedding generation worker')
  embeddingWorker = await startEmbeddingWorker({ concurrency: 3 })

  // Start quarantine reprocess worker (always on - processes admin-triggered reprocessing)
  log.info('Starting quarantine reprocess worker')
  quarantineReprocessWorker = await startQuarantineReprocessWorker({ concurrency: 10 })

  // Start current price recompute worker (ADR-015 - always on)
  log.info('Starting current price recompute worker')
  currentPriceRecomputeWorker = await startCurrentPriceRecomputeWorker({ concurrency: 5 })

  // Start stuck PROCESSING sweeper (recovers jobs that crash mid-processing)
  log.info('Starting product resolver sweeper')
  startProcessingSweeper()

  // Start harvester/retailer scheduler if enabled
  if (harvesterSchedulerEnabled) {
    log.info('Starting retailer scheduler')
    await startRetailerScheduler()

    // Start current price recompute scheduler (ADR-015)
    // Per ADR-001: Only one scheduler instance should run
    log.info('Starting current price recompute scheduler')
    startCurrentPriceScheduler()
  }

  // Start affiliate feed scheduler only if enabled
  // The scheduler creates repeatable jobs that enqueue work
  if (affiliateSchedulerEnabled) {
    log.info('Starting affiliate feed scheduler')
    affiliateFeedScheduler = createAffiliateFeedScheduler()
  } else {
    log.info('Affiliate feed scheduler disabled - worker will only process manually-triggered jobs')
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
    // 0. Stop log level polling
    stopLogLevelPolling()

    // 1. Stop scheduling new jobs (if scheduler was enabled)
    if (harvesterSchedulerEnabled) {
      log.info('Stopping retailer scheduler')
      stopRetailerScheduler()

      log.info('Stopping current price recompute scheduler')
      stopCurrentPriceScheduler()
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
      delayedNotificationWorker.close(),
      // Retailer Portal workers
      retailerFeedIngestWorker.close(),
      // Affiliate workers (if started)
      affiliateFeedWorker?.close(),
      affiliateFeedScheduler?.close(),
      // Product resolver: stop sweeper first, then worker
      (async () => {
        stopProcessingSweeper()
        await stopProductResolverWorker()
      })(),
      // Embedding generation worker
      stopEmbeddingWorker(),
      // Quarantine reprocess worker
      stopQuarantineReprocessWorker(),
      // Current price recompute worker (ADR-015)
      stopCurrentPriceRecomputeWorker(),
    ])
    log.info('All workers closed')

    // 3. Disconnect from database
    log.info('Disconnecting from database')
    await prisma.$disconnect()

    const durationMs = Date.now() - shutdownStart
    log.info('Graceful shutdown complete', { durationMs })
    await flushLogs()
    process.exit(0)
  } catch (error) {
    const err = error as Error
    log.error('Error during shutdown', { error: err.message })
    await flushLogs()
    process.exit(1)
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

log.info('Workers are running')
