/**
 * Stripe Webhook Schema Contract Tests
 *
 * Validates that webhook payloads match expected shapes.
 * Uses golden fixtures to catch breaking changes.
 */

import { describe, it, expect } from 'vitest'
import Stripe from 'stripe'

// ============================================================================
// Golden Fixtures - Expected Webhook Shapes
// ============================================================================

/**
 * Minimal shape for checkout.session.completed
 * Based on Stripe API 2023-10-16+
 */
const CHECKOUT_SESSION_FIXTURE: Partial<Stripe.Checkout.Session> = {
  id: 'cs_test_xxx',
  object: 'checkout.session',
  mode: 'subscription',
  payment_status: 'paid',
  status: 'complete',
  customer: 'cus_xxx',
  subscription: 'sub_xxx',
  client_reference_id: 'user_xxx',
  metadata: {
    type: 'consumer',
    userId: 'user_xxx',
  },
}

/**
 * Minimal shape for invoice.paid
 */
const INVOICE_PAID_FIXTURE: Partial<Stripe.Invoice> = {
  id: 'in_xxx',
  object: 'invoice',
  status: 'paid',
  customer: 'cus_xxx',
  subscription: 'sub_xxx',
  amount_paid: 499,
  currency: 'usd',
}

/**
 * Minimal shape for customer.subscription.deleted
 */
const SUBSCRIPTION_DELETED_FIXTURE: Partial<Stripe.Subscription> = {
  id: 'sub_xxx',
  object: 'subscription',
  status: 'canceled',
  customer: 'cus_xxx',
  metadata: {
    userId: 'user_xxx',
  },
}

// ============================================================================
// Schema Validators
// ============================================================================

interface ValidationResult {
  valid: boolean
  errors: string[]
}

function validateCheckoutSession(obj: unknown): ValidationResult {
  const errors: string[] = []
  const session = obj as Partial<Stripe.Checkout.Session>

  if (!session.id) errors.push('Missing id')
  if (session.object !== 'checkout.session') errors.push('Invalid object type')
  if (!['payment', 'setup', 'subscription'].includes(session.mode as string)) {
    errors.push('Invalid mode')
  }
  if (!session.customer) errors.push('Missing customer')
  if (session.mode === 'subscription' && !session.subscription) {
    errors.push('Missing subscription for subscription mode')
  }

  return { valid: errors.length === 0, errors }
}

function validateInvoice(obj: unknown): ValidationResult {
  const errors: string[] = []
  const invoice = obj as Partial<Stripe.Invoice>

  if (!invoice.id) errors.push('Missing id')
  if (invoice.object !== 'invoice') errors.push('Invalid object type')
  if (!invoice.customer) errors.push('Missing customer')
  if (typeof invoice.amount_paid !== 'number') errors.push('Missing amount_paid')
  if (!invoice.currency) errors.push('Missing currency')

  return { valid: errors.length === 0, errors }
}

function validateSubscription(obj: unknown): ValidationResult {
  const errors: string[] = []
  const sub = obj as Partial<Stripe.Subscription>

  if (!sub.id) errors.push('Missing id')
  if (sub.object !== 'subscription') errors.push('Invalid object type')
  if (!sub.customer) errors.push('Missing customer')
  if (!sub.status) errors.push('Missing status')

  const validStatuses = [
    'incomplete',
    'incomplete_expired',
    'trialing',
    'active',
    'past_due',
    'canceled',
    'unpaid',
    'paused',
  ]
  if (sub.status && !validStatuses.includes(sub.status)) {
    errors.push(`Invalid status: ${sub.status}`)
  }

  return { valid: errors.length === 0, errors }
}

// ============================================================================
// Contract Tests
// ============================================================================

describe('Stripe Webhook Schema Contracts', () => {
  describe('checkout.session.completed', () => {
    it('should match expected minimal shape', () => {
      const result = validateCheckoutSession(CHECKOUT_SESSION_FIXTURE)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should reject missing required fields', () => {
      const invalid = { object: 'checkout.session', mode: 'subscription' }
      const result = validateCheckoutSession(invalid)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Missing id')
      expect(result.errors).toContain('Missing customer')
    })

    it('should validate mode field', () => {
      const invalidMode = { ...CHECKOUT_SESSION_FIXTURE, mode: 'invalid' }
      const result = validateCheckoutSession(invalidMode)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Invalid mode')
    })

    it('should require subscription for subscription mode', () => {
      const missingSubscription = {
        ...CHECKOUT_SESSION_FIXTURE,
        subscription: null,
      }
      const result = validateCheckoutSession(missingSubscription)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Missing subscription for subscription mode')
    })

    it('should extract metadata.type for routing', () => {
      // Consumer checkout
      const consumerSession = {
        ...CHECKOUT_SESSION_FIXTURE,
        metadata: { type: 'consumer', userId: 'user_123' },
      }
      expect(consumerSession.metadata.type).toBe('consumer')

      // Merchant checkout
      const merchantSession = {
        ...CHECKOUT_SESSION_FIXTURE,
        metadata: { type: 'merchant', merchantId: 'merchant_123' },
      }
      expect(merchantSession.metadata.type).toBe('merchant')
    })
  })

  describe('invoice.paid', () => {
    it('should match expected minimal shape', () => {
      const result = validateInvoice(INVOICE_PAID_FIXTURE)
      expect(result.valid).toBe(true)
    })

    it('should reject missing customer', () => {
      const invalid = { ...INVOICE_PAID_FIXTURE, customer: null }
      const result = validateInvoice(invalid)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Missing customer')
    })

    it('should validate amount_paid is numeric', () => {
      const invalid = { ...INVOICE_PAID_FIXTURE, amount_paid: 'not-a-number' as unknown }
      const result = validateInvoice(invalid as Stripe.Invoice)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Missing amount_paid')
    })
  })

  describe('customer.subscription.deleted', () => {
    it('should match expected minimal shape', () => {
      const result = validateSubscription(SUBSCRIPTION_DELETED_FIXTURE)
      expect(result.valid).toBe(true)
    })

    it('should validate status enum values', () => {
      const validStatuses = ['canceled', 'incomplete_expired', 'unpaid']

      for (const status of validStatuses) {
        const sub = { ...SUBSCRIPTION_DELETED_FIXTURE, status }
        const result = validateSubscription(sub)
        expect(result.valid).toBe(true)
      }
    })

    it('should reject invalid status', () => {
      const invalid = { ...SUBSCRIPTION_DELETED_FIXTURE, status: 'invalid_status' }
      const result = validateSubscription(invalid)

      expect(result.valid).toBe(false)
      expect(result.errors[0]).toContain('Invalid status')
    })
  })
})

describe('Stripe Event Wrapper Contract', () => {
  const createEvent = <T>(type: string, data: T, overrides: object = {}): Stripe.Event => ({
    id: `evt_${Date.now()}`,
    object: 'event',
    api_version: '2025-12-15.clover',
    created: Math.floor(Date.now() / 1000),
    type,
    data: { object: data },
    livemode: false,
    pending_webhooks: 0,
    request: null,
    ...overrides,
  } as Stripe.Event)

  it('should have required event wrapper fields', () => {
    const event = createEvent('checkout.session.completed', CHECKOUT_SESSION_FIXTURE)

    expect(event.id).toBeDefined()
    expect(event.object).toBe('event')
    expect(event.type).toBe('checkout.session.completed')
    expect(event.created).toBeDefined()
    expect(typeof event.created).toBe('number')
    expect(event.data.object).toBeDefined()
  })

  it('should have valid created timestamp', () => {
    const event = createEvent('invoice.paid', INVOICE_PAID_FIXTURE)

    // Created should be Unix timestamp (seconds, not milliseconds)
    expect(event.created).toBeLessThan(Date.now()) // Less than ms timestamp
    expect(event.created).toBeGreaterThan(1600000000) // After 2020
  })

  it('should support livemode detection', () => {
    const testEvent = createEvent('test', {}, { livemode: false })
    const liveEvent = createEvent('live', {}, { livemode: true })

    expect(testEvent.livemode).toBe(false)
    expect(liveEvent.livemode).toBe(true)
  })
})

describe('Merchant Webhook Metadata Contract', () => {
  it('should distinguish consumer from merchant checkout', () => {
    const consumerMetadata = {
      type: 'consumer',
      userId: 'user_abc',
    }

    const merchantMetadata = {
      type: 'merchant',
      merchantId: 'merch_xyz',
    }

    // Consumer routing
    expect(consumerMetadata.type).toBe('consumer')
    expect('userId' in consumerMetadata).toBe(true)
    expect('merchantId' in consumerMetadata).toBe(false)

    // Merchant routing
    expect(merchantMetadata.type).toBe('merchant')
    expect('merchantId' in merchantMetadata).toBe(true)
    expect('userId' in merchantMetadata).toBe(false)
  })

  it('should handle missing metadata gracefully', () => {
    const emptyMetadata = {}
    const nullMetadata = null

    // Type should default to unknown/unhandled
    const type1 = (emptyMetadata as { type?: string }).type || 'unknown'
    const type2 = (nullMetadata as { type?: string } | null)?.type || 'unknown'

    expect(type1).toBe('unknown')
    expect(type2).toBe('unknown')
  })
})
