'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { getSavings, AuthError } from '@/lib/api'
import type { SavingsResponse, UseSavingsResult } from '@/types/dashboard'
import { createLogger } from '@/lib/logger'
import { refreshSessionToken, showSessionExpiredToast } from './use-session-refresh'

const logger = createLogger('hooks:savings')

/**
 * Hook for fetching savings tracking data
 * Free: Potential savings only
 * Premium: Verified savings with attribution
 */
export function useSavings(): UseSavingsResult {
  const { data: session, status } = useSession()
  const [data, setData] = useState<SavingsResponse | null>(null)
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

  const fetchSavings = useCallback(async () => {
    const authToken = await getValidToken()
    if (!authToken) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const response = await getSavings(authToken)
      setData(response)
    } catch (err) {
      if (err instanceof AuthError) {
        // Try refresh once
        const newToken = await refreshSessionToken()
        if (newToken) {
          try {
            const response = await getSavings(newToken)
            setData(response)
            return
          } catch {
            // Retry failed
          }
        }
        showSessionExpiredToast()
        return
      }
      logger.error('Failed to fetch savings', {}, err)
      setError(err instanceof Error ? err.message : 'Failed to load savings')
    } finally {
      setLoading(false)
    }
  }, [getValidToken])

  useEffect(() => {
    if (status === 'loading') return
    if (status === 'unauthenticated') {
      setLoading(false)
      return
    }
    if (token) {
      fetchSavings()
    } else {
      // Authenticated but no token - try to get one
      getValidToken().then((t) => {
        if (t) fetchSavings()
        else setLoading(false)
      })
    }
  }, [token, status, fetchSavings, getValidToken])

  return { data, loading, error, refetch: fetchSavings }
}
