'use client'

import { cn } from '@/lib/utils'
import { VerdictChip } from '../atoms/verdict-chip'
import { Sparkline, generateSparklineFromTrend } from '../atoms/sparkline'
import { PriceDelta } from '../atoms/price-delta'
import { Lock } from 'lucide-react'
import type { PulseRowProps } from '@/types/dashboard'
import { UPGRADE_COPY } from '@/types/dashboard'

/**
 * PulseRow - Market status row for a caliber
 *
 * Trading terminal-style row showing:
 * - Caliber name
 * - Current avg price
 * - Sparkline trend chart
 * - Verdict chip (BUY/WAIT/STABLE)
 * - Premium: Click for full chart
 */
export function PulseRow({ pulse, isPremium = false, onClick }: PulseRowProps) {
  const sparklineData = generateSparklineFromTrend(pulse.trend, 7)

  const handleClick = () => {
    if (isPremium && onClick) {
      onClick()
    }
  }

  return (
    <div
      onClick={handleClick}
      className={cn(
        'flex items-center gap-3 py-3 px-3 rounded-lg transition-colors',
        'border border-transparent',
        isPremium && onClick && 'cursor-pointer hover:bg-muted/50 hover:border-border',
        !isPremium && 'opacity-90'
      )}
      role={isPremium && onClick ? 'button' : undefined}
      tabIndex={isPremium && onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && isPremium && onClick) {
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

      {/* Verdict chip */}
      <div className="flex-shrink-0">
        <VerdictChip verdict={pulse.verdict} size="sm" showTooltip={isPremium} />
      </div>

      {/* Premium indicator */}
      {isPremium && onClick && (
        <div className="flex-shrink-0 text-muted-foreground">
          <span className="sr-only">Click for full chart</span>
        </div>
      )}

      {/* Free tier lock */}
      {!isPremium && (
        <div className="flex-shrink-0">
          <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
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
