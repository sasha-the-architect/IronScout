/**
 * Writer Price Metrics
 *
 * Metrics for price ingestion and variance detection.
 * Per feedback: Price variance checking belongs in the writer, not the resolver.
 *
 * Metrics:
 * - writer_price_variance_exceeded_total: Counter for prices exceeding variance threshold
 * - writer_prices_written_total: Counter for total prices written
 *
 * Label constraints:
 * - source_kind: SourceKind enum (DIRECT, AFFILIATE_FEED, OTHER)
 * - variance_bucket: Bounded buckets (0-10%, 10-25%, 25-50%, 50-100%, >100%)
 * - action: What was done (ACCEPTED, QUARANTINED, CLAMPED)
 *
 * No high-cardinality labels (no productId, sourceProductId, etc.)
 */

import type { SourceKind } from '@ironscout/db/generated/prisma'

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export type SourceKindLabel = SourceKind | 'UNKNOWN'

export type VarianceBucket = '0-10%' | '10-25%' | '25-50%' | '50-100%' | '>100%'

export type VarianceAction = 'ACCEPTED' | 'QUARANTINED' | 'CLAMPED'

export interface WriterMetricsSnapshot {
  pricesWritten: Record<SourceKindLabel, number>
  varianceExceeded: Record<string, number> // key: `${sourceKind}:${bucket}:${action}`
  varianceHistogram: {
    count: number
    sum: number
    buckets: Record<number, number> // percentage threshold -> count
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Price variance threshold for alerting
 * Prices changing by more than this percentage trigger the variance metric
 */
export const PRICE_VARIANCE_ALERT_THRESHOLD_PCT = 30 // 30%

/**
 * Histogram buckets for variance percentage
 */
const VARIANCE_BUCKETS = [10, 25, 50, 100, 200, 500]

// ═══════════════════════════════════════════════════════════════════════════════
// In-memory storage
// ═══════════════════════════════════════════════════════════════════════════════

const pricesWritten: Map<SourceKindLabel, number> = new Map()
const varianceExceeded: Map<string, number> = new Map() // key: `${sourceKind}:${bucket}:${action}`
const varianceHistogram = {
  count: 0,
  sum: 0,
  buckets: new Map<number, number>(),
}

// Initialize buckets
for (const bucket of VARIANCE_BUCKETS) {
  varianceHistogram.buckets.set(bucket, 0)
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helper functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate variance percentage between old and new price
 */
export function calculateVariancePct(oldPrice: number, newPrice: number): number {
  if (oldPrice === 0) return newPrice > 0 ? 100 : 0
  return Math.abs((newPrice - oldPrice) / oldPrice) * 100
}

/**
 * Map variance percentage to bucket label
 */
export function varianceToBucket(variancePct: number): VarianceBucket {
  if (variancePct <= 10) return '0-10%'
  if (variancePct <= 25) return '10-25%'
  if (variancePct <= 50) return '25-50%'
  if (variancePct <= 100) return '50-100%'
  return '>100%'
}

// ═══════════════════════════════════════════════════════════════════════════════
// Metric recording functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Increment writer_prices_written_total
 */
export function recordPriceWritten(sourceKind: SourceKindLabel, count = 1): void {
  const current = pricesWritten.get(sourceKind) ?? 0
  pricesWritten.set(sourceKind, current + count)
}

/**
 * Record a price variance observation
 * Updates histogram and, if exceeds threshold, increments counter
 */
export function recordPriceVariance(params: {
  sourceKind: SourceKindLabel
  oldPrice: number
  newPrice: number
  action: VarianceAction
}): void {
  const { sourceKind, oldPrice, newPrice, action } = params

  const variancePct = calculateVariancePct(oldPrice, newPrice)

  // Update histogram
  varianceHistogram.count++
  varianceHistogram.sum += variancePct

  for (const bucket of VARIANCE_BUCKETS) {
    if (variancePct <= bucket) {
      const current = varianceHistogram.buckets.get(bucket) ?? 0
      varianceHistogram.buckets.set(bucket, current + 1)
    }
  }

  // If exceeds threshold, record to counter
  if (variancePct > PRICE_VARIANCE_ALERT_THRESHOLD_PCT) {
    const bucket = varianceToBucket(variancePct)
    const key = `${sourceKind}:${bucket}:${action}`
    const current = varianceExceeded.get(key) ?? 0
    varianceExceeded.set(key, current + 1)
  }
}

/**
 * Convenience function: record price write with variance check
 */
export function recordPriceWriteWithVariance(params: {
  sourceKind: SourceKindLabel
  oldPrice?: number
  newPrice: number
  action?: VarianceAction
}): void {
  const { sourceKind, oldPrice, newPrice, action = 'ACCEPTED' } = params

  recordPriceWritten(sourceKind)

  if (oldPrice !== undefined && oldPrice !== newPrice) {
    recordPriceVariance({ sourceKind, oldPrice, newPrice, action })
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Export / snapshot functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get current metrics snapshot
 */
export function getWriterMetricsSnapshot(): WriterMetricsSnapshot {
  const snapshot: WriterMetricsSnapshot = {
    pricesWritten: {} as Record<SourceKindLabel, number>,
    varianceExceeded: {},
    varianceHistogram: {
      count: varianceHistogram.count,
      sum: varianceHistogram.sum,
      buckets: {} as Record<number, number>,
    },
  }

  for (const [kind, count] of pricesWritten) {
    snapshot.pricesWritten[kind] = count
  }

  for (const [key, count] of varianceExceeded) {
    snapshot.varianceExceeded[key] = count
  }

  for (const [bucket, count] of varianceHistogram.buckets) {
    snapshot.varianceHistogram.buckets[bucket] = count
  }

  return snapshot
}

/**
 * Get metrics in Prometheus exposition format
 */
export function getWriterPrometheusMetrics(): string {
  const lines: string[] = []

  // writer_prices_written_total
  lines.push('# HELP writer_prices_written_total Total prices written')
  lines.push('# TYPE writer_prices_written_total counter')
  for (const [kind, count] of pricesWritten) {
    lines.push(`writer_prices_written_total{source_kind="${kind}"} ${count}`)
  }

  // writer_price_variance_exceeded_total
  lines.push('# HELP writer_price_variance_exceeded_total Prices exceeding variance threshold')
  lines.push('# TYPE writer_price_variance_exceeded_total counter')
  for (const [key, count] of varianceExceeded) {
    const [kind, bucket, action] = key.split(':')
    lines.push(`writer_price_variance_exceeded_total{source_kind="${kind}",variance_bucket="${bucket}",action="${action}"} ${count}`)
  }

  // writer_price_delta_pct (histogram)
  lines.push('# HELP writer_price_delta_pct Price change percentage')
  lines.push('# TYPE writer_price_delta_pct histogram')
  for (const [bucket, count] of varianceHistogram.buckets) {
    lines.push(`writer_price_delta_pct_bucket{le="${bucket}"} ${count}`)
  }
  lines.push(`writer_price_delta_pct_bucket{le="+Inf"} ${varianceHistogram.count}`)
  lines.push(`writer_price_delta_pct_sum ${varianceHistogram.sum.toFixed(2)}`)
  lines.push(`writer_price_delta_pct_count ${varianceHistogram.count}`)

  return lines.join('\n')
}

// ═══════════════════════════════════════════════════════════════════════════════
// Reset function (for testing)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Reset all metrics (for testing only)
 */
export function resetWriterMetrics(): void {
  pricesWritten.clear()
  varianceExceeded.clear()
  varianceHistogram.count = 0
  varianceHistogram.sum = 0
  for (const bucket of VARIANCE_BUCKETS) {
    varianceHistogram.buckets.set(bucket, 0)
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Derived metrics helpers
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get total variance exceeded count
 */
export function getTotalVarianceExceeded(): number {
  let total = 0
  for (const count of varianceExceeded.values()) {
    total += count
  }
  return total
}

/**
 * Get variance exceeded rate
 */
export function getVarianceExceededRate(): number {
  let totalPrices = 0
  for (const count of pricesWritten.values()) {
    totalPrices += count
  }

  return totalPrices > 0 ? getTotalVarianceExceeded() / totalPrices : 0
}
