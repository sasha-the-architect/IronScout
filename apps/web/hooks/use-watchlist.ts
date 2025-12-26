'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import {
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  updateWatchlistItem,
} from '@/lib/api'
import type { WatchlistResponse, UseWatchlistResult } from '@/types/dashboard'
import { createLogger } from '@/lib/logger'

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

  const fetchWatchlist = useCallback(async () => {
    const token = (session as any)?.accessToken
    if (!token) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const response = await getWatchlist(token)
      setData(response)
    } catch (err) {
      logger.error('Failed to fetch watchlist', {}, err)
      setError(err instanceof Error ? err.message : 'Failed to load watchlist')
    } finally {
      setLoading(false)
    }
  }, [(session as any)?.accessToken])

  useEffect(() => {
    if (session?.user?.id) {
      fetchWatchlist()
    }
  }, [session?.user?.id, fetchWatchlist])

  const addItem = useCallback(
    async (productId: string, targetPrice?: number) => {
      const token = (session as any)?.accessToken
      if (!token) {
        throw new Error('Not authenticated')
      }

      try {
        setError(null)
        await addToWatchlist(token, productId, targetPrice)
        // Refetch to get updated list
        await fetchWatchlist()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to add item'
        setError(message)
        throw err
      }
    },
    [(session as any)?.accessToken, fetchWatchlist]
  )

  const removeItem = useCallback(
    async (id: string) => {
      const token = (session as any)?.accessToken
      if (!token) {
        throw new Error('Not authenticated')
      }

      try {
        setError(null)
        await removeFromWatchlist(id, token)
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
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to remove item'
        setError(message)
        throw err
      }
    },
    [(session as any)?.accessToken]
  )

  const updateItem = useCallback(
    async (id: string, updates: { targetPrice?: number | null }) => {
      const token = (session as any)?.accessToken
      if (!token) {
        throw new Error('Not authenticated')
      }

      try {
        setError(null)
        await updateWatchlistItem(id, updates, token)
        // Refetch to get updated item
        await fetchWatchlist()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update item'
        setError(message)
        throw err
      }
    },
    [(session as any)?.accessToken, fetchWatchlist]
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
