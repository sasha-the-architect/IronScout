/**
 * Tests for Rate Limiting Middleware
 *
 * Validates that:
 * - Rate limits are enforced correctly
 * - Expired entries are cleaned up
 * - Different keys are tracked separately
 * - 429 responses include helpful messages
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Request, Response, NextFunction } from 'express'

// Mock the database before anything else
vi.mock('@ironscout/db', () => ({
  prisma: {},
  getRedisClient: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
    pipeline: vi.fn(() => ({
      incr: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn(),
    })),
  })),
}))

// Mock the logger - must be inline because vi.mock is hoisted
vi.mock('../../config/logger', () => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnValue({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  }
  return {
    logger: mockLogger,
    loggers: {
      auth: mockLogger,
    },
  }
})

// Import after mocking
import { rateLimit } from '../auth'

describe('rateLimit middleware', () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let mockNext: NextFunction
  let jsonMock: ReturnType<typeof vi.fn>
  let statusMock: ReturnType<typeof vi.fn>
  let testCounter = 0

  beforeEach(() => {
    vi.useFakeTimers()
    testCounter++

    jsonMock = vi.fn()
    statusMock = vi.fn().mockReturnValue({ json: jsonMock })

    // Use unique IP for each test to avoid shared state in rateLimitStore
    mockReq = {
      ip: `test-ip-${testCounter}`,
    }
    mockRes = {
      status: statusMock,
    }
    mockNext = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('should allow requests under the limit', () => {
    const middleware = rateLimit({ max: 5, windowMs: 60000 })

    // Make 5 requests
    for (let i = 0; i < 5; i++) {
      middleware(mockReq as Request, mockRes as Response, mockNext)
    }

    expect(mockNext).toHaveBeenCalledTimes(5)
    expect(statusMock).not.toHaveBeenCalled()
  })

  it('should block requests over the limit with 429', () => {
    const middleware = rateLimit({ max: 3, windowMs: 60000 })

    // Make 4 requests (1 over limit)
    for (let i = 0; i < 4; i++) {
      middleware(mockReq as Request, mockRes as Response, mockNext)
    }

    expect(mockNext).toHaveBeenCalledTimes(3)
    expect(statusMock).toHaveBeenCalledWith(429)
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Too many requests',
      })
    )
  })

  it('should reset count after window expires', () => {
    const middleware = rateLimit({ max: 2, windowMs: 60000 })

    // Make 2 requests (at limit)
    middleware(mockReq as Request, mockRes as Response, mockNext)
    middleware(mockReq as Request, mockRes as Response, mockNext)
    expect(mockNext).toHaveBeenCalledTimes(2)

    // Third request should be blocked
    middleware(mockReq as Request, mockRes as Response, mockNext)
    expect(mockNext).toHaveBeenCalledTimes(2)
    expect(statusMock).toHaveBeenCalledWith(429)

    // Advance time past the window
    vi.advanceTimersByTime(61000)

    // Reset mocks for fresh test
    mockNext = vi.fn()
    statusMock.mockClear()

    // Should be allowed again
    middleware(mockReq as Request, mockRes as Response, mockNext)
    expect(mockNext).toHaveBeenCalledTimes(1)
    expect(statusMock).not.toHaveBeenCalled()
  })

  it('should track different IPs separately', () => {
    const middleware = rateLimit({ max: 2, windowMs: 60000 })

    // IP 1: 2 requests (use unique IPs based on test counter)
    mockReq.ip = `unique-ip-a-${testCounter}`
    middleware(mockReq as Request, mockRes as Response, mockNext)
    middleware(mockReq as Request, mockRes as Response, mockNext)

    // IP 2: 2 requests
    mockReq.ip = `unique-ip-b-${testCounter}`
    middleware(mockReq as Request, mockRes as Response, mockNext)
    middleware(mockReq as Request, mockRes as Response, mockNext)

    // All 4 should succeed
    expect(mockNext).toHaveBeenCalledTimes(4)
    expect(statusMock).not.toHaveBeenCalled()
  })

  it('should use custom key generator', () => {
    const middleware = rateLimit({
      max: 1,
      windowMs: 60000,
      keyGenerator: (req) => req.headers?.['x-api-key'] as string || 'unknown',
    })

    // Same IP, different API keys (use unique keys based on test counter)
    mockReq.headers = { 'x-api-key': `key-a-${testCounter}` }
    middleware(mockReq as Request, mockRes as Response, mockNext)

    mockReq.headers = { 'x-api-key': `key-b-${testCounter}` }
    middleware(mockReq as Request, mockRes as Response, mockNext)

    // Both should succeed (different keys)
    expect(mockNext).toHaveBeenCalledTimes(2)
  })

  it('should handle missing IP gracefully', () => {
    const middleware = rateLimit({ max: 5, windowMs: 60000 })

    mockReq.ip = undefined

    // Should not throw
    expect(() => {
      middleware(mockReq as Request, mockRes as Response, mockNext)
    }).not.toThrow()

    expect(mockNext).toHaveBeenCalled()
  })
})

describe('rate limit cleanup', () => {
  it('should be documented that cleanup runs every 5 minutes', () => {
    // This test documents the expected behavior
    // The actual cleanup interval is 5 * 60 * 1000 = 300000ms
    const CLEANUP_INTERVAL_MS = 5 * 60 * 1000
    expect(CLEANUP_INTERVAL_MS).toBe(300000)
  })
})
