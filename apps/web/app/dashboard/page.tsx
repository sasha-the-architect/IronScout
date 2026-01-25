'use client'

import { useMemo } from 'react'
import { useDashboardV5 } from '@/hooks/use-dashboard-v5'
import {
  DashboardV5Vital,
  DashboardV5VitalSkeleton,
  type DashboardV5VitalData,
  type CaliberTrend,
  type WatchlistTableItem,
  type PriceChange,
  generateCoverageObservation,
} from '@/components/dashboard/v5'
import { Card, CardContent } from '@/components/ui/card'

/**
 * Dashboard Page - Dashboard v5 with Ambient Vitality
 *
 * Per ADR-020, dashboard-product-spec-v5.md, and ambient-vitality spec:
 *
 * Structure:
 * 1. Active Monitoring Header (always) - "● Actively monitoring"
 * 2. Spotlight Notice (ephemeral) - Single-line, dismissible
 * 3. Market Pulse Strip (always) - Caliber-level trends
 * 4. Watchlist Table (primary surface) - Dense, status-first
 * 5. Activity Log (collapsed) - Price changes accordion
 * 6. Coverage Context (always) - Rotating observations
 *
 * Key principles:
 * - Page feels "alive" even on quiet days
 * - No urgency, no rankings, no recommendations
 * - Monitoring feels active, not passive
 */
export default function DashboardPage() {
  const { data, loading, error } = useDashboardV5()

  // Transform legacy data format to vital format
  const vitalData = useMemo(() => {
    if (!data) return null
    return transformToVitalData(data)
  }, [data])

  if (loading) {
    return <DashboardV5VitalSkeleton />
  }

  if (error || !vitalData) {
    return (
      <div className="p-4 lg:p-8 max-w-4xl mx-auto">
        <Card>
          <CardContent className="py-12">
            <p className="text-center text-destructive">
              {error || 'Failed to load dashboard'}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return <DashboardV5Vital data={vitalData} />
}

/**
 * Transform legacy DashboardV5Data to DashboardV5VitalData
 */
function transformToVitalData(data: any): DashboardV5VitalData {
  // Extract unique calibers from watchlist for market pulse
  const caliberTrends = extractCaliberTrends(data.watchlist?.items || [])

  // Transform watchlist items to table format
  const watchlistItems = transformWatchlistItems(data.watchlist?.items || [])

  // Transform price movement to accordion format
  const priceChanges = transformPriceChanges(data.priceMovement || [])

  // Generate coverage observation
  const coverageObservation = generateCoverageObservation({
    retailerCount: 47, // TODO: Get from API
    productCount: data.watchlist?.totalCount || 0,
    caliberCount: caliberTrends.length,
  })

  // Count in-stock items
  const inStockCount = watchlistItems.filter(
    (item) => item.status === 'back_in_stock' || item.change24h !== 'none'
  ).length

  return {
    monitoring: {
      isActive: true,
      lastScanAt: data.lastUpdatedAt || new Date().toISOString(),
      scansToday: 12, // TODO: Get from API
      retailersChecked: 47, // TODO: Get from API
    },
    caliberTrends,
    spotlight: data.spotlight
      ? {
          productId: data.spotlight.productId,
          productName: data.spotlight.productName,
          reason: mapSpotlightReason(data.spotlight.signalType),
          percentChange: data.spotlight.changePercent,
        }
      : null,
    watchlist: {
      items: watchlistItems,
      totalCount: data.watchlist?.totalCount || 0,
    },
    priceChanges,
    coverage: {
      observation: coverageObservation,
      stockSummary: {
        inStock: inStockCount || watchlistItems.length,
        total: watchlistItems.length,
      },
    },
  }
}

/**
 * Extract caliber trends from watchlist items
 */
function extractCaliberTrends(items: any[]): CaliberTrend[] {
  // Group by caliber
  const caliberMap = new Map<string, number[]>()

  for (const item of items) {
    const caliber = item.attributes?.split(',')[0]?.trim() || 'Unknown'
    if (!caliberMap.has(caliber)) {
      caliberMap.set(caliber, [])
    }
    if (item.pricePerRound) {
      caliberMap.get(caliber)!.push(item.pricePerRound)
    }
  }

  // Generate trends (simplified - would come from price history API)
  const trends: CaliberTrend[] = []
  for (const [caliber, prices] of caliberMap) {
    if (prices.length === 0) continue

    // Generate fake sparkline data for now
    const sparkline = generateSparklineData()
    const percentChange = (Math.random() - 0.5) * 10 // -5% to +5%

    let trend: 'stable' | 'up' | 'down' = 'stable'
    if (percentChange > 2) trend = 'up'
    if (percentChange < -2) trend = 'down'

    trends.push({
      caliber,
      sparkline,
      trend,
      percentChange: Math.round(percentChange),
    })
  }

  return trends.slice(0, 4) // Max 4 calibers
}

/**
 * Generate sparkline data (would come from price history API)
 */
function generateSparklineData(): number[] {
  const points = 14
  const data: number[] = []
  let value = 0.5

  for (let i = 0; i < points; i++) {
    value += (Math.random() - 0.5) * 0.2
    value = Math.max(0, Math.min(1, value))
    data.push(value)
  }

  return data
}

/**
 * Transform watchlist items to table format
 */
function transformWatchlistItems(items: any[]): WatchlistTableItem[] {
  return items.map((item) => {
    // Determine status
    let status: '90d_low' | 'back_in_stock' | null = null
    if (item.status === 'lowest-90-days') {
      status = '90d_low'
    } else if (item.status === 'back-in-stock') {
      status = 'back_in_stock'
    }

    // Determine 24h change (simplified)
    let change24h: 'up' | 'down' | 'none' = 'none'
    if (item.status === 'price-moved') {
      change24h = Math.random() > 0.5 ? 'down' : 'up'
    }

    return {
      id: item.id || item.productId,
      productId: item.productId,
      productName: item.productName,
      pricePerRound: item.pricePerRound,
      sparklineData: generateSparklineData(),
      change24h,
      status,
      isWatched: true,
    }
  })
}

/**
 * Transform price movement items to accordion format
 */
function transformPriceChanges(items: any[]): PriceChange[] {
  return items.slice(0, 5).map((item) => ({
    id: item.id,
    productId: item.productId,
    productName: item.productName,
    direction: (item.changePercent || 0) < 0 ? 'down' : 'up',
    pricePerRound: item.pricePerRound || 0,
    source: item.source === 'gun-locker' ? 'gun_locker' : 'watchlist',
    caliber: item.caliber,
  }))
}

/**
 * Map legacy spotlight signal type to new reason
 */
function mapSpotlightReason(
  signalType: string
): '90d_low' | 'back_in_stock' | 'significant_drop' {
  switch (signalType) {
    case 'lowest-90-days':
      return '90d_low'
    case 'back-in-stock-watched':
      return 'back_in_stock'
    case 'largest-price-movement':
    default:
      return 'significant_drop'
  }
}
