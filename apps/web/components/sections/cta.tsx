import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight, Sparkles } from 'lucide-react'

export function CTA() {
  return (
    <section className="py-20 lg:py-32 bg-primary text-primary-foreground">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex justify-center mb-6">
            <div className="flex items-center space-x-2 bg-primary-foreground/10 rounded-full px-4 py-2">
              <Sparkles className="h-4 w-4" />
              <span className="text-sm font-medium">Limited Time Offer</span>
            </div>
          </div>
          
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6">
            Ready to Start Saving?
          </h2>
          
          <p className="text-lg md:text-xl opacity-90 mb-8 max-w-2xl mx-auto">
            Join thousands of smart shoppers who save an average of $200 per month 
            with ZeroedIn's AI-powered deal discovery.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" variant="secondary" asChild>
              <Link href="/pricing" className="flex items-center">
                Start Free Trial
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/search?q=deals" className="border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/10">
                Browse Deals
              </Link>
            </Button>
          </div>

          <p className="text-sm opacity-75 mt-6">
            No credit card required • Cancel anytime • 30-day money-back guarantee
          </p>
        </div>
      </div>
    </section>
  )
}
