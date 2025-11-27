#!/usr/bin/env node

/**
 * Harvester Worker
 * Starts all pipeline workers to process crawl jobs
 */

import { schedulerWorker } from './scheduler'
import { fetcherWorker } from './fetcher'
import { extractorWorker } from './extractor'
import { normalizerWorker } from './normalizer'
import { writerWorker } from './writer'
import { alerterWorker } from './alerter'

console.log('Starting ZeroedIn Harvester Workers...')
console.log('---')
console.log('Active Workers:')
console.log('  - Scheduler (crawl jobs)')
console.log('  - Fetcher (HTTP requests)')
console.log('  - Extractor (content parsing)')
console.log('  - Normalizer (data standardization)')
console.log('  - Writer (database upserts)')
console.log('  - Alerter (notification triggers)')
console.log('---')

// Graceful shutdown
const shutdown = async () => {
  console.log('\nShutting down workers...')

  await Promise.all([
    schedulerWorker.close(),
    fetcherWorker.close(),
    extractorWorker.close(),
    normalizerWorker.close(),
    writerWorker.close(),
    alerterWorker.close(),
  ])

  console.log('All workers shut down successfully')
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

// Keep the process running
console.log('\nWorkers are running. Press Ctrl+C to stop.\n')
