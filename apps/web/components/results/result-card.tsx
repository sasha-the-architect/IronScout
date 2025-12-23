'use client'

import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'
import { trackAffiliateClick, trackTrackToggle, trackDetailsToggle } from '@/lib/analytics'
import { toast } from 'sonner'

/**
 * ResultCard Props - Exact spec contract
 *
 * Primary KPI: Affiliate Clicks
 * Every card optimizes for outbound retailer clicks.
 * Tracking is a retention affordance, not the goal.
 */
export interface ResultCardProps {
  id: string

  pricePerRound: number
  currency?: 'USD'

  inStock?: boolean

  productTitle: string
  retailerName: string
  retailerUrl: string

  caliber: string
  grain?: string | number
  caseMaterial?: string

  isTracked: boolean

  /** Visual emphasis - crown this card as the default choice */
  isBestPrice?: boolean

  /** Reserved for future insight line (e.g., "Lowest price this week") */
  topSlot?: React.ReactNode

  /** Placement context for analytics */
  placement?: 'search' | 'for_you' | 'product_detail'

  onTrackToggle: (id: string) => void
  onPrimaryClick?: (id: string) => void
}

/**
 * Format price per round with consistent precision
 */
function formatPricePerRound(price: number): string {
  return `$${price.toFixed(3)}`
}

/**
 * Format price per 1,000 rounds
 */
function formatPer1000(pricePerRound: number): string {
  const per1000 = pricePerRound * 1000
  return `$${per1000.toFixed(2)}`
}

/**
 * Truncate title for collapsed state
 */
function truncateTitle(title: string, maxLength: number = 40): string {
  if (title.length <= maxLength) return title
  return title.slice(0, maxLength).trim() + '…'
}

/**
 * ResultCard Component
 *
 * Revised hierarchy:
 * 1. Best price badge (if applicable)
 * 2. Price block (largest visual element)
 * 3. Availability (directly under price - users check this immediately)
 * 4. Primary CTA: View at retailer
 * 5. Track price (inline text, not button)
 * 6. Details (collapsed, truncated title)
 */
export function ResultCard({
  id,
  pricePerRound,
  currency = 'USD',
  inStock,
  productTitle,
  retailerName,
  retailerUrl,
  caliber,
  grain,
  caseMaterial,
  isTracked,
  isBestPrice = false,
  topSlot,
  placement = 'search',
  onTrackToggle,
  onPrimaryClick,
}: ResultCardProps) {
  const [detailsExpanded, setDetailsExpanded] = useState(false)
  const [trackingOptimistic, setTrackingOptimistic] = useState(isTracked)

  const isValidUrl = retailerUrl && retailerUrl.startsWith('http')

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
    toast.success(nextState ? 'Price tracking enabled' : 'Price tracking removed', {
      duration: 2000,
    })
    onTrackToggle(id)
  }, [id, trackingOptimistic, onTrackToggle])

  const handleDetailsToggle = useCallback(() => {
    const nextState = !detailsExpanded
    setDetailsExpanded(nextState)
    trackDetailsToggle(id, nextState)
  }, [id, detailsExpanded])

  return (
    <Card
      className={cn(
        'overflow-hidden transition-all duration-200',
        isBestPrice
          ? 'bg-card border-primary/40 ring-1 ring-primary/20 shadow-md shadow-primary/5'
          : 'bg-card border-border hover:border-primary/30'
      )}
    >
      <CardContent className="p-4 space-y-2.5">
        {/* 1. Best Price Badge - visual crown with qualifier for trust */}
        {isBestPrice && (
          <div className="-mt-1 mb-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary" />
              Best price
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5 pl-3">
              Lowest available right now
            </p>
          </div>
        )}

        {/* Reserved Insight Slot */}
        {topSlot && (
          <div className="pb-2 border-b border-border">
            {topSlot}
          </div>
        )}

        {/* 2. Price Block - largest visual element */}
        <div className="space-y-0.5">
          <div className={cn(
            'font-bold font-mono tracking-tight',
            isBestPrice ? 'text-2xl text-primary' : 'text-2xl text-foreground'
          )}>
            {formatPricePerRound(pricePerRound)}
            <span className="text-sm font-normal text-muted-foreground ml-1">/ rd</span>
          </div>
          <div className="text-sm text-muted-foreground">
            {formatPer1000(pricePerRound)} per 1,000
          </div>
        </div>

        {/* 3. Availability - directly under price (users check this immediately) */}
        {inStock !== undefined && (
          <p className={cn(
            'text-xs',
            inStock ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
          )}>
            {inStock ? 'In stock' : 'Out of stock'}
          </p>
        )}

        {/* 4. Primary CTA: View at retailer */}
        <Button
          onClick={handlePrimaryClick}
          disabled={!isValidUrl}
          className="w-full h-10 font-medium bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          View at {retailerName}
          <ExternalLink className="ml-2 h-3.5 w-3.5" />
        </Button>

        {/* 5. Footer: Details toggle + Track price (insurance, not fork) */}
        <div className="pt-2 border-t border-border space-y-2">
          {/* Details toggle */}
          <button
            onClick={handleDetailsToggle}
            className="flex items-center justify-between w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="truncate pr-2">
              {detailsExpanded ? 'Hide details' : truncateTitle(productTitle, 35)}
            </span>
            {detailsExpanded ? (
              <ChevronUp className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            )}
          </button>

          {detailsExpanded && (
            <div className="space-y-1.5 text-sm animate-in slide-in-from-top-2 duration-200">
              <p className="font-medium text-foreground leading-tight">
                {productTitle}
              </p>
              <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                <span>{caliber}</span>
                {grain && <span>· {grain}gr</span>}
                {caseMaterial && <span>· {caseMaterial}</span>}
              </div>
            </div>
          )}

          {/* Track price - subtle text at bottom, insurance not a fork */}
          <button
            onClick={handleTrackToggle}
            className={cn(
              'text-[11px] transition-colors',
              trackingOptimistic
                ? 'text-primary/70 hover:text-primary'
                : 'text-muted-foreground/60 hover:text-muted-foreground'
            )}
          >
            {trackingOptimistic ? 'Tracking · Stop' : 'Track price'}
          </button>
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
    <Card className="bg-card border-border overflow-hidden">
      <CardContent className="p-4 space-y-2.5">
        <div className="space-y-1">
          <div className="h-7 w-20 bg-muted rounded animate-pulse" />
          <div className="h-4 w-28 bg-muted rounded animate-pulse" />
        </div>
        <div className="h-3 w-14 bg-muted rounded animate-pulse" />
        <div className="h-10 w-full bg-muted rounded animate-pulse" />
        <div className="h-4 w-16 mx-auto bg-muted/50 rounded animate-pulse" />
        <div className="pt-2 border-t border-border">
          <div className="h-4 w-32 bg-muted rounded animate-pulse" />
        </div>
      </CardContent>
    </Card>
  )
}
