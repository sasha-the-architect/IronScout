/**
 * User Routes - User account management
 *
 * Endpoints:
 * - GET  /api/users/me/deletion-eligibility - Check if user can delete account
 * - POST /api/users/me/delete - Initiate account deletion (14-day cooling-off)
 * - POST /api/users/me/cancel-deletion - Cancel pending account deletion
 */

import { Router, Request, Response } from 'express'
import type { Router as RouterType } from 'express'
import { z } from 'zod'
import { prisma } from '@ironscout/db'
import jwt from 'jsonwebtoken'
import {
  checkDeletionEligibility,
  initiateAccountDeletion,
  cancelAccountDeletion
} from '../services/account-deletion'
import { logger } from '../config/logger'

const log = logger.child('users')

const router: RouterType = Router()

// All apps use NEXTAUTH_SECRET as the single JWT secret
const JWT_SECRET = process.env.NEXTAUTH_SECRET

// ============================================================================
// MIDDLEWARE
// ============================================================================

interface AuthenticatedRequest extends Request {
  userId?: string
  userEmail?: string
}

async function requireAuth(req: AuthenticatedRequest, res: Response, next: () => void) {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' })
    }

    const token = authHeader.substring(7)

    if (!JWT_SECRET) {
      log.error('JWT_SECRET not configured')
      return res.status(500).json({ error: 'Server configuration error' })
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { sub: string; email: string }

    // Verify user exists and is not deleted
    const user = await prisma.users.findUnique({
      where: { id: decoded.sub },
      select: { id: true, email: true, status: true }
    })

    if (!user) {
      return res.status(401).json({ error: 'User not found' })
    }

    // Block access for deleted accounts
    if (user.status === 'DELETED') {
      return res.status(401).json({ error: 'Account has been deleted' })
    }

    req.userId = user.id
    req.userEmail = user.email
    next()
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }
    log.error('Auth error', { error }, error as Error)
    return res.status(500).json({ error: 'Authentication failed' })
  }
}

// ============================================================================
// DELETION ELIGIBILITY CHECK
// ============================================================================

router.get('/me/deletion-eligibility', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!

    const eligibility = await checkDeletionEligibility(userId)

    // Also get current deletion status if pending
    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: {
        status: true,
        deletionRequestedAt: true,
        deletionScheduledFor: true
      }
    })

    return res.json({
      ...eligibility,
      pendingDeletion: user?.status === 'PENDING_DELETION' ? {
        requestedAt: user.deletionRequestedAt,
        scheduledFor: user.deletionScheduledFor
      } : null
    })
  } catch (error) {
    log.error('Deletion eligibility check error', { error }, error as Error)
    return res.status(500).json({ error: 'Failed to check deletion eligibility' })
  }
})

// ============================================================================
// INITIATE ACCOUNT DELETION
// ============================================================================

const deleteAccountSchema = z.object({
  confirmation: z.literal('DELETE MY ACCOUNT')
})

router.post('/me/delete', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!

    // Validate confirmation phrase
    const parsed = deleteAccountSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Please type "DELETE MY ACCOUNT" to confirm'
      })
    }

    const result = await initiateAccountDeletion(userId)

    if (!result.success) {
      return res.status(400).json({ error: result.error })
    }

    return res.json({
      success: true,
      message: 'Account deletion initiated',
      scheduledFor: result.scheduledFor,
      note: 'You have been signed out of all devices. You can cancel this within 14 days by signing back in.'
    })
  } catch (error) {
    log.error('Account deletion error', { error }, error as Error)
    return res.status(500).json({ error: 'Failed to initiate account deletion' })
  }
})

// ============================================================================
// CANCEL ACCOUNT DELETION
// ============================================================================

router.post('/me/cancel-deletion', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!

    const result = await cancelAccountDeletion(userId)

    if (!result.success) {
      return res.status(400).json({ error: result.error })
    }

    return res.json({
      success: true,
      message: 'Account deletion cancelled. Your account has been restored.'
    })
  } catch (error) {
    log.error('Cancel deletion error', { error }, error as Error)
    return res.status(500).json({ error: 'Failed to cancel account deletion' })
  }
})

export { router as usersRouter }
