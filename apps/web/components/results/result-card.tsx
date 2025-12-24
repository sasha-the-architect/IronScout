'use client'

import { useState, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Bell, ChevronDown, ArrowUpRight, Circle } from 'lucide-react'
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
 * ResultCard Props - Clean Scannable View Spec
 *
 * Primary KPI: Affiliate Clicks
 * Hierarchy: Title → Badges → Price → Retailer → CTA → Secondary Action
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

  caliber: string
  grain?: string | number
  caseMaterial?: string

  isTracked: boolean

  /** Visual emphasis - crown this card with scale + border */
  isBestPrice?: boolean

  /** Badges to display (can have multiple) */
  badges?: CardBadge[]

  /** Placement context for analytics */
  placement?: 'search' | 'for_you' | 'product_detail'

  onTrackToggle: (id: string) => void
  onPrimaryClick?: (id: string) => void
  onWhyThisPrice?: (id: string) => void
}

/**
 * Format price per round with consistent precision
 */
function formatPricePerRound(price: number): string {
  return `$${price.toFixed(2)}`
}

/**
 * Format total price with round count
 */
function formatTotalPrice(total: number, roundCount?: number): string {
  if (roundCount && roundCount > 0) {
    return `$${total.toFixed(2)} total (${roundCount.toLocaleString()} rds)`
  }
  return `$${total.toFixed(2)} total`
}

/**
 * Get badge styles based on type
 */
function getBadgeStyles(type: BadgeType): string {
  switch (type) {
    case 'lowest_price':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
    case 'in_stock':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
    case 'price_drop':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
    case 'new_listing':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

/**
 * ResultCard Component - Clean Scannable View
 *
 * Hierarchy per spec:
 * 1. Product title (prominent at top)
 * 2. Badges (Current Lowest Price, In Stock, etc.)
 * 3. Price block ($/rd primary, total secondary)
 * 4. Retailer line
 * 5. Primary CTA: VIEW AT RETAILER
 * 6. Secondary: Why this price?
 *
 * Crowned card: +2% scale, green border
 * Alert bell: upper-right, filled when tracking
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
  grain,
  caseMaterial,
  isTracked,
  isBestPrice = false,
  badges = [],
  placement = 'search',
  onTrackToggle,
  onPrimaryClick,
  onWhyThisPrice,
}: ResultCardProps) {
  const [trackingOptimistic, setTrackingOptimistic] = useState(isTracked)

  // Sync optimistic state with prop changes
  useEffect(() => {
    setTrackingOptimistic(isTracked)
  }, [isTracked])

  const isValidUrl = retailerUrl && retailerUrl.startsWith('http')

  // Build badges array - add automatic badges based on props
  const displayBadges: CardBadge[] = [...badges]

  // Add "Current Lowest Price" badge for crowned cards if not already present
  if (isBestPrice && !displayBadges.some(b => b.type === 'lowest_price')) {
    displayBadges.unshift({ type: 'lowest_price', label: 'Current Lowest Price' })
  }

  // Stock indicator helper
  const getStockIndicator = () => {
    if (inStock === undefined) return null
    if (inStock) {
      return { color: 'text-emerald-500', fill: 'fill-emerald-500', label: 'In stock' }
    }
    return { color: 'text-red-400', fill: '', label: 'Out of stock' }
  }
  const stockIndicator = getStockIndicator()

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
    toast.success(nextState ? 'Alert created for price changes' : 'Alert removed', {
      duration: 2000,
    })
    onTrackToggle(id)
  }, [id, trackingOptimistic, onTrackToggle])

  const handleWhyThisPrice = useCallback(() => {
    if (onWhyThisPrice) {
      onWhyThisPrice(id)
    }
  }, [id, onWhyThisPrice])

  // Calculate total if not provided
  const displayTotal = totalPrice ?? pricePerRound * (roundCount || 1000)

  return (
    <Card
      className={cn(
        'overflow-hidden transition-all duration-200 relative h-full flex flex-col',
        isBestPrice
          ? 'border-2 border-emerald-500 dark:border-emerald-400 shadow-lg scale-[1.02] z-10 bg-card'
          : 'border border-border bg-card hover:border-border/80'
      )}
    >
      <CardContent className="p-4 flex flex-col flex-1">
        {/* Alert Bell - upper right corner */}
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleTrackToggle}
                className={cn(
                  'absolute top-3 right-3 p-1.5 rounded-full transition-colors',
                  trackingOptimistic
                    ? 'text-primary bg-primary/10 hover:bg-primary/20'
                    : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted'
                )}
                aria-label={trackingOptimistic ? 'Remove price alert' : 'Create price alert'}
              >
                <Bell
                  className={cn(
                    'h-4 w-4',
                    trackingOptimistic && 'fill-current'
                  )}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p className="text-xs">
                {trackingOptimistic ? 'Alert active · Click to remove' : 'Alert me on price changes'}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* 1. Product Title - prominent at top */}
        <h3 className="font-semibold text-foreground leading-tight pr-8 mb-3">
          {productTitle}
        </h3>

        {/* 2. Pricing Block - fixed height for alignment */}
        <div className="mb-3">
          <div className="flex items-center gap-2">
            <div className="font-bold font-mono tracking-tight text-2xl text-foreground">
              {formatPricePerRound(pricePerRound)}
              <span className="text-base font-normal text-muted-foreground ml-1">/ rd</span>
            </div>
            {stockIndicator && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex" aria-label={stockIndicator.label}>
                      <Circle className={cn('h-3 w-3', stockIndicator.color, stockIndicator.fill)} />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p className="text-xs">{stockIndicator.label}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {formatTotalPrice(displayTotal, roundCount)}
          </p>
        </div>

        {/* 3. Badges - below pricing for alignment */}
        <div className="min-h-[24px] mb-3">
          {displayBadges.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {displayBadges.map((badge, index) => (
                <span
                  key={`${badge.type}-${index}`}
                  className={cn(
                    'px-2 py-0.5 rounded text-xs font-medium',
                    getBadgeStyles(badge.type)
                  )}
                >
                  {badge.label}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 4. Retailer Line */}
        <p className="text-sm text-muted-foreground mb-3">
          Sold by <span className="font-medium text-foreground">{retailerName}</span>
        </p>

        {/* Spacer to push CTA to bottom */}
        <div className="flex-1" />

        {/* 5. Primary CTA - always at bottom */}
        <div className="space-y-2 mt-auto">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handlePrimaryClick}
                  disabled={!isValidUrl}
                  className="w-full h-11 font-semibold uppercase tracking-wide bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  <span className="truncate">View at {retailerName}</span>
                  <ArrowUpRight className="ml-2 h-4 w-4 shrink-0" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">View at {retailerName}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* 6. Secondary Action: Why this price? */}
          <button
            onClick={handleWhyThisPrice}
            className="flex items-center justify-center w-full text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            Why this price?
            <ChevronDown className="ml-1 h-4 w-4" />
          </button>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * ResultCardSkeleton - Loading placeholder matching new layout
 */
export function ResultCardSkeleton() {
  return (
    <Card className="bg-card border-border overflow-hidden h-full flex flex-col">
      <CardContent className="p-4 space-y-3">
        {/* Title skeleton */}
        <div className="h-5 w-3/4 bg-muted rounded animate-pulse" />

        {/* Badge skeleton */}
        <div className="flex gap-1.5">
          <div className="h-5 w-20 bg-muted rounded animate-pulse" />
        </div>

        {/* Price skeleton */}
        <div className="space-y-1">
          <div className="h-3 w-16 bg-muted/50 rounded animate-pulse" />
          <div className="h-8 w-24 bg-muted rounded animate-pulse" />
          <div className="h-4 w-32 bg-muted/50 rounded animate-pulse" />
        </div>

        {/* Retailer skeleton */}
        <div className="space-y-1">
          <div className="h-3 w-12 bg-muted/50 rounded animate-pulse" />
          <div className="h-5 w-28 bg-muted rounded animate-pulse" />
        </div>

        {/* CTA skeleton */}
        <div className="h-11 w-full bg-muted rounded animate-pulse" />

        {/* Secondary action skeleton */}
        <div className="h-4 w-24 mx-auto bg-muted/50 rounded animate-pulse" />
      </CardContent>
    </Card>
  )
}
