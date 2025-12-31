'use client'

import { useCallback } from 'react'
import { ResultRow } from './result-row'
import type { Product } from '@/lib/api'
import { saveItem, unsaveItem } from '@/lib/api'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { createLogger } from '@/lib/logger'

const logger = createLogger('search-result-row')

interface SearchResultRowProps {
  product: Product
  isTracked?: boolean
  onTrackChange?: (productId: string, isTracked: boolean) => void
}

/**
 * SearchResultRow - Adapter for grid view rows
 *
 * Maps a Product to the ResultRow spec contract.
 * Handles save/unsave state via the saved items API.
 *
 * Per UX Charter: Saving is the only user action.
 * Alerts are an implicit side effect, not a feature to configure.
 */
export function SearchResultRow({
  product,
  isTracked = false,
  onTrackChange,
}: SearchResultRowProps) {
  const { data: session } = useSession()
  const accessToken = (session as any)?.accessToken

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
    : lowestPrice.price

  // Handle save toggle - simple save/unsave, no modal
  const handleTrackToggle = useCallback(async (id: string) => {
    if (!accessToken) {
      toast.error('Please sign in to save items')
      return
    }

    if (isTracked) {
      // Remove from saved items
      try {
        await unsaveItem(accessToken, product.id)
        onTrackChange?.(product.id, false)
      } catch (error) {
        logger.error('Failed to remove item', {}, error)
        toast.error('Failed to remove item')
      }
    } else {
      // Save item - alerts are automatically enabled by default
      try {
        await saveItem(accessToken, product.id)
        onTrackChange?.(product.id, true)
      } catch (error) {
        logger.error('Failed to save item', {}, error)
        toast.error('Failed to save item')
      }
    }
  }, [accessToken, isTracked, product.id, onTrackChange])

  return (
    <ResultRow
      id={product.id}
      productTitle={product.name}
      pricePerRound={pricePerRound}
      totalPrice={lowestPrice.price}
      roundCount={product.roundCount ?? undefined}
      inStock={lowestPrice.inStock}
      retailerName={lowestPrice.retailer.name}
      retailerUrl={lowestPrice.url}
      isTracked={isTracked}
      placement="search"
      onTrackToggle={handleTrackToggle}
    />
  )
}
