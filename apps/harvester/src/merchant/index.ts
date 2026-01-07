/**
 * Merchant Portal Workers - Index
 *
 * Exports all merchant-related workers for the harvester.
 * Note: benchmark, insight, and sku-match workers removed for v1 (benchmark subsystem removed)
 */

export { merchantFeedIngestWorker } from './feed-ingest'

// Re-export queue references for scheduling
export { merchantFeedIngestQueue } from '../config/queues'
