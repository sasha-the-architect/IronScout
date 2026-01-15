'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { getDealsForYou, AuthError } from '@/lib/api'
import type { DealsResponse, UseDealsResult } from '@/types/dashboard'
import { createLogger } from '@/lib/logger'

const logger = createLogger('hooks:deals-for-you')

// Max retry attempts for auth errors
const MAX_AUTH_RETRIES = 1

/**
 * Hook for fetching personalized deals feed
 * Free: 5 deals max
 * Premium: 20 deals + explanations
 */
export function useDealsForYou(): UseDealsResult {
  const { data: session, status, update } = useSession()
  const [data, setData] = useState<DealsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const authRetryCount = useRef(0)

  // Extract access token from session (set by auth callback)
  const token = useMemo(() => (session as any)?.accessToken as string | undefined, [session])

  const fetchDeals = useCallback(async () => {
    if (!token) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const response = await getDealsForYou(token)
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
      logger.error('Failed to fetch deals', {}, err)
      setError(err instanceof Error ? err.message : 'Failed to load deals')
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
      fetchDeals()
    } else {
      // Authenticated but no token - stop loading
      setLoading(false)
    }
  }, [token, status, fetchDeals])

  return { data, loading, error, refetch: fetchDeals }
}
