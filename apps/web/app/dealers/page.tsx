import { DealerHero } from '@/components/dealers/dealer-hero'
import { DealerBenefits } from '@/components/dealers/dealer-benefits'
import { DealerPlans } from '@/components/dealers/dealer-plans'
import { DealerCTA } from '@/components/dealers/dealer-cta'

export default function DealersPage() {
  return (
    <div className="flex flex-col">
      <DealerHero />
      <DealerBenefits />
      <DealerPlans />
      <DealerCTA />
    </div>
  )
}
