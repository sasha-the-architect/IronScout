'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { SearchResultCard } from './search-result-card'
import { ResultCardSkeleton } from './result-card'
import { AdCard } from '@/components/ads/ad-card'
import type { Product, Advertisement } from '@/lib/api'
import { getSavedItems } from '@/lib/api'
import { useSession } from 'next-auth/react'

interface SearchResultsGridProps {
  products: Product[]
  ads?: Advertisement[]
  /** Mix ads every N products */
  adInterval?: number
}

/**
 * SearchResultsGrid - Client component for search results
 *
 * Manages:
 * - Tracking state for all products
 * - Ad mixing into results
 * - Grid layout
 */
export function SearchResultsGrid({
  products,
  ads = [],
  adInterval = 4,
}: SearchResultsGridProps) {
  const { data: session } = useSession()
  const accessToken = (session as any)?.accessToken

  // Track which products are saved
  const [trackedIds, setTrackedIds] = useState<Set<string>>(new Set())
  const [loadingTracked, setLoadingTracked] = useState(false)

  // Load saved items on mount
  useEffect(() => {
    if (!accessToken) return

    setLoadingTracked(true)
    getSavedItems(accessToken)
      .then((response) => {
        const savedIds = new Set(response.items.map((item) => item.productId))
        setTrackedIds(savedIds)
      })
      .catch((error) => {
        console.error('Failed to load saved items:', error)
      })
      .finally(() => {
        setLoadingTracked(false)
      })
  }, [accessToken])

  // Handle track state change
  const handleTrackChange = useCallback((productId: string, isTracked: boolean) => {
    setTrackedIds((prev) => {
      const next = new Set(prev)
      if (isTracked) {
        next.add(productId)
      } else {
        next.delete(productId)
      }
      return next
    })
  }, [])

  // Find the best price product (lowest price per round, in stock preferred)
  const bestPriceProductId = useMemo(() => {
    if (products.length === 0) return null

    // Calculate price per round for each product
    const withPrices = products
      .map((product) => {
        const lowestPrice = product.prices.reduce(
          (min, price) => (price.price < min.price ? price : min),
          product.prices[0]
        )
        if (!lowestPrice) return null

        const pricePerRound =
          product.roundCount && product.roundCount > 0
            ? lowestPrice.price / product.roundCount
            : lowestPrice.price

        return {
          id: product.id,
          pricePerRound,
          inStock: lowestPrice.inStock,
        }
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)

    if (withPrices.length === 0) return null

    // Sort: in-stock first, then by price
    withPrices.sort((a, b) => {
      // In-stock items first
      if (a.inStock && !b.inStock) return -1
      if (!a.inStock && b.inStock) return 1
      // Then by price
      return a.pricePerRound - b.pricePerRound
    })

    return withPrices[0].id
  }, [products])

  // Mix ads into products
  const mixedResults: Array<{ type: 'product' | 'ad'; data: Product | Advertisement }> = []
  let adIndex = 0

  products.forEach((product, index) => {
    mixedResults.push({ type: 'product', data: product })

    if ((index + 1) % adInterval === 0 && adIndex < ads.length) {
      mixedResults.push({ type: 'ad', data: ads[adIndex] })
      adIndex++
    }
  })

  const hasBestPrice = bestPriceProductId !== null

  return (
    <div className="space-y-3">
      {/* Anchoring line - reassures user they're seeing the best option */}
      {hasBestPrice && products.length > 0 && (
        <p className="text-sm text-muted-foreground">
          We found the best available option for your search
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {mixedResults.map((item, index) => (
          <div key={`${item.type}-${index}`}>
            {item.type === 'product' ? (
              <SearchResultCard
                product={item.data as Product}
                isTracked={trackedIds.has((item.data as Product).id)}
                isBestPrice={(item.data as Product).id === bestPriceProductId}
                onTrackChange={handleTrackChange}
              />
            ) : (
              <AdCard ad={item.data as Advertisement} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * SearchResultsGridSkeleton - Loading state
 */
export function SearchResultsGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <ResultCardSkeleton key={i} />
      ))}
    </div>
  )
}
