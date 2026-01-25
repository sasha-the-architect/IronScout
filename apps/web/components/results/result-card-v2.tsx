'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { Bookmark, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { trackTrackToggle } from '@/lib/analytics'
import { toast } from 'sonner'
import type { ResultCardV2Props } from './types'
import { formatPrice } from './types'

/**
 * Get casing badge style - Brass gets warm accent, Steel gets neutral
 */
function getCasingStyle(casing: string): string {
  const lower = casing.toLowerCase()
  if (lower === 'brass') {
    return 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30'
  }
  if (lower === 'steel') {
    return 'bg-muted text-muted-foreground border-border'
  }
  return 'bg-muted text-muted-foreground border-border'
}

/**
 * ResultCardV2 - Price Summary Card
 *
 * Per UX feedback: Cards collapsed to "price summary" model for scanability.
 * Shows: Product name, best price/rd, price range, retailer count.
 * Retailer rows appear only after click (drawer/detail view).
 *
 * Invariants:
 * - No inline retailer rows (those live in RetailerPanel)
 * - No per-retailer stock state inline
 * - No recommendation language
 * - Click anywhere opens comparison drawer
 */
export function ResultCardV2({
  id,
  productTitle,
  caliber,
  bulletType,
  grainWeight,
  caseMaterial,
  roundCount,
  retailers,
  isWatched,
  onWatchToggle,
  onCompareClick,
}: ResultCardV2Props) {
  const [watchingOptimistic, setWatchingOptimistic] = useState(isWatched)

  // Sync optimistic state with prop changes
  useEffect(() => {
    setWatchingOptimistic(isWatched)
  }, [isWatched])

  // Compute price summary from retailers
  const priceSummary = useMemo(() => {
    if (retailers.length === 0) {
      return null
    }

    const prices = retailers.map((r) => r.pricePerRound)
    const minPrice = Math.min(...prices)
    const maxPrice = Math.max(...prices)
    const anyInStock = retailers.some((r) => r.inStock)

    return {
      bestPrice: minPrice,
      minPrice,
      maxPrice,
      hasRange: maxPrice - minPrice > 0.001, // More than $0.001 difference
      retailerCount: retailers.length,
      anyInStock,
    }
  }, [retailers])

  const handleWatchToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation() // Don't trigger card click
      const nextState = !watchingOptimistic
      setWatchingOptimistic(nextState)
      trackTrackToggle(id, nextState)

      if (nextState) {
        toast.success('Added to watchlist', {
          description: "We'll notify you when the price drops.",
          action: {
            label: 'View Watchlist',
            onClick: () => (window.location.href = '/dashboard/saved'),
          },
          duration: 4000,
        })
      } else {
        toast.success('Removed from watchlist', { duration: 2000 })
      }

      onWatchToggle(id)
    },
    [id, watchingOptimistic, onWatchToggle]
  )

  const handleCardClick = useCallback(() => {
    onCompareClick(id)
  }, [id, onCompareClick])

  // Empty state (no retailers)
  if (!priceSummary) {
    return (
      <Card className="overflow-hidden h-full flex flex-col border border-border bg-card">
        <CardContent className="p-4 flex flex-col flex-1">
          <WatchButton
            isWatched={watchingOptimistic}
            onClick={handleWatchToggle}
          />
          <ProductHeader
            productTitle={productTitle}
            caliber={caliber}
            bulletType={bulletType}
            grainWeight={grainWeight}
            caseMaterial={caseMaterial}
          />
          <div className="flex-1 flex items-center justify-center py-6">
            <div className="text-center">
              <p className="text-muted-foreground font-medium">No current listings</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Check back later</p>
            </div>
          </div>
          <button
            onClick={handleWatchToggle}
            disabled={watchingOptimistic}
            className={cn(
              'w-full h-10 rounded-md border text-sm font-medium transition-colors',
              watchingOptimistic
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : 'border-border hover:bg-muted'
            )}
          >
            {watchingOptimistic ? 'Watching' : 'Watch for availability'}
          </button>
        </CardContent>
      </Card>
    )
  }

  const { bestPrice, minPrice, maxPrice, hasRange, retailerCount, anyInStock } = priceSummary

  return (
    <Card
      onClick={handleCardClick}
      className={cn(
        'overflow-hidden h-full flex flex-col border bg-card cursor-pointer transition-all',
        anyInStock
          ? 'border-border hover:border-primary/40 hover:shadow-sm'
          : 'opacity-70 border-border'
      )}
    >
      <CardContent className="p-4 flex flex-col flex-1">
        {/* Watch Button */}
        <WatchButton isWatched={watchingOptimistic} onClick={handleWatchToggle} />

        {/* Product Header */}
        <ProductHeader
          productTitle={productTitle}
          caliber={caliber}
          bulletType={bulletType}
          grainWeight={grainWeight}
          caseMaterial={caseMaterial}
        />

        {/* Price Summary Block */}
        <div className="mt-4 flex-1">
          {/* Best Price - Primary */}
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold font-mono text-foreground">
              {formatPrice(bestPrice)}
            </span>
            <span className="text-sm text-muted-foreground">/rd</span>
          </div>

          {/* Price Range - Secondary (only if range exists) */}
          {hasRange && (
            <p className="text-sm text-muted-foreground mt-1">
              {formatPrice(minPrice)} – {formatPrice(maxPrice)}
            </p>
          )}
        </div>

        {/* Footer: Retailer count + compare hint */}
        <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {retailerCount} {retailerCount === 1 ? 'retailer' : 'retailers'}
          </span>
          <span className="text-sm text-primary flex items-center gap-0.5">
            Compare
            <ChevronRight className="h-4 w-4" />
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Watch button - top right corner
 */
function WatchButton({
  isWatched,
  onClick,
}: {
  isWatched: boolean
  onClick: (e: React.MouseEvent) => void
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className={cn(
              'absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors z-10',
              isWatched
                ? 'text-primary bg-primary/10 hover:bg-primary/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
            aria-label={isWatched ? 'Remove from watchlist' : 'Add to watchlist'}
          >
            <Bookmark className={cn('h-3.5 w-3.5', isWatched && 'fill-current')} />
            <span>{isWatched ? 'Watching' : 'Watch'}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p className="text-xs">
            {isWatched ? 'Click to remove from watchlist' : 'Get alerts when price drops'}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/**
 * Product header - title and attributes
 */
function ProductHeader({
  productTitle,
  caliber,
  bulletType,
  grainWeight,
  caseMaterial,
}: {
  productTitle: string
  caliber: string
  bulletType?: string
  grainWeight?: number
  caseMaterial?: string
}) {
  return (
    <>
      <h3 className="font-semibold text-foreground leading-tight pr-20 mb-2 line-clamp-2">
        {productTitle}
      </h3>
      <div className="flex flex-wrap items-center gap-1.5">
        {caliber && (
          <span className="px-2 py-0.5 text-xs font-medium rounded border bg-muted/50 text-foreground border-border">
            {caliber}
          </span>
        )}
        {bulletType && (
          <span className="px-2 py-0.5 text-xs font-medium rounded border bg-transparent text-muted-foreground border-border">
            {bulletType}
          </span>
        )}
        {grainWeight && (
          <span className="px-2 py-0.5 text-xs font-medium rounded border bg-transparent text-muted-foreground border-border">
            {grainWeight}gr
          </span>
        )}
        {caseMaterial && (
          <span
            className={cn(
              'px-2 py-0.5 text-xs font-medium rounded border',
              getCasingStyle(caseMaterial)
            )}
          >
            {caseMaterial}
          </span>
        )}
      </div>
    </>
  )
}

/**
 * ResultCardV2Skeleton - Loading placeholder
 *
 * Matches the price summary card layout:
 * - Title + attributes
 * - Price block
 * - Footer with retailer count
 */
export function ResultCardV2Skeleton() {
  return (
    <Card className="bg-card border-border overflow-hidden h-full flex flex-col">
      <CardContent className="p-4 flex flex-col flex-1">
        {/* Title skeleton */}
        <div className="h-5 w-3/4 bg-muted rounded animate-pulse" />

        {/* Attribute badges skeleton */}
        <div className="flex gap-1.5 mt-2">
          <div className="h-5 w-12 bg-muted rounded animate-pulse" />
          <div className="h-5 w-10 bg-muted rounded animate-pulse" />
          <div className="h-5 w-14 bg-muted rounded animate-pulse" />
        </div>

        {/* Price block skeleton */}
        <div className="mt-4 flex-1">
          <div className="h-8 w-24 bg-muted rounded animate-pulse" />
          <div className="h-4 w-32 bg-muted/50 rounded animate-pulse mt-2" />
        </div>

        {/* Footer skeleton */}
        <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between">
          <div className="h-4 w-20 bg-muted rounded animate-pulse" />
          <div className="h-4 w-16 bg-muted rounded animate-pulse" />
        </div>
      </CardContent>
    </Card>
  )
}
