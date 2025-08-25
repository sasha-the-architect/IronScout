import { Router } from 'express'
import { z } from 'zod'
import Stripe from 'stripe'

const router = Router()

const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
  : null

const createCheckoutSchema = z.object({
  priceId: z.string(),
  userId: z.string(),
  successUrl: z.string(),
  cancelUrl: z.string()
})

const webhookSchema = z.object({
  type: z.string(),
  data: z.any()
})

router.post('/create-checkout', async (req, res) => {
  try {
    const { priceId, userId, successUrl, cancelUrl } = createCheckoutSchema.parse(req.body)
    
    if (!stripe) {
      return res.json({
        url: `${successUrl}?session_id=mock_session_${Date.now()}`,
        sessionId: `mock_session_${Date.now()}`
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
    })

    res.json({
      url: session.url,
      sessionId: session.id
    })
  } catch (error) {
    console.error('Checkout creation error:', error)
    res.status(500).json({ error: 'Failed to create checkout session' })
  }
})

router.post('/webhook', async (req, res) => {
  try {
    const sig = req.headers['stripe-signature'] as string
    
    if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
      console.log('Mock webhook received:', req.body)
      return res.json({ received: true })
    }

    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    )

    switch (event.type) {
      case 'checkout.session.completed':
        console.log('Payment successful:', event.data.object)
        break
      case 'customer.subscription.deleted':
        console.log('Subscription cancelled:', event.data.object)
        break
      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    res.json({ received: true })
  } catch (error) {
    console.error('Webhook error:', error)
    res.status(400).json({ error: 'Webhook signature verification failed' })
  }
})

router.get('/plans', async (req, res) => {
  try {
    const mockPlans = [
      {
        id: 'price_free',
        name: 'Free',
        price: 0,
        currency: 'USD',
        interval: 'month',
        features: [
          'Basic product alerts (delayed)',
          'Limited search results',
          'Standard support'
        ]
      },
      {
        id: 'price_premium',
        name: 'Premium',
        price: 9.99,
        currency: 'USD',
        interval: 'month',
        features: [
          'Real-time alerts',
          'Unlimited search results',
          'Priority support',
          'Advanced filtering',
          'Price history charts'
        ]
      }
    ]

    res.json(mockPlans)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch plans' })
  }
})

export { router as paymentsRouter }
