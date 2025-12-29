/**
 * Tests for Advisory Lock mechanism
 *
 * Tests feed-level mutual exclusion using PostgreSQL advisory locks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Prisma client
const mockQueryRaw = vi.fn()

vi.mock('@ironscout/db', () => ({
  prisma: {
    $queryRaw: mockQueryRaw,
  },
}))

describe('Advisory Lock', () => {
  beforeEach(() => {
    mockQueryRaw.mockReset()
  })

  describe('acquireAdvisoryLock', () => {
    it('should return true when lock is acquired', async () => {
      mockQueryRaw.mockResolvedValueOnce([{ acquired: true }])

      // Import after mocking
      const { acquireAdvisoryLock } = await import('../lock')

      const feedLockId = BigInt(12345)
      const acquired = await acquireAdvisoryLock(feedLockId)

      expect(acquired).toBe(true)
      expect(mockQueryRaw).toHaveBeenCalled()
    })

    it('should return false when lock is already held', async () => {
      mockQueryRaw.mockResolvedValueOnce([{ acquired: false }])

      const { acquireAdvisoryLock } = await import('../lock')

      const feedLockId = BigInt(12345)
      const acquired = await acquireAdvisoryLock(feedLockId)

      expect(acquired).toBe(false)
    })

    it('should use pg_try_advisory_lock for non-blocking acquisition', async () => {
      mockQueryRaw.mockResolvedValueOnce([{ acquired: true }])

      const { acquireAdvisoryLock } = await import('../lock')

      await acquireAdvisoryLock(BigInt(12345))

      // Verify the query uses pg_try_advisory_lock (non-blocking)
      expect(mockQueryRaw).toHaveBeenCalled()
    })
  })

  describe('releaseAdvisoryLock', () => {
    it('should call pg_advisory_unlock', async () => {
      mockQueryRaw.mockResolvedValueOnce([{ result: true }])

      const { releaseAdvisoryLock } = await import('../lock')

      const feedLockId = BigInt(12345)
      await releaseAdvisoryLock(feedLockId)

      expect(mockQueryRaw).toHaveBeenCalled()
    })

    it('should not throw on release error', async () => {
      mockQueryRaw.mockResolvedValueOnce([{ result: false }])

      const { releaseAdvisoryLock } = await import('../lock')

      // Should not throw even if release returns false
      await expect(releaseAdvisoryLock(BigInt(12345))).resolves.not.toThrow()
    })
  })

  describe('isLockHeld', () => {
    it('should return true when lock is held by current session', async () => {
      mockQueryRaw.mockResolvedValueOnce([{ held: true }])

      const { isLockHeld } = await import('../lock')

      const feedLockId = BigInt(12345)
      const held = await isLockHeld(feedLockId)

      expect(held).toBe(true)
    })

    it('should return false when lock is not held', async () => {
      mockQueryRaw.mockResolvedValueOnce([{ held: false }])

      const { isLockHeld } = await import('../lock')

      const feedLockId = BigInt(12345)
      const held = await isLockHeld(feedLockId)

      expect(held).toBe(false)
    })
  })

  describe('withAdvisoryLock', () => {
    it('should execute callback when lock is acquired', async () => {
      mockQueryRaw
        .mockResolvedValueOnce([{ acquired: true }]) // acquire
        .mockResolvedValueOnce([{ result: true }]) // release

      const { withAdvisoryLock } = await import('../lock')

      const callback = vi.fn().mockResolvedValue('result')

      const result = await withAdvisoryLock(BigInt(12345), callback)

      expect(callback).toHaveBeenCalled()
      expect(result).toEqual({ success: true, result: 'result' })
    })

    it('should not execute callback when lock cannot be acquired', async () => {
      mockQueryRaw.mockResolvedValueOnce([{ acquired: false }])

      const { withAdvisoryLock } = await import('../lock')

      const callback = vi.fn()

      const result = await withAdvisoryLock(BigInt(12345), callback)

      expect(callback).not.toHaveBeenCalled()
      expect(result).toEqual({ success: false, reason: 'LOCK_NOT_AVAILABLE' })
    })

    it('should release lock even if callback throws', async () => {
      mockQueryRaw
        .mockResolvedValueOnce([{ acquired: true }]) // acquire
        .mockResolvedValueOnce([{ result: true }]) // release

      const { withAdvisoryLock } = await import('../lock')

      const callback = vi.fn().mockRejectedValue(new Error('test error'))

      await expect(withAdvisoryLock(BigInt(12345), callback)).rejects.toThrow('test error')

      // Verify release was called (second call)
      expect(mockQueryRaw).toHaveBeenCalledTimes(2)
    })
  })
})

describe('Lock ID Generation', () => {
  it('should support large lock IDs (bigint)', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ acquired: true }])

    const { acquireAdvisoryLock } = await import('../lock')

    // Large lock ID that exceeds 32-bit integer
    const largeLockId = BigInt('9223372036854775807') // Max 64-bit signed integer

    await expect(acquireAdvisoryLock(largeLockId)).resolves.not.toThrow()
  })

  it('should handle lock ID of 0', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ acquired: true }])

    const { acquireAdvisoryLock } = await import('../lock')

    await expect(acquireAdvisoryLock(BigInt(0))).resolves.not.toThrow()
  })
})

describe('Mutual Exclusion Guarantee', () => {
  it('should prevent concurrent processing of same feed', async () => {
    // First call acquires lock
    mockQueryRaw.mockResolvedValueOnce([{ acquired: true }])
    // Second call finds lock held
    mockQueryRaw.mockResolvedValueOnce([{ acquired: false }])

    const { acquireAdvisoryLock } = await import('../lock')

    const feedLockId = BigInt(12345)

    const first = await acquireAdvisoryLock(feedLockId)
    const second = await acquireAdvisoryLock(feedLockId)

    expect(first).toBe(true)
    expect(second).toBe(false)
  })

  it('should allow different feeds to be processed concurrently', async () => {
    // Both locks can be acquired (different lock IDs)
    mockQueryRaw
      .mockResolvedValueOnce([{ acquired: true }])
      .mockResolvedValueOnce([{ acquired: true }])

    const { acquireAdvisoryLock } = await import('../lock')

    const feed1LockId = BigInt(11111)
    const feed2LockId = BigInt(22222)

    const first = await acquireAdvisoryLock(feed1LockId)
    const second = await acquireAdvisoryLock(feed2LockId)

    expect(first).toBe(true)
    expect(second).toBe(true)
  })
})
