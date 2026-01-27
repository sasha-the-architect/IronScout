'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { ResultCardV2, ResultCardV2Skeleton } from './result-card-v2'
import { ResultRowV2, ResultRowV2Skeleton, ResultTableHeaderV2 } from './result-row-v2'
import { RetailerPanel } from './retailer-panel'
import type { Product } from '@/lib/api'
import { getSavedItems, saveItem, unsaveItem, AuthError } from '@/lib/api'
import { useSession } from 'next-auth/react'
import { useViewPreference } from '@/hooks/use-view-preference'
import { useSearchLoading } from '@/components/search/search-loading-context'
import { createLogger } from '@/lib/logger'
import { refreshSessionToken, showSessionExpiredToast } from '@/hooks/use-session-refresh'
import type { RetailerPrice, ShippingInfo, ProductWithRetailers } from './types'

const logger = createLogger('search-results-grid-v2')

interface SearchResultsGridV2Props {
  products: Product[]
}

/**
 * Transform Product.prices to RetailerPrice[] format
 */
function transformToRetailers(product: Product): RetailerPrice[] {
  if (!product.prices || product.prices.length === 0) {
    return []
  }

  const roundCount = product.roundCount || 1

  return product.prices.map((price) => {
    // Determine shipping info based on available data
    // Currently we only have a simple inStock flag, so default to unknown
    const shippingInfo: ShippingInfo = { type: 'unknown' }

    return {
      retailerId: price.retailer.id,
      retailerName: price.retailer.name,
      pricePerRound: roundCount > 0 ? price.price / roundCount : price.price,
      totalPrice: price.price,
      inStock: price.inStock,
      shippingInfo,
      url: price.url,
    }
  })
}

/**
 * Get lowest price per round from retailers
 */
function getLowestPricePerRound(retailers: RetailerPrice[]): number {
  if (retailers.length === 0) return 0

  const inStock = retailers.filter((r) => r.inStock)
  const source = inStock.length > 0 ? inStock : retailers

  return Math.min(...source.map((r) => r.pricePerRound))
}

/**
 * SearchResultsGridV2 - Multi-retailer comparison grid
 *
 * Per search-results-ux-spec.md:
 * - Card view shows inline retailer rows
 * - Grid view shows retailer count, opens panel for comparison
 * - No isBestPrice, no recommendation language
 */
export function SearchResultsGridV2({ products }: SearchResultsGridV2Props) {
  const { data: session } = useSession()
  const isE2E = process.env.NEXT_PUBLIC_E2E_TEST_MODE === 'true'
  const accessToken = session?.accessToken || (isE2E ? 'e2e-token' : undefined)

  // Helper to get a valid token, refreshing if needed
  const getValidToken = useCallback(async (): Promise<string | null> => {
    if (isE2E) return 'e2e-token'
    if (accessToken) return accessToken
    const refreshed = await refreshSessionToken()
    if (!refreshed) {
      showSessionExpiredToast()
      return null
    }
    return refreshed
  }, [isE2E, accessToken])
  const searchParams = useSearchParams()
  const { navigateWithLoading } = useSearchLoading()

  // View mode with localStorage persistence
  const [viewMode] = useViewPreference('card')

  // Current sort from URL
  const currentSort = (searchParams.get('sortBy') || 'relevance') as
    | 'relevance'
    | 'price_asc'
    | 'price_desc'

  // Hide out of stock filter
  const [hideOutOfStock, setHideOutOfStock] = useState(false)

  // Panel state
  const [panelProductId, setPanelProductId] = useState<string | null>(null)

  // Track which products are saved
  const [trackedIds, setTrackedIds] = useState<Set<string>>(new Set())

  // Transform products to include retailers
  const productsWithRetailers = useMemo(() => {
    return products.map((product) => ({
      ...product,
      retailers: transformToRetailers(product),
    }))
  }, [products])

  // Find panel product
  const panelProduct = useMemo(() => {
    if (!panelProductId) return null
    return productsWithRetailers.find((p) => p.id === panelProductId) || null
  }, [panelProductId, productsWithRetailers])

  // Load saved items on mount
  useEffect(() => {
    const loadSavedItems = async () => {
      const token = await getValidToken()
      if (!token) return

      try {
        const response = await getSavedItems(token)
        const savedIds = new Set(response.items.map((item) => item.productId))
        setTrackedIds(savedIds)
      } catch (error) {
        if (error instanceof AuthError) {
          showSessionExpiredToast()
          return
        }
        logger.error('Failed to load saved items', {}, error)
      }
    }
    loadSavedItems()
  }, [getValidToken])

  // Handle URL-based sort change
  const handleSortChange = useCallback(
    (sortValue: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (sortValue === 'relevance') {
        params.delete('sortBy')
      } else {
        params.set('sortBy', sortValue)
      }
      params.delete('page')
      navigateWithLoading(`/search?${params.toString()}`)
    },
    [searchParams, navigateWithLoading]
  )

  // Handle watch toggle
  const handleWatchToggle = useCallback(
    async (productId: string) => {
      const token = await getValidToken()
      if (!token) return

      const isCurrentlyWatched = trackedIds.has(productId)

      try {
        if (isCurrentlyWatched) {
          await unsaveItem(token, productId)
          setTrackedIds((prev) => {
            const next = new Set(prev)
            next.delete(productId)
            return next
          })
        } else {
          await saveItem(token, productId)
          setTrackedIds((prev) => {
            const next = new Set(prev)
            next.add(productId)
            return next
          })
        }
      } catch (error) {
        if (error instanceof AuthError) {
          showSessionExpiredToast()
          return
        }
        logger.error('Failed to toggle watch state', {}, error)
      }
    },
    [getValidToken, trackedIds]
  )

  // Handle compare click (open panel)
  const handleCompareClick = useCallback((productId: string) => {
    setPanelProductId(productId)
  }, [])

  // Handle panel close
  const handlePanelClose = useCallback(() => {
    setPanelProductId(null)
  }, [])

  // Filter products based on hide out of stock
  const displayProducts = useMemo(() => {
    if (!hideOutOfStock) return productsWithRetailers

    return productsWithRetailers.filter((product) =>
      product.retailers.some((r) => r.inStock)
    )
  }, [productsWithRetailers, hideOutOfStock])

  // Count out of stock
  const outOfStockCount = useMemo(() => {
    return productsWithRetailers.filter(
      (product) => !product.retailers.some((r) => r.inStock)
    ).length
  }, [productsWithRetailers])

  return (
    <div className="space-y-2">
      {/* Hide out of stock filter */}
      {outOfStockCount > 0 && (
        <div className="flex items-center">
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hideOutOfStock}
              onChange={(e) => setHideOutOfStock(e.target.checked)}
              className="rounded border-border"
            />
            <span className="text-muted-foreground">
              Hide out of stock
              <span className="text-muted-foreground/60 ml-1">({outOfStockCount})</span>
            </span>
          </label>
        </div>
      )}

      {viewMode === 'card' ? (
        // Card View
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-stretch">
          {displayProducts.map((product) => (
            <div key={product.id} className="h-full">
              <ResultCardV2
                id={product.id}
                productTitle={product.name}
                caliber={product.caliber || 'Unknown'}
                bulletType={product.premium?.bulletType}
                grainWeight={product.grainWeight}
                caseMaterial={product.caseMaterial}
                roundCount={product.roundCount}
                retailers={product.retailers}
                isWatched={trackedIds.has(product.id)}
                onWatchToggle={handleWatchToggle}
                onCompareClick={handleCompareClick}
              />
            </div>
          ))}
          {displayProducts.length === 0 && (
            <div className="col-span-full py-8 text-center text-muted-foreground">
              {hideOutOfStock ? 'No in-stock items found' : 'No results'}
            </div>
          )}
        </div>
      ) : (
        // Grid View
        <>
          {/* Mobile: Card layout */}
          <div className="md:hidden grid grid-cols-1 gap-4">
            {displayProducts.length > 0 ? (
              displayProducts.map((product) => (
                <ResultCardV2
                  key={product.id}
                  id={product.id}
                  productTitle={product.name}
                  caliber={product.caliber || 'Unknown'}
                  bulletType={product.premium?.bulletType}
                  grainWeight={product.grainWeight}
                  caseMaterial={product.caseMaterial}
                  roundCount={product.roundCount}
                  retailers={product.retailers}
                  isWatched={trackedIds.has(product.id)}
                  onWatchToggle={handleWatchToggle}
                  onCompareClick={handleCompareClick}
                />
              ))
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                {hideOutOfStock ? 'No in-stock items found' : 'No results'}
              </div>
            )}
          </div>

          {/* Desktop: Table layout */}
          <div className="hidden md:block border border-border rounded-lg overflow-hidden">
            <table className="w-full">
              <ResultTableHeaderV2
                currentSort={currentSort}
                onSortChange={handleSortChange}
              />
              <tbody>
                {displayProducts.length > 0 ? (
                  displayProducts.map((product) => (
                    <ResultRowV2
                      key={product.id}
                      id={product.id}
                      productTitle={product.name}
                      caliber={product.caliber || 'Unknown'}
                      lowestPricePerRound={getLowestPricePerRound(product.retailers)}
                      retailerCount={product.retailers.length}
                      anyInStock={product.retailers.some((r) => r.inStock)}
                      isWatched={trackedIds.has(product.id)}
                      onWatchToggle={handleWatchToggle}
                      onCompareClick={handleCompareClick}
                    />
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-foreground">
                      {hideOutOfStock ? 'No in-stock items found' : 'No results'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Retailer Panel */}
      <RetailerPanel
        isOpen={panelProduct !== null}
        onClose={handlePanelClose}
        product={
          panelProduct
            ? {
                id: panelProduct.id,
                name: panelProduct.name,
                caliber: panelProduct.caliber || 'Unknown',
                bulletType: panelProduct.premium?.bulletType,
                grainWeight: panelProduct.grainWeight,
                caseMaterial: panelProduct.caseMaterial,
                roundCount: panelProduct.roundCount,
              }
            : null
        }
        retailers={panelProduct?.retailers || []}
        isWatched={panelProduct ? trackedIds.has(panelProduct.id) : false}
        onWatchToggle={handleWatchToggle}
      />
    </div>
  )
}

/**
 * SearchResultsGridV2Skeleton - Loading state
 */
export function SearchResultsGridV2Skeleton({
  count = 8,
  viewMode = 'card',
}: {
  count?: number
  viewMode?: 'card' | 'grid'
}) {
  if (viewMode === 'grid') {
    return (
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full">
          <ResultTableHeaderV2
            currentSort="relevance"
            onSortChange={() => {}}
          />
          <tbody>
            {Array.from({ length: count }).map((_, i) => (
              <ResultRowV2Skeleton key={i} />
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <ResultCardV2Skeleton key={i} />
      ))}
    </div>
  )
}
