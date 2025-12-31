'use client'

import { useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { TrendingDown, TrendingUp, AlertCircle } from 'lucide-react'
import { useWatchlist } from '@/hooks/use-watchlist'
import type { WatchlistItem } from '@/types/dashboard'
import Link from 'next/link'

/**
 * Maximum items to show in the activity feed
 * ADR-012: Hard cap at 3-5 items
 */
const MAX_ITEMS = 5

/**
 * Minimum delta threshold to consider as a "change"
 * Filters out noise from tiny price fluctuations
 */
const MIN_DELTA_THRESHOLD = 0.01

/**
 * Represents a recent change for display
 */
interface RecentChange {
  id: string
  productId: string
  productName: string
  retailerName: string
  delta: number // Positive = price went up, Negative = price went down
  currentPrice: number
}

/**
 * Extract recent changes from watchlist items
 *
 * A "change" is when current price differs from the lowest price seen.
 * This is a simplified heuristic - in production, we'd track explicit
 * price history with timestamps.
 */
function extractRecentChanges(items: WatchlistItem[]): RecentChange[] {
  const changes: RecentChange[] = []

  for (const item of items) {
    const current = item.product.currentPrice
    const lowest = item.lowestPriceSeen

    // Skip if no price data
    if (current === null || lowest === null) continue

    // Calculate delta (positive = current is higher than lowest)
    const delta = current - lowest

    // Only include items with meaningful changes
    if (Math.abs(delta) >= MIN_DELTA_THRESHOLD) {
      changes.push({
        id: item.id,
        productId: item.productId,
        productName: item.product.name,
        retailerName: item.product.retailer?.name ?? 'Unknown',
        delta,
        currentPrice: current,
      })
    }
  }

  // Sort by most significant change first (absolute value)
  changes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

  // Cap at MAX_ITEMS
  return changes.slice(0, MAX_ITEMS)
}

/**
 * RecentChanges - Activity Feed Component (ADR-012)
 *
 * Shows a short list of recently changed Saved Items.
 *
 * Rules:
 * - Only items with recent changes (price or availability)
 * - Sorted by most recent/significant change first
 * - Hard cap at 3-5 items
 * - Returns null if no recent changes exist
 *
 * Explicitly forbidden:
 * - Charts, sparklines, full prices, rankings
 * - Aggregates, trend summaries, alert-style urgency
 */
export function RecentChanges() {
  const { data, loading, error } = useWatchlist()

  // Extract items with changes
  const recentChanges = useMemo(() => {
    if (!data?.items) return []
    return extractRecentChanges(data.items)
  }, [data?.items])

  // Loading state
  if (loading) {
    return <RecentChangesSkeleton />
  }

  // Error state - silent fail, don't show broken UI
  if (error) {
    return null
  }

  // Check if user has any saved items at all
  const hasAnyItems = data?.items && data.items.length > 0
  const itemCount = data?.items?.length ?? 0

  // No saved items = show onboarding prompt
  if (!hasAnyItems) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="py-4 px-5">
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Your Watchlist
            </p>
            <p className="text-sm text-muted-foreground">
              Save items to track price changes. We'll show you when something moves.
            </p>
            <Link
              href="/dashboard/search"
              className="inline-flex items-center text-sm text-primary hover:text-primary/80 transition-colors"
            >
              Start searching →
            </Link>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Has items but no changes = show summary with link
  if (recentChanges.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="py-4 px-5">
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Your Watchlist
            </p>
            <p className="text-sm text-muted-foreground">
              Watching {itemCount} {itemCount === 1 ? 'item' : 'items'}. No price changes recently.
            </p>
            <Link
              href="/dashboard/saved"
              className="inline-flex items-center text-sm text-primary hover:text-primary/80 transition-colors"
            >
              View all saved items →
            </Link>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Has changes = show activity feed
  return (
    <Card className="bg-card border-border">
      <CardContent className="py-4 px-5">
        <div className="space-y-3">
          {/* Header - minimal */}
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Recent Changes
          </p>

          {/* Change list */}
          <div className="space-y-2">
            {recentChanges.map((change) => (
              <ChangeRow key={change.id} change={change} />
            ))}
          </div>

          {/* Link to full saved items */}
          <div className="pt-1">
            <Link
              href="/dashboard/saved"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              View all saved items →
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Single change row - minimal display
 * Format: "Product Name — Retailer" + directional delta
 */
function ChangeRow({ change }: { change: RecentChange }) {
  const isDown = change.delta < 0
  const deltaFormatted = `$${Math.abs(change.delta).toFixed(2)}`

  return (
    <div className="flex items-center justify-between gap-3 py-1">
      {/* Item info */}
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground truncate">
          <span className="font-medium">{change.productName}</span>
          <span className="text-muted-foreground"> — {change.retailerName}</span>
        </p>
      </div>

      {/* Directional delta only */}
      <div className={`flex items-center gap-1 flex-shrink-0 ${isDown ? 'text-green-600' : 'text-red-500'}`}>
        {isDown ? (
          <TrendingDown className="h-3.5 w-3.5" />
        ) : (
          <TrendingUp className="h-3.5 w-3.5" />
        )}
        <span className="text-sm font-medium">
          {isDown ? '▼' : '▲'} {deltaFormatted}
        </span>
      </div>
    </div>
  )
}

/**
 * Skeleton for loading state
 */
function RecentChangesSkeleton() {
  return (
    <Card className="bg-card border-border">
      <CardContent className="py-4 px-5">
        <div className="space-y-3">
          <Skeleton className="h-3 w-24" />
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-1">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
