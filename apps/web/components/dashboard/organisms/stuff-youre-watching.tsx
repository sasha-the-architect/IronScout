'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Eye, ChevronRight, TrendingDown, TrendingUp, Minus, Search } from 'lucide-react'
import { useWatchlist } from '@/hooks/use-watchlist'
import type { WatchlistItem, Trend } from '@/types/dashboard'
import Link from 'next/link'

/**
 * Determine directional trend from price delta
 * Returns simple direction for ADR-012 compliant language
 */
function getPriceTrend(item: WatchlistItem): Trend {
  const current = item.product.currentPrice
  const lowest = item.lowestPriceSeen

  if (current === null || lowest === null) return 'STABLE'

  // Compare to recent behavior (simplified: use lowest as baseline)
  const diff = current - lowest
  const diffPercent = lowest > 0 ? (diff / lowest) * 100 : 0

  if (diffPercent < -3) return 'DOWN'
  if (diffPercent > 3) return 'UP'
  return 'STABLE'
}

/**
 * Get ADR-012 approved directional text
 */
function getDirectionalText(trend: Trend): string {
  switch (trend) {
    case 'DOWN':
      return 'Price is going down'
    case 'UP':
      return 'Price is going up'
    case 'STABLE':
    default:
      return 'About the same'
  }
}

/**
 * StuffYoureWatching - Dashboard v3 Saved Items Section (ADR-012)
 *
 * Displays saved items with directional price indicators.
 * No charts, percentages, or historical timelines.
 *
 * ADR-012 approved language:
 * - "Price is going down"
 * - "About the same"
 * - "Price is going up"
 */
export function StuffYoureWatching({ maxItems = 5 }: { maxItems?: number }) {
  const { data, loading, error } = useWatchlist()

  const items = data?.items?.slice(0, maxItems) ?? []
  const hasMore = (data?.items?.length ?? 0) > maxItems

  if (loading) {
    return <WatchingSkeleton />
  }

  if (error) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Failed to load saved items
        </CardContent>
      </Card>
    )
  }

  if (items.length === 0) {
    return <EmptyWatchingState />
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Eye className="h-5 w-5 text-primary" />
            Stuff You're Watching
          </CardTitle>
          <Link href="/dashboard/saved">
            <Button variant="ghost" size="sm" className="text-xs h-7">
              View All
              <ChevronRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="divide-y divide-border">
          {items.map((item) => (
            <WatchingRow key={item.id} item={item} />
          ))}
        </div>

        {hasMore && (
          <div className="mt-4 text-center">
            <Link href="/dashboard/saved">
              <Button variant="outline" size="sm">
                See {(data?.items?.length ?? 0) - maxItems} more items
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Watching Row
// ============================================================================

interface WatchingRowProps {
  item: WatchlistItem
}

function WatchingRow({ item }: WatchingRowProps) {
  const trend = getPriceTrend(item)
  const directionalText = getDirectionalText(trend)
  const retailer = item.product.retailer

  const handleViewClick = () => {
    // In a real implementation, this would link to the product detail or retailer
    // For now, navigate to saved items
  }

  return (
    <div className="flex items-center gap-4 py-3">
      {/* Product info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {item.product.name}
        </p>
        <p className="text-xs text-muted-foreground">
          {item.product.caliber}
          {item.product.brand && ` - ${item.product.brand}`}
        </p>
      </div>

      {/* Price and direction */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {/* Price */}
        {item.product.currentPrice !== null && (
          <div className="text-right">
            <p className="text-sm font-semibold text-foreground">
              ${item.product.currentPrice.toFixed(2)}
            </p>
          </div>
        )}

        {/* Directional indicator */}
        <div className="flex items-center gap-1.5">
          <DirectionalIndicator trend={trend} />
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {directionalText}
          </span>
        </div>

        {/* Retailer CTA */}
        {retailer && (
          <Link
            href={`/search?q=${encodeURIComponent(item.product.name)}`}
            className="hidden md:flex"
          >
            <Button variant="ghost" size="sm" className="text-xs h-7 px-2">
              View
              <ChevronRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Directional Indicator
// ============================================================================

interface DirectionalIndicatorProps {
  trend: Trend
}

function DirectionalIndicator({ trend }: DirectionalIndicatorProps) {
  switch (trend) {
    case 'DOWN':
      return (
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-green-500/10">
          <TrendingDown className="h-3.5 w-3.5 text-green-600" />
        </div>
      )
    case 'UP':
      return (
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-red-500/10">
          <TrendingUp className="h-3.5 w-3.5 text-red-500" />
        </div>
      )
    case 'STABLE':
    default:
      return (
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-muted">
          <Minus className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      )
  }
}

// ============================================================================
// Empty State
// ============================================================================

function EmptyWatchingState() {
  // Empty state emphasizes delegation, not setup
  // "IronScout will watch for you" - stronger payoff than "track prices"
  return (
    <Card className="bg-card border-border">
      <CardContent className="py-8">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
            <Eye className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Nothing saved yet
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
              Save items and IronScout will watch prices and availability for you.
            </p>
          </div>
          <Link href="/search">
            <Button size="sm">
              <Search className="mr-2 h-4 w-4" />
              Find something to watch
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Skeleton
// ============================================================================

function WatchingSkeleton() {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-7 w-16" />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="divide-y divide-border">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 py-3">
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-6 w-6 rounded-full" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
