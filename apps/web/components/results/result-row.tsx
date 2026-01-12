'use client'

import { useCallback, useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Bookmark, ArrowUpRight, ChevronUp, ChevronDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { trackAffiliateClick, trackTrackToggle } from '@/lib/analytics'
import { toast } from 'sonner'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

/**
 * ResultRow Props - Grid/Table View
 *
 * Optimized for: Execution / optimization mode
 * "I know what I want. Just let me sort."
 *
 * Dense, scannable, no editorial language.
 */
export interface ResultRowProps {
  id: string
  productTitle: string
  pricePerRound: number
  totalPrice?: number
  roundCount?: number
  inStock?: boolean
  retailerName: string
  retailerUrl: string
  isTracked: boolean
  placement?: 'search' | 'for_you' | 'product_detail'
  onTrackToggle: (id: string) => void
  onPrimaryClick?: (id: string) => void
}

/**
 * Format price per round
 */
function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`
}

/**
 * Truncate text with ellipsis
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength).trim() + '…'
}

/**
 * ResultRow Component - Dense table row for grid view
 *
 * No badges, no highlighting, no editorial language.
 * Pure data for fast scanning and sorting.
 */
export function ResultRow({
  id,
  productTitle,
  pricePerRound,
  totalPrice,
  roundCount,
  inStock,
  retailerName,
  retailerUrl,
  isTracked,
  placement = 'search',
  onTrackToggle,
  onPrimaryClick,
}: ResultRowProps) {
  const [trackingOptimistic, setTrackingOptimistic] = useState(isTracked)

  useEffect(() => {
    setTrackingOptimistic(isTracked)
  }, [isTracked])

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

  const displayTotal = totalPrice ?? pricePerRound * (roundCount || 1000)

  return (
    <tr className="border-b border-border hover:bg-muted/50 transition-colors">
      {/* Product */}
      <td className="py-3 px-4">
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="font-medium text-foreground cursor-default">
                {truncate(productTitle, 40)}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <p className="text-xs">{productTitle}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </td>

      {/* Retailer */}
      <td className="py-3 px-4 text-sm text-muted-foreground">
        {truncate(retailerName, 20)}
      </td>

      {/* $/rd - Primary price metric with dot indicator */}
      <td className="py-3 px-4">
        <div className="flex items-baseline gap-1">
          <span className="font-mono font-bold text-lg text-foreground">
            {formatPrice(pricePerRound)}
          </span>
          <span className="text-primary text-lg">•</span>
          <span className="text-xs text-muted-foreground">/rd</span>
        </div>
      </td>

      {/* Total - De-emphasized secondary info */}
      <td className="py-3 px-4 text-xs text-muted-foreground/70">
        {formatPrice(displayTotal)}
        {roundCount && <span className="ml-1">({roundCount.toLocaleString()})</span>}
      </td>

      {/* In Stock - Badge instead of dot */}
      <td className="py-3 px-4 text-center">
        {inStock !== undefined && (
          <Badge
            variant="outline"
            className={cn(
              'text-xs font-medium',
              inStock
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-red-400 text-red-500 dark:text-red-400'
            )}
          >
            {inStock ? 'In Stock' : 'Out'}
          </Badge>
        )}
      </td>

      {/* Save */}
      <td className="py-3 px-4 text-center">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleTrackToggle}
                className={cn(
                  'p-1 rounded transition-colors',
                  trackingOptimistic
                    ? 'text-primary'
                    : 'text-muted-foreground/50 hover:text-muted-foreground'
                )}
                aria-label={trackingOptimistic ? 'Remove from watchlist' : 'Add to watchlist'}
              >
                <Bookmark className={cn('h-4 w-4', trackingOptimistic && 'fill-current')} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p className="text-xs">
                {trackingOptimistic ? 'Watching' : 'Watch'}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </td>

      {/* Action */}
      <td className="py-3 px-4">
        <Button
          onClick={handlePrimaryClick}
          disabled={!isValidUrl}
          size="sm"
          variant="outline"
          className="h-8 text-xs"
        >
          View
          <ArrowUpRight className="ml-1 h-3 w-3" />
        </Button>
      </td>
    </tr>
  )
}

/**
 * Sort direction type
 */
export type SortDirection = 'asc' | 'desc' | null

/**
 * Column sort configuration
 */
export interface ColumnSort {
  column: string
  direction: SortDirection
}

/**
 * Grid-specific sort options (client-side)
 * These extend the URL-based sorts with grid-only columns
 */
export type GridSortColumn = 'price' | 'total' | 'stock'
export type GridSort = {
  column: GridSortColumn
  direction: 'asc' | 'desc'
} | null

interface ResultTableHeaderProps {
  currentSort?: string // e.g., 'price_asc', 'price_desc', 'date_desc'
  gridSort?: GridSort // Client-side grid sorting
  onSortChange?: (sortValue: string) => void
  onGridSortChange?: (sort: GridSort) => void
}

/**
 * Sortable column header - supports both URL-based and client-side sorting
 */
function SortableHeader({
  children,
  column,
  currentSort,
  gridSort,
  onSortChange,
  onGridSortChange,
  ascValue,
  descValue,
  isGridSort = false,
  className = '',
}: {
  children: React.ReactNode
  column: string
  currentSort?: string
  gridSort?: GridSort
  onSortChange?: (sortValue: string) => void
  onGridSortChange?: (sort: GridSort) => void
  ascValue?: string
  descValue?: string
  isGridSort?: boolean // If true, use client-side grid sorting
  className?: string
}) {
  // Determine active state based on sort type
  let isAsc = false
  let isDesc = false

  if (isGridSort && gridSort) {
    isAsc = gridSort.column === column && gridSort.direction === 'asc'
    isDesc = gridSort.column === column && gridSort.direction === 'desc'
  } else if (!isGridSort && currentSort) {
    isAsc = currentSort === ascValue
    isDesc = currentSort === descValue
  }

  const isActive = isAsc || isDesc

  const handleClick = () => {
    if (isGridSort && onGridSortChange) {
      // Client-side grid sorting
      if (isAsc) {
        onGridSortChange({ column: column as GridSortColumn, direction: 'desc' })
      } else if (isDesc) {
        onGridSortChange(null) // Clear sort
      } else {
        onGridSortChange({ column: column as GridSortColumn, direction: 'asc' })
      }
    } else if (!isGridSort && onSortChange && ascValue && descValue) {
      // URL-based sorting
      if (isAsc) {
        onSortChange(descValue)
      } else if (isDesc) {
        onSortChange('relevance')
      } else {
        onSortChange(ascValue)
      }
    }
  }

  return (
    <th
      className={cn(
        'py-3 px-4 cursor-pointer select-none hover:bg-muted/50 transition-colors',
        isActive && 'text-foreground',
        className
      )}
      onClick={handleClick}
    >
      <div className="flex items-center gap-1">
        <span>{children}</span>
        <span className="inline-flex flex-col text-[10px] leading-none">
          <ChevronUp
            className={cn(
              'h-3 w-3 -mb-1',
              isAsc ? 'text-foreground' : 'text-muted-foreground/30'
            )}
          />
          <ChevronDown
            className={cn(
              'h-3 w-3',
              isDesc ? 'text-foreground' : 'text-muted-foreground/30'
            )}
          />
        </span>
      </div>
    </th>
  )
}

/**
 * ResultTableHeader - Column headers for grid view with sortable columns
 */
export function ResultTableHeader({
  currentSort,
  gridSort,
  onSortChange,
  onGridSortChange
}: ResultTableHeaderProps) {
  return (
    <thead className="bg-muted/30">
      <tr className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
        <th className="py-3 px-4">Product</th>
        <th className="py-3 px-4">Retailer</th>
        <SortableHeader
          column="price"
          currentSort={currentSort}
          onSortChange={onSortChange}
          ascValue="price_asc"
          descValue="price_desc"
        >
          $/rd
        </SortableHeader>
        <SortableHeader
          column="total"
          gridSort={gridSort}
          onGridSortChange={onGridSortChange}
          isGridSort
        >
          Total Price
        </SortableHeader>
        <SortableHeader
          column="stock"
          gridSort={gridSort}
          onGridSortChange={onGridSortChange}
          isGridSort
          className="text-center"
        >
          Stock
        </SortableHeader>
        <th className="py-3 px-4 text-center">Watch</th>
        <th className="py-3 px-4">Action</th>
      </tr>
    </thead>
  )
}

/**
 * ResultRowSkeleton - Loading placeholder for table row
 */
export function ResultRowSkeleton() {
  return (
    <tr className="border-b border-border">
      <td className="py-3 px-4"><div className="h-4 w-48 bg-muted rounded animate-pulse" /></td>
      <td className="py-3 px-4"><div className="h-4 w-24 bg-muted rounded animate-pulse" /></td>
      <td className="py-3 px-4"><div className="h-4 w-14 bg-muted rounded animate-pulse" /></td>
      <td className="py-3 px-4"><div className="h-4 w-20 bg-muted rounded animate-pulse" /></td>
      <td className="py-3 px-4"><div className="h-4 w-4 bg-muted rounded animate-pulse mx-auto" /></td>
      <td className="py-3 px-4"><div className="h-4 w-4 bg-muted rounded animate-pulse mx-auto" /></td>
      <td className="py-3 px-4"><div className="h-8 w-16 bg-muted rounded animate-pulse" /></td>
    </tr>
  )
}
