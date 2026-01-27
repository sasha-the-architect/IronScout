'use client'

import { useCallback } from 'react'
import { ResultCard, type CardBadge } from './result-card'
import type { Product } from '@/lib/api'
import { saveItem, unsaveItem, AuthError } from '@/lib/api'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { createLogger } from '@/lib/logger'
import { refreshSessionToken, showSessionExpiredToast } from '@/hooks/use-session-refresh'

const logger = createLogger('search-result-card')

interface SearchResultCardProps {
  product: Product
  isTracked?: boolean
  /** Crown this card as the best price in the result set */
  isBestPrice?: boolean
  /** Additional badges to display */
  badges?: CardBadge[]
  onTrackChange?: (productId: string, isTracked: boolean) => void
}

/**
 * SearchResultCard - Adapter for search results
 *
 * Maps a Product to the ResultCard spec contract.
 * Handles save/unsave state via the saved items API.
 *
 * Per UX Charter: Saving is the only user action.
 * Alerts are an implicit side effect, not a feature to configure.
 */
export function SearchResultCard({
  product,
  isTracked = false,
  isBestPrice = false,
  badges = [],
  onTrackChange,
}: SearchResultCardProps) {
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

  // Guard against empty prices array to prevent crashes
  if (!product.prices || product.prices.length === 0) {
    return null
  }

  // Get the lowest price entry
  const lowestPrice = product.prices.reduce((min, price) =>
    price.price < min.price ? price : min,
    product.prices[0]
  )

  // Calculate price per round
  const pricePerRound = product.roundCount && product.roundCount > 0
    ? lowestPrice.price / product.roundCount
    : lowestPrice.price // Fallback to total if no round count

  // Handle save toggle - simple save/unsave, no modal
  const handleTrackToggle = useCallback(async (id: string) => {
    const token = await getValidToken()
    if (!token) {
      return
    }

    if (isTracked) {
      // Remove from saved items
      try {
        await unsaveItem(token, product.id)
        onTrackChange?.(product.id, false)
      } catch (error) {
        if (error instanceof AuthError) {
          showSessionExpiredToast()
          return
        }
        logger.error('Failed to remove item', {}, error)
        toast.error('Failed to remove item')
      }
    } else {
      // Save item - alerts are automatically enabled by default
      try {
        await saveItem(token, product.id)
        onTrackChange?.(product.id, true)
      } catch (error) {
        if (error instanceof AuthError) {
          showSessionExpiredToast()
          return
        }
        logger.error('Failed to save item', {}, error)
        // Show the actual error message (includes limit info for tier limits)
        const message = error instanceof Error ? error.message : 'Failed to save item'
        toast.error(message)
      }
    }
  }, [getValidToken, isTracked, product.id, onTrackChange])

  return (
    <ResultCard
      id={product.id}
      productTitle={product.name}
      pricePerRound={pricePerRound}
      totalPrice={lowestPrice.price}
      roundCount={product.roundCount ?? undefined}
      inStock={lowestPrice.inStock}
      retailerName={lowestPrice.retailer.name}
      retailerUrl={lowestPrice.url}
      caliber={product.caliber || 'Unknown'}
      bulletType={product.premium?.bulletType}
      grain={product.grainWeight}
      caseMaterial={product.caseMaterial}
      isTracked={isTracked}
      isBestPrice={isBestPrice}
      badges={badges}
      placement="search"
      onTrackToggle={handleTrackToggle}
    />
  )
}
