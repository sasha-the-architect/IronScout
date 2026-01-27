/**
 * Current Price Recompute Module
 *
 * Per ADR-015: Derived table architecture for price visibility.
 * Exports worker, scheduler, and recompute utilities.
 */

export {
  startCurrentPriceRecomputeWorker,
  stopCurrentPriceRecomputeWorker,
  getCurrentPriceWorkerMetrics,
  getCurrentPriceRecomputeStatus,
} from './worker'

export {
  startCurrentPriceScheduler,
  stopCurrentPriceScheduler,
  isCurrentPriceSchedulerRunning,
  getCurrentPriceSchedulerStatus,
  triggerFullRecompute,
} from './scheduler'

export {
  recomputeCurrentPrices,
  getRecomputeStatus,
} from './recompute'

export type { RecomputeResult } from './recompute'
