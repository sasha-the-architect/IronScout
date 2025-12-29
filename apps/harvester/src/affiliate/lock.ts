/**
 * PostgreSQL Advisory Lock Management for Affiliate Feeds
 *
 * Uses pg_try_advisory_lock() for non-blocking feed-level mutual exclusion.
 * Each feed has a unique feedLockId (bigint) that maps to a PostgreSQL advisory lock.
 *
 * Per spec Section 8.6: Only one run per feed can be active at a time.
 */

import { prisma } from '@ironscout/db'
import { logger } from '../config/logger'

const log = logger.affiliate

/**
 * Attempt to acquire an advisory lock for a feed.
 * Non-blocking: returns immediately with true/false.
 *
 * @param feedLockId - The unique lock ID for the feed (bigint)
 * @returns true if lock was acquired, false if already held
 */
export async function acquireAdvisoryLock(feedLockId: bigint): Promise<boolean> {
  try {
    const result = await prisma.$queryRaw<[{ acquired: boolean }]>`
      SELECT pg_try_advisory_lock(${feedLockId}::bigint) as acquired
    `
    const acquired = result[0]?.acquired ?? false

    if (acquired) {
      log.debug('Advisory lock acquired', { feedLockId: feedLockId.toString() })
    } else {
      log.debug('Advisory lock not available', { feedLockId: feedLockId.toString() })
    }

    return acquired
  } catch (error) {
    log.error('Failed to acquire advisory lock', { feedLockId: feedLockId.toString() }, error as Error)
    return false
  }
}

/**
 * Release an advisory lock for a feed.
 * Safe to call even if lock is not held (no-op).
 *
 * @param feedLockId - The unique lock ID for the feed (bigint)
 */
export async function releaseAdvisoryLock(feedLockId: bigint): Promise<void> {
  try {
    await prisma.$queryRaw`
      SELECT pg_advisory_unlock(${feedLockId}::bigint)
    `
    log.debug('Advisory lock released', { feedLockId: feedLockId.toString() })
  } catch (error) {
    // Log but don't throw - lock release failure is not critical
    // (locks are automatically released when connection closes)
    log.warn('Failed to release advisory lock', { feedLockId: feedLockId.toString() }, error as Error)
  }
}

/**
 * Check if an advisory lock is currently held (for diagnostics).
 * Note: This is a point-in-time check and may be stale.
 *
 * @param feedLockId - The unique lock ID for the feed (bigint)
 * @returns true if lock is currently held by any session
 */
export async function isLockHeld(feedLockId: bigint): Promise<boolean> {
  try {
    const result = await prisma.$queryRaw<[{ held: boolean }]>`
      SELECT EXISTS(
        SELECT 1 FROM pg_locks
        WHERE locktype = 'advisory'
        AND objid = ${feedLockId}::bigint
      ) as held
    `
    return result[0]?.held ?? false
  } catch (error) {
    log.error('Failed to check advisory lock status', { feedLockId: feedLockId.toString() }, error as Error)
    return false
  }
}

/**
 * Execute a function while holding an advisory lock.
 * Ensures lock is released even if the function throws.
 *
 * @param feedLockId - The unique lock ID for the feed
 * @param fn - Function to execute while holding the lock
 * @returns Result of the function, or null if lock could not be acquired
 */
export async function withAdvisoryLock<T>(
  feedLockId: bigint,
  fn: () => Promise<T>
): Promise<{ success: true; result: T } | { success: false; reason: 'LOCK_NOT_AVAILABLE' }> {
  const acquired = await acquireAdvisoryLock(feedLockId)

  if (!acquired) {
    return { success: false, reason: 'LOCK_NOT_AVAILABLE' }
  }

  try {
    const result = await fn()
    return { success: true, result }
  } finally {
    await releaseAdvisoryLock(feedLockId)
  }
}
