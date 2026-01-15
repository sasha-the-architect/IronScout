'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { getMarketPulse, AuthError } from '@/lib/api'
import type { MarketPulseResponse, UseMarketPulseResult } from '@/types/dashboard'
import { createLogger } from '@/lib/logger'

const logger = createLogger('hooks:market-pulse')

// Max retry attempts for auth errors
const MAX_AUTH_RETRIES = 1

/**
 * Hook for fetching Market Pulse data
 * Shows Buy/Wait indicators for user's tracked calibers
 */
export function useMarketPulse(): UseMarketPulseResult {
  const { data: session, status, update } = useSession()
  const [data, setData] = useState<MarketPulseResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const authRetryCount = useRef(0)

  // Extract access token from session (set by auth callback)
  const token = useMemo(() => (session as any)?.accessToken as string | undefined, [session])

  const fetchPulse = useCallback(async () => {
    if (!token) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const response = await getMarketPulse(token)
      setData(response)
      authRetryCount.current = 0 // Reset on success
    } catch (err) {
      // Handle expired/invalid session - attempt refresh first
      if (err instanceof AuthError) {
        if (authRetryCount.current < MAX_AUTH_RETRIES) {
          authRetryCount.current++
          logger.info('Token rejected, attempting session refresh', {
            attempt: authRetryCount.current,
          })

          const updatedSession = await update()
          if (updatedSession && !(updatedSession as any).error) {
            logger.info('Session refreshed, retrying fetch')
            return // Retry will happen via useEffect when token changes
          }
        }

        logger.info('Session refresh failed, signing out')
        signOut({ callbackUrl: '/auth/signin' })
        return
      }
      logger.error('Failed to fetch market pulse', {}, err)
      setError(err instanceof Error ? err.message : 'Failed to load market pulse')
    } finally {
      setLoading(false)
    }
  }, [token, update])

  useEffect(() => {
    if (status === 'loading') return
    if (status === 'unauthenticated') {
      setLoading(false)
      return
    }
    if (token) {
      fetchPulse()
    } else {
      // Authenticated but no token - stop loading
      setLoading(false)
    }
  }, [token, status, fetchPulse])

  return { data, loading, error, refetch: fetchPulse }
}
