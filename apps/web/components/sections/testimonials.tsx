import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Check, ArrowRight } from 'lucide-react'

const freeTier = [
  'Full intent-aware ammo search',
  'Current best prices',
  'Limited price history',
  'Basic alerts',
]

const premiumTier = [
  'Full historical price charts',
  'Faster and more flexible alerts',
  'Advanced filters and ranking',
  'AI-assisted explanations for why deals stand out',
]

export function Testimonials() {
  return (
    <section className="py-20 lg:py-28 bg-slate-50 dark:bg-gray-900/50">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold mb-6 text-center">
            Free vs Premium
          </h2>

          <div className="text-center mb-12">
            <p className="text-lg text-foreground mb-2">
              <strong>Free helps you find deals.</strong>
            </p>
            <p className="text-lg text-foreground">
              <strong>Premium gives you more context, faster signals, and fewer missed opportunities.</strong>
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-10">
            {/* Free Tier */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
              <h3 className="text-xl font-bold mb-4">Free</h3>
              <ul className="space-y-3">
                {freeTier.map((item, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Premium Tier */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border-2 border-blue-500">
              <h3 className="text-xl font-bold mb-4">Premium</h3>
              <ul className="space-y-3">
                {premiumTier.map((item, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
                    <span className="text-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="text-center text-muted-foreground mb-8">
            Premium adds depth and speed — not guarantees.
          </p>

          <div className="text-center">
            <Button asChild>
              <Link href="/pricing">
                See Premium Features
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
