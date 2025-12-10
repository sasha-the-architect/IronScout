import NextAuth from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import FacebookProvider from 'next-auth/providers/facebook'
import TwitterProvider from 'next-auth/providers/twitter'
import GitHubProvider from 'next-auth/providers/github'
import CredentialsProvider from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '@ironscout/db'
import bcrypt from 'bcryptjs'

// Admin emails - must use OAuth, not credentials
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)

// Cookie domain for cross-subdomain auth (e.g., .ironscout.ai)
// In development, leave undefined to use the current domain
const COOKIE_DOMAIN = process.env.NODE_ENV === 'production' 
  ? process.env.COOKIE_DOMAIN || '.ironscout.ai'
  : undefined

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  trustHost: true,
  providers: [
    // Email/Password Authentication
    CredentialsProvider({
      id: 'credentials',
      name: 'Email',
      credentials: {
        email: { label: "Email", type: "email", placeholder: "you@example.com" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const email = (credentials.email as string).toLowerCase()

        // Block admin emails from credentials login
        // Admins must use OAuth for verified email ownership
        if (ADMIN_EMAILS.includes(email)) {
          console.warn(`[Auth] Blocked credentials login attempt for admin email: ${email}`)
          return null
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string }
        })

        if (!user || !user.password) {
          return null
        }

        const isValid = await bcrypt.compare(credentials.password as string, user.password)
        if (!isValid) {
          return null
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        }
      },
    }),

    // Google OAuth (always available)
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

    ...(process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET ? [
      TwitterProvider({
        clientId: process.env.TWITTER_CLIENT_ID,
        clientSecret: process.env.TWITTER_CLIENT_SECRET,
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
  },
  callbacks: {
    async redirect({ url, baseUrl }) {
      console.log('[Auth] Redirect callback:', { url, baseUrl });
      
      // Allow relative URLs
      if (url.startsWith('/')) {
        return `${baseUrl}${url}`;
      }
      
      try {
        const urlObj = new URL(url);
        const baseUrlObj = new URL(baseUrl);
        
        // Allow same origin
        if (urlObj.origin === baseUrlObj.origin) {
          return url;
        }
        
        // Allow any subdomain of ironscout.ai
        const allowedDomains = [
          'ironscout.ai',
          'admin.ironscout.ai',
          'dealer.ironscout.ai',
        ];
        
        // Also allow Render URLs during development/testing
        const allowedRenderDomains = [
          'ironscout-admin.onrender.com',
          'ironscout-dealer.onrender.com',
          'ironscout-web.onrender.com',
        ];
        
        if (allowedDomains.includes(urlObj.hostname) || 
            allowedRenderDomains.includes(urlObj.hostname) ||
            urlObj.hostname.endsWith('.ironscout.ai')) {
          console.log('[Auth] Allowing redirect to:', url);
          return url;
        }
        
        console.log('[Auth] Blocked redirect to:', url);
      } catch (e) {
        console.error('[Auth] Error parsing URL:', e);
      }
      
      return baseUrl;
    },
    async session({ session, token, user }) {
      if (session?.user) {
        session.user.id = token.sub || user?.id || ''
        // Add email to session for admin checks
        session.user.email = token.email as string || session.user.email
        // Fetch tier from database if needed
        if (token.sub) {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.sub },
            select: { tier: true, email: true }
          })
          if (dbUser) {
            session.user.tier = dbUser.tier
            // Check if user is admin
            session.user.isAdmin = ADMIN_EMAILS.includes(dbUser.email.toLowerCase())
          }
        }
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
