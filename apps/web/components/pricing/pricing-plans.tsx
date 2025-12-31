'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Check, X, BarChart3, Bell, Search, Brain, Star } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { createCheckoutSession } from '@/lib/api'
import { createLogger } from '@/lib/logger'

const logger = createLogger('pricing-plans')

// Pricing configuration
const PRICING = {
  PREMIUM_MONTHLY: 7.99,
  PREMIUM_ANNUAL: 69.99,
  PREMIUM_ANNUAL_MONTHLY: 5.83,
  SAVINGS_PERCENT: 27,
}

// Feature comparison data
const featureComparison = [
  {
    name: 'Intent-aware search',
    free: true,
    premium: true,
  },
  {
    name: 'Canonical product matching',
    free: true,
    premium: true,
  },
  {
    name: 'Current best prices',
    free: true,
    premium: true,
  },
  {
    name: 'Historical price charts',
    free: 'Limited',
    premium: 'Full',
  },
  {
    name: 'Advanced filters',
    free: false,
    premium: true,
  },
  {
    name: 'Product-level alerts',
    free: 'Limited',
    premium: true,
  },
  {
    name: 'Alert speed',
    free: 'Delayed',
    premium: 'Faster',
  },
  {
    name: 'AI-assisted explanations',
    free: false,
    premium: true,
  },
  {
    name: 'Watchlist limits',
    free: 'Limited',
    premium: 'Expanded',
  },
]

// Premium feature sections
const premiumFeatures = [
  {
    icon: BarChart3,
    title: 'Full Price History & Market Context',
    items: [
      '30, 90, and 365-day price history charts',
      'See how current prices compare to recent averages',
      'Identify periods of relative price strength or weakness',
    ],
  },
  {
    icon: Bell,
    title: 'Faster, More Flexible Alerts',
    items: [
      'Product-level alerts (not just caliber-level)',
      'Faster notifications when prices or stock change',
      'More alert conditions and tracking limits',
    ],
  },
  {
    icon: Search,
    title: 'Advanced Search & Ranking',
    items: [
      'More filters (bullet type, use case, performance attributes)',
      'Refined ranking informed by price, availability, and recent trends',
      'Cleaner results for equivalent products across retailers',
    ],
  },
  {
    icon: Brain,
    title: 'AI-Assisted Explanations',
    items: [
      'Optional explanations for why certain deals stand out',
      'Clear context without hiding the data',
      'AI assists discovery and ranking — decisions remain yours',
    ],
  },
  {
    icon: Star,
    title: 'Expanded Watchlists',
    items: [
      'Track more products',
      'See recent price movement at a glance',
      'Stay aware without constantly checking back',
    ],
  },
]

// Who Premium is for
const premiumAudience = [
  'Buy ammo regularly and care about timing',
  'Want to understand price trends, not just spot deals',
  'Track specific calibers or products over time',
  'Prefer insight and context over constant manual checking',
]

export function PricingPlans() {
  const { data: session } = useSession()
  const router = useRouter()
  const [isAnnual, setIsAnnual] = useState(true)
  const [loading, setLoading] = useState<string | null>(null)

  const handleUpgrade = async () => {
    setLoading('premium')

    try {
      if (!session?.user?.id) {
        router.push('/auth/signin?callbackUrl=/pricing')
        return
      }

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
    } catch (error) {
      logger.error('Failed to process upgrade', {}, error)
      alert('Failed to process your request. Please try again.')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-16">
      {/* Why Upgrade Section */}
      <div className="max-w-2xl mx-auto text-center">
        <h2 className="text-2xl font-bold mb-4">Why Upgrade to Premium?</h2>
        <p className="text-lg text-muted-foreground mb-2">
          Free shows you what's available.
        </p>
        <p className="text-lg font-medium text-foreground mb-4">
          Premium helps you understand <em>when</em> a price stands out.
        </p>
        <p className="text-muted-foreground">
          With Premium, you spend less time guessing and more time acting when prices look favorable.
        </p>
      </div>

      {/* Premium Features */}
      <div>
        <h2 className="text-2xl font-bold text-center mb-10">What Premium Unlocks</h2>
        <div className="max-w-4xl mx-auto space-y-8">
          {premiumFeatures.map((feature, index) => (
            <div key={index} className="bg-slate-50 dark:bg-gray-800/50 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                  <feature.icon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold mb-3">{feature.title}</h3>
                  <ul className="space-y-2">
                    {feature.items.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-muted-foreground">
                        <Check className="h-4 w-4 text-green-500 mt-1 flex-shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Feature Comparison Table */}
      <div>
        <h2 className="text-2xl font-bold text-center mb-8">Free vs Premium</h2>
        <div className="max-w-2xl mx-auto overflow-hidden rounded-xl border">
          <div className="grid grid-cols-3 bg-gray-50 dark:bg-gray-800/50 border-b">
            <div className="p-4 font-medium">Feature</div>
            <div className="p-4 font-medium text-center">Free</div>
            <div className="p-4 font-medium text-center bg-blue-50 dark:bg-blue-900/20">Premium</div>
          </div>

          {featureComparison.map((feature, index) => (
            <div
              key={index}
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
      </div>

      {/* Pricing Cards */}
      <div>
        <h2 className="text-2xl font-bold text-center mb-8">Pricing</h2>

        {/* Billing Toggle */}
        <div className="flex items-center justify-center gap-4 mb-8">
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
              Save ~{PRICING.SAVINGS_PERCENT}%
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
          {/* Monthly */}
          <Card className={`text-center ${!isAnnual ? 'border-2 border-blue-500' : ''}`}>
            <CardHeader>
              <CardTitle>Premium Monthly</CardTitle>
              <div className="mt-4">
                <span className="text-4xl font-bold">${PRICING.PREMIUM_MONTHLY}</span>
                <span className="text-muted-foreground"> / month</span>
              </div>
            </CardHeader>
            <CardFooter>
              <Button
                className="w-full"
                variant={!isAnnual ? 'default' : 'outline'}
                onClick={() => { setIsAnnual(false); handleUpgrade(); }}
                disabled={loading === 'premium'}
              >
                {loading === 'premium' && !isAnnual ? 'Processing...' : 'Get Monthly'}
              </Button>
            </CardFooter>
          </Card>

          {/* Annual */}
          <Card className={`text-center ${isAnnual ? 'border-2 border-blue-500' : ''}`}>
            <CardHeader>
              <CardTitle>Premium Annual</CardTitle>
              <div className="mt-4">
                <span className="text-4xl font-bold">${PRICING.PREMIUM_ANNUAL}</span>
                <span className="text-muted-foreground"> / year</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                ~${PRICING.PREMIUM_ANNUAL_MONTHLY}/mo
              </p>
            </CardHeader>
            <CardFooter>
              <Button
                className="w-full"
                variant={isAnnual ? 'default' : 'outline'}
                onClick={() => { setIsAnnual(true); handleUpgrade(); }}
                disabled={loading === 'premium'}
              >
                {loading === 'premium' && isAnnual ? 'Processing...' : 'Get Annual'}
              </Button>
            </CardFooter>
          </Card>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-4">
          Upgrade or cancel anytime.
        </p>
      </div>

      {/* Who Premium Is For */}
      <div className="max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-6">Who Premium Is For</h2>
        <p className="text-center text-muted-foreground mb-6">Premium is ideal if you:</p>
        <div className="space-y-3">
          {premiumAudience.map((item, index) => (
            <div key={index} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-gray-800/50">
              <Check className="h-5 w-5 text-blue-500 flex-shrink-0" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>

      {/* What Premium Does NOT Promise */}
      <div className="max-w-2xl mx-auto text-center bg-amber-50 dark:bg-amber-900/20 rounded-xl p-6 border border-amber-200 dark:border-amber-800">
        <h3 className="text-lg font-semibold mb-3">What Premium Does <em>Not</em> Promise</h3>
        <p className="text-muted-foreground mb-2">
          Premium provides market context and signals.
        </p>
        <p className="text-muted-foreground mb-4">
          It does <strong>not</strong> guarantee the lowest price, future price movements, or savings on every purchase.
        </p>
        <p className="text-sm text-muted-foreground">
          That transparency is intentional.
        </p>
      </div>

      {/* Bottom CTA */}
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-4">Ready to Go Deeper?</h2>
        <p className="text-muted-foreground mb-6">
          Upgrade to IronScout Premium and unlock deeper insight into the ammo market.
        </p>
        <Button
          size="lg"
          onClick={handleUpgrade}
          disabled={loading === 'premium'}
        >
          {loading === 'premium' ? 'Processing...' : 'Upgrade to Premium'}
        </Button>
      </div>

      {/* Questions */}
      <div className="max-w-xl mx-auto text-center">
        <h3 className="text-lg font-semibold mb-2">Questions?</h3>
        <p className="text-muted-foreground">
          Premium is designed to be useful on day one.
          If you're unsure, start free and upgrade when the added context feels valuable.
        </p>
      </div>
    </div>
  )
}
