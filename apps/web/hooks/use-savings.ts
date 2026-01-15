'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { getSavings } from '@/lib/api'
import type { SavingsResponse, UseSavingsResult } from '@/types/dashboard'
import { createLogger } from '@/lib/logger'

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

  // Extract access token from session (set by auth callback)
  const token = useMemo(() => (session as any)?.accessToken as string | undefined, [session])

  const fetchSavings = useCallback(async () => {
    if (!token) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const response = await getSavings(token)
      setData(response)
    } catch (err) {
      logger.error('Failed to fetch savings', {}, err)
      setError(err instanceof Error ? err.message : 'Failed to load savings')
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
      fetchSavings()
    } else {
      // Authenticated but no token - stop loading
      setLoading(false)
    }
  }, [token, status, fetchSavings])

  return { data, loading, error, refetch: fetchSavings }
}
