/**
 * Merchant Subscription Utilities
 *
 * Handles subscription status checks and rate-limited notifications
 * for merchant feed ingestion.
 */

import { prisma } from '@ironscout/db'
import type { merchants, MerchantSubscriptionStatus } from '@ironscout/db/generated/prisma'
import {
  notifyMerchantSubscriptionExpired,
  type SubscriptionExpiredInfo,
} from '@ironscout/notifications'
import { logger } from '../config/logger'

const log = logger.merchant

// ============================================================================
// TYPES
// ============================================================================

export interface SubscriptionCheckResult {
  isActive: boolean
  status: MerchantSubscriptionStatus
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
 * Check if a merchant's subscription allows feed processing
 *
 * Returns detailed subscription status including:
 * - Whether feed processing should proceed
 * - Current subscription status
 * - Grace period status
 * - Whether notification should be sent (rate-limited to once per day)
 */
export async function checkMerchantSubscription(
  merchantId: string
): Promise<SubscriptionCheckResult> {
  const merchant = await prisma.merchants.findUnique({
    where: { id: merchantId },
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

  if (!merchant) {
    return {
      isActive: false,
      status: 'SUSPENDED',
      expiresAt: null,
      isInGracePeriod: false,
      daysUntilExpiry: null,
      daysOverdue: null,
      shouldNotify: false,
      reason: 'Merchant not found',
    }
  }

  const now = new Date()

  // FOUNDING tier merchants get 1 year free - still check expiration
  // (No special bypass - they follow the same expiration logic as other tiers)

  // If no expiration date set, treat as active
  if (!merchant.subscriptionExpiresAt) {
    return {
      isActive: merchant.subscriptionStatus === 'ACTIVE',
      status: merchant.subscriptionStatus,
      expiresAt: null,
      isInGracePeriod: false,
      daysUntilExpiry: null,
      daysOverdue: null,
      shouldNotify: false,
    }
  }

  const expiresAt = merchant.subscriptionExpiresAt
  const gracePeriodEnd = new Date(expiresAt)
  gracePeriodEnd.setDate(gracePeriodEnd.getDate() + merchant.subscriptionGraceDays)

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
  const shouldNotify = shouldSendNotification(merchant.lastSubscriptionNotifyAt)

  // Determine effective status
  let effectiveStatus: MerchantSubscriptionStatus = merchant.subscriptionStatus

  if (isPastGracePeriod && merchant.subscriptionStatus !== 'SUSPENDED') {
    effectiveStatus = 'SUSPENDED'
  } else if (isInGracePeriod && merchant.subscriptionStatus === 'ACTIVE') {
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
        ? `Subscription expired, ${merchant.subscriptionGraceDays - (daysOverdue || 0)} days remaining in grace period`
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
 * Update the last notification timestamp for a merchant
 */
export async function updateLastNotificationTime(merchantId: string): Promise<void> {
  await prisma.merchants.update({
    where: { id: merchantId },
    data: { lastSubscriptionNotifyAt: new Date() },
  })
}

// ============================================================================
// SUBSCRIPTION NOTIFICATIONS
// ============================================================================

/**
 * Send subscription expiry notification to merchant and IronScout staff
 * Rate-limited to once per day per merchant
 */
export async function sendSubscriptionExpiryNotification(
  merchantId: string,
  feedId: string,
  subscriptionResult: SubscriptionCheckResult
): Promise<void> {
  // Get merchant and feed details
  const merchant = await prisma.merchants.findUnique({
    where: { id: merchantId },
    select: {
      id: true,
      businessName: true,
      tier: true,
      subscriptionExpiresAt: true,
      merchant_contacts: {
        where: { communicationOptIn: true },
        select: { email: true, firstName: true },
        take: 3, // Get up to 3 contacts
      },
    },
  })

  const feed = await prisma.retailer_feeds.findUnique({
    where: { id: feedId },
    select: { name: true, formatType: true },
  })

  if (!merchant) {
    log.debug('Cannot send notification - merchant not found')
    return
  }

  // Prepare notification info
  const info: SubscriptionExpiredInfo = {
    merchantId: merchant.id,
    businessName: merchant.businessName,
    tier: merchant.tier,
    expiresAt: merchant.subscriptionExpiresAt,
    isInGracePeriod: subscriptionResult.isInGracePeriod,
    daysOverdue: subscriptionResult.daysOverdue || 0,
    feedId,
    feedName: feed?.name || 'Unknown Feed',
    merchantEmails: merchant.merchant_contacts.map((c) => c.email),
  }

  // Send notification
  await notifyMerchantSubscriptionExpired(info)

  // Update last notification timestamp
  await updateLastNotificationTime(merchantId)

  log.info('Sent expiry notification', {
    businessName: merchant.businessName,
    merchantId,
  })
}
