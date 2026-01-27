'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useLoadout, type AmmoItemWithPrice, type WatchingItemWithPrice } from '@/hooks/use-loadout'
import { GunLockerCard, WatchingCard, MarketActivityCard } from '@/components/dashboard/loadout'
import { RetailerPanel } from '@/components/results/retailer-panel'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { RetailerPrice, ShippingInfo } from '@/components/results/types'
import { refreshSessionToken } from '@/hooks/use-session-refresh'
import { env } from '@/lib/env'

const API_BASE_URL = env.NEXT_PUBLIC_API_URL

/**
 * Dashboard Page - My Loadout
 *
 * Per My Loadout mockup:
 * 1. Gun Locker card (full-width, top) - Firearms with ammo preferences and prices
 * 2. Two-column grid below:
 *    - Watching card (~66% left) - Tracked items with prices and status
 *    - Market Activity card (~34% right) - Stats and caliber chips
 *
 * Key interactions:
 * - "Compare prices" opens slide-out RetailerPanel
 * - "Find similar" navigates to search with caliber filter
 */
export default function DashboardPage() {
  const { data: session } = useSession()
  const { data, isLoading, error, mutate } = useLoadout()
  const router = useRouter()
  const token = session?.accessToken

  // Panel state
  const [panelOpen, setPanelOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<{
    id: string
    name: string
    caliber: string
    bulletType?: string
    grainWeight?: number
    roundCount?: number
  } | null>(null)
  const [retailers, setRetailers] = useState<RetailerPrice[]>([])
  const [isWatched, setIsWatched] = useState(false)
  const [loadingPrices, setLoadingPrices] = useState(false)

  // Handle "Compare prices" click - fetch retailer data and open panel
  const handleCompareClick = useCallback(
    async (item: AmmoItemWithPrice | WatchingItemWithPrice) => {
      const productId = 'ammoSkuId' in item ? item.ammoSkuId : item.productId

      setSelectedProduct({
        id: productId,
        name: item.name,
        caliber: item.caliber || '',
        bulletType: 'bulletType' in item ? item.bulletType || undefined : undefined,
        grainWeight: item.grainWeight || undefined,
        roundCount: item.roundCount || undefined,
      })

      // Check if item is watched
      const watchedItem = 'productId' in item
      setIsWatched(watchedItem)

      setLoadingPrices(true)
      setPanelOpen(true)

      try {
        // Get token, trying to refresh if missing
        let authToken: string | undefined = token
        if (!authToken) {
          const refreshed = await refreshSessionToken()
          if (refreshed) {
            authToken = refreshed
          }
        }

        const res = await fetch(`${API_BASE_URL}/api/products/${productId}/prices`, {
          headers: authToken ? {
            Authorization: `Bearer ${authToken}`,
          } : {},
        })

        if (!res.ok) {
          throw new Error('Failed to fetch prices')
        }

        const data = await res.json()

        // Transform API response to RetailerPrice format
        const retailerPrices: RetailerPrice[] = data.prices.map((p: any) => ({
          retailerId: p.retailerId,
          retailerName: p.retailers,
          pricePerRound: p.price / (item.roundCount || 1),
          totalPrice: p.price,
          inStock: p.inStock,
          shippingInfo: { type: 'unknown' } as ShippingInfo,
          url: p.url,
          lastUpdated: p.lastUpdated,
        }))

        setRetailers(retailerPrices)
      } catch (err) {
        console.error('Failed to fetch retailer prices:', err)
        setRetailers([])
      } finally {
        setLoadingPrices(false)
      }
    },
    []
  )

  // Handle "Find similar" click - navigate to search with caliber filter
  const handleFindSimilarClick = useCallback(
    (item: AmmoItemWithPrice | WatchingItemWithPrice) => {
      const caliber = item.caliber
      if (caliber) {
        router.push(`/search?caliber=${encodeURIComponent(caliber)}`)
      } else {
        router.push('/search')
      }
    },
    [router]
  )

  // Handle caliber chip click - navigate to search
  const handleCaliberClick = useCallback(
    (caliber: string) => {
      router.push(`/search?caliber=${encodeURIComponent(caliber)}`)
    },
    [router]
  )

  // Handle watch toggle (placeholder - would need proper API integration)
  const handleWatchToggle = useCallback((productId: string) => {
    setIsWatched((prev) => !prev)
    // TODO: Integrate with watchlist API
  }, [])

  // Handle panel close
  const handlePanelClose = useCallback(() => {
    setPanelOpen(false)
    setSelectedProduct(null)
    setRetailers([])
  }, [])

  // Loading state
  if (isLoading) {
    return <DashboardSkeleton />
  }

  // Error state
  if (error || !data) {
    return (
      <div className="p-4 lg:p-8 max-w-6xl mx-auto">
        <Card>
          <CardContent className="py-12">
            <p className="text-center text-destructive">
              {error?.message || 'Failed to load dashboard'}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-6">
      {/* Gun Locker - Full width */}
      <GunLockerCard
        firearms={data.gunLocker.firearms}
        totalAmmoItems={data.gunLocker.totalAmmoItems}
        onCompareClick={handleCompareClick}
        onFindSimilarClick={handleFindSimilarClick}
      />

      {/* Two-column grid: Watching (~66%) + Market Activity (~34%) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <WatchingCard
            items={data.watching.items}
            totalCount={data.watching.totalCount}
            onCompareClick={handleCompareClick}
            onFindSimilarClick={handleFindSimilarClick}
          />
        </div>
        <div className="lg:col-span-1">
          <MarketActivityCard
            stats={data.marketActivity}
            onCaliberClick={handleCaliberClick}
          />
        </div>
      </div>

      {/* Retailer Panel (slide-out) */}
      <RetailerPanel
        isOpen={panelOpen}
        onClose={handlePanelClose}
        product={selectedProduct}
        retailers={loadingPrices ? [] : retailers}
        isWatched={isWatched}
        onWatchToggle={handleWatchToggle}
      />
    </div>
  )
}

/**
 * Loading skeleton for dashboard
 */
function DashboardSkeleton() {
  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-6">
      {/* Gun Locker skeleton */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-4">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-5 w-24" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </CardContent>
      </Card>

      {/* Two-column grid skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-4">
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-5 w-20" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="lg:col-span-1">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-4">
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-5 w-28" />
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
              <Skeleton className="h-4 w-32 mb-3" />
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-6 w-14" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
