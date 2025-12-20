'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { DealTag } from '../atoms/deal-tag'
import { VerdictChip } from '../atoms/verdict-chip'
import { ExternalLink, Eye, ChevronDown, ChevronUp } from 'lucide-react'
import type { DealCardProps, DealLabel } from '@/types/dashboard'
import { UPGRADE_COPY } from '@/types/dashboard'

/**
 * DealCard - Product deal card with verdict and CTA
 *
 * Trading terminal-style card displaying:
 * - Deal tag (HOT_DEAL, NEW_LOW, BULK_VALUE)
 * - Product name + caliber
 * - Price per round (prominent)
 * - Urgency signals (max 2)
 * - Buy Now CTA
 * - Premium: "Why you're seeing this" expandable
 */
export function DealCard({
  deal,
  isPremium = false,
  onBuyClick,
  onWatchlistClick,
}: DealCardProps) {
  const [expanded, setExpanded] = useState(false)

  // Determine deal tag based on score or position
  const getDealLabel = (): DealLabel | null => {
    if (deal.bestValueScore && deal.bestValueScore >= 85) return 'HOT_DEAL'
    if (deal.pricePerRound && deal.product.roundCount && deal.product.roundCount >= 500)
      return 'BULK_VALUE'
    // Could also detect NEW_LOW from price history
    return null
  }

  const dealLabel = getDealLabel()

  const handleBuyClick = () => {
    if (onBuyClick) {
      onBuyClick()
    } else {
      window.open(deal.url, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <Card className="bg-card hover:bg-card/80 transition-colors duration-200 border-border overflow-hidden">
      <CardContent className="p-4 space-y-3">
        {/* Top row: Deal tag + Watchlist indicator */}
        <div className="flex items-center justify-between">
          {dealLabel ? (
            <DealTag label={dealLabel} size="sm" />
          ) : (
            <span className="text-xs text-muted-foreground">
              {deal.retailer.name}
            </span>
          )}
          {deal.isWatched && (
            <span className="text-xs text-primary flex items-center gap-1">
              <Eye className="h-3 w-3" />
              Watching
            </span>
          )}
        </div>

        {/* Product info */}
        <div>
          <h4 className="font-medium text-foreground leading-tight line-clamp-2">
            {deal.product.name}
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            {deal.product.caliber}
            {deal.product.grainWeight && ` • ${deal.product.grainWeight}gr`}
          </p>
        </div>

        {/* Price section - emphasized */}
        <div className="flex items-end justify-between">
          <div>
            {deal.pricePerRound !== null ? (
              <>
                <div className="text-2xl font-bold text-foreground">
                  ${deal.pricePerRound.toFixed(3)}
                </div>
                <div className="text-xs text-muted-foreground">per round</div>
              </>
            ) : (
              <>
                <div className="text-xl font-bold text-foreground">
                  ${deal.price.toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground">total price</div>
              </>
            )}
          </div>

          {/* Best value score badge (Premium) */}
          {isPremium && deal.bestValueScore && (
            <div className="text-right">
              <div className="text-sm font-semibold text-primary">
                {deal.bestValueScore}
              </div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Value Score
              </div>
            </div>
          )}
        </div>

        {/* Urgency signals - max 2 */}
        {deal.inStock && (
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="text-status-buy">In Stock</span>
            {deal.retailer.tier === 'PREMIUM' && (
              <span>Trusted Retailer</span>
            )}
          </div>
        )}

        {/* Premium: Explanation expandable */}
        {isPremium && deal.explanation && (
          <div>
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Why this deal?
              {expanded ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>
            {expanded && (
              <p className="mt-2 text-xs text-muted-foreground animate-in slide-in-from-top-2">
                {deal.explanation}
              </p>
            )}
          </div>
        )}

        {/* Free tier: Upgrade teaser */}
        {!isPremium && (
          <p className="text-xs text-muted-foreground italic">
            {UPGRADE_COPY.DEAL_EXPLANATION}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Button
            onClick={handleBuyClick}
            className="flex-1 h-10 bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            Buy Now
            <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
          </Button>
          {onWatchlistClick && !deal.isWatched && (
            <Button
              variant="outline"
              onClick={onWatchlistClick}
              className="h-10 px-3"
              aria-label="Add to watchlist"
            >
              <Eye className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
