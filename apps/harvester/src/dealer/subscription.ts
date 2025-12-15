/**
 * Dealer Subscription Utilities
 *
 * Handles subscription status checks and rate-limited notifications
 * for dealer feed ingestion.
 */

import { prisma } from '@ironscout/db'
import type { Dealer, DealerSubscriptionStatus } from '@ironscout/db'
import {
  notifyDealerSubscriptionExpired,
  type SubscriptionExpiredInfo,
} from '@ironscout/notifications'

// ============================================================================
// TYPES
// ============================================================================

export interface SubscriptionCheckResult {
  isActive: boolean
  status: DealerSubscriptionStatus
  expiresAt: Date | null
  isInGracePeriod: boolean
  daysUntilExpiry: number | null
  daysOverdue: number | null
  shouldNotify: boolean
  reason?: string
}

// ============================================================================
// SUBSCRIPTION CHECK
// ============================================================================

/**
 * Check if a dealer's subscription allows feed processing
 *
 * Returns detailed subscription status including:
 * - Whether feed processing should proceed
 * - Current subscription status
 * - Grace period status
 * - Whether notification should be sent (rate-limited to once per day)
 */
export async function checkDealerSubscription(
  dealerId: string
): Promise<SubscriptionCheckResult> {
  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: {
      id: true,
      businessName: true,
      subscriptionStatus: true,
      subscriptionExpiresAt: true,
      subscriptionGraceDays: true,
      lastSubscriptionNotifyAt: true,
      tier: true,
    },
  })

  if (!dealer) {
    return {
      isActive: false,
      status: 'SUSPENDED',
      expiresAt: null,
      isInGracePeriod: false,
      daysUntilExpiry: null,
      daysOverdue: null,
      shouldNotify: false,
      reason: 'Dealer not found',
    }
  }

  const now = new Date()

  // FOUNDING tier dealers have lifetime access (no expiration)
  if (dealer.tier === 'FOUNDING') {
    return {
      isActive: true,
      status: 'ACTIVE',
      expiresAt: null,
      isInGracePeriod: false,
      daysUntilExpiry: null,
      daysOverdue: null,
      shouldNotify: false,
    }
  }

  // If no expiration date set, treat as active
  if (!dealer.subscriptionExpiresAt) {
    return {
      isActive: dealer.subscriptionStatus === 'ACTIVE',
      status: dealer.subscriptionStatus,
      expiresAt: null,
      isInGracePeriod: false,
      daysUntilExpiry: null,
      daysOverdue: null,
      shouldNotify: false,
    }
  }

  const expiresAt = dealer.subscriptionExpiresAt
  const gracePeriodEnd = new Date(expiresAt)
  gracePeriodEnd.setDate(gracePeriodEnd.getDate() + dealer.subscriptionGraceDays)

  const msPerDay = 1000 * 60 * 60 * 24

  // Calculate days until expiry or days overdue
  const msUntilExpiry = expiresAt.getTime() - now.getTime()
  const daysUntilExpiry = Math.ceil(msUntilExpiry / msPerDay)
  const daysOverdue = daysUntilExpiry < 0 ? Math.abs(daysUntilExpiry) : null

  // Check if within grace period
  const isExpired = now > expiresAt
  const isInGracePeriod = isExpired && now <= gracePeriodEnd
  const isPastGracePeriod = now > gracePeriodEnd

  // Determine if we should notify (rate limit: once per day)
  const shouldNotify = shouldSendNotification(dealer.lastSubscriptionNotifyAt)

  // Determine effective status
  let effectiveStatus: DealerSubscriptionStatus = dealer.subscriptionStatus

  if (isPastGracePeriod && dealer.subscriptionStatus !== 'SUSPENDED') {
    effectiveStatus = 'SUSPENDED'
  } else if (isInGracePeriod && dealer.subscriptionStatus === 'ACTIVE') {
    effectiveStatus = 'EXPIRED'
  }

  // Subscription is active if not expired OR within grace period
  const isActive = !isExpired || isInGracePeriod

  return {
    isActive,
    status: effectiveStatus,
    expiresAt,
    isInGracePeriod,
    daysUntilExpiry: daysUntilExpiry > 0 ? daysUntilExpiry : null,
    daysOverdue,
    shouldNotify: shouldNotify && (isInGracePeriod || isPastGracePeriod),
    reason: isPastGracePeriod
      ? `Subscription expired ${daysOverdue} days ago (past grace period)`
      : isInGracePeriod
        ? `Subscription expired, ${dealer.subscriptionGraceDays - (daysOverdue || 0)} days remaining in grace period`
        : undefined,
  }
}

// ============================================================================
// RATE LIMITING
// ============================================================================

/**
 * Check if notification should be sent (rate limited to once per day)
 */
function shouldSendNotification(lastNotifyAt: Date | null): boolean {
  if (!lastNotifyAt) return true

  const now = new Date()
  const msPerDay = 1000 * 60 * 60 * 24
  const msSinceLastNotify = now.getTime() - lastNotifyAt.getTime()

  return msSinceLastNotify >= msPerDay
}

/**
 * Update the last notification timestamp for a dealer
 */
export async function updateLastNotificationTime(dealerId: string): Promise<void> {
  await prisma.dealer.update({
    where: { id: dealerId },
    data: { lastSubscriptionNotifyAt: new Date() },
  })
}

// ============================================================================
// SUBSCRIPTION NOTIFICATIONS
// ============================================================================

/**
 * Send subscription expiry notification to dealer and IronScout staff
 * Rate-limited to once per day per dealer
 */
export async function sendSubscriptionExpiryNotification(
  dealerId: string,
  feedId: string,
  subscriptionResult: SubscriptionCheckResult
): Promise<void> {
  // Get dealer and feed details
  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: {
      id: true,
      businessName: true,
      tier: true,
      subscriptionExpiresAt: true,
      contacts: {
        where: { communicationOptIn: true },
        select: { email: true, firstName: true },
        take: 3, // Get up to 3 contacts
      },
    },
  })

  const feed = await prisma.dealerFeed.findUnique({
    where: { id: feedId },
    select: { name: true, formatType: true },
  })

  if (!dealer) {
    console.log('[Subscription] Cannot send notification - dealer not found')
    return
  }

  // Prepare notification info
  const info: SubscriptionExpiredInfo = {
    dealerId: dealer.id,
    businessName: dealer.businessName,
    tier: dealer.tier,
    expiresAt: dealer.subscriptionExpiresAt,
    isInGracePeriod: subscriptionResult.isInGracePeriod,
    daysOverdue: subscriptionResult.daysOverdue || 0,
    feedId,
    feedName: feed?.name || 'Unknown Feed',
    dealerEmails: dealer.contacts.map((c) => c.email),
  }

  // Send notification
  await notifyDealerSubscriptionExpired(info)

  // Update last notification timestamp
  await updateLastNotificationTime(dealerId)

  console.log(
    `[Subscription] Sent expiry notification for dealer ${dealer.businessName} (${dealerId})`
  )
}
