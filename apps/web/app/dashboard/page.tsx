import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { GoodDealHero } from '@/components/dashboard/organisms/good-deal-hero'
import { RecentChanges } from '@/components/dashboard/organisms/recent-changes'
import { HeadsUpNudge } from '@/components/dashboard/organisms/heads-up-nudge'
import { PremiumPrompt } from '@/components/dashboard/organisms/premium-prompt'

/**
 * Dashboard Page - Dashboard v3 (ADR-012)
 *
 * Action-oriented deal surface that:
 * 1. Surfaces at most one high-confidence deal recommendation at a time
 * 2. Treats the absence of a recommendation as a valid and expected state
 * 3. Shows only recent changes (not full saved items list)
 * 4. Integrates Saved Searches silently as signal inputs
 * 5. Uses plain, descriptive language
 * 6. Avoids scores, rankings, verdicts, charts
 *
 * Layout:
 * 1. Hero Section: "Good Deal Right Now" or No-Hero quiet state
 * 2. Recent Changes: Activity feed of price/availability changes (3-5 items max)
 * 3. Heads Up: Optional nudge for saved search signals
 * 4. Premium Prompt: Soft upgrade prompt (free users only)
 *
 * When no Hero AND no recent changes:
 * - Shows only system status ("Nothing urgent right now")
 * - No filler content
 *
 * Full Saved Items list lives on /dashboard/saved (the "Portfolio")
 *
 * @see ADR-012 Dashboard v3 Action-Oriented Deal Surface
 * @see context/06_ux_charter.md
 */
export default async function DashboardPage() {
  const session = await auth()

  if (!session) {
    redirect('/api/auth/signin')
  }

  const userTier = (session.user as any)?.tier || 'FREE'
  const isPremium = userTier === 'PREMIUM'

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-3xl mx-auto">
      {/* Zone A: Primary Attention Slot (Hero Deal OR System Status - mutually exclusive) */}
      <section>
        <GoodDealHero isPremium={isPremium} />
      </section>

      {/* Zone B: Recent Changes Activity Feed
          - Only shows items with recent price/availability changes
          - Disappears completely when nothing changed
          - Delta-only display (no full prices, charts, rankings)
          - Full saved items list lives on /dashboard/saved */}
      <section>
        <RecentChanges />
      </section>

      {/* Heads Up: Saved search signals as subtle nudge */}
      <section>
        <HeadsUpNudge />
      </section>

      {/* Premium Prompt: Soft upgrade prompt (bottom, free users only) */}
      <section>
        <PremiumPrompt isPremium={isPremium} />
      </section>
    </div>
  )
}
