import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, Zap } from 'lucide-react'

const plans = [
  {
    name: 'Free',
    price: 0,
    description: 'Perfect for casual shoppers',
    features: [
      'Basic product search',
      'Price alerts (delayed)',
      'Up to 5 active alerts',
      'Email notifications',
      'Standard support'
    ],
    limitations: [
      'Alerts delayed by 1 hour',
      'Limited search results',
      'No price history'
    ],
    cta: 'Get Started',
    popular: false
  },
  {
    name: 'Premium',
    price: 9.99,
    description: 'For serious deal hunters',
    features: [
      'Advanced AI-powered search',
      'Real-time price alerts',
      'Unlimited active alerts',
      'SMS & email notifications',
      'Price history & trends',
      'Priority support',
      'Early access to deals',
      'Advanced filtering'
    ],
    limitations: [],
    cta: 'Start Free Trial',
    popular: true
  },
  {
    name: 'Pro',
    price: 19.99,
    description: 'For power users and businesses',
    features: [
      'Everything in Premium',
      'API access (coming soon)',
      'Bulk alert management',
      'Custom notifications',
      'Dedicated account manager',
      'Advanced analytics',
      'White-label options'
    ],
    limitations: [],
    cta: 'Contact Sales',
    popular: false
  }
]

export function PricingPlans() {
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
            >
              {plan.cta}
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}
