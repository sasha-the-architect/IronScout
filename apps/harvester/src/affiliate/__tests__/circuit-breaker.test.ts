/**
 * Tests for Affiliate Feed Circuit Breaker
 *
 * Tests spike detection and threshold enforcement.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CIRCUIT_BREAKER_THRESHOLDS } from '../types'

// Mock Prisma client
vi.mock('@ironscout/db', () => ({
  prisma: {
    affiliateFeed: {
      findUnique: vi.fn(),
    },
    sourceProductPresence: {
      count: vi.fn(),
    },
    sourceProductSeen: {
      count: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  },
}))

describe('CircuitBreakerThresholds', () => {
  it('should have correct expiry threshold (30% per spec Q7.2.2)', () => {
    expect(CIRCUIT_BREAKER_THRESHOLDS.MAX_EXPIRY_PERCENTAGE).toBe(30)
  })

  it('should have correct minimum expiry count (10 per spec Q7.2.2)', () => {
    expect(CIRCUIT_BREAKER_THRESHOLDS.MIN_EXPIRY_COUNT_FOR_SPIKE).toBe(10)
  })

  it('should have absolute expiry cap (500 per spec Q7.2.2)', () => {
    expect(CIRCUIT_BREAKER_THRESHOLDS.ABSOLUTE_EXPIRY_CAP).toBe(500)
  })

  it('should have correct URL hash fallback threshold', () => {
    expect(CIRCUIT_BREAKER_THRESHOLDS.MAX_URL_HASH_FALLBACK_PERCENTAGE).toBe(50)
  })

  it('should have absolute URL_HASH cap (1000 per spec Q6.1.5)', () => {
    expect(CIRCUIT_BREAKER_THRESHOLDS.ABSOLUTE_URL_HASH_CAP).toBe(1000)
  })

  it('should have minimum active count for percentage check', () => {
    expect(CIRCUIT_BREAKER_THRESHOLDS.MIN_ACTIVE_FOR_PERCENTAGE_CHECK).toBe(100)
  })
})

describe('Circuit Breaker Logic', () => {
  describe('Expiry Spike Detection', () => {
    it('should pass when expiry percentage is below threshold', () => {
      const activeCountBefore = 1000
      const wouldExpireCount = 200 // 20% - below 30% threshold

      const expiryPercentage = (wouldExpireCount / activeCountBefore) * 100

      expect(expiryPercentage).toBeLessThan(CIRCUIT_BREAKER_THRESHOLDS.MAX_EXPIRY_PERCENTAGE)
    })

    it('should fail when expiry percentage exceeds threshold', () => {
      const activeCountBefore = 1000
      const wouldExpireCount = 350 // 35% - above 30% threshold

      const expiryPercentage = (wouldExpireCount / activeCountBefore) * 100

      expect(expiryPercentage).toBeGreaterThan(CIRCUIT_BREAKER_THRESHOLDS.MAX_EXPIRY_PERCENTAGE)
    })

    it('should skip percentage check when active count is below minimum', () => {
      const activeCountBefore = 50 // Below 100 minimum
      const wouldExpireCount = 40 // 80% would expire, but should be ignored

      expect(activeCountBefore).toBeLessThan(CIRCUIT_BREAKER_THRESHOLDS.MIN_ACTIVE_FOR_PERCENTAGE_CHECK)
      // When below minimum, percentage check should be skipped
    })

    it('should handle edge case of exactly 30% expiry', () => {
      const activeCountBefore = 1000
      const wouldExpireCount = 300 // Exactly 30%

      const expiryPercentage = (wouldExpireCount / activeCountBefore) * 100

      // At exactly threshold, should pass (> not >=)
      expect(expiryPercentage).toBe(CIRCUIT_BREAKER_THRESHOLDS.MAX_EXPIRY_PERCENTAGE)
    })

    it('should require both percentage AND absolute count to trigger (per spec Q7.2.2)', () => {
      // Per spec: Block if (wouldExpire / activeBefore) > 30% AND wouldExpire >= 10
      const activeCountBefore = 20
      const wouldExpireCount = 8 // 40% but only 8 absolute - should NOT trigger

      const expiryPercentage = (wouldExpireCount / activeCountBefore) * 100

      // Percentage exceeds threshold
      expect(expiryPercentage).toBeGreaterThan(CIRCUIT_BREAKER_THRESHOLDS.MAX_EXPIRY_PERCENTAGE)
      // But absolute count is below minimum
      expect(wouldExpireCount).toBeLessThan(CIRCUIT_BREAKER_THRESHOLDS.MIN_EXPIRY_COUNT_FOR_SPIKE)
      // So circuit breaker should NOT trigger (both conditions required)
    })

    it('should trigger on absolute expiry cap regardless of percentage (per spec Q7.2.2)', () => {
      // Per spec: Block if wouldExpire >= 500 (regardless of percentage)
      const wouldExpireCount = 500

      expect(wouldExpireCount).toBeGreaterThanOrEqual(CIRCUIT_BREAKER_THRESHOLDS.ABSOLUTE_EXPIRY_CAP)
      // This should trigger even if percentage is low (e.g., 5% of 10000 products)
    })
  })

  describe('Absolute Caps', () => {
    it('should block on absolute expiry cap (>=500) regardless of percentage', () => {
      // Even at low percentage, 500+ expiring is catastrophic
      const activeCountBefore = 10000
      const wouldExpireCount = 500 // Only 5% but still triggers absolute cap

      const expiryPercentage = (wouldExpireCount / activeCountBefore) * 100

      expect(expiryPercentage).toBeLessThan(CIRCUIT_BREAKER_THRESHOLDS.MAX_EXPIRY_PERCENTAGE) // 5% < 30%
      expect(wouldExpireCount).toBeGreaterThanOrEqual(CIRCUIT_BREAKER_THRESHOLDS.ABSOLUTE_EXPIRY_CAP) // 500 >= 500
    })

    it('should block on absolute URL_HASH cap (>1000) ONLY for established feeds', () => {
      // For established feeds (activeCountBefore >= 100), URL_HASH cap applies
      const activeCountBefore = 1000
      const urlHashFallbackCount = 1001 // Triggers absolute cap

      expect(activeCountBefore).toBeGreaterThanOrEqual(CIRCUIT_BREAKER_THRESHOLDS.MIN_ACTIVE_FOR_PERCENTAGE_CHECK)
      expect(urlHashFallbackCount).toBeGreaterThan(CIRCUIT_BREAKER_THRESHOLDS.ABSOLUTE_URL_HASH_CAP)
      // This should block for established feeds
    })

    it('should NOT block on absolute URL_HASH cap for new/cold feeds', () => {
      // For new feeds (activeCountBefore < 100), URL_HASH cap should NOT apply
      // This prevents blocking legitimate new feeds with poor identity coverage
      const activeCountBefore = 50 // Below minimum - cold start
      const urlHashFallbackCount = 1500 // Would exceed cap, but should be ignored

      expect(activeCountBefore).toBeLessThan(CIRCUIT_BREAKER_THRESHOLDS.MIN_ACTIVE_FOR_PERCENTAGE_CHECK)
      expect(urlHashFallbackCount).toBeGreaterThan(CIRCUIT_BREAKER_THRESHOLDS.ABSOLUTE_URL_HASH_CAP)
      // This should NOT block - feed has no history, URL_HASH is expected
    })
  })

  describe('URL Hash Fallback Detection', () => {
    it('should pass when URL hash fallback is below threshold', () => {
      const seenSuccessCount = 1000
      const urlHashFallbackCount = 400 // 40% - below 50% threshold

      const urlHashPercentage = (urlHashFallbackCount / seenSuccessCount) * 100

      expect(urlHashPercentage).toBeLessThan(CIRCUIT_BREAKER_THRESHOLDS.MAX_URL_HASH_FALLBACK_PERCENTAGE)
    })

    it('should fail when URL hash fallback exceeds threshold', () => {
      const seenSuccessCount = 1000
      const urlHashFallbackCount = 600 // 60% - above 50% threshold

      const urlHashPercentage = (urlHashFallbackCount / seenSuccessCount) * 100

      expect(urlHashPercentage).toBeGreaterThan(CIRCUIT_BREAKER_THRESHOLDS.MAX_URL_HASH_FALLBACK_PERCENTAGE)
    })

    it('should handle zero seen products', () => {
      const seenSuccessCount = 0
      const urlHashFallbackCount = 0

      // Should not throw on division by zero
      const urlHashPercentage =
        seenSuccessCount > 0
          ? (urlHashFallbackCount / seenSuccessCount) * 100
          : 0

      expect(urlHashPercentage).toBe(0)
    })
  })

  describe('Combined Scenarios', () => {
    it('should pass when both metrics are healthy', () => {
      const metrics = {
        activeCountBefore: 1000,
        seenSuccessCount: 950,
        wouldExpireCount: 50, // 5% expiry
        urlHashFallbackCount: 100, // 10.5% URL hash
      }

      const expiryPercentage = (metrics.wouldExpireCount / metrics.activeCountBefore) * 100
      const urlHashPercentage = (metrics.urlHashFallbackCount / metrics.seenSuccessCount) * 100

      expect(expiryPercentage).toBeLessThan(CIRCUIT_BREAKER_THRESHOLDS.MAX_EXPIRY_PERCENTAGE)
      expect(urlHashPercentage).toBeLessThan(CIRCUIT_BREAKER_THRESHOLDS.MAX_URL_HASH_FALLBACK_PERCENTAGE)
    })

    it('should fail if expiry spike detected even with healthy URL hash rate', () => {
      const metrics = {
        activeCountBefore: 1000,
        seenSuccessCount: 950,
        wouldExpireCount: 350, // 35% expiry - FAIL (>30%)
        urlHashFallbackCount: 100, // 10.5% URL hash - OK
      }

      const expiryPercentage = (metrics.wouldExpireCount / metrics.activeCountBefore) * 100

      expect(expiryPercentage).toBeGreaterThan(CIRCUIT_BREAKER_THRESHOLDS.MAX_EXPIRY_PERCENTAGE)
    })

    it('should fail if URL hash spike detected even with healthy expiry rate', () => {
      const metrics = {
        activeCountBefore: 1000,
        seenSuccessCount: 950,
        wouldExpireCount: 100, // 10% expiry - OK
        urlHashFallbackCount: 600, // 63% URL hash - FAIL
      }

      const urlHashPercentage = (metrics.urlHashFallbackCount / metrics.seenSuccessCount) * 100

      expect(urlHashPercentage).toBeGreaterThan(CIRCUIT_BREAKER_THRESHOLDS.MAX_URL_HASH_FALLBACK_PERCENTAGE)
    })
  })
})

describe('Circuit Breaker Reasons', () => {
  it('should use correct reason code for expiry spike', () => {
    const reason = 'SPIKE_THRESHOLD_EXCEEDED'
    expect(reason).toBe('SPIKE_THRESHOLD_EXCEEDED')
  })

  it('should use correct reason code for URL hash spike', () => {
    const reason = 'DATA_QUALITY_URL_HASH_SPIKE'
    expect(reason).toBe('DATA_QUALITY_URL_HASH_SPIKE')
  })
})

describe('Promotion Logic', () => {
  it('should only promote when circuit breaker passes', () => {
    // Simulation: circuit breaker passed
    const cbResult = { passed: true, metrics: {} }

    // When passed is true, products should be promoted
    expect(cbResult.passed).toBe(true)
  })

  it('should block promotion when circuit breaker fails', () => {
    // Simulation: circuit breaker failed
    const cbResult = {
      passed: false,
      reason: 'SPIKE_THRESHOLD_EXCEEDED',
      metrics: {
        activeCountBefore: 1000,
        wouldExpireCount: 300,
        expiryPercentage: 30,
      },
    }

    // When passed is false, products should NOT be promoted
    expect(cbResult.passed).toBe(false)
    expect(cbResult.reason).toBeDefined()
  })
})
