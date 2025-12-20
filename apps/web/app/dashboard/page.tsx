import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { TodaysBestMoves } from '@/components/dashboard/organisms/todays-best-moves'
import { DealsForYou } from '@/components/dashboard/organisms/deals-for-you'
import { MarketPulse } from '@/components/dashboard/organisms/market-pulse'
import { SavingsTracker } from '@/components/dashboard/organisms/savings-tracker'
import { WatchlistPreview } from '@/components/dashboard/organisms/watchlist-preview'

/**
 * Dashboard Page - Trading Terminal Style
 *
 * Layout follows the UI spec hierarchy:
 * 1. Today's Best Moves (Hero) - Full width
 * 2. Deals For You + Market Pulse - 8/4 column split
 * 3. Savings Tracker - Full width
 *
 * Mobile: Stacked vertically
 * Desktop: 12-column grid
 */
export default async function DashboardPage() {
  const session = await auth()

  if (!session) {
    redirect('/api/auth/signin')
  }

  const userTier = (session.user as any)?.tier || 'FREE'
  const isPremium = userTier === 'PREMIUM'

  return (
    <div className="p-4 lg:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Hero: Today's Best Moves */}
      <section>
        <TodaysBestMoves isPremium={isPremium} />
      </section>

      {/* Main Content: Deals + Market Pulse */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
        {/* Deals Feed - Primary Click Engine */}
        <div className="lg:col-span-8">
          <DealsForYou isPremium={isPremium} />
        </div>

        {/* Market Pulse - Context Panel */}
        <div className="lg:col-span-4">
          <MarketPulse isPremium={isPremium} />
        </div>
      </section>

      {/* Savings Tracker */}
      <section>
        <SavingsTracker isPremium={isPremium} />
      </section>

      {/* Watchlist Preview */}
      <section>
        <WatchlistPreview isPremium={isPremium} />
      </section>
    </div>
  )
}
