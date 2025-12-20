'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { VerdictChip } from '../atoms/verdict-chip'
import { PriceDelta } from '../atoms/price-delta'
import { ExternalLink, Sparkles } from 'lucide-react'
import { useDealsForYou } from '@/hooks/use-deals-for-you'
import { useMarketPulse } from '@/hooks/use-market-pulse'
import { UPGRADE_COPY } from '@/types/dashboard'
import type { DealItem, Verdict } from '@/types/dashboard'

interface TodaysBestMovesProps {
  isPremium?: boolean
}

/**
 * TodaysBestMoves - Hero section with top recommendation
 *
 * Trading terminal-style hero showing the single best
 * recommendation for the user right now.
 *
 * Uses top deal + market pulse verdict to create
 * actionable guidance.
 */
export function TodaysBestMoves({ isPremium = false }: TodaysBestMovesProps) {
  const { data: dealsData, loading: dealsLoading } = useDealsForYou()
  const { data: pulseData, loading: pulseLoading } = useMarketPulse()

  const loading = dealsLoading || pulseLoading

  // Get top deal
  const topDeal = dealsData?.deals?.[0]

  // Find market pulse verdict for the top deal's caliber
  const getVerdictForDeal = (deal: DealItem): Verdict => {
    if (!pulseData?.pulse) return 'STABLE'
    const caliber = deal.product.caliber
    const pulse = pulseData.pulse.find((p) => p.caliber === caliber)
    return pulse?.verdict || 'STABLE'
  }

  const verdict = topDeal ? getVerdictForDeal(topDeal) : 'STABLE'
  const pulse = topDeal
    ? pulseData?.pulse?.find((p) => p.caliber === topDeal.product.caliber)
    : null

  if (loading) {
    return (
      <Card className="bg-gradient-to-br from-card to-card/80 border-border overflow-hidden">
        <CardContent className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            <div className="flex-1 space-y-4">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-6 w-32" />
              <div className="flex gap-3">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
            <div className="flex-shrink-0">
              <Skeleton className="h-12 w-32" />
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!topDeal) {
    return (
      <Card className="bg-gradient-to-br from-card to-card/80 border-border overflow-hidden">
        <CardContent className="p-6 md:p-8 text-center">
          <Sparkles className="h-8 w-8 text-primary mx-auto mb-3" />
          <h2 className="text-lg font-semibold">No Recommendations Yet</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Set up alerts and track products to get personalized recommendations.
          </p>
        </CardContent>
      </Card>
    )
  }

  const handleBuyClick = () => {
    window.open(topDeal.url, '_blank', 'noopener,noreferrer')
  }

  return (
    <Card className="bg-gradient-to-br from-card to-card/80 border-border overflow-hidden">
      <CardContent className="p-6 md:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center gap-6">
          {/* Left side: Verdict + Product info */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* Verdict chip */}
            <VerdictChip verdict={verdict} size="lg" />

            {/* Product name */}
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-foreground leading-tight">
                {topDeal.product.name}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {topDeal.product.caliber}
                {topDeal.product.grainWeight && ` • ${topDeal.product.grainWeight}gr`}
                {' • '}
                {topDeal.retailer.name}
              </p>
            </div>

            {/* Price info */}
            <div className="flex flex-wrap items-center gap-4">
              {topDeal.pricePerRound !== null && (
                <div className="text-2xl md:text-3xl font-bold text-foreground">
                  ${topDeal.pricePerRound.toFixed(3)}
                  <span className="text-sm font-normal text-muted-foreground ml-1">
                    /rd
                  </span>
                </div>
              )}

              {/* Premium: Show delta */}
              {isPremium && pulse && (
                <div className="flex items-center gap-2">
                  <PriceDelta percent={pulse.trendPercent} size="md" />
                  <span className="text-xs text-muted-foreground">vs 7-day avg</span>
                </div>
              )}
            </div>

            {/* Free tier teaser */}
            {!isPremium && (
              <p className="text-xs text-muted-foreground italic">
                {UPGRADE_COPY.MARKET_PULSE_EXPAND}
              </p>
            )}
          </div>

          {/* Right side: CTA */}
          <div className="flex-shrink-0 lg:text-right">
            <Button
              onClick={handleBuyClick}
              size="lg"
              className="w-full lg:w-auto bg-primary hover:bg-primary/90 text-primary-foreground px-8"
            >
              Buy Now
              <ExternalLink className="ml-2 h-4 w-4" />
            </Button>
            {topDeal.inStock && (
              <p className="mt-2 text-xs text-status-buy">In Stock</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
