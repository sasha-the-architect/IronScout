'use server';

import { prisma } from '@ironscout/db';
import { revalidatePath } from 'next/cache';
import { getAdminSession, logAdminAction } from '@/lib/auth';
import { SignJWT } from 'jose';
import Stripe from 'stripe';

// Initialize Stripe
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-08-16' })
  : null;

/**
 * Get the dealer portal base URL with trailing slashes removed
 */
function getDealerPortalUrl(): string {
  const rawUrl = process.env.DEALER_PORTAL_URL || 'https://dealer.ironscout.ai';
  return rawUrl.replace(/\/+$/, '');
}

export interface UpdateDealerData {
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

export async function updateDealer(dealerId: string, data: UpdateDealerData) {
  const session = await getAdminSession();
  
  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Get old values for audit log
    const oldDealer = await prisma.dealer.findUnique({
      where: { id: dealerId },
      include: {
        users: {
          where: { role: 'OWNER' },
          take: 1,
        },
      },
    });

    if (!oldDealer) {
      return { success: false, error: 'Dealer not found' };
    }

    const ownerUser = oldDealer.users[0];

    // If email is being changed, check if it's already in use
    if (data.ownerEmail && ownerUser && data.ownerEmail !== ownerUser.email) {
      const existingUser = await prisma.dealerUser.findFirst({
        where: { email: data.ownerEmail },
      });

      if (existingUser) {
        return { success: false, error: 'This email is already in use by another dealer account' };
      }
    }

    // Update dealer (excluding ownerEmail which is on DealerUser)
    const { ownerEmail, ...dealerData } = data;
    
    const updatedDealer = await prisma.dealer.update({
      where: { id: dealerId },
      data: {
        businessName: dealerData.businessName,
        contactFirstName: dealerData.contactFirstName,
        contactLastName: dealerData.contactLastName,
        phone: dealerData.phone,
        websiteUrl: dealerData.websiteUrl,
        tier: dealerData.tier,
        storeType: dealerData.storeType,
        status: dealerData.status,
      },
    });

    // Update owner user email if changed
    let emailChanged = false;
    if (ownerEmail && ownerUser && ownerEmail !== ownerUser.email) {
      await prisma.dealerUser.update({
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
    await logAdminAction(session.userId, 'UPDATE_DEALER', {
      dealerId,
      resource: 'Dealer',
      resourceId: dealerId,
      oldValue: {
        ...oldDealer,
        ownerEmail: ownerUser?.email,
      },
      newValue: {
        ...data,
        emailChanged,
      },
    });

    revalidatePath(`/dealers/${dealerId}`);
    revalidatePath('/dealers');

    return { 
      success: true, 
      dealer: updatedDealer,
      emailChanged,
    };
  } catch (error) {
    console.error('Failed to update dealer:', error);
    return { success: false, error: 'Failed to update dealer' };
  }
}

// =============================================================================
// Dealer Contact CRUD Operations
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

export async function createDealerContact(dealerId: string, data: ContactData) {
  const session = await getAdminSession();
  
  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Check if email already exists for this dealer
    const existingContact = await prisma.dealerContact.findUnique({
      where: {
        dealerId_email: {
          dealerId,
          email: data.email,
        },
      },
    });

    if (existingContact) {
      return { success: false, error: 'A contact with this email already exists for this dealer' };
    }

    const contact = await prisma.dealerContact.create({
      data: {
        dealerId,
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

    await logAdminAction(session.userId, 'CREATE_DEALER_CONTACT', {
      dealerId,
      resource: 'DealerContact',
      resourceId: contact.id,
      newValue: data,
    });

    revalidatePath(`/dealers/${dealerId}`);

    return { success: true, contact };
  } catch (error) {
    console.error('Failed to create dealer contact:', error);
    return { success: false, error: 'Failed to create contact' };
  }
}

export async function updateDealerContact(contactId: string, dealerId: string, data: Partial<ContactData>) {
  const session = await getAdminSession();
  
  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const oldContact = await prisma.dealerContact.findUnique({
      where: { id: contactId },
    });

    if (!oldContact) {
      return { success: false, error: 'Contact not found' };
    }

    // Check for email uniqueness if email is being changed
    if (data.email && data.email !== oldContact.email) {
      const existingContact = await prisma.dealerContact.findUnique({
        where: {
          dealerId_email: {
            dealerId,
            email: data.email,
          },
        },
      });

      if (existingContact) {
        return { success: false, error: 'A contact with this email already exists for this dealer' };
      }
    }

    const contact = await prisma.dealerContact.update({
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

    await logAdminAction(session.userId, 'UPDATE_DEALER_CONTACT', {
      dealerId,
      resource: 'DealerContact',
      resourceId: contactId,
      oldValue: oldContact,
      newValue: data,
    });

    revalidatePath(`/dealers/${dealerId}`);

    return { success: true, contact };
  } catch (error) {
    console.error('Failed to update dealer contact:', error);
    return { success: false, error: 'Failed to update contact' };
  }
}

export async function deleteDealerContact(contactId: string, dealerId: string) {
  const session = await getAdminSession();
  
  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const contact = await prisma.dealerContact.findUnique({
      where: { id: contactId },
    });

    if (!contact) {
      return { success: false, error: 'Contact not found' };
    }

    // Prevent deleting the account owner contact
    if (contact.isAccountOwner) {
      return { success: false, error: 'Cannot delete the account owner contact. Please transfer ownership first.' };
    }

    await prisma.dealerContact.delete({
      where: { id: contactId },
    });

    await logAdminAction(session.userId, 'DELETE_DEALER_CONTACT', {
      dealerId,
      resource: 'DealerContact',
      resourceId: contactId,
      oldValue: contact,
    });

    revalidatePath(`/dealers/${dealerId}`);

    return { success: true };
  } catch (error) {
    console.error('Failed to delete dealer contact:', error);
    return { success: false, error: 'Failed to delete contact' };
  }
}

// =============================================================================
// Account Ownership Transfer
// =============================================================================

/**
 * Transfer account ownership from one contact to another
 * Admin-facing action for dealer management
 */
export async function transferAccountOwnership(dealerId: string, newOwnerId: string) {
  const session = await getAdminSession();
  
  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Verify both contacts exist and belong to the dealer
    const [currentOwner, newOwner] = await Promise.all([
      prisma.dealerContact.findFirst({
        where: { dealerId, isAccountOwner: true },
      }),
      prisma.dealerContact.findFirst({
        where: { id: newOwnerId, dealerId },
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
      prisma.dealerContact.update({
        where: { id: currentOwner.id },
        data: { isAccountOwner: false },
      }),
      prisma.dealerContact.update({
        where: { id: newOwnerId },
        data: { isAccountOwner: true },
      }),
    ]);

    // Log the action
    await logAdminAction(session.userId, 'TRANSFER_ACCOUNT_OWNERSHIP', {
      dealerId,
      resource: 'DealerContact',
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

    revalidatePath(`/dealers/${dealerId}`);

    return {
      success: true,
      message: `Account ownership transferred from ${currentOwner.email} to ${newOwner.email}`,
      oldOwner: oldOwnerAfter,
      newOwner: newOwnerAfter,
    };
  } catch (error) {
    console.error('Failed to transfer account ownership:', error);
    return { success: false, error: 'Failed to transfer account ownership' };
  }
}

/**
 * Set a contact as the account owner (used when there's no current owner or admin override)
 * Admin-facing action for dealer management
 */
export async function setAccountOwner(dealerId: string, contactId: string) {
  const session = await getAdminSession();
  
  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Verify the contact exists and belongs to the dealer
    const contact = await prisma.dealerContact.findFirst({
      where: { id: contactId, dealerId },
    });

    if (!contact) {
      return { success: false, error: 'Contact not found' };
    }

    // Get current owner (if any)
    const currentOwner = await prisma.dealerContact.findFirst({
      where: { dealerId, isAccountOwner: true },
    });

    // Unset current owner if exists
    if (currentOwner) {
      await prisma.dealerContact.update({
        where: { id: currentOwner.id },
        data: { isAccountOwner: false },
      });
    }

    // Set new owner
    const newOwner = await prisma.dealerContact.update({
      where: { id: contactId },
      data: { isAccountOwner: true },
    });

    // Log the action
    await logAdminAction(session.userId, 'SET_ACCOUNT_OWNER', {
      dealerId,
      resource: 'DealerContact',
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

    revalidatePath(`/dealers/${dealerId}`);

    return {
      success: true,
      message: `${contact.firstName} ${contact.lastName} is now the account owner`,
      newOwner,
    };
  } catch (error) {
    console.error('Failed to set account owner:', error);
    return { success: false, error: 'Failed to set account owner' };
  }
}

// =============================================================================
// Resend Verification Email
// =============================================================================

export async function resendVerificationEmail(dealerId: string) {
  const session = await getAdminSession();
  
  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Get the dealer owner
    const dealerUser = await prisma.dealerUser.findFirst({
      where: { dealerId, role: 'OWNER' },
      include: { dealer: true },
    });

    if (!dealerUser) {
      return { success: false, error: 'Dealer owner not found' };
    }

    if (dealerUser.emailVerified) {
      return { success: false, error: 'Email is already verified' };
    }

    // Generate new verification token
    const verifyToken = crypto.randomUUID();

    // Update user with new token
    await prisma.dealerUser.update({
      where: { id: dealerUser.id },
      data: { verifyToken },
    });

    // Send verification email
    const baseUrl = getDealerPortalUrl();
    const verifyUrl = `${baseUrl}/verify-email?token=${verifyToken}`;

    // Use Resend to send the email
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      console.error('RESEND_API_KEY not configured');
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
        to: dealerUser.email,
        subject: 'Verify Your IronScout Dealer Account',
        html: `
          <h1>Verify Your Email Address</h1>
          <p>Hi ${dealerUser.name},</p>
          <p>An admin has requested that we resend your verification email for ${dealerUser.dealer.businessName}.</p>
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
      console.error('Failed to send verification email:', errorData);
      return { success: false, error: 'Failed to send email' };
    }

    await logAdminAction(session.userId, 'RESEND_VERIFICATION_EMAIL', {
      dealerId,
      resource: 'DealerUser',
      resourceId: dealerUser.id,
      newValue: { email: dealerUser.email },
    });

    return { success: true, email: dealerUser.email };
  } catch (error) {
    console.error('Failed to resend verification email:', error);
    return { success: false, error: 'Failed to resend verification email' };
  }
}

// =============================================================================
// Admin Impersonation
// =============================================================================

const DEALER_JWT_SECRET = new TextEncoder().encode(
  process.env.DEALER_JWT_SECRET || process.env.NEXTAUTH_SECRET || 'dealer-secret-change-me'
);

export async function impersonateDealer(dealerId: string) {
  const session = await getAdminSession();
  
  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Get the dealer owner
    const dealerUser = await prisma.dealerUser.findFirst({
      where: { dealerId, role: 'OWNER' },
      include: { dealer: true },
    });

    if (!dealerUser) {
      return { success: false, error: 'Dealer owner not found' };
    }

    // Create impersonation token with admin info embedded
    // This token will be passed via URL to the dealer portal's impersonate endpoint
    const token = await new SignJWT({
      dealerUserId: dealerUser.id,
      dealerId: dealerUser.dealerId,
      email: dealerUser.email,
      name: dealerUser.name,
      role: dealerUser.role,
      businessName: dealerUser.dealer.businessName,
      status: dealerUser.dealer.status,
      tier: dealerUser.dealer.tier,
      // Impersonation metadata
      isImpersonating: true,
      impersonatedBy: session.email,
      impersonatedAt: new Date().toISOString(),
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('5m') // Short expiry - only used for initial redirect
      .sign(DEALER_JWT_SECRET);

    // Log the impersonation action
    await logAdminAction(session.userId, 'IMPERSONATE_DEALER', {
      dealerId,
      resource: 'Dealer',
      resourceId: dealerId,
      newValue: {
        dealerUserId: dealerUser.id,
        email: dealerUser.email,
        businessName: dealerUser.dealer.businessName,
      },
    });

    // Build the redirect URL with the token
    // The dealer portal will exchange this token for a session cookie
    const baseUrl = getDealerPortalUrl();
    const redirectUrl = `${baseUrl}/api/auth/impersonate?token=${encodeURIComponent(token)}`;
    
    console.log('[Impersonate] URL construction:', {
      baseUrl,
      redirectUrlStart: redirectUrl.substring(0, 60) + '...',
    });

    return { 
      success: true, 
      redirectUrl,
      businessName: dealerUser.dealer.businessName,
    };
  } catch (error) {
    console.error('Failed to impersonate dealer:', error);
    return { success: false, error: 'Failed to start impersonation' };
  }
}

// Note: endImpersonation should be called from the dealer portal,
// not from admin, since cookies are domain-specific.
// See apps/dealer/app/api/auth/logout/route.ts

// =============================================================================
// Manual Feed Trigger (Admin Override)
// =============================================================================

/**
 * Trigger a manual feed run for a dealer, bypassing subscription checks.
 * Use case: Business decisions to maintain data for strategic dealers.
 */
export async function triggerManualFeedRun(dealerId: string, feedId: string) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Get the feed details
    const feed = await prisma.dealerFeed.findUnique({
      where: { id: feedId },
      include: { dealer: true },
    });

    if (!feed) {
      return { success: false, error: 'Feed not found' };
    }

    if (feed.dealerId !== dealerId) {
      return { success: false, error: 'Feed does not belong to this dealer' };
    }

    if (!feed.url) {
      return { success: false, error: 'Feed URL is not configured' };
    }

    // Create a feed run record
    const feedRun = await prisma.dealerFeedRun.create({
      data: {
        dealerId,
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
    await prisma.dealerFeed.update({
      where: { id: feedId },
      data: {
        lastRunAt: null, // Reset lastRunAt to trigger scheduler
      },
    });

    // Log the admin action
    await logAdminAction(session.userId, 'TRIGGER_MANUAL_FEED_RUN', {
      dealerId,
      resource: 'DealerFeed',
      resourceId: feedId,
      newValue: {
        feedRunId: feedRun.id,
        feedName: feed.name || 'Unnamed Feed',
        adminOverride: true,
        reason: 'Admin triggered manual feed run',
      },
    });

    revalidatePath(`/dealers/${dealerId}`);

    return {
      success: true,
      feedRunId: feedRun.id,
      message: `Feed run queued successfully. The harvester will process it shortly.`,
    };
  } catch (error) {
    console.error('Failed to trigger manual feed run:', error);
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
 * Update dealer subscription settings
 * Use case: Manual PO-based subscription management for dealers not using Stripe
 */
export async function updateSubscription(dealerId: string, data: UpdateSubscriptionData) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Get old values for audit log
    const oldDealer = await prisma.dealer.findUnique({
      where: { id: dealerId },
      select: {
        id: true,
        businessName: true,
        subscriptionStatus: true,
        subscriptionExpiresAt: true,
        subscriptionGraceDays: true,
      },
    });

    if (!oldDealer) {
      return { success: false, error: 'Dealer not found' };
    }

    // Validate grace days
    if (data.graceDays < 0 || data.graceDays > 90) {
      return { success: false, error: 'Grace days must be between 0 and 90' };
    }

    // Update subscription fields
    const updatedDealer = await prisma.dealer.update({
      where: { id: dealerId },
      data: {
        subscriptionStatus: data.status,
        subscriptionExpiresAt: data.expiresAt,
        subscriptionGraceDays: data.graceDays,
      },
    });

    // Log the action
    await logAdminAction(session.userId, 'UPDATE_SUBSCRIPTION', {
      dealerId,
      resource: 'Dealer',
      resourceId: dealerId,
      oldValue: {
        subscriptionStatus: oldDealer.subscriptionStatus,
        subscriptionExpiresAt: oldDealer.subscriptionExpiresAt,
        subscriptionGraceDays: oldDealer.subscriptionGraceDays,
      },
      newValue: {
        subscriptionStatus: data.status,
        subscriptionExpiresAt: data.expiresAt,
        subscriptionGraceDays: data.graceDays,
      },
    });

    revalidatePath(`/dealers/${dealerId}`);
    revalidatePath('/dealers');

    return {
      success: true,
      message: `Subscription updated for ${oldDealer.businessName}`,
      dealer: updatedDealer,
    };
  } catch (error) {
    console.error('Failed to update subscription:', error);
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
 * Update dealer payment details
 * Use case: Admin management of payment information for dealers
 */
export async function updatePaymentDetails(dealerId: string, data: UpdatePaymentDetailsData) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Get old values for audit log
    const oldDealer = await prisma.dealer.findUnique({
      where: { id: dealerId },
      select: {
        id: true,
        businessName: true,
        paymentMethod: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        autoRenew: true,
      },
    });

    if (!oldDealer) {
      return { success: false, error: 'Dealer not found' };
    }

    // Validate Stripe IDs format if provided
    if (data.stripeCustomerId && !data.stripeCustomerId.startsWith('cus_')) {
      return { success: false, error: 'Stripe Customer ID must start with "cus_"' };
    }

    if (data.stripeSubscriptionId && !data.stripeSubscriptionId.startsWith('sub_')) {
      return { success: false, error: 'Stripe Subscription ID must start with "sub_"' };
    }

    // Update payment details
    const updatedDealer = await prisma.dealer.update({
      where: { id: dealerId },
      data: {
        paymentMethod: data.paymentMethod,
        stripeCustomerId: data.stripeCustomerId,
        stripeSubscriptionId: data.stripeSubscriptionId,
        autoRenew: data.autoRenew,
      },
    });

    // Log the action
    await logAdminAction(session.userId, 'UPDATE_PAYMENT_DETAILS', {
      dealerId,
      resource: 'Dealer',
      resourceId: dealerId,
      oldValue: {
        paymentMethod: oldDealer.paymentMethod,
        stripeCustomerId: oldDealer.stripeCustomerId,
        stripeSubscriptionId: oldDealer.stripeSubscriptionId,
        autoRenew: oldDealer.autoRenew,
      },
      newValue: {
        paymentMethod: data.paymentMethod,
        stripeCustomerId: data.stripeCustomerId,
        stripeSubscriptionId: data.stripeSubscriptionId,
        autoRenew: data.autoRenew,
      },
    });

    revalidatePath(`/dealers/${dealerId}`);
    revalidatePath('/dealers');

    return {
      success: true,
      message: `Payment details updated for ${oldDealer.businessName}`,
      dealer: updatedDealer,
    };
  } catch (error) {
    console.error('Failed to update payment details:', error);
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
            name: customer.name,
            email: customer.email,
            description: customer.description,
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
        name: c.name,
        email: c.email,
        description: c.description,
        metadata: c.metadata,
      })),
    };
  } catch (error) {
    console.error('Failed to search Stripe customers:', error);
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
        name: customer.name,
        email: customer.email,
        description: customer.description,
        metadata: customer.metadata,
      },
    };
  } catch (error) {
    console.error('Failed to validate Stripe customer:', error);
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
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        metadata: subscription.metadata,
      },
    };
  } catch (error) {
    console.error('Failed to validate Stripe subscription:', error);
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
        currentPeriodEnd: new Date(s.current_period_end * 1000),
        cancelAtPeriodEnd: s.cancel_at_period_end,
        metadata: s.metadata,
      })),
    };
  } catch (error) {
    console.error('Failed to get customer subscriptions:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get subscriptions',
      subscriptions: [],
    };
  }
}

// =============================================================================
// Feed Management
// =============================================================================

/**
 * Get feeds for a dealer with their status
 */
export async function getDealerFeeds(dealerId: string) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized', feeds: [] };
  }

  try {
    const feeds = await prisma.dealerFeed.findMany({
      where: { dealerId },
      include: {
        runs: {
          orderBy: { startedAt: 'desc' },
          take: 5,
        },
        _count: {
          select: { skus: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      feeds: feeds.map(feed => ({
        id: feed.id,
        name: feed.name || 'Unnamed Feed',
        accessType: feed.accessType,
        formatType: feed.formatType,
        url: feed.url,
        enabled: feed.enabled,
        status: feed.status,
        lastRunAt: feed.lastRunAt,
        lastSuccessAt: feed.lastSuccessAt,
        lastFailureAt: feed.lastFailureAt,
        lastError: feed.lastError,
        skuCount: feed._count.skus,
        recentRuns: feed.runs.map(run => ({
          id: run.id,
          status: run.status,
          startedAt: run.startedAt,
          completedAt: run.completedAt,
          rowCount: run.rowCount,
          indexedCount: run.indexedCount,
          quarantinedCount: run.quarantinedCount,
          rejectedCount: run.rejectedCount,
          primaryErrorCode: run.primaryErrorCode,
        })),
      })),
    };
  } catch (error) {
    console.error('Failed to get dealer feeds:', error);
    return { success: false, error: 'Failed to get feeds', feeds: [] };
  }
}
