'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { PriceContext, ContextBand } from '@/lib/api'
import {
  TrendingDown,
  TrendingUp,
  Minus,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  BarChart3
} from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

/**
 * Verdict configuration - language is descriptive, not prescriptive (ADR-006)
 */
const VERDICT_CONFIG: Record<ContextBand, {
  icon: typeof TrendingDown
  label: string
  qualitative: string
  color: string
  iconColor: string
}> = {
  LOW: {
    icon: TrendingDown,
    label: 'Below average',
    qualitative: 'Price below recent average',
    color: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
    iconColor: 'text-emerald-600 dark:text-emerald-400'
  },
  TYPICAL: {
    icon: Minus,
    label: 'Typical price',
    qualitative: 'Price within normal range',
    color: 'bg-slate-50 text-slate-700 dark:bg-slate-900/50 dark:text-slate-300',
    iconColor: 'text-slate-500 dark:text-slate-400'
  },
  HIGH: {
    icon: TrendingUp,
    label: 'Above average',
    qualitative: 'Price above recent average',
    color: 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
    iconColor: 'text-amber-600 dark:text-amber-400'
  },
  INSUFFICIENT_DATA: {
    icon: HelpCircle,
    label: 'Limited data',
    qualitative: 'Not enough price history',
    color: 'bg-gray-50 text-gray-600 dark:bg-gray-900/50 dark:text-gray-400',
    iconColor: 'text-gray-400 dark:text-gray-500'
  }
}

interface PriceVerdictProps {
  priceContext?: PriceContext
  isPremium?: boolean
  size?: 'sm' | 'md' | 'lg'
  showWhy?: boolean
  className?: string
}

/**
 * Price Verdict Component
 *
 * The Rule: Everyone gets the conclusion. Premium gets the reasoning.
 *
 * Free users see: Verdict label + short qualitative insight
 * Premium users see: Quantification, history, confidence, trends
 *
 * Same surface. Different resolution.
 */
export function PriceVerdict({
  priceContext,
  isPremium: _isPremium = false,
  size = 'sm',
  showWhy = true,
  className
}: PriceVerdictProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // No context available
  if (!priceContext || !priceContext.contextBand) {
    return null
  }

  const config = VERDICT_CONFIG[priceContext.contextBand]
  const Icon = config.icon

  const sizeClasses = {
    sm: {
      container: 'text-xs',
      icon: 'h-3 w-3',
      padding: 'px-2 py-1'
    },
    md: {
      container: 'text-sm',
      icon: 'h-4 w-4',
      padding: 'px-2.5 py-1.5'
    },
    lg: {
      container: 'text-base',
      icon: 'h-5 w-5',
      padding: 'px-3 py-2'
    }
  }

  const sizes = sizeClasses[size]

  const hasPremiumDepth =
    priceContext.relativePricePct !== undefined &&
    priceContext.meta

  return (
    <div className={cn('inline-block', className)}>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <div className={cn(
          'inline-flex items-center gap-1.5 rounded-md font-medium',
          sizes.container,
          sizes.padding,
          config.color
        )}>
          <Icon className={cn(sizes.icon, config.iconColor)} />
          <span>{config.label}</span>

          {/* Why? affordance */}
          {hasPremiumDepth && showWhy && (
            <CollapsibleTrigger asChild>
              <button
                className={cn(
                  'ml-1 inline-flex items-center gap-0.5 opacity-70 hover:opacity-100 transition-opacity',
                  'text-current underline underline-offset-2 decoration-dotted'
                )}
                onClick={(e) => e.stopPropagation()}
              >
                Why?
                {isExpanded ? (
                  <ChevronUp className={cn(sizes.icon, 'opacity-50')} />
                ) : (
                  <ChevronDown className={cn(sizes.icon, 'opacity-50')} />
                )}
              </button>
            </CollapsibleTrigger>
          )}
        </div>

        <CollapsibleContent>
          <div className={cn(
            'mt-1.5 rounded-md border p-2',
            'bg-background/80 backdrop-blur-sm',
            sizes.container
          )}>
            {hasPremiumDepth && <PremiumDepth priceContext={priceContext} />}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

/**
 * Premium depth panel - shows quantification and data
 */
function PremiumDepth({ priceContext }: { priceContext: PriceContext }) {
  const { relativePricePct, positionInRange, meta, contextBand } = priceContext

  // Format relative percentage
  const formatRelative = (pct: number) => {
    const abs = Math.abs(pct)
    if (pct < 0) return `${abs.toFixed(1)}% below average`
    if (pct > 0) return `${abs.toFixed(1)}% above average`
    return 'At average price'
  }

  // Format position in range
  const formatPosition = (pos: number) => {
    if (pos <= 0.2) return 'Near lowest observed'
    if (pos <= 0.4) return 'Below midpoint'
    if (pos <= 0.6) return 'Around midpoint'
    if (pos <= 0.8) return 'Above midpoint'
    return 'Near highest observed'
  }

  return (
    <div className="space-y-2">
      {/* Primary insight */}
      <div className="flex items-center gap-2">
        <BarChart3 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="font-medium">
          {relativePricePct !== undefined && formatRelative(relativePricePct)}
        </span>
      </div>

      {/* Position in range */}
      {positionInRange !== undefined && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                contextBand === 'LOW' && 'bg-emerald-500',
                contextBand === 'TYPICAL' && 'bg-slate-400',
                contextBand === 'HIGH' && 'bg-amber-500',
                contextBand === 'INSUFFICIENT_DATA' && 'bg-gray-300'
              )}
              style={{ width: `${Math.max(5, positionInRange * 100)}%` }}
            />
          </div>
          <span className="text-[10px] shrink-0">{formatPosition(positionInRange)}</span>
        </div>
      )}

      {/* Data coverage */}
      {meta && (
        <div className="text-[10px] text-muted-foreground pt-1 border-t">
          Based on {meta.sampleCount.toLocaleString()} prices over {meta.windowDays} days
        </div>
      )}
    </div>
  )
}

/**
 * Compact inline verdict for product cards
 * Shows just the verdict label, no expansion
 */
interface InlineVerdictProps {
  priceContext?: PriceContext
  className?: string
}

export function InlineVerdict({ priceContext, className }: InlineVerdictProps) {
  if (!priceContext || !priceContext.contextBand || priceContext.contextBand === 'INSUFFICIENT_DATA') {
    return null
  }

  const config = VERDICT_CONFIG[priceContext.contextBand]
  const Icon = config.icon

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn(
            'inline-flex items-center gap-1 text-[10px] font-medium rounded px-1.5 py-0.5 cursor-help',
            config.color,
            className
          )}>
            <Icon className={cn('h-2.5 w-2.5', config.iconColor)} />
            {config.label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-sm">{config.qualitative}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
