/**
 * Writer Metrics Tests
 *
 * Tests for price variance metrics emission including:
 * - Normal price changes
 * - Large variance detection (bad affiliate pricing data scenario)
 * - Bucket categorization
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  calculateVariancePct,
  varianceToBucket,
  recordPriceWritten,
  recordPriceVariance,
  recordPriceWriteWithVariance,
  getWriterMetricsSnapshot,
  getWriterPrometheusMetrics,
  resetWriterMetrics,
  getTotalVarianceExceeded,
  getVarianceExceededRate,
  PRICE_VARIANCE_ALERT_THRESHOLD_PCT,
} from '../metrics'

describe('Writer Metrics', () => {
  beforeEach(() => {
    resetWriterMetrics()
  })

  describe('calculateVariancePct', () => {
    it('should calculate correct variance percentage', () => {
      expect(calculateVariancePct(100, 110)).toBe(10) // 10% increase
      expect(calculateVariancePct(100, 90)).toBe(10)  // 10% decrease
      expect(calculateVariancePct(100, 150)).toBe(50) // 50% increase
      expect(calculateVariancePct(100, 200)).toBe(100) // 100% increase
    })

    it('should handle zero old price', () => {
      expect(calculateVariancePct(0, 100)).toBe(100)
      expect(calculateVariancePct(0, 0)).toBe(0)
    })

    it('should handle same price', () => {
      expect(calculateVariancePct(100, 100)).toBe(0)
    })
  })

  describe('varianceToBucket', () => {
    it('should categorize variance into correct buckets', () => {
      expect(varianceToBucket(5)).toBe('0-10%')
      expect(varianceToBucket(10)).toBe('0-10%')
      expect(varianceToBucket(15)).toBe('10-25%')
      expect(varianceToBucket(25)).toBe('10-25%')
      expect(varianceToBucket(30)).toBe('25-50%')
      expect(varianceToBucket(50)).toBe('25-50%')
      expect(varianceToBucket(75)).toBe('50-100%')
      expect(varianceToBucket(100)).toBe('50-100%')
      expect(varianceToBucket(150)).toBe('>100%')
    })
  })

  describe('recordPriceWritten', () => {
    it('should increment price written count by source kind', () => {
      recordPriceWritten('DIRECT')
      recordPriceWritten('DIRECT', 5)
      recordPriceWritten('AFFILIATE_FEED', 3)

      const snapshot = getWriterMetricsSnapshot()
      expect(snapshot.pricesWritten['DIRECT']).toBe(6)
      expect(snapshot.pricesWritten['AFFILIATE_FEED']).toBe(3)
    })
  })

  describe('recordPriceVariance', () => {
    it('should update histogram for all variance', () => {
      recordPriceVariance({
        sourceKind: 'DIRECT',
        oldPrice: 100,
        newPrice: 110,
        action: 'ACCEPTED',
      })

      const snapshot = getWriterMetricsSnapshot()
      expect(snapshot.varianceHistogram.count).toBe(1)
      expect(snapshot.varianceHistogram.sum).toBe(10) // 10% variance
    })

    it('should record to counter when exceeds threshold', () => {
      // Default threshold is 30%
      recordPriceVariance({
        sourceKind: 'AFFILIATE_FEED',
        oldPrice: 100,
        newPrice: 150, // 50% variance - exceeds threshold
        action: 'ACCEPTED',
      })

      const snapshot = getWriterMetricsSnapshot()
      expect(snapshot.varianceExceeded['AFFILIATE_FEED:25-50%:ACCEPTED']).toBe(1)
    })

    it('should NOT record to counter when below threshold', () => {
      recordPriceVariance({
        sourceKind: 'DIRECT',
        oldPrice: 100,
        newPrice: 110, // 10% variance - below threshold
        action: 'ACCEPTED',
      })

      const snapshot = getWriterMetricsSnapshot()
      expect(Object.keys(snapshot.varianceExceeded)).toHaveLength(0)
    })
  })

  describe('recordPriceWriteWithVariance', () => {
    it('should record price and variance for price change', () => {
      recordPriceWriteWithVariance({
        sourceKind: 'DIRECT',
        oldPrice: 100,
        newPrice: 150,
        action: 'ACCEPTED',
      })

      const snapshot = getWriterMetricsSnapshot()
      expect(snapshot.pricesWritten['DIRECT']).toBe(1)
      expect(snapshot.varianceHistogram.count).toBe(1)
    })

    it('should record price only for new price (no old price)', () => {
      recordPriceWriteWithVariance({
        sourceKind: 'AFFILIATE_FEED',
        newPrice: 100,
      })

      const snapshot = getWriterMetricsSnapshot()
      expect(snapshot.pricesWritten['AFFILIATE_FEED']).toBe(1)
      expect(snapshot.varianceHistogram.count).toBe(0) // No variance recorded
    })
  })

  describe('Bad Affiliate Pricing Data Scenario', () => {
    /**
     * Simulates detecting bad pricing data from an affiliate feed
     * where prices spike unexpectedly (e.g., wrong currency, corrupted data)
     */
    it('should detect extreme price spikes (>100% variance)', () => {
      // Affiliate feed sends price that's 3x the expected value
      recordPriceWriteWithVariance({
        sourceKind: 'AFFILIATE_FEED',
        oldPrice: 29.99,
        newPrice: 89.99, // ~200% increase - clearly wrong
        action: 'ACCEPTED',
      })

      const snapshot = getWriterMetricsSnapshot()
      expect(snapshot.varianceExceeded['AFFILIATE_FEED:>100%:ACCEPTED']).toBe(1)
      expect(getTotalVarianceExceeded()).toBe(1)
    })

    it('should track multiple bad prices from same feed', () => {
      const badPrices = [
        { old: 29.99, new: 89.99 },  // 200%
        { old: 15.99, new: 79.99 },  // 400%
        { old: 22.50, new: 112.50 }, // 400%
      ]

      for (const { old, new: newP } of badPrices) {
        recordPriceWriteWithVariance({
          sourceKind: 'AFFILIATE_FEED',
          oldPrice: old,
          newPrice: newP,
          action: 'ACCEPTED',
        })
      }

      expect(getTotalVarianceExceeded()).toBe(3)
    })

    it('should calculate variance exceeded rate', () => {
      // 10 normal prices
      for (let i = 0; i < 10; i++) {
        recordPriceWriteWithVariance({
          sourceKind: 'AFFILIATE_FEED',
          oldPrice: 29.99,
          newPrice: 30.49, // ~1.6% change - normal
          action: 'ACCEPTED',
        })
      }

      // 2 bad prices
      recordPriceWriteWithVariance({
        sourceKind: 'AFFILIATE_FEED',
        oldPrice: 29.99,
        newPrice: 89.99,
        action: 'ACCEPTED',
      })
      recordPriceWriteWithVariance({
        sourceKind: 'AFFILIATE_FEED',
        oldPrice: 15.99,
        newPrice: 79.99,
        action: 'ACCEPTED',
      })

      const rate = getVarianceExceededRate()
      expect(rate).toBeCloseTo(2 / 12, 4) // 2 bad out of 12 total
    })

    it('should distinguish between source kinds', () => {
      // DIRECT source - normal price change
      recordPriceWriteWithVariance({
        sourceKind: 'DIRECT',
        oldPrice: 100,
        newPrice: 110, // 10%
        action: 'ACCEPTED',
      })

      // AFFILIATE_FEED - bad data
      recordPriceWriteWithVariance({
        sourceKind: 'AFFILIATE_FEED',
        oldPrice: 100,
        newPrice: 300, // 200%
        action: 'ACCEPTED',
      })

      const snapshot = getWriterMetricsSnapshot()
      expect(snapshot.varianceExceeded['DIRECT:0-10%:ACCEPTED']).toBeUndefined() // Below threshold
      expect(snapshot.varianceExceeded['AFFILIATE_FEED:>100%:ACCEPTED']).toBe(1)
    })
  })

  describe('Action Tracking', () => {
    it('should track different actions separately', () => {
      recordPriceVariance({
        sourceKind: 'AFFILIATE_FEED',
        oldPrice: 100,
        newPrice: 200,
        action: 'ACCEPTED',
      })

      recordPriceVariance({
        sourceKind: 'AFFILIATE_FEED',
        oldPrice: 100,
        newPrice: 200,
        action: 'QUARANTINED',
      })

      recordPriceVariance({
        sourceKind: 'AFFILIATE_FEED',
        oldPrice: 100,
        newPrice: 200,
        action: 'CLAMPED',
      })

      const snapshot = getWriterMetricsSnapshot()
      expect(snapshot.varianceExceeded['AFFILIATE_FEED:50-100%:ACCEPTED']).toBe(1)
      expect(snapshot.varianceExceeded['AFFILIATE_FEED:50-100%:QUARANTINED']).toBe(1)
      expect(snapshot.varianceExceeded['AFFILIATE_FEED:50-100%:CLAMPED']).toBe(1)
    })
  })

  describe('Prometheus Export', () => {
    it('should generate valid Prometheus format', () => {
      recordPriceWritten('DIRECT', 10)
      recordPriceVariance({
        sourceKind: 'AFFILIATE_FEED',
        oldPrice: 100,
        newPrice: 200,
        action: 'ACCEPTED',
      })

      const output = getWriterPrometheusMetrics()

      expect(output).toContain('# HELP writer_prices_written_total')
      expect(output).toContain('# TYPE writer_prices_written_total counter')
      expect(output).toContain('writer_prices_written_total{source_kind="DIRECT"} 10')

      expect(output).toContain('# HELP writer_price_variance_exceeded_total')
      expect(output).toContain('writer_price_variance_exceeded_total{source_kind="AFFILIATE_FEED",variance_bucket="50-100%",action="ACCEPTED"} 1')

      expect(output).toContain('# HELP writer_price_delta_pct')
      expect(output).toContain('# TYPE writer_price_delta_pct histogram')
    })
  })

  describe('Threshold Configuration', () => {
    it('should use configured threshold', () => {
      // Just below threshold
      const justBelow = PRICE_VARIANCE_ALERT_THRESHOLD_PCT - 1
      const oldPrice = 100
      const newPrice = oldPrice * (1 + justBelow / 100)

      recordPriceVariance({
        sourceKind: 'DIRECT',
        oldPrice,
        newPrice,
        action: 'ACCEPTED',
      })

      expect(getTotalVarianceExceeded()).toBe(0)

      // Just above threshold
      const justAbove = PRICE_VARIANCE_ALERT_THRESHOLD_PCT + 1
      const newPrice2 = oldPrice * (1 + justAbove / 100)

      recordPriceVariance({
        sourceKind: 'DIRECT',
        oldPrice,
        newPrice: newPrice2,
        action: 'ACCEPTED',
      })

      expect(getTotalVarianceExceeded()).toBe(1)
    })
  })

  describe('resetWriterMetrics', () => {
    it('should reset all metrics', () => {
      recordPriceWritten('DIRECT', 100)
      recordPriceVariance({
        sourceKind: 'AFFILIATE_FEED',
        oldPrice: 100,
        newPrice: 200,
        action: 'ACCEPTED',
      })

      resetWriterMetrics()

      const snapshot = getWriterMetricsSnapshot()
      expect(Object.keys(snapshot.pricesWritten)).toHaveLength(0)
      expect(Object.keys(snapshot.varianceExceeded)).toHaveLength(0)
      expect(snapshot.varianceHistogram.count).toBe(0)
    })
  })
})
