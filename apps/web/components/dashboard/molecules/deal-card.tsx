'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ContextChip } from '../atoms/context-chip'
import { ExternalLink, Bookmark, ChevronDown, ChevronUp } from 'lucide-react'
import type { ProductCardProps } from '@/types/dashboard'

/**
 * ProductCard - Product card with price context (ADR-006 compliant)
 *
 * Trading terminal-style card displaying:
 * - Product name + caliber
 * - Price per round (prominent)
 * - Price context indicator (descriptive, not prescriptive)
 * - Stock status
 * - View at Retailer CTA
 * - Premium: Context explanation expandable
 */
export function ProductCard({
  item,
  isPremium: _isPremium = false,
  onViewClick,
  onWatchlistClick,
}: ProductCardProps) {
  const [expanded, setExpanded] = useState(false)

  const handleViewClick = () => {
    if (onViewClick) {
      onViewClick()
    } else {
      window.open(item.url, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <Card className="bg-card hover:bg-card/80 transition-colors duration-200 border-border overflow-hidden">
      <CardContent className="p-4 space-y-3">
        {/* Top row: Retailer + Watchlist indicator */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {item.retailer.name}
          </span>
          {item.isWatched && (
            <span className="text-xs text-primary flex items-center gap-1">
              <Bookmark className="h-3 w-3" />
              Saved
            </span>
          )}
        </div>

        {/* Product info */}
        <div>
          <h4 className="font-medium text-foreground leading-tight line-clamp-2">
            {item.product.name}
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            {item.product.caliber}
            {item.product.grainWeight && ` • ${item.product.grainWeight}gr`}
          </p>
        </div>

        {/* Price section - emphasized */}
        <div className="flex items-end justify-between">
          <div>
            {item.pricePerRound !== null ? (
              <>
                <div className="text-2xl font-bold text-foreground">
                  ${item.pricePerRound.toFixed(3)}
                </div>
                <div className="text-xs text-muted-foreground">per round</div>
              </>
            ) : (
              <>
                <div className="text-xl font-bold text-foreground">
                  ${item.price.toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground">total price</div>
              </>
            )}
          </div>

          {item.priceSignal && (
            <ContextChip
              context={item.priceSignal.contextBand}
              size="sm"
              showTooltip
            />
          )}
        </div>

        {/* Stock status */}
        {item.inStock && (
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="text-status-buy">In Stock</span>
          </div>
        )}

        {item.explanation && (
          <div>
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Why this match?
              {expanded ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>
            {expanded && (
              <p className="mt-2 text-xs text-muted-foreground animate-in slide-in-from-top-2">
                {item.explanation}
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Button
            onClick={handleViewClick}
            className="flex-1 h-10 bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            View at Retailer
            <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
          </Button>
          {onWatchlistClick && !item.isWatched && (
            <Button
              variant="outline"
              onClick={onWatchlistClick}
              className="h-10 px-3"
              aria-label="Save item"
            >
              <Bookmark className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
