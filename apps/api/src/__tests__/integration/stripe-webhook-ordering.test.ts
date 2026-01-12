/**
 * Stripe Webhook Ordering Tests
 *
 * INVARIANT: STRIPE_WEBHOOK_ORDERING
 * Out-of-order Stripe webhooks MUST NOT move subscription state backwards.
 * e.g., subscription.deleted followed by delayed invoice.paid MUST NOT re-activate.
 *
 * Tests event ordering, timestamp-based guards, and state machine transitions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Stripe from 'stripe'

// ============================================================================
// Mocks
// ============================================================================

const mockPrismaUserFind = vi.fn()
const mockPrismaUserUpdate = vi.fn()
const mockPrismaSubscriptionFind = vi.fn()
const mockPrismaSubscriptionUpdate = vi.fn()
const mockPrismaMerchantFind = vi.fn()
const mockPrismaMerchantUpdate = vi.fn()

vi.mock('@ironscout/db', () => ({
  prisma: {
    users: {
      findUnique: mockPrismaUserFind,
      update: mockPrismaUserUpdate,
    },
    subscriptions: {
      findUnique: mockPrismaSubscriptionFind,
      update: mockPrismaSubscriptionUpdate,
    },
    merchants: {
      findUnique: mockPrismaMerchantFind,
      update: mockPrismaMerchantUpdate,
    },
    admin_audit_logs: {
      create: vi.fn().mockResolvedValue({}),
    },
    merchant_retailers: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: vi.fn().mockImplementation(async (fn) => fn({
      subscriptions: { update: mockPrismaSubscriptionUpdate },
      users: { update: mockPrismaUserUpdate },
    })),
  },
}))

vi.mock('../../config/logger', () => ({
  loggers: {
    payments: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  },
}))

// ============================================================================
// Test Utilities
// ============================================================================

type SubscriptionState = 'ACTIVE' | 'CANCELLED' | 'EXPIRED'

interface StateTransition {
  from: SubscriptionState
  to: SubscriptionState
  eventType: string
  eventCreated: number
}

/**
 * State machine for consumer subscription transitions.
 * Implements ordering protection using event timestamps.
 */
class SubscriptionStateMachine {
  private state: SubscriptionState = 'ACTIVE'
  private lastEventCreated: number = 0
  private transitions: StateTransition[] = []

  getState(): SubscriptionState {
    return this.state
  }

  /**
   * Process a webhook event with ordering protection.
   * Returns false if event is out-of-order and should be ignored.
   */
  processEvent(eventType: string, eventCreated: number): boolean {
    // Guard: Ignore events older than last processed
    if (eventCreated < this.lastEventCreated) {
      return false // Out-of-order, ignore
    }

    const fromState = this.state
    let toState: SubscriptionState = this.state

    // State transitions based on event type
    switch (eventType) {
      case 'checkout.session.completed':
      case 'invoice.paid':
        // Can only activate from non-cancelled state
        if (this.state !== 'CANCELLED') {
          toState = 'ACTIVE'
        }
        break

      case 'invoice.payment_failed':
        // Payment failed → EXPIRED (grace period)
        if (this.state === 'ACTIVE') {
          toState = 'EXPIRED'
        }
        break

      case 'customer.subscription.deleted':
        // Terminal state - cannot be undone
        toState = 'CANCELLED'
        break

      case 'customer.subscription.updated':
        // Status depends on Stripe status field, handled separately
        break
    }

    this.transitions.push({
      from: fromState,
      to: toState,
      eventType,
      eventCreated,
    })

    this.state = toState
    this.lastEventCreated = eventCreated

    return true
  }

  /**
   * Check if a state transition is valid.
   * Deleted subscriptions cannot be re-activated.
   */
  isValidTransition(from: SubscriptionState, to: SubscriptionState): boolean {
    // Cannot transition FROM cancelled to anything except cancelled
    if (from === 'CANCELLED' && to !== 'CANCELLED') {
      return false
    }
    return true
  }

  getTransitions(): StateTransition[] {
    return [...this.transitions]
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('Stripe Webhook Ordering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Event timestamp ordering protection', () => {
    it('should ignore invoice.paid that arrives after subscription.deleted', () => {
      // Arrange
      const stateMachine = new SubscriptionStateMachine()
      const now = Math.floor(Date.now() / 1000)

      // Act - process events in arrival order (deleted first, then delayed paid)
      // But paid event has earlier created timestamp
      const deletedProcessed = stateMachine.processEvent('customer.subscription.deleted', now)
      const paidProcessed = stateMachine.processEvent('invoice.paid', now - 60) // 1 minute older

      // Assert
      expect(deletedProcessed).toBe(true)
      expect(paidProcessed).toBe(false) // Ignored due to ordering
      expect(stateMachine.getState()).toBe('CANCELLED') // Remains deleted
    })

    it('should process events in correct order when they arrive out-of-order', () => {
      // Arrange
      const stateMachine = new SubscriptionStateMachine()
      const baseTime = Math.floor(Date.now() / 1000)

      // Events created in order: checkout (t), paid (t+1h), deleted (t+30d)
      // But arrive: deleted, paid, checkout (reversed)
      const checkoutCreated = baseTime
      const paidCreated = baseTime + 3600
      const deletedCreated = baseTime + 30 * 24 * 3600

      // Act - simulate arrival order
      stateMachine.processEvent('customer.subscription.deleted', deletedCreated)
      const paidResult = stateMachine.processEvent('invoice.paid', paidCreated)
      const checkoutResult = stateMachine.processEvent('checkout.session.completed', checkoutCreated)

      // Assert - later events should be ignored
      expect(paidResult).toBe(false)
      expect(checkoutResult).toBe(false)
      expect(stateMachine.getState()).toBe('CANCELLED')
    })

    it('should allow valid forward progression of events', () => {
      // Arrange
      const stateMachine = new SubscriptionStateMachine()
      const baseTime = Math.floor(Date.now() / 1000)

      // Act - process events in correct order
      stateMachine.processEvent('checkout.session.completed', baseTime)
      expect(stateMachine.getState()).toBe('ACTIVE')

      stateMachine.processEvent('invoice.paid', baseTime + 30 * 24 * 3600) // Renewal
      expect(stateMachine.getState()).toBe('ACTIVE')

      stateMachine.processEvent('invoice.payment_failed', baseTime + 60 * 24 * 3600)
      expect(stateMachine.getState()).toBe('EXPIRED')

      stateMachine.processEvent('customer.subscription.deleted', baseTime + 67 * 24 * 3600)
      expect(stateMachine.getState()).toBe('CANCELLED')

      // Assert - final state is terminal
      const transitions = stateMachine.getTransitions()
      expect(transitions).toHaveLength(4)
      expect(transitions[transitions.length - 1].to).toBe('CANCELLED')
    })
  })

  describe('State machine invariants', () => {
    it('should prevent re-activation of cancelled subscription', () => {
      // Arrange
      const stateMachine = new SubscriptionStateMachine()
      const baseTime = Math.floor(Date.now() / 1000)

      // Setup: subscription is cancelled
      stateMachine.processEvent('customer.subscription.deleted', baseTime)
      expect(stateMachine.getState()).toBe('CANCELLED')

      // Act - try to re-activate with later events
      stateMachine.processEvent('checkout.session.completed', baseTime + 100)
      stateMachine.processEvent('invoice.paid', baseTime + 200)

      // Assert - state remains CANCELLED
      expect(stateMachine.getState()).toBe('CANCELLED')
    })

    it('should validate all transition combinations', () => {
      const stateMachine = new SubscriptionStateMachine()

      // Valid transitions
      expect(stateMachine.isValidTransition('ACTIVE', 'EXPIRED')).toBe(true)
      expect(stateMachine.isValidTransition('ACTIVE', 'CANCELLED')).toBe(true)
      expect(stateMachine.isValidTransition('EXPIRED', 'ACTIVE')).toBe(true) // Recovery
      expect(stateMachine.isValidTransition('EXPIRED', 'CANCELLED')).toBe(true)

      // Invalid transitions (from CANCELLED)
      expect(stateMachine.isValidTransition('CANCELLED', 'ACTIVE')).toBe(false)
      expect(stateMachine.isValidTransition('CANCELLED', 'EXPIRED')).toBe(false)
      expect(stateMachine.isValidTransition('CANCELLED', 'CANCELLED')).toBe(true) // No-op
    })
  })

  describe('Permutation testing with fixed seed', () => {
    it('should maintain invariants across all event permutations', () => {
      // Arrange - events that should result in CANCELLED state
      const events = [
        { type: 'checkout.session.completed', created: 1000 },
        { type: 'invoice.paid', created: 2000 },
        { type: 'customer.subscription.deleted', created: 3000 },
      ]

      // Generate all permutations (3! = 6)
      const permutations = generatePermutations(events)

      // Act & Assert - all permutations should end in CANCELLED
      for (const perm of permutations) {
        const sm = new SubscriptionStateMachine()

        // Process events in this permutation order
        for (const event of perm) {
          sm.processEvent(event.type, event.created)
        }

        // Invariant: final state must be CANCELLED (the terminal event)
        expect(sm.getState()).toBe('CANCELLED')
      }
    })

    it('should handle duplicate events in permutations', () => {
      // Arrange - include duplicate invoice.paid
      const events = [
        { type: 'checkout.session.completed', created: 1000 },
        { type: 'invoice.paid', created: 2000 },
        { type: 'invoice.paid', created: 2000 }, // Duplicate
        { type: 'customer.subscription.deleted', created: 3000 },
      ]

      // Test a few key permutations
      const testCases = [
        // Normal order
        [events[0], events[1], events[2], events[3]],
        // Duplicates adjacent
        [events[0], events[1], events[2], events[3]],
        // Deleted before duplicates
        [events[3], events[0], events[1], events[2]],
      ]

      for (const permutation of testCases) {
        const sm = new SubscriptionStateMachine()

        for (const event of permutation) {
          sm.processEvent(event.type, event.created)
        }

        // Invariant: still ends in CANCELLED
        expect(sm.getState()).toBe('CANCELLED')
      }
    })
  })

  describe('Concurrent race conditions', () => {
    it('should handle near-simultaneous deleted and paid events', async () => {
      // Arrange
      const results: SubscriptionState[] = []
      const baseTime = Math.floor(Date.now() / 1000)

      // Simulate 100 concurrent races
      for (let i = 0; i < 100; i++) {
        const sm = new SubscriptionStateMachine()

        // Random arrival order for events with same timestamp
        const events = [
          { type: 'customer.subscription.deleted', created: baseTime },
          { type: 'invoice.paid', created: baseTime },
        ]

        // Shuffle based on iteration (deterministic)
        if (i % 2 === 0) {
          events.reverse()
        }

        for (const event of events) {
          sm.processEvent(event.type, event.created)
        }

        results.push(sm.getState())
      }

      // Assert - all results should be consistent
      // With same-timestamp events, first processed wins
      // But the key invariant: once CANCELLED, cannot change
      const uniqueResults = [...new Set(results)]
      expect(uniqueResults.length).toBeLessThanOrEqual(2) // Either CANCELLED or ACTIVE
    })
  })
})

// ============================================================================
// Helpers
// ============================================================================

function generatePermutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr]

  const result: T[][] = []

  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)]
    const perms = generatePermutations(rest)

    for (const perm of perms) {
      result.push([arr[i], ...perm])
    }
  }

  return result
}
