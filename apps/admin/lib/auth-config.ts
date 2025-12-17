/**
 * Admin Portal NextAuth Configuration
 *
 * Provides OAuth-based authentication for admin users.
 * Admins must use OAuth (Google, etc.) to verify email ownership.
 * Email must be in ADMIN_EMAILS environment variable.
 */

import NextAuth from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import FacebookProvider from 'next-auth/providers/facebook'
import GitHubProvider from 'next-auth/providers/github'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '@ironscout/db'

// Admin emails list
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean)

// Cookie domain for cross-subdomain auth (e.g., .ironscout.ai)
// In development, leave undefined to use the current domain
const COOKIE_DOMAIN = process.env.NODE_ENV === 'production'
  ? process.env.COOKIE_DOMAIN || '.ironscout.ai'
  : undefined

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  trustHost: true,
  providers: [
    // Google OAuth (primary for admins)
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),

    // Optional providers (only added if credentials are configured)
    ...(process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET ? [
      FacebookProvider({
        clientId: process.env.FACEBOOK_CLIENT_ID,
        clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
      })
    ] : []),

    ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET ? [
      GitHubProvider({
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
      })
    ] : []),
  ],
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === 'production'
        ? '__Secure-authjs.session-token'
        : 'authjs.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        domain: COOKIE_DOMAIN,
      },
    },
    callbackUrl: {
      name: process.env.NODE_ENV === 'production'
        ? '__Secure-authjs.callback-url'
        : 'authjs.callback-url',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        domain: COOKIE_DOMAIN,
      },
    },
    csrfToken: {
      name: process.env.NODE_ENV === 'production'
        ? '__Host-authjs.csrf-token'
        : 'authjs.csrf-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        // Note: __Host- prefix requires no domain to be set
      },
    },
    pkceCodeVerifier: {
      name: process.env.NODE_ENV === 'production'
        ? '__Secure-authjs.pkce.code_verifier'
        : 'authjs.pkce.code_verifier',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 15, // 15 minutes
        domain: COOKIE_DOMAIN,
      },
    },
    state: {
      name: process.env.NODE_ENV === 'production'
        ? '__Secure-authjs.state'
        : 'authjs.state',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 15, // 15 minutes
        domain: COOKIE_DOMAIN,
      },
    },
    nonce: {
      name: process.env.NODE_ENV === 'production'
        ? '__Secure-authjs.nonce'
        : 'authjs.nonce',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        domain: COOKIE_DOMAIN,
      },
    },
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      // Only allow admin emails
      const email = user.email?.toLowerCase()

      if (!email || !ADMIN_EMAILS.includes(email)) {
        console.warn(`[Admin Auth] Blocked login attempt for non-admin email: ${email}`)
        return false
      }

      console.log(`[Admin Auth] Approved login for admin: ${email}`)
      return true
    },
    async redirect({ url, baseUrl }) {
      console.log('[Admin Auth] Redirect callback:', { url, baseUrl })

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
        const allowedDomains = [
          'ironscout.ai',
          'admin.ironscout.ai',
          'dealer.ironscout.ai',
        ]

        // Also allow Render URLs during development/testing
        const allowedRenderDomains = [
          'ironscout-admin.onrender.com',
          'ironscout-dealer.onrender.com',
          'ironscout-web.onrender.com',
        ]

        if (allowedDomains.includes(urlObj.hostname) ||
            allowedRenderDomains.includes(urlObj.hostname) ||
            urlObj.hostname.endsWith('.ironscout.ai')) {
          console.log('[Admin Auth] Allowing redirect to:', url)
          return url
        }

        console.log('[Admin Auth] Blocked redirect to:', url)
      } catch (e) {
        console.error('[Admin Auth] Error parsing URL:', e)
      }

      return baseUrl
    },
    async session({ session, token, user }) {
      if (session?.user) {
        session.user.id = token.sub || user?.id || ''
        session.user.email = token.email as string || session.user.email
      }
      return session
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id
        token.email = user.email
      }
      return token
    },
  },
  session: {
    strategy: 'jwt',
  },
})
