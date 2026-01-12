'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronRight, ChevronDown, TrendingDown } from 'lucide-react'
import Link from 'next/link'
import type { DashboardState } from './state-banner'

/**
 * Watchlist preview item - matches backend WatchlistPreviewItem
 */
export interface WatchlistPreviewItem {
  id: string
  productId: string
  name: string
  caliber: string | null
  brand: string | null
  price: number | null
  pricePerRound: number | null
  inStock: boolean
  imageUrl: string | null
  notificationsEnabled: boolean
  createdAt: string
}

interface WatchlistPreviewV4Props {
  items: WatchlistPreviewItem[]
  totalCount: number
  maxItems?: number
  state: DashboardState
}

/**
 * WatchlistPreviewV4 - Dashboard watchlist preview section
 *
 * Per dashboard-product-spec.md:
 * - Dashboard shows a subset preview of the watchlist
 * - Shows up to maxItems (3 for most states, 7 for POWER_USER)
 * - "Manage" routes to full Watchlist page
 * - No inline editing beyond navigation
 */
export function WatchlistPreviewV4({
  items,
  totalCount,
  maxItems = 3,
  state,
}: WatchlistPreviewV4Props) {
  const displayItems = items.slice(0, maxItems)

  // Show recommended count hint for NEW state
  const showRecommendedHint = state === 'NEW' && totalCount < 5

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
          <ChevronDown className="h-3 w-3" />
          Your Watchlist ({totalCount} item{totalCount !== 1 ? 's' : ''}
          {showRecommendedHint && ' · recommended 5-10'})
        </button>
        <Link href="/dashboard/saved">
          <span className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-0.5 cursor-pointer">
            Manage
            <ChevronRight className="h-3 w-3" />
          </span>
        </Link>
      </div>

      {/* Items */}
      {displayItems.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">
          Your watchlist is empty
        </div>
      ) : (
        <div className="space-y-1">
          {displayItems.map((item) => (
            <WatchlistPreviewRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}

interface WatchlistPreviewRowProps {
  item: WatchlistPreviewItem
}

function WatchlistPreviewRow({ item }: WatchlistPreviewRowProps) {
  // Format price as cents per round (e.g., "24.50¢")
  const formatPrice = () => {
    if (item.pricePerRound !== null) {
      return `${(item.pricePerRound * 100).toFixed(2)}¢`
    }
    if (item.price !== null) {
      return `$${item.price.toFixed(2)}`
    }
    return '—'
  }

  return (
    <Link
      href={`/products/${item.productId}`}
      className="flex items-center gap-3 py-2 hover:bg-muted/30 transition-colors rounded px-2 -mx-2"
    >
      {/* Trend indicator */}
      <TrendingDown className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />

      {/* Product Name */}
      <span className="flex-1 text-sm text-foreground truncate">
        {item.name}
      </span>

      {/* Caliber Badge */}
      {item.caliber && (
        <Badge
          variant="outline"
          className="text-xs flex-shrink-0 border-primary/30 text-primary bg-primary/5"
        >
          {item.caliber}
        </Badge>
      )}

      {/* Price */}
      <span className="text-sm text-muted-foreground flex-shrink-0 tabular-nums">
        {formatPrice()}
      </span>
    </Link>
  )
}
