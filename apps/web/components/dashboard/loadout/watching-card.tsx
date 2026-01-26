'use client'

import { Eye, Search, Bookmark } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  type WatchingItemWithPrice,
  formatPriceRange,
  getStatusLabel,
} from '@/hooks/use-loadout'

// ============================================================================
// TYPES
// ============================================================================

interface WatchingCardProps {
  items: WatchingItemWithPrice[]
  totalCount: number
  onCompareClick: (item: WatchingItemWithPrice) => void
  onFindSimilarClick: (item: WatchingItemWithPrice) => void
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * WatchingCard - Shows watched items with prices and status
 *
 * Per My Loadout mockup:
 * - Shows watched items with status indicators
 * - Price range across retailers
 * - "Compare prices" for in-stock items
 * - "Find similar" for out-of-stock items
 */
export function WatchingCard({
  items,
  totalCount,
  onCompareClick,
  onFindSimilarClick,
}: WatchingCardProps) {
  if (items.length === 0) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Eye className="h-4 w-4" />
            Watching
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Bookmark className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              No items in your watchlist yet
            </p>
            <Button variant="outline" size="sm" className="mt-4" asChild>
              <a href="/search">Browse ammo</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Eye className="h-4 w-4" />
            Watching
          </CardTitle>
          <span className="text-sm text-muted-foreground">
            {totalCount} {totalCount === 1 ? 'item' : 'items'}
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          {items.slice(0, 10).map((item) => (
            <WatchingItemRow
              key={item.id}
              item={item}
              onCompareClick={onCompareClick}
              onFindSimilarClick={onFindSimilarClick}
            />
          ))}
          {totalCount > 10 && (
            <Button variant="ghost" size="sm" className="w-full" asChild>
              <a href="/watchlist">View all {totalCount} items</a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// WATCHING ITEM ROW
// ============================================================================

interface WatchingItemRowProps {
  item: WatchingItemWithPrice
  onCompareClick: (item: WatchingItemWithPrice) => void
  onFindSimilarClick: (item: WatchingItemWithPrice) => void
}

function WatchingItemRow({
  item,
  onCompareClick,
  onFindSimilarClick,
}: WatchingItemRowProps) {
  const statusLabel = getStatusLabel(item.status)
  const priceText = item.priceRange
    ? formatPriceRange(item.priceRange, { showRetailerCount: true })
    : 'No price data'

  // Build attributes line
  const attrs = [
    item.caliber,
    item.bulletType,
    item.grainWeight ? `${item.grainWeight}gr` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 p-3 rounded-lg border bg-card',
        !item.inStock && 'opacity-70'
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium truncate text-sm">{item.name}</p>
          {statusLabel && (
            <Badge
              variant={item.status === 'lowest-90-days' ? 'default' : 'secondary'}
              className="text-xs shrink-0"
            >
              {statusLabel}
            </Badge>
          )}
        </div>
        {attrs && (
          <p className="text-xs text-muted-foreground mt-0.5">{attrs}</p>
        )}
        <p className="text-sm mt-1">
          {item.inStock ? (
            <span className="text-foreground font-mono">{priceText}</span>
          ) : (
            <span className="text-amber-600 dark:text-amber-400">Out of stock</span>
          )}
        </p>
      </div>
      <div className="shrink-0">
        {item.inStock ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onCompareClick(item)}
          >
            Compare prices
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onFindSimilarClick(item)}
          >
            <Search className="h-3.5 w-3.5 mr-1" />
            Find similar
          </Button>
        )}
      </div>
    </div>
  )
}

export default WatchingCard
