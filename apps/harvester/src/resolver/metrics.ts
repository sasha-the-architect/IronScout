/**
 * Product Resolver Metrics (Spec v1.2 Appendix B)
 *
 * In-memory metrics collection for the Product Resolver.
 * Designed for export to Prometheus, StatsD, or other backends.
 *
 * Metrics:
 * - resolver_requests_total: Counter by source_kind
 * - resolver_decisions_total: Counter by source_kind, status
 * - resolver_failure_total: Counter by source_kind, reason_code (ERROR only)
 * - resolver_latency_ms: Histogram
 *
 * Label constraints:
 * - source_kind: SourceKind enum (DIRECT, AFFILIATE_FEED, OTHER)
 * - status: ProductLinkStatus enum (MATCHED, CREATED, UNMATCHED, ERROR)
 * - reason_code: ProductLinkReasonCode enum (bounded, only for ERROR status)
 *
 * No high-cardinality labels (no sourceProductId, productId, etc.)
 */

import type { SourceKind, ProductLinkStatus, ProductLinkReasonCode } from '@ironscout/db/generated/prisma'

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export type SourceKindLabel = SourceKind | 'UNKNOWN'
export type StatusLabel = ProductLinkStatus
export type ReasonCodeLabel = ProductLinkReasonCode | 'NONE'

export interface ResolverMetricsSnapshot {
  requests: Record<SourceKindLabel, number>
  decisions: Record<SourceKindLabel, Record<StatusLabel, number>>
  failures: Record<SourceKindLabel, Record<ReasonCodeLabel, number>>
  latency: {
    count: number
    sum: number
    buckets: Record<number, number> // bucket threshold -> count
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Histogram buckets (milliseconds)
// ═══════════════════════════════════════════════════════════════════════════════

const LATENCY_BUCKETS = [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000]

// ═══════════════════════════════════════════════════════════════════════════════
// In-memory storage
// ═══════════════════════════════════════════════════════════════════════════════

const requests: Map<SourceKindLabel, number> = new Map()
const decisions: Map<string, number> = new Map() // key: `${sourceKind}:${status}`
const failures: Map<string, number> = new Map() // key: `${sourceKind}:${reasonCode}`
const latency = {
  count: 0,
  sum: 0,
  buckets: new Map<number, number>(),
}

// Initialize buckets
for (const bucket of LATENCY_BUCKETS) {
  latency.buckets.set(bucket, 0)
}

// ═══════════════════════════════════════════════════════════════════════════════
// Metric recording functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Increment resolver_requests_total
 * Call at job start
 */
export function recordRequest(sourceKind: SourceKindLabel): void {
  const current = requests.get(sourceKind) ?? 0
  requests.set(sourceKind, current + 1)
}

/**
 * Increment resolver_decisions_total
 * Call at job completion
 */
export function recordDecision(sourceKind: SourceKindLabel, status: StatusLabel): void {
  const key = `${sourceKind}:${status}`
  const current = decisions.get(key) ?? 0
  decisions.set(key, current + 1)
}

/**
 * Increment resolver_failure_total
 * Call only for ERROR status with reason_code
 */
export function recordFailure(sourceKind: SourceKindLabel, reasonCode: ReasonCodeLabel): void {
  const key = `${sourceKind}:${reasonCode}`
  const current = failures.get(key) ?? 0
  failures.set(key, current + 1)
}

/**
 * Record resolver_latency_ms
 * Call at job completion with duration
 */
export function recordLatency(durationMs: number): void {
  latency.count++
  latency.sum += durationMs

  // Update histogram buckets (cumulative)
  for (const bucket of LATENCY_BUCKETS) {
    if (durationMs <= bucket) {
      const current = latency.buckets.get(bucket) ?? 0
      latency.buckets.set(bucket, current + 1)
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Convenience function for full job recording
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Record all metrics for a completed resolver job
 */
export function recordResolverJob(params: {
  sourceKind: SourceKindLabel
  status: StatusLabel
  reasonCode?: ReasonCodeLabel
  durationMs: number
}): void {
  const { sourceKind, status, reasonCode, durationMs } = params

  // Decision is always recorded
  recordDecision(sourceKind, status)

  // Failure is only recorded for ERROR status
  if (status === 'ERROR' && reasonCode) {
    recordFailure(sourceKind, reasonCode)
  }

  // Latency is always recorded
  recordLatency(durationMs)
}

// ═══════════════════════════════════════════════════════════════════════════════
// Export / snapshot functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get current metrics snapshot
 * For export to Prometheus/StatsD/etc.
 */
export function getMetricsSnapshot(): ResolverMetricsSnapshot {
  const snapshot: ResolverMetricsSnapshot = {
    requests: {} as Record<SourceKindLabel, number>,
    decisions: {} as Record<SourceKindLabel, Record<StatusLabel, number>>,
    failures: {} as Record<SourceKindLabel, Record<ReasonCodeLabel, number>>,
    latency: {
      count: latency.count,
      sum: latency.sum,
      buckets: {} as Record<number, number>,
    },
  }

  // Requests
  for (const [kind, count] of requests) {
    snapshot.requests[kind] = count
  }

  // Decisions
  for (const [key, count] of decisions) {
    const [kind, status] = key.split(':') as [SourceKindLabel, StatusLabel]
    if (!snapshot.decisions[kind]) {
      snapshot.decisions[kind] = {} as Record<StatusLabel, number>
    }
    snapshot.decisions[kind][status] = count
  }

  // Failures
  for (const [key, count] of failures) {
    const [kind, reasonCode] = key.split(':') as [SourceKindLabel, ReasonCodeLabel]
    if (!snapshot.failures[kind]) {
      snapshot.failures[kind] = {} as Record<ReasonCodeLabel, number>
    }
    snapshot.failures[kind][reasonCode] = count
  }

  // Latency buckets
  for (const [bucket, count] of latency.buckets) {
    snapshot.latency.buckets[bucket] = count
  }

  return snapshot
}

/**
 * Get metrics in Prometheus exposition format
 */
export function getPrometheusMetrics(): string {
  const lines: string[] = []

  // resolver_requests_total
  lines.push('# HELP resolver_requests_total Total resolver job requests')
  lines.push('# TYPE resolver_requests_total counter')
  for (const [kind, count] of requests) {
    lines.push(`resolver_requests_total{source_kind="${kind}"} ${count}`)
  }

  // resolver_decisions_total
  lines.push('# HELP resolver_decisions_total Total resolver decisions by outcome')
  lines.push('# TYPE resolver_decisions_total counter')
  for (const [key, count] of decisions) {
    const [kind, status] = key.split(':')
    lines.push(`resolver_decisions_total{source_kind="${kind}",status="${status}"} ${count}`)
  }

  // resolver_failure_total
  lines.push('# HELP resolver_failure_total Total resolver failures by reason')
  lines.push('# TYPE resolver_failure_total counter')
  for (const [key, count] of failures) {
    const [kind, reasonCode] = key.split(':')
    lines.push(`resolver_failure_total{source_kind="${kind}",reason_code="${reasonCode}"} ${count}`)
  }

  // resolver_latency_ms
  lines.push('# HELP resolver_latency_ms Resolver job latency in milliseconds')
  lines.push('# TYPE resolver_latency_ms histogram')
  for (const [bucket, count] of latency.buckets) {
    lines.push(`resolver_latency_ms_bucket{le="${bucket}"} ${count}`)
  }
  lines.push(`resolver_latency_ms_bucket{le="+Inf"} ${latency.count}`)
  lines.push(`resolver_latency_ms_sum ${latency.sum}`)
  lines.push(`resolver_latency_ms_count ${latency.count}`)

  return lines.join('\n')
}

// ═══════════════════════════════════════════════════════════════════════════════
// Reset function (for testing)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Reset all metrics (for testing only)
 */
export function resetMetrics(): void {
  requests.clear()
  decisions.clear()
  failures.clear()
  latency.count = 0
  latency.sum = 0
  for (const bucket of LATENCY_BUCKETS) {
    latency.buckets.set(bucket, 0)
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Derived metrics helpers
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate latency percentile from histogram
 * Approximate using bucket boundaries
 */
export function getLatencyPercentile(percentile: number): number {
  if (latency.count === 0) return 0

  const targetCount = Math.ceil(latency.count * (percentile / 100))
  let cumulative = 0

  const sortedBuckets = [...latency.buckets.entries()].sort((a, b) => a[0] - b[0])

  for (const [bucket, count] of sortedBuckets) {
    cumulative += count
    if (cumulative >= targetCount) {
      return bucket
    }
  }

  return sortedBuckets[sortedBuckets.length - 1]?.[0] ?? 0
}

/**
 * Calculate failure rate
 */
export function getFailureRate(): number {
  let totalDecisions = 0
  let errorDecisions = 0

  for (const [key, count] of decisions) {
    totalDecisions += count
    if (key.endsWith(':ERROR')) {
      errorDecisions += count
    }
  }

  return totalDecisions > 0 ? errorDecisions / totalDecisions : 0
}

/**
 * Calculate match rate (MATCHED + CREATED) / total
 */
export function getMatchRate(): number {
  let totalDecisions = 0
  let matchedDecisions = 0

  for (const [key, count] of decisions) {
    totalDecisions += count
    if (key.endsWith(':MATCHED') || key.endsWith(':CREATED')) {
      matchedDecisions += count
    }
  }

  return totalDecisions > 0 ? matchedDecisions / totalDecisions : 0
}
