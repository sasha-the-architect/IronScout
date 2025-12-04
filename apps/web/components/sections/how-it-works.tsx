import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Search, Bell, ShoppingCart } from 'lucide-react'

const steps = [
  {
    icon: Search,
    title: 'Search & Compare',
    description: 'Search for ammunition, optics, or tactical gear. View detailed specs, pricing across vendors, and side-by-side comparisons.',
    step: '01',
  },
  {
    icon: Bell,
    title: 'Track & Monitor',
    description: 'Set price alerts for specific products. Our platform monitors pricing trends and notifies you when deals become available.',
    step: '02',
  },
  {
    icon: ShoppingCart,
    title: 'Buy with Confidence',
    description: 'Make informed decisions with complete product data and pricing history. Purchase from trusted vendors at the best price.',
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
            Finding the right gear has never been easier. Follow these simple steps
            to make confident, informed purchasing decisions.
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
