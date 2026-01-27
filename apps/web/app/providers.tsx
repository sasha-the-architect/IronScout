'use client'

import { useEffect } from 'react'
import { SessionProvider } from 'next-auth/react'
import { ThemeProvider as NextThemesProvider } from 'next-themes'
import type { ThemeProviderProps } from 'next-themes'
import { PWAInstallPrompt } from '@/components/pwa'
import { ServiceWorkerProvider } from '@/lib/service-worker'
import { useSessionRefresh, refreshSessionToken, showSessionExpiredToast } from '@/hooks/use-session-refresh'
import { initSessionHelpers } from '@/lib/api'

// Workaround for next-themes React 19 compatibility
// See: https://github.com/pacocoursey/next-themes/issues/367
function ThemeProvider({ children, ...props }: ThemeProviderProps & { children: React.ReactNode }) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}

// Component that monitors session for token refresh errors
// and initializes the API session helpers for automatic retry on 401
function SessionRefreshHandler({ children }: { children: React.ReactNode }) {
  useSessionRefresh()

  // Initialize API helpers for automatic token refresh on 401
  useEffect(() => {
    initSessionHelpers(refreshSessionToken, showSessionExpiredToast)
  }, [])

  return <>{children}</>
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SessionRefreshHandler>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <ServiceWorkerProvider>
            {children}
            <PWAInstallPrompt />
          </ServiceWorkerProvider>
        </ThemeProvider>
      </SessionRefreshHandler>
    </SessionProvider>
  )
}
