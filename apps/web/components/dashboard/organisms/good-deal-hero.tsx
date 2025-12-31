'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ExternalLink } from 'lucide-react'
import { useDealsForYou } from '@/hooks/use-deals-for-you'
import { useWatchlist } from '@/hooks/use-watchlist'
import type { ProductFeedItem } from '@/types/dashboard'

/**
 * Hero Eligibility Criteria (ADR-012)
 *
 * An item qualifies for hero display when:
 * 1. Item is in stock
 * 2. Price is meaningfully lower than baseline (LOWER_THAN_RECENT context)
 * 3. Item matches user intent (saved item or saved search)
 */
function isHeroEligible(item: ProductFeedItem): boolean {
  if (!item.inStock) return false
  if (!item.priceSignal) return false
  return item.priceSignal.contextBand === 'LOWER_THAN_RECENT'
}

/**
 * Get context line for hero display
 * ADR-012 approved language only
 */
function getContextLine(item: ProductFeedItem, isWatched: boolean): string {
  if (isWatched) {
    return 'Something you\'re watching changed'
  }
  if (item.priceSignal?.relativePricePct && item.priceSignal.relativePricePct < -10) {
    return 'Rare low for this item'
  }
  return 'Lower than most prices this week'
}

interface GoodDealHeroProps {
  isPremium?: boolean
}

/**
 * GoodDealHero - Dashboard v3 Hero Section (ADR-012)
 *
 * Displays a single, optional hero recommendation when confidence exists.
 * Shows "Nothing urgent right now" when no item qualifies.
 *
 * Language uses only ADR-012 approved copy.
 */
export function GoodDealHero({ isPremium = false }: GoodDealHeroProps) {
  const { data: dealsData, loading: dealsLoading } = useDealsForYou()
  const { data: watchlistData, loading: watchlistLoading } = useWatchlist()

  const loading = dealsLoading || watchlistLoading

  // Find eligible hero item
  const eligibleItems = dealsData?.items?.filter(isHeroEligible) ?? []
  const heroItem = eligibleItems[0] ?? null

  // Check if hero item is watched
  const watchedIds = new Set(watchlistData?.items?.map(w => w.productId) ?? [])
  const isWatched = heroItem ? watchedIds.has(heroItem.product.id) : false

  // Determine no-hero state context
  const hasWatchedItems = (watchlistData?.items?.length ?? 0) > 0
  const hasMinorChanges = dealsData?.items?.some(item =>
    item.priceSignal?.contextBand === 'WITHIN_RECENT_RANGE'
  ) ?? false

  if (loading) {
    return <HeroSkeleton />
  }

  // No hero state (expected default per ADR-012)
  if (!heroItem) {
    return (
      <NoHeroState
        hasWatchedItems={hasWatchedItems}
        hasMinorChanges={hasMinorChanges}
      />
    )
  }

  // Hero state
  return (
    <HeroCard
      item={heroItem}
      isWatched={isWatched}
      isPremium={isPremium}
    />
  )
}

// ============================================================================
// Hero Card (when confident signal exists)
// ============================================================================

interface HeroCardProps {
  item: ProductFeedItem
  isWatched: boolean
  isPremium: boolean
}

function HeroCard({ item, isWatched, isPremium }: HeroCardProps) {
  const contextLine = getContextLine(item, isWatched)

  const handleViewClick = () => {
    window.open(item.url, '_blank', 'noopener,noreferrer')
  }

  return (
    <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-card border-primary/20 overflow-hidden">
      <CardContent className="p-6 md:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center gap-6">
          {/* Left: Product info */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* Section label */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-primary uppercase tracking-wide">
                Good Deal Right Now
              </span>
            </div>

            {/* Product name */}
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-foreground leading-tight">
                {item.product.name}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {item.product.caliber}
                {item.product.grainWeight && ` - ${item.product.grainWeight}gr`}
              </p>
            </div>

            {/* Price */}
            {item.pricePerRound !== null && (
              <div className="text-2xl md:text-3xl font-bold text-foreground">
                ${item.pricePerRound.toFixed(2)}
                <span className="text-sm font-normal text-muted-foreground ml-1">
                  /rd
                </span>
              </div>
            )}

            {/* Retailer */}
            <p className="text-sm text-muted-foreground">
              {item.retailer.name}
            </p>

            {/* Context lines (ADR-012 approved language) */}
            <div className="space-y-1">
              <p className="text-sm text-foreground">
                {contextLine}
              </p>
              {item.priceSignal?.relativePricePct && item.priceSignal.relativePricePct < -10 && (
                <p className="text-sm text-muted-foreground">
                  Rare low for this item
                </p>
              )}
            </div>
          </div>

          {/* Right: CTA */}
          <div className="flex-shrink-0 lg:text-right">
            <Button
              onClick={handleViewClick}
              size="lg"
              className="w-full lg:w-auto bg-primary hover:bg-primary/90 text-primary-foreground px-8"
            >
              View at {item.retailer.name}
              <ExternalLink className="ml-2 h-4 w-4" />
            </Button>
            {item.inStock && (
              <p className="mt-2 text-xs text-muted-foreground text-center lg:text-right">
                In stock
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// No-Hero State (expected default - ADR-012)
// ============================================================================

interface NoHeroStateProps {
  hasWatchedItems: boolean
  hasMinorChanges: boolean
}

function NoHeroState({ hasWatchedItems, hasMinorChanges }: NoHeroStateProps) {
  // ADR-012 approved no-hero copy
  let headline: string
  let description: string
  let orientation: string | null = null

  if (hasMinorChanges) {
    headline = 'Minor changes detected'
    description = 'Prices moved slightly, but nothing worth acting on yet.'
  } else if (hasWatchedItems) {
    headline = 'Nothing changed yet'
    description = 'We\'re out scouting prices and availability on the items you\'re watching.'
  } else {
    headline = 'Nothing urgent right now'
    description = 'We\'re out scouting prices and availability.'
    orientation = 'We\'ll surface changes here when something moves.'
  }

  // Format current time for "Last updated" display
  // In production, this would come from the most recent price.createdAt
  const lastUpdated = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })

  // No-hero is a lightweight status section - purely declarative, no CTAs
  // ADR-012: "The absence of a recommendation is a valid and expected state"
  // Uses slate background to differentiate from white content areas (System Status zone)
  return (
    <Card className="bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800">
      <CardContent className="py-5 px-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Left: Status message */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {/* Monitoring pulse indicator */}
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              <h2 className="text-base font-medium text-foreground">
                {headline}
              </h2>
            </div>
            <p className="text-sm text-muted-foreground">
              {description}
            </p>
            {orientation && (
              <p className="text-xs text-muted-foreground/70 mt-1">
                {orientation}
              </p>
            )}
          </div>

          {/* Right: Last updated timestamp */}
          <div className="text-xs text-muted-foreground/70 sm:text-right">
            <p>Last updated {lastUpdated}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Skeleton
// ============================================================================

function HeroSkeleton() {
  return (
    <Card className="bg-card border-border overflow-hidden">
      <CardContent className="p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex-1 space-y-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="flex-shrink-0">
            <Skeleton className="h-12 w-40" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
