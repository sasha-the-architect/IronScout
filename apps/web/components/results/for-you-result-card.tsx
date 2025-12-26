'use client'

import { useCallback } from 'react'
import { ResultCard, type CardBadge } from './result-card'
import type { ProductFeedItem } from '@/types/dashboard'
import { addToWatchlist, removeFromWatchlist } from '@/lib/api'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { createLogger } from '@/lib/logger'

const logger = createLogger('for-you-result-card')

interface ForYouResultCardProps {
  item: ProductFeedItem
  /** Crown this card as the best price */
  isBestPrice?: boolean
  /** Additional badges to display */
  badges?: CardBadge[]
  onTrackChange?: (productId: string, isTracked: boolean) => void
  onWhyThisPrice?: (productId: string) => void
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
  onWhyThisPrice,
}: ForYouResultCardProps) {
  const { data: session } = useSession()
  const accessToken = (session as any)?.accessToken

  // Calculate price per round (fallback to total price / default round count)
  const pricePerRound = item.pricePerRound ?? (item.price / (item.product.roundCount || 50))

  // Handle track toggle
  const handleTrackToggle = useCallback(async (id: string) => {
    if (!accessToken) {
      toast.error('Please sign in to create alerts')
      return
    }

    try {
      if (item.isWatched) {
        // Note: For legacy watchlist API, we need the watchlist item ID, not product ID
        // This may need adjustment based on actual API
        await removeFromWatchlist(item.id, accessToken)
        onTrackChange?.(item.product.id, false)
      } else {
        await addToWatchlist(accessToken, item.product.id)
        onTrackChange?.(item.product.id, true)
      }
    } catch (error) {
      logger.error('Failed to toggle tracking', {}, error)
      toast.error('Failed to update alert')
    }
  }, [accessToken, item.isWatched, item.id, item.product.id, onTrackChange])

  // Handle "Why this price?" click
  const handleWhyThisPrice = useCallback((id: string) => {
    onWhyThisPrice?.(item.product.id)
  }, [item.product.id, onWhyThisPrice])

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
      onWhyThisPrice={handleWhyThisPrice}
    />
  )
}
