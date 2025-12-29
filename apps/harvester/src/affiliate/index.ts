/**
 * Affiliate Feed Pipeline
 *
 * Entry point for the affiliate feed processing system.
 * Exports worker, scheduler, and utility functions.
 */

export { createAffiliateFeedWorker } from './worker'
export {
  createAffiliateFeedScheduler,
  triggerSchedulerTick,
  getSchedulerStatus,
} from './scheduler'

// Utility exports for admin API
export { testConnection, downloadFeed } from './fetcher'
export { parseFeed } from './parser'
export {
  evaluateCircuitBreaker,
  promoteProducts,
  getExpiryStatus,
} from './circuit-breaker'
export {
  acquireAdvisoryLock,
  releaseAdvisoryLock,
  isLockHeld,
  withAdvisoryLock,
} from './lock'

// Type exports
export * from './types'
