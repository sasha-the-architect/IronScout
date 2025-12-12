'use server';

import { prisma } from '@ironscout/db';
import { revalidatePath } from 'next/cache';
import { getAdminSession, logAdminAction } from '@/lib/auth';
import { SignJWT } from 'jose';

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
  role?: 'PRIMARY' | 'BILLING' | 'TECHNICAL' | 'MARKETING' | 'OTHER';
  marketingOptIn?: boolean;
  communicationOptIn?: boolean;
  isAccountOwner?: boolean;
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

    // If this is being set as account owner, unset other account owners
    if (data.isAccountOwner) {
      await prisma.dealerContact.updateMany({
        where: { dealerId, isAccountOwner: true },
        data: { isAccountOwner: false },
      });
    }

    const contact = await prisma.dealerContact.create({
      data: {
        dealerId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone || null,
        role: data.role || 'PRIMARY',
        marketingOptIn: data.marketingOptIn ?? false,
        communicationOptIn: data.communicationOptIn ?? true,
        isAccountOwner: data.isAccountOwner ?? false,
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

    // If this is being set as account owner, unset other account owners
    if (data.isAccountOwner && !oldContact.isAccountOwner) {
      await prisma.dealerContact.updateMany({
        where: { dealerId, isAccountOwner: true },
        data: { isAccountOwner: false },
      });
    }

    const contact = await prisma.dealerContact.update({
      where: { id: contactId },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        role: data.role,
        marketingOptIn: data.marketingOptIn,
        communicationOptIn: data.communicationOptIn,
        isAccountOwner: data.isAccountOwner,
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
