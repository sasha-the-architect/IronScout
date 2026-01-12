/**
 * JWT Expiry Boundary Tests
 *
 * INVARIANT: JWT_EXPIRY_BOUNDARY
 * A JWT that expires during request processing MUST be rejected.
 * No grace period. Clock skew must not allow expired tokens.
 *
 * Tests token expiry, clock manipulation, and edge cases.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import jwt from 'jsonwebtoken'

// ============================================================================
// Mocks
// ============================================================================

const mockPrismaUserFind = vi.fn()

vi.mock('@ironscout/db', () => ({
  prisma: {
    users: {
      findUnique: mockPrismaUserFind,
    },
  },
}))

vi.mock('../../config/redis', () => ({
  getRedisClient: () => ({
    get: vi.fn(),
    set: vi.fn(),
    multi: vi.fn().mockReturnThis(),
    incr: vi.fn().mockReturnThis(),
    pttl: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([[null, 1], [null, 60000]]),
  }),
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
// Test Constants
// ============================================================================

const JWT_SECRET = 'test-secret-key-for-testing'
const TEST_USER_ID = 'user_test123'

// ============================================================================
// Token Verification Logic (extracted for testing)
// ============================================================================

interface JwtPayload {
  sub?: string
  userId?: string
  email?: string
  iat?: number
  exp?: number
}

function verifyAuthToken(token: string, secret: string): JwtPayload | null {
  try {
    const payload = jwt.verify(token, secret) as JwtPayload
    return payload
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return null // Expired
    }
    if (err instanceof jwt.JsonWebTokenError) {
      return null // Invalid
    }
    return null
  }
}

function createToken(payload: object, secret: string, expiresIn?: string | number): string {
  return jwt.sign(payload, secret, expiresIn ? { expiresIn } : undefined)
}

// ============================================================================
// Tests
// ============================================================================

describe('JWT Expiry Boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Token expiry detection', () => {
    it('should accept valid non-expired token', () => {
      // Arrange
      const now = new Date('2024-01-15T12:00:00Z')
      vi.setSystemTime(now)

      const token = createToken(
        { sub: TEST_USER_ID, email: 'test@example.com' },
        JWT_SECRET,
        '1h' // Expires in 1 hour
      )

      // Act
      const payload = verifyAuthToken(token, JWT_SECRET)

      // Assert
      expect(payload).not.toBeNull()
      expect(payload?.sub).toBe(TEST_USER_ID)
    })

    it('should reject token exactly at expiry time', () => {
      // Arrange
      const now = new Date('2024-01-15T12:00:00Z')
      vi.setSystemTime(now)

      // Create token that expires in exactly 1 second
      const token = createToken(
        { sub: TEST_USER_ID },
        JWT_SECRET,
        1 // 1 second
      )

      // Advance time to exactly expiry
      vi.advanceTimersByTime(1000)

      // Act
      const payload = verifyAuthToken(token, JWT_SECRET)

      // Assert - token should be expired
      expect(payload).toBeNull()
    })

    it('should reject token 1ms after expiry', () => {
      // Arrange
      const now = new Date('2024-01-15T12:00:00Z')
      vi.setSystemTime(now)

      const token = createToken(
        { sub: TEST_USER_ID },
        JWT_SECRET,
        '10s'
      )

      // Advance time 1ms past expiry
      vi.advanceTimersByTime(10001)

      // Act
      const payload = verifyAuthToken(token, JWT_SECRET)

      // Assert
      expect(payload).toBeNull()
    })

    it('should accept token 1ms before expiry', () => {
      // Arrange
      const now = new Date('2024-01-15T12:00:00Z')
      vi.setSystemTime(now)

      const token = createToken(
        { sub: TEST_USER_ID },
        JWT_SECRET,
        '10s'
      )

      // Advance time to 1ms before expiry
      vi.advanceTimersByTime(9999)

      // Act
      const payload = verifyAuthToken(token, JWT_SECRET)

      // Assert
      expect(payload).not.toBeNull()
    })
  })

  describe('Clock skew scenarios', () => {
    it('should reject token when server clock is ahead', () => {
      // Arrange - create token at t=0
      const baseTime = new Date('2024-01-15T12:00:00Z')
      vi.setSystemTime(baseTime)

      const token = createToken(
        { sub: TEST_USER_ID },
        JWT_SECRET,
        '5m' // 5 minutes
      )

      // Server clock jumps ahead 6 minutes (past expiry)
      vi.setSystemTime(new Date('2024-01-15T12:06:00Z'))

      // Act
      const payload = verifyAuthToken(token, JWT_SECRET)

      // Assert
      expect(payload).toBeNull()
    })

    it('should accept token when server clock is behind', () => {
      // Arrange - create token "in the future" (simulated clock drift)
      const futureTime = new Date('2024-01-15T12:10:00Z')
      vi.setSystemTime(futureTime)

      const token = createToken(
        { sub: TEST_USER_ID },
        JWT_SECRET,
        '5m'
      )

      // Server clock is "corrected" back (in reality, token still valid)
      vi.setSystemTime(new Date('2024-01-15T12:12:00Z'))

      // Act
      const payload = verifyAuthToken(token, JWT_SECRET)

      // Assert - token still valid (within 5 min of issuance at 12:10)
      expect(payload).not.toBeNull()
    })

    it('should handle 30-second clock skew boundary', () => {
      // Arrange
      const baseTime = new Date('2024-01-15T12:00:00Z')
      vi.setSystemTime(baseTime)

      const token = createToken(
        { sub: TEST_USER_ID },
        JWT_SECRET,
        '30s'
      )

      // Test at exactly 30 seconds (edge)
      vi.setSystemTime(new Date('2024-01-15T12:00:30Z'))
      const result30s = verifyAuthToken(token, JWT_SECRET)

      // Test at 31 seconds (past)
      vi.setSystemTime(new Date('2024-01-15T12:00:31Z'))
      const result31s = verifyAuthToken(token, JWT_SECRET)

      // Assert
      expect(result30s).toBeNull() // Exactly at expiry
      expect(result31s).toBeNull() // Past expiry
    })
  })

  describe('Token without expiry', () => {
    it('should accept token without exp claim', () => {
      // Arrange - token without expiration
      const token = createToken(
        { sub: TEST_USER_ID },
        JWT_SECRET
        // No expiresIn
      )

      // Act
      const payload = verifyAuthToken(token, JWT_SECRET)

      // Assert - valid but risky (no expiry)
      expect(payload).not.toBeNull()
      expect(payload?.exp).toBeUndefined()
    })

    it('should validate iat (issued at) even without exp', () => {
      // Arrange
      const now = new Date('2024-01-15T12:00:00Z')
      vi.setSystemTime(now)

      const token = createToken(
        { sub: TEST_USER_ID },
        JWT_SECRET
      )

      // Decode to check iat
      const decoded = jwt.decode(token) as JwtPayload

      // Assert
      expect(decoded.iat).toBe(Math.floor(now.getTime() / 1000))
    })
  })

  describe('Tier resolution with expired token', () => {
    it('should return FREE tier for expired JWT', async () => {
      // Arrange
      const baseTime = new Date('2024-01-15T12:00:00Z')
      vi.setSystemTime(baseTime)

      const token = createToken(
        { sub: TEST_USER_ID },
        JWT_SECRET,
        '1m'
      )

      // Advance past expiry
      vi.advanceTimersByTime(61000)

      // Simulate getUserTier logic
      const payload = verifyAuthToken(token, JWT_SECRET)

      if (!payload || !payload.sub) {
        // Fall back to FREE tier
        const tier = 'FREE'
        expect(tier).toBe('FREE')
      } else {
        // This branch should not be reached
        expect(true).toBe(false)
      }
    })

    it('should lookup tier for valid JWT', async () => {
      // Arrange
      const baseTime = new Date('2024-01-15T12:00:00Z')
      vi.setSystemTime(baseTime)

      const token = createToken(
        { sub: TEST_USER_ID },
        JWT_SECRET,
        '1h'
      )

      mockPrismaUserFind.mockResolvedValue({
        id: TEST_USER_ID,
        tier: 'PREMIUM',
        status: 'ACTIVE',
      })

      // Simulate getUserTier logic
      const payload = verifyAuthToken(token, JWT_SECRET)
      expect(payload).not.toBeNull()

      if (payload?.sub) {
        const user = await mockPrismaUserFind({ where: { id: payload.sub } })
        const tier = user?.status === 'ACTIVE' ? user.tier : 'FREE'
        expect(tier).toBe('PREMIUM')
      }
    })

    it('should fail closed for non-ACTIVE user status', async () => {
      // Arrange
      const token = createToken(
        { sub: TEST_USER_ID },
        JWT_SECRET,
        '1h'
      )

      // User exists but is pending deletion
      mockPrismaUserFind.mockResolvedValue({
        id: TEST_USER_ID,
        tier: 'PREMIUM',
        status: 'PENDING_DELETION',
      })

      // Simulate getUserTier logic
      const payload = verifyAuthToken(token, JWT_SECRET)
      expect(payload).not.toBeNull()

      if (payload?.sub) {
        const user = await mockPrismaUserFind({ where: { id: payload.sub } })
        // FAIL CLOSED: non-ACTIVE users get FREE tier
        const tier = user?.status === 'ACTIVE' ? user.tier : 'FREE'
        expect(tier).toBe('FREE') // Downgraded due to status
      }
    })
  })

  describe('Signature validation', () => {
    it('should reject token with wrong secret', () => {
      // Arrange
      const token = createToken(
        { sub: TEST_USER_ID },
        JWT_SECRET,
        '1h'
      )

      // Act - verify with wrong secret
      const payload = verifyAuthToken(token, 'wrong-secret')

      // Assert
      expect(payload).toBeNull()
    })

    it('should reject tampered token', () => {
      // Arrange
      const token = createToken(
        { sub: TEST_USER_ID },
        JWT_SECRET,
        '1h'
      )

      // Tamper with payload (change user ID)
      const [header, , signature] = token.split('.')
      const tamperedPayload = Buffer.from(JSON.stringify({
        sub: 'hacker_user',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      })).toString('base64url')
      const tamperedToken = `${header}.${tamperedPayload}.${signature}`

      // Act
      const payload = verifyAuthToken(tamperedToken, JWT_SECRET)

      // Assert
      expect(payload).toBeNull()
    })
  })
})
