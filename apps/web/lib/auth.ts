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

// API URL for auth endpoints
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// Admin emails - must use OAuth, not credentials
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

// Detect if running on localhost (even in production mode)
const isLocalhost = process.env.NEXTAUTH_URL?.includes('localhost') || false

// Use secure cookies only in production AND not on localhost
const useSecureCookies = process.env.NODE_ENV === 'production' && !isLocalhost

// Cookie domain for cross-subdomain auth
const COOKIE_DOMAIN = useSecureCookies
  ? process.env.COOKIE_DOMAIN || '.ironscout.ai'
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
            console.error('[Auth] Signin failed:', error.error)
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
          console.error('[Auth] Signin error:', error)
          return null
        }
      },
    }),

    // Google OAuth
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
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
            console.error('[Auth] OAuth signin failed:', await response.text())
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
          console.error('[Auth] OAuth signin error:', error)
          return false
        }
      }

      return true
    },

    async redirect({ url, baseUrl }) {
      console.log('[Auth] Redirect callback:', { url, baseUrl })

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
        const allowedDomains = ['ironscout.ai', 'admin.ironscout.ai', 'dealer.ironscout.ai']

        const allowedRenderDomains = [
          'ironscout-admin.onrender.com',
          'ironscout-dealer.onrender.com',
          'ironscout-web.onrender.com',
        ]

        if (
          allowedDomains.includes(urlObj.hostname) ||
          allowedRenderDomains.includes(urlObj.hostname) ||
          urlObj.hostname.endsWith('.ironscout.ai')
        ) {
          console.log('[Auth] Allowing redirect to:', url)
          return url
        }

        console.log('[Auth] Blocked redirect to:', url)
      } catch (e) {
        console.error('[Auth] Error parsing URL:', e)
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
      }

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
      }

      return session
    },
  },

  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
})
