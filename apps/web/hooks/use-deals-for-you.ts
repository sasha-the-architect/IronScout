'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { getDealsForYou } from '@/lib/api'
import type { DealsResponse, UseDealsResult } from '@/types/dashboard'
import { createLogger } from '@/lib/logger'

const logger = createLogger('hooks:deals-for-you')

/**
 * Hook for fetching personalized deals feed
 * Free: 5 deals max
 * Premium: 20 deals + explanations
 */
export function useDealsForYou(): UseDealsResult {
  const { data: session, status } = useSession()
  const [data, setData] = useState<DealsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
    } catch (err) {
      logger.error('Failed to fetch deals', {}, err)
      setError(err instanceof Error ? err.message : 'Failed to load deals')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (status === 'loading') return
    if (status === 'unauthenticated') {
      setLoading(false)
      return
    }
    if (token) {
      fetchDeals()
    }
  }, [token, status, fetchDeals])

  return { data, loading, error, refetch: fetchDeals }
}
