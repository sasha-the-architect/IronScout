'use client'

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, Zap } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createCheckoutSession } from '@/lib/api'

const plans = [
  {
    name: 'Free',
    price: 0,
    description: 'Perfect for getting started',
    features: [
      'Basic gear search',
      'Product specifications',
      'Price alerts (delayed)',
      'Up to 5 active alerts',
      'Email notifications',
      'Standard support'
    ],
    limitations: [
      'Alerts delayed by 1 hour',
      'Limited search results',
      'No pricing history'
    ],
    cta: 'Get Started',
    popular: false
  },
  {
    name: 'Premium',
    price: 9.99,
    description: 'For serious enthusiasts',
    features: [
      'Advanced AI-powered search',
      'Detailed ballistic & spec data',
      'Real-time price alerts',
      'Unlimited active alerts',
      'SMS & email notifications',
      'Complete pricing history & trends',
      'Side-by-side comparisons',
      'Priority support',
      'Advanced filtering by caliber, grain, etc.'
    ],
    limitations: [],
    cta: 'Start Free Trial',
    popular: true
  },
  {
    name: 'Pro',
    price: 19.99,
    description: 'For professionals and dealers',
    features: [
      'Everything in Premium',
      'API access (coming soon)',
      'Bulk alert management',
      'Custom notifications',
      'Dedicated account manager',
      'Advanced analytics',
      'Dealer integrations'
    ],
    limitations: [],
    cta: 'Contact Sales',
    popular: false
  }
]

export function PricingPlans() {
  const { data: session } = useSession()
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)

  const handlePlanClick = async (planName: string) => {
    setLoading(planName)

    try {
      if (planName === 'Free') {
        // Redirect to sign up for free
        router.push('/auth/signin')
      } else if (planName === 'Premium') {
        // Check if user is logged in
        if (!session?.user?.id) {
          router.push('/auth/signin?callbackUrl=/pricing')
          return
        }

        // Get the premium price ID from environment or config
        const priceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_PREMIUM || 'price_1SYqXaEQ9YMrnA2rw30toMOt'

        // Create checkout session
        const { url } = await createCheckoutSession({
          priceId,
          userId: session.user.id,
          successUrl: `${window.location.origin}/pricing/success?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${window.location.origin}/pricing`
        })

        // Redirect to Stripe checkout
        window.location.href = url
      } else if (planName === 'Pro') {
        // Redirect to contact page
        router.push('/contact')
      }
    } catch (error) {
      console.error('Failed to process plan selection:', error)
      alert('Failed to process your request. Please try again.')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
      {plans.map((plan, index) => (
        <Card key={index} className={`relative ${plan.popular ? 'border-primary shadow-lg scale-105' : ''}`}>
          {plan.popular && (
            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
              <Badge className="bg-primary text-primary-foreground flex items-center gap-1">
                <Zap className="h-3 w-3" />
                Most Popular
              </Badge>
            </div>
          )}
          
          <CardHeader className="text-center">
            <CardTitle className="text-xl">{plan.name}</CardTitle>
            <CardDescription>{plan.description}</CardDescription>
            <div className="mt-4">
              <span className="text-3xl font-bold">${plan.price}</span>
              <span className="text-muted-foreground">/month</span>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="space-y-2">
              {plan.features.map((feature, featureIndex) => (
                <div key={featureIndex} className="flex items-center space-x-2">
                  <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                  <span className="text-sm">{feature}</span>
                </div>
              ))}
            </div>
            
            {plan.limitations.length > 0 && (
              <div className="pt-4 border-t">
                <p className="text-xs text-muted-foreground mb-2">Limitations:</p>
                <div className="space-y-1">
                  {plan.limitations.map((limitation, limitIndex) => (
                    <p key={limitIndex} className="text-xs text-muted-foreground">
                      • {limitation}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </CardContent>

          <CardFooter>
            <Button
              className="w-full"
              variant={plan.popular ? "default" : "outline"}
              onClick={() => handlePlanClick(plan.name)}
              disabled={loading === plan.name}
            >
              {loading === plan.name ? 'Processing...' : plan.cta}
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}
