import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Zap, Bell, Target, TrendingUp, Shield, Clock } from 'lucide-react'

const features = [
  {
    icon: Zap,
    title: 'AI-Powered Search',
    description: 'Our advanced AI understands your preferences and finds the best deals across millions of products.',
  },
  {
    icon: Bell,
    title: 'Real-time Alerts',
    description: 'Get instant notifications when prices drop on products you\'re watching.',
  },
  {
    icon: Target,
    title: 'Smart Price Tracking',
    description: 'Set target prices and let us monitor the market for you 24/7.',
  },
  {
    icon: TrendingUp,
    title: 'Price History',
    description: 'View detailed price trends to make informed purchasing decisions.',
  },
  {
    icon: Shield,
    title: 'Verified Retailers',
    description: 'Shop with confidence from our network of trusted retail partners.',
  },
  {
    icon: Clock,
    title: 'Early Access',
    description: 'Premium members get early access to deals before they go public.',
  },
]

export function Features() {
  return (
    <section className="py-20 lg:py-32">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
            Why Choose ZeroedIn?
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            We combine cutting-edge AI technology with comprehensive market data to give you 
            the ultimate shopping advantage.
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
