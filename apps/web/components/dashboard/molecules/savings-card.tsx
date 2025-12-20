'use client'

import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { DollarSign, TrendingUp, Lock } from 'lucide-react'
import type { SavingsCardProps } from '@/types/dashboard'
import { UPGRADE_COPY } from '@/types/dashboard'

/**
 * SavingsCard - Savings tracking display
 *
 * Trading terminal-style card showing:
 * - Free: Potential savings
 * - Premium: Verified savings with attribution
 */
export function SavingsCard({ savings, isPremium = false }: SavingsCardProps) {
  const hasVerified = isPremium && savings.verifiedSavings

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
              {hasVerified ? 'Your Savings' : 'Potential Savings'}
            </h3>

            {/* Main savings amount */}
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-foreground">
                ${hasVerified
                  ? savings.verifiedSavings!.thisMonth.toFixed(0)
                  : savings.potentialSavings.toFixed(0)}
              </span>
              <span className="text-sm text-muted-foreground">
                {hasVerified ? 'this month' : 'available'}
              </span>
            </div>

            {/* Premium: All time stats */}
            {hasVerified && (
              <div className="mt-3 flex items-center gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">All time: </span>
                  <span className="font-semibold text-foreground">
                    ${savings.verifiedSavings!.allTime.toFixed(0)}
                  </span>
                </div>
                {savings.verifiedSavings!.purchaseCount > 0 && (
                  <div>
                    <span className="text-muted-foreground">Purchases: </span>
                    <span className="font-semibold text-foreground">
                      {savings.verifiedSavings!.purchaseCount}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Free tier: Breakdown hint */}
            {!hasVerified && savings.alertsWithSavings > 0 && (
              <div className="mt-2 text-sm text-muted-foreground">
                Based on {savings.alertsWithSavings} alert{savings.alertsWithSavings !== 1 ? 's' : ''} below target price
              </div>
            )}

            {/* Premium ROI message */}
            {hasVerified && savings.verifiedSavings!.thisMonth > 7.99 && (
              <div className="mt-3 flex items-center gap-1.5 text-sm text-status-buy">
                <TrendingUp className="h-4 w-4" />
                <span>{UPGRADE_COPY.SAVINGS_VERIFIED}</span>
              </div>
            )}

            {/* Free tier: Upgrade hint */}
            {!isPremium && (
              <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Lock className="h-3 w-3" />
                <span>Track verified savings with Premium</span>
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
