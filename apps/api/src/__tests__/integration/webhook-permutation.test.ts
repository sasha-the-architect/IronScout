/**
 * Webhook Permutation Tests
 *
 * Tests that webhook processing invariants hold across all possible
 * orderings of events, using fixed-seed permutation generation.
 *
 * This is a property-based testing approach to catch ordering bugs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// Deterministic Permutation Generator
// ============================================================================

/**
 * Generate all permutations of an array (factorial complexity).
 * For n > 7 or so, consider sampling instead.
 */
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

/**
 * Seeded random number generator for reproducible tests.
 * Uses mulberry32 algorithm.
 */
function createSeededRandom(seed: number) {
  let t = seed
  return () => {
    t = (t + 0x6d2b79f5) | 0
    let r = t
    r = Math.imul(r ^ (r >>> 15), r | 1)
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Shuffle array with seeded random.
 */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const random = createSeededRandom(seed)
  const result = [...arr]

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }

  return result
}

/**
 * Sample K random permutations using seeded random.
 */
function samplePermutations<T>(arr: T[], k: number, seed: number): T[][] {
  const results: T[][] = []
  const random = createSeededRandom(seed)

  for (let i = 0; i < k; i++) {
    results.push(seededShuffle(arr, Math.floor(random() * 1000000)))
  }

  return results
}

// ============================================================================
// Event Processing State Machine
// ============================================================================

type EventType =
  | 'checkout.session.completed'
  | 'invoice.paid'
  | 'invoice.payment_failed'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'

type SubscriptionState = 'NONE' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED'
type TierState = 'FREE' | 'PREMIUM'

interface Event {
  type: EventType
  created: number // Unix timestamp
  id: string
}

interface ProcessingState {
  subscriptionState: SubscriptionState
  tierState: TierState
  lastProcessedCreated: number
  auditLog: string[]
  emailsSent: string[]
}

function createInitialState(): ProcessingState {
  return {
    subscriptionState: 'NONE',
    tierState: 'FREE',
    lastProcessedCreated: 0,
    auditLog: [],
    emailsSent: [],
  }
}

function processEvent(state: ProcessingState, event: Event): ProcessingState {
  // Ordering protection: ignore events older than last processed
  if (event.created < state.lastProcessedCreated) {
    return {
      ...state,
      auditLog: [...state.auditLog, `IGNORED:${event.type}:${event.id} (out-of-order)`],
    }
  }

  const newState = { ...state }
  newState.lastProcessedCreated = event.created
  newState.auditLog = [...state.auditLog, `PROCESSED:${event.type}:${event.id}`]

  switch (event.type) {
    case 'checkout.session.completed':
      if (newState.subscriptionState !== 'CANCELLED') {
        newState.subscriptionState = 'ACTIVE'
        newState.tierState = 'PREMIUM'
        newState.emailsSent = [...state.emailsSent, 'WELCOME_EMAIL']
      }
      break

    case 'invoice.paid':
      if (newState.subscriptionState !== 'CANCELLED') {
        // Can re-activate from PAST_DUE
        if (newState.subscriptionState === 'PAST_DUE') {
          newState.emailsSent = [...state.emailsSent, 'PAYMENT_RECOVERED']
        }
        newState.subscriptionState = 'ACTIVE'
        newState.tierState = 'PREMIUM'
      }
      break

    case 'invoice.payment_failed':
      if (newState.subscriptionState === 'ACTIVE') {
        newState.subscriptionState = 'PAST_DUE'
        // Tier remains PREMIUM during grace period
        newState.emailsSent = [...state.emailsSent, 'PAYMENT_FAILED']
      }
      break

    case 'customer.subscription.updated':
      // Status depends on payload, simplified here
      break

    case 'customer.subscription.deleted':
      // Terminal state
      newState.subscriptionState = 'CANCELLED'
      newState.tierState = 'FREE'
      newState.emailsSent = [...state.emailsSent, 'SUBSCRIPTION_CANCELLED']
      break
  }

  return newState
}

function processEventSequence(events: Event[]): ProcessingState {
  return events.reduce(processEvent, createInitialState())
}

// ============================================================================
// Invariant Checkers
// ============================================================================

interface InvariantResult {
  passed: boolean
  violations: string[]
}

function checkInvariants(
  events: Event[],
  finalState: ProcessingState,
  permutationId: string
): InvariantResult {
  const violations: string[] = []

  // Find the "canonical" terminal event (latest created timestamp of terminal types)
  const deletedEvent = events.find((e) => e.type === 'customer.subscription.deleted')

  // Invariant 1: If deleted event exists and is latest, state must be CANCELLED
  if (deletedEvent) {
    const latestEvent = [...events].sort((a, b) => b.created - a.created)[0]
    if (deletedEvent.id === latestEvent.id && finalState.subscriptionState !== 'CANCELLED') {
      violations.push(
        `[${permutationId}] Deleted event is latest but state is ${finalState.subscriptionState}`
      )
    }
  }

  // Invariant 2: Tier must match subscription state
  if (finalState.subscriptionState === 'CANCELLED' && finalState.tierState !== 'FREE') {
    violations.push(
      `[${permutationId}] Cancelled subscription but tier is ${finalState.tierState}`
    )
  }

  // Invariant 3: No duplicate emails for same event type in sequence
  const emailCounts = new Map<string, number>()
  for (const email of finalState.emailsSent) {
    emailCounts.set(email, (emailCounts.get(email) || 0) + 1)
  }

  // Note: Some emails CAN legitimately repeat (e.g., PAYMENT_FAILED can happen multiple times)
  // But WELCOME_EMAIL should only be sent once
  if ((emailCounts.get('WELCOME_EMAIL') || 0) > 1) {
    violations.push(`[${permutationId}] WELCOME_EMAIL sent ${emailCounts.get('WELCOME_EMAIL')} times`)
  }

  return {
    passed: violations.length === 0,
    violations,
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('Webhook Permutation Tests', () => {
  const FIXED_SEED = 42

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Basic event sequences', () => {
    it('should handle checkout → paid → deleted in any order', () => {
      const events: Event[] = [
        { type: 'checkout.session.completed', created: 1000, id: 'evt_checkout' },
        { type: 'invoice.paid', created: 2000, id: 'evt_paid' },
        { type: 'customer.subscription.deleted', created: 3000, id: 'evt_deleted' },
      ]

      const permutations = generatePermutations(events)
      const allResults: InvariantResult[] = []

      for (let i = 0; i < permutations.length; i++) {
        const perm = permutations[i]
        const finalState = processEventSequence(perm)
        const result = checkInvariants(events, finalState, `perm-${i}`)
        allResults.push(result)
      }

      // All permutations should pass invariants
      const failures = allResults.filter((r) => !r.passed)
      expect(failures).toHaveLength(0)

      // Final state should always be CANCELLED for all permutations
      // because deleted event has latest timestamp
      for (const perm of permutations) {
        const finalState = processEventSequence(perm)
        expect(finalState.subscriptionState).toBe('CANCELLED')
        expect(finalState.tierState).toBe('FREE')
      }
    })

    it('should correctly handle deleted arriving before paid', () => {
      const events: Event[] = [
        { type: 'checkout.session.completed', created: 1000, id: 'evt_checkout' },
        { type: 'invoice.paid', created: 2000, id: 'evt_paid' },
        { type: 'customer.subscription.deleted', created: 3000, id: 'evt_deleted' },
      ]

      // Arrival order: deleted, paid, checkout (reversed)
      const arrivalOrder = [events[2], events[1], events[0]]

      const finalState = processEventSequence(arrivalOrder)

      // Deleted processed first (created: 3000)
      // Paid ignored (created: 2000 < 3000)
      // Checkout ignored (created: 1000 < 3000)
      expect(finalState.subscriptionState).toBe('CANCELLED')
      expect(finalState.tierState).toBe('FREE')

      // Audit log should show ignored events
      expect(finalState.auditLog.some((l) => l.includes('IGNORED'))).toBe(true)
    })
  })

  describe('Sampled permutation testing', () => {
    it('should maintain invariants across 100 random permutations', () => {
      const events: Event[] = [
        { type: 'checkout.session.completed', created: 1000, id: 'evt_1' },
        { type: 'invoice.paid', created: 2000, id: 'evt_2' },
        { type: 'invoice.payment_failed', created: 2500, id: 'evt_3' },
        { type: 'invoice.paid', created: 3000, id: 'evt_4' },
        { type: 'customer.subscription.deleted', created: 4000, id: 'evt_5' },
      ]

      // 5! = 120 permutations, sample 100
      const permutations = samplePermutations(events, 100, FIXED_SEED)
      const violations: string[] = []

      for (let i = 0; i < permutations.length; i++) {
        const perm = permutations[i]
        const finalState = processEventSequence(perm)
        const result = checkInvariants(events, finalState, `sample-${i}`)

        if (!result.passed) {
          violations.push(...result.violations)
        }
      }

      expect(violations).toHaveLength(0)
    })

    it('should handle duplicate events in permutations', () => {
      // Same event ID appearing twice (idempotency test)
      const events: Event[] = [
        { type: 'checkout.session.completed', created: 1000, id: 'evt_checkout' },
        { type: 'invoice.paid', created: 2000, id: 'evt_paid' },
        { type: 'invoice.paid', created: 2000, id: 'evt_paid' }, // Duplicate
        { type: 'customer.subscription.deleted', created: 3000, id: 'evt_deleted' },
      ]

      const permutations = samplePermutations(events, 50, FIXED_SEED)

      for (const perm of permutations) {
        const finalState = processEventSequence(perm)

        // Should still end up CANCELLED
        expect(finalState.subscriptionState).toBe('CANCELLED')

        // Duplicate processing shouldn't cause issues
        expect(finalState.tierState).toBe('FREE')
      }
    })
  })

  describe('Race condition scenarios', () => {
    it('should handle near-simultaneous deleted and paid events', () => {
      // Same timestamp - current implementation uses >= for ordering protection
      // This means second event with same timestamp IS processed
      const events: Event[] = [
        { type: 'customer.subscription.deleted', created: 2000, id: 'evt_deleted' },
        { type: 'invoice.paid', created: 2000, id: 'evt_paid' }, // Same timestamp!
      ]

      // Test both orderings
      const order1 = [events[0], events[1]] // deleted first
      const order2 = [events[1], events[0]] // paid first

      const state1 = processEventSequence(order1)
      const state2 = processEventSequence(order2)

      // With same timestamp, both events are processed (created >= lastProcessed)
      // The final state depends on which event type has terminal semantics
      // deleted is terminal, so if processed last, it wins
      // paid cannot reactivate cancelled, so deleted always wins if processed
      expect(state1.subscriptionState).toBe('CANCELLED') // deleted then paid (paid can't undo deleted)
      expect(state2.subscriptionState).toBe('CANCELLED') // paid then deleted (deleted is terminal)
    })

    it('should consistently handle rapid event bursts', () => {
      // All events within same second
      const baseTime = 1000
      const events: Event[] = [
        { type: 'checkout.session.completed', created: baseTime, id: 'evt_1' },
        { type: 'invoice.paid', created: baseTime + 1, id: 'evt_2' },
        { type: 'invoice.payment_failed', created: baseTime + 2, id: 'evt_3' },
        { type: 'customer.subscription.deleted', created: baseTime + 3, id: 'evt_4' },
      ]

      // Run 50 random orderings
      const permutations = samplePermutations(events, 50, FIXED_SEED)
      const finalStates = permutations.map((p) => processEventSequence(p))

      // Deleted has highest timestamp, should always win
      for (const state of finalStates) {
        expect(state.subscriptionState).toBe('CANCELLED')
        expect(state.tierState).toBe('FREE')
      }
    })
  })

  describe('Edge cases', () => {
    it('should handle single event', () => {
      const events: Event[] = [
        { type: 'checkout.session.completed', created: 1000, id: 'evt_checkout' },
      ]

      const finalState = processEventSequence(events)

      expect(finalState.subscriptionState).toBe('ACTIVE')
      expect(finalState.tierState).toBe('PREMIUM')
    })

    it('should handle empty event sequence', () => {
      const finalState = processEventSequence([])

      expect(finalState.subscriptionState).toBe('NONE')
      expect(finalState.tierState).toBe('FREE')
    })

    it('should handle only deleted event (no prior subscription)', () => {
      const events: Event[] = [
        { type: 'customer.subscription.deleted', created: 1000, id: 'evt_deleted' },
      ]

      const finalState = processEventSequence(events)

      // Deleted without prior subscription is still valid (webhook for external action)
      expect(finalState.subscriptionState).toBe('CANCELLED')
      expect(finalState.tierState).toBe('FREE')
    })
  })
})

describe('Permutation Test Utilities', () => {
  it('should generate correct number of permutations', () => {
    expect(generatePermutations([1, 2, 3]).length).toBe(6) // 3!
    expect(generatePermutations([1, 2, 3, 4]).length).toBe(24) // 4!
    expect(generatePermutations([1, 2, 3, 4, 5]).length).toBe(120) // 5!
  })

  it('should generate reproducible shuffles with same seed', () => {
    const arr = [1, 2, 3, 4, 5]

    const shuffle1 = seededShuffle(arr, 42)
    const shuffle2 = seededShuffle(arr, 42)

    expect(shuffle1).toEqual(shuffle2)
  })

  it('should generate different shuffles with different seeds', () => {
    const arr = [1, 2, 3, 4, 5]

    const shuffle1 = seededShuffle(arr, 42)
    const shuffle2 = seededShuffle(arr, 43)

    expect(shuffle1).not.toEqual(shuffle2)
  })
})
