import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Search, Bell, ShoppingCart } from 'lucide-react'

const steps = [
  {
    icon: Search,
    title: 'Search & Discover',
    description: 'Search for any product or browse our curated deals. Our AI learns your preferences over time.',
    step: '01',
  },
  {
    icon: Bell,
    title: 'Set Alerts',
    description: 'Create price alerts for products you want. We\'ll monitor prices across all major retailers.',
    step: '02',
  },
  {
    icon: ShoppingCart,
    title: 'Buy at Best Price',
    description: 'Get notified when prices drop to your target. Purchase directly from verified retailers.',
    step: '03',
  },
]

export function HowItWorks() {
  return (
    <section className="py-20 lg:py-32 bg-secondary/20">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
            How It Works
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Getting the best deals has never been easier. Follow these simple steps 
            to start saving money today.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {/* Connection Lines - Hidden on mobile */}
          <div className="hidden md:block absolute top-24 left-1/4 right-1/4 h-0.5 bg-border"></div>
          
          {steps.map((step, index) => (
            <div key={index} className="relative">
              <Card className="text-center border-0 shadow-lg">
                <CardHeader>
                  <div className="relative mx-auto mb-4">
                    <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto">
                      <step.icon className="h-8 w-8 text-primary-foreground" />
                    </div>
                    <div className="absolute -top-2 -right-2 w-8 h-8 bg-secondary rounded-full flex items-center justify-center text-sm font-bold">
                      {step.step}
                    </div>
                  </div>
                  <CardTitle className="text-xl">{step.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">
                    {step.description}
                  </CardDescription>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
