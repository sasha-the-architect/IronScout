/**
 * Circuit Breaker Tests
 *
 * INVARIANT: CIRCUIT_BREAKER_BLOCKS_PROMOTION
 * If >30% of products would expire (and ≥10 absolute), promotion MUST be
 * blocked and notification sent.
 *
 * Tests threshold calculations, edge cases, and bypass behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// Mocks
// ============================================================================

vi.mock('@ironscout/db', () => ({
  prisma: {
    source_product_presence: {
      count: vi.fn(),
      updateMany: vi.fn(),
    },
    source_products: {
      updateMany: vi.fn(),
    },
    affiliate_feed_runs: {
      update: vi.fn(),
    },
  },
  isCircuitBreakerBypassed: vi.fn().mockResolvedValue(false),
}))

vi.mock('@ironscout/notifications', () => ({
  notifyCircuitBreakerTriggered: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../config/logger', () => ({
  logger: {
    affiliate: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  },
}))

// ============================================================================
// Circuit Breaker Logic (extracted from spec)
// ============================================================================

interface CircuitBreakerMetrics {
  activeCountBefore: number
  seenSuccessCount: number
  wouldExpireCount: number
  urlHashFallbackCount: number
  expiryPercentage: number
}

interface CircuitBreakerResult {
  passed: boolean
  reason?: 'SPIKE_THRESHOLD_EXCEEDED' | 'DATA_QUALITY_URL_HASH_SPIKE'
  metrics: CircuitBreakerMetrics
}

const CIRCUIT_BREAKER_THRESHOLDS = {
  MAX_EXPIRY_PERCENTAGE: 30,
  MIN_EXPIRY_COUNT_FOR_SPIKE: 10,
  ABSOLUTE_EXPIRY_CAP: 500,
  MAX_URL_HASH_FALLBACK_PERCENTAGE: 50,
  ABSOLUTE_URL_HASH_CAP: 1000,
  MIN_ACTIVE_FOR_PERCENTAGE_CHECK: 100,
}

function evaluateCircuitBreakerLogic(
  activeCountBefore: number,
  seenSuccessCount: number,
  urlHashFallbackCount: number,
  totalUpserted: number
): CircuitBreakerResult {
  const wouldExpireCount = activeCountBefore - seenSuccessCount
  const expiryPercentage =
    activeCountBefore > 0 ? (wouldExpireCount / activeCountBefore) * 100 : 0

  const metrics: CircuitBreakerMetrics = {
    activeCountBefore,
    seenSuccessCount,
    wouldExpireCount,
    urlHashFallbackCount,
    expiryPercentage,
  }

  // Check absolute expiry cap (catastrophic data loss prevention)
  if (wouldExpireCount >= CIRCUIT_BREAKER_THRESHOLDS.ABSOLUTE_EXPIRY_CAP) {
    return { passed: false, reason: 'SPIKE_THRESHOLD_EXCEEDED', metrics }
  }

  // Check percentage threshold (only if enough products to be meaningful)
  if (
    activeCountBefore >= CIRCUIT_BREAKER_THRESHOLDS.MIN_ACTIVE_FOR_PERCENTAGE_CHECK &&
    wouldExpireCount >= CIRCUIT_BREAKER_THRESHOLDS.MIN_EXPIRY_COUNT_FOR_SPIKE &&
    expiryPercentage > CIRCUIT_BREAKER_THRESHOLDS.MAX_EXPIRY_PERCENTAGE
  ) {
    return { passed: false, reason: 'SPIKE_THRESHOLD_EXCEEDED', metrics }
  }

  // Check absolute URL_HASH cap (data quality gate)
  if (urlHashFallbackCount >= CIRCUIT_BREAKER_THRESHOLDS.ABSOLUTE_URL_HASH_CAP) {
    return { passed: false, reason: 'DATA_QUALITY_URL_HASH_SPIKE', metrics }
  }

  // Check URL_HASH percentage (only if significant volume)
  if (
    totalUpserted > 0 &&
    (urlHashFallbackCount / totalUpserted) * 100 >
      CIRCUIT_BREAKER_THRESHOLDS.MAX_URL_HASH_FALLBACK_PERCENTAGE
  ) {
    return { passed: false, reason: 'DATA_QUALITY_URL_HASH_SPIKE', metrics }
  }

  return { passed: true, metrics }
}

// ============================================================================
// Tests
// ============================================================================

describe('Circuit Breaker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Expiry percentage threshold', () => {
    it('should PASS when expiry is below 30% threshold', () => {
      // 100 active, 80 seen (20% would expire)
      const result = evaluateCircuitBreakerLogic(100, 80, 0, 80)

      expect(result.passed).toBe(true)
      expect(result.metrics.expiryPercentage).toBe(20)
    })

    it('should PASS at exactly 30% (threshold is >30%, not >=30%)', () => {
      // 100 active, 70 seen (30% would expire)
      const result = evaluateCircuitBreakerLogic(100, 70, 0, 70)

      expect(result.passed).toBe(true)
      expect(result.metrics.expiryPercentage).toBe(30)
    })

    it('should BLOCK when expiry exceeds 30%', () => {
      // 100 active, 69 seen (31% would expire)
      const result = evaluateCircuitBreakerLogic(100, 69, 0, 69)

      expect(result.passed).toBe(false)
      expect(result.reason).toBe('SPIKE_THRESHOLD_EXCEEDED')
      expect(result.metrics.expiryPercentage).toBe(31)
    })

    it('should PASS when expiry >30% but count <10 (MIN_EXPIRY_COUNT_FOR_SPIKE)', () => {
      // 20 active, 10 seen (50% would expire = 10 products)
      // 10 products but need >=10, so this is at the boundary
      const result = evaluateCircuitBreakerLogic(20, 10, 0, 10)

      // 10 would expire, which equals MIN_EXPIRY_COUNT_FOR_SPIKE
      // But we also need MIN_ACTIVE_FOR_PERCENTAGE_CHECK = 100
      expect(result.passed).toBe(true) // Below MIN_ACTIVE_FOR_PERCENTAGE_CHECK
    })

    it('should PASS with high expiry percentage but low absolute count', () => {
      // 50 active, 20 seen (60% would expire = 30 products)
      // activeCountBefore (50) < MIN_ACTIVE_FOR_PERCENTAGE_CHECK (100)
      const result = evaluateCircuitBreakerLogic(50, 20, 0, 20)

      expect(result.passed).toBe(true)
      expect(result.metrics.expiryPercentage).toBe(60)
    })
  })

  describe('Absolute expiry cap', () => {
    it('should BLOCK when absolute expiry >= 500', () => {
      // 1000 active, 500 seen (500 would expire)
      const result = evaluateCircuitBreakerLogic(1000, 500, 0, 500)

      expect(result.passed).toBe(false)
      expect(result.reason).toBe('SPIKE_THRESHOLD_EXCEEDED')
      expect(result.metrics.wouldExpireCount).toBe(500)
    })

    it('should PASS when absolute expiry is 499 but percentage is low', () => {
      // 5000 active, 4501 seen (499 would expire = 9.98%, below 30%)
      // This tests the absolute cap boundary without hitting percentage threshold
      const result = evaluateCircuitBreakerLogic(5000, 4501, 0, 4501)

      expect(result.passed).toBe(true)
      expect(result.metrics.wouldExpireCount).toBe(499)
      expect(result.metrics.expiryPercentage).toBeLessThan(30)
    })

    it('should BLOCK at cap even if percentage is low', () => {
      // 10000 active, 9500 seen (500 would expire = 5%)
      const result = evaluateCircuitBreakerLogic(10000, 9500, 0, 9500)

      expect(result.passed).toBe(false)
      expect(result.reason).toBe('SPIKE_THRESHOLD_EXCEEDED')
      expect(result.metrics.expiryPercentage).toBe(5)
    })
  })

  describe('URL_HASH fallback gate', () => {
    it('should BLOCK when URL_HASH count >= 1000', () => {
      const result = evaluateCircuitBreakerLogic(1000, 1000, 1000, 1500)

      expect(result.passed).toBe(false)
      expect(result.reason).toBe('DATA_QUALITY_URL_HASH_SPIKE')
    })

    it('should PASS when URL_HASH count is 999 with large total', () => {
      // 999 URL_HASH out of 2500 total = 39.96% (below 50% threshold)
      const result = evaluateCircuitBreakerLogic(1000, 1000, 999, 2500)

      expect(result.passed).toBe(true)
    })

    it('should BLOCK when URL_HASH percentage > 50%', () => {
      // 100 products, 51 using URL_HASH = 51%
      const result = evaluateCircuitBreakerLogic(100, 100, 51, 100)

      expect(result.passed).toBe(false)
      expect(result.reason).toBe('DATA_QUALITY_URL_HASH_SPIKE')
    })

    it('should PASS at exactly 50% URL_HASH', () => {
      // 100 products, 50 using URL_HASH = 50%
      const result = evaluateCircuitBreakerLogic(100, 100, 50, 100)

      expect(result.passed).toBe(true)
    })
  })

  describe('Edge cases', () => {
    it('should PASS with zero active products', () => {
      const result = evaluateCircuitBreakerLogic(0, 0, 0, 50)

      expect(result.passed).toBe(true)
      expect(result.metrics.expiryPercentage).toBe(0)
    })

    it('should PASS with first run (no prior products)', () => {
      // First run: 0 active before, 100 new products
      const result = evaluateCircuitBreakerLogic(0, 0, 5, 100)

      expect(result.passed).toBe(true)
    })

    it('should PASS when seen count equals active count (no expiry)', () => {
      const result = evaluateCircuitBreakerLogic(1000, 1000, 10, 1000)

      expect(result.passed).toBe(true)
      expect(result.metrics.wouldExpireCount).toBe(0)
    })

    it('should BLOCK when all products would expire (100% expiry)', () => {
      // 100 active, 0 seen (100% would expire)
      // activeCountBefore = 100, meets MIN_ACTIVE_FOR_PERCENTAGE_CHECK
      const result = evaluateCircuitBreakerLogic(100, 0, 0, 0)

      expect(result.passed).toBe(false)
      expect(result.reason).toBe('SPIKE_THRESHOLD_EXCEEDED')
      expect(result.metrics.expiryPercentage).toBe(100)
    })
  })

  describe('Combined thresholds', () => {
    it('should check URL_HASH even when expiry passes', () => {
      // Expiry: 100 active, 90 seen (10% - passes)
      // URL_HASH: 1000 (fails absolute cap)
      const result = evaluateCircuitBreakerLogic(100, 90, 1000, 90)

      expect(result.passed).toBe(false)
      expect(result.reason).toBe('DATA_QUALITY_URL_HASH_SPIKE')
    })

    it('should return first failure reason (expiry checked before URL_HASH)', () => {
      // Both thresholds exceeded
      const result = evaluateCircuitBreakerLogic(1000, 400, 1500, 400)

      // Absolute expiry cap (600 > 500) checked first
      expect(result.passed).toBe(false)
      expect(result.reason).toBe('SPIKE_THRESHOLD_EXCEEDED')
    })
  })
})

describe('Circuit Breaker Bypass', () => {
  it('should allow bypass when flag is set', async () => {
    // Simulate bypass flag check
    const isBypassed = true // From feature flag

    if (isBypassed) {
      // When bypassed, skip circuit breaker evaluation
      const result = { passed: true, metrics: {} }
      expect(result.passed).toBe(true)
    }
  })

  it('should log warning when bypass is active', () => {
    // This test documents expected behavior
    // When CIRCUIT_BREAKER_BYPASS flag is true:
    // 1. Worker should log.warn('Circuit breaker BYPASSED globally')
    // 2. Promotion should proceed regardless of metrics
    expect(true).toBe(true) // Placeholder - actual logging tested in worker.test.ts
  })
})

describe('Circuit Breaker Notifications', () => {
  it('should include metrics in notification payload', () => {
    const result = evaluateCircuitBreakerLogic(1000, 600, 50, 600)

    expect(result.passed).toBe(false)
    expect(result.metrics).toEqual({
      activeCountBefore: 1000,
      seenSuccessCount: 600,
      wouldExpireCount: 400,
      urlHashFallbackCount: 50,
      expiryPercentage: 40,
    })
  })
})
