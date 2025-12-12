'use server';

import { prisma } from '@ironscout/db';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';

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

    // If this is being set as account owner, unset other account owners
    if (data.isAccountOwner) {
      await prisma.dealerContact.updateMany({
        where: { dealerId: session.dealerId, isAccountOwner: true },
        data: { isAccountOwner: false },
      });
    }

    const contact = await prisma.dealerContact.create({
      data: {
        dealerId: session.dealerId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email.toLowerCase(),
        phone: data.phone || null,
        role: data.role || 'PRIMARY',
        marketingOptIn: data.marketingOptIn ?? false,
        communicationOptIn: data.communicationOptIn ?? true,
        isAccountOwner: data.isAccountOwner ?? false,
      },
    });

    revalidatePath('/settings/contacts');

    return { success: true, contact };
  } catch (error) {
    console.error('Failed to create contact:', error);
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

    // If this is being set as account owner, unset other account owners
    if (data.isAccountOwner && !existingContact.isAccountOwner) {
      await prisma.dealerContact.updateMany({
        where: { dealerId: session.dealerId, isAccountOwner: true },
        data: { isAccountOwner: false },
      });
    }

    const contact = await prisma.dealerContact.update({
      where: { id: contactId },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email?.toLowerCase(),
        phone: data.phone,
        role: data.role,
        marketingOptIn: data.marketingOptIn,
        communicationOptIn: data.communicationOptIn,
        isAccountOwner: data.isAccountOwner,
      },
    });

    revalidatePath('/settings/contacts');

    return { success: true, contact };
  } catch (error) {
    console.error('Failed to update contact:', error);
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
    console.error('Failed to delete contact:', error);
    return { success: false, error: 'Failed to delete contact' };
  }
}
