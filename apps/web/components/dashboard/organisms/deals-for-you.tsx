'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ProductCard } from '../molecules/deal-card'
import { Skeleton } from '@/components/ui/skeleton'
import { Search, ChevronRight, Lock } from 'lucide-react'
import { useDealsForYou } from '@/hooks/use-deals-for-you'
import { UPGRADE_COPY } from '@/types/dashboard'
import Link from 'next/link'

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
export function PersonalizedFeed({ isPremium = false, onAddToWatchlist }: PersonalizedFeedProps) {
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
            <Card key={i} className="bg-card border-border">
              <CardContent className="p-4 space-y-3">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-4 w-24" />
                <div className="flex justify-between">
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-8 w-16" />
                </div>
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
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
            <Card className="bg-card border-border">
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                <p>No products found for your tracked calibers.</p>
                <p className="mt-2">
                  <Link href="/dashboard/saved" className="text-primary hover:underline">
                    Save some items
                  </Link>{' '}
                  to start seeing personalized products.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.items.map((item) => (
                <ProductCard
                  key={item.id}
                  item={item}
                  isPremium={isPremium}
                  onWatchlistClick={
                    onAddToWatchlist && !item.isWatched
                      ? () => onAddToWatchlist(item.product.id)
                      : undefined
                  }
                />
              ))}
            </div>
          )}

          {/* Free tier limit message */}
          {!isPremium && data._meta && data._meta.itemsLimit !== -1 && data.items.length >= data._meta.itemsLimit && (
            <div className="p-4 rounded-lg bg-muted/50 border border-border">
              <div className="flex items-start gap-3">
                <Lock className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="text-sm">
                  <p className="text-muted-foreground">
                    Showing {data._meta.itemsShown} of {data._meta.itemsLimit} products
                  </p>
                  <p className="mt-1">
                    <Link href="/pricing" className="text-primary hover:underline">
                      Upgrade to Premium
                    </Link>{' '}
                    for more products with price context
                  </p>
                </div>
              </div>
            </div>
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
