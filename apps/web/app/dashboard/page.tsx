'use client'

import { useDashboardState } from '@/hooks/use-dashboard-state'
import { StateBanner } from '@/components/dashboard/organisms/state-banner'
import { WatchlistPreviewV4 } from '@/components/dashboard/organisms/watchlist-preview-v4'
import { BestPrices } from '@/components/dashboard/organisms/best-prices'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'

/**
 * Dashboard Page - Dashboard v4
 *
 * State-driven dashboard per dashboard-product-spec.md:
 * 1. State Banner: Contextual message based on user state
 * 2. Watchlist Preview: Subset of watchlist items (hidden for BRAND_NEW)
 * 3. Best Prices: Non-personalized deals (always shown)
 *
 * States:
 * - BRAND_NEW: 0 items → Hero search module
 * - NEW: 1-4 items → Expansion prompt + caliber chips
 * - NEEDS_ALERTS: ≥5 items, missing alerts → Configure alerts prompt
 * - HEALTHY: ≥5 items, all alerts active → Reassurance
 * - RETURNING: Healthy + alerts delivered → Value reinforcement
 * - POWER_USER: ≥7 items + alerts → Compact status + inline actions
 *
 * @see dashboard-product-spec.md
 * @see ADR-012 Dashboard v3 (predecessor)
 */
export default function DashboardPage() {
  const { state, watchlistPreview, bestPrices, loading, error } = useDashboardState()

  if (loading) {
    return (
      <div className="p-4 lg:p-8 max-w-4xl mx-auto">
        <Card>
          <CardContent className="py-12">
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Loading dashboard...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error || !state) {
    return (
      <div className="p-4 lg:p-8 max-w-4xl mx-auto">
        <Card>
          <CardContent className="py-12">
            <p className="text-center text-destructive">
              {error || 'Failed to load dashboard'}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Determine max preview items based on state
  const maxPreviewItems = state.state === 'POWER_USER' ? 7 : 3

  // Footer text varies by state
  const getBestPricesFooter = () => {
    if (state.state === 'BRAND_NEW') {
      return 'Add items to your watchlist to catch price drops like these.'
    }
    return 'Deals like these are caught when items are in your watchlist.'
  }

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-4xl mx-auto">
      {/* State Banner (contextual per user state) */}
      <section>
        <StateBanner state={state.state} context={state} />
      </section>

      {/* Watchlist Preview (hidden for BRAND_NEW state) */}
      {state.state !== 'BRAND_NEW' && watchlistPreview.length > 0 && (
        <section>
          <WatchlistPreviewV4
            items={watchlistPreview}
            totalCount={state.watchlistCount}
            maxItems={maxPreviewItems}
            state={state.state}
          />
        </section>
      )}

      {/* Best Prices (always shown) */}
      <section>
        <BestPrices items={bestPrices} footerText={getBestPricesFooter()} />
      </section>

      {/* Additional footer for BRAND_NEW */}
      {state.state === 'BRAND_NEW' && (
        <p className="text-xs text-center text-muted-foreground/70">
          Prices verified across major retailers. Updated continuously.
        </p>
      )}
    </div>
  )
}
