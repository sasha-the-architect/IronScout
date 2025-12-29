import { Router, Request, Response } from 'express'
import { z } from 'zod'
import Stripe from 'stripe'
import { prisma } from '@ironscout/db'
import { loggers } from '../config/logger'

const logger = loggers.payments
const router: any = Router()

// System user ID for Stripe webhook-initiated changes
const STRIPE_SYSTEM_USER = 'STRIPE_WEBHOOK'

/**
 * Log a subscription change from Stripe webhook to admin audit log.
 * Uses STRIPE_WEBHOOK as adminUserId to distinguish from manual admin actions.
 */
async function logStripeSubscriptionChange(
  dealerId: string,
  action: string,
  oldValue: Record<string, unknown>,
  newValue: Record<string, unknown>,
  stripeEventId?: string
): Promise<void> {
  try {
    await prisma.adminAuditLog.create({
      data: {
        adminUserId: STRIPE_SYSTEM_USER,
        dealerId,
        action,
        resource: 'Dealer',
        resourceId: dealerId,
        oldValue: oldValue ? JSON.parse(JSON.stringify(oldValue)) : null,
        newValue: JSON.parse(JSON.stringify({ ...newValue, stripeEventId })),
      },
    })
    log('DEBUG', 'Subscription audit log created', {
      action: 'audit_log_created',
      dealerId,
      auditAction: action
    })
  } catch (error) {
    log('ERROR', 'Failed to create subscription audit log', {
      action: 'audit_log_error',
      dealerId,
      auditAction: action,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

/**
 * Log a consumer subscription change from Stripe webhook to admin audit log.
 * Uses STRIPE_WEBHOOK as adminUserId to distinguish from manual admin actions.
 */
async function logConsumerSubscriptionChange(
  userId: string,
  action: string,
  oldValue: Record<string, unknown>,
  newValue: Record<string, unknown>,
  stripeEventId?: string
): Promise<void> {
  try {
    await prisma.adminAuditLog.create({
      data: {
        adminUserId: STRIPE_SYSTEM_USER,
        action,
        resource: 'User',
        resourceId: userId,
        oldValue: oldValue ? JSON.parse(JSON.stringify(oldValue)) : null,
        newValue: JSON.parse(JSON.stringify({ ...newValue, stripeEventId })),
      },
    })
    log('DEBUG', 'Consumer subscription audit log created', {
      action: 'audit_log_created',
      userId,
      auditAction: action
    })
  } catch (error) {
    log('ERROR', 'Failed to create consumer subscription audit log', {
      action: 'audit_log_error',
      userId,
      auditAction: action,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-12-15.clover' })
  : null

// Helper to get current_period_end from subscription (Stripe v20 moved this to items)
function getSubscriptionPeriodEnd(subscription: Stripe.Subscription): number {
  return subscription.items.data[0]?.current_period_end ?? 0
}

// =============================================================================
// Logging Utilities
// =============================================================================

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'

interface LogContext {
  action: string
  dealerId?: string
  userId?: string
  subscriptionId?: string
  customerId?: string
  sessionId?: string
  eventType?: string
  priceId?: string
  amount?: number
  status?: string
  error?: string
  duration?: number
  [key: string]: unknown
}

function log(level: LogLevel, message: string, context: LogContext) {
  if (level === 'ERROR') {
    logger.error(message, context)
  } else if (level === 'WARN') {
    logger.warn(message, context)
  } else if (level === 'DEBUG') {
    logger.debug(message, context)
  } else {
    logger.info(message, context)
  }
}

// Track webhook processing stats
const webhookStats = {
  received: 0,
  processed: 0,
  failed: 0,
  lastEventAt: null as Date | null,
  lastEventType: null as string | null,
  eventCounts: {} as Record<string, number>,
  errors: [] as Array<{ timestamp: Date; eventType: string; error: string }>
}

// Track endpoint call stats
const endpointStats = {
  checkoutCreated: 0,
  checkoutFailed: 0,
  portalCreated: 0,
  portalFailed: 0,
  lastCheckoutAt: null as Date | null,
  lastPortalAt: null as Date | null
}

// =============================================================================
// Schemas
// =============================================================================

const createCheckoutSchema = z.object({
  priceId: z.string(),
  userId: z.string(),
  successUrl: z.string(),
  cancelUrl: z.string()
})

const createDealerCheckoutSchema = z.object({
  priceId: z.string(),
  dealerId: z.string(),
  successUrl: z.string(),
  cancelUrl: z.string()
})

// =============================================================================
// Health Check Endpoint
// =============================================================================

router.get('/health', async (req: Request, res: Response) => {
  const startTime = Date.now()

  try {
    // Check Stripe connectivity
    let stripeStatus = 'not_configured'
    let stripeAccountId = null

    if (stripe) {
      try {
        const account = await stripe.accounts.retrieve()
        stripeStatus = 'connected'
        stripeAccountId = account.id
      } catch (stripeError) {
        stripeStatus = 'error'
        log('ERROR', 'Stripe health check failed', {
          action: 'health_check',
          error: stripeError instanceof Error ? stripeError.message : 'Unknown error'
        })
      }
    }

    // Check database connectivity
    let dbStatus = 'unknown'
    let activeDealerSubscriptions = 0
    let activeConsumerSubscriptions = 0

    try {
      // Count active dealer subscriptions
      activeDealerSubscriptions = await prisma.dealer.count({
        where: { subscriptionStatus: 'ACTIVE' }
      })

      // Count active consumer subscriptions (users with PREMIUM tier)
      activeConsumerSubscriptions = await prisma.user.count({
        where: { tier: 'PREMIUM' }
      })

      dbStatus = 'connected'
    } catch (dbError) {
      dbStatus = 'error'
      log('ERROR', 'Database health check failed', {
        action: 'health_check',
        error: dbError instanceof Error ? dbError.message : 'Unknown error'
      })
    }

    const duration = Date.now() - startTime

    const health = {
      status: stripeStatus === 'connected' && dbStatus === 'connected' ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      stripe: {
        status: stripeStatus,
        accountId: stripeAccountId,
        configured: !!process.env.STRIPE_SECRET_KEY,
        webhookConfigured: !!process.env.STRIPE_WEBHOOK_SECRET,
        priceIds: {
          premiumMonthly: !!process.env.STRIPE_PRICE_ID_PREMIUM_MONTHLY,
          premiumAnnually: !!process.env.STRIPE_PRICE_ID_PREMIUM_ANNUALLY,
          dealerStandard: !!process.env.STRIPE_PRICE_ID_DEALER_STANDARD_MONTHLY,
          dealerPro: !!process.env.STRIPE_PRICE_ID_DEALER_PRO_MONTHLY
        }
      },
      database: {
        status: dbStatus,
        activeDealerSubscriptions,
        activeConsumerSubscriptions
      },
      webhooks: {
        received: webhookStats.received,
        processed: webhookStats.processed,
        failed: webhookStats.failed,
        lastEventAt: webhookStats.lastEventAt?.toISOString() || null,
        lastEventType: webhookStats.lastEventType,
        recentErrors: webhookStats.errors.slice(-5).map(e => ({
          timestamp: e.timestamp.toISOString(),
          eventType: e.eventType,
          error: e.error
        }))
      },
      endpoints: {
        checkoutCreated: endpointStats.checkoutCreated,
        checkoutFailed: endpointStats.checkoutFailed,
        portalCreated: endpointStats.portalCreated,
        portalFailed: endpointStats.portalFailed,
        lastCheckoutAt: endpointStats.lastCheckoutAt?.toISOString() || null,
        lastPortalAt: endpointStats.lastPortalAt?.toISOString() || null
      }
    }

    log('INFO', 'Health check completed', {
      action: 'health_check',
      status: health.status,
      duration
    })

    res.json(health)
  } catch (error) {
    const duration = Date.now() - startTime

    log('ERROR', 'Health check failed', {
      action: 'health_check',
      error: error instanceof Error ? error.message : 'Unknown error',
      duration
    })

    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

// Debug endpoint for webhook event counts (protected by env check)
router.get('/debug/webhook-stats', async (req: Request, res: Response) => {
  // Only allow in development or with debug header
  const isDebug = process.env.NODE_ENV === 'development' || req.headers['x-debug-key'] === process.env.DEBUG_API_KEY

  if (!isDebug) {
    return res.status(403).json({ error: 'Debug endpoint not available' })
  }

  res.json({
    webhooks: webhookStats,
    endpoints: endpointStats,
    eventBreakdown: webhookStats.eventCounts
  })
})

// =============================================================================
// Consumer Checkout (existing)
// =============================================================================

router.post('/create-checkout', async (req: Request, res: Response) => {
  const startTime = Date.now()

  try {
    const { priceId, userId, successUrl, cancelUrl } = createCheckoutSchema.parse(req.body)

    log('INFO', 'Consumer checkout initiated', {
      action: 'consumer_checkout_start',
      userId,
      priceId
    })

    if (!stripe) {
      const mockSessionId = `mock_session_${Date.now()}`
      log('WARN', 'Stripe not configured - returning mock session', {
        action: 'consumer_checkout_mock',
        userId,
        sessionId: mockSessionId
      })

      return res.json({
        url: `${successUrl}?session_id=${mockSessionId}`,
        sessionId: mockSessionId
      })
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: userId,
      metadata: {
        type: 'consumer',
        userId: userId,
      },
    })

    const duration = Date.now() - startTime
    endpointStats.checkoutCreated++
    endpointStats.lastCheckoutAt = new Date()

    log('INFO', 'Consumer checkout session created', {
      action: 'consumer_checkout_success',
      userId,
      priceId,
      sessionId: session.id,
      duration
    })

    res.json({
      url: session.url,
      sessionId: session.id
    })
  } catch (error) {
    const duration = Date.now() - startTime
    endpointStats.checkoutFailed++

    log('ERROR', 'Consumer checkout failed', {
      action: 'consumer_checkout_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      duration
    })

    res.status(500).json({ error: 'Failed to create checkout session' })
  }
})

// =============================================================================
// Dealer Checkout
// =============================================================================

router.post('/dealer/create-checkout', async (req: Request, res: Response) => {
  const startTime = Date.now()

  try {
    const { priceId, dealerId, successUrl, cancelUrl } = createDealerCheckoutSchema.parse(req.body)

    log('INFO', 'Dealer checkout initiated', {
      action: 'dealer_checkout_start',
      dealerId,
      priceId
    })

    if (!stripe) {
      const mockSessionId = `mock_dealer_session_${Date.now()}`
      log('WARN', 'Stripe not configured - returning mock session', {
        action: 'dealer_checkout_mock',
        dealerId,
        sessionId: mockSessionId
      })

      return res.json({
        url: `${successUrl}?session_id=${mockSessionId}`,
        sessionId: mockSessionId
      })
    }

    // Get dealer info for Stripe customer
    const dealer = await prisma.dealer.findUnique({
      where: { id: dealerId },
      include: {
        users: {
          where: { role: 'OWNER' },
          take: 1,
        },
      },
    })

    if (!dealer) {
      log('WARN', 'Dealer not found for checkout', {
        action: 'dealer_checkout_not_found',
        dealerId
      })
      return res.status(404).json({ error: 'Dealer not found' })
    }

    const ownerEmail = dealer.users[0]?.email

    // Create or retrieve Stripe customer
    let customerId = dealer.stripeCustomerId
    let customerCreated = false

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: ownerEmail,
        name: dealer.businessName,
        metadata: {
          dealerId: dealer.id,
          type: 'dealer',
        },
      })
      customerId = customer.id
      customerCreated = true

      // Save customer ID to dealer record
      await prisma.dealer.update({
        where: { id: dealerId },
        data: { stripeCustomerId: customerId },
      })

      log('INFO', 'Stripe customer created for dealer', {
        action: 'dealer_customer_created',
        dealerId,
        customerId
      })
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: dealerId,
      metadata: {
        type: 'dealer',
        dealerId: dealerId,
      },
      subscription_data: {
        metadata: {
          type: 'dealer',
          dealerId: dealerId,
        },
      },
    })

    const duration = Date.now() - startTime
    endpointStats.checkoutCreated++
    endpointStats.lastCheckoutAt = new Date()

    log('INFO', 'Dealer checkout session created', {
      action: 'dealer_checkout_success',
      dealerId,
      priceId,
      customerId,
      sessionId: session.id,
      customerCreated,
      duration
    })

    res.json({
      url: session.url,
      sessionId: session.id
    })
  } catch (error) {
    const duration = Date.now() - startTime
    endpointStats.checkoutFailed++

    log('ERROR', 'Dealer checkout failed', {
      action: 'dealer_checkout_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      duration
    })

    res.status(500).json({ error: 'Failed to create dealer checkout session' })
  }
})

// =============================================================================
// Dealer Customer Portal
// =============================================================================

router.post('/dealer/create-portal-session', async (req: Request, res: Response) => {
  const startTime = Date.now()

  try {
    const { dealerId, returnUrl } = req.body

    log('INFO', 'Dealer portal session initiated', {
      action: 'dealer_portal_start',
      dealerId
    })

    if (!stripe) {
      log('WARN', 'Stripe not configured - returning to return URL', {
        action: 'dealer_portal_mock',
        dealerId
      })
      return res.json({ url: returnUrl })
    }

    const dealer = await prisma.dealer.findUnique({
      where: { id: dealerId },
    })

    if (!dealer?.stripeCustomerId) {
      log('WARN', 'No billing account found for dealer', {
        action: 'dealer_portal_no_customer',
        dealerId
      })
      return res.status(400).json({ error: 'No billing account found' })
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: dealer.stripeCustomerId,
      return_url: returnUrl,
    })

    const duration = Date.now() - startTime
    endpointStats.portalCreated++
    endpointStats.lastPortalAt = new Date()

    log('INFO', 'Dealer portal session created', {
      action: 'dealer_portal_success',
      dealerId,
      customerId: dealer.stripeCustomerId,
      duration
    })

    res.json({ url: session.url })
  } catch (error) {
    const duration = Date.now() - startTime
    endpointStats.portalFailed++

    log('ERROR', 'Dealer portal session failed', {
      action: 'dealer_portal_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      duration
    })

    res.status(500).json({ error: 'Failed to create portal session' })
  }
})

// =============================================================================
// Webhook Handler
// =============================================================================

router.post('/webhook', async (req: Request, res: Response) => {
  const startTime = Date.now()
  webhookStats.received++

  try {
    const sig = req.headers['stripe-signature'] as string

    if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
      log('WARN', 'Mock webhook received - Stripe not configured', {
        action: 'webhook_mock',
        eventType: req.body?.type || 'unknown'
      })
      return res.json({ received: true })
    }

    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    )

    // Track event stats
    webhookStats.lastEventAt = new Date()
    webhookStats.lastEventType = event.type
    webhookStats.eventCounts[event.type] = (webhookStats.eventCounts[event.type] || 0) + 1

    log('INFO', `Webhook received: ${event.type}`, {
      action: 'webhook_received',
      eventType: event.type,
      eventId: event.id
    })

    switch (event.type) {
      // =======================================================================
      // Checkout completed - new subscription created
      // =======================================================================
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const metadata = session.metadata || {}

        if (metadata.type === 'dealer') {
          await handleDealerCheckoutCompleted(session)
        } else {
          await handleConsumerCheckoutCompleted(session)
        }
        break
      }

      // =======================================================================
      // Invoice paid - subscription renewed or payment succeeded
      // =======================================================================
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice
        // Extract subscription ID from invoice (may be string, object, or null depending on Stripe API version)
        const rawSubscription = (invoice as unknown as { subscription?: string | { id: string } | null }).subscription
        const subscriptionId = typeof rawSubscription === 'string'
          ? rawSubscription
          : rawSubscription?.id || null

        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId)
          const metadata = subscription.metadata || {}

          if (metadata.type === 'dealer') {
            await handleDealerInvoicePaid(invoice, subscription)
          } else {
            await handleConsumerInvoicePaid(invoice, subscription)
          }
        }
        break
      }

      // =======================================================================
      // Invoice payment failed
      // =======================================================================
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        // Extract subscription ID from invoice (may be string, object, or null depending on Stripe API version)
        const rawSubscription = (invoice as unknown as { subscription?: string | { id: string } | null }).subscription
        const subscriptionId = typeof rawSubscription === 'string'
          ? rawSubscription
          : rawSubscription?.id || null

        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId)
          const metadata = subscription.metadata || {}

          if (metadata.type === 'dealer') {
            await handleDealerPaymentFailed(invoice, subscription)
          } else {
            await handleConsumerPaymentFailed(invoice, subscription)
          }
        }
        break
      }

      // =======================================================================
      // Subscription updated (e.g., plan change, pause, resume)
      // =======================================================================
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const metadata = subscription.metadata || {}

        if (metadata.type === 'dealer') {
          await handleDealerSubscriptionUpdated(subscription)
        } else {
          await handleConsumerSubscriptionUpdated(subscription)
        }
        break
      }

      // =======================================================================
      // Subscription deleted (cancelled)
      // =======================================================================
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const metadata = subscription.metadata || {}

        if (metadata.type === 'dealer') {
          await handleDealerSubscriptionDeleted(subscription)
        } else {
          await handleConsumerSubscriptionDeleted(subscription)
        }
        break
      }

      // =======================================================================
      // Subscription paused
      // =======================================================================
      case 'customer.subscription.paused': {
        const subscription = event.data.object as Stripe.Subscription
        const metadata = subscription.metadata || {}

        if (metadata.type === 'dealer') {
          await handleDealerSubscriptionPaused(subscription)
        }
        break
      }

      // =======================================================================
      // Subscription resumed
      // =======================================================================
      case 'customer.subscription.resumed': {
        const subscription = event.data.object as Stripe.Subscription
        const metadata = subscription.metadata || {}

        if (metadata.type === 'dealer') {
          await handleDealerSubscriptionResumed(subscription)
        }
        break
      }

      default:
        log('DEBUG', `Unhandled webhook event type: ${event.type}`, {
          action: 'webhook_unhandled',
          eventType: event.type,
          eventId: event.id
        })
    }

    const duration = Date.now() - startTime
    webhookStats.processed++

    log('INFO', `Webhook processed: ${event.type}`, {
      action: 'webhook_processed',
      eventType: event.type,
      eventId: event.id,
      duration
    })

    res.json({ received: true })
  } catch (error) {
    const duration = Date.now() - startTime
    webhookStats.failed++

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    // Keep last 10 errors for debugging
    webhookStats.errors.push({
      timestamp: new Date(),
      eventType: 'unknown',
      error: errorMessage
    })
    if (webhookStats.errors.length > 10) {
      webhookStats.errors.shift()
    }

    log('ERROR', 'Webhook processing failed', {
      action: 'webhook_error',
      error: errorMessage,
      duration
    })

    res.status(400).json({ error: 'Webhook signature verification failed' })
  }
})

// =============================================================================
// Dealer Webhook Handlers
// =============================================================================

async function handleDealerCheckoutCompleted(session: Stripe.Checkout.Session) {
  const dealerId = session.metadata?.dealerId || session.client_reference_id
  const subscriptionId = session.subscription as string
  const customerId = session.customer as string

  if (!dealerId) {
    log('ERROR', 'No dealerId in checkout session', {
      action: 'dealer_checkout_completed_error',
      sessionId: session.id
    })
    return
  }

  log('INFO', 'Processing dealer checkout completed', {
    action: 'dealer_checkout_completed_start',
    dealerId,
    subscriptionId,
    customerId
  })

  // Get current dealer state for audit log
  const oldDealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: {
      subscriptionStatus: true,
      subscriptionExpiresAt: true,
      stripeSubscriptionId: true,
      stripeCustomerId: true,
      paymentMethod: true,
      autoRenew: true,
    },
  })

  // Get subscription details
  const subscription = await stripe!.subscriptions.retrieve(subscriptionId)
  const currentPeriodEnd = new Date(getSubscriptionPeriodEnd(subscription) * 1000)

  await prisma.dealer.update({
    where: { id: dealerId },
    data: {
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: customerId,
      paymentMethod: 'STRIPE',
      subscriptionStatus: 'ACTIVE',
      subscriptionExpiresAt: currentPeriodEnd,
      autoRenew: true,
    },
  })

  // Audit log
  await logStripeSubscriptionChange(
    dealerId,
    'STRIPE_CHECKOUT_COMPLETED',
    oldDealer || {},
    {
      subscriptionStatus: 'ACTIVE',
      subscriptionExpiresAt: currentPeriodEnd.toISOString(),
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: customerId,
      paymentMethod: 'STRIPE',
      autoRenew: true,
    }
  )

  log('INFO', 'Dealer subscription activated', {
    action: 'dealer_checkout_completed_success',
    dealerId,
    subscriptionId,
    customerId,
    expiresAt: currentPeriodEnd.toISOString(),
    status: 'ACTIVE'
  })
}

async function handleDealerInvoicePaid(invoice: Stripe.Invoice, subscription: Stripe.Subscription) {
  const dealerId = subscription.metadata?.dealerId
  const invoiceId = invoice.id
  const amount = invoice.amount_paid

  if (!dealerId) {
    log('ERROR', 'No dealerId in subscription metadata', {
      action: 'dealer_invoice_paid_error',
      subscriptionId: subscription.id,
      invoiceId
    })
    return
  }

  log('INFO', 'Processing dealer invoice paid', {
    action: 'dealer_invoice_paid_start',
    dealerId,
    subscriptionId: subscription.id,
    invoiceId,
    amount
  })

  // Get current dealer state for audit log
  const oldDealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: {
      subscriptionStatus: true,
      subscriptionExpiresAt: true,
    },
  })

  const currentPeriodEnd = new Date(getSubscriptionPeriodEnd(subscription) * 1000)

  await prisma.dealer.update({
    where: { id: dealerId },
    data: {
      subscriptionStatus: 'ACTIVE',
      subscriptionExpiresAt: currentPeriodEnd,
    },
  })

  // Audit log
  await logStripeSubscriptionChange(
    dealerId,
    'STRIPE_INVOICE_PAID',
    oldDealer || {},
    {
      subscriptionStatus: 'ACTIVE',
      subscriptionExpiresAt: currentPeriodEnd.toISOString(),
      invoiceId,
      amountPaid: amount,
    }
  )

  log('INFO', 'Dealer subscription renewed', {
    action: 'dealer_invoice_paid_success',
    dealerId,
    subscriptionId: subscription.id,
    invoiceId,
    amount,
    expiresAt: currentPeriodEnd.toISOString()
  })
}

async function handleDealerPaymentFailed(invoice: Stripe.Invoice, subscription: Stripe.Subscription) {
  const dealerId = subscription.metadata?.dealerId
  const invoiceId = invoice.id
  const attemptCount = invoice.attempt_count

  if (!dealerId) {
    log('ERROR', 'No dealerId in subscription metadata', {
      action: 'dealer_payment_failed_error',
      subscriptionId: subscription.id,
      invoiceId
    })
    return
  }

  log('WARN', 'Dealer payment failed', {
    action: 'dealer_payment_failed_start',
    dealerId,
    subscriptionId: subscription.id,
    invoiceId,
    attemptCount
  })

  // Get current dealer state for audit log
  const oldDealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: {
      subscriptionStatus: true,
      subscriptionExpiresAt: true,
    },
  })

  // Set to EXPIRED to trigger grace period
  await prisma.dealer.update({
    where: { id: dealerId },
    data: {
      subscriptionStatus: 'EXPIRED',
      // Keep existing expiration date - grace period calculated from there
    },
  })

  // Audit log
  await logStripeSubscriptionChange(
    dealerId,
    'STRIPE_PAYMENT_FAILED',
    oldDealer || {},
    {
      subscriptionStatus: 'EXPIRED',
      invoiceId,
      attemptCount,
      reason: 'Payment failed - entering grace period',
    }
  )

  log('WARN', 'Dealer subscription marked as EXPIRED', {
    action: 'dealer_payment_failed_processed',
    dealerId,
    subscriptionId: subscription.id,
    invoiceId,
    attemptCount,
    status: 'EXPIRED'
  })
}

async function handleDealerSubscriptionUpdated(subscription: Stripe.Subscription) {
  const dealerId = subscription.metadata?.dealerId
  const stripeStatus = subscription.status

  if (!dealerId) {
    log('ERROR', 'No dealerId in subscription metadata', {
      action: 'dealer_subscription_updated_error',
      subscriptionId: subscription.id,
      stripeStatus
    })
    return
  }

  log('INFO', 'Processing dealer subscription update', {
    action: 'dealer_subscription_updated_start',
    dealerId,
    subscriptionId: subscription.id,
    stripeStatus,
    cancelAtPeriodEnd: subscription.cancel_at_period_end
  })

  // Get current dealer state for audit log
  const oldDealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: {
      subscriptionStatus: true,
      subscriptionExpiresAt: true,
      autoRenew: true,
    },
  })

  const currentPeriodEnd = new Date(getSubscriptionPeriodEnd(subscription) * 1000)

  // Map Stripe status to our status
  let subscriptionStatus: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'CANCELLED' = 'ACTIVE'

  switch (subscription.status) {
    case 'active':
    case 'trialing':
      subscriptionStatus = 'ACTIVE'
      break
    case 'past_due':
    case 'unpaid':
      subscriptionStatus = 'EXPIRED'
      break
    case 'paused':
      subscriptionStatus = 'SUSPENDED'
      break
    case 'canceled':
    case 'incomplete_expired':
      subscriptionStatus = 'CANCELLED'
      break
  }

  await prisma.dealer.update({
    where: { id: dealerId },
    data: {
      subscriptionStatus,
      subscriptionExpiresAt: currentPeriodEnd,
      autoRenew: !subscription.cancel_at_period_end,
    },
  })

  // Audit log
  await logStripeSubscriptionChange(
    dealerId,
    'STRIPE_SUBSCRIPTION_UPDATED',
    oldDealer || {},
    {
      subscriptionStatus,
      subscriptionExpiresAt: currentPeriodEnd.toISOString(),
      autoRenew: !subscription.cancel_at_period_end,
      stripeStatus,
    }
  )

  log('INFO', 'Dealer subscription updated', {
    action: 'dealer_subscription_updated_success',
    dealerId,
    subscriptionId: subscription.id,
    stripeStatus,
    localStatus: subscriptionStatus,
    expiresAt: currentPeriodEnd.toISOString(),
    autoRenew: !subscription.cancel_at_period_end
  })
}

async function handleDealerSubscriptionDeleted(subscription: Stripe.Subscription) {
  const dealerId = subscription.metadata?.dealerId

  if (!dealerId) {
    log('ERROR', 'No dealerId in subscription metadata', {
      action: 'dealer_subscription_deleted_error',
      subscriptionId: subscription.id
    })
    return
  }

  log('WARN', 'Processing dealer subscription deletion', {
    action: 'dealer_subscription_deleted_start',
    dealerId,
    subscriptionId: subscription.id
  })

  // Get current dealer state for audit log
  const oldDealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: {
      subscriptionStatus: true,
      stripeSubscriptionId: true,
      autoRenew: true,
    },
  })

  await prisma.dealer.update({
    where: { id: dealerId },
    data: {
      subscriptionStatus: 'CANCELLED',
      stripeSubscriptionId: null,
      autoRenew: false,
    },
  })

  // Audit log
  await logStripeSubscriptionChange(
    dealerId,
    'STRIPE_SUBSCRIPTION_DELETED',
    oldDealer || {},
    {
      subscriptionStatus: 'CANCELLED',
      stripeSubscriptionId: null,
      autoRenew: false,
      reason: 'Subscription cancelled in Stripe',
    }
  )

  log('WARN', 'Dealer subscription cancelled', {
    action: 'dealer_subscription_deleted_success',
    dealerId,
    subscriptionId: subscription.id,
    status: 'CANCELLED'
  })
}

async function handleDealerSubscriptionPaused(subscription: Stripe.Subscription) {
  const dealerId = subscription.metadata?.dealerId

  if (!dealerId) {
    log('ERROR', 'No dealerId in subscription metadata', {
      action: 'dealer_subscription_paused_error',
      subscriptionId: subscription.id
    })
    return
  }

  log('WARN', 'Processing dealer subscription pause', {
    action: 'dealer_subscription_paused_start',
    dealerId,
    subscriptionId: subscription.id
  })

  // Get current dealer state for audit log
  const oldDealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: {
      subscriptionStatus: true,
    },
  })

  await prisma.dealer.update({
    where: { id: dealerId },
    data: {
      subscriptionStatus: 'SUSPENDED',
    },
  })

  // Audit log
  await logStripeSubscriptionChange(
    dealerId,
    'STRIPE_SUBSCRIPTION_PAUSED',
    oldDealer || {},
    {
      subscriptionStatus: 'SUSPENDED',
      reason: 'Subscription paused in Stripe',
    }
  )

  log('WARN', 'Dealer subscription suspended', {
    action: 'dealer_subscription_paused_success',
    dealerId,
    subscriptionId: subscription.id,
    status: 'SUSPENDED'
  })
}

async function handleDealerSubscriptionResumed(subscription: Stripe.Subscription) {
  const dealerId = subscription.metadata?.dealerId

  if (!dealerId) {
    log('ERROR', 'No dealerId in subscription metadata', {
      action: 'dealer_subscription_resumed_error',
      subscriptionId: subscription.id
    })
    return
  }

  log('INFO', 'Processing dealer subscription resume', {
    action: 'dealer_subscription_resumed_start',
    dealerId,
    subscriptionId: subscription.id
  })

  // Get current dealer state for audit log
  const oldDealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: {
      subscriptionStatus: true,
      subscriptionExpiresAt: true,
    },
  })

  const currentPeriodEnd = new Date(getSubscriptionPeriodEnd(subscription) * 1000)

  await prisma.dealer.update({
    where: { id: dealerId },
    data: {
      subscriptionStatus: 'ACTIVE',
      subscriptionExpiresAt: currentPeriodEnd,
    },
  })

  // Audit log
  await logStripeSubscriptionChange(
    dealerId,
    'STRIPE_SUBSCRIPTION_RESUMED',
    oldDealer || {},
    {
      subscriptionStatus: 'ACTIVE',
      subscriptionExpiresAt: currentPeriodEnd.toISOString(),
      reason: 'Subscription resumed in Stripe',
    }
  )

  log('INFO', 'Dealer subscription resumed', {
    action: 'dealer_subscription_resumed_success',
    dealerId,
    subscriptionId: subscription.id,
    expiresAt: currentPeriodEnd.toISOString(),
    status: 'ACTIVE'
  })
}

// =============================================================================
// Consumer Webhook Handlers
// ADR-002: Server-side tier enforcement - user tier MUST be updated on webhook events
// =============================================================================

/**
 * Helper to find user by Stripe subscription ID
 */
async function findUserByStripeSubscription(stripeSubscriptionId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { stripeId: stripeSubscriptionId },
    include: { user: true }
  })
  return subscription?.user || null
}

/**
 * Helper to map Stripe subscription status to our SubscriptionStatus enum
 */
function mapStripeStatusToSubscriptionStatus(stripeStatus: string): 'ACTIVE' | 'CANCELLED' | 'EXPIRED' {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return 'ACTIVE'
    case 'canceled':
    case 'unpaid':
      return 'CANCELLED'
    case 'past_due':
      // Keep active during grace period - Stripe will retry payments
      return 'ACTIVE'
    case 'incomplete':
    case 'incomplete_expired':
      return 'EXPIRED'
    default:
      return 'EXPIRED'
  }
}

/**
 * Handle consumer checkout.session.completed
 * Creates subscription record and upgrades user to PREMIUM
 */
async function handleConsumerCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.client_reference_id
  const subscriptionId = session.subscription as string
  const customerId = session.customer as string

  if (!userId) {
    log('ERROR', 'No userId in checkout session client_reference_id', {
      action: 'consumer_checkout_completed_error',
      sessionId: session.id
    })
    return
  }

  log('INFO', 'Processing consumer checkout completed', {
    action: 'consumer_checkout_completed_start',
    userId,
    subscriptionId,
    customerId
  })

  // Get current user state for audit log
  const oldUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { tier: true }
  })

  if (!oldUser) {
    log('ERROR', 'User not found for consumer checkout', {
      action: 'consumer_checkout_completed_error',
      userId,
      sessionId: session.id
    })
    return
  }

  // Get subscription details from Stripe
  const stripeSubscription = await stripe!.subscriptions.retrieve(subscriptionId)
  const currentPeriodEnd = new Date(getSubscriptionPeriodEnd(stripeSubscription) * 1000)
  const amount = stripeSubscription.items.data[0]?.price?.unit_amount || 0

  // Use transaction for atomicity
  await prisma.$transaction(async (tx) => {
    // 1. Create or update Subscription record
    await tx.subscription.upsert({
      where: { stripeId: subscriptionId },
      create: {
        userId,
        type: 'USER_PREMIUM',
        status: 'ACTIVE',
        stripeId: subscriptionId,
        startDate: new Date(),
        endDate: currentPeriodEnd,
        amount: amount / 100, // Convert cents to dollars
        currency: stripeSubscription.currency.toUpperCase()
      },
      update: {
        status: 'ACTIVE',
        endDate: currentPeriodEnd
      }
    })

    // 2. Upgrade user tier to PREMIUM
    await tx.user.update({
      where: { id: userId },
      data: { tier: 'PREMIUM' }
    })
  })

  // Audit log
  await logConsumerSubscriptionChange(
    userId,
    'CONSUMER_CHECKOUT_COMPLETED',
    { tier: oldUser.tier },
    {
      tier: 'PREMIUM',
      subscriptionStatus: 'ACTIVE',
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: customerId,
      expiresAt: currentPeriodEnd.toISOString()
    }
  )

  log('INFO', 'Consumer subscription activated', {
    action: 'consumer_checkout_completed_success',
    userId,
    subscriptionId,
    customerId,
    expiresAt: currentPeriodEnd.toISOString(),
    status: 'ACTIVE',
    tier: 'PREMIUM'
  })
}

/**
 * Handle consumer invoice.payment_succeeded
 * Renews subscription and ensures user remains PREMIUM
 */
async function handleConsumerInvoicePaid(invoice: Stripe.Invoice, subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.userId
  const invoiceId = invoice.id
  const amount = invoice.amount_paid

  // Try to find user by metadata first, then by subscription lookup
  let user = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null
  if (!user) {
    user = await findUserByStripeSubscription(subscription.id)
  }

  if (!user) {
    log('ERROR', 'No user found for consumer invoice paid', {
      action: 'consumer_invoice_paid_error',
      subscriptionId: subscription.id,
      invoiceId
    })
    return
  }

  log('INFO', 'Processing consumer invoice paid', {
    action: 'consumer_invoice_paid_start',
    userId: user.id,
    subscriptionId: subscription.id,
    invoiceId,
    amount
  })

  const currentPeriodEnd = new Date(getSubscriptionPeriodEnd(subscription) * 1000)
  const oldTier = user.tier

  // Update subscription and ensure user is PREMIUM
  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { stripeId: subscription.id },
      data: {
        status: 'ACTIVE',
        endDate: currentPeriodEnd
      }
    })

    // Ensure user is PREMIUM (handles edge cases)
    if (user!.tier !== 'PREMIUM') {
      await tx.user.update({
        where: { id: user!.id },
        data: { tier: 'PREMIUM' }
      })
    }
  })

  // Audit log
  await logConsumerSubscriptionChange(
    user.id,
    'CONSUMER_INVOICE_PAID',
    { tier: oldTier },
    {
      tier: 'PREMIUM',
      subscriptionStatus: 'ACTIVE',
      invoiceId,
      amountPaid: amount,
      renewedUntil: currentPeriodEnd.toISOString()
    }
  )

  log('INFO', 'Consumer subscription renewed', {
    action: 'consumer_invoice_paid_success',
    userId: user.id,
    subscriptionId: subscription.id,
    invoiceId,
    amount,
    expiresAt: currentPeriodEnd.toISOString()
  })
}

/**
 * Handle consumer invoice.payment_failed
 * Logs failure but keeps user PREMIUM during Stripe retry period
 */
async function handleConsumerPaymentFailed(invoice: Stripe.Invoice, subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.userId

  let user = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null
  if (!user) {
    user = await findUserByStripeSubscription(subscription.id)
  }

  if (!user) {
    log('ERROR', 'No user found for consumer payment failed', {
      action: 'consumer_payment_failed_error',
      subscriptionId: subscription.id,
      invoiceId: invoice.id
    })
    return
  }

  log('WARN', 'Consumer payment failed', {
    action: 'consumer_payment_failed',
    userId: user.id,
    subscriptionId: subscription.id,
    invoiceId: invoice.id,
    attemptCount: invoice.attempt_count,
    nextAttempt: invoice.next_payment_attempt
      ? new Date(invoice.next_payment_attempt * 1000).toISOString()
      : 'none'
  })

  // Audit log - don't downgrade yet, Stripe will retry
  await logConsumerSubscriptionChange(
    user.id,
    'CONSUMER_PAYMENT_FAILED',
    { tier: user.tier },
    {
      tier: user.tier, // Keep current tier during retry period
      invoiceId: invoice.id,
      attemptCount: invoice.attempt_count,
      nextPaymentAttempt: invoice.next_payment_attempt
        ? new Date(invoice.next_payment_attempt * 1000).toISOString()
        : null,
      stripeStatus: subscription.status
    }
  )

  // Note: We don't downgrade here - Stripe will send subscription_deleted
  // or subscription_updated when retries are exhausted
}

/**
 * Handle consumer customer.subscription.updated
 * Updates subscription status and tier based on Stripe status
 */
async function handleConsumerSubscriptionUpdated(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.userId

  let user = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null
  if (!user) {
    user = await findUserByStripeSubscription(subscription.id)
  }

  if (!user) {
    log('ERROR', 'No user found for consumer subscription updated', {
      action: 'consumer_subscription_updated_error',
      subscriptionId: subscription.id
    })
    return
  }

  log('INFO', 'Processing consumer subscription updated', {
    action: 'consumer_subscription_updated_start',
    userId: user.id,
    subscriptionId: subscription.id,
    stripeStatus: subscription.status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end
  })

  const currentPeriodEnd = new Date(getSubscriptionPeriodEnd(subscription) * 1000)
  const subscriptionStatus = mapStripeStatusToSubscriptionStatus(subscription.status)
  const oldTier = user.tier

  // Determine new tier based on subscription status
  // Active/trialing = PREMIUM, anything else = FREE
  const newTier = subscriptionStatus === 'ACTIVE' ? 'PREMIUM' : 'FREE'

  await prisma.$transaction(async (tx) => {
    // Update subscription record
    await tx.subscription.update({
      where: { stripeId: subscription.id },
      data: {
        status: subscriptionStatus,
        endDate: currentPeriodEnd
      }
    })

    // Update user tier if changed
    if (user!.tier !== newTier) {
      await tx.user.update({
        where: { id: user!.id },
        data: { tier: newTier }
      })
    }
  })

  // Audit log
  await logConsumerSubscriptionChange(
    user.id,
    'CONSUMER_SUBSCRIPTION_UPDATED',
    { tier: oldTier, subscriptionStatus: oldTier === 'PREMIUM' ? 'ACTIVE' : 'EXPIRED' },
    {
      tier: newTier,
      subscriptionStatus,
      stripeStatus: subscription.status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodEnd: currentPeriodEnd.toISOString()
    }
  )

  log('INFO', 'Consumer subscription updated', {
    action: 'consumer_subscription_updated_success',
    userId: user.id,
    subscriptionId: subscription.id,
    oldTier,
    newTier,
    subscriptionStatus,
    stripeStatus: subscription.status
  })
}

/**
 * Handle consumer customer.subscription.deleted
 * Downgrades user to FREE tier
 */
async function handleConsumerSubscriptionDeleted(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.userId

  let user = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null
  if (!user) {
    user = await findUserByStripeSubscription(subscription.id)
  }

  if (!user) {
    log('ERROR', 'No user found for consumer subscription deleted', {
      action: 'consumer_subscription_deleted_error',
      subscriptionId: subscription.id
    })
    return
  }

  log('WARN', 'Processing consumer subscription deleted', {
    action: 'consumer_subscription_deleted_start',
    userId: user.id,
    subscriptionId: subscription.id
  })

  const oldTier = user.tier

  await prisma.$transaction(async (tx) => {
    // Mark subscription as cancelled
    await tx.subscription.update({
      where: { stripeId: subscription.id },
      data: {
        status: 'CANCELLED',
        endDate: new Date()
      }
    })

    // Downgrade user to FREE
    await tx.user.update({
      where: { id: user!.id },
      data: { tier: 'FREE' }
    })
  })

  // Audit log
  await logConsumerSubscriptionChange(
    user.id,
    'CONSUMER_SUBSCRIPTION_DELETED',
    { tier: oldTier, subscriptionStatus: 'ACTIVE' },
    {
      tier: 'FREE',
      subscriptionStatus: 'CANCELLED',
      cancelledAt: new Date().toISOString()
    }
  )

  log('WARN', 'Consumer downgraded to FREE tier', {
    action: 'consumer_subscription_deleted_success',
    userId: user.id,
    subscriptionId: subscription.id,
    oldTier,
    newTier: 'FREE'
  })
}

// =============================================================================
// Plans endpoint
// =============================================================================

router.get('/plans', async (req: Request, res: Response) => {
  try {
    const plans = [
      {
        id: 'price_free',
        name: 'Free',
        price: 0,
        currency: 'USD',
        interval: 'month',
        features: [
          'Search, filter, and compare prices across hundreds of dealers',
          'Price-per-round breakdowns',
          'Purpose badges (range, defense, hunting)',
          'Up to 3 delayed price alerts',
          'Basic AI assistance'
        ]
      },
      {
        id: process.env.STRIPE_PRICE_ID_PREMIUM_MONTHLY || 'price_premium_monthly',
        name: 'Premium Monthly',
        price: 4.99,
        currency: 'USD',
        interval: 'month',
        features: [
          'Everything in Free',
          'Full price history charts (30, 90, 365 days)',
          'Faster alert notifications',
          'More active alerts',
          'Advanced filters (subsonic, +P, match-grade, low-recoil)',
          'AI-assisted search explanations'
        ]
      },
      {
        id: process.env.STRIPE_PRICE_ID_PREMIUM_ANNUALLY || 'price_premium_annual',
        name: 'Premium Annual',
        price: 49.99,
        currency: 'USD',
        interval: 'year',
        monthlyEquivalent: 4.17,
        savings: '17% savings',
        recommended: true,
        features: [
          'Everything in Free',
          'Full price history charts (30, 90, 365 days)',
          'Faster alert notifications',
          'More active alerts',
          'Advanced filters (subsonic, +P, match-grade, low-recoil)',
          'AI-assisted search explanations'
        ]
      }
    ]

    res.json(plans)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch plans' })
  }
})

// Dealer plans endpoint
router.get('/dealer/plans', async (req: Request, res: Response) => {
  try {
    const dealerPlans = [
      {
        id: process.env.STRIPE_PRICE_ID_DEALER_STANDARD_MONTHLY || 'price_dealer_standard',
        name: 'Standard',
        tier: 'STANDARD',
        price: 99,
        currency: 'USD',
        interval: 'month',
        features: [
          'Product listing inclusion on IronScout.ai',
          'Dealer feed ingestion and SKU matching',
          'Market price benchmarks by caliber',
          'Basic pricing insights',
          'Email alerts for market changes',
          'Monthly performance reports',
          'Email support'
        ]
      },
      {
        id: process.env.STRIPE_PRICE_ID_DEALER_PRO_MONTHLY || 'price_dealer_pro',
        name: 'Pro',
        tier: 'PRO',
        price: 299,
        currency: 'USD',
        interval: 'month',
        popular: true,
        features: [
          'Everything in Standard',
          'More frequent price monitoring',
          'SKU-level price comparisons',
          'Expanded market benchmarks',
          'Actionable pricing insights and alerts',
          'Historical pricing context',
          'API access for inventory synchronization',
          'Phone and email support'
        ]
      }
    ]

    res.json(dealerPlans)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dealer plans' })
  }
})

export { router as paymentsRouter }
