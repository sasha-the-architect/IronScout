'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { getDealsForYou } from '@/lib/api'
import type { DealsResponse, UseDealsResult } from '@/types/dashboard'

/**
 * Hook for fetching personalized deals feed
 * Free: 5 deals max
 * Premium: 20 deals + explanations
 */
export function useDealsForYou(): UseDealsResult {
  const { data: session } = useSession()
  const [data, setData] = useState<DealsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDeals = useCallback(async () => {
    if (!session?.user?.id) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const response = await getDealsForYou(session.user.id)
      setData(response)
    } catch (err) {
      console.error('Failed to fetch deals:', err)
      setError(err instanceof Error ? err.message : 'Failed to load deals')
    } finally {
      setLoading(false)
    }
  }, [session?.user?.id])

  useEffect(() => {
    if (session?.user?.id) {
      fetchDeals()
    }
  }, [session?.user?.id, fetchDeals])

  return { data, loading, error, refetch: fetchDeals }
}
