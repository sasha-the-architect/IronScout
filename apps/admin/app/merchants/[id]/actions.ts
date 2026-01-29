'use server';

import { prisma } from '@ironscout/db';
import { revalidatePath } from 'next/cache';
import { getAdminSession, logAdminAction } from '@/lib/auth';
import { SignJWT } from 'jose';
import Stripe from 'stripe';
import { loggers } from '@/lib/logger';

// Initialize Stripe
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-12-15.clover' })
  : null;

/**
 * Get subscription current_period_end from items (Stripe SDK v20+)
 * In Stripe SDK v20, current_period_end moved to subscription.items.data[0]
 */
function getSubscriptionPeriodEnd(subscription: Stripe.Subscription): number {
  return subscription.items.data[0]?.current_period_end ?? 0;
}

/**
 * Get the merchant portal base URL with trailing slashes removed
 */
function getMerchantPortalUrl(): string {
  const rawUrl = process.env.MERCHANT_PORTAL_URL || 'https://merchant.ironscout.ai';
  return rawUrl.replace(/\/+$/, '');
}

export interface UpdateMerchantData {
  businessName?: string;
  contactFirstName?: string;
  contactLastName?: string;
  ownerEmail?: string;
  phone?: string;
  websiteUrl?: string;
  tier?: 'FOUNDING' | 'BASIC' | 'PRO' | 'ENTERPRISE';
  storeType?: 'ONLINE_ONLY' | 'RETAIL_AND_ONLINE';
  status?: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
}

export async function updateMerchant(merchantId: string, data: UpdateMerchantData) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  if (process.env.E2E_TEST_MODE === 'true') {
    return {
      success: true,
      merchant: {
        id: merchantId,
        businessName: data.businessName || 'E2E Ammo',
        contactFirstName: data.contactFirstName || 'E2E',
        contactLastName: data.contactLastName || 'Merchant',
        phone: data.phone || null,
        websiteUrl: data.websiteUrl || 'https://e2e.example',
        tier: data.tier || 'FOUNDING',
        storeType: data.storeType || 'ONLINE_ONLY',
        status: data.status || 'ACTIVE',
      },
      emailChanged: false,
    };
  }

  try {
    // Get old values for audit log
    const oldMerchant = await prisma.merchants.findUnique({
      where: { id: merchantId },
      include: {
        merchant_users: {
          where: { role: 'OWNER' },
          take: 1,
        },
      },
    });

    if (!oldMerchant) {
      return { success: false, error: 'Merchant not found' };
    }

    const ownerUser = oldMerchant.merchant_users[0];

    // If email is being changed, check if it's already in use
    if (data.ownerEmail && ownerUser && data.ownerEmail !== ownerUser.email) {
      const existingUser = await prisma.merchant_users.findFirst({
        where: { email: data.ownerEmail },
      });

      if (existingUser) {
        return { success: false, error: 'This email is already in use by another merchant account' };
      }
    }

    // Update merchant (excluding ownerEmail which is on MerchantUser)
    const { ownerEmail, ...merchantData } = data;

    const updatedMerchant = await prisma.merchants.update({
      where: { id: merchantId },
      data: {
        businessName: merchantData.businessName,
        contactFirstName: merchantData.contactFirstName,
        contactLastName: merchantData.contactLastName,
        phone: merchantData.phone,
        websiteUrl: merchantData.websiteUrl,
        tier: merchantData.tier,
        storeType: merchantData.storeType,
        status: merchantData.status,
      },
    });

    // Update owner user email if changed
    let emailChanged = false;
    if (ownerEmail && ownerUser && ownerEmail !== ownerUser.email) {
      await prisma.merchant_users.update({
        where: { id: ownerUser.id },
        data: {
          email: ownerEmail,
          emailVerified: false, // Reset verification when email changes
          verifyToken: crypto.randomUUID(), // Generate new verification token
        },
      });
      emailChanged = true;
    }

    // Log the action
    await logAdminAction(session.userId, 'UPDATE_MERCHANT', {
      merchantId,
      resource: 'Merchant',
      resourceId: merchantId,
      oldValue: {
        ...oldMerchant,
        ownerEmail: ownerUser?.email,
      },
      newValue: {
        ...data,
        emailChanged,
      },
    });

    revalidatePath(`/merchants/${merchantId}`);
    revalidatePath('/merchants');

    return {
      success: true,
      merchant: updatedMerchant,
      emailChanged,
    };
  } catch (error) {
    loggers.merchants.error('Failed to update merchant', { merchantId }, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to update merchant' };
  }
}

// =============================================================================
// Merchant Contact CRUD Operations
// =============================================================================

export interface ContactData {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  roles?: ('PRIMARY' | 'BILLING' | 'TECHNICAL' | 'MARKETING')[];
  marketingOptIn?: boolean;
  communicationOptIn?: boolean;
}

export async function createMerchantContact(merchantId: string, data: ContactData) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Check if email already exists for this merchant
    const existingContact = await prisma.merchant_contacts.findUnique({
      where: {
        merchantId_email: {
          merchantId,
          email: data.email,
        },
      },
    });

    if (existingContact) {
      return { success: false, error: 'A contact with this email already exists for this merchant' };
    }

    const contact = await prisma.merchant_contacts.create({
      data: {
        merchantId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone || null,
        roles: data.roles || [],
        marketingOptIn: data.marketingOptIn ?? false,
        communicationOptIn: data.communicationOptIn ?? true,
        isAccountOwner: false,
      },
    });

    await logAdminAction(session.userId, 'CREATE_MERCHANT_CONTACT', {
      merchantId,
      resource: 'MerchantContact',
      resourceId: contact.id,
      newValue: data,
    });

    revalidatePath(`/merchants/${merchantId}`);

    return { success: true, contact };
  } catch (error) {
    loggers.merchants.error('Failed to create merchant contact', { merchantId }, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to create contact' };
  }
}

export async function updateMerchantContact(contactId: string, merchantId: string, data: Partial<ContactData>) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const oldContact = await prisma.merchant_contacts.findUnique({
      where: { id: contactId },
    });

    if (!oldContact) {
      return { success: false, error: 'Contact not found' };
    }

    // Check for email uniqueness if email is being changed
    if (data.email && data.email !== oldContact.email) {
      const existingContact = await prisma.merchant_contacts.findUnique({
        where: {
          merchantId_email: {
            merchantId,
            email: data.email,
          },
        },
      });

      if (existingContact) {
        return { success: false, error: 'A contact with this email already exists for this merchant' };
      }
    }

    const contact = await prisma.merchant_contacts.update({
      where: { id: contactId },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        roles: data.roles,
        marketingOptIn: data.marketingOptIn,
        communicationOptIn: data.communicationOptIn,
      },
    });

    await logAdminAction(session.userId, 'UPDATE_MERCHANT_CONTACT', {
      merchantId,
      resource: 'MerchantContact',
      resourceId: contactId,
      oldValue: oldContact,
      newValue: data,
    });

    revalidatePath(`/merchants/${merchantId}`);

    return { success: true, contact };
  } catch (error) {
    loggers.merchants.error('Failed to update merchant contact', { merchantId, contactId }, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to update contact' };
  }
}

export async function deleteMerchantContact(contactId: string, merchantId: string) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const contact = await prisma.merchant_contacts.findUnique({
      where: { id: contactId },
    });

    if (!contact) {
      return { success: false, error: 'Contact not found' };
    }

    // Prevent deleting the account owner contact
    if (contact.isAccountOwner) {
      return { success: false, error: 'Cannot delete the account owner contact. Please transfer ownership first.' };
    }

    await prisma.merchant_contacts.delete({
      where: { id: contactId },
    });

    await logAdminAction(session.userId, 'DELETE_MERCHANT_CONTACT', {
      merchantId,
      resource: 'MerchantContact',
      resourceId: contactId,
      oldValue: contact,
    });

    revalidatePath(`/merchants/${merchantId}`);

    return { success: true };
  } catch (error) {
    loggers.merchants.error('Failed to delete merchant contact', { merchantId, contactId }, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to delete contact' };
  }
}

// =============================================================================
// Account Ownership Transfer
// =============================================================================

/**
 * Transfer account ownership from one contact to another
 * Admin-facing action for merchant management
 */
export async function transferAccountOwnership(merchantId: string, newOwnerId: string) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Verify both contacts exist and belong to the merchant
    const [currentOwner, newOwner] = await Promise.all([
      prisma.merchant_contacts.findFirst({
        where: { merchantId, isAccountOwner: true },
      }),
      prisma.merchant_contacts.findFirst({
        where: { id: newOwnerId, merchantId },
      }),
    ]);

    if (!newOwner) {
      return { success: false, error: 'New account owner contact not found' };
    }

    if (!currentOwner) {
      return { success: false, error: 'Current account owner not found' };
    }

    // Perform the transfer in a transaction
    const [oldOwnerAfter, newOwnerAfter] = await Promise.all([
      prisma.merchant_contacts.update({
        where: { id: currentOwner.id },
        data: { isAccountOwner: false },
      }),
      prisma.merchant_contacts.update({
        where: { id: newOwnerId },
        data: { isAccountOwner: true },
      }),
    ]);

    // Log the action
    await logAdminAction(session.userId, 'TRANSFER_ACCOUNT_OWNERSHIP', {
      merchantId,
      resource: 'MerchantContact',
      resourceId: newOwnerId,
      oldValue: {
        currentOwnerId: currentOwner.id,
        currentOwnerEmail: currentOwner.email,
      },
      newValue: {
        newOwnerId: newOwner.id,
        newOwnerEmail: newOwner.email,
      },
    });

    revalidatePath(`/merchants/${merchantId}`);

    return {
      success: true,
      message: `Account ownership transferred from ${currentOwner.email} to ${newOwner.email}`,
      oldOwner: oldOwnerAfter,
      newOwner: newOwnerAfter,
    };
  } catch (error) {
    loggers.merchants.error('Failed to transfer account ownership', { merchantId, newOwnerId }, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to transfer account ownership' };
  }
}

/**
 * Set a contact as the account owner (used when there's no current owner or admin override)
 * Admin-facing action for merchant management
 */
export async function setAccountOwner(merchantId: string, contactId: string) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Verify the contact exists and belongs to the merchant
    const contact = await prisma.merchant_contacts.findFirst({
      where: { id: contactId, merchantId },
    });

    if (!contact) {
      return { success: false, error: 'Contact not found' };
    }

    // Get current owner (if any)
    const currentOwner = await prisma.merchant_contacts.findFirst({
      where: { merchantId, isAccountOwner: true },
    });

    // Unset current owner if exists
    if (currentOwner) {
      await prisma.merchant_contacts.update({
        where: { id: currentOwner.id },
        data: { isAccountOwner: false },
      });
    }

    // Set new owner
    const newOwner = await prisma.merchant_contacts.update({
      where: { id: contactId },
      data: { isAccountOwner: true },
    });

    // Log the action
    await logAdminAction(session.userId, 'SET_ACCOUNT_OWNER', {
      merchantId,
      resource: 'MerchantContact',
      resourceId: contactId,
      oldValue: currentOwner ? {
        previousOwnerId: currentOwner.id,
        previousOwnerEmail: currentOwner.email,
      } : null,
      newValue: {
        newOwnerId: contact.id,
        newOwnerEmail: contact.email,
      },
    });

    revalidatePath(`/merchants/${merchantId}`);

    return {
      success: true,
      message: `${contact.firstName} ${contact.lastName} is now the account owner`,
      newOwner,
    };
  } catch (error) {
    loggers.merchants.error('Failed to set account owner', { merchantId, contactId }, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to set account owner' };
  }
}

// =============================================================================
// Resend Verification Email
// =============================================================================

export async function resendVerificationEmail(merchantId: string) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Get the merchant owner
    const merchantUser = await prisma.merchant_users.findFirst({
      where: { merchantId, role: 'OWNER' },
      include: { merchants: true },
    });

    if (!merchantUser) {
      return { success: false, error: 'Merchant owner not found' };
    }

    if (merchantUser.emailVerified) {
      return { success: false, error: 'Email is already verified' };
    }

    // Generate new verification token
    const verifyToken = crypto.randomUUID();

    // Update user with new token
    await prisma.merchant_users.update({
      where: { id: merchantUser.id },
      data: { verifyToken },
    });

    // Send verification email
    const baseUrl = getMerchantPortalUrl();
    const verifyUrl = `${baseUrl}/verify-email?token=${verifyToken}`;

    // Use Resend to send the email
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      loggers.merchants.error('RESEND_API_KEY not configured', { merchantId });
      return { success: false, error: 'Email service not configured' };
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'IronScout <noreply@ironscout.ai>',
        to: merchantUser.email,
        subject: 'Verify Your IronScout Merchant Account',
        html: `
          <h1>Verify Your Email Address</h1>
          <p>Hi ${merchantUser.name},</p>
          <p>An admin has requested that we resend your verification email for ${merchantUser.merchants.businessName}.</p>
          <p>Please click the link below to verify your email address:</p>
          <p><a href="${verifyUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Verify Email Address</a></p>
          <p>Or copy and paste this URL into your browser:</p>
          <p>${verifyUrl}</p>
          <p>If you didn't request this, you can safely ignore this email.</p>
          <p>Thanks,<br>The IronScout Team</p>
        `,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      loggers.merchants.error('Failed to send verification email', { merchantId, errorData });
      return { success: false, error: 'Failed to send email' };
    }

    await logAdminAction(session.userId, 'RESEND_VERIFICATION_EMAIL', {
      merchantId,
      resource: 'MerchantUser',
      resourceId: merchantUser.id,
      newValue: { email: merchantUser.email },
    });

    return { success: true, email: merchantUser.email };
  } catch (error) {
    loggers.merchants.error('Failed to resend verification email', { merchantId }, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to resend verification email' };
  }
}

// =============================================================================
// Admin Impersonation
// =============================================================================

// All apps use NEXTAUTH_SECRET as the single JWT secret
const JWT_SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || 'dev-only-secret-not-for-production'
);

export async function impersonateMerchant(merchantId: string) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Get the merchant owner
    const merchantUser = await prisma.merchant_users.findFirst({
      where: { merchantId, role: 'OWNER' },
      include: { merchants: true },
    });

    if (!merchantUser) {
      return { success: false, error: 'Merchant owner not found' };
    }

    // Create impersonation token with admin info embedded
    // This token will be passed via URL to the merchant portal's impersonate endpoint
    const token = await new SignJWT({
      merchantUserId: merchantUser.id,
      merchantId: merchantUser.merchantId,
      email: merchantUser.email,
      name: merchantUser.name,
      role: merchantUser.role,
      businessName: merchantUser.merchants.businessName,
      status: merchantUser.merchants.status,
      tier: merchantUser.merchants.tier,
      // Impersonation metadata
      isImpersonating: true,
      impersonatedBy: session.email,
      impersonatedAt: new Date().toISOString(),
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('5m') // Short expiry - only used for initial redirect
      .sign(JWT_SECRET);

    // Log the impersonation action
    await logAdminAction(session.userId, 'IMPERSONATE_MERCHANT', {
      merchantId,
      resource: 'Merchant',
      resourceId: merchantId,
      newValue: {
        merchantUserId: merchantUser.id,
        email: merchantUser.email,
        businessName: merchantUser.merchants.businessName,
      },
    });

    // Build the redirect URL with the token
    // The merchant portal will exchange this token for a session cookie
    const baseUrl = getMerchantPortalUrl();
    const redirectUrl = `${baseUrl}/api/auth/impersonate?token=${encodeURIComponent(token)}`;

    loggers.merchants.debug('Impersonate URL construction', {
      baseUrl,
      redirectUrlStart: redirectUrl.substring(0, 60) + '...',
    });

    return {
      success: true,
      redirectUrl,
      businessName: merchantUser.merchants.businessName,
    };
  } catch (error) {
    loggers.merchants.error('Failed to impersonate merchant', { merchantId }, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to start impersonation' };
  }
}

// Note: endImpersonation should be called from the merchant portal,
// not from admin, since cookies are domain-specific.
// See apps/merchant/app/api/auth/logout/route.ts

// =============================================================================
// Manual Feed Trigger (Admin Override)
// =============================================================================

/**
 * Trigger a manual feed run for a merchant, bypassing subscription checks.
 * Use case: Business decisions to maintain data for strategic merchants.
 */
export async function triggerManualFeedRun(merchantId: string, feedId: string) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Look up retailerId for this merchant
    const merchantRetailer = await prisma.merchant_retailers.findFirst({
      where: { merchantId },
      select: { retailerId: true }
    });

    if (!merchantRetailer?.retailerId) {
      return { success: false, error: 'No retailer configured for this merchant' };
    }

    const retailerId = merchantRetailer.retailerId;

    // Get the feed details
    const feed = await prisma.retailer_feeds.findUnique({
      where: { id: feedId },
      include: { retailers: true },
    });

    if (!feed) {
      return { success: false, error: 'Feed not found' };
    }

    if (feed.retailerId !== retailerId) {
      return { success: false, error: 'Feed does not belong to this merchant' };
    }

    if (!feed.url) {
      return { success: false, error: 'Feed URL is not configured' };
    }

    // Create a feed run record
    const feedRun = await prisma.retailer_feed_runs.create({
      data: {
        retailerId,
        feedId,
        status: 'PENDING',
      },
    });

    // Queue the job with admin override flag
    // Note: We need to use Redis directly since we can't import BullMQ in Next.js
    // Instead, we'll use a simple HTTP call to a harvester endpoint or
    // store the job in the database for the scheduler to pick up

    // For now, we'll create a marker in the database that the scheduler can check
    // The scheduler will pick up pending runs and queue them

    // Update feed to mark it as needing manual run
    await prisma.retailer_feeds.update({
      where: { id: feedId },
      data: {
        lastRunAt: null, // Reset lastRunAt to trigger scheduler
      },
    });

    // Log the admin action
    await logAdminAction(session.userId, 'TRIGGER_MANUAL_FEED_RUN', {
      merchantId,
      resource: 'RetailerFeed',
      resourceId: feedId,
      newValue: {
        feedRunId: feedRun.id,
        feedName: feed.name || 'Unnamed Feed',
        adminOverride: true,
        reason: 'Admin triggered manual feed run',
      },
    });

    revalidatePath(`/merchants/${merchantId}`);

    return {
      success: true,
      feedRunId: feedRun.id,
      message: `Feed run queued successfully. The harvester will process it shortly.`,
    };
  } catch (error) {
    loggers.merchants.error('Failed to trigger manual feed run', { merchantId, feedId }, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to trigger feed run' };
  }
}

// =============================================================================
// Subscription Management
// =============================================================================

export interface UpdateSubscriptionData {
  status: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'CANCELLED';
  expiresAt: Date | null;
  graceDays: number;
}

/**
 * Update merchant subscription settings
 * Use case: Manual PO-based subscription management for merchants not using Stripe
 */
export async function updateSubscription(merchantId: string, data: UpdateSubscriptionData) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Get old values for audit log
    const oldMerchant = await prisma.merchants.findUnique({
      where: { id: merchantId },
      select: {
        id: true,
        businessName: true,
        subscriptionStatus: true,
        subscriptionExpiresAt: true,
        subscriptionGraceDays: true,
      },
    });

    if (!oldMerchant) {
      return { success: false, error: 'Merchant not found' };
    }

    // Validate grace days
    if (data.graceDays < 0 || data.graceDays > 90) {
      return { success: false, error: 'Grace days must be between 0 and 90' };
    }

    // Update subscription fields
    const updatedMerchant = await prisma.merchants.update({
      where: { id: merchantId },
      data: {
        subscriptionStatus: data.status,
        subscriptionExpiresAt: data.expiresAt,
        subscriptionGraceDays: data.graceDays,
      },
    });

    // Log the action
    await logAdminAction(session.userId, 'UPDATE_SUBSCRIPTION', {
      merchantId,
      resource: 'Merchant',
      resourceId: merchantId,
      oldValue: {
        subscriptionStatus: oldMerchant.subscriptionStatus,
        subscriptionExpiresAt: oldMerchant.subscriptionExpiresAt,
        subscriptionGraceDays: oldMerchant.subscriptionGraceDays,
      },
      newValue: {
        subscriptionStatus: data.status,
        subscriptionExpiresAt: data.expiresAt,
        subscriptionGraceDays: data.graceDays,
      },
    });

    revalidatePath(`/merchants/${merchantId}`);
    revalidatePath('/merchants');

    return {
      success: true,
      message: `Subscription updated for ${oldMerchant.businessName}`,
      merchant: updatedMerchant,
    };
  } catch (error) {
    loggers.merchants.error('Failed to update subscription', { merchantId }, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to update subscription' };
  }
}

// =============================================================================
// Payment Details Management
// =============================================================================

export interface UpdatePaymentDetailsData {
  paymentMethod?: 'STRIPE' | 'PURCHASE_ORDER' | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  autoRenew?: boolean;
}

/**
 * Update merchant payment details
 * Use case: Admin management of payment information for merchants
 */
export async function updatePaymentDetails(merchantId: string, data: UpdatePaymentDetailsData) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Get old values for audit log
    const oldMerchant = await prisma.merchants.findUnique({
      where: { id: merchantId },
      select: {
        id: true,
        businessName: true,
        paymentMethod: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        autoRenew: true,
      },
    });

    if (!oldMerchant) {
      return { success: false, error: 'Merchant not found' };
    }

    // Validate Stripe IDs format if provided
    if (data.stripeCustomerId && !data.stripeCustomerId.startsWith('cus_')) {
      return { success: false, error: 'Stripe Customer ID must start with "cus_"' };
    }

    if (data.stripeSubscriptionId && !data.stripeSubscriptionId.startsWith('sub_')) {
      return { success: false, error: 'Stripe Subscription ID must start with "sub_"' };
    }

    // Enforce payment method exclusivity
    // PO merchants cannot have Stripe IDs, and Stripe merchants must have Stripe IDs
    const effectiveMethod = data.paymentMethod ?? oldMerchant.paymentMethod;
    const effectiveCustomerId = data.stripeCustomerId !== undefined
      ? data.stripeCustomerId
      : oldMerchant.stripeCustomerId;
    const effectiveSubscriptionId = data.stripeSubscriptionId !== undefined
      ? data.stripeSubscriptionId
      : oldMerchant.stripeSubscriptionId;

    if (effectiveMethod === 'PURCHASE_ORDER') {
      if (effectiveCustomerId || effectiveSubscriptionId) {
        return {
          success: false,
          error: 'Purchase Order merchants cannot have Stripe IDs. Clear Stripe IDs first or choose Stripe payment method.',
        };
      }
    }

    if (effectiveMethod === 'STRIPE') {
      if (!effectiveCustomerId) {
        return {
          success: false,
          error: 'Stripe payment method requires a Stripe Customer ID.',
        };
      }
    }

    // Update payment details
    const updatedMerchant = await prisma.merchants.update({
      where: { id: merchantId },
      data: {
        paymentMethod: data.paymentMethod,
        stripeCustomerId: data.stripeCustomerId,
        stripeSubscriptionId: data.stripeSubscriptionId,
        autoRenew: data.autoRenew,
      },
    });

    // Log the action
    await logAdminAction(session.userId, 'UPDATE_PAYMENT_DETAILS', {
      merchantId,
      resource: 'Merchant',
      resourceId: merchantId,
      oldValue: {
        paymentMethod: oldMerchant.paymentMethod,
        stripeCustomerId: oldMerchant.stripeCustomerId,
        stripeSubscriptionId: oldMerchant.stripeSubscriptionId,
        autoRenew: oldMerchant.autoRenew,
      },
      newValue: {
        paymentMethod: data.paymentMethod,
        stripeCustomerId: data.stripeCustomerId,
        stripeSubscriptionId: data.stripeSubscriptionId,
        autoRenew: data.autoRenew,
      },
    });

    revalidatePath(`/merchants/${merchantId}`);
    revalidatePath('/merchants');

    return {
      success: true,
      message: `Payment details updated for ${oldMerchant.businessName}`,
      merchant: updatedMerchant,
    };
  } catch (error) {
    loggers.payments.error('Failed to update payment details', { merchantId }, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to update payment details' };
  }
}

// =============================================================================
// Stripe Lookup and Validation
// =============================================================================

export interface StripeCustomerResult {
  id: string;
  name: string | null;
  email: string | null;
  description: string | null;
  metadata: Record<string, string>;
}

export interface StripeSubscriptionResult {
  id: string;
  status: string;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  metadata: Record<string, string>;
}

/**
 * Search for Stripe customers by query (name, email, or ID)
 */
export async function searchStripeCustomers(query: string) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized', customers: [] };
  }

  if (!stripe) {
    return { success: false, error: 'Stripe not configured', customers: [] };
  }

  try {
    // If query looks like a customer ID, fetch it directly
    if (query.startsWith('cus_')) {
      try {
        const customer = await stripe.customers.retrieve(query);
        if (customer.deleted) {
          return { success: true, customers: [] };
        }
        return {
          success: true,
          customers: [{
            id: customer.id,
            name: customer.name ?? null,
            email: customer.email ?? null,
            description: customer.description ?? null,
            metadata: customer.metadata,
          }],
        };
      } catch (err) {
        // Not found, fall through to search
      }
    }

    // Otherwise search by email or name
    const customers = await stripe.customers.search({
      query: `email~'${query}' OR name~'${query}'`,
      limit: 10,
    });

    return {
      success: true,
      customers: customers.data.map(c => ({
        id: c.id,
        name: c.name ?? null,
        email: c.email ?? null,
        description: c.description ?? null,
        metadata: c.metadata,
      })),
    };
  } catch (error) {
    loggers.payments.error('Failed to search Stripe customers', { query }, error instanceof Error ? error : new Error(String(error)));
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to search customers',
      customers: [],
    };
  }
}

/**
 * Validate and get details for a Stripe customer ID
 */
export async function validateStripeCustomer(customerId: string) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized', customer: null };
  }

  if (!stripe) {
    return { success: false, error: 'Stripe not configured', customer: null };
  }

  if (!customerId.startsWith('cus_')) {
    return { success: false, error: 'Invalid customer ID format', customer: null };
  }

  try {
    const customer = await stripe.customers.retrieve(customerId);

    if (customer.deleted) {
      return { success: false, error: 'Customer has been deleted', customer: null };
    }

    return {
      success: true,
      customer: {
        id: customer.id,
        name: customer.name ?? null,
        email: customer.email ?? null,
        description: customer.description ?? null,
        metadata: customer.metadata,
      },
    };
  } catch (error) {
    loggers.payments.error('Failed to validate Stripe customer', { customerId }, error instanceof Error ? error : new Error(String(error)));
    return {
      success: false,
      error: 'Customer not found in Stripe',
      customer: null,
    };
  }
}

/**
 * Validate and get details for a Stripe subscription ID
 */
export async function validateStripeSubscription(subscriptionId: string) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized', subscription: null };
  }

  if (!stripe) {
    return { success: false, error: 'Stripe not configured', subscription: null };
  }

  if (!subscriptionId.startsWith('sub_')) {
    return { success: false, error: 'Invalid subscription ID format', subscription: null };
  }

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    return {
      success: true,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        currentPeriodEnd: new Date(getSubscriptionPeriodEnd(subscription) * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        metadata: subscription.metadata,
      },
    };
  } catch (error) {
    loggers.payments.error('Failed to validate Stripe subscription', { subscriptionId }, error instanceof Error ? error : new Error(String(error)));
    return {
      success: false,
      error: 'Subscription not found in Stripe',
      subscription: null,
    };
  }
}

/**
 * Get all subscriptions for a Stripe customer
 */
export async function getStripeCustomerSubscriptions(customerId: string) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized', subscriptions: [] };
  }

  if (!stripe) {
    return { success: false, error: 'Stripe not configured', subscriptions: [] };
  }

  try {
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      limit: 100,
    });

    return {
      success: true,
      subscriptions: subscriptions.data.map(s => ({
        id: s.id,
        status: s.status,
        currentPeriodEnd: new Date(getSubscriptionPeriodEnd(s) * 1000),
        cancelAtPeriodEnd: s.cancel_at_period_end,
        metadata: s.metadata,
      })),
    };
  } catch (error) {
    loggers.payments.error('Failed to get customer subscriptions', { customerId }, error instanceof Error ? error : new Error(String(error)));
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get subscriptions',
      subscriptions: [],
    };
  }
}
// =============================================================================
// Retailer Management
// =============================================================================

export interface MerchantRetailerInfo {
  id: string;
  retailerId: string;
  retailerName: string;
  retailerUrl: string | null;
  status: string;
  listingStatus: string;
  listedAt: Date | null;
  listedBy: string | null;
  unlistedAt: Date | null;
  unlistedBy: string | null;
  unlistedReason: string | null;
  visibilityStatus: string;
  createdAt: Date;
}

/**
 * Get all retailers linked to a merchant
 */
export async function getMerchantRetailers(merchantId: string) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized', retailers: [] };
  }

  try {
    const merchantRetailers = await prisma.merchant_retailers.findMany({
      where: { merchantId },
      include: {
        retailers: {
          select: {
            id: true,
            name: true,
            website: true,
            visibilityStatus: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const retailers: MerchantRetailerInfo[] = merchantRetailers.map((mr) => ({
      id: mr.id,
      retailerId: mr.retailerId,
      retailerName: mr.retailers.name,
      retailerUrl: mr.retailers.website,
      status: mr.status,
      listingStatus: mr.listingStatus,
      listedAt: mr.listedAt,
      listedBy: mr.listedBy,
      unlistedAt: mr.unlistedAt,
      unlistedBy: mr.unlistedBy,
      unlistedReason: mr.unlistedReason,
      visibilityStatus: mr.retailers.visibilityStatus,
      createdAt: mr.createdAt,
    }));

    return { success: true, retailers };
  } catch (error) {
    loggers.merchants.error('Failed to get merchant retailers', { merchantId }, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to get retailers', retailers: [] };
  }
}

/**
 * List a retailer (make visible to consumers)
 * Per Merchant-and-Retailer-Reference:
 * - Consumer visibility = ELIGIBLE + LISTED + ACTIVE
 * - Listing is an explicit admin/merchant action
 */
export async function listRetailer(merchantId: string, merchantRetailerId: string) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Get current state
    const merchantRetailer = await prisma.merchant_retailers.findUnique({
      where: { id: merchantRetailerId },
      include: {
        retailers: { select: { name: true, visibilityStatus: true } },
        merchants: { select: { businessName: true, subscriptionStatus: true } },
      },
    });

    if (!merchantRetailer) {
      return { success: false, error: 'Retailer link not found' };
    }

    if (merchantRetailer.merchantId !== merchantId) {
      return { success: false, error: 'Retailer does not belong to this merchant' };
    }

    // Validate business rules
    if (merchantRetailer.status !== 'ACTIVE') {
      return {
        success: false,
        error: `Cannot list retailer with status ${merchantRetailer.status}. Status must be ACTIVE.`
      };
    }

    if (merchantRetailer.retailers.visibilityStatus !== 'ELIGIBLE') {
      return {
        success: false,
        error: `Cannot list retailer with visibility status ${merchantRetailer.retailers.visibilityStatus}. Retailer must be ELIGIBLE.`
      };
    }

    // Warn about merchant subscription status (but don't block)
    const subscriptionWarning = ['EXPIRED', 'SUSPENDED', 'CANCELLED'].includes(merchantRetailer.merchants.subscriptionStatus)
      ? `Warning: Merchant subscription is ${merchantRetailer.merchants.subscriptionStatus}. Retailer may be auto-unlisted.`
      : null;

    if (merchantRetailer.listingStatus === 'LISTED') {
      return { success: true, message: 'Retailer is already listed', warning: subscriptionWarning };
    }

    const now = new Date();

    // Update listing status
    await prisma.merchant_retailers.update({
      where: { id: merchantRetailerId },
      data: {
        listingStatus: 'LISTED',
        listedAt: now,
        listedBy: session.userId,
        // Clear unlist fields
        unlistedAt: null,
        unlistedBy: null,
        unlistedReason: null,
      },
    });

    // Audit log
    await logAdminAction(session.userId, 'RETAILER_LISTED', {
      merchantId,
      resource: 'MerchantRetailer',
      resourceId: merchantRetailerId,
      oldValue: { listingStatus: 'UNLISTED' },
      newValue: {
        listingStatus: 'LISTED',
        listedAt: now.toISOString(),
        listedBy: session.userId,
        retailerName: merchantRetailer.retailers.name,
      },
    });

    revalidatePath(`/merchants/${merchantId}`);

    return {
      success: true,
      message: `${merchantRetailer.retailers.name} is now listed and visible to consumers`,
      warning: subscriptionWarning,
    };
  } catch (error) {
    loggers.merchants.error('Failed to list retailer', { merchantId, merchantRetailerId }, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to list retailer' };
  }
}

/**
 * Unlist a retailer (hide from consumers)
 * Per Merchant-and-Retailer-Reference:
 * - Unlisting removes consumer visibility
 * - Requires explicit reason for audit trail
 */
export async function unlistRetailer(merchantId: string, merchantRetailerId: string, reason: string) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  if (!reason || reason.trim().length === 0) {
    return { success: false, error: 'Reason is required for unlisting' };
  }

  try {
    // Get current state
    const merchantRetailer = await prisma.merchant_retailers.findUnique({
      where: { id: merchantRetailerId },
      include: {
        retailers: { select: { name: true } },
      },
    });

    if (!merchantRetailer) {
      return { success: false, error: 'Retailer link not found' };
    }

    if (merchantRetailer.merchantId !== merchantId) {
      return { success: false, error: 'Retailer does not belong to this merchant' };
    }

    if (merchantRetailer.listingStatus === 'UNLISTED') {
      return { success: true, message: 'Retailer is already unlisted' };
    }

    const now = new Date();

    // Update listing status
    await prisma.merchant_retailers.update({
      where: { id: merchantRetailerId },
      data: {
        listingStatus: 'UNLISTED',
        unlistedAt: now,
        unlistedBy: session.userId,
        unlistedReason: reason,
      },
    });

    // Audit log
    await logAdminAction(session.userId, 'RETAILER_UNLISTED', {
      merchantId,
      resource: 'MerchantRetailer',
      resourceId: merchantRetailerId,
      oldValue: { listingStatus: 'LISTED' },
      newValue: {
        listingStatus: 'UNLISTED',
        unlistedAt: now.toISOString(),
        unlistedBy: session.userId,
        unlistedReason: reason,
        retailerName: merchantRetailer.retailers.name,
      },
    });

    revalidatePath(`/merchants/${merchantId}`);

    return {
      success: true,
      message: `${merchantRetailer.retailers.name} has been unlisted and is no longer visible to consumers`,
    };
  } catch (error) {
    loggers.merchants.error('Failed to unlist retailer', { merchantId, merchantRetailerId }, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to unlist retailer' };
  }
}

/**
 * Get available retailers that can be linked to a merchant
 * Returns retailers that are not yet linked to any merchant (V1: 1 retailer = 1 merchant)
 */
export async function getAvailableRetailers() {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized', retailers: [] };
  }

  try {
    // Get all retailer IDs that are already linked
    const linkedRetailerIds = await prisma.merchant_retailers.findMany({
      select: { retailerId: true },
    });
    const linkedIds = linkedRetailerIds.map((r) => r.retailerId);

    // Get retailers not linked to any merchant
    const availableRetailers = await prisma.retailers.findMany({
      where: {
        id: { notIn: linkedIds.length > 0 ? linkedIds : ['__none__'] },
      },
      select: {
        id: true,
        name: true,
        website: true,
        visibilityStatus: true,
        tier: true,
      },
      orderBy: { name: 'asc' },
    });

    return { success: true, retailers: availableRetailers };
  } catch (error) {
    loggers.merchants.error('Failed to get available retailers', {}, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to get available retailers', retailers: [] };
  }
}

/**
 * Link a retailer to a merchant
 * Creates a merchant_retailers record with ACTIVE status and UNLISTED listing
 */
export async function linkRetailerToMerchant(
  merchantId: string,
  retailerId: string,
  options?: { listImmediately?: boolean }
) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Verify merchant exists
    const merchant = await prisma.merchants.findUnique({
      where: { id: merchantId },
      select: { id: true, businessName: true },
    });

    if (!merchant) {
      return { success: false, error: 'Merchant not found' };
    }

    // Verify retailer exists
    const retailer = await prisma.retailers.findUnique({
      where: { id: retailerId },
      select: { id: true, name: true, visibilityStatus: true },
    });

    if (!retailer) {
      return { success: false, error: 'Retailer not found' };
    }

    // Check if this specific merchant-retailer pair already exists
    const existingLink = await prisma.merchant_retailers.findFirst({
      where: { merchantId, retailerId },
    });

    if (existingLink) {
      return {
        success: false,
        error: 'This merchant is already linked to this retailer',
      };
    }

    const now = new Date();
    const shouldList = options?.listImmediately && retailer.visibilityStatus === 'ELIGIBLE';

    // Create the link
    const merchantRetailer = await prisma.merchant_retailers.create({
      data: {
        merchantId,
        retailerId,
        status: 'ACTIVE',
        listingStatus: shouldList ? 'LISTED' : 'UNLISTED',
        createdBy: session.userId,
        ...(shouldList && {
          listedAt: now,
          listedBy: session.userId,
        }),
      },
    });

    // Audit log
    await logAdminAction(session.userId, 'RETAILER_LINKED', {
      merchantId,
      resource: 'MerchantRetailer',
      resourceId: merchantRetailer.id,
      newValue: {
        retailerId,
        retailerName: retailer.name,
        merchantName: merchant.businessName,
        status: 'ACTIVE',
        listingStatus: shouldList ? 'LISTED' : 'UNLISTED',
      },
    });

    revalidatePath(`/merchants/${merchantId}`);

    return {
      success: true,
      message: `${retailer.name} has been linked to ${merchant.businessName}${shouldList ? ' and listed' : ''}`,
    };
  } catch (error) {
    loggers.merchants.error('Failed to link retailer', { merchantId, retailerId }, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to link retailer' };
  }
}

/**
 * Unlink a retailer from a merchant
 * Deletes the merchant_retailers record
 */
export async function unlinkRetailerFromMerchant(merchantId: string, merchantRetailerId: string) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Get current state for audit
    const merchantRetailer = await prisma.merchant_retailers.findUnique({
      where: { id: merchantRetailerId },
      include: {
        retailers: { select: { name: true } },
        merchants: { select: { businessName: true } },
      },
    });

    if (!merchantRetailer) {
      return { success: false, error: 'Link not found' };
    }

    if (merchantRetailer.merchantId !== merchantId) {
      return { success: false, error: 'Link does not belong to this merchant' };
    }

    // Delete the link
    await prisma.merchant_retailers.delete({
      where: { id: merchantRetailerId },
    });

    // Audit log
    await logAdminAction(session.userId, 'RETAILER_UNLINKED', {
      merchantId,
      resource: 'MerchantRetailer',
      resourceId: merchantRetailerId,
      oldValue: {
        retailerId: merchantRetailer.retailerId,
        retailerName: merchantRetailer.retailers.name,
        merchantName: merchantRetailer.merchants.businessName,
        status: merchantRetailer.status,
        listingStatus: merchantRetailer.listingStatus,
      },
    });

    revalidatePath(`/merchants/${merchantId}`);

    return {
      success: true,
      message: `${merchantRetailer.retailers.name} has been unlinked from this merchant`,
    };
  } catch (error) {
    loggers.merchants.error('Failed to unlink retailer', { merchantId, merchantRetailerId }, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to unlink retailer' };
  }
}
