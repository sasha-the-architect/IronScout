'use server';

import { prisma } from '@ironscout/db';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import { loggers } from '@/lib/logger';

export interface ContactData {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  roles?: ('PRIMARY' | 'BILLING' | 'TECHNICAL' | 'MARKETING')[];
  marketingOptIn?: boolean;
  communicationOptIn?: boolean;
}

export async function createContact(data: ContactData) {
  const session = await getSession();
  
  if (!session || session.type !== 'dealer') {
    return { success: false, error: 'Unauthorized' };
  }

  // Only OWNER and ADMIN can manage contacts
  if (session.role !== 'OWNER' && session.role !== 'ADMIN') {
    return { success: false, error: 'You do not have permission to manage contacts' };
  }

  try {
    // Check if email already exists for this dealer
    const existingContact = await prisma.dealerContact.findUnique({
      where: {
        dealerId_email: {
          dealerId: session.dealerId,
          email: data.email.toLowerCase(),
        },
      },
    });

    if (existingContact) {
      return { success: false, error: 'A contact with this email already exists' };
    }

    const contact = await prisma.dealerContact.create({
      data: {
        dealerId: session.dealerId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email.toLowerCase(),
        phone: data.phone || null,
        roles: data.roles || [],
        marketingOptIn: data.marketingOptIn ?? false,
        communicationOptIn: data.communicationOptIn ?? true,
        isAccountOwner: false,
      },
    });

    revalidatePath('/settings/contacts');

    return { success: true, contact };
  } catch (error) {
    loggers.settings.error('Failed to create contact', {}, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to create contact' };
  }
}

export async function updateContact(contactId: string, data: Partial<ContactData>) {
  const session = await getSession();
  
  if (!session || session.type !== 'dealer') {
    return { success: false, error: 'Unauthorized' };
  }

  // Only OWNER and ADMIN can manage contacts
  if (session.role !== 'OWNER' && session.role !== 'ADMIN') {
    return { success: false, error: 'You do not have permission to manage contacts' };
  }

  try {
    // Verify the contact belongs to this dealer
    const existingContact = await prisma.dealerContact.findFirst({
      where: { id: contactId, dealerId: session.dealerId },
    });

    if (!existingContact) {
      return { success: false, error: 'Contact not found' };
    }

    // Check for email uniqueness if email is being changed
    if (data.email && data.email.toLowerCase() !== existingContact.email) {
      const duplicateEmail = await prisma.dealerContact.findUnique({
        where: {
          dealerId_email: {
            dealerId: session.dealerId,
            email: data.email.toLowerCase(),
          },
        },
      });

      if (duplicateEmail) {
        return { success: false, error: 'A contact with this email already exists' };
      }
    }

    const contact = await prisma.dealerContact.update({
      where: { id: contactId },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email?.toLowerCase(),
        phone: data.phone,
        roles: data.roles,
        marketingOptIn: data.marketingOptIn,
        communicationOptIn: data.communicationOptIn,
      },
    });

    revalidatePath('/settings/contacts');

    return { success: true, contact };
  } catch (error) {
    loggers.settings.error('Failed to update contact', {}, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to update contact' };
  }
}

export async function deleteContact(contactId: string) {
  const session = await getSession();
  
  if (!session || session.type !== 'dealer') {
    return { success: false, error: 'Unauthorized' };
  }

  // Only OWNER and ADMIN can manage contacts
  if (session.role !== 'OWNER' && session.role !== 'ADMIN') {
    return { success: false, error: 'You do not have permission to manage contacts' };
  }

  try {
    // Verify the contact belongs to this dealer
    const contact = await prisma.dealerContact.findFirst({
      where: { id: contactId, dealerId: session.dealerId },
    });

    if (!contact) {
      return { success: false, error: 'Contact not found' };
    }

    // Prevent deleting the account owner contact
    if (contact.isAccountOwner) {
      return { success: false, error: 'Cannot delete the account owner contact. Please transfer ownership first.' };
    }

    // Don't allow deleting the last active contact
    const activeContactCount = await prisma.dealerContact.count({
      where: { dealerId: session.dealerId, isActive: true },
    });

    if (activeContactCount <= 1) {
      return { success: false, error: 'Cannot delete the last contact. You must have at least one contact.' };
    }

    await prisma.dealerContact.delete({
      where: { id: contactId },
    });

    revalidatePath('/settings/contacts');

    return { success: true };
  } catch (error) {
    loggers.settings.error('Failed to delete contact', {}, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to delete contact' };
  }
}

// =============================================================================
// Account Ownership Transfer
// =============================================================================

/**
 * Transfer account ownership from current owner to another contact
 * Dealer-facing action - only owner can transfer their own ownership
 */
export async function transferOwnership(newOwnerId: string) {
  const session = await getSession();
  
  if (!session || session.type !== 'dealer') {
    return { success: false, error: 'Unauthorized' };
  }

  // Only the current owner can transfer ownership
  if (session.role !== 'OWNER') {
    return { success: false, error: 'Only the account owner can transfer ownership' };
  }

  try {
    // Get the current owner contact and new owner contact
    const [currentOwner, newOwner] = await Promise.all([
      prisma.dealerContact.findFirst({
        where: { dealerId: session.dealerId, isAccountOwner: true },
      }),
      prisma.dealerContact.findFirst({
        where: { id: newOwnerId, dealerId: session.dealerId },
      }),
    ]);

    if (!currentOwner) {
      return { success: false, error: 'Current account owner not found' };
    }

    if (!newOwner) {
      return { success: false, error: 'New account owner contact not found' };
    }

    // Perform the transfer
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

    revalidatePath('/settings/contacts');

    return {
      success: true,
      message: `Account ownership has been transferred to ${newOwner.firstName} ${newOwner.lastName}`,
      oldOwner: oldOwnerAfter,
      newOwner: newOwnerAfter,
    };
  } catch (error) {
    loggers.settings.error('Failed to transfer account ownership', {}, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to transfer account ownership' };
  }
}
