/**
 * Dealer Portal Subscription Check
 *
 * Determines portal access level based on subscription status:
 * - ACTIVE: Full access
 * - EXPIRED (in grace): Full access with warning banner (can still trigger feeds)
 * - EXPIRED (past grace): Redirect to expired page
 * - SUSPENDED/CANCELLED: Redirect to respective pages
 * - FOUNDING tier: 1 year free (same expiration logic as other tiers)
 */

import type { Dealer } from '@ironscout/db';

export type SubscriptionAccessLevel =
  | 'full'           // Normal access
  | 'grace_period'   // Grace period - full access with warning banner
  | 'blocked';       // No access - redirect to status page

export interface SubscriptionStatus {
  accessLevel: SubscriptionAccessLevel;
  isExpired: boolean;
  isInGracePeriod: boolean;
  daysUntilExpiry: number | null;
  daysOverdue: number;
  expiresAt: Date | null;
  redirectTo: string | null;
  bannerMessage: string | null;
  bannerType: 'warning' | 'error' | null;
}

const DEFAULT_GRACE_DAYS = 7;

/**
 * Check subscription status and determine portal access level
 */
export function checkSubscriptionStatus(
  dealer: Dealer,
  isImpersonating: boolean = false
): SubscriptionStatus {
  // Admin impersonation bypasses all subscription checks
  if (isImpersonating) {
    return {
      accessLevel: 'full',
      isExpired: false,
      isInGracePeriod: false,
      daysUntilExpiry: null,
      daysOverdue: 0,
      expiresAt: dealer.subscriptionExpiresAt,
      redirectTo: null,
      bannerMessage: null,
      bannerType: null,
    };
  }

  // FOUNDING tier dealers get 1 year free - still check expiration
  // (No special bypass - they follow the same expiration logic as other tiers)

  // Handle different subscription statuses
  const subscriptionStatus = dealer.subscriptionStatus;

  // SUSPENDED - no access
  if (subscriptionStatus === 'SUSPENDED') {
    return {
      accessLevel: 'blocked',
      isExpired: true,
      isInGracePeriod: false,
      daysUntilExpiry: null,
      daysOverdue: 0,
      expiresAt: dealer.subscriptionExpiresAt,
      redirectTo: '/subscription-suspended',
      bannerMessage: null,
      bannerType: null,
    };
  }

  // CANCELLED - no access
  if (subscriptionStatus === 'CANCELLED') {
    return {
      accessLevel: 'blocked',
      isExpired: true,
      isInGracePeriod: false,
      daysUntilExpiry: null,
      daysOverdue: 0,
      expiresAt: dealer.subscriptionExpiresAt,
      redirectTo: '/subscription-cancelled',
      bannerMessage: null,
      bannerType: null,
    };
  }

  // ACTIVE status - check expiration date
  if (subscriptionStatus === 'ACTIVE') {
    const expiresAt = dealer.subscriptionExpiresAt;

    // No expiration date set = unlimited access
    if (!expiresAt) {
      return {
        accessLevel: 'full',
        isExpired: false,
        isInGracePeriod: false,
        daysUntilExpiry: null,
        daysOverdue: 0,
        expiresAt: null,
        redirectTo: null,
        bannerMessage: null,
        bannerType: null,
      };
    }

    const now = new Date();
    const graceDays = dealer.subscriptionGraceDays ?? DEFAULT_GRACE_DAYS;
    const graceEndDate = new Date(expiresAt);
    graceEndDate.setDate(graceEndDate.getDate() + graceDays);

    // Not expired yet
    if (now < expiresAt) {
      const daysUntilExpiry = Math.ceil(
        (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Warn if expiring soon (within 7 days)
      if (daysUntilExpiry <= 7) {
        return {
          accessLevel: 'full',
          isExpired: false,
          isInGracePeriod: false,
          daysUntilExpiry,
          daysOverdue: 0,
          expiresAt,
          redirectTo: null,
          bannerMessage: `Your subscription expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'}. Renew now to avoid service interruption.`,
          bannerType: 'warning',
        };
      }

      return {
        accessLevel: 'full',
        isExpired: false,
        isInGracePeriod: false,
        daysUntilExpiry,
        daysOverdue: 0,
        expiresAt,
        redirectTo: null,
        bannerMessage: null,
        bannerType: null,
      };
    }

    // Expired but within grace period - full access with warning
    if (now < graceEndDate) {
      const daysOverdue = Math.ceil(
        (now.getTime() - expiresAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      const daysLeftInGrace = graceDays - daysOverdue;

      return {
        accessLevel: 'grace_period',
        isExpired: true,
        isInGracePeriod: true,
        daysUntilExpiry: null,
        daysOverdue,
        expiresAt,
        redirectTo: null,
        bannerMessage: `Your subscription expired ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} ago. You have ${daysLeftInGrace} day${daysLeftInGrace === 1 ? '' : 's'} left to renew before losing access.`,
        bannerType: 'error',
      };
    }

    // Past grace period - blocked
    const daysOverdue = Math.ceil(
      (now.getTime() - expiresAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    return {
      accessLevel: 'blocked',
      isExpired: true,
      isInGracePeriod: false,
      daysUntilExpiry: null,
      daysOverdue,
      expiresAt,
      redirectTo: '/subscription-expired',
      bannerMessage: null,
      bannerType: null,
    };
  }

  // EXPIRED status - check grace period
  if (subscriptionStatus === 'EXPIRED') {
    const expiresAt = dealer.subscriptionExpiresAt;
    const graceDays = dealer.subscriptionGraceDays ?? DEFAULT_GRACE_DAYS;

    if (!expiresAt) {
      // No expiration date but marked as EXPIRED - blocked
      return {
        accessLevel: 'blocked',
        isExpired: true,
        isInGracePeriod: false,
        daysUntilExpiry: null,
        daysOverdue: 0,
        expiresAt: null,
        redirectTo: '/subscription-expired',
        bannerMessage: null,
        bannerType: null,
      };
    }

    const now = new Date();
    const graceEndDate = new Date(expiresAt);
    graceEndDate.setDate(graceEndDate.getDate() + graceDays);

    const daysOverdue = Math.ceil(
      (now.getTime() - expiresAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Within grace period - full access with warning
    if (now < graceEndDate) {
      const daysLeftInGrace = graceDays - daysOverdue;

      return {
        accessLevel: 'grace_period',
        isExpired: true,
        isInGracePeriod: true,
        daysUntilExpiry: null,
        daysOverdue,
        expiresAt,
        redirectTo: null,
        bannerMessage: `Your subscription expired ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} ago. You have ${daysLeftInGrace} day${daysLeftInGrace === 1 ? '' : 's'} left to renew before losing access.`,
        bannerType: 'error',
      };
    }

    // Past grace period - blocked
    return {
      accessLevel: 'blocked',
      isExpired: true,
      isInGracePeriod: false,
      daysUntilExpiry: null,
      daysOverdue,
      expiresAt,
      redirectTo: '/subscription-expired',
      bannerMessage: null,
      bannerType: null,
    };
  }

  // Unknown status - default to full access (shouldn't happen)
  return {
    accessLevel: 'full',
    isExpired: false,
    isInGracePeriod: false,
    daysUntilExpiry: null,
    daysOverdue: 0,
    expiresAt: dealer.subscriptionExpiresAt,
    redirectTo: null,
    bannerMessage: null,
    bannerType: null,
  };
}

// ============================================================================
// TIER-BASED FEATURE GATING
// ============================================================================

export type DealerTier = 'STANDARD' | 'PRO' | 'FOUNDING';

/**
 * Features that require PRO tier (or FOUNDING which includes PRO features)
 */
export const PRO_FEATURES = {
  marketContext: true,      // /insights page - Market pricing context
  customAnalytics: true,    // /analytics page - Custom analytics
  apiAccess: true,          // API access (if/when implemented)
} as const;

export type ProFeature = keyof typeof PRO_FEATURES;

/**
 * Check if a dealer tier has access to PRO features
 * FOUNDING tier includes all PRO features
 */
export function hasProAccess(tier: string): boolean {
  return tier === 'PRO' || tier === 'FOUNDING';
}

/**
 * Check if a dealer has access to a specific PRO feature
 */
export function hasFeatureAccess(tier: string, feature: ProFeature): boolean {
  if (!PRO_FEATURES[feature]) {
    return true; // Feature not defined as PRO-only
  }
  return hasProAccess(tier);
}
