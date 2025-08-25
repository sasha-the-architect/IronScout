import { PricingPlans } from '@/components/pricing/pricing-plans'
import { PricingFAQ } from '@/components/pricing/pricing-faq'
import { PricingHeader } from '@/components/pricing/pricing-header'

export default function PricingPage() {
  return (
    <div className="container mx-auto px-4 py-12">
      <PricingHeader />
      <PricingPlans />
      <PricingFAQ />
    </div>
  )
}
