'use client'

import { useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { refreshSessionToken, showSessionExpiredToast } from './use-session-refresh'
import { env } from '@/lib/env'

const API_BASE_URL = env.NEXT_PUBLIC_API_URL

export interface AuthenticatedFetchOptions extends Omit<RequestInit, 'headers'> {
  headers?: Record<string, string>
}

export interface UseAuthenticatedFetchResult {
  /**
   * Make an authenticated API request with automatic token refresh on 401.
   *
   * @param path - API path (e.g., '/api/dashboard/loadout')
   * @param options - Fetch options
   * @returns Response or null if auth failed
   */
  fetchWithAuth: (path: string, options?: AuthenticatedFetchOptions) => Promise<Response | null>

  /**
   * Current access token (may be undefined if not authenticated)
   */
  token: string | undefined

  /**
   * Whether the session is still loading
   */
  isLoading: boolean
}

/**
 * Hook that provides authenticated fetch with automatic token refresh.
 *
 * Features:
 * - Automatically adds Authorization header
 * - Retries once on 401 after refreshing token
 * - Shows toast with sign-in button if refresh fails
 * - Handles missing token gracefully
 *
 * Usage:
 * ```tsx
 * const { fetchWithAuth, isLoading } = useAuthenticatedFetch()
 *
 * const handleClick = async () => {
 *   const res = await fetchWithAuth('/api/some-endpoint', { method: 'POST', body: JSON.stringify(data) })
 *   if (!res) return // Auth failed, toast shown
 *   if (!res.ok) { /* handle error * / }
 *   const data = await res.json()
 * }
 * ```
 */
export function useAuthenticatedFetch(): UseAuthenticatedFetchResult {
  const { data: session, status } = useSession()
  const token = session?.accessToken

  const fetchWithAuth = useCallback(async (
    path: string,
    options: AuthenticatedFetchOptions = {}
  ): Promise<Response | null> => {
    // Get token, trying to refresh if missing
    let authToken: string | undefined = token
    if (!authToken) {
      const refreshed = await refreshSessionToken()
      if (!refreshed) {
        // No token and refresh failed - show toast
        showSessionExpiredToast()
        return null
      }
      authToken = refreshed
    }

    // Build full URL
    const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`

    // First attempt
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
        ...options.headers,
      },
    })

    // If not 401, return as-is
    if (response.status !== 401) {
      return response
    }

    // 401 - try to refresh token and retry
    const newToken = await refreshSessionToken()
    if (!newToken) {
      // Refresh failed - show toast
      showSessionExpiredToast()
      return null
    }

    // Retry with new token
    return fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${newToken}`,
        ...options.headers,
      },
    })
  }, [token])

  return {
    fetchWithAuth,
    token,
    isLoading: status === 'loading',
  }
}

/**
 * Standalone function for authenticated fetch (for use outside React components).
 * Tries to refresh token if missing or on 401.
 *
 * @param path - API path or full URL
 * @param token - Current token (optional, will try to refresh if missing)
 * @param options - Fetch options
 * @returns Response or null if auth failed
 */
export async function authenticatedFetch(
  path: string,
  token: string | undefined,
  options: AuthenticatedFetchOptions = {}
): Promise<Response | null> {
  // Get token, trying to refresh if missing
  let authToken: string | undefined = token
  if (!authToken) {
    const refreshed = await refreshSessionToken()
    if (!refreshed) {
      showSessionExpiredToast()
      return null
    }
    authToken = refreshed
  }

  // Build full URL
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`

  // First attempt
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
      ...options.headers,
    },
  })

  // If not 401, return as-is
  if (response.status !== 401) {
    return response
  }

  // 401 - try to refresh token and retry
  const newToken = await refreshSessionToken()
  if (!newToken) {
    showSessionExpiredToast()
    return null
  }

  // Retry with new token
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${newToken}`,
      ...options.headers,
    },
  })
}
