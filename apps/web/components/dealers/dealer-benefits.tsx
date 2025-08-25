import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Target, Zap, TrendingUp, Shield, Users, BarChart } from 'lucide-react'

const benefits = [
  {
    icon: Target,
    title: 'Targeted Exposure',
    description: 'Reach customers actively searching for your products with high purchase intent.'
  },
  {
    icon: Zap,
    title: 'Real-time Insights',
    description: 'Get instant notifications when competitors change prices or when demand spikes.'
  },
  {
    icon: TrendingUp,
    title: 'Increased Sales',
    description: 'Premium partners see an average 25% increase in sales within the first quarter.'
  },
  {
    icon: Shield,
    title: 'Brand Protection',
    description: 'Monitor unauthorized sellers and protect your brand reputation across the web.'
  },
  {
    icon: Users,
    title: 'Customer Analytics',
    description: 'Understand customer behavior and preferences with detailed analytics and reports.'
  },
  {
    icon: BarChart,
    title: 'Performance Tracking',
    description: 'Track ROI, conversion rates, and other key metrics through our dealer dashboard.'
  }
]

export function DealerBenefits() {
  return (
    <section className="py-20 lg:py-32">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
            Why Partner with ZeroedIn?
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Join our network of successful retailers and unlock new growth opportunities 
            with our AI-powered platform.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {benefits.map((benefit, index) => (
            <Card key={index} className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <benefit.icon className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-xl">{benefit.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  {benefit.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
