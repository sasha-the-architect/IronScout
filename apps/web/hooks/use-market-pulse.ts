'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { getMarketPulse } from '@/lib/api'
import type { MarketPulseResponse, UseMarketPulseResult } from '@/types/dashboard'

/**
 * Hook for fetching Market Pulse data
 * Shows Buy/Wait indicators for user's tracked calibers
 */
export function useMarketPulse(): UseMarketPulseResult {
  const { data: session } = useSession()
  const [data, setData] = useState<MarketPulseResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPulse = useCallback(async () => {
    if (!session?.user?.id) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const response = await getMarketPulse(session.user.id)
      setData(response)
    } catch (err) {
      console.error('Failed to fetch market pulse:', err)
      setError(err instanceof Error ? err.message : 'Failed to load market pulse')
    } finally {
      setLoading(false)
    }
  }, [session?.user?.id])

  useEffect(() => {
    if (session?.user?.id) {
      fetchPulse()
    }
  }, [session?.user?.id, fetchPulse])

  return { data, loading, error, refetch: fetchPulse }
}
