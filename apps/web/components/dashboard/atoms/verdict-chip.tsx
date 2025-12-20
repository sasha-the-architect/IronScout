'use client'

import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { Verdict, VerdictChipProps } from '@/types/dashboard'

const VERDICT_CONFIG: Record<
  Verdict,
  { label: string; className: string; tooltip: string }
> = {
  BUY: {
    label: 'BUY NOW',
    className: 'bg-status-buy text-white',
    tooltip: 'Historically strong price relative to last 90 days',
  },
  WAIT: {
    label: 'WAIT',
    className: 'bg-status-wait text-white',
    tooltip: 'Prices trending higher - consider waiting for a dip',
  },
  STABLE: {
    label: 'STABLE',
    className: 'bg-status-stable text-white',
    tooltip: 'Prices are consistent with recent averages',
  },
}

const SIZE_CLASSES = {
  sm: 'text-xs px-2 py-0.5',
  md: 'text-xs px-2.5 py-1',
  lg: 'text-sm px-3 py-1.5',
}

/**
 * VerdictChip - Trading terminal-style buy/wait indicator
 *
 * Displays market verdict as a colored chip with optional tooltip.
 * Color-coded: Green (BUY NOW), Amber (WAIT), Gray (STABLE)
 */
export function VerdictChip({
  verdict,
  showTooltip = true,
  size = 'md',
}: VerdictChipProps) {
  const config = VERDICT_CONFIG[verdict]

  const chip = (
    <span
      className={cn(
        'inline-flex items-center font-semibold rounded tracking-wide uppercase',
        'transition-all duration-200 animate-in fade-in',
        SIZE_CLASSES[size],
        config.className
      )}
      role="status"
      aria-label={`Market verdict: ${config.label}`}
    >
      {config.label}
    </span>
  )

  if (!showTooltip) {
    return chip
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{chip}</TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-xs text-xs"
        >
          {config.tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
