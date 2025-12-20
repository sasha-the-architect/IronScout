'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PulseRow, PulseRowSkeleton } from '../molecules/pulse-row'
import { BarChart3, ChevronRight, Lock } from 'lucide-react'
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

        {data && (
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

            {/* Free tier limit message */}
            {!isPremium && data._meta.calibersLimit !== -1 && (
              <div className="mt-4 p-3 rounded-lg bg-muted/50 border border-border">
                <div className="flex items-start gap-2">
                  <Lock className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div className="text-xs text-muted-foreground">
                    <p>
                      Tracking {data._meta.calibersShown} of {data._meta.calibersLimit} calibers
                    </p>
                    <p className="mt-1 text-primary">
                      {UPGRADE_COPY.MARKET_PULSE_EXPAND}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
