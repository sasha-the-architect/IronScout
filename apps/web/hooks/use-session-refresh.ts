'use client'

import { useEffect, useCallback, useRef } from 'react'
import { useSession, signOut, getSession } from 'next-auth/react'
import { createLogger } from '@/lib/logger'
import { toast } from 'sonner'

const logger = createLogger('hooks:session-refresh')

// Refresh session 5 minutes before token expires (tokens last 1 hour)
const PROACTIVE_REFRESH_INTERVAL = 50 * 60 * 1000 // 50 minutes

/**
 * Hook that monitors session for refresh token errors
 * and automatically signs out when the refresh token is invalid/expired.
 *
 * Also proactively refreshes the session to keep it alive for idle users.
 *
 * Use this in your root layout or app component.
 * Works on all pages via the Providers wrapper.
 */
export function useSessionRefresh() {
  const { data: session, update } = useSession()
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Handle session errors - redirect to login
  useEffect(() => {
    if (session?.error === 'RefreshTokenError') {
      logger.info('Session expired or token refresh failed, signing out')
      signOut({ callbackUrl: '/auth/signin?reason=session_expired' })
    }
  }, [session])

  // Proactive session refresh for idle users
  useEffect(() => {
    // Only set up interval if user is authenticated
    if (!session?.user) {
      return
    }

    // Clear any existing interval
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current)
    }

    // Set up proactive refresh
    refreshIntervalRef.current = setInterval(async () => {
      logger.debug('Proactive session refresh')
      try {
        // This triggers the JWT callback which will refresh the token if needed
        await update()
      } catch (error) {
        logger.error('Proactive refresh failed', {}, error)
      }
    }, PROACTIVE_REFRESH_INTERVAL)

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
      }
    }
  }, [session?.user, update])
}

/**
 * Try to refresh the session and get a new token.
 * Call this when an API request fails with 401.
 *
 * @returns The new access token, or null if refresh failed
 */
export async function refreshSessionToken(): Promise<string | null> {
  try {
    logger.debug('Attempting to refresh session token')
    // getSession forces a new session fetch, triggering the JWT callback
    const session = await getSession()

    if (session?.error === 'RefreshTokenError') {
      logger.warn('Session refresh returned error')
      return null
    }

    const token = session?.accessToken
    if (token) {
      logger.debug('Session token refreshed successfully')
      return token
    }

    return null
  } catch (error) {
    logger.error('Session refresh failed', {}, error)
    return null
  }
}

/**
 * Show a toast prompting the user to sign in again.
 * Use this when token refresh fails.
 */
export function showSessionExpiredToast() {
  toast.error('Your session has expired', {
    description: 'Please sign in again to continue.',
    action: {
      label: 'Sign in',
      onClick: () => {
        signOut({ callbackUrl: '/auth/signin?reason=session_expired' })
      },
    },
    duration: 10000, // Show for 10 seconds
  })
}
