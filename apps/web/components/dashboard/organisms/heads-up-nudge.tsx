'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Info, ChevronRight } from 'lucide-react'
import { useMarketPulse } from '@/hooks/use-market-pulse'
import Link from 'next/link'

/**
 * HeadsUpNudge - Dashboard v3 Saved Search Signal (ADR-012)
 *
 * Surfaces saved search signals as subtle nudges.
 * Saved searches are signal inputs, not explicit UI objects.
 *
 * ADR-012 approved language:
 * - "Based on what you've been looking for"
 * - "[Caliber] prices dropped this week"
 *
 * This component does NOT:
 * - Show saved searches as a list
 * - Expose query syntax or configuration
 * - Require user management
 */
export function HeadsUpNudge() {
  const { data, loading } = useMarketPulse()

  if (loading || !data?.pulse) {
    return null // Don't show skeleton for this subtle component
  }

  // Find significant price drops from tracked calibers
  const significantDrops = data.pulse.filter(
    (p) => p.priceContext === 'LOWER_THAN_RECENT' && p.trendPercent < -5
  )

  // Only show if there's a meaningful signal
  if (significantDrops.length === 0) {
    return null
  }

  // Show the most significant drop
  const topSignal = significantDrops.sort((a, b) => a.trendPercent - b.trendPercent)[0]

  return (
    <Card className="bg-primary/5 border-primary/10">
      <CardContent className="py-4 px-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 p-2 rounded-full bg-primary/10">
              <Info className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                Heads up
              </p>
              <p className="text-xs text-muted-foreground">
                {topSignal.caliber} prices dropped this week
              </p>
            </div>
          </div>

          <Link href={`/dashboard/search?caliber=${encodeURIComponent(topSignal.caliber)}`}>
            <Button variant="ghost" size="sm" className="text-xs h-8 text-primary hover:text-primary">
              See {topSignal.caliber} deals
              <ChevronRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
