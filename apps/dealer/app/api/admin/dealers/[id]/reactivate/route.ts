import { NextResponse } from 'next/server';
import { getSession, logAdminAction } from '@/lib/auth';
import { prisma } from '@ironscout/db';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import { sendApprovalEmail } from '@/lib/email';

// Force dynamic rendering - this route uses cookies for auth
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const reqLogger = logger.child({ requestId, endpoint: '/api/admin/dealers/[id]/reactivate' });
  
  try {
    const session = await getSession();
    
    if (!session || session.type !== 'admin') {
      reqLogger.warn('Unauthorized reactivate attempt');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id: dealerId } = await params;
    reqLogger.info('Dealer reactivate request', { dealerId, adminEmail: session.email });

    // Get current dealer state with owner user
    const dealer = await prisma.dealer.findUnique({
      where: { id: dealerId },
      include: {
        users: {
          where: { role: 'OWNER' },
          take: 1,
        },
      },
    });

    if (!dealer) {
      reqLogger.warn('Dealer not found', { dealerId });
      return NextResponse.json(
        { error: 'Dealer not found' },
        { status: 404 }
      );
    }

    const ownerUser = dealer.users[0];

    if (dealer.status !== 'SUSPENDED') {
      reqLogger.warn('Dealer is not suspended', { dealerId, currentStatus: dealer.status });
      return NextResponse.json(
        { error: 'Dealer is not suspended' },
        { status: 400 }
      );
    }

    reqLogger.info('Reactivating dealer', { 
      dealerId, 
      businessName: dealer.businessName 
    });

    // Update dealer status
    const updatedDealer = await prisma.dealer.update({
      where: { id: dealerId },
      data: {
        status: 'ACTIVE',
      },
    });

    reqLogger.info('Dealer reactivated successfully', { dealerId });

    // Log admin action
    const headersList = await headers();
    await logAdminAction(session.email, 'reactivate', {
      dealerId,
      resource: 'dealer',
      resourceId: dealerId,
      oldValue: { status: dealer.status },
      newValue: { status: 'ACTIVE' },
      ipAddress: headersList.get('x-forwarded-for') || undefined,
      userAgent: headersList.get('user-agent') || undefined,
    });

    // Send reactivation email (same as approval) to owner
    if (ownerUser) {
      reqLogger.debug('Sending reactivation email');
      const emailResult = await sendApprovalEmail(
        ownerUser.email,
        dealer.businessName
      );

      if (!emailResult.success) {
        reqLogger.warn('Failed to send reactivation email', { 
          dealerId, 
          error: emailResult.error 
        });
      } else {
        reqLogger.info('Reactivation email sent', { 
          dealerId, 
          messageId: emailResult.messageId 
        });
      }

      return NextResponse.json({
        success: true,
        dealer: {
          id: updatedDealer.id,
          status: updatedDealer.status,
        },
        emailSent: emailResult.success,
      });
    }

    return NextResponse.json({
      success: true,
      dealer: {
        id: updatedDealer.id,
        status: updatedDealer.status,
      },
      emailSent: false,
    });
  } catch (error) {
    reqLogger.error('Reactivate dealer error', {}, error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
