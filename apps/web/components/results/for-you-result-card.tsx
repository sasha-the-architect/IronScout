'use client'

import { useCallback } from 'react'
import { ResultCard, type CardBadge } from './result-card'
import type { ProductFeedItem } from '@/types/dashboard'
import { addToWatchlist, removeFromWatchlist, AuthError } from '@/lib/api'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { createLogger } from '@/lib/logger'
import { refreshSessionToken, showSessionExpiredToast } from '@/hooks/use-session-refresh'

const logger = createLogger('for-you-result-card')

interface ForYouResultCardProps {
  item: ProductFeedItem
  /** Crown this card as the best price */
  isBestPrice?: boolean
  /** Additional badges to display */
  badges?: CardBadge[]
  onTrackChange?: (productId: string, isTracked: boolean) => void
}

/**
 * ForYouResultCard - Adapter for dashboard "For You" feed
 *
 * Maps a ProductFeedItem to the ResultCard spec contract.
 * Uses the same card hierarchy as search results for consistency.
 */
export function ForYouResultCard({
  item,
  isBestPrice = false,
  badges = [],
  onTrackChange,
}: ForYouResultCardProps) {
  const { data: session } = useSession()
  const accessToken = session?.accessToken

  // Helper to get a valid token, refreshing if needed
  const getValidToken = useCallback(async (): Promise<string | null> => {
    if (accessToken) return accessToken
    const refreshed = await refreshSessionToken()
    if (!refreshed) {
      showSessionExpiredToast()
      return null
    }
    return refreshed
  }, [accessToken])

  // Calculate price per round (fallback to total price / default round count)
  const pricePerRound = item.pricePerRound ?? (item.price / (item.product.roundCount || 50))

  // Handle track toggle
  const handleTrackToggle = useCallback(async (id: string) => {
    const token = await getValidToken()
    if (!token) {
      return
    }

    try {
      if (item.isWatched) {
        // Note: For legacy watchlist API, we need the watchlist item ID, not product ID
        // This may need adjustment based on actual API
        await removeFromWatchlist(item.id, token)
        onTrackChange?.(item.product.id, false)
      } else {
        await addToWatchlist(token, item.product.id)
        onTrackChange?.(item.product.id, true)
      }
    } catch (error) {
      if (error instanceof AuthError) {
        showSessionExpiredToast()
        return
      }
      logger.error('Failed to toggle tracking', {}, error)
      toast.error('Failed to update alert')
    }
  }, [getValidToken, item.isWatched, item.id, item.product.id, onTrackChange])

  return (
    <ResultCard
      id={item.id}
      productTitle={item.product.name}
      pricePerRound={pricePerRound}
      totalPrice={item.price}
      roundCount={item.product.roundCount ?? undefined}
      inStock={item.inStock}
      retailerName={item.retailer.name}
      retailerUrl={item.url}
      caliber={item.product.caliber}
      grain={item.product.grainWeight ?? undefined}
      caseMaterial={undefined} // Not in ProductFeedItem
      isTracked={item.isWatched}
      isBestPrice={isBestPrice}
      badges={badges}
      placement="for_you"
      onTrackToggle={handleTrackToggle}
    />
  )
}
