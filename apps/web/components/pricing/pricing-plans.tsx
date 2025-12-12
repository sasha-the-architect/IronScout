'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Check, X, Sparkles, Zap, Target } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { createCheckoutSession } from '@/lib/api'

// Pricing configuration
const PRICING = {
  PREMIUM_MONTHLY: 4.99,
  PREMIUM_ANNUAL: 49.99,
  PREMIUM_ANNUAL_MONTHLY: 4.17,
  SAVINGS_PERCENT: 17,
}

// Feature comparison data
const featureComparison = [
  { 
    category: 'Search & Discovery',
    features: [
      { name: 'Search by caliber, brand, grain & more', free: true, premium: true },
      { name: 'Price-per-round breakdown', free: true, premium: true },
      { name: 'Purpose badges (range, defense, hunting)', free: true, premium: true },
      { name: '"What should I buy?" — Personalized AI picks', free: false, premium: true },
      { name: 'Performance filters (+P, subsonic, match-grade)', free: false, premium: true },
    ]
  },
  { 
    category: 'AI Intelligence',
    features: [
      { name: 'Basic AI search assistance', free: true, premium: true },
      { name: 'Deep purpose interpretation (gun + use case)', free: false, premium: true },
      { name: 'AI explanations — Understand why a round fits', free: false, premium: true },
      { name: 'Short-barrel & suppressor optimization', free: false, premium: true },
    ]
  },
  { 
    category: 'Pricing & Value',
    features: [
      { name: 'See current prices across dealers', free: true, premium: true },
      { name: 'Best Value scoring — The actual cheapest deal', free: false, premium: true },
      { name: 'Full price history charts', free: false, premium: true },
    ]
  },
  { 
    category: 'Alerts',
    features: [
      { name: 'Price drop alerts', free: 'Up to 3, delayed', premium: 'Unlimited, instant' },
      { name: 'Get notified before deals sell out', free: false, premium: true },
    ]
  },
]

// Plan card data
const plans = [
  {
    id: 'free',
    name: 'Free',
    tagline: 'Find Ammo Fast',
    description: 'Search, filter, and compare prices across hundreds of dealers.',
    monthlyPrice: 0,
    annualPrice: 0,
    highlights: [
      'Search by caliber, brand, grain & more',
      'Price-per-round breakdown',
      'Purpose badges (range, defense, hunting)',
      'Price alerts (up to 3, delayed)',
      'Basic AI search assistance',
    ],
    limitations: [],
    bestFor: 'Shooters who know exactly what they want and just need to find the best price.',
    cta: 'Get Started Free',
    popular: false,
  },
  {
    id: 'premium',
    name: 'Premium',
    tagline: 'Never Overpay Again',
    description: 'AI-powered recommendations that match your gun, your purpose, and your budget.',
    monthlyPrice: PRICING.PREMIUM_MONTHLY,
    annualPrice: PRICING.PREMIUM_ANNUAL,
    highlights: [
      'Everything in Free, plus:',
      '"What should I buy?" — Tell us your firearm & use case, get personalized picks',
      'Best Value scoring — Instantly see which deal is actually cheapest',
      'Price history charts — Know if now is a good time to buy',
      'Instant alerts — Get notified before deals sell out',
      'Unlimited alerts — Track as many calibers as you want',
      'Performance filters — Low-recoil, subsonic, +P, match-grade & more',
      'AI explanations — Understand why a round is right for you',
    ],
    limitations: [],
    bestFor: 'Home defense buyers, competitive shooters, and anyone who wants the best ammo without the research.',
    cta: 'Upgrade to Premium',
    popular: true,
  },
]

export function PricingPlans() {
  const { data: session } = useSession()
  const router = useRouter()
  const [isAnnual, setIsAnnual] = useState(true)
  const [loading, setLoading] = useState<string | null>(null)

  const handlePlanClick = async (planId: string) => {
    setLoading(planId)

    try {
      if (planId === 'free') {
        if (session) {
          router.push('/search')
        } else {
          router.push('/auth/signin')
        }
      } else if (planId === 'premium') {
        if (!session?.user?.id) {
          router.push('/auth/signin?callbackUrl=/pricing')
          return
        }

        // Select price based on billing period
        const priceId = isAnnual 
          ? (process.env.NEXT_PUBLIC_STRIPE_PRICE_PREMIUM_ANNUAL || 'price_premium_annual')
          : (process.env.NEXT_PUBLIC_STRIPE_PRICE_PREMIUM_MONTHLY || 'price_premium_monthly')

        const { url } = await createCheckoutSession({
          priceId,
          userId: session.user.id,
          successUrl: `${window.location.origin}/pricing/success?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${window.location.origin}/pricing`
        })

        window.location.href = url
      }
    } catch (error) {
      console.error('Failed to process plan selection:', error)
      alert('Failed to process your request. Please try again.')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-12">
      {/* Billing Toggle */}
      <div className="flex items-center justify-center gap-4">
        <span className={`text-sm font-medium ${!isAnnual ? 'text-foreground' : 'text-muted-foreground'}`}>
          Monthly
        </span>
        <Switch
          checked={isAnnual}
          onCheckedChange={setIsAnnual}
        />
        <span className={`text-sm font-medium ${isAnnual ? 'text-foreground' : 'text-muted-foreground'}`}>
          Annual
        </span>
        {isAnnual && (
          <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
            Save {PRICING.SAVINGS_PERCENT}%
          </Badge>
        )}
      </div>

      {/* Plan Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
        {plans.map((plan) => (
          <Card 
            key={plan.id} 
            className={`relative flex flex-col ${
              plan.popular 
                ? 'border-2 border-blue-500 shadow-xl shadow-blue-500/10' 
                : 'border'
            }`}
          >
            {plan.popular && (
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <Badge className="bg-gradient-to-r from-blue-600 to-purple-600 text-white flex items-center gap-1 px-3">
                  <Zap className="h-3 w-3" />
                  Most Popular
                </Badge>
              </div>
            )}

            <CardHeader className="text-center pb-2">
              <div className="flex items-center justify-center gap-2 mb-2">
                {plan.id === 'premium' ? (
                  <Sparkles className="h-5 w-5 text-blue-500" />
                ) : (
                  <Target className="h-5 w-5 text-gray-500" />
                )}
                <CardTitle className="text-2xl">{plan.name}</CardTitle>
              </div>
              <p className="text-sm font-medium text-muted-foreground">{plan.tagline}</p>
              
              <div className="mt-4">
                {plan.monthlyPrice === 0 ? (
                  <div>
                    <span className="text-4xl font-bold">$0</span>
                    <span className="text-muted-foreground">/month</span>
                  </div>
                ) : (
                  <div>
                    <span className="text-4xl font-bold">
                      ${isAnnual ? PRICING.PREMIUM_ANNUAL_MONTHLY.toFixed(2) : plan.monthlyPrice.toFixed(2)}
                    </span>
                    <span className="text-muted-foreground">/month</span>
                    {isAnnual && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Billed ${PRICING.PREMIUM_ANNUAL}/year
                      </p>
                    )}
                  </div>
                )}
              </div>
              
              <CardDescription className="mt-4">{plan.description}</CardDescription>
            </CardHeader>

            <CardContent className="flex-1 space-y-4">
              {/* Highlights */}
              <div className="space-y-2">
                {plan.highlights.map((feature, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">{feature}</span>
                  </div>
                ))}
              </div>

              {/* Best For */}
              <div className="pt-4 border-t">
                <p className="text-xs font-medium text-muted-foreground mb-1">Best for:</p>
                <p className="text-sm text-muted-foreground">{plan.bestFor}</p>
              </div>
            </CardContent>

            <CardFooter>
              <Button
                className={`w-full ${
                  plan.popular 
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700' 
                    : ''
                }`}
                variant={plan.popular ? 'default' : 'outline'}
                size="lg"
                onClick={() => handlePlanClick(plan.id)}
                disabled={loading === plan.id}
              >
                {loading === plan.id ? 'Processing...' : plan.cta}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      {/* Feature Comparison Table */}
      <div className="mt-16">
        <h2 className="text-2xl font-bold text-center mb-8">
          Full Feature Comparison
        </h2>
        
        <div className="max-w-4xl mx-auto overflow-hidden rounded-xl border">
          {/* Table Header */}
          <div className="grid grid-cols-3 bg-gray-50 dark:bg-gray-800/50 border-b">
            <div className="p-4 font-medium">Feature</div>
            <div className="p-4 font-medium text-center">Free</div>
            <div className="p-4 font-medium text-center bg-blue-50 dark:bg-blue-900/20">Premium</div>
          </div>
          
          {/* Feature Categories */}
          {featureComparison.map((category, catIndex) => (
            <div key={catIndex}>
              {/* Category Header */}
              <div className="grid grid-cols-3 bg-gray-100/50 dark:bg-gray-800/30 border-b">
                <div className="col-span-3 p-3 font-semibold text-sm text-muted-foreground">
                  {category.category}
                </div>
              </div>
              
              {/* Features */}
              {category.features.map((feature, featIndex) => (
                <div 
                  key={featIndex} 
                  className="grid grid-cols-3 border-b last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
                >
                  <div className="p-3 text-sm">{feature.name}</div>
                  <div className="p-3 text-center">
                    {typeof feature.free === 'boolean' ? (
                      feature.free ? (
                        <Check className="h-5 w-5 text-green-500 mx-auto" />
                      ) : (
                        <X className="h-5 w-5 text-gray-300 mx-auto" />
                      )
                    ) : (
                      <span className="text-sm text-muted-foreground">{feature.free}</span>
                    )}
                  </div>
                  <div className="p-3 text-center bg-blue-50/50 dark:bg-blue-900/10">
                    {typeof feature.premium === 'boolean' ? (
                      feature.premium ? (
                        <Check className="h-5 w-5 text-green-500 mx-auto" />
                      ) : (
                        <X className="h-5 w-5 text-gray-300 mx-auto" />
                      )
                    ) : (
                      <span className="text-sm font-medium text-blue-600 dark:text-blue-400">{feature.premium}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="text-center pt-8 pb-4">
        <p className="text-muted-foreground mb-4">
          Stop guessing. Start knowing. Upgrade to Premium for AI-powered ammo decisions.
        </p>
        <Button 
          size="lg"
          className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
          onClick={() => handlePlanClick('premium')}
          disabled={loading === 'premium'}
        >
          <Sparkles className="h-4 w-4 mr-2" />
          {loading === 'premium' ? 'Processing...' : 'Upgrade to Premium'}
        </Button>
      </div>
    </div>
  )
}
