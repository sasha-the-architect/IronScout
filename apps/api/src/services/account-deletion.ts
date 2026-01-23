/**
 * Account Deletion Service
 *
 * Handles the full account deletion lifecycle:
 * 1. Eligibility check (blocks if Premium active, open invoices, merchant owner)
 * 2. Initiate deletion (soft-delete with 14-day cooling-off)
 * 3. Cancel deletion (if within cooling-off period)
 * 4. Finalize deletion (scrub PII after 14 days)
 *
 * Per requirements:
 * - 14-day cooling-off window before PII scrub
 * - Account marked PENDING_DELETION during window
 * - Sessions invalidated immediately across all devices
 * - OAuth identities detached locally (keep in provider)
 * - Stripe customer kept intact, just detach locally
 * - Audit log entries for all deletion actions
 * - Email notification sent immediately when deletion accepted
 */

import { randomUUID } from 'crypto'
import { prisma } from '@ironscout/db'
import { sendAccountDeletionEmail } from './email'
import { logger } from '../config/logger'

const log = logger.child('account-deletion')

const DELETION_COOLING_OFF_DAYS = 14

interface DeletionEligibility {
  eligible: boolean
  blockers: DeletionBlocker[]
}

interface DeletionBlocker {
  code: string
  message: string
  resolution?: string
}

/**
 * Check if a user is eligible for account deletion
 */
export async function checkDeletionEligibility(userId: string): Promise<DeletionEligibility> {
  const blockers: DeletionBlocker[] = []

  // Get user with subscription info
  const user = await prisma.users.findUnique({
    where: { id: userId },
    include: {
      subscriptions: {
        where: {
          status: { in: ['ACTIVE'] },
          type: 'USER_PREMIUM'
        }
      }
    }
  })

  if (!user) {
    return {
      eligible: false,
      blockers: [{ code: 'USER_NOT_FOUND', message: 'User not found' }]
    }
  }

  // Check if already pending deletion
  if (user.status === 'PENDING_DELETION') {
    return {
      eligible: false,
      blockers: [{
        code: 'ALREADY_PENDING',
        message: 'Account deletion is already scheduled',
        resolution: 'Wait for the deletion to complete or cancel the pending deletion'
      }]
    }
  }

  // Check for active Premium subscription
  if (user.tier === 'PREMIUM' && user.subscriptions.length > 0) {
    blockers.push({
      code: 'ACTIVE_SUBSCRIPTION',
      message: 'You have an active Premium subscription',
      resolution: 'Cancel your subscription first from the Billing page'
    })
  }

  // Check if user is a merchant owner or admin
  const merchantUser = await prisma.merchant_users.findFirst({
    where: {
      email: user.email.toLowerCase(),
      role: { in: ['OWNER', 'ADMIN'] }
    },
    include: {
      merchants: true
    }
  })

  if (merchantUser) {
    if (merchantUser.role === 'OWNER') {
      blockers.push({
        code: 'MERCHANT_OWNER',
        message: 'You are the owner of a merchant account',
        resolution: 'Transfer ownership to another team member before deleting your account'
      })
    } else if (merchantUser.role === 'ADMIN') {
      blockers.push({
        code: 'MERCHANT_ADMIN',
        message: 'You are an admin of a merchant account',
        resolution: 'Contact your merchant account owner to remove your admin access first'
      })
    }
  }

  return {
    eligible: blockers.length === 0,
    blockers
  }
}

/**
 * Initiate account deletion - starts 14-day cooling-off period
 */
export async function initiateAccountDeletion(userId: string): Promise<{ success: boolean; scheduledFor: Date | null; error?: string }> {
  // Check eligibility first
  const eligibility = await checkDeletionEligibility(userId)
  if (!eligibility.eligible) {
    return {
      success: false,
      scheduledFor: null,
      error: eligibility.blockers[0]?.message || 'Not eligible for deletion'
    }
  }

  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true }
  })

  if (!user) {
    return { success: false, scheduledFor: null, error: 'User not found' }
  }

  const now = new Date()
  const scheduledFor = new Date(now.getTime() + DELETION_COOLING_OFF_DAYS * 24 * 60 * 60 * 1000)

  // Use transaction to ensure atomicity
  await prisma.$transaction(async (tx) => {
    // 1. Mark user as pending deletion
    await tx.users.update({
      where: { id: userId },
      data: {
        status: 'PENDING_DELETION',
        deletionRequestedAt: now,
        deletionScheduledFor: scheduledFor
      }
    })

    // 2. Invalidate all sessions immediately
    await tx.session.deleteMany({
      where: { userId }
    })

    // 3. Detach OAuth accounts locally (don't revoke at provider)
    await tx.account.deleteMany({
      where: { userId }
    })

    // 4. Create audit log entry
    await tx.admin_audit_logs.create({
      data: {
        id: randomUUID(),
        adminUserId: userId, // Self-initiated
        action: 'ACCOUNT_DELETION_REQUESTED',
        resource: 'User',
        resourceId: userId,
        oldValue: { status: 'ACTIVE' },
        newValue: {
          status: 'PENDING_DELETION',
          deletionRequestedAt: now.toISOString(),
          deletionScheduledFor: scheduledFor.toISOString()
        }
      }
    })
  })

  // 5. Send confirmation email (outside transaction)
  try {
    await sendAccountDeletionEmail(user.email, {
      userName: user.name || 'User',
      scheduledFor,
      cancelUrl: `${process.env.FRONTEND_URL}/dashboard/settings?cancel-deletion=true`
    })
  } catch (emailError) {
    log.error('Failed to send confirmation email', { userId, error: emailError }, emailError as Error)
    // Don't fail the deletion request if email fails
  }

  log.info('Deletion initiated', { userId, scheduledFor: scheduledFor.toISOString() })

  return { success: true, scheduledFor }
}

/**
 * Cancel a pending account deletion (within cooling-off period)
 */
export async function cancelAccountDeletion(userId: string): Promise<{ success: boolean; error?: string }> {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: { id: true, status: true, deletionScheduledFor: true }
  })

  if (!user) {
    return { success: false, error: 'User not found' }
  }

  if (user.status !== 'PENDING_DELETION') {
    return { success: false, error: 'No pending deletion to cancel' }
  }

  // Check if we're still within the cooling-off period
  if (user.deletionScheduledFor && new Date() >= user.deletionScheduledFor) {
    return { success: false, error: 'Cooling-off period has expired' }
  }

  await prisma.$transaction(async (tx) => {
    // Restore user status
    await tx.users.update({
      where: { id: userId },
      data: {
        status: 'ACTIVE',
        deletionRequestedAt: null,
        deletionScheduledFor: null
      }
    })

    // Create audit log
    await tx.admin_audit_logs.create({
      data: {
        id: randomUUID(),
        adminUserId: userId,
        action: 'ACCOUNT_DELETION_CANCELLED',
        resource: 'User',
        resourceId: userId,
        oldValue: { status: 'PENDING_DELETION' },
        newValue: { status: 'ACTIVE' }
      }
    })
  })

  log.info('Deletion cancelled', { userId })

  return { success: true }
}

/**
 * Finalize account deletion - scrub PII (called by scheduled job)
 */
export async function finalizeAccountDeletion(userId: string): Promise<{ success: boolean; error?: string }> {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      status: true,
      deletionScheduledFor: true
    }
  })

  if (!user) {
    return { success: false, error: 'User not found' }
  }

  if (user.status !== 'PENDING_DELETION') {
    return { success: false, error: 'User is not pending deletion' }
  }

  // Verify cooling-off period has passed
  if (user.deletionScheduledFor && new Date() < user.deletionScheduledFor) {
    return { success: false, error: 'Cooling-off period has not expired yet' }
  }

  const originalEmail = user.email

  await prisma.$transaction(async (tx) => {
    // 1. Delete all watchlist items (cascade deletes alerts)
    await tx.watchlist_items.deleteMany({ where: { userId } })

    // 2. Delete watchlist collections
    await tx.watchlist_collections.deleteMany({ where: { userId } })

    // 3. Delete data subscriptions (API keys)
    await tx.data_subscriptions.deleteMany({ where: { userId } })

    // 4. Anonymize product reports (keep for data integrity)
    await tx.product_reports.updateMany({
      where: { userId },
      data: { userId: null }
    })

    // 5. Delete consumer subscriptions (keep Stripe customer intact per requirements)
    await tx.subscriptions.deleteMany({
      where: { userId, type: 'USER_PREMIUM' }
    })

    // 6. Scrub PII from user record
    const scrubId = `deleted_${userId.substring(0, 8)}_${Date.now()}`
    await tx.users.update({
      where: { id: userId },
      data: {
        email: `${scrubId}@deleted.ironscout.local`,
        name: null,
        image: null,
        password: null,
        emailVerified: null,
        status: 'DELETED',
        tier: 'FREE',
        deletionRequestedAt: null,
        deletionScheduledFor: null
      }
    })

    // 7. Create final audit log
    await tx.admin_audit_logs.create({
      data: {
        id: randomUUID(),
        adminUserId: 'SYSTEM_DELETION_JOB',
        action: 'ACCOUNT_DELETION_FINALIZED',
        resource: 'User',
        resourceId: userId,
        oldValue: {
          status: 'PENDING_DELETION',
          email: '[REDACTED]' // Don't log actual email in audit
        },
        newValue: {
          status: 'DELETED',
          piiScrubbed: true,
          finalizedAt: new Date().toISOString()
        }
      }
    })
  })

  log.info('Deletion finalized', { userId, originalEmail })

  return { success: true }
}

/**
 * Get pending deletions that are ready to be finalized
 */
export async function getPendingDeletionsToFinalize(): Promise<{ id: string; email: string; deletionScheduledFor: Date }[]> {
  const users = await prisma.users.findMany({
    where: {
      status: 'PENDING_DELETION',
      deletionScheduledFor: {
        lte: new Date()
      }
    },
    select: {
      id: true,
      email: true,
      deletionScheduledFor: true
    }
  })

  return users.map(u => ({
    id: u.id,
    email: u.email,
    deletionScheduledFor: u.deletionScheduledFor!
  }))
}
