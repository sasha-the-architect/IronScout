/**
 * NextAuth Configuration - JWT-only sessions
 *
 * This auth setup does NOT connect to the database directly.
 * All user data is fetched via the API service.
 *
 * Flow:
 * - OAuth: Provider returns profile → API creates/links user → returns JWT
 * - Credentials: API validates → returns JWT
 * - Session: JWT decoded locally, user data cached or fetched from API
 */

import NextAuth from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import FacebookProvider from 'next-auth/providers/facebook'
import TwitterProvider from 'next-auth/providers/twitter'
import GitHubProvider from 'next-auth/providers/github'
import CredentialsProvider from 'next-auth/providers/credentials'
import { logger } from './logger'
import { env, isProd } from './env'

// API URL for auth endpoints
const API_URL = env.NEXT_PUBLIC_API_URL

// Admin emails - must use OAuth, not credentials
const ADMIN_EMAILS = env.ADMIN_EMAILS
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

// Access token expires in 1 hour, refresh 5 minutes before expiry
const ACCESS_TOKEN_LIFETIME_MS = 60 * 60 * 1000 // 1 hour
const REFRESH_BUFFER_MS = 5 * 60 * 1000 // 5 minutes before expiry

/**
 * Refresh the access token using the refresh token
 * Returns new tokens or null if refresh failed
 */
async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string
  refreshToken: string
  accessTokenExpires: number
} | null> {
  try {
    const response = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })

    if (!response.ok) {
      logger.auth.warn('Token refresh failed', { status: response.status })
      return null
    }

    const data = await response.json()
    logger.auth.debug('Token refreshed successfully')

    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      accessTokenExpires: Date.now() + ACCESS_TOKEN_LIFETIME_MS,
    }
  } catch (error) {
    logger.auth.error('Token refresh error', {}, error)
    return null
  }
}

// Detect if running on localhost (even in production mode)
const isLocalhost = env.NEXTAUTH_URL.includes('localhost')

// Use secure cookies only in production AND not on localhost
const useSecureCookies = isProd && !isLocalhost

// Cookie domain for cross-subdomain auth
const COOKIE_DOMAIN = useSecureCookies && env.COOKIE_DOMAIN
  ? env.COOKIE_DOMAIN
  : undefined

export const { handlers, signIn, signOut, auth } = NextAuth({
  // No adapter - pure JWT sessions
  trustHost: true,
  providers: [
    // Email/Password Authentication via API
    CredentialsProvider({
      id: 'credentials',
      name: 'Email',
      credentials: {
        email: { label: 'Email', type: 'email', placeholder: 'you@example.com' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        try {
          // Call API to authenticate
          const response = await fetch(`${API_URL}/api/auth/signin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          })

          if (!response.ok) {
            const error = await response.json()
            logger.auth.error('Signin failed', { error: error.error })
            return null
          }

          const data = await response.json()

          // Return user with tokens embedded for JWT callback
          return {
            id: data.user.id,
            email: data.user.email,
            name: data.user.name,
            image: data.user.image,
            tier: data.user.tier,
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
          }
        } catch (error) {
          logger.auth.error('Signin error', {}, error)
          return null
        }
      },
    }),

    // Google OAuth
    GoogleProvider({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    }),

    // Optional providers
    ...(process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET
      ? [
          FacebookProvider({
            clientId: process.env.FACEBOOK_CLIENT_ID,
            clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
          }),
        ]
      : []),

    ...(process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET
      ? [
          TwitterProvider({
            clientId: process.env.TWITTER_CLIENT_ID,
            clientSecret: process.env.TWITTER_CLIENT_SECRET,
          }),
        ]
      : []),

    ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ? [
          GitHubProvider({
            clientId: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
          }),
        ]
      : []),
  ],

  pages: {
    signIn: '/auth/signin',
  },

  cookies: {
    sessionToken: {
      name: useSecureCookies ? '__Secure-authjs.session-token' : 'authjs.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: useSecureCookies,
        domain: COOKIE_DOMAIN,
      },
    },
    callbackUrl: {
      name: useSecureCookies ? '__Secure-authjs.callback-url' : 'authjs.callback-url',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: useSecureCookies,
        domain: COOKIE_DOMAIN,
      },
    },
    csrfToken: {
      name: useSecureCookies ? '__Host-authjs.csrf-token' : 'authjs.csrf-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: useSecureCookies,
      },
    },
    pkceCodeVerifier: {
      name: useSecureCookies
        ? '__Secure-authjs.pkce.code_verifier'
        : 'authjs.pkce.code_verifier',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: useSecureCookies,
        maxAge: 60 * 15,
        domain: COOKIE_DOMAIN,
      },
    },
    state: {
      name: useSecureCookies ? '__Secure-authjs.state' : 'authjs.state',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: useSecureCookies,
        maxAge: 60 * 15,
        domain: COOKIE_DOMAIN,
      },
    },
    nonce: {
      name: useSecureCookies ? '__Secure-authjs.nonce' : 'authjs.nonce',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: useSecureCookies,
        domain: COOKIE_DOMAIN,
      },
    },
  },

  callbacks: {
    async signIn({ user, account, profile }) {
      // For OAuth providers, call API to create/link account
      if (account?.provider && account.provider !== 'credentials') {
        try {
          const response = await fetch(`${API_URL}/api/auth/oauth/signin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider: account.provider,
              providerAccountId: account.providerAccountId,
              email: user.email,
              name: user.name,
              image: user.image,
              accessToken: account.access_token,
              refreshToken: account.refresh_token,
              expiresAt: account.expires_at,
            }),
          })

          if (!response.ok) {
            const errorText = await response.text()
            logger.auth.error('OAuth signin failed', {
              status: response.status,
              statusText: response.statusText,
              body: errorText,
              provider: account.provider,
              email: user.email,
            })
            return false
          }

          const data = await response.json()

          // Store API tokens and user data on the user object
          // These will be available in the jwt callback
          ;(user as any).id = data.user.id
          ;(user as any).tier = data.user.tier
          ;(user as any).isAdmin = data.user.isAdmin
          ;(user as any).accessToken = data.accessToken
          ;(user as any).refreshToken = data.refreshToken

          return true
        } catch (error) {
          logger.auth.error('OAuth signin error', {}, error)
          return false
        }
      }

      return true
    },

    async redirect({ url, baseUrl }) {
      logger.auth.debug('Redirect callback', { url, baseUrl })

      // Allow relative URLs
      if (url.startsWith('/')) {
        return `${baseUrl}${url}`
      }

      try {
        const urlObj = new URL(url)
        const baseUrlObj = new URL(baseUrl)

        // Allow same origin
        if (urlObj.origin === baseUrlObj.origin) {
          return url
        }

        // Allow any subdomain of ironscout.ai
        const allowedDomains = ['ironscout.ai', 'admin.ironscout.ai', 'merchant.ironscout.ai']

        const allowedRenderDomains = [
          'ironscout-admin.onrender.com',
          'ironscout-merchant.onrender.com',
          'ironscout-web.onrender.com',
        ]

        if (
          allowedDomains.includes(urlObj.hostname) ||
          allowedRenderDomains.includes(urlObj.hostname) ||
          urlObj.hostname.endsWith('.ironscout.ai')
        ) {
          logger.auth.debug('Allowing redirect to', { url })
          return url
        }

        logger.auth.warn('Blocked redirect to', { url })
      } catch (e) {
        logger.auth.error('Error parsing URL', {}, e)
      }

      return baseUrl
    },

    async jwt({ token, user, account }) {
      // Initial sign in - store user data in token
      if (user) {
        token.sub = user.id
        token.email = user.email
        token.name = user.name
        token.picture = user.image
        token.tier = (user as any).tier || 'FREE'
        token.isAdmin = (user as any).isAdmin || ADMIN_EMAILS.includes((user.email || '').toLowerCase())
        token.accessToken = (user as any).accessToken
        token.refreshToken = (user as any).refreshToken
        // Track when the access token expires
        token.accessTokenExpires = Date.now() + ACCESS_TOKEN_LIFETIME_MS

        return token
      }

      // Subsequent requests - check if access token needs refresh
      const accessToken = token.accessToken as string | undefined
      const accessTokenExpires = token.accessTokenExpires as number | undefined
      const refreshToken = token.refreshToken as string | undefined

      // Determine if we need to refresh:
      // 1. No accessToken at all (legacy session before accessToken was added)
      // 2. Token is expired or about to expire
      const tokenMissing = !accessToken
      const tokenExpiring = accessTokenExpires && Date.now() > accessTokenExpires - REFRESH_BUFFER_MS
      const shouldRefresh = tokenMissing || tokenExpiring

      if (!shouldRefresh) {
        // Token exists and is still valid
        return token
      }

      // Need to refresh - but we need a refresh token
      if (!refreshToken) {
        // No refresh token available - user needs to re-authenticate
        // This happens for very old sessions or edge cases
        logger.auth.warn('No refresh token available, session needs re-authentication')
        token.error = 'RefreshTokenError'
        return token
      }

      // Token missing or expiring - attempt refresh
      logger.auth.debug('Refreshing access token', { reason: tokenMissing ? 'missing' : 'expiring' })
      const refreshed = await refreshAccessToken(refreshToken)

      if (refreshed) {
        // Update token with new values
        token.accessToken = refreshed.accessToken
        token.refreshToken = refreshed.refreshToken
        token.accessTokenExpires = refreshed.accessTokenExpires
        logger.auth.debug('Access token refreshed successfully')
        return token
      }

      // Refresh failed - mark token as errored
      // The session callback will handle this
      logger.auth.warn('Token refresh failed, session will be invalidated')
      token.error = 'RefreshTokenError'
      return token
    },

    async session({ session, token }) {
      if (session?.user) {
        session.user.id = token.sub || ''
        session.user.email = token.email as string
        session.user.name = token.name as string
        session.user.image = token.picture as string
        ;(session.user as any).tier = token.tier || 'FREE'
        ;(session.user as any).isAdmin = token.isAdmin || false
        // Expose access token for API calls
        ;(session as any).accessToken = token.accessToken
        // Expose error if token refresh failed (frontend can trigger sign-out)
        if (token.error) {
          ;(session as any).error = token.error
        }
      }

      return session
    },
  },

  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
})
