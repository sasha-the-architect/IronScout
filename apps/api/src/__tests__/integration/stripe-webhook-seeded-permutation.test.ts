import { describe, it, expect } from 'vitest'

type EventType = 'checkout.session.completed' | 'invoice.paid' | 'customer.subscription.deleted'

interface Event {
  type: EventType
  created: number
  id: string
}

interface State {
  status: 'NONE' | 'ACTIVE' | 'CANCELLED'
  tier: 'FREE' | 'PREMIUM'
  lastProcessedCreated: number
  emails: string[]
}

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

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const random = createSeededRandom(seed)
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function samplePermutations<T>(arr: T[], count: number, seed: number): T[][] {
  const random = createSeededRandom(seed)
  const results: T[][] = []
  for (let i = 0; i < count; i++) {
    results.push(seededShuffle(arr, Math.floor(random() * 1_000_000)))
  }
  return results
}

function createInitialState(): State {
  return {
    status: 'NONE',
    tier: 'FREE',
    lastProcessedCreated: 0,
    emails: [],
  }
}

function processEvent(state: State, event: Event): State {
  if (event.created < state.lastProcessedCreated) {
    return state
  }

  const next: State = {
    ...state,
    lastProcessedCreated: event.created,
  }

  switch (event.type) {
    case 'checkout.session.completed':
    case 'invoice.paid':
      if (next.status !== 'CANCELLED') {
        next.status = 'ACTIVE'
        next.tier = 'PREMIUM'
        if (!next.emails.includes('WELCOME_EMAIL')) {
          next.emails = [...next.emails, 'WELCOME_EMAIL']
        }
      }
      break
    case 'customer.subscription.deleted':
      next.status = 'CANCELLED'
      next.tier = 'FREE'
      next.emails = [...next.emails, 'SUBSCRIPTION_CANCELLED']
      break
  }

  return next
}

function runSequence(events: Event[]): State {
  return events.reduce(processEvent, createInitialState())
}

describe('Stripe webhook seeded permutation invariants', () => {
  it('maintains ordering/idempotency invariants across seeded permutations', () => {
    const events: Event[] = [
      { type: 'checkout.session.completed', created: 1000, id: 'evt_checkout' },
      { type: 'invoice.paid', created: 2000, id: 'evt_paid' },
      { type: 'invoice.paid', created: 2000, id: 'evt_paid' }, // Duplicate
      { type: 'customer.subscription.deleted', created: 3000, id: 'evt_deleted' },
    ]

    const permutations = samplePermutations(events, 100, 42)

    for (const sequence of permutations) {
      const finalState = runSequence(sequence)

      const latestEvent = [...events].sort((a, b) => b.created - a.created)[0]
      if (latestEvent.type === 'customer.subscription.deleted') {
        expect(finalState.status).toBe('CANCELLED')
        expect(finalState.tier).toBe('FREE')
      }

      const welcomeCount = finalState.emails.filter((e) => e === 'WELCOME_EMAIL').length
      expect(welcomeCount).toBeLessThanOrEqual(1)
    }
  })
})
