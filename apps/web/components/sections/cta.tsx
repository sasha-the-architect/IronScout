import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight, Sparkles, MessageSquare } from 'lucide-react'

export function CTA() {
  return (
    <section className="py-20 lg:py-32 bg-gradient-to-br from-blue-600 via-purple-600 to-blue-700 text-white relative overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-white/5 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-white/5 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />
      
      <div className="container mx-auto px-4 relative">
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex justify-center mb-6">
            <div className="flex items-center space-x-2 bg-white/10 backdrop-blur rounded-full px-4 py-2 border border-white/20">
              <MessageSquare className="h-4 w-4" />
              <span className="text-sm font-medium">Try it now — no signup required</span>
            </div>
          </div>
          
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6">
            Stop Browsing. Start Finding.
          </h2>

          <p className="text-lg md:text-xl opacity-90 mb-8 max-w-2xl mx-auto">
            Just type what you need. Our AI handles the rest.
            No filters to figure out. No expertise required.
          </p>

          {/* Example search */}
          <div className="max-w-xl mx-auto mb-8">
            <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-4">
              <p className="text-white/80 text-sm mb-2">Try searching for:</p>
              <p className="text-xl font-medium italic">
                "affordable 5.56 for my first AR build"
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" asChild className="bg-white text-blue-600 hover:bg-gray-100">
              <Link href="/search" className="flex items-center">
                <Sparkles className="mr-2 h-4 w-4" />
                Try AI Search Free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="border-white/30 text-white hover:bg-white/10">
              <Link href="/pricing">
                View Pricing
              </Link>
            </Button>
          </div>

          <p className="text-sm opacity-75 mt-6">
            Free tier available • No credit card required • Unlimited searches
          </p>
        </div>
      </div>
    </section>
  )
}
