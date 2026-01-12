'use client'

import { cn } from '@/lib/utils'
import { ContextChip } from '../atoms/context-chip'
import { Sparkline, generateSparklineFromTrend } from '../atoms/sparkline'
import { PriceDelta } from '../atoms/price-delta'
import type { PulseRowProps } from '@/types/dashboard'

/**
 * PulseRow - Market status row for a caliber (ADR-006 compliant)
 *
 * Trading terminal-style row showing:
 * - Caliber name
 * - Current avg price
 * - Sparkline trend chart
 * - Price context chip (descriptive, not prescriptive)
 * - Premium: Click for full chart
 */
export function PulseRow({ pulse, isPremium: _isPremium = false, onClick }: PulseRowProps) {
  const sparklineData = generateSparklineFromTrend(pulse.trend, 7)
  const canClick = !!onClick

  const handleClick = () => {
    if (onClick) {
      onClick()
    }
  }

  return (
    <div
      onClick={handleClick}
      className={cn(
        'flex items-center gap-3 py-3 px-3 rounded-lg transition-colors',
        'border border-transparent',
        canClick && 'cursor-pointer hover:bg-muted/50 hover:border-border'
      )}
      role={canClick ? 'button' : undefined}
      tabIndex={canClick ? 0 : undefined}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && canClick) {
          e.preventDefault()
          onClick()
        }
      }}
    >
      {/* Caliber name */}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-foreground truncate">{pulse.caliber}</div>
        {pulse.currentAvg !== null && (
          <div className="text-xs text-muted-foreground">
            ${pulse.currentAvg.toFixed(2)}/rd
          </div>
        )}
      </div>

      {/* Trend sparkline */}
      <div className="flex-shrink-0">
        <Sparkline data={sparklineData} trend={pulse.trend} width={48} height={18} />
      </div>

      {/* Price delta */}
      <div className="flex-shrink-0 w-16 text-right">
        <PriceDelta percent={pulse.trendPercent} size="sm" showArrow={false} />
      </div>

      {/* Price context chip (ADR-006 compliant) */}
      <div className="flex-shrink-0">
        <ContextChip context={pulse.priceContext} size="sm" showTooltip />
      </div>

      {canClick && (
        <div className="flex-shrink-0 text-muted-foreground">
          <span className="sr-only">Click for full chart</span>
        </div>
      )}
    </div>
  )
}

/**
 * PulseRowSkeleton - Loading state
 */
export function PulseRowSkeleton() {
  return (
    <div className="flex items-center gap-3 py-3 px-3 animate-pulse">
      <div className="flex-1">
        <div className="h-4 w-20 bg-muted rounded" />
        <div className="h-3 w-14 bg-muted rounded mt-1" />
      </div>
      <div className="h-4 w-12 bg-muted rounded" />
      <div className="h-4 w-12 bg-muted rounded" />
      <div className="h-5 w-16 bg-muted rounded" />
    </div>
  )
}
