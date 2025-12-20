'use client'

import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { PriceDeltaProps } from '@/types/dashboard'

const SIZE_CLASSES = {
  sm: 'text-xs gap-0.5',
  md: 'text-sm gap-1',
}

const ICON_SIZES = {
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
}

/**
 * PriceDelta - Price change indicator
 *
 * Shows percentage change with directional arrow.
 * Color-coded: Green (down/good), Red (up/bad), Gray (stable)
 */
export function PriceDelta({
  percent,
  showArrow = true,
  size = 'md',
}: PriceDeltaProps) {
  const isPositive = percent > 0
  const isNegative = percent < 0
  const isNeutral = percent === 0 || (percent > -1 && percent < 1)

  // For ammo prices, negative (price drop) is good
  const colorClass = isNegative
    ? 'text-status-buy'
    : isPositive
      ? 'text-status-wait'
      : 'text-muted-foreground'

  const Icon = isNegative ? TrendingDown : isPositive ? TrendingUp : Minus

  const formattedPercent = Math.abs(percent).toFixed(1)
  const sign = isPositive ? '+' : isNegative ? '' : ''

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium',
        SIZE_CLASSES[size],
        colorClass
      )}
      aria-label={`Price ${isNegative ? 'down' : isPositive ? 'up' : 'unchanged'} ${formattedPercent}%`}
    >
      {showArrow && (
        <Icon className={cn(ICON_SIZES[size])} aria-hidden="true" />
      )}
      <span>
        {sign}
        {isNegative ? '-' : ''}
        {formattedPercent}%
      </span>
    </span>
  )
}
