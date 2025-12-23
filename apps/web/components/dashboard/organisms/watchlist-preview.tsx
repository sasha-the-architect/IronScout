'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PriceDelta } from '../atoms/price-delta'
import { Sparkline, generateSparklineFromTrend } from '../atoms/sparkline'
import { Bookmark, ChevronRight, Lock, TrendingDown, Bell, TrendingUp, Search, Sparkles } from 'lucide-react'
import { useWatchlist } from '@/hooks/use-watchlist'
import { UPGRADE_COPY } from '@/types/dashboard'
import type { WatchlistItem } from '@/types/dashboard'
import Link from 'next/link'

// Value props for empty state
const WATCHLIST_VALUE_PROPS = [
  { icon: Bell, text: 'Get price drop alerts' },
  { icon: TrendingUp, text: 'See price history' },
  { icon: Sparkles, text: 'Personalized matches' },
]

interface SavedItemsPreviewProps {
  isPremium?: boolean
  /** Max items to show in preview */
  maxItems?: number
}

/**
 * SavedItemsPreview - Saved items teaser section
 *
 * Shows 3-5 saved items with price change indicators.
 * Links to full saved items page.
 *
 * Free: Current price only
 * Premium: "Lowest in X days" + inline sparkline
 */
export function SavedItemsPreview({ isPremium = false, maxItems = 5 }: SavedItemsPreviewProps) {
  const { data, loading, error } = useWatchlist()

  // Limit to maxItems
  const previewItems = data?.items?.slice(0, maxItems) ?? []

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Bookmark className="h-5 w-5 text-primary" />
            Saved Items
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
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <WatchlistRowSkeleton key={i} />
            ))}
          </div>
        )}

        {error && (
          <div className="py-4 text-center text-sm text-muted-foreground">
            Failed to load watchlist
          </div>
        )}

        {data && (
          <>
            {previewItems.length === 0 ? (
              <div className="py-4">
                {/* Headline */}
                <div className="text-center mb-4">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-3">
                    <Bookmark className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Your Watchlist Drives Everything
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Save items to unlock these features:
                  </p>
                </div>

                {/* Value props */}
                <div className="space-y-2 mb-4">
                  {WATCHLIST_VALUE_PROPS.map((prop, i) => {
                    const Icon = prop.icon
                    return (
                      <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/30">
                        <Icon className="h-4 w-4 text-primary flex-shrink-0" />
                        <span className="text-sm text-foreground">{prop.text}</span>
                      </div>
                    )
                  })}
                </div>

                {/* CTAs */}
                <div className="space-y-2">
                  <Link href="/dashboard/search" className="block">
                    <Button className="w-full" size="sm">
                      <Search className="mr-2 h-4 w-4" />
                      Add First Item
                    </Button>
                  </Link>
                  <Link href="/dashboard/search?popular=true" className="block">
                    <Button variant="ghost" size="sm" className="w-full text-xs">
                      Browse Popular Calibers
                    </Button>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                {previewItems.map((item) => (
                  <WatchlistRow key={item.id} item={item} isPremium={isPremium} />
                ))}
              </div>
            )}

            {/* Free tier limit message */}
            {!isPremium && data._meta && data._meta.itemLimit !== -1 && data._meta.itemCount >= data._meta.itemLimit && (
              <div className="mt-4 p-3 rounded-lg bg-muted/50 border border-border">
                <div className="flex items-start gap-2">
                  <Lock className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div className="text-xs text-muted-foreground">
                    <p>
                      Saved {data._meta.itemCount} of {data._meta.itemLimit} items
                    </p>
                    <p className="mt-1 text-primary">{UPGRADE_COPY.WATCHLIST_LIMIT}</p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================================
// WatchlistRow Component
// ============================================================================

interface WatchlistRowProps {
  item: WatchlistItem
  isPremium?: boolean
}

function WatchlistRow({ item, isPremium = false }: WatchlistRowProps) {
  const { product, targetPrice, lowestPriceSeen, isLowestSeen, savingsVsTarget } = item

  // Calculate price delta if we have target price
  const deltaPercent =
    targetPrice && product.currentPrice
      ? ((product.currentPrice - targetPrice) / targetPrice) * 100
      : null

  // Generate sparkline data (Premium feature)
  // In production, this would come from price history API
  const sparklineData = isPremium
    ? generateSparklineFromTrend(deltaPercent && deltaPercent < 0 ? 'DOWN' : 'STABLE')
    : null

  return (
    <div className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-muted/50 transition-colors">
      {/* Product info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{product.name}</p>
        <p className="text-xs text-muted-foreground">
          {product.caliber}
          {product.brand && ` • ${product.brand}`}
        </p>
      </div>

      {/* Premium: Sparkline */}
      {isPremium && sparklineData && (
        <div className="hidden sm:block">
          <Sparkline
            data={sparklineData}
            trend={deltaPercent && deltaPercent < 0 ? 'DOWN' : 'STABLE'}
            width={48}
            height={20}
          />
        </div>
      )}

      {/* Price info */}
      <div className="text-right flex-shrink-0">
        {product.currentPrice !== null ? (
          <>
            <p className="text-sm font-semibold text-foreground">
              ${product.currentPrice.toFixed(2)}
            </p>
            {/* Premium: Show if lowest */}
            {isPremium && isLowestSeen && (
              <p className="text-xs text-status-buy flex items-center justify-end gap-1">
                <TrendingDown className="h-3 w-3" />
                Lowest
              </p>
            )}
            {/* Show delta vs target */}
            {deltaPercent !== null && !isLowestSeen && (
              <PriceDelta percent={deltaPercent} size="sm" />
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">--</p>
        )}
      </div>

      {/* Stock indicator */}
      <div className="w-2 flex-shrink-0">
        <div
          className={`w-2 h-2 rounded-full ${
            product.inStock ? 'bg-status-buy' : 'bg-muted-foreground/50'
          }`}
          title={product.inStock ? 'In Stock' : 'Out of Stock'}
        />
      </div>
    </div>
  )
}

// ============================================================================
// Skeleton Component
// ============================================================================

function WatchlistRowSkeleton() {
  return (
    <div className="flex items-center gap-3 py-2 px-2">
      <div className="flex-1 space-y-1">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-4 w-16" />
      <Skeleton className="h-2 w-2 rounded-full" />
    </div>
  )
}

/**
 * @deprecated Use SavedItemsPreview instead
 */
export const WatchlistPreview = SavedItemsPreview
