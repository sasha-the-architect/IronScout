/**
 * Ingest Run Summary
 *
 * Provides a standardized summary event format for all ingestion pipelines.
 * This enables consistent monitoring, alerting, and correlation across:
 * - Affiliate pipeline (processor.ts)
 * - Retailer pipeline (feed-ingest.ts)
 * - Crawl pipeline (writer/index.ts)
 *
 * Per PR #3: Event boundary + observability for batch processing.
 */

import { rootLogger } from './logger'

// Create a child logger for ingest summary
const log = rootLogger.child('ingest-summary')

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export type IngestPipeline = 'AFFILIATE' | 'RETAILER' | 'CRAWL'

export type IngestRunStatus = 'SUCCESS' | 'WARNING' | 'FAILED'

/**
 * Standardized summary for any ingestion run.
 * All fields are designed for low-cardinality metrics and structured logging.
 */
export interface IngestRunSummary {
  /** Which pipeline produced this summary */
  pipeline: IngestPipeline

  /** Unique run identifier (correlates with run tables) */
  runId: string

  /** Optional source/feed identifier */
  sourceId?: string

  /** Optional retailer identifier */
  retailerId?: string

  /** Run status */
  status: IngestRunStatus

  /** Total duration of the run in milliseconds */
  durationMs: number

  /** Timing breakdown (optional) */
  timing?: {
    fetchMs?: number
    parseMs?: number
    processMs?: number
    writeMs?: number
  }

  /** Input counts */
  input: {
    /** Total rows/items received */
    totalRows: number
  }

  /** Output counts */
  output: {
    /** New listings/SKUs created */
    listingsCreated: number

    /** Existing listings/SKUs updated */
    listingsUpdated: number

    /** Price observations written */
    pricesWritten: number

    /** Items sent to quarantine */
    quarantined: number

    /** Items rejected (parse errors, validation failures) */
    rejected: number

    /** Items matched to canonical products */
    matched: number

    /** Items enqueued for resolver */
    enqueuedForResolver: number
  }

  /** Error summary */
  errors: {
    /** Total error count */
    count: number

    /** Primary error code (if any) */
    primaryCode?: string

    /** Error code distribution */
    codes?: Record<string, number>
  }

  /** Deduplication metrics */
  deduplication?: {
    /** Duplicate rows skipped */
    duplicatesSkipped: number

    /** URL hash fallbacks used */
    urlHashFallbacks: number
  }

  /** Quality metrics (non-blocking, for observability) */
  qualityMetrics?: {
    /** Products missing brand */
    missingBrand: number

    /** Products missing roundCount */
    missingRoundCount: number
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// In-memory counters (for metrics export)
// ═══════════════════════════════════════════════════════════════════════════════

const runCounters: Map<string, number> = new Map() // key: `${pipeline}:${status}`
const listingsCreated: Map<IngestPipeline, number> = new Map()
const listingsUpdated: Map<IngestPipeline, number> = new Map()
const pricesWritten: Map<IngestPipeline, number> = new Map()

// ═══════════════════════════════════════════════════════════════════════════════
// Logging
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Emit a standardized INGEST_RUN_SUMMARY log event.
 *
 * This is the single source of truth for run-level metrics across all pipelines.
 * On-call can filter logs by `event: 'INGEST_RUN_SUMMARY'` to see all runs.
 */
export function emitIngestRunSummary(summary: IngestRunSummary): void {
  // Update counters
  const statusKey = `${summary.pipeline}:${summary.status}`
  runCounters.set(statusKey, (runCounters.get(statusKey) ?? 0) + 1)

  listingsCreated.set(
    summary.pipeline,
    (listingsCreated.get(summary.pipeline) ?? 0) + summary.output.listingsCreated
  )
  listingsUpdated.set(
    summary.pipeline,
    (listingsUpdated.get(summary.pipeline) ?? 0) + summary.output.listingsUpdated
  )
  pricesWritten.set(
    summary.pipeline,
    (pricesWritten.get(summary.pipeline) ?? 0) + summary.output.pricesWritten
  )

  // Log the summary event
  const logLevel = summary.status === 'FAILED' ? 'error' : summary.status === 'WARNING' ? 'warn' : 'info'

  log[logLevel]('INGEST_RUN_SUMMARY', {
    // Core identifiers
    event_name: 'INGEST_RUN_SUMMARY',
    pipeline: summary.pipeline,
    runId: summary.runId,
    sourceId: summary.sourceId,
    retailerId: summary.retailerId,
    status: summary.status,

    // Timing
    durationMs: summary.durationMs,
    ...(summary.timing && { timing: summary.timing }),

    // Counts
    inputRows: summary.input.totalRows,
    listingsCreated: summary.output.listingsCreated,
    listingsUpdated: summary.output.listingsUpdated,
    pricesWritten: summary.output.pricesWritten,
    quarantined: summary.output.quarantined,
    rejected: summary.output.rejected,
    matched: summary.output.matched,
    enqueuedForResolver: summary.output.enqueuedForResolver,

    // Errors
    errorCount: summary.errors.count,
    ...(summary.errors.primaryCode && { primaryErrorCode: summary.errors.primaryCode }),
    ...(summary.errors.codes && { errorCodes: summary.errors.codes }),

    // Deduplication
    ...(summary.deduplication && {
      duplicatesSkipped: summary.deduplication.duplicatesSkipped,
      urlHashFallbacks: summary.deduplication.urlHashFallbacks,
    }),

    // Quality metrics
    ...(summary.qualityMetrics && {
      missingBrand: summary.qualityMetrics.missingBrand,
      missingRoundCount: summary.qualityMetrics.missingRoundCount,
    }),

    // Derived metrics
    successRate: summary.input.totalRows > 0
      ? ((summary.output.listingsCreated + summary.output.listingsUpdated) / summary.input.totalRows * 100).toFixed(2)
      : '0.00',
    quarantineRate: summary.input.totalRows > 0
      ? (summary.output.quarantined / summary.input.totalRows * 100).toFixed(2)
      : '0.00',
    rejectRate: summary.input.totalRows > 0
      ? (summary.output.rejected / summary.input.totalRows * 100).toFixed(2)
      : '0.00',
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// Metrics Export
// ═══════════════════════════════════════════════════════════════════════════════

export interface IngestSummaryMetricsSnapshot {
  runsByPipelineAndStatus: Record<string, number>
  listingsCreatedByPipeline: Record<IngestPipeline, number>
  listingsUpdatedByPipeline: Record<IngestPipeline, number>
  pricesWrittenByPipeline: Record<IngestPipeline, number>
}

/**
 * Get current metrics snapshot
 */
export function getIngestSummaryMetrics(): IngestSummaryMetricsSnapshot {
  const snapshot: IngestSummaryMetricsSnapshot = {
    runsByPipelineAndStatus: {},
    listingsCreatedByPipeline: {} as Record<IngestPipeline, number>,
    listingsUpdatedByPipeline: {} as Record<IngestPipeline, number>,
    pricesWrittenByPipeline: {} as Record<IngestPipeline, number>,
  }

  for (const [key, count] of runCounters) {
    snapshot.runsByPipelineAndStatus[key] = count
  }

  for (const [pipeline, count] of listingsCreated) {
    snapshot.listingsCreatedByPipeline[pipeline] = count
  }

  for (const [pipeline, count] of listingsUpdated) {
    snapshot.listingsUpdatedByPipeline[pipeline] = count
  }

  for (const [pipeline, count] of pricesWritten) {
    snapshot.pricesWrittenByPipeline[pipeline] = count
  }

  return snapshot
}

/**
 * Get metrics in Prometheus exposition format
 */
export function getIngestSummaryPrometheusMetrics(): string {
  const lines: string[] = []

  // ingest_runs_total
  lines.push('# HELP ingest_runs_total Total ingestion runs by pipeline and status')
  lines.push('# TYPE ingest_runs_total counter')
  for (const [key, count] of runCounters) {
    const [pipeline, status] = key.split(':')
    lines.push(`ingest_runs_total{pipeline="${pipeline}",status="${status}"} ${count}`)
  }

  // ingest_listings_created_total
  lines.push('# HELP ingest_listings_created_total Total listings created by pipeline')
  lines.push('# TYPE ingest_listings_created_total counter')
  for (const [pipeline, count] of listingsCreated) {
    lines.push(`ingest_listings_created_total{pipeline="${pipeline}"} ${count}`)
  }

  // ingest_listings_updated_total
  lines.push('# HELP ingest_listings_updated_total Total listings updated by pipeline')
  lines.push('# TYPE ingest_listings_updated_total counter')
  for (const [pipeline, count] of listingsUpdated) {
    lines.push(`ingest_listings_updated_total{pipeline="${pipeline}"} ${count}`)
  }

  // ingest_prices_written_total
  lines.push('# HELP ingest_prices_written_total Total price observations written by pipeline')
  lines.push('# TYPE ingest_prices_written_total counter')
  for (const [pipeline, count] of pricesWritten) {
    lines.push(`ingest_prices_written_total{pipeline="${pipeline}"} ${count}`)
  }

  return lines.join('\n')
}

/**
 * Reset all metrics (for testing only)
 */
export function resetIngestSummaryMetrics(): void {
  runCounters.clear()
  listingsCreated.clear()
  listingsUpdated.clear()
  pricesWritten.clear()
}
