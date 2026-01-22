'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ExternalLink, TrendingDown, Package, Clock } from 'lucide-react'
import {
  getMarketDeals,
  type MarketDeal,
  type MarketDealsResponse,
} from '@/lib/api'

/**
 * Market Deals Component
 *
 * Per dashboard_market_deals_v1_spec.md:
 * - Displays market-wide notable price events
 * - Hero: Single most notable deal (largest drop %, earliest timestamp, productId tie-breaker)
 * - Sections: "For Your Guns" (if Gun Locker) + "Other Notable Deals"
 * - Empty state: "No notable market changes today." with timestamp
 */
export function MarketDeals() {
  const { data: session } = useSession()
  const [data, setData] = useState<MarketDealsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Extract token from session
  const token = (session as any)?.accessToken as string | undefined

  useEffect(() => {
    async function fetchDeals() {
      try {
        const response = await getMarketDeals(token)
        setData(response)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load deals')
      } finally {
        setIsLoading(false)
      }
    }

    fetchDeals()
  }, [token])

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="space-y-4">
            <div className="h-24 bg-muted animate-pulse rounded-lg" />
            <div className="h-16 bg-muted animate-pulse rounded-lg" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-destructive text-sm">{error}</p>
        </CardContent>
      </Card>
    )
  }

  // Check if we have any deals
  const hasDeals = data?.sections.some((s) => s.deals.length > 0)

  if (!hasDeals) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Market Deals</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <Package className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No notable market changes today.
            </p>
            {data?.lastCheckedAt && (
              <p className="text-xs text-muted-foreground/70 mt-2 flex items-center justify-center gap-1">
                <Clock className="h-3 w-3" />
                Last checked: {new Date(data.lastCheckedAt).toLocaleTimeString()}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Hero Deal */}
      {data?.hero && <HeroDeal deal={data.hero} />}

      {/* Deal Sections */}
      {data?.sections.map((section) => (
        section.deals.length > 0 && (
          <Card key={section.title}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">{section.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {section.deals.slice(0, 5).map((deal) => (
                  <DealItem key={deal.productId} deal={deal} />
                ))}
              </div>
            </CardContent>
          </Card>
        )
      ))}

      {/* Last checked timestamp */}
      {data?.lastCheckedAt && (
        <p className="text-xs text-muted-foreground/70 text-center flex items-center justify-center gap-1">
          <Clock className="h-3 w-3" />
          Last checked: {new Date(data.lastCheckedAt).toLocaleTimeString()}
        </p>
      )}
    </div>
  )
}

/**
 * Hero Deal - prominently displayed single deal
 */
function HeroDeal({ deal }: { deal: MarketDeal }) {
  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <ReasonBadge reason={deal.reason} dropPercent={deal.dropPercent} />
              {deal.caliber && (
                <Badge variant="outline" className="text-xs">
                  {formatCaliber(deal.caliber)}
                </Badge>
              )}
            </div>
            <h3 className="font-medium text-sm truncate">{deal.productName}</h3>
            <p className="text-xs text-muted-foreground mt-1">{deal.retailerName}</p>
            <p className="text-xs text-muted-foreground/80 mt-0.5">{deal.contextLine}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="font-semibold text-lg">${deal.pricePerRound.toFixed(2)}/rd</p>
            <a
              href={deal.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
            >
              View <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Standard deal item in list
 */
function DealItem({ deal }: { deal: MarketDeal }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <ReasonBadge reason={deal.reason} dropPercent={deal.dropPercent} small />
          {deal.caliber && (
            <span className="text-xs text-muted-foreground">
              {formatCaliber(deal.caliber)}
            </span>
          )}
        </div>
        <p className="text-sm truncate">{deal.productName}</p>
        <p className="text-xs text-muted-foreground">{deal.retailerName}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="font-medium">${deal.pricePerRound.toFixed(2)}/rd</p>
        <a
          href={deal.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          View <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  )
}

/**
 * Badge showing reason for deal
 */
function ReasonBadge({
  reason,
  dropPercent,
  small,
}: {
  reason: MarketDeal['reason']
  dropPercent: number | null
  small?: boolean
}) {
  const sizeClass = small ? 'text-[10px] px-1.5 py-0' : 'text-xs'

  switch (reason) {
    case 'PRICE_DROP':
      return (
        <Badge variant="default" className={`bg-green-600 hover:bg-green-600 ${sizeClass}`}>
          <TrendingDown className={small ? 'h-2.5 w-2.5 mr-0.5' : 'h-3 w-3 mr-1'} />
          {dropPercent ? `${Math.round(dropPercent)}% off` : 'Price Drop'}
        </Badge>
      )
    case 'BACK_IN_STOCK':
      return (
        <Badge variant="default" className={`bg-blue-600 hover:bg-blue-600 ${sizeClass}`}>
          <Package className={small ? 'h-2.5 w-2.5 mr-0.5' : 'h-3 w-3 mr-1'} />
          Back in Stock
        </Badge>
      )
    case 'LOWEST_90D':
      return (
        <Badge variant="default" className={`bg-amber-600 hover:bg-amber-600 ${sizeClass}`}>
          90-Day Low
        </Badge>
      )
    default:
      return null
  }
}

/**
 * Format caliber for display
 */
function formatCaliber(caliber: string): string {
  const labels: Record<string, string> = {
    '9mm': '9mm',
    '.45_acp': '.45 ACP',
    '.40_sw': '.40 S&W',
    '.380_acp': '.380 ACP',
    '.22_lr': '.22 LR',
    '.223_556': '.223/5.56',
    '.308_762x51': '.308/7.62',
    '.30-06': '.30-06',
    '6.5_creedmoor': '6.5 CM',
    '7.62x39': '7.62x39',
    '12ga': '12ga',
    '20ga': '20ga',
  }
  return labels[caliber] || caliber
}
