'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { createLogger } from '@/lib/logger'
import { refreshSessionToken, showSessionExpiredToast } from '@/hooks/use-session-refresh'
import { env } from '@/lib/env'

const logger = createLogger('hooks:loadout')

// Backend API URL
const API_BASE_URL = env.NEXT_PUBLIC_API_URL

// Max retry attempts for auth errors
const MAX_AUTH_RETRIES = 1

// ============================================================================
// TYPES
// ============================================================================

export interface AmmoItemWithPrice {
  id: string
  ammoSkuId: string
  name: string
  caliber: string | null
  brand: string | null
  grainWeight: number | null
  roundCount: number | null
  useCase: string
  firearmId: string
  firearmNickname: string | null
  firearmCaliber: string
  priceRange: {
    min: number
    max: number
    retailerCount: number
  } | null
  inStock: boolean
}

export interface WatchingItemWithPrice {
  id: string
  productId: string
  name: string
  caliber: string | null
  brand: string | null
  grainWeight: number | null
  bulletType: string | null
  roundCount: number | null
  imageUrl: string | null
  priceRange: {
    min: number
    max: number
    retailerCount: number
  } | null
  inStock: boolean
  status: 'lowest-90-days' | 'price-moved' | 'back-in-stock' | null
}

export interface MarketActivityStats {
  retailersTracked: number
  itemsInStock: number
  lastUpdated: string
  topCalibers: Array<{
    caliber: string
    count: number
  }>
}

export interface FirearmWithAmmo {
  id: string
  caliber: string
  nickname: string | null
  imageUrl: string | null
  ammoItems: AmmoItemWithPrice[]
}

export interface LoadoutData {
  gunLocker: {
    firearms: FirearmWithAmmo[]
    totalAmmoItems: number
  }
  watching: {
    items: WatchingItemWithPrice[]
    totalCount: number
  }
  marketActivity: MarketActivityStats
  lastUpdatedAt: string
}

// ============================================================================
// HOOK
// ============================================================================

export interface UseLoadoutResult {
  data: LoadoutData | undefined
  isLoading: boolean
  error: Error | undefined
  mutate: () => Promise<void>
}

/**
 * Hook to fetch My Loadout data
 *
 * Returns:
 * - Gun Locker firearms with ammo preferences and current prices
 * - Watching items with prices and status
 * - Market activity stats
 */
export function useLoadout(): UseLoadoutResult {
  const { data: session, status } = useSession()
  const [data, setData] = useState<LoadoutData | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | undefined>(undefined)
  const authRetryCount = useRef(0)

  // Extract token from session
  const token = session?.accessToken

  const fetchData = useCallback(async () => {
    // Get token, trying to refresh if missing
    let authToken: string | undefined = token
    if (!authToken) {
      // Try to refresh the session to get a new token
      const refreshed = await refreshSessionToken()
      if (!refreshed) {
        // No token available - show empty state for unauthenticated users
        setData({
          gunLocker: { firearms: [], totalAmmoItems: 0 },
          watching: { items: [], totalCount: 0 },
          marketActivity: {
            retailersTracked: 0,
            itemsInStock: 0,
            lastUpdated: new Date().toISOString(),
            topCalibers: [],
          },
          lastUpdatedAt: new Date().toISOString(),
        })
        setIsLoading(false)
        return
      }
      authToken = refreshed
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/loadout`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
      })

      if (res.status === 401) {
        // Handle expired/invalid session - try refresh once
        if (authRetryCount.current < MAX_AUTH_RETRIES) {
          authRetryCount.current++
          logger.info('Token rejected, attempting session refresh', {
            attempt: authRetryCount.current,
          })

          const refreshed = await refreshSessionToken()
          if (refreshed) {
            logger.info('Session refreshed, retrying fetch')
            // Retry will happen on next render due to token change
            return
          }
        }

        logger.info('Session refresh failed, showing toast')
        showSessionExpiredToast()
        return
      }

      if (!res.ok) {
        throw new Error('Failed to fetch loadout data')
      }

      const response = await res.json()
      setData(response)
      setError(undefined)
      authRetryCount.current = 0
    } catch (err) {
      logger.error('Failed to fetch loadout data', {}, err)
      setError(err instanceof Error ? err : new Error('Failed to load loadout'))
    } finally {
      setIsLoading(false)
    }
  }, [token])

  // Fetch on mount and when token changes
  useEffect(() => {
    if (status === 'loading') return
    fetchData()
  }, [status, fetchData])

  const mutate = useCallback(async () => {
    setIsLoading(true)
    setError(undefined)
    await fetchData()
  }, [fetchData])

  return {
    data,
    isLoading,
    error,
    mutate,
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format price per round for display
 */
export function formatPricePerRound(price: number): string {
  return `$${price.toFixed(2)}`
}

/**
 * Format price range for display
 */
export function formatPriceRange(
  priceRange: { min: number; max: number; retailerCount: number } | null,
  options: { showRetailerCount?: boolean } = {}
): string {
  if (!priceRange) {
    return 'No price data'
  }

  const { min, max, retailerCount } = priceRange
  const { showRetailerCount = true } = options

  // Format prices
  const minStr = formatPricePerRound(min)
  const maxStr = formatPricePerRound(max)

  // Same price or very close
  if (Math.abs(max - min) < 0.01) {
    if (showRetailerCount && retailerCount > 1) {
      return `${minStr} / rd from ${retailerCount} retailers`
    }
    return `${minStr} / rd`
  }

  // Range
  if (showRetailerCount) {
    return `${minStr}–${maxStr} / rd across ${retailerCount} retailers`
  }
  return `${minStr}–${maxStr} / rd`
}

/**
 * Get status label for watching item
 */
export function getStatusLabel(status: WatchingItemWithPrice['status']): string | null {
  switch (status) {
    case 'lowest-90-days':
      return 'At recent low'
    case 'price-moved':
      return 'Price moved'
    case 'back-in-stock':
      return 'Back in stock'
    default:
      return null
  }
}

/**
 * Get use case label for ammo item
 */
export function getUseCaseLabel(useCase: string): string {
  switch (useCase) {
    case 'CARRY':
      return 'Carry'
    case 'TRAINING':
      return 'Training'
    case 'COMPETITION':
      return 'Competition'
    case 'GENERAL':
      return 'General'
    default:
      return useCase
  }
}
