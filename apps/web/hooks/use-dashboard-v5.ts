'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { getDashboardV5, AuthError } from '@/lib/api'
import type { DashboardV5Data } from '@/components/dashboard/v5/types'
import { createLogger } from '@/lib/logger'

const logger = createLogger('hooks:dashboard-v5')

// Max retry attempts for auth errors
const MAX_AUTH_RETRIES = 1

/**
 * Result type for useDashboardV5 hook
 */
export interface UseDashboardV5Result {
  /** Dashboard v5 data from server */
  data: DashboardV5Data | null
  /** Whether the initial fetch is in progress */
  loading: boolean
  /** Error message if any operation failed */
  error: string | null
  /** Refetch all dashboard data */
  refetch: () => Promise<void>
}

/**
 * Hook for Dashboard v5 state-oriented monitoring surface
 *
 * @deprecated Use useLoadout() from '@/hooks/use-loadout' instead.
 * This hook is kept for backwards compatibility but should not be used for new features.
 *
 * Legacy: Per ADR-020 and dashboard-product-spec-v5.md
 */
export function useDashboardV5(): UseDashboardV5Result {
  const { data: session, status, update } = useSession()
  const [data, setData] = useState<DashboardV5Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const authRetryCount = useRef(0)

  // Extract token from session
  const token = (session as any)?.accessToken as string | undefined

  const fetchData = useCallback(async () => {
    // If not authenticated, show cold-start state
    if (!token) {
      setData({
        spotlight: null,
        watchlist: { items: [], totalCount: 0 },
        priceMovement: [],
        backInStock: [],
        gunLockerMatches: [],
        hasGunLocker: false,
        lastUpdatedAt: new Date().toISOString(),
      })
      setLoading(false)
      return
    }

    try {
      const response = await getDashboardV5(token)
      setData(response)
      setError(null)
      authRetryCount.current = 0 // Reset on success
    } catch (err) {
      logger.error('Failed to fetch dashboard v5 data', {}, err)

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
    data,
    loading,
    error,
    refetch,
  }
}
