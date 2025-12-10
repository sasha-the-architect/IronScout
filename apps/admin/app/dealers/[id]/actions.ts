'use server';

import { prisma } from '@ironscout/db';
import { revalidatePath } from 'next/cache';
import { getAdminSession, logAdminAction } from '@/lib/auth';

export interface UpdateDealerData {
  businessName?: string;
  contactName?: string;
  phone?: string;
  websiteUrl?: string;
  tier?: 'FREE' | 'STARTER' | 'PRO' | 'ENTERPRISE';
  storeType?: 'ONLINE_ONLY' | 'BRICK_AND_MORTAR' | 'HYBRID';
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
      select: {
        businessName: true,
        contactName: true,
        phone: true,
        websiteUrl: true,
        tier: true,
        storeType: true,
        status: true,
      },
    });

    if (!oldDealer) {
      return { success: false, error: 'Dealer not found' };
    }

    // Update dealer
    const updatedDealer = await prisma.dealer.update({
      where: { id: dealerId },
      data: {
        businessName: data.businessName,
        contactName: data.contactName,
        phone: data.phone,
        websiteUrl: data.websiteUrl,
        tier: data.tier,
        storeType: data.storeType,
        status: data.status,
      },
    });

    // Log the action
    await logAdminAction(session.userId, 'UPDATE_DEALER', {
      dealerId,
      resource: 'Dealer',
      resourceId: dealerId,
      oldValue: oldDealer,
      newValue: data,
    });

    revalidatePath(`/dealers/${dealerId}`);
    revalidatePath('/dealers');

    return { success: true, dealer: updatedDealer };
  } catch (error) {
    console.error('Failed to update dealer:', error);
    return { success: false, error: 'Failed to update dealer' };
  }
}
