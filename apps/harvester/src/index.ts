#!/usr/bin/env node

/**
 * Harvester Service
 * Main entry point for scheduling and managing crawls
 */

import { scheduleAllCrawls } from './scheduler'
import { crawlQueue } from './config/queues'
import { rootLogger } from './config/logger'

const log = rootLogger

const command = process.argv[2]

async function main() {
  switch (command) {
    case 'run':
      // Trigger immediate crawl of all enabled sources
      log.info('Triggering crawl for all enabled sources')
      await scheduleAllCrawls()
      log.info('Crawl jobs queued successfully')
      process.exit(0)
      break

    case 'schedule':
      // Set up recurring crawls (hourly)
      log.info('Setting up recurring crawls (every hour)')
      await setupRecurringCrawls()
      log.info('Recurring crawls scheduled')
      break

    case 'status':
      // Show queue status
      await showQueueStatus()
      process.exit(0)
      break

    default:
      log.info('IronScout.ai Harvester Service')
      log.info('')
      log.info('Usage:')
      log.info('  pnpm dev run       - Trigger immediate crawl of all enabled sources')
      log.info('  pnpm dev schedule  - Set up recurring hourly crawls')
      log.info('  pnpm dev status    - Show queue status')
      log.info('  pnpm worker        - Start worker processes')
      log.info('')
      process.exit(0)
  }
}

async function setupRecurringCrawls() {
  // Add a repeatable job that runs every hour
  await crawlQueue.add(
    'scheduled-crawl',
    { sourceId: 'all', executionId: 'scheduled' } as any,
    {
      repeat: {
        pattern: '0 * * * *', // Every hour at minute 0
      },
    }
  )

  log.info('Scheduled crawls will run every hour')
  log.info('Make sure worker process is running: pnpm worker')
}

async function showQueueStatus() {
  const waiting = await crawlQueue.getWaitingCount()
  const active = await crawlQueue.getActiveCount()
  const completed = await crawlQueue.getCompletedCount()
  const failed = await crawlQueue.getFailedCount()

  log.info('Queue Status:', { waiting, active, completed, failed })
}

main().catch((error) => {
  log.error('Error', { error: error instanceof Error ? error.message : String(error) }, error instanceof Error ? error : undefined)
  process.exit(1)
})
