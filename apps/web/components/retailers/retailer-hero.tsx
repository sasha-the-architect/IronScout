import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { TrendingUp, Users, Zap } from 'lucide-react'

const RETAILER_REGISTER_URL = `${process.env.NEXT_PUBLIC_MERCHANT_URL || 'https://merchant.ironscout.ai'}/register`

export function RetailerHero() {
  return (
    <section className="py-20 lg:py-32 bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
            Reach Qualified Buyers
            <span className="text-primary block">Drive More Sales</span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Join ammunition and tactical gear retailers using IronScout to connect with serious enthusiasts
            ready to buy. Get your inventory in front of customers actively searching for your products.
          </p>

          <div className="flex flex-wrap justify-center gap-8 mb-12">
            <div className="flex items-center space-x-2">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <div className="text-left">
                <p className="font-semibold">500K+</p>
                <p className="text-sm text-muted-foreground">Active Users</p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-primary" />
              </div>
              <div className="text-left">
                <p className="font-semibold">25%</p>
                <p className="text-sm text-muted-foreground">Avg. Sales Increase</p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                <Zap className="h-6 w-6 text-primary" />
              </div>
              <div className="text-left">
                <p className="font-semibold">Real-time</p>
                <p className="text-sm text-muted-foreground">Price Monitoring</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" asChild>
              <Link href={RETAILER_REGISTER_URL}>
                Get Started Today
              </Link>
            </Button>
            <Button variant="outline" size="lg">
              Schedule Demo
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
