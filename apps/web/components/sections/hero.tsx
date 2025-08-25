import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, Zap, Target, Bell } from 'lucide-react'

export function Hero() {
  return (
    <section className="relative py-20 lg:py-32 bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex justify-center mb-6">
            <div className="flex items-center space-x-2 bg-primary/10 rounded-full px-4 py-2">
              <Zap className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">AI-Powered Shopping Assistant</span>
            </div>
          </div>
          
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
            Find the Best Deals
            <span className="text-primary block">Before Everyone Else</span>
          </h1>
          
          <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            ZeroedIn uses AI to monitor millions of products across thousands of retailers, 
            alerting you to price drops and deals before they go mainstream.
          </p>

          {/* Hero Search */}
          <div className="max-w-2xl mx-auto mb-8">
            <form className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search for any product..."
                  className="pl-10 pr-4 h-12 text-base"
                />
              </div>
              <Button size="lg" className="h-12 px-8">
                Search Deals
              </Button>
            </form>
          </div>

          {/* Feature Pills */}
          <div className="flex flex-wrap justify-center gap-4 mb-12">
            <div className="flex items-center space-x-2 bg-background border rounded-full px-4 py-2">
              <Target className="h-4 w-4 text-primary" />
              <span className="text-sm">Smart Price Tracking</span>
            </div>
            <div className="flex items-center space-x-2 bg-background border rounded-full px-4 py-2">
              <Bell className="h-4 w-4 text-primary" />
              <span className="text-sm">Real-time Alerts</span>
            </div>
            <div className="flex items-center space-x-2 bg-background border rounded-full px-4 py-2">
              <Zap className="h-4 w-4 text-primary" />
              <span className="text-sm">AI Recommendations</span>
            </div>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" asChild>
              <Link href="/pricing">Start Free Trial</Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href="/search?q=electronics">Browse Deals</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
