import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight, Phone } from 'lucide-react'

const RETAILER_REGISTER_URL = `${process.env.NEXT_PUBLIC_MERCHANT_URL || 'https://merchant.ironscout.ai'}/register`

export function RetailerCTA() {
  return (
    <section className="py-20 lg:py-32 bg-primary text-primary-foreground">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6">
            Ready to Boost Your Sales?
          </h2>

          <p className="text-lg md:text-xl opacity-90 mb-8 max-w-2xl mx-auto">
            Join thousands of successful retailers who have increased their revenue
            by partnering with IronScout.ai. Get started today and see results within weeks.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
            <Button size="lg" variant="secondary" asChild>
              <Link href={RETAILER_REGISTER_URL}>
                <ArrowRight className="mr-2 h-4 w-4" />
                Get Started Now
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/10">
              <Phone className="mr-2 h-4 w-4" />
              Schedule Demo
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
            <div className="text-center">
              <div className="text-2xl font-bold mb-2">24/7</div>
              <div className="text-sm opacity-75">Support Available</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold mb-2">30 Days</div>
              <div className="text-sm opacity-75">Money-Back Guarantee</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold mb-2">5 Min</div>
              <div className="text-sm opacity-75">Setup Time</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
