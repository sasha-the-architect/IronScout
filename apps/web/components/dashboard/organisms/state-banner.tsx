'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Search,
  Bell,
  CheckCircle2,
  Plus,
  ChevronRight,
} from 'lucide-react'
import Link from 'next/link'

/**
 * Dashboard state types - matches backend DashboardState
 */
export type DashboardState =
  | 'BRAND_NEW'
  | 'NEW'
  | 'NEEDS_ALERTS'
  | 'HEALTHY'
  | 'RETURNING'
  | 'POWER_USER'

export interface DashboardStateContext {
  state: DashboardState
  watchlistCount: number
  alertsConfigured: number
  alertsMissing: number
  priceDropsThisWeek: number
}

interface StateBannerProps {
  state: DashboardState
  context: DashboardStateContext
}

/**
 * Example queries for BRAND_NEW state
 * Focused on natural language use cases
 */
const EXAMPLE_QUERIES = [
  'cheap 9mm range ammo',
  'bulk .223 training ammo',
  'home defense 9mm',
  '.308 hunting ammo',
]

/**
 * Quick-add calibers for NEW state
 */
const QUICK_ADD_CALIBERS = [
  { label: '+9mm bulk', query: '9mm bulk' },
  { label: '+.223 brass', query: '.223 brass' },
  { label: '+5.56 NATO', query: '5.56 nato' },
]

/**
 * StateBanner - Dashboard v4 contextual banner
 *
 * Renders different banners based on user state per dashboard-product-spec.md.
 * State resolution is server-side; this component receives the resolved state.
 */
export function StateBanner({ state, context }: StateBannerProps) {
  switch (state) {
    case 'BRAND_NEW':
      return <BrandNewBanner />
    case 'NEW':
      return <NewUserBanner watchlistCount={context.watchlistCount} />
    case 'NEEDS_ALERTS':
      return <NeedsAlertsBanner alertsMissing={context.alertsMissing} />
    case 'HEALTHY':
      return <HealthyBanner watchlistCount={context.watchlistCount} />
    case 'RETURNING':
      return <ReturningBanner priceDropsThisWeek={context.priceDropsThisWeek} />
    case 'POWER_USER':
      return (
        <PowerUserBanner
          watchlistCount={context.watchlistCount}
          priceDropsThisWeek={context.priceDropsThisWeek}
        />
      )
    default:
      return null
  }
}

/**
 * BRAND_NEW: 0 watchlist items
 * Goal: First search, first saved item
 */
function BrandNewBanner() {
  return (
    <Card className="bg-card border-border">
      <CardContent className="py-8 md:py-10">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-xl md:text-2xl font-semibold text-foreground mb-2">
            Save items to watch. We'll monitor price changes.
          </h1>
          <p className="text-muted-foreground mb-6">
            Add items to your watchlist so we can monitor prices.
          </p>

          <Link href="/search">
            <Button size="lg" className="gap-2">
              <Search className="h-4 w-4" />
              Find ammo deals
            </Button>
          </Link>

          {/* Example query chips */}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {EXAMPLE_QUERIES.map((query) => (
              <Link
                key={query}
                href={`/search?q=${encodeURIComponent(query)}`}
              >
                <span className="inline-flex px-4 py-2 text-sm rounded-full border border-border hover:border-primary/50 hover:bg-muted/50 transition-colors text-muted-foreground cursor-pointer">
                  {query}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * NEW: 1-4 watchlist items
 * Goal: Reach minimum effective watchlist size (5+)
 */
function NewUserBanner({ watchlistCount }: { watchlistCount: number }) {
  const itemsNeeded = Math.max(5 - watchlistCount, 3)

  return (
    <Card className="bg-card border-border">
      <CardContent className="py-5">
        <div className="space-y-4">
          {/* Main message */}
          <div>
            <p className="font-medium text-foreground">
              Your watchlist has {watchlistCount} item{watchlistCount !== 1 ? 's' : ''}. Most price drops are still invisible.
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Add {itemsNeeded}+ more items so we can catch real savings.
            </p>
          </div>

          {/* CTA Button */}
          <Link href="/search">
            <Button className="w-full gap-2">
              Add ammo to watchlist
            </Button>
          </Link>

          {/* Quick-add caliber chips */}
          <div className="flex flex-wrap items-center gap-2">
            {QUICK_ADD_CALIBERS.map((caliber) => (
              <Link
                key={caliber.query}
                href={`/search?q=${encodeURIComponent(caliber.query)}`}
              >
                <span className="inline-flex px-3 py-1.5 text-xs rounded-full border border-border hover:border-primary/50 hover:bg-muted/50 transition-colors text-muted-foreground cursor-pointer">
                  {caliber.label}
                </span>
              </Link>
            ))}
            <span className="text-xs text-muted-foreground/70 ml-2">
              Search by caliber, use case, or brand
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * NEEDS_ALERTS: ≥5 items, at least 1 missing active alerts
 * Goal: Alert configuration
 */
function NeedsAlertsBanner({ alertsMissing }: { alertsMissing: number }) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Bell className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            <p className="text-foreground">
              {alertsMissing} watchlist item{alertsMissing !== 1 ? 's' : ''} don't have price drop alerts active.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            <Link href="/dashboard/saved" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              View watchlist
            </Link>
            <Link href="/dashboard/saved">
              <Button className="gap-1">
                Configure alerts
                <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * HEALTHY: ≥5 items, all alerts active
 * Goal: Reassurance
 */
function HealthyBanner({ watchlistCount }: { watchlistCount: number }) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
            <p className="text-foreground">
              Watchlist ready. {watchlistCount} item{watchlistCount !== 1 ? 's' : ''} with price drop alerts.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            <Link href="/search" className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
              <Plus className="h-3 w-3" />
              Add more to watchlist
            </Link>
            <Link href="/dashboard/saved" className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
              View
              <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * RETURNING: Healthy + alerts delivered this week
 * Goal: Reinforce value
 */
function ReturningBanner({ priceDropsThisWeek }: { priceDropsThisWeek: number }) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
            <p className="text-foreground">
              {priceDropsThisWeek} price drop{priceDropsThisWeek !== 1 ? 's' : ''} caught this week.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            <Link href="/search" className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
              <Plus className="h-3 w-3" />
              Add more to watchlist
            </Link>
            <Link href="/dashboard/saved" className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
              View
              <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * POWER_USER: ≥7 items + alerts this week
 * Goal: Scale advantage, efficiency
 */
function PowerUserBanner({
  watchlistCount,
  priceDropsThisWeek,
}: {
  watchlistCount: number
  priceDropsThisWeek: number
}) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
            <p className="text-foreground">
              Watchlist: {watchlistCount} items.{' '}
              {priceDropsThisWeek > 0 && (
                <span className="text-emerald-500">
                  {priceDropsThisWeek} price drop{priceDropsThisWeek !== 1 ? 's' : ''} caught this week.
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            <Link href="/search" className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
              <Plus className="h-3 w-3" />
              Add another caliber
            </Link>
            <Link href="/dashboard/saved" className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
              Manage
              <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
