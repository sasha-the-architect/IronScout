import { NextResponse } from 'next/server';
import { getAdminSession, logAdminAction } from '@/lib/auth';
import { prisma } from '@ironscout/db';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import { notifyDealerReactivated } from '@ironscout/notifications';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const reqLogger = logger.child({ requestId, endpoint: '/api/dealers/[id]/reactivate' });
  
  try {
    const session = await getAdminSession();
    
    if (!session) {
      reqLogger.warn('Unauthorized reactivate attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: dealerId } = await params;
    reqLogger.info('Dealer reactivate request', { dealerId, adminEmail: session.email });

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
      return NextResponse.json({ error: 'Dealer not found' }, { status: 404 });
    }

    const ownerUser = dealer.users[0];

    if (dealer.status !== 'SUSPENDED') {
      reqLogger.warn('Dealer is not suspended', { dealerId, currentStatus: dealer.status });
      return NextResponse.json({ error: 'Dealer is not suspended' }, { status: 400 });
    }

    reqLogger.info('Reactivating dealer', { dealerId, businessName: dealer.businessName });

    const updatedDealer = await prisma.dealer.update({
      where: { id: dealerId },
      data: { status: 'ACTIVE' },
    });

    reqLogger.info('Dealer reactivated successfully', { dealerId });

    const headersList = await headers();
    await logAdminAction(session.userId, 'reactivate', {
      dealerId,
      resource: 'dealer',
      resourceId: dealerId,
      oldValue: { status: dealer.status },
      newValue: { status: 'ACTIVE' },
      ipAddress: headersList.get('x-forwarded-for') || undefined,
      userAgent: headersList.get('user-agent') || undefined,
    });

    if (ownerUser) {
      // Send reactivation notification (email + Slack)
      const notifyResult = await notifyDealerReactivated({
        id: dealer.id,
        email: ownerUser.email,
        businessName: dealer.businessName,
      });

      if (!notifyResult.email.success) {
        reqLogger.warn('Failed to send reactivation email', { dealerId, error: notifyResult.email.error });
      } else {
        reqLogger.info('Reactivation email sent', { dealerId, messageId: notifyResult.email.messageId });
      }
      
      if (!notifyResult.slack.success) {
        reqLogger.warn('Failed to send Slack notification', { dealerId, error: notifyResult.slack.error });
      }

      return NextResponse.json({
        success: true,
        dealer: { id: updatedDealer.id, status: updatedDealer.status },
        emailSent: notifyResult.email.success,
      });
    }

    return NextResponse.json({
      success: true,
      dealer: { id: updatedDealer.id, status: updatedDealer.status },
      emailSent: false,
    });
  } catch (error) {
    reqLogger.error('Reactivate dealer error', {}, error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
