'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import {
  getSavedItems,
  saveItem,
  unsaveItem,
  updateSavedItemPrefs,
  AuthError,
  type SavedItem,
  type SavedItemsResponse,
  type UpdateSavedItemPrefs,
} from '@/lib/api'
import { createLogger } from '@/lib/logger'
import { refreshSessionToken, showSessionExpiredToast } from './use-session-refresh'

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
  /** Save a product (idempotent). Returns null if auth failed (toast shown). */
  save: (productId: string) => Promise<SavedItem | null>
  /** Unsave a product. Returns false if auth failed (toast shown). */
  remove: (productId: string) => Promise<boolean>
  /** Update notification preferences. Returns null if auth failed (toast shown). */
  updatePrefs: (productId: string, prefs: UpdateSavedItemPrefs) => Promise<SavedItem | null>
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
  const isE2E = process.env.NEXT_PUBLIC_E2E_TEST_MODE === 'true'
  const { data: session, status } = useSession()
  const [data, setData] = useState<SavedItemsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Memoize token extraction
  const token = useMemo(
    () => (isE2E ? 'e2e-token' : session?.accessToken),
    [isE2E, session]
  )

  // Helper to get a valid token, refreshing if needed
  const getValidToken = useCallback(async (): Promise<string | null> => {
    if (isE2E) return 'e2e-token'
    if (token) return token
    // Try to refresh
    const refreshed = await refreshSessionToken()
    if (!refreshed) {
      showSessionExpiredToast()
      return null
    }
    return refreshed
  }, [isE2E, token])

  // Build a lookup map for fast isSaved checks
  const savedItemsMap = useMemo(() => {
    if (!data?.items) return new Map<string, SavedItem>()
    return new Map(data.items.map((item) => [item.productId, item]))
  }, [data?.items])

  const fetchSavedItems = useCallback(async () => {
    const authToken = await getValidToken()
    if (!authToken) {
      logger.debug('No token available, skipping fetch')
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      logger.debug('Fetching saved items')
      const response = await getSavedItems(authToken)
      setData(response)
    } catch (err) {
      if (err instanceof AuthError) {
        // Token was invalid - try refresh once
        const newToken = await refreshSessionToken()
        if (newToken) {
          try {
            const response = await getSavedItems(newToken)
            setData(response)
            return
          } catch {
            // Retry failed
          }
        }
        showSessionExpiredToast()
        return
      }
      const message = err instanceof Error ? err.message : 'Failed to load saved items'
      logger.error('Failed to fetch saved items', { message }, err)
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [getValidToken])

  // Fetch on mount or when token changes
  useEffect(() => {
    if (isE2E) {
      fetchSavedItems()
      return
    }
    if (status === 'loading') return // Wait for session
    if (status === 'unauthenticated') {
      setLoading(false)
      setData(null)
      return
    }
    if (token) {
      fetchSavedItems()
    } else {
      // Authenticated but no token (session issue) - gracefully degrade to empty state
      // This matches useLoadout behavior and avoids blocking the user
      logger.warn('Authenticated but no accessToken in session', { status })
      setLoading(false)
      setData({ items: [], _meta: { itemCount: 0, itemLimit: 0, canAddMore: false, tier: 'FREE' } })
    }
  }, [token, status, fetchSavedItems])

  const save = useCallback(
    async (productId: string): Promise<SavedItem | null> => {
      const authToken = await getValidToken()
      if (!authToken) {
        return null // Toast already shown
      }

      try {
        setError(null)
        const response = await saveItem(authToken, productId)

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
        if (err instanceof AuthError) {
          showSessionExpiredToast()
          return null
        }
        const message = err instanceof Error ? err.message : 'Failed to save item'
        setError(message)
        throw err
      }
    },
    [getValidToken]
  )

  const remove = useCallback(
    async (productId: string): Promise<boolean> => {
      const authToken = await getValidToken()
      if (!authToken) {
        return false // Toast already shown
      }

      try {
        setError(null)
        await unsaveItem(authToken, productId)

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

  const updatePrefs = useCallback(
    async (productId: string, prefs: UpdateSavedItemPrefs): Promise<SavedItem | null> => {
      const authToken = await getValidToken()
      if (!authToken) {
        return null // Toast already shown
      }

      try {
        setError(null)
        const updated = await updateSavedItemPrefs(authToken, productId, prefs)

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
        if (err instanceof AuthError) {
          showSessionExpiredToast()
          return null
        }
        const message = err instanceof Error ? err.message : 'Failed to update preferences'
        setError(message)
        throw err
      }
    },
    [getValidToken]
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
