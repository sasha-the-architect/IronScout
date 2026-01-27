'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import {
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  updateWatchlistItem,
  AuthError,
} from '@/lib/api'
import type { WatchlistResponse, UseWatchlistResult } from '@/types/dashboard'
import { createLogger } from '@/lib/logger'
import { refreshSessionToken, showSessionExpiredToast } from './use-session-refresh'

const logger = createLogger('hooks:watchlist')

/**
 * Hook for managing watchlist
 * Free: 5 items max, no collections
 * Premium: Unlimited items, collections
 */
export function useWatchlist(): UseWatchlistResult {
  const { data: session } = useSession()
  const [data, setData] = useState<WatchlistResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const token = session?.accessToken

  // Helper to get a valid token, refreshing if needed
  const getValidToken = useCallback(async (): Promise<string | null> => {
    if (token) return token
    const refreshed = await refreshSessionToken()
    if (!refreshed) {
      showSessionExpiredToast()
      return null
    }
    return refreshed
  }, [token])

  const fetchWatchlist = useCallback(async () => {
    const authToken = await getValidToken()
    if (!authToken) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const response = await getWatchlist(authToken)
      setData(response)
    } catch (err) {
      if (err instanceof AuthError) {
        // Try refresh once
        const newToken = await refreshSessionToken()
        if (newToken) {
          try {
            const response = await getWatchlist(newToken)
            setData(response)
            return
          } catch {
            // Retry failed
          }
        }
        showSessionExpiredToast()
        return
      }
      logger.error('Failed to fetch watchlist', {}, err)
      setError(err instanceof Error ? err.message : 'Failed to load watchlist')
    } finally {
      setLoading(false)
    }
  }, [getValidToken])

  useEffect(() => {
    if (session?.user?.id) {
      fetchWatchlist()
    }
  }, [session?.user?.id, fetchWatchlist])

  const addItem = useCallback(
    async (productId: string, targetPrice?: number): Promise<boolean> => {
      const authToken = await getValidToken()
      if (!authToken) {
        return false // Toast already shown
      }

      try {
        setError(null)
        await addToWatchlist(authToken, productId, targetPrice)
        // Refetch to get updated list
        await fetchWatchlist()
        return true
      } catch (err) {
        if (err instanceof AuthError) {
          showSessionExpiredToast()
          return false
        }
        const message = err instanceof Error ? err.message : 'Failed to add item'
        setError(message)
        throw err
      }
    },
    [getValidToken, fetchWatchlist]
  )

  const removeItem = useCallback(
    async (id: string): Promise<boolean> => {
      const authToken = await getValidToken()
      if (!authToken) {
        return false // Toast already shown
      }

      try {
        setError(null)
        await removeFromWatchlist(id, authToken)
        // Optimistically update local state
        setData((prev) =>
          prev
            ? {
                ...prev,
                items: prev.items.filter((item) => item.id !== id),
                _meta: {
                  ...prev._meta,
                  itemCount: prev._meta.itemCount - 1,
                  canAddMore: true,
                },
              }
            : null
        )
        return true
      } catch (err) {
        if (err instanceof AuthError) {
          showSessionExpiredToast()
          return false
        }
        const message = err instanceof Error ? err.message : 'Failed to remove item'
        setError(message)
        throw err
      }
    },
    [getValidToken]
  )

  const updateItem = useCallback(
    async (id: string, updates: { targetPrice?: number | null }): Promise<boolean> => {
      const authToken = await getValidToken()
      if (!authToken) {
        return false // Toast already shown
      }

      try {
        setError(null)
        await updateWatchlistItem(id, updates, authToken)
        // Refetch to get updated item
        await fetchWatchlist()
        return true
      } catch (err) {
        if (err instanceof AuthError) {
          showSessionExpiredToast()
          return false
        }
        const message = err instanceof Error ? err.message : 'Failed to update item'
        setError(message)
        throw err
      }
    },
    [getValidToken, fetchWatchlist]
  )

  return {
    data,
    loading,
    error,
    refetch: fetchWatchlist,
    addItem,
    removeItem,
    updateItem,
  }
}
