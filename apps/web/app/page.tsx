import { Hero } from '@/components/sections/hero'
import { Features } from '@/components/sections/features'
import { HowItWorks } from '@/components/sections/how-it-works'
import { Testimonials } from '@/components/sections/testimonials'
import { CTA } from '@/components/sections/cta'

export default function HomePage() {
  return (
    <div className="flex flex-col">
      <Hero />
      <Features />
      <HowItWorks />
      <Testimonials />
      <CTA />
    </div>
  )
}
