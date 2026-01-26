'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSession, signOut } from 'next-auth/react'
import {
  getDashboardState,
  getWatchlistPreview,
  getBestPrices,
  AuthError,
  type DashboardStateContext,
  type WatchlistPreviewItem,
  type BestPriceItem,
} from '@/lib/api'
import { createLogger } from '@/lib/logger'

const logger = createLogger('hooks:dashboard-state')

// Max retry attempts for auth errors
const MAX_AUTH_RETRIES = 1

/**
 * Dashboard state for v4 state-driven rendering
 */
export type DashboardState =
  | 'BRAND_NEW'
  | 'NEW'
  | 'NEEDS_ALERTS'
  | 'HEALTHY'
  | 'RETURNING'
  | 'POWER_USER'

/**
 * Combined dashboard data for v4
 */
export interface DashboardData {
  state: DashboardStateContext | null
  watchlistPreview: WatchlistPreviewItem[]
  bestPrices: BestPriceItem[]
}

/**
 * Result type for useDashboardState hook
 */
export interface UseDashboardStateResult {
  /** Dashboard state context from server */
  state: DashboardStateContext | null
  /** Watchlist preview items */
  watchlistPreview: WatchlistPreviewItem[]
  /** price highlights (non-personalized) */
  bestPrices: BestPriceItem[]
  /** Whether the initial fetch is in progress */
  loading: boolean
  /** Error message if any operation failed */
  error: string | null
  /** Refetch all dashboard data */
  refetch: () => Promise<void>
}

/**
 * Hook for Dashboard v4 state-driven rendering
 *
 * Fetches:
 * 1. Dashboard state (resolved server-side)
 * 2. Watchlist preview items
 * 3. price highlights (non-personalized, scope=global)
 *
 * Per dashboard-product-spec.md: state resolution is server-side.
 */
export function useDashboardState(): UseDashboardStateResult {
  const { data: session, status, update } = useSession()
  const [state, setState] = useState<DashboardStateContext | null>(null)
  const [watchlistPreview, setWatchlistPreview] = useState<WatchlistPreviewItem[]>([])
  const [bestPrices, setBestPrices] = useState<BestPriceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const authRetryCount = useRef(0)

  // Extract token from session
  const token = (session as any)?.accessToken as string | undefined

  const fetchData = useCallback(async () => {
    // price highlights don't require auth - fetch immediately
    try {
      const bestPricesResponse = await getBestPrices(5)
      setBestPrices(bestPricesResponse.items)
    } catch (err) {
      logger.error('Failed to fetch price highlights', {}, err)
      // Don't fail the whole dashboard for price highlights
    }

    // If not authenticated, show BRAND_NEW state
    if (!token) {
      setState({
        state: 'BRAND_NEW',
        watchlistCount: 0,
        alertsConfigured: 0,
        alertsMissing: 0,
        priceDropsThisWeek: 0,
      })
      setWatchlistPreview([])
      setLoading(false)
      return
    }

    try {
      // Fetch state and watchlist preview in parallel
      const [stateResponse, previewResponse] = await Promise.all([
        getDashboardState(token),
        getWatchlistPreview(token, 7), // Fetch 7 for POWER_USER, slice later
      ])

      setState(stateResponse)
      setWatchlistPreview(previewResponse.items)
      setError(null)
      authRetryCount.current = 0 // Reset on success
    } catch (err) {
      logger.error('Failed to fetch dashboard state', {}, err)

      // Handle expired/invalid session - attempt refresh first
      if (err instanceof AuthError) {
        if (authRetryCount.current < MAX_AUTH_RETRIES) {
          authRetryCount.current++
          logger.info('Token rejected, attempting session refresh', {
            attempt: authRetryCount.current,
          })

          // Trigger NextAuth session refresh
          const updatedSession = await update()

          // Check if session was refreshed successfully
          if (updatedSession && !(updatedSession as any).error) {
            logger.info('Session refreshed, retrying fetch')
            // Retry will happen via useEffect when token changes
            return
          }
        }

        // Refresh failed or max retries exceeded - sign out
        logger.info('Session refresh failed, signing out')
        signOut({ callbackUrl: '/auth/signin' })
        return
      }

      setError('Failed to load dashboard. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [token, update])

  // Fetch on mount and when token changes
  useEffect(() => {
    if (status === 'loading') return
    fetchData()
  }, [status, fetchData])

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    await fetchData()
  }, [fetchData])

  return {
    state,
    watchlistPreview,
    bestPrices,
    loading,
    error,
    refetch,
  }
}

