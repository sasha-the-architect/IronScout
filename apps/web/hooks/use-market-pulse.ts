'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { getMarketPulse, AuthError } from '@/lib/api'
import type { MarketPulseResponse, UseMarketPulseResult } from '@/types/dashboard'
import { createLogger } from '@/lib/logger'
import { refreshSessionToken, showSessionExpiredToast } from './use-session-refresh'

const logger = createLogger('hooks:market-pulse')

/**
 * Hook for fetching Market Pulse data
 * Shows Buy/Wait indicators for user's tracked calibers
 */
export function useMarketPulse(): UseMarketPulseResult {
  const { data: session, status } = useSession()
  const [data, setData] = useState<MarketPulseResponse | null>(null)
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

  const fetchPulse = useCallback(async () => {
    const authToken = await getValidToken()
    if (!authToken) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const response = await getMarketPulse(authToken)
      setData(response)
    } catch (err) {
      if (err instanceof AuthError) {
        // Try refresh once
        const newToken = await refreshSessionToken()
        if (newToken) {
          try {
            const response = await getMarketPulse(newToken)
            setData(response)
            return
          } catch {
            // Retry failed
          }
        }
        showSessionExpiredToast()
        return
      }
      logger.error('Failed to fetch market pulse', {}, err)
      setError(err instanceof Error ? err.message : 'Failed to load market pulse')
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
      fetchPulse()
    } else {
      // Authenticated but no token - try to get one
      getValidToken().then((t) => {
        if (t) fetchPulse()
        else setLoading(false)
      })
    }
  }, [token, status, fetchPulse, getValidToken])

  return { data, loading, error, refetch: fetchPulse }
}
