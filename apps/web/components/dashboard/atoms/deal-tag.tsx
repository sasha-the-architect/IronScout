'use client'

import { cn } from '@/lib/utils'
import { Zap, TrendingDown, Package } from 'lucide-react'
import type { DealLabel, DealTagProps } from '@/types/dashboard'

const TAG_CONFIG: Record<
  DealLabel,
  { label: string; icon: typeof Zap; className: string }
> = {
  HOT_DEAL: {
    label: 'HOT DEAL',
    icon: Zap,
    className: 'bg-status-hot/20 text-status-hot border-status-hot/30',
  },
  NEW_LOW: {
    label: 'NEW LOW',
    icon: TrendingDown,
    className: 'bg-status-new/20 text-status-new border-status-new/30',
  },
  BULK_VALUE: {
    label: 'BULK VALUE',
    icon: Package,
    className: 'bg-status-bulk/20 text-status-bulk border-status-bulk/30',
  },
}

const SIZE_CLASSES = {
  sm: 'text-[10px] px-1.5 py-0.5 gap-0.5',
  md: 'text-xs px-2 py-0.5 gap-1',
}

const ICON_SIZES = {
  sm: 'h-3 w-3',
  md: 'h-3.5 w-3.5',
}

/**
 * DealTag - Deal type indicator badge
 *
 * Displays deal classification with icon.
 * Types: HOT DEAL (urgent), NEW LOW (price drop), BULK VALUE (volume)
 */
export function DealTag({ label, size = 'md' }: DealTagProps) {
  const config = TAG_CONFIG[label]
  const Icon = config.icon

  return (
    <span
      className={cn(
        'inline-flex items-center font-semibold rounded border uppercase tracking-wide',
        'transition-all duration-200',
        SIZE_CLASSES[size],
        config.className
      )}
    >
      <Icon className={cn(ICON_SIZES[size])} aria-hidden="true" />
      {config.label}
    </span>
  )
}
