'use client'

import { useCallback, useState } from 'react'
import { ResultCard, type CardBadge } from './result-card'
import type { Product } from '@/lib/api'
import { saveItem, unsaveItem, updateSavedItemPrefs } from '@/lib/api'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { AlertConfigModal, type AlertPreferences } from '@/components/alerts/alert-config-modal'
import { createLogger } from '@/lib/logger'

const logger = createLogger('search-result-card')

interface SearchResultCardProps {
  product: Product
  isTracked?: boolean
  /** Crown this card as the best price in the result set */
  isBestPrice?: boolean
  /** Additional badges to display */
  badges?: CardBadge[]
  onTrackChange?: (productId: string, isTracked: boolean) => void
  onWhyThisPrice?: (productId: string) => void
}

/**
 * SearchResultCard - Adapter for search results
 *
 * Maps a Product to the ResultCard spec contract.
 * Handles tracking state via the saved items API.
 */
export function SearchResultCard({
  product,
  isTracked = false,
  isBestPrice = false,
  badges = [],
  onTrackChange,
  onWhyThisPrice,
}: SearchResultCardProps) {
  const { data: session } = useSession()
  const accessToken = (session as any)?.accessToken

  // Modal state
  const [showAlertModal, setShowAlertModal] = useState(false)
  const [isCreatingAlert, setIsCreatingAlert] = useState(false)

  // Get the lowest price entry
  const lowestPrice = product.prices.reduce((min, price) =>
    price.price < min.price ? price : min,
    product.prices[0]
  )

  if (!lowestPrice) {
    return null
  }

  // Calculate price per round
  const pricePerRound = product.roundCount && product.roundCount > 0
    ? lowestPrice.price / product.roundCount
    : lowestPrice.price // Fallback to total if no round count

  // Handle track toggle - opens modal for new alerts, removes directly for existing
  const handleTrackToggle = useCallback(async (id: string) => {
    if (!accessToken) {
      toast.error('Please sign in to create alerts')
      return
    }

    if (isTracked) {
      // Remove alert directly
      try {
        await unsaveItem(accessToken, product.id)
        onTrackChange?.(product.id, false)
        toast.success('Alert removed')
      } catch (error) {
        logger.error('Failed to remove alert', {}, error)
        toast.error('Failed to remove alert')
      }
    } else {
      // Open modal to configure new alert
      setShowAlertModal(true)
    }
  }, [accessToken, isTracked, product.id, onTrackChange])

  // Handle alert creation with preferences
  const handleCreateAlert = useCallback(async (prefs: AlertPreferences) => {
    if (!accessToken) return

    setIsCreatingAlert(true)
    try {
      // First save the item
      await saveItem(accessToken, product.id)

      // Then update preferences
      await updateSavedItemPrefs(accessToken, product.id, {
        priceDropEnabled: prefs.priceDropEnabled,
        backInStockEnabled: prefs.backInStockEnabled,
        minDropPercent: prefs.minDropPercent,
      })

      onTrackChange?.(product.id, true)
      setShowAlertModal(false)
      toast.success('Alert created')
    } catch (error) {
      logger.error('Failed to create alert', {}, error)
      toast.error('Failed to create alert')
    } finally {
      setIsCreatingAlert(false)
    }
  }, [accessToken, product.id, onTrackChange])

  // Handle "Why this price?" click
  const handleWhyThisPrice = useCallback((id: string) => {
    onWhyThisPrice?.(product.id)
  }, [product.id, onWhyThisPrice])

  return (
    <>
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
        grain={product.grainWeight}
        caseMaterial={product.caseMaterial}
        isTracked={isTracked}
        isBestPrice={isBestPrice}
        badges={badges}
        placement="search"
        onTrackToggle={handleTrackToggle}
        onWhyThisPrice={handleWhyThisPrice}
      />

      <AlertConfigModal
        open={showAlertModal}
        onOpenChange={setShowAlertModal}
        productName={product.name}
        onConfirm={handleCreateAlert}
        onCancel={() => setShowAlertModal(false)}
        isLoading={isCreatingAlert}
      />
    </>
  )
}
