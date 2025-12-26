/**
 * Auth Routes - API-owned authentication
 *
 * All auth logic lives here. The web app calls these endpoints
 * and never directly accesses the database for auth.
 *
 * Endpoints:
 * - POST /api/auth/signup - Create new user with email/password
 * - POST /api/auth/signin - Authenticate with email/password
 * - POST /api/auth/oauth/link - Link OAuth account to user
 * - POST /api/auth/oauth/signin - Sign in or create user via OAuth
 * - GET  /api/auth/session - Validate session and get user data
 * - GET  /api/auth/user/:id - Get user profile by ID
 * - PATCH /api/auth/user/:id - Update user profile
 */

import { Router, Request, Response } from 'express'
import type { Router as RouterType } from 'express'
import { prisma } from '@ironscout/db'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { authRateLimits } from '../middleware/auth'
import { loggers } from '../config/logger'

const log = loggers.auth

const router: RouterType = Router()

// JWT secret - must be set in environment
const JWT_SECRET = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET
if (!JWT_SECRET) {
  log.error('JWT_SECRET not set - auth will not work properly')
}

// Admin emails - must use OAuth, not credentials
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

// Token expiry times
const ACCESS_TOKEN_EXPIRY = '1h'
const REFRESH_TOKEN_EXPIRY = '7d'

// ============================================================================
// SCHEMAS
// ============================================================================

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().optional(),
})

const signinSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

const oauthLinkSchema = z.object({
  userId: z.string(),
  provider: z.string(),
  providerAccountId: z.string(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  expiresAt: z.number().optional(),
})

const oauthSigninSchema = z.object({
  provider: z.string(),
  providerAccountId: z.string(),
  email: z.string().email(),
  name: z.string().optional(),
  image: z.string().optional(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  expiresAt: z.number().optional(),
})

// ============================================================================
// HELPERS
// ============================================================================

function generateTokens(userId: string, email: string) {
  const accessToken = jwt.sign({ sub: userId, email, type: 'access' }, JWT_SECRET!, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  })

  const refreshToken = jwt.sign({ sub: userId, email, type: 'refresh' }, JWT_SECRET!, {
    expiresIn: REFRESH_TOKEN_EXPIRY,
  })

  return { accessToken, refreshToken }
}

function verifyToken(token: string): { sub: string; email: string; type: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET!) as { sub: string; email: string; type: string }
  } catch {
    return null
  }
}

// ============================================================================
// SIGNUP - Create new user with email/password
// ============================================================================

router.post('/signup', authRateLimits.signup, async (req: Request, res: Response) => {
  try {
    const parsed = signupSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.issues,
      })
    }

    const { email, password, name } = parsed.data
    const emailLower = email.toLowerCase()

    // Block admin email registration via credentials
    if (ADMIN_EMAILS.includes(emailLower)) {
      return res.status(403).json({
        error: 'This email cannot be registered. Please use Google or GitHub sign-in.',
      })
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: emailLower },
    })

    if (existingUser) {
      return res.status(400).json({
        error: 'A user with this email already exists',
      })
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10)

    // Create user
    const user = await prisma.user.create({
      data: {
        email: emailLower,
        name: name || null,
        password: hashedPassword,
        tier: 'FREE',
      },
      select: {
        id: true,
        email: true,
        name: true,
        tier: true,
        image: true,
        createdAt: true,
      },
    })

    // Generate tokens
    const tokens = generateTokens(user.id, user.email)

    return res.status(201).json({
      message: 'User created successfully',
      user,
      ...tokens,
    })
  } catch (error) {
    log.error('Signup error', {}, error)
    return res.status(500).json({
      error: 'An error occurred during signup',
    })
  }
})

// ============================================================================
// SIGNIN - Authenticate with email/password
// ============================================================================

router.post('/signin', authRateLimits.signin, async (req: Request, res: Response) => {
  try {
    const parsed = signinSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Email and password are required',
      })
    }

    const { email, password } = parsed.data
    const emailLower = email.toLowerCase()

    // Block admin emails from credentials login
    if (ADMIN_EMAILS.includes(emailLower)) {
      log.warn('Blocked credentials login attempt for admin email', { email: emailLower })
      return res.status(403).json({
        error: 'Admin accounts must use OAuth sign-in',
      })
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: emailLower },
      select: {
        id: true,
        email: true,
        name: true,
        password: true,
        tier: true,
        image: true,
        status: true,
        deletionScheduledFor: true,
      },
    })

    if (!user || !user.password) {
      return res.status(401).json({
        error: 'Invalid email or password',
      })
    }

    // Check for deleted account
    if (user.status === 'DELETED') {
      return res.status(401).json({
        error: 'This account has been deleted',
      })
    }

    // Allow login for PENDING_DELETION to let them cancel
    // The frontend will show them the cancel option

    // Verify password
    const isValid = await bcrypt.compare(password, user.password)
    if (!isValid) {
      return res.status(401).json({
        error: 'Invalid email or password',
      })
    }

    // Generate tokens
    const tokens = generateTokens(user.id, user.email)

    // Return user without password
    const { password: _, status, deletionScheduledFor, ...userWithoutPassword } = user

    return res.json({
      user: userWithoutPassword,
      ...tokens,
      // Include pending deletion info so frontend can show cancel option
      pendingDeletion: status === 'PENDING_DELETION' ? {
        scheduledFor: deletionScheduledFor?.toISOString()
      } : null,
    })
  } catch (error) {
    log.error('Signin error', {}, error)
    return res.status(500).json({
      error: 'An error occurred during sign in',
    })
  }
})

// ============================================================================
// OAUTH SIGNIN - Sign in or create user via OAuth provider
// ============================================================================

router.post('/oauth/signin', authRateLimits.oauth, async (req: Request, res: Response) => {
  try {
    log.debug('OAuth signin request', {
      provider: req.body?.provider,
      email: req.body?.email,
      hasProviderAccountId: !!req.body?.providerAccountId,
    })

    // Check JWT_SECRET before proceeding
    if (!JWT_SECRET) {
      log.error('JWT_SECRET not configured - cannot generate tokens')
      return res.status(500).json({
        error: 'Server configuration error: JWT_SECRET not set',
      })
    }

    const parsed = oauthSigninSchema.safeParse(req.body)
    if (!parsed.success) {
      log.error('OAuth validation failed', { issues: parsed.error.issues })
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.issues,
      })
    }

    const { provider, providerAccountId, email, name, image, accessToken, refreshToken, expiresAt } =
      parsed.data
    const emailLower = email.toLowerCase()

    // Check if OAuth account already linked
    const existingAccount = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider,
          providerAccountId,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            tier: true,
            image: true,
            status: true,
            deletionScheduledFor: true,
          },
        },
      },
    })

    if (existingAccount) {
      const existingUser = existingAccount.user

      // Block deleted accounts
      if (existingUser.status === 'DELETED') {
        return res.status(401).json({
          error: 'This account has been deleted',
        })
      }

      // User exists, return tokens
      const tokens = generateTokens(existingUser.id, existingUser.email)
      const isAdmin = ADMIN_EMAILS.includes(existingUser.email.toLowerCase())

      return res.json({
        user: { ...existingUser, isAdmin },
        ...tokens,
        isNewUser: false,
        pendingDeletion: existingUser.status === 'PENDING_DELETION' ? {
          scheduledFor: existingUser.deletionScheduledFor?.toISOString()
        } : null,
      })
    }

    // Check if user with this email exists
    let user = await prisma.user.findUnique({
      where: { email: emailLower },
      select: {
        id: true,
        email: true,
        name: true,
        tier: true,
        image: true,
        status: true,
        deletionScheduledFor: true,
      },
    })

    if (user) {
      // Block deleted accounts
      if (user.status === 'DELETED') {
        return res.status(401).json({
          error: 'This account has been deleted',
        })
      }

      // Link OAuth account to existing user (re-links after pending deletion)
      await prisma.account.create({
        data: {
          userId: user.id,
          type: 'oauth',
          provider,
          providerAccountId,
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_at: expiresAt,
        },
      })

      const tokens = generateTokens(user.id, user.email)
      const isAdmin = ADMIN_EMAILS.includes(user.email.toLowerCase())

      return res.json({
        user: { ...user, isAdmin },
        ...tokens,
        isNewUser: false,
        pendingDeletion: user.status === 'PENDING_DELETION' ? {
          scheduledFor: user.deletionScheduledFor?.toISOString()
        } : null,
      })
    }

    // Create new user with OAuth account
    const newUser = await prisma.user.create({
      data: {
        email: emailLower,
        name: name || null,
        image: image || null,
        emailVerified: new Date(), // OAuth emails are verified
        tier: 'FREE',
        accounts: {
          create: {
            type: 'oauth',
            provider,
            providerAccountId,
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_at: expiresAt,
          },
        },
      },
      select: {
        id: true,
        email: true,
        name: true,
        tier: true,
        image: true,
      },
    })

    const tokens = generateTokens(newUser.id, newUser.email)
    const isAdmin = ADMIN_EMAILS.includes(newUser.email.toLowerCase())

    return res.status(201).json({
      user: { ...newUser, isAdmin },
      ...tokens,
      isNewUser: true,
    })
  } catch (error) {
    log.error('OAuth signin error', {}, error)
    return res.status(500).json({
      error: 'An error occurred during OAuth sign in',
    })
  }
})

// ============================================================================
// OAUTH LINK - Link OAuth account to existing user
// ============================================================================

router.post('/oauth/link', authRateLimits.oauth, async (req: Request, res: Response) => {
  try {
    const parsed = oauthLinkSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.issues,
      })
    }

    const { userId, provider, providerAccountId, accessToken, refreshToken, expiresAt } = parsed.data

    // Check if account already linked
    const existingAccount = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider,
          providerAccountId,
        },
      },
    })

    if (existingAccount) {
      if (existingAccount.userId === userId) {
        return res.json({ message: 'Account already linked' })
      }
      return res.status(400).json({
        error: 'This OAuth account is already linked to another user',
      })
    }

    // Link account
    await prisma.account.create({
      data: {
        userId,
        type: 'oauth',
        provider,
        providerAccountId,
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: expiresAt,
      },
    })

    return res.json({ message: 'Account linked successfully' })
  } catch (error) {
    log.error('OAuth link error', {}, error)
    return res.status(500).json({
      error: 'An error occurred while linking account',
    })
  }
})

// ============================================================================
// SESSION - Validate token and get user data
// ============================================================================

router.get('/session', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' })
    }

    const token = authHeader.substring(7)
    const decoded = verifyToken(token)

    if (!decoded || decoded.type !== 'access') {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    // Get fresh user data
    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: {
        id: true,
        email: true,
        name: true,
        tier: true,
        image: true,
      },
    })

    if (!user) {
      return res.status(401).json({ error: 'User not found' })
    }

    const isAdmin = ADMIN_EMAILS.includes(user.email.toLowerCase())

    return res.json({
      user: { ...user, isAdmin },
    })
  } catch (error) {
    log.error('Session error', {}, error)
    return res.status(500).json({
      error: 'An error occurred while validating session',
    })
  }
})

// ============================================================================
// REFRESH - Get new access token using refresh token
// ============================================================================

router.post('/refresh', authRateLimits.refresh, async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' })
    }

    const decoded = verifyToken(refreshToken)
    if (!decoded || decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid or expired refresh token' })
    }

    // Verify user still exists
    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: { id: true, email: true },
    })

    if (!user) {
      return res.status(401).json({ error: 'User not found' })
    }

    // Generate new tokens
    const tokens = generateTokens(user.id, user.email)

    return res.json(tokens)
  } catch (error) {
    log.error('Refresh error', {}, error)
    return res.status(500).json({
      error: 'An error occurred while refreshing token',
    })
  }
})

// ============================================================================
// USER PROFILE - Get user by ID
// ============================================================================

router.get('/user/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    // Verify authorization
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' })
    }

    const token = authHeader.substring(7)
    const decoded = verifyToken(token)

    if (!decoded) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    // Users can only access their own profile (unless admin)
    const isAdmin = ADMIN_EMAILS.includes(decoded.email.toLowerCase())
    if (decoded.sub !== id && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' })
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        tier: true,
        image: true,
        createdAt: true,
        accounts: {
          select: {
            provider: true,
            providerAccountId: true,
          },
        },
      },
    })

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    return res.json({ user })
  } catch (error) {
    log.error('Get user error', {}, error)
    return res.status(500).json({
      error: 'An error occurred while fetching user',
    })
  }
})

// ============================================================================
// UPDATE USER - Update user profile
// ============================================================================

router.patch('/user/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    // Verify authorization
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' })
    }

    const token = authHeader.substring(7)
    const decoded = verifyToken(token)

    if (!decoded || decoded.sub !== id) {
      return res.status(403).json({ error: 'Access denied' })
    }

    const { name, image } = req.body

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(image !== undefined && { image }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        tier: true,
        image: true,
      },
    })

    return res.json({ user })
  } catch (error) {
    log.error('Update user error', {}, error)
    return res.status(500).json({
      error: 'An error occurred while updating user',
    })
  }
})

export { router as authRouter }
