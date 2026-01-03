'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import {
  getSavedItems,
  saveItem,
  unsaveItem,
  updateSavedItemPrefs,
  type SavedItem,
  type SavedItemsResponse,
  type UpdateSavedItemPrefs,
} from '@/lib/api'
import { createLogger } from '@/lib/logger'

const logger = createLogger('hooks:saved-items')

/**
 * Result type for useSavedItems hook
 */
export interface UseSavedItemsResult {
  /** List of saved items */
  items: SavedItem[]
  /** Metadata about limits and tier */
  meta: SavedItemsResponse['_meta'] | null
  /** Whether the initial fetch is in progress */
  loading: boolean
  /** Error message if any operation failed */
  error: string | null
  /** Refetch the saved items list */
  refetch: () => Promise<void>
  /** Save a product (idempotent) */
  save: (productId: string) => Promise<SavedItem>
  /** Unsave a product */
  remove: (productId: string) => Promise<void>
  /** Update notification preferences */
  updatePrefs: (productId: string, prefs: UpdateSavedItemPrefs) => Promise<SavedItem>
  /** Check if a product is saved (uses local state, instant) */
  isSaved: (productId: string) => boolean
  /** Get saved item by productId (uses local state, instant) */
  getItem: (productId: string) => SavedItem | undefined
}

/**
 * Hook for managing saved items (ADR-011 unified model)
 *
 * Replaces useWatchlist and useAlerts hooks.
 *
 * Features:
 * - Automatic fetch on mount (if authenticated)
 * - Optimistic updates for remove operations
 * - Local isSaved/getItem lookups (no API call needed)
 * - Full CRUD with notification preferences
 */
export function useSavedItems(): UseSavedItemsResult {
  const { data: session, status } = useSession()
  const [data, setData] = useState<SavedItemsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Memoize token extraction
  const token = useMemo(() => (session as any)?.accessToken as string | undefined, [session])

  // Build a lookup map for fast isSaved checks
  const savedItemsMap = useMemo(() => {
    if (!data?.items) return new Map<string, SavedItem>()
    return new Map(data.items.map((item) => [item.productId, item]))
  }, [data?.items])

  const fetchSavedItems = useCallback(async () => {
    if (!token) {
      logger.debug('No token available, skipping fetch')
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      logger.debug('Fetching saved items', { hasToken: !!token, tokenLength: token?.length })
      const response = await getSavedItems(token)
      setData(response)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load saved items'
      logger.error('Failed to fetch saved items', { message }, err)
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [token])

  // Fetch on mount or when token changes
  useEffect(() => {
    if (status === 'loading') return // Wait for session
    if (status === 'unauthenticated') {
      setLoading(false)
      setData(null)
      return
    }
    if (token) {
      fetchSavedItems()
    }
  }, [token, status, fetchSavedItems])

  const save = useCallback(
    async (productId: string): Promise<SavedItem> => {
      if (!token) {
        throw new Error('Not authenticated')
      }

      try {
        setError(null)
        const response = await saveItem(token, productId)

        // Update local state
        setData((prev) => {
          if (!prev) return prev

          // Check if item already existed
          if (response._meta.wasExisting) {
            return prev
          }

          return {
            items: [response, ...prev.items],
            _meta: {
              ...response._meta,
            },
          }
        })

        return response
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to save item'
        setError(message)
        throw err
      }
    },
    [token]
  )

  const remove = useCallback(
    async (productId: string): Promise<void> => {
      if (!token) {
        throw new Error('Not authenticated')
      }

      try {
        setError(null)
        await unsaveItem(token, productId)

        // Optimistically update local state
        setData((prev) =>
          prev
            ? {
                ...prev,
                items: prev.items.filter((item) => item.productId !== productId),
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
    [token]
  )

  const updatePrefs = useCallback(
    async (productId: string, prefs: UpdateSavedItemPrefs): Promise<SavedItem> => {
      if (!token) {
        throw new Error('Not authenticated')
      }

      try {
        setError(null)
        const updated = await updateSavedItemPrefs(token, productId, prefs)

        // Update local state
        setData((prev) =>
          prev
            ? {
                ...prev,
                items: prev.items.map((item) =>
                  item.productId === productId ? updated : item
                ),
              }
            : null
        )

        return updated
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update preferences'
        setError(message)
        throw err
      }
    },
    [token]
  )

  const isSaved = useCallback(
    (productId: string): boolean => {
      return savedItemsMap.has(productId)
    },
    [savedItemsMap]
  )

  const getItem = useCallback(
    (productId: string): SavedItem | undefined => {
      return savedItemsMap.get(productId)
    },
    [savedItemsMap]
  )

  return {
    items: data?.items ?? [],
    meta: data?._meta ?? null,
    loading,
    error,
    refetch: fetchSavedItems,
    save,
    remove,
    updatePrefs,
    isSaved,
    getItem,
  }
}
