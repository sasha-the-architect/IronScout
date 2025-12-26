'use client'

import { useCallback, useState } from 'react'
import { ResultRow } from './result-row'
import type { Product } from '@/lib/api'
import { saveItem, unsaveItem, updateSavedItemPrefs } from '@/lib/api'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { AlertConfigModal, type AlertPreferences } from '@/components/alerts/alert-config-modal'
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
 * Handles tracking state via the saved items API.
 */
export function SearchResultRow({
  product,
  isTracked = false,
  onTrackChange,
}: SearchResultRowProps) {
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
    : lowestPrice.price

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

  return (
    <>
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
