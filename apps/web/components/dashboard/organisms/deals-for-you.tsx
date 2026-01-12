/**
 * @deprecated This component has been replaced by BestPrices in Dashboard v4.
 * Dashboard v4 uses a state-driven design with StateBanner, WatchlistPreviewV4, and BestPrices.
 * @see apps/web/components/dashboard/organisms/best-prices.tsx
 * @see apps/web/components/dashboard/organisms/state-banner.tsx
 *
 * This file is kept for backwards compatibility during migration.
 * Do not use in new code.
 */
'use client'

import { useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ForYouResultCard } from '@/components/results'
import { ResultCardSkeleton } from '@/components/results'
import { Search, ChevronRight, Sparkles, TrendingDown, Bell } from 'lucide-react'
import { useDealsForYou } from '@/hooks/use-deals-for-you'
import Link from 'next/link'

import type { ProductFeedItem } from '@/types/dashboard'

/**
 * ForYouResultsGrid - Grid component for "For You" feed
 * Manages local tracking state for optimistic updates
 */
function ForYouResultsGrid({
  items: initialItems,
  onAddToWatchlist,
}: {
  items: ProductFeedItem[]
  onAddToWatchlist?: (productId: string) => void
}) {
  const [items, setItems] = useState(initialItems)

  const handleTrackChange = useCallback((productId: string, isTracked: boolean) => {
    setItems((prev) =>
      prev.map((item) =>
        item.product.id === productId
          ? { ...item, isWatched: isTracked }
          : item
      )
    )
    if (isTracked && onAddToWatchlist) {
      onAddToWatchlist(productId)
    }
  }, [onAddToWatchlist])

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {items.map((item) => (
        <ForYouResultCard
          key={item.id}
          item={item}
          onTrackChange={handleTrackChange}
        />
      ))}
    </div>
  )
}

// Sample teasers to show value before user saves items
const SAMPLE_TEASERS = [
  {
    icon: TrendingDown,
    title: '9mm FMJ dropped 12% this month',
    subtitle: 'Save items to track prices like this',
    color: 'text-status-buy',
  },
  {
    icon: Bell,
    title: 'Alert: Notify when < $0.24/rd',
    subtitle: 'Set custom price thresholds',
    color: 'text-primary',
  },
]

interface PersonalizedFeedProps {
  isPremium?: boolean
  onAddToWatchlist?: (productId: string) => void
}

/**
 * PersonalizedFeed - Personalized product feed (ADR-006 compliant)
 *
 * Trading terminal-style feed showing products matching
 * user's tracked calibers.
 *
 * Free: 5 items max, basic info
 * Premium: 20 items, context explanations
 */
export function PersonalizedFeed({ isPremium: _isPremium = false, onAddToWatchlist }: PersonalizedFeedProps) {
  const { data, loading, error } = useDealsForYou()

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Search className="h-5 w-5 text-primary" />
          For You
        </h2>
        <Link href="/dashboard/search">
          <Button variant="ghost" size="sm" className="text-xs h-7">
            View All
            <ChevronRight className="ml-1 h-3 w-3" />
          </Button>
        </Link>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <ResultCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <Card className="bg-card border-border">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Failed to load products. Please try again.
          </CardContent>
        </Card>
      )}

      {/* Products grid */}
      {data && data.items && (
        <>
          {data.items.length === 0 ? (
            <div className="space-y-4">
              {/* Value teaser cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {SAMPLE_TEASERS.map((teaser, i) => {
                  const Icon = teaser.icon
                  return (
                    <Card key={i} className="bg-muted/30 border-dashed border-border">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-lg bg-background ${teaser.color}`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-foreground">
                              {teaser.title}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {teaser.subtitle}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                          <Sparkles className="h-3 w-3" />
                          <span>Example</span>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>

              {/* Action prompt */}
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="py-6 text-center">
                  <Sparkles className="h-6 w-6 text-primary mx-auto mb-2" />
                  <p className="text-sm font-medium text-foreground">
                    Your feed is empty. Let's fix that.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 mb-4">
                    Save your first item to see products matching your interests
                  </p>
                  <Link href="/dashboard/search">
                    <Button size="sm">
                      <Search className="mr-2 h-4 w-4" />
                      Find Products
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </div>
          ) : (
            <ForYouResultsGrid
              items={data.items}
              onAddToWatchlist={onAddToWatchlist}
            />
          )}

          {/* Personalization indicator */}
          {data._meta?.personalized && data._meta.calibersUsed?.length > 0 && (
            <p className="text-xs text-muted-foreground text-center">
              Personalized for: {data._meta.calibersUsed.join(', ')}
            </p>
          )}
        </>
      )}
    </div>
  )
}

// Export with old name for backwards compatibility during migration
export { PersonalizedFeed as DealsForYou }
