'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { getMarketPulse } from '@/lib/api'
import type { MarketPulseResponse, UseMarketPulseResult } from '@/types/dashboard'
import { createLogger } from '@/lib/logger'

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
    } catch (err) {
      logger.error('Failed to fetch market pulse', {}, err)
      setError(err instanceof Error ? err.message : 'Failed to load market pulse')
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
      fetchPulse()
    }
  }, [token, status, fetchPulse])

  return { data, loading, error, refetch: fetchPulse }
}
