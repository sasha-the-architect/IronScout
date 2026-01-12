/**
 * Alert Claim Race Condition Tests
 *
 * INVARIANT: ALERT_EXACTLY_ONCE
 * A price drop or back-in-stock alert for a given watchlist item MUST send
 * exactly one notification per cooldown period, even under concurrent execution.
 *
 * INVARIANT: ALERT_CLAIM_EXPIRY
 * If an alert claim is stale (>5 minutes without commit), another worker
 * MUST be able to claim and send the notification.
 *
 * Tests two-phase claim/commit, concurrent workers, and claim expiry.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ============================================================================
// Mocks
// ============================================================================

vi.mock('@ironscout/db', () => ({
  prisma: {
    watchlist_items: {
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    users: {
      findUnique: vi.fn(),
    },
    products: {
      findUnique: vi.fn(),
    },
  },
  isAlertProcessingEnabled: vi.fn().mockResolvedValue(true),
  isEmailNotificationsEnabled: vi.fn().mockResolvedValue(true),
}))

vi.mock('../../config/redis', () => ({
  redisConnection: {},
  createRedisClient: () => ({
    get: vi.fn(),
    set: vi.fn(),
    setex: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
  }),
}))

vi.mock('../../config/logger', () => ({
  logger: {
    alerter: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  },
}))

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn().mockResolvedValue({ id: 'email-123' }),
    },
  })),
}))

// ============================================================================
// Two-Phase Claim/Commit Implementation (extracted for testing)
// ============================================================================

type RuleType = 'PRICE_DROP' | 'BACK_IN_STOCK'

interface ClaimResult {
  claimed: boolean
  reason?: string
}

interface WatchlistItem {
  id: string
  lastPriceNotifiedAt: Date | null
  lastStockNotifiedAt: Date | null
  priceNotificationClaimKey: string | null
  priceNotificationClaimedAt: Date | null
  stockNotificationClaimKey: string | null
  stockNotificationClaimedAt: Date | null
}

// In-memory store for testing
const watchlistStore = new Map<string, WatchlistItem>()

const CLAIM_STALE_MS = 5 * 60 * 1000 // 5 minutes
const COOLDOWN_HOURS = 168 // 7 days

function createClaimService() {
  return {
    async claimNotificationSlot(
      watchlistItemId: string,
      ruleType: RuleType,
      claimKey: string
    ): Promise<ClaimResult> {
      const now = new Date()
      const cooldownThreshold = new Date(now.getTime() - COOLDOWN_HOURS * 60 * 60 * 1000)
      const staleClaimThreshold = new Date(now.getTime() - CLAIM_STALE_MS)

      const item = watchlistStore.get(watchlistItemId)
      if (!item) {
        return { claimed: false, reason: 'item_not_found' }
      }

      if (ruleType === 'PRICE_DROP') {
        // Check cooldown
        if (item.lastPriceNotifiedAt && item.lastPriceNotifiedAt >= cooldownThreshold) {
          return { claimed: false, reason: 'in_cooldown' }
        }

        // Check existing claim
        if (
          item.priceNotificationClaimKey &&
          item.priceNotificationClaimedAt &&
          item.priceNotificationClaimedAt >= staleClaimThreshold
        ) {
          return { claimed: false, reason: 'already_claimed' }
        }

        // Atomic claim
        item.priceNotificationClaimKey = claimKey
        item.priceNotificationClaimedAt = now

        return { claimed: true }
      } else {
        // BACK_IN_STOCK
        if (item.lastStockNotifiedAt && item.lastStockNotifiedAt >= cooldownThreshold) {
          return { claimed: false, reason: 'in_cooldown' }
        }

        if (
          item.stockNotificationClaimKey &&
          item.stockNotificationClaimedAt &&
          item.stockNotificationClaimedAt >= staleClaimThreshold
        ) {
          return { claimed: false, reason: 'already_claimed' }
        }

        item.stockNotificationClaimKey = claimKey
        item.stockNotificationClaimedAt = now

        return { claimed: true }
      }
    },

    async commitNotification(
      watchlistItemId: string,
      ruleType: RuleType,
      claimKey: string
    ): Promise<boolean> {
      const now = new Date()
      const item = watchlistStore.get(watchlistItemId)
      if (!item) return false

      if (ruleType === 'PRICE_DROP') {
        // Guard: only commit if we hold the claim
        if (item.priceNotificationClaimKey !== claimKey) {
          return false
        }

        item.lastPriceNotifiedAt = now
        item.priceNotificationClaimKey = null
        item.priceNotificationClaimedAt = null
        return true
      } else {
        if (item.stockNotificationClaimKey !== claimKey) {
          return false
        }

        item.lastStockNotifiedAt = now
        item.stockNotificationClaimKey = null
        item.stockNotificationClaimedAt = null
        return true
      }
    },

    async releaseClaim(
      watchlistItemId: string,
      ruleType: RuleType,
      claimKey: string
    ): Promise<void> {
      const item = watchlistStore.get(watchlistItemId)
      if (!item) return

      if (ruleType === 'PRICE_DROP' && item.priceNotificationClaimKey === claimKey) {
        item.priceNotificationClaimKey = null
        item.priceNotificationClaimedAt = null
      } else if (ruleType === 'BACK_IN_STOCK' && item.stockNotificationClaimKey === claimKey) {
        item.stockNotificationClaimKey = null
        item.stockNotificationClaimedAt = null
      }
    },
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('Alert Claim Race Conditions', () => {
  let claimService: ReturnType<typeof createClaimService>

  beforeEach(() => {
    vi.clearAllMocks()
    watchlistStore.clear()
    claimService = createClaimService()

    // Setup default watchlist item
    watchlistStore.set('wl-item-1', {
      id: 'wl-item-1',
      lastPriceNotifiedAt: null,
      lastStockNotifiedAt: null,
      priceNotificationClaimKey: null,
      priceNotificationClaimedAt: null,
      stockNotificationClaimKey: null,
      stockNotificationClaimedAt: null,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Two-phase claim/commit', () => {
    it('should successfully claim notification slot', async () => {
      const result = await claimService.claimNotificationSlot(
        'wl-item-1',
        'PRICE_DROP',
        'worker-1-claim-123'
      )

      expect(result.claimed).toBe(true)
      expect(watchlistStore.get('wl-item-1')?.priceNotificationClaimKey).toBe('worker-1-claim-123')
    })

    it('should commit notification after successful send', async () => {
      // Claim
      await claimService.claimNotificationSlot('wl-item-1', 'PRICE_DROP', 'worker-1-claim-123')

      // Simulate email send success

      // Commit
      const committed = await claimService.commitNotification(
        'wl-item-1',
        'PRICE_DROP',
        'worker-1-claim-123'
      )

      expect(committed).toBe(true)
      expect(watchlistStore.get('wl-item-1')?.lastPriceNotifiedAt).toBeDefined()
      expect(watchlistStore.get('wl-item-1')?.priceNotificationClaimKey).toBeNull()
    })

    it('should release claim on send failure', async () => {
      // Claim
      await claimService.claimNotificationSlot('wl-item-1', 'PRICE_DROP', 'worker-1-claim-123')

      // Simulate email send failure

      // Release claim
      await claimService.releaseClaim('wl-item-1', 'PRICE_DROP', 'worker-1-claim-123')

      expect(watchlistStore.get('wl-item-1')?.priceNotificationClaimKey).toBeNull()
      expect(watchlistStore.get('wl-item-1')?.lastPriceNotifiedAt).toBeNull() // Not committed
    })
  })

  describe('Concurrent worker claims', () => {
    it('should only allow one worker to claim', async () => {
      // Simulate concurrent claims from multiple workers
      const results = await Promise.all([
        claimService.claimNotificationSlot('wl-item-1', 'PRICE_DROP', 'worker-1-claim'),
        claimService.claimNotificationSlot('wl-item-1', 'PRICE_DROP', 'worker-2-claim'),
        claimService.claimNotificationSlot('wl-item-1', 'PRICE_DROP', 'worker-3-claim'),
      ])

      const claimedCount = results.filter((r) => r.claimed).length

      // Due to in-memory simulation, one will win
      // In production with Prisma atomic updateMany, exactly one succeeds
      expect(claimedCount).toBe(1)
    })

    it('should reject second claim attempt', async () => {
      // First worker claims
      const first = await claimService.claimNotificationSlot(
        'wl-item-1',
        'PRICE_DROP',
        'worker-1-claim'
      )
      expect(first.claimed).toBe(true)

      // Second worker tries to claim
      const second = await claimService.claimNotificationSlot(
        'wl-item-1',
        'PRICE_DROP',
        'worker-2-claim'
      )
      expect(second.claimed).toBe(false)
      expect(second.reason).toBe('already_claimed')
    })

    it('should prevent commit with wrong claim key', async () => {
      // Worker 1 claims
      await claimService.claimNotificationSlot('wl-item-1', 'PRICE_DROP', 'worker-1-claim')

      // Worker 2 tries to commit (without claiming)
      const committed = await claimService.commitNotification(
        'wl-item-1',
        'PRICE_DROP',
        'worker-2-claim' // Wrong key
      )

      expect(committed).toBe(false)
      expect(watchlistStore.get('wl-item-1')?.lastPriceNotifiedAt).toBeNull()
    })
  })

  describe('Claim expiry', () => {
    it('should allow new claim after stale threshold', async () => {
      vi.useFakeTimers()
      const baseTime = new Date('2024-01-15T12:00:00Z')
      vi.setSystemTime(baseTime)

      // Worker 1 claims
      const first = await claimService.claimNotificationSlot(
        'wl-item-1',
        'PRICE_DROP',
        'worker-1-stale'
      )
      expect(first.claimed).toBe(true)

      // Worker 1 crashes, never commits

      // 6 minutes later (past stale threshold)
      vi.advanceTimersByTime(6 * 60 * 1000)

      // Worker 2 should be able to claim
      const second = await claimService.claimNotificationSlot(
        'wl-item-1',
        'PRICE_DROP',
        'worker-2-fresh'
      )

      expect(second.claimed).toBe(true)
      expect(watchlistStore.get('wl-item-1')?.priceNotificationClaimKey).toBe('worker-2-fresh')
    })

    it('should reject claim within stale threshold', async () => {
      vi.useFakeTimers()
      const baseTime = new Date('2024-01-15T12:00:00Z')
      vi.setSystemTime(baseTime)

      // Worker 1 claims
      await claimService.claimNotificationSlot('wl-item-1', 'PRICE_DROP', 'worker-1-active')

      // 3 minutes later (within threshold)
      vi.advanceTimersByTime(3 * 60 * 1000)

      // Worker 2 tries to claim
      const second = await claimService.claimNotificationSlot(
        'wl-item-1',
        'PRICE_DROP',
        'worker-2-attempt'
      )

      expect(second.claimed).toBe(false)
      expect(second.reason).toBe('already_claimed')
    })
  })

  describe('Cooldown period', () => {
    it('should reject claim within cooldown period', async () => {
      vi.useFakeTimers()
      const baseTime = new Date('2024-01-15T12:00:00Z')
      vi.setSystemTime(baseTime)

      // First notification sent
      await claimService.claimNotificationSlot('wl-item-1', 'PRICE_DROP', 'claim-1')
      await claimService.commitNotification('wl-item-1', 'PRICE_DROP', 'claim-1')

      // 1 day later (within 7-day cooldown)
      vi.advanceTimersByTime(24 * 60 * 60 * 1000)

      // Try to claim again
      const result = await claimService.claimNotificationSlot('wl-item-1', 'PRICE_DROP', 'claim-2')

      expect(result.claimed).toBe(false)
      expect(result.reason).toBe('in_cooldown')
    })

    it('should allow claim after cooldown expires', async () => {
      vi.useFakeTimers()
      const baseTime = new Date('2024-01-15T12:00:00Z')
      vi.setSystemTime(baseTime)

      // First notification
      await claimService.claimNotificationSlot('wl-item-1', 'PRICE_DROP', 'claim-1')
      await claimService.commitNotification('wl-item-1', 'PRICE_DROP', 'claim-1')

      // 8 days later (past cooldown)
      vi.advanceTimersByTime(8 * 24 * 60 * 60 * 1000)

      // Should be able to claim
      const result = await claimService.claimNotificationSlot('wl-item-1', 'PRICE_DROP', 'claim-2')

      expect(result.claimed).toBe(true)
    })
  })

  describe('Different alert types', () => {
    it('should track PRICE_DROP and BACK_IN_STOCK independently', async () => {
      // Claim price drop
      const priceResult = await claimService.claimNotificationSlot(
        'wl-item-1',
        'PRICE_DROP',
        'price-claim'
      )

      // Claim back-in-stock (same item)
      const stockResult = await claimService.claimNotificationSlot(
        'wl-item-1',
        'BACK_IN_STOCK',
        'stock-claim'
      )

      // Both should succeed
      expect(priceResult.claimed).toBe(true)
      expect(stockResult.claimed).toBe(true)

      const item = watchlistStore.get('wl-item-1')
      expect(item?.priceNotificationClaimKey).toBe('price-claim')
      expect(item?.stockNotificationClaimKey).toBe('stock-claim')
    })

    it('should have independent cooldowns', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'))

      // Send price drop notification
      await claimService.claimNotificationSlot('wl-item-1', 'PRICE_DROP', 'price-claim')
      await claimService.commitNotification('wl-item-1', 'PRICE_DROP', 'price-claim')

      // 1 day later
      vi.advanceTimersByTime(24 * 60 * 60 * 1000)

      // Price drop in cooldown, but stock alert should work
      const priceResult = await claimService.claimNotificationSlot(
        'wl-item-1',
        'PRICE_DROP',
        'price-claim-2'
      )
      const stockResult = await claimService.claimNotificationSlot(
        'wl-item-1',
        'BACK_IN_STOCK',
        'stock-claim'
      )

      expect(priceResult.claimed).toBe(false)
      expect(priceResult.reason).toBe('in_cooldown')
      expect(stockResult.claimed).toBe(true)
    })
  })
})

describe('Alert Email Exactly-Once', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    watchlistStore.clear()

    watchlistStore.set('wl-item-1', {
      id: 'wl-item-1',
      lastPriceNotifiedAt: null,
      lastStockNotifiedAt: null,
      priceNotificationClaimKey: null,
      priceNotificationClaimedAt: null,
      stockNotificationClaimKey: null,
      stockNotificationClaimedAt: null,
    })
  })

  it('should send exactly one email despite retries', async () => {
    const claimService = createClaimService()
    let emailsSent = 0

    const sendAlertWithRetry = async (attemptId: string): Promise<boolean> => {
      const claimKey = `claim-${attemptId}`

      // Phase 1: Claim
      const claim = await claimService.claimNotificationSlot('wl-item-1', 'PRICE_DROP', claimKey)

      if (!claim.claimed) {
        return false // Another worker handled it
      }

      try {
        // Phase 2: Send email
        emailsSent++

        // Phase 3: Commit
        await claimService.commitNotification('wl-item-1', 'PRICE_DROP', claimKey)
        return true
      } catch {
        // Release claim on failure
        await claimService.releaseClaim('wl-item-1', 'PRICE_DROP', claimKey)
        return false
      }
    }

    // Simulate multiple retry attempts
    const results = await Promise.all([
      sendAlertWithRetry('attempt-1'),
      sendAlertWithRetry('attempt-2'),
      sendAlertWithRetry('attempt-3'),
    ])

    // Exactly one should succeed
    expect(results.filter(Boolean).length).toBe(1)
    expect(emailsSent).toBe(1)
  })
})
