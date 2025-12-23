'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PulseRow, PulseRowSkeleton } from '../molecules/pulse-row'
import { BarChart3, ChevronRight, Lock, Plus, TrendingUp, Target } from 'lucide-react'
import { useMarketPulse } from '@/hooks/use-market-pulse'
import { UPGRADE_COPY } from '@/types/dashboard'
import Link from 'next/link'

interface MarketPulseProps {
  isPremium?: boolean
  onCaliberClick?: (caliber: string) => void
}

/**
 * MarketPulse - Market status panel
 *
 * Trading terminal-style panel showing Buy/Wait indicators
 * for user's tracked calibers.
 *
 * Free: 2 calibers max, no click interaction
 * Premium: Unlimited calibers, click for full chart
 */
export function MarketPulse({ isPremium = false, onCaliberClick }: MarketPulseProps) {
  const { data, loading, error } = useMarketPulse()

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <BarChart3 className="h-5 w-5 text-primary" />
            Market Pulse
          </CardTitle>
          {isPremium && (
            <Link href="/dashboard/trends">
              <Button variant="ghost" size="sm" className="text-xs h-7">
                View Full Trends
                <ChevronRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {loading && (
          <div className="space-y-1">
            {[1, 2, 3].map((i) => (
              <PulseRowSkeleton key={i} />
            ))}
          </div>
        )}

        {error && (
          <div className="py-4 text-center text-sm text-muted-foreground">
            Failed to load market pulse
          </div>
        )}

        {data && data.pulse && (
          <>
            <div className="space-y-1">
              {data.pulse.map((item) => (
                <PulseRow
                  key={item.caliber}
                  pulse={item}
                  isPremium={isPremium}
                  onClick={
                    isPremium && onCaliberClick
                      ? () => onCaliberClick(item.caliber)
                      : undefined
                  }
                />
              ))}
            </div>

            {/* Search CTA - always visible */}
            <div className="mt-3 pt-3 border-t border-border">
              <Link href="/dashboard/search">
                <Button variant="ghost" size="sm" className="w-full justify-start text-xs h-9 text-muted-foreground hover:text-foreground">
                  <Plus className="h-3.5 w-3.5 mr-2" />
                  Search more calibers
                </Button>
              </Link>
            </div>

            {/* Unlock historical trends CTA (Free tier) */}
            {!isPremium && (
              <Link href="/pricing">
                <div className="mt-3 p-3 rounded-lg bg-primary/5 border border-primary/20 hover:bg-primary/10 transition-colors cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded-md bg-primary/10">
                      <TrendingUp className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">
                        Unlock price history
                      </p>
                      <p className="text-xs text-muted-foreground">
                        See 30-day trends and timing signals
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </Link>
            )}

            {/* Caliber limit indicator */}
            {!isPremium && data._meta && data._meta.calibersLimit !== -1 && (
              <p className="mt-3 text-xs text-center text-muted-foreground">
                Showing {data._meta.calibersShown} of {data._meta.calibersLimit} calibers
              </p>
            )}

            {/* Helper text */}
            <p className="mt-3 text-xs text-center text-muted-foreground">
              <Target className="h-3 w-3 inline mr-1" />
              Saved items power price insights
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
