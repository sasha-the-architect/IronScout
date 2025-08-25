import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, Crown, Zap } from 'lucide-react'

const plans = [
  {
    name: 'Standard',
    price: 99,
    description: 'Perfect for small to medium retailers',
    features: [
      'Product listing inclusion',
      'Basic analytics dashboard',
      'Email support',
      'Standard search visibility',
      'Monthly performance reports'
    ],
    cta: 'Get Started',
    popular: false,
    icon: Zap
  },
  {
    name: 'Premium',
    price: 299,
    description: 'Enhanced visibility and priority placement',
    features: [
      'Everything in Standard',
      'Priority search placement',
      'Premium badge on listings',
      'Real-time price monitoring',
      'Advanced analytics & insights',
      'Phone & email support',
      'Custom promotional campaigns',
      'API access for inventory sync'
    ],
    cta: 'Upgrade to Premium',
    popular: true,
    icon: Crown
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    description: 'For large retailers and brands',
    features: [
      'Everything in Premium',
      'Dedicated account manager',
      'Custom integration support',
      'White-label solutions',
      'Advanced brand protection',
      'Custom reporting & analytics',
      'Priority technical support',
      'Volume discounts available'
    ],
    cta: 'Contact Sales',
    popular: false,
    icon: Crown
  }
]

export function DealerPlans() {
  return (
    <section className="py-20 lg:py-32 bg-secondary/20">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
            Choose Your Partnership Level
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Select the plan that best fits your business needs and growth goals.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
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
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <plan.icon className="h-8 w-8 text-primary" />
                </div>
                <CardTitle className="text-xl">{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
                <div className="mt-4">
                  <span className="text-3xl font-bold">
                    {typeof plan.price === 'string' ? plan.price : `$${plan.price}`}
                  </span>
                  {typeof plan.price === 'number' && <span className="text-muted-foreground">/month</span>}
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
      </div>
    </section>
  )
}
