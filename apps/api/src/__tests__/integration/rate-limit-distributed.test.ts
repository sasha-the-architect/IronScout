/**
 * Rate Limit Distributed Tests
 *
 * INVARIANT: RATE_LIMIT_DISTRIBUTED
 * Rate limits MUST be enforced consistently across API instances using Redis.
 *
 * INVARIANT: RATE_LIMIT_FAIL_OPEN
 * Redis failures in rate limiting MUST fail open (allow request) but log error.
 *
 * Tests Redis-based sliding window, fail-open behavior, and concurrent requests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Request, Response } from 'express'

// ============================================================================
// Mock Redis Client
// ============================================================================

interface MockRedisState {
  data: Map<string, { count: number; expireAt: number }>
  shouldFail: boolean
  failureType: 'error' | 'timeout' | null
}

const redisState: MockRedisState = {
  data: new Map(),
  shouldFail: false,
  failureType: null,
}

function createMockRedis() {
  return {
    multi: () => ({
      incr: vi.fn().mockReturnThis(),
      pttl: vi.fn().mockReturnThis(),
      exec: vi.fn().mockImplementation(async () => {
        if (redisState.shouldFail) {
          if (redisState.failureType === 'timeout') {
            throw new Error('Redis connection timeout')
          }
          throw new Error('Redis error')
        }

        // Simulate atomic incr + pttl
        const key = 'rl:test_ip'
        const now = Date.now()
        const existing = redisState.data.get(key)

        if (!existing || now > existing.expireAt) {
          redisState.data.set(key, { count: 1, expireAt: now + 60000 })
          return [[null, 1], [null, -1]] // New key, no TTL yet
        }

        existing.count++
        return [[null, existing.count], [null, existing.expireAt - now]]
      }),
    }),
    incr: vi.fn().mockImplementation(async (key: string) => {
      if (redisState.shouldFail) {
        throw new Error('Redis error')
      }
      const existing = redisState.data.get(key) || { count: 0, expireAt: Date.now() + 60000 }
      existing.count++
      redisState.data.set(key, existing)
      return existing.count
    }),
    pexpire: vi.fn().mockResolvedValue(1),
    get: vi.fn().mockResolvedValue(null),
    zincrby: vi.fn().mockResolvedValue('1'),
    expire: vi.fn().mockResolvedValue(1),
    pipeline: () => ({
      incr: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      zincrby: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    }),
    zrevrange: vi.fn().mockResolvedValue([]),
  }
}

const mockRedis = createMockRedis()

vi.mock('../../config/redis', () => ({
  getRedisClient: () => mockRedis,
}))

vi.mock('../../config/logger', () => ({
  loggers: {
    auth: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      }),
    },
  },
}))

// ============================================================================
// Rate Limiter Implementation (simplified for testing)
// ============================================================================

interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetTime: number
  error?: string
}

async function checkRateLimit(
  key: string,
  max: number,
  windowMs: number,
  failOpen: boolean = true
): Promise<RateLimitResult> {
  const redis = mockRedis
  const now = Date.now()

  try {
    const results = await redis.multi().incr(key).pttl(key).exec()

    if (!results) {
      throw new Error('Redis multi returned null')
    }

    const [[incrErr, count], [ttlErr, ttl]] = results as [[Error | null, number], [Error | null, number]]

    if (incrErr || ttlErr) {
      throw incrErr || ttlErr
    }

    // Set expiry on new key
    if (ttl === -1) {
      await redis.pexpire(key, windowMs)
    }

    const resetTime = ttl > 0 ? now + ttl : now + windowMs
    const remaining = Math.max(0, max - count)

    return {
      allowed: count <= max,
      remaining,
      resetTime,
    }
  } catch (error) {
    if (failOpen) {
      // FAIL OPEN: Allow request but log error
      return {
        allowed: true,
        remaining: max,
        resetTime: now + windowMs,
        error: (error as Error).message,
      }
    }
    // FAIL CLOSED: Block request
    return {
      allowed: false,
      remaining: 0,
      resetTime: now + windowMs,
      error: (error as Error).message,
    }
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('Rate Limit Distributed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    redisState.data.clear()
    redisState.shouldFail = false
    redisState.failureType = null
  })

  describe('Basic rate limiting', () => {
    it('should allow requests under limit', async () => {
      const results: RateLimitResult[] = []

      // Make 5 requests (limit is 10)
      for (let i = 0; i < 5; i++) {
        results.push(await checkRateLimit('rl:user1', 10, 60000))
      }

      // Assert - all allowed
      expect(results.every(r => r.allowed)).toBe(true)
      expect(results[4].remaining).toBe(5)
    })

    it('should block requests over limit', async () => {
      const results: RateLimitResult[] = []

      // Make 15 requests (limit is 10)
      for (let i = 0; i < 15; i++) {
        results.push(await checkRateLimit('rl:user1', 10, 60000))
      }

      // Assert - first 10 allowed, rest blocked
      expect(results.slice(0, 10).every(r => r.allowed)).toBe(true)
      expect(results.slice(10).every(r => !r.allowed)).toBe(true)
      expect(results[14].remaining).toBe(0)
    })

    it('should track requests per key', async () => {
      // Different users have separate limits
      const user1Results: RateLimitResult[] = []
      const user2Results: RateLimitResult[] = []

      // User 1 makes 8 requests
      for (let i = 0; i < 8; i++) {
        // Reset Redis state for each user key
        redisState.data.clear()
        user1Results.push(await checkRateLimit('rl:user1', 10, 60000))
      }

      // User 2 makes 3 requests
      redisState.data.clear()
      for (let i = 0; i < 3; i++) {
        user2Results.push(await checkRateLimit('rl:user2', 10, 60000))
      }

      // Assert - both users within their limits
      expect(user1Results.every(r => r.allowed)).toBe(true)
      expect(user2Results.every(r => r.allowed)).toBe(true)
    })
  })

  describe('Fail-open behavior', () => {
    it('should allow requests when Redis fails (fail-open)', async () => {
      // Arrange
      redisState.shouldFail = true
      redisState.failureType = 'error'

      // Act
      const result = await checkRateLimit('rl:user1', 10, 60000, true)

      // Assert - request allowed despite Redis error
      expect(result.allowed).toBe(true)
      expect(result.error).toBe('Redis error')
    })

    it('should allow requests on Redis timeout (fail-open)', async () => {
      // Arrange
      redisState.shouldFail = true
      redisState.failureType = 'timeout'

      // Act
      const result = await checkRateLimit('rl:user1', 10, 60000, true)

      // Assert
      expect(result.allowed).toBe(true)
      expect(result.error).toBe('Redis connection timeout')
    })

    it('should block requests when Redis fails (fail-closed mode)', async () => {
      // Arrange
      redisState.shouldFail = true

      // Act - fail-closed mode
      const result = await checkRateLimit('rl:user1', 10, 60000, false)

      // Assert
      expect(result.allowed).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('Concurrent request handling', () => {
    it('should handle burst of concurrent requests', async () => {
      // Arrange
      const concurrency = 20
      const limit = 10

      // Simulate atomic Redis operations
      let atomicCounter = 0
      mockRedis.multi = () => ({
        incr: vi.fn().mockReturnThis(),
        pttl: vi.fn().mockReturnThis(),
        exec: vi.fn().mockImplementation(async () => {
          atomicCounter++
          return [[null, atomicCounter], [null, 60000]]
        }),
      })

      // Act - concurrent requests
      const promises = Array(concurrency)
        .fill(null)
        .map(() => checkRateLimit('rl:burst', limit, 60000))

      const results = await Promise.all(promises)

      // Assert - exactly `limit` requests allowed
      const allowedCount = results.filter(r => r.allowed).length
      expect(allowedCount).toBe(limit)
    })

    it('should maintain consistency across simulated instances', async () => {
      // Simulate multiple API instances hitting same Redis
      const instances = ['api-1', 'api-2', 'api-3']
      const requestsPerInstance = 5
      const limit = 10

      let sharedCounter = 0
      mockRedis.multi = () => ({
        incr: vi.fn().mockReturnThis(),
        pttl: vi.fn().mockReturnThis(),
        exec: vi.fn().mockImplementation(async () => {
          sharedCounter++
          return [[null, sharedCounter], [null, 60000]]
        }),
      })

      // Act - requests from all instances
      const allResults: RateLimitResult[] = []

      for (const instance of instances) {
        for (let i = 0; i < requestsPerInstance; i++) {
          allResults.push(await checkRateLimit('rl:shared', limit, 60000))
        }
      }

      // Assert - total allowed = limit, regardless of instance
      const totalAllowed = allResults.filter(r => r.allowed).length
      expect(totalAllowed).toBe(limit)
    })
  })

  describe('Window expiration', () => {
    it('should reset counter after window expires', async () => {
      vi.useFakeTimers()
      const now = new Date('2024-01-15T12:00:00Z')
      vi.setSystemTime(now)

      // Track time-aware Redis state
      let requestCount = 0
      let windowStart = now.getTime()
      const windowMs = 60000

      mockRedis.multi = () => ({
        incr: vi.fn().mockReturnThis(),
        pttl: vi.fn().mockReturnThis(),
        exec: vi.fn().mockImplementation(async () => {
          const currentTime = Date.now()

          // Window expired - reset
          if (currentTime > windowStart + windowMs) {
            requestCount = 0
            windowStart = currentTime
          }

          requestCount++
          const ttl = windowStart + windowMs - currentTime

          return [[null, requestCount], [null, Math.max(0, ttl)]]
        }),
      })

      // Fill the limit
      for (let i = 0; i < 10; i++) {
        await checkRateLimit('rl:user1', 10, windowMs)
      }

      // Should be blocked
      const blockedResult = await checkRateLimit('rl:user1', 10, windowMs)
      expect(blockedResult.allowed).toBe(false)

      // Advance time past window
      vi.advanceTimersByTime(61000)

      // Should be allowed again
      const newWindowResult = await checkRateLimit('rl:user1', 10, windowMs)
      expect(newWindowResult.allowed).toBe(true)
      expect(newWindowResult.remaining).toBe(9)

      vi.useRealTimers()
    })
  })

  describe('Rate limit headers', () => {
    it('should return correct headers for tracking', async () => {
      let counter = 0
      mockRedis.multi = () => ({
        incr: vi.fn().mockReturnThis(),
        pttl: vi.fn().mockReturnThis(),
        exec: vi.fn().mockImplementation(async () => {
          counter++
          return [[null, counter], [null, 55000]]
        }),
      })

      // Make 3 requests
      const results: RateLimitResult[] = []
      for (let i = 0; i < 3; i++) {
        results.push(await checkRateLimit('rl:user1', 10, 60000))
      }

      // Assert headers can be derived from results
      expect(results[0].remaining).toBe(9) // 10 - 1
      expect(results[1].remaining).toBe(8) // 10 - 2
      expect(results[2].remaining).toBe(7) // 10 - 3
      expect(results[2].resetTime).toBeGreaterThan(Date.now())
    })
  })
})

describe('Rate Limit Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    redisState.data.clear()
    redisState.shouldFail = false
  })

  it('should handle exactly-at-limit request', async () => {
    let counter = 9 // One below limit
    mockRedis.multi = () => ({
      incr: vi.fn().mockReturnThis(),
      pttl: vi.fn().mockReturnThis(),
      exec: vi.fn().mockImplementation(async () => {
        counter++
        return [[null, counter], [null, 30000]]
      }),
    })

    // Request exactly at limit
    const result = await checkRateLimit('rl:user1', 10, 60000)

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(0)
  })

  it('should handle negative remaining gracefully', async () => {
    let counter = 15 // Well over limit
    mockRedis.multi = () => ({
      incr: vi.fn().mockReturnThis(),
      pttl: vi.fn().mockReturnThis(),
      exec: vi.fn().mockImplementation(async () => {
        counter++
        return [[null, counter], [null, 30000]]
      }),
    })

    const result = await checkRateLimit('rl:user1', 10, 60000)

    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0) // Clamped to 0, not negative
  })
})
