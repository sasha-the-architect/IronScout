#!/usr/bin/env node

/**
 * Harvester Service
 * Main entry point for scheduling and managing crawls
 */

import { scheduleAllCrawls } from './scheduler'
import { crawlQueue } from './config/queues'

const command = process.argv[2]

async function main() {
  switch (command) {
    case 'run':
      // Trigger immediate crawl of all enabled sources
      console.log('Triggering crawl for all enabled sources...')
      await scheduleAllCrawls()
      console.log('Crawl jobs queued successfully')
      process.exit(0)
      break

    case 'schedule':
      // Set up recurring crawls (hourly)
      console.log('Setting up recurring crawls (every hour)...')
      await setupRecurringCrawls()
      console.log('Recurring crawls scheduled')
      break

    case 'status':
      // Show queue status
      await showQueueStatus()
      process.exit(0)
      break

    default:
      console.log('ZeroedIn Harvester Service')
      console.log('')
      console.log('Usage:')
      console.log('  pnpm dev run       - Trigger immediate crawl of all enabled sources')
      console.log('  pnpm dev schedule  - Set up recurring hourly crawls')
      console.log('  pnpm dev status    - Show queue status')
      console.log('  pnpm worker        - Start worker processes')
      console.log('')
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

  console.log('Scheduled crawls will run every hour')
  console.log('Make sure worker process is running: pnpm worker')
}

async function showQueueStatus() {
  const waiting = await crawlQueue.getWaitingCount()
  const active = await crawlQueue.getActiveCount()
  const completed = await crawlQueue.getCompletedCount()
  const failed = await crawlQueue.getFailedCount()

  console.log('Queue Status:')
  console.log(`  Waiting:   ${waiting}`)
  console.log(`  Active:    ${active}`)
  console.log(`  Completed: ${completed}`)
  console.log(`  Failed:    ${failed}`)
}

main().catch((error) => {
  console.error('Error:', error)
  process.exit(1)
})
