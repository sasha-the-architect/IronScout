'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  ChevronDown,
  ChevronUp,
  ChevronRight,
  TrendingDown,
} from 'lucide-react'

/**
 * Lowest price item - matches backend pricing response for scope=global
 */
export interface BestPriceItem {
  id: string
  product: {
    id: string
    name: string
    caliber: string | null
    brand: string | null
    imageUrl: string | null
    roundCount: number | null
    grainWeight: number | null
  }
  retailer: {
    id: string
    name: string
    logoUrl: string | null
  }
  price: number
  pricePerRound: number | null
  url: string
  inStock: boolean
  updatedAt: string | null
}

interface BestPricesProps {
  items: BestPriceItem[]
  /** Footer text varies by dashboard state */
  footerText?: string
}

/**
 * BestPrices - Dashboard "Current Prices We're Seeing" section
 *
 * Per dashboard-product-spec.md:
 * - Always shown in every state
 * - Never framed as recommendation
 * - Copy must imply opportunity, not advice
 * - Footer varies by state
 */
export function BestPrices({ items, footerText }: BestPricesProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  // Default footer text if not provided
  const defaultFooter = "Price updates like these are surfaced when items are in your watchlist."

  return (
    <div className="space-y-3">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1.5 text-xs font-medium text-primary uppercase tracking-wide"
      >
        {isExpanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronUp className="h-3 w-3" />
        )}
        <TrendingDown className="h-3 w-3" />
        Current Prices We're Seeing
      </button>

      {isExpanded && (
        <>
          {items.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No notable price changes right now. Check back later.
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <BestPriceRow key={item.id} item={item} />
              ))}
            </div>
          )}

          {/* Footer copy per spec */}
          <p className="text-xs text-center text-muted-foreground pt-2">
            {footerText || defaultFooter}
          </p>
        </>
      )}
    </div>
  )
}

interface BestPriceRowProps {
  item: BestPriceItem
}

function BestPriceRow({ item }: BestPriceRowProps) {
  const { product, retailer, pricePerRound, url } = item

  // Format price per round as dollars with dot indicator
  const formatPrice = () => {
    if (pricePerRound !== null) {
      return `$${pricePerRound.toFixed(2)}`
    }
    return `$${item.price.toFixed(2)}`
  }

  return (
    <div className="flex items-center gap-4 py-3 px-4 rounded-lg bg-muted/20 hover:bg-muted/30 transition-colors">
      {/* Product Info */}
      <div className="flex-1 min-w-0">
        {/* Caliber */}
        <div className="text-xs text-muted-foreground mb-0.5">
          {product.caliber || 'Unknown'}
        </div>
        {/* Product Name */}
        <div className="font-medium text-sm text-foreground truncate">
          {product.name}
        </div>
      </div>

      {/* Price with dot indicator */}
      <div className="flex items-baseline gap-1 flex-shrink-0">
        <span className="text-lg font-bold text-primary font-mono">
          {formatPrice()}
        </span>
        <span className="text-xs text-muted-foreground">per rd delivered</span>
      </div>

      {/* Retailer Button */}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          variant="outline"
          size="sm"
          className="gap-1 whitespace-nowrap h-8 text-xs bg-muted/50 border-border hover:bg-muted"
        >
          {retailer.name}
          <ChevronRight className="h-3 w-3" />
        </Button>
      </a>
    </div>
  )
}
