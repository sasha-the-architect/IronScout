'use client'

import { Card, CardContent } from '@/components/ui/card'
import { DollarSign, Lock } from 'lucide-react'
import type { SavingsCardProps } from '@/types/dashboard'

/**
 * SavingsCard - Price difference tracking display (ADR-006 compliant)
 *
 * Shows the difference between target prices and current prices
 * for tracked alerts. This is purely informational - not a guarantee
 * of actual savings.
 *
 * Note: "Verified savings" feature removed per ADR-006/ADR-007
 * (no outcome guarantees, premium = information density only)
 */
export function SavingsCard({ savings, isPremium = false }: SavingsCardProps) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className="flex-shrink-0 p-2 rounded-lg bg-status-buy/10">
            <DollarSign className="h-5 w-5 text-status-buy" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Price Difference
            </h3>

            {/* Main amount */}
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-foreground">
                ${savings.potentialSavings.toFixed(0)}
              </span>
              <span className="text-sm text-muted-foreground">
                below target
              </span>
            </div>

            {/* Breakdown hint */}
            {savings.alertsWithSavings > 0 && (
              <div className="mt-2 text-sm text-muted-foreground">
                {savings.alertsWithSavings} of {savings.totalAlerts} alert{savings.totalAlerts !== 1 ? 's' : ''} below target price
              </div>
            )}

            {/* No alerts message */}
            {savings.alertsWithSavings === 0 && savings.totalAlerts > 0 && (
              <div className="mt-2 text-sm text-muted-foreground">
                No alerts currently below target price
              </div>
            )}

            {/* No alerts at all */}
            {savings.totalAlerts === 0 && (
              <div className="mt-2 text-sm text-muted-foreground">
                Set up price alerts to track differences
              </div>
            )}

            {/* Free tier: Upgrade hint */}
            {!isPremium && (
              <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Lock className="h-3 w-3" />
                <span>Premium processes alerts faster and adds price history</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * SavingsCardSkeleton - Loading state
 */
export function SavingsCardSkeleton() {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 p-2 rounded-lg bg-muted animate-pulse">
            <div className="h-5 w-5" />
          </div>
          <div className="flex-1 space-y-2 animate-pulse">
            <div className="h-4 w-28 bg-muted rounded" />
            <div className="h-8 w-24 bg-muted rounded" />
            <div className="h-3 w-36 bg-muted rounded" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
