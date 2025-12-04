import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Zap, Bell, Target, TrendingUp, Shield, Clock } from 'lucide-react'

const features = [
  {
    icon: Target,
    title: 'Detailed Product Specs',
    description: 'Access comprehensive specifications for ammunition, optics, and tactical gear. Compare calibers, grain weights, ballistic data, and more.',
  },
  {
    icon: TrendingUp,
    title: 'Real Pricing Data',
    description: 'Track pricing trends across multiple vendors. See historical prices and identify the best time to buy.',
  },
  {
    icon: Zap,
    title: 'Intelligent Recommendations',
    description: 'Get AI-powered suggestions based on your needs. Find the right gear for your specific use case—target shooting, hunting, or tactical applications.',
  },
  {
    icon: Bell,
    title: 'Price Drop Alerts',
    description: 'Set alerts for specific products and get notified instantly when prices drop to your target.',
  },
  {
    icon: Shield,
    title: 'Guided Comparisons',
    description: 'Compare products side-by-side with detailed breakdowns of specs, pricing, and performance characteristics.',
  },
  {
    icon: Clock,
    title: 'Always Up to Date',
    description: 'Our platform continuously monitors inventory and pricing across vendors so you never miss in-stock notifications.',
  },
]

export function Features() {
  return (
    <section className="py-20 lg:py-32">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
            Why Choose IronScout?
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            We combine real pricing data, product insights, and intelligent recommendations
            to make gear selection faster and more informed.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <Card key={index} className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-xl">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
