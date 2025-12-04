import Script from 'next/script'
import { Hero } from '@/components/sections/hero'
import { Features } from '@/components/sections/features'
import { HowItWorks } from '@/components/sections/how-it-works'
import { Testimonials } from '@/components/sections/testimonials'
import { CTA } from '@/components/sections/cta'

export default function HomePage() {
  return (
    <>
      {/* AvantLink Affiliate Verification */}
      <Script
        src="https://classic.avantlink.com/affiliate_app_confirm.php?mode=js&authResponse=83b35735960abca5c62924f3fbe01e4e919343a3"
        strategy="afterInteractive"
      />

      <div className="flex flex-col">
        <Hero />
        <Features />
        <HowItWorks />
        <Testimonials />
        <CTA />
      </div>
    </>
  )
}
