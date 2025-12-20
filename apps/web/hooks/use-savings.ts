'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { getSavings } from '@/lib/api'
import type { SavingsResponse, UseSavingsResult } from '@/types/dashboard'

/**
 * Hook for fetching savings tracking data
 * Free: Potential savings only
 * Premium: Verified savings with attribution
 */
export function useSavings(): UseSavingsResult {
  const { data: session } = useSession()
  const [data, setData] = useState<SavingsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSavings = useCallback(async () => {
    if (!session?.user?.id) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const response = await getSavings(session.user.id)
      setData(response)
    } catch (err) {
      console.error('Failed to fetch savings:', err)
      setError(err instanceof Error ? err.message : 'Failed to load savings')
    } finally {
      setLoading(false)
    }
  }, [session?.user?.id])

  useEffect(() => {
    if (session?.user?.id) {
      fetchSavings()
    }
  }, [session?.user?.id, fetchSavings])

  return { data, loading, error, refetch: fetchSavings }
}
