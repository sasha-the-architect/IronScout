'use client'

import { useState, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Bookmark, ArrowUpRight } from 'lucide-react'
import { trackAffiliateClick, trackTrackToggle } from '@/lib/analytics'
import { toast } from 'sonner'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

/**
 * Badge types for result cards
 */
export type BadgeType = 'lowest_price' | 'in_stock' | 'price_drop' | 'new_listing'

export interface CardBadge {
  type: BadgeType
  label: string
}

/**
 * ResultCard Props - Mockup-aligned design
 *
 * Primary KPI: Affiliate Clicks
 * Hierarchy: Title → Attributes → Retailer → Price → CTA
 */
export interface ResultCardProps {
  id: string

  /** Product title - displayed prominently at top */
  productTitle: string

  pricePerRound: number
  /** Total price for the listing */
  totalPrice?: number
  /** Round count for the listing */
  roundCount?: number
  currency?: 'USD'

  inStock?: boolean

  retailerName: string
  retailerUrl: string

  /** Caliber (e.g., "9mm Luger", ".223 Rem") */
  caliber: string
  /** Bullet type (e.g., "FMJ", "JHP", "FTX") */
  bulletType?: string
  /** Grain weight */
  grain?: string | number
  /** Casing material (e.g., "Brass", "Steel") */
  caseMaterial?: string

  /** When the price was last updated - for "X ago" display */
  updatedAt?: Date | string

  /** Whether shipping is included in the price */
  includesShipping?: boolean

  isTracked: boolean

  /** Visual emphasis - crown this card with scale + border */
  isBestPrice?: boolean

  /** Badges to display (can have multiple) */
  badges?: CardBadge[]

  /** Placement context for analytics */
  placement?: 'search' | 'for_you' | 'product_detail'

  onTrackToggle: (id: string) => void
  onPrimaryClick?: (id: string) => void
}

/**
 * Format price per round with consistent precision
 */
function formatPricePerRound(price: number): string {
  return `$${price.toFixed(2)}`
}

/**
 * Format relative time (e.g., "10m ago", "2h ago")
 */
function formatTimeAgo(date: Date | string | undefined): string | null {
  if (!date) return null

  const now = new Date()
  const then = new Date(date)
  const diffMs = now.getTime() - then.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`

  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`

  return null // Don't show if older than a week
}

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
 * ResultCard Component - Mockup-aligned design
 *
 * Layout per mockup:
 * 1. Title (prominent)
 * 2. Attribute badges row (caliber | type | grain | casing)
 * 3. Retailer + timestamp
 * 4. Price block with shipping indicator
 * 5. Stock status + Watch button row
 * 6. Primary CTA
 */
export function ResultCard({
  id,
  productTitle,
  pricePerRound,
  totalPrice,
  roundCount,
  currency = 'USD',
  inStock,
  retailerName,
  retailerUrl,
  caliber,
  bulletType,
  grain,
  caseMaterial,
  updatedAt,
  includesShipping = true,
  isTracked,
  isBestPrice = false,
  badges = [],
  placement = 'search',
  onTrackToggle,
  onPrimaryClick,
}: ResultCardProps) {
  const [trackingOptimistic, setTrackingOptimistic] = useState(isTracked)

  // Sync optimistic state with prop changes
  useEffect(() => {
    setTrackingOptimistic(isTracked)
  }, [isTracked])

  const isValidUrl = retailerUrl && retailerUrl.startsWith('http')
  const timeAgo = formatTimeAgo(updatedAt)

  const handlePrimaryClick = useCallback(() => {
    trackAffiliateClick(id, retailerName, pricePerRound, placement)
    if (onPrimaryClick) {
      onPrimaryClick(id)
    }
    if (isValidUrl) {
      window.open(retailerUrl, '_blank', 'noopener,noreferrer')
    }
  }, [id, retailerName, pricePerRound, placement, onPrimaryClick, isValidUrl, retailerUrl])

  const handleTrackToggle = useCallback(() => {
    const nextState = !trackingOptimistic
    setTrackingOptimistic(nextState)
    trackTrackToggle(id, nextState)

    if (nextState) {
      toast.success('Added to watchlist', {
        description: 'We\'ll notify you when the price drops.',
        action: {
          label: 'View Watchlist',
          onClick: () => window.location.href = '/dashboard/saved',
        },
        duration: 4000,
      })
    } else {
      toast.success('Removed from watchlist', {
        duration: 2000,
      })
    }

    onTrackToggle(id)
  }, [id, trackingOptimistic, onTrackToggle])

  return (
    <Card
      className={cn(
        'overflow-hidden transition-all duration-200 relative h-full flex flex-col',
        isBestPrice
          ? 'border-2 border-primary shadow-lg shadow-primary/10 scale-[1.01] z-10 bg-card'
          : 'border border-border bg-card hover:border-primary/30'
      )}
    >
      <CardContent className="p-4 flex flex-col flex-1">
        {/* Watch Button - upper right corner */}
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleTrackToggle}
                data-testid={`save-item-${id}`}
                className={cn(
                  'absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors',
                  trackingOptimistic
                    ? 'text-primary bg-primary/10 hover:bg-primary/20'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
                aria-label={trackingOptimistic ? 'Remove from watchlist' : 'Add to watchlist'}
              >
                <Bookmark
                  className={cn(
                    'h-3.5 w-3.5',
                    trackingOptimistic && 'fill-current'
                  )}
                />
                <span>{trackingOptimistic ? 'Watching' : 'Watch'}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p className="text-xs">
                {trackingOptimistic ? 'Click to remove from watchlist' : 'Get alerts when price drops'}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* 1. Product Title */}
        <h3 className="font-semibold text-foreground leading-tight pr-20 mb-2">
          {productTitle}
        </h3>

        {/* 2. Attribute Badges Row */}
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          {/* Caliber - primary identifier */}
          {caliber && (
            <span className="px-2 py-0.5 text-xs font-medium rounded border bg-muted/50 text-foreground border-border">
              {caliber}
            </span>
          )}

          {/* Bullet Type */}
          {bulletType && (
            <span className="px-2 py-0.5 text-xs font-medium rounded border bg-transparent text-muted-foreground border-border">
              {bulletType}
            </span>
          )}

          {/* Grain Weight */}
          {grain && (
            <span className="px-2 py-0.5 text-xs font-medium rounded border bg-transparent text-muted-foreground border-border">
              {grain}gr
            </span>
          )}

          {/* Casing Material - color-coded */}
          {caseMaterial && (
            <span className={cn(
              'px-2 py-0.5 text-xs font-medium rounded border',
              getCasingStyle(caseMaterial)
            )}>
              {caseMaterial}
            </span>
          )}
        </div>

        {/* 3. Retailer + Timestamp */}
        <p className="text-sm text-muted-foreground mb-3">
          <span className="font-medium text-foreground">{retailerName}</span>
          {timeAgo && (
            <span className="text-muted-foreground/70"> · {timeAgo}</span>
          )}
        </p>

        {/* 4. Price Block */}
        <div className="mb-3">
          {/* Primary: $per rd with delivery indicator */}
          <div className="flex items-baseline gap-1">
            <span className={cn(
              'font-bold font-mono tracking-tight text-2xl',
              isBestPrice ? 'text-primary' : 'text-foreground'
            )}>
              {formatPricePerRound(pricePerRound)}
            </span>
            <span className="text-sm text-muted-foreground">
              per rd {includesShipping ? 'delivered' : ''}
            </span>
          </div>

          {/* Shipping indicator */}
          {includesShipping && (
            <p className="text-xs text-muted-foreground/70 mt-0.5">
              Includes shipping
            </p>
          )}
        </div>

        {/* 5. Stock Status */}
        {inStock !== undefined && (
          <div className="mb-3">
            <span className={cn(
              'text-xs font-medium',
              inStock
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-500 dark:text-red-400'
            )}>
              {inStock ? 'In Stock' : 'Out of Stock'}
            </span>
          </div>
        )}

        {/* Spacer to push CTA to bottom */}
        <div className="flex-1" />

        {/* 6. Primary CTA */}
        <div className="mt-auto">
          <Button
            onClick={handlePrimaryClick}
            disabled={!isValidUrl}
            variant={isBestPrice ? 'default' : 'outline'}
            className={cn(
              'w-full h-10 font-medium',
              isBestPrice
                ? 'bg-primary hover:bg-primary/90 text-primary-foreground'
                : 'hover:bg-muted hover:text-foreground'
            )}
          >
            <span className="truncate">View at {retailerName}</span>
            <ArrowUpRight className="ml-2 h-4 w-4 shrink-0" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * ResultCardSkeleton - Loading placeholder
 */
export function ResultCardSkeleton() {
  return (
    <Card className="bg-card border-border overflow-hidden h-full flex flex-col">
      <CardContent className="p-4 space-y-3">
        {/* Title skeleton */}
        <div className="h-5 w-3/4 bg-muted rounded animate-pulse" />

        {/* Attribute badges skeleton */}
        <div className="flex gap-1.5">
          <div className="h-5 w-16 bg-muted rounded animate-pulse" />
          <div className="h-5 w-10 bg-muted rounded animate-pulse" />
          <div className="h-5 w-12 bg-muted rounded animate-pulse" />
          <div className="h-5 w-14 bg-muted rounded animate-pulse" />
        </div>

        {/* Retailer skeleton */}
        <div className="h-4 w-28 bg-muted/50 rounded animate-pulse" />

        {/* Price skeleton */}
        <div className="space-y-1">
          <div className="h-7 w-32 bg-muted rounded animate-pulse" />
          <div className="h-3 w-24 bg-muted/50 rounded animate-pulse" />
        </div>

        {/* Stock skeleton */}
        <div className="h-4 w-16 bg-muted/50 rounded animate-pulse" />

        {/* CTA skeleton */}
        <div className="h-10 w-full bg-muted rounded animate-pulse mt-auto" />
      </CardContent>
    </Card>
  )
}
