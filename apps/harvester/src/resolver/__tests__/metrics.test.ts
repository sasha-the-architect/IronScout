/**
 * Product Resolver Metrics Tests
 *
 * Tests for metrics emission on:
 * - Happy path (MATCHED, CREATED)
 * - Fallback path (UNMATCHED)
 * - Failure path (ERROR)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  recordRequest,
  recordDecision,
  recordFailure,
  recordLatency,
  recordResolverJob,
  getMetricsSnapshot,
  getPrometheusMetrics,
  resetMetrics,
  getLatencyPercentile,
  getFailureRate,
  getMatchRate,
} from '../metrics'

describe('Resolver Metrics', () => {
  beforeEach(() => {
    resetMetrics()
  })

  describe('recordRequest', () => {
    it('should increment request count by source kind', () => {
      recordRequest('DIRECT')
      recordRequest('DIRECT')
      recordRequest('AFFILIATE_FEED')

      const snapshot = getMetricsSnapshot()
      expect(snapshot.requests['DIRECT']).toBe(2)
      expect(snapshot.requests['AFFILIATE_FEED']).toBe(1)
    })

    it('should handle UNKNOWN source kind', () => {
      recordRequest('UNKNOWN')

      const snapshot = getMetricsSnapshot()
      expect(snapshot.requests['UNKNOWN']).toBe(1)
    })
  })

  describe('recordDecision', () => {
    it('should increment decision count by source kind and status', () => {
      recordDecision('DIRECT', 'MATCHED')
      recordDecision('DIRECT', 'MATCHED')
      recordDecision('DIRECT', 'CREATED')
      recordDecision('AFFILIATE_FEED', 'UNMATCHED')
      recordDecision('AFFILIATE_FEED', 'ERROR')

      const snapshot = getMetricsSnapshot()
      expect(snapshot.decisions['DIRECT']['MATCHED']).toBe(2)
      expect(snapshot.decisions['DIRECT']['CREATED']).toBe(1)
      expect(snapshot.decisions['AFFILIATE_FEED']['UNMATCHED']).toBe(1)
      expect(snapshot.decisions['AFFILIATE_FEED']['ERROR']).toBe(1)
    })
  })

  describe('recordFailure', () => {
    it('should increment failure count by source kind and reason code', () => {
      recordFailure('DIRECT', 'SYSTEM_ERROR')
      recordFailure('DIRECT', 'SYSTEM_ERROR')
      recordFailure('AFFILIATE_FEED', 'INSUFFICIENT_DATA')

      const snapshot = getMetricsSnapshot()
      expect(snapshot.failures['DIRECT']['SYSTEM_ERROR']).toBe(2)
      expect(snapshot.failures['AFFILIATE_FEED']['INSUFFICIENT_DATA']).toBe(1)
    })
  })

  describe('recordLatency', () => {
    it('should update histogram correctly', () => {
      recordLatency(50)  // <= 50, 100, 250, 500, 1000, etc.
      recordLatency(150) // <= 250, 500, 1000, etc.
      recordLatency(3000) // <= 5000, etc.

      const snapshot = getMetricsSnapshot()
      expect(snapshot.latency.count).toBe(3)
      expect(snapshot.latency.sum).toBe(3200)
      // Bucket 50 should have 1, bucket 100 should have 1, etc.
      expect(snapshot.latency.buckets[50]).toBe(1)
      expect(snapshot.latency.buckets[250]).toBe(2)
      expect(snapshot.latency.buckets[5000]).toBe(3)
    })
  })

  describe('recordResolverJob', () => {
    it('should record decision and latency for successful job', () => {
      recordRequest('DIRECT')
      recordResolverJob({
        sourceKind: 'DIRECT',
        status: 'MATCHED',
        durationMs: 100,
      })

      const snapshot = getMetricsSnapshot()
      expect(snapshot.requests['DIRECT']).toBe(1)
      expect(snapshot.decisions['DIRECT']['MATCHED']).toBe(1)
      expect(snapshot.latency.count).toBe(1)
    })

    it('should record failure for ERROR status', () => {
      recordRequest('AFFILIATE_FEED')
      recordResolverJob({
        sourceKind: 'AFFILIATE_FEED',
        status: 'ERROR',
        reasonCode: 'SYSTEM_ERROR',
        durationMs: 500,
      })

      const snapshot = getMetricsSnapshot()
      expect(snapshot.decisions['AFFILIATE_FEED']['ERROR']).toBe(1)
      expect(snapshot.failures['AFFILIATE_FEED']['SYSTEM_ERROR']).toBe(1)
    })
  })

  describe('Happy Path (MATCHED/CREATED)', () => {
    it('should emit correct metrics for UPC match', () => {
      recordRequest('DIRECT')
      recordResolverJob({
        sourceKind: 'DIRECT',
        status: 'MATCHED',
        durationMs: 45,
      })

      const snapshot = getMetricsSnapshot()
      expect(snapshot.requests['DIRECT']).toBe(1)
      expect(snapshot.decisions['DIRECT']['MATCHED']).toBe(1)
      expect(Object.keys(snapshot.failures['DIRECT'] ?? {})).toHaveLength(0)
    })

    it('should emit correct metrics for product creation', () => {
      recordRequest('AFFILIATE_FEED')
      recordResolverJob({
        sourceKind: 'AFFILIATE_FEED',
        status: 'CREATED',
        durationMs: 120,
      })

      const snapshot = getMetricsSnapshot()
      expect(snapshot.decisions['AFFILIATE_FEED']['CREATED']).toBe(1)
    })
  })

  describe('Fallback Path (UNMATCHED)', () => {
    it('should emit correct metrics for insufficient data', () => {
      recordRequest('DIRECT')
      recordResolverJob({
        sourceKind: 'DIRECT',
        status: 'UNMATCHED',
        durationMs: 30,
      })

      const snapshot = getMetricsSnapshot()
      expect(snapshot.decisions['DIRECT']['UNMATCHED']).toBe(1)
      // No failure recorded for UNMATCHED (it's not an ERROR)
      expect(snapshot.failures['DIRECT']).toBeUndefined()
    })

    it('should emit correct metrics for ambiguous fingerprint', () => {
      recordRequest('AFFILIATE_FEED')
      recordResolverJob({
        sourceKind: 'AFFILIATE_FEED',
        status: 'UNMATCHED',
        durationMs: 200,
      })

      const snapshot = getMetricsSnapshot()
      expect(snapshot.decisions['AFFILIATE_FEED']['UNMATCHED']).toBe(1)
    })
  })

  describe('Failure Path (ERROR)', () => {
    it('should emit correct metrics for system error', () => {
      recordRequest('DIRECT')
      recordResolverJob({
        sourceKind: 'DIRECT',
        status: 'ERROR',
        reasonCode: 'SYSTEM_ERROR',
        durationMs: 5000,
      })

      const snapshot = getMetricsSnapshot()
      expect(snapshot.decisions['DIRECT']['ERROR']).toBe(1)
      expect(snapshot.failures['DIRECT']['SYSTEM_ERROR']).toBe(1)
    })

    it('should track multiple failure types', () => {
      recordRequest('AFFILIATE_FEED')
      recordResolverJob({
        sourceKind: 'AFFILIATE_FEED',
        status: 'ERROR',
        reasonCode: 'SYSTEM_ERROR',
        durationMs: 100,
      })

      recordRequest('AFFILIATE_FEED')
      recordResolverJob({
        sourceKind: 'AFFILIATE_FEED',
        status: 'ERROR',
        reasonCode: 'NORMALIZATION_FAILED',
        durationMs: 50,
      })

      const snapshot = getMetricsSnapshot()
      expect(snapshot.failures['AFFILIATE_FEED']['SYSTEM_ERROR']).toBe(1)
      expect(snapshot.failures['AFFILIATE_FEED']['NORMALIZATION_FAILED']).toBe(1)
    })
  })

  describe('Derived Metrics', () => {
    it('should calculate failure rate correctly', () => {
      recordDecision('DIRECT', 'MATCHED')
      recordDecision('DIRECT', 'MATCHED')
      recordDecision('DIRECT', 'ERROR')
      recordDecision('AFFILIATE_FEED', 'CREATED')

      const rate = getFailureRate()
      expect(rate).toBe(0.25) // 1 ERROR out of 4 decisions
    })

    it('should calculate match rate correctly', () => {
      recordDecision('DIRECT', 'MATCHED')
      recordDecision('DIRECT', 'CREATED')
      recordDecision('DIRECT', 'UNMATCHED')
      recordDecision('DIRECT', 'ERROR')

      const rate = getMatchRate()
      expect(rate).toBe(0.5) // 2 (MATCHED + CREATED) out of 4
    })

    it('should calculate latency percentile correctly', () => {
      // Add 10 samples
      for (let i = 0; i < 10; i++) {
        recordLatency((i + 1) * 100) // 100, 200, 300, ..., 1000
      }

      const p50 = getLatencyPercentile(50)
      const p95 = getLatencyPercentile(95)

      // p50 should be around 500ms bucket
      expect(p50).toBeGreaterThanOrEqual(250)
      expect(p50).toBeLessThanOrEqual(1000)

      // p95 should be in higher bucket
      expect(p95).toBeGreaterThanOrEqual(500)
    })
  })

  describe('Prometheus Export', () => {
    it('should generate valid Prometheus format', () => {
      recordRequest('DIRECT')
      recordDecision('DIRECT', 'MATCHED')
      recordLatency(100)

      const output = getPrometheusMetrics()

      expect(output).toContain('# HELP resolver_requests_total')
      expect(output).toContain('# TYPE resolver_requests_total counter')
      expect(output).toContain('resolver_requests_total{source_kind="DIRECT"} 1')

      expect(output).toContain('# HELP resolver_decisions_total')
      expect(output).toContain('resolver_decisions_total{source_kind="DIRECT",status="MATCHED"} 1')

      expect(output).toContain('# HELP resolver_latency_ms')
      expect(output).toContain('# TYPE resolver_latency_ms histogram')
      expect(output).toContain('resolver_latency_ms_count 1')
    })
  })

  describe('resetMetrics', () => {
    it('should reset all metrics to initial state', () => {
      recordRequest('DIRECT')
      recordDecision('DIRECT', 'MATCHED')
      recordFailure('DIRECT', 'SYSTEM_ERROR')
      recordLatency(100)

      resetMetrics()

      const snapshot = getMetricsSnapshot()
      expect(Object.keys(snapshot.requests)).toHaveLength(0)
      expect(Object.keys(snapshot.decisions)).toHaveLength(0)
      expect(Object.keys(snapshot.failures)).toHaveLength(0)
      expect(snapshot.latency.count).toBe(0)
    })
  })
})
