import { NextResponse } from 'next/server';
import { getAdminSession, logAdminAction } from '@/lib/auth';
import { prisma } from '@ironscout/db';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import { notifyDealerSuspended } from '@ironscout/notifications';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const reqLogger = logger.child('suspend', { requestId });
  
  try {
    const session = await getAdminSession();
    
    if (!session) {
      reqLogger.warn('Unauthorized suspend attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: dealerId } = await params;
    
    // Parse optional reason from request body
    let reason: string | undefined;
    try {
      const body = await request.json();
      reason = body.reason;
    } catch {
      // No body or invalid JSON, continue without reason
    }
    
    reqLogger.info('Dealer suspend request', { dealerId, adminEmail: session.email, reason });

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

    if (dealer.status === 'SUSPENDED') {
      reqLogger.warn('Dealer already suspended', { dealerId });
      return NextResponse.json({ error: 'Dealer is already suspended' }, { status: 400 });
    }

    reqLogger.info('Suspending dealer', { dealerId, businessName: dealer.businessName });

    const updatedDealer = await prisma.dealer.update({
      where: { id: dealerId },
      data: { status: 'SUSPENDED' },
    });

    reqLogger.info('Dealer suspended successfully', { dealerId });

    const headersList = await headers();
    await logAdminAction(session.userId, 'suspend', {
      dealerId,
      resource: 'dealer',
      resourceId: dealerId,
      oldValue: { status: dealer.status },
      newValue: { status: 'SUSPENDED', reason },
      ipAddress: headersList.get('x-forwarded-for') || undefined,
      userAgent: headersList.get('user-agent') || undefined,
    });

    // Send suspension notification (email + Slack)
    if (ownerUser) {
      const notifyResult = await notifyDealerSuspended(
        {
          id: dealer.id,
          email: ownerUser.email,
          businessName: dealer.businessName,
        },
        reason
      );

      if (!notifyResult.email.success) {
        reqLogger.warn('Failed to send suspension email', { dealerId, error: notifyResult.email.error });
      } else {
        reqLogger.info('Suspension email sent', { dealerId, messageId: notifyResult.email.messageId });
      }
      
      if (!notifyResult.slack.success) {
        reqLogger.warn('Failed to send Slack notification', { dealerId, error: notifyResult.slack.error });
      }
    }

    return NextResponse.json({
      success: true,
      dealer: { id: updatedDealer.id, status: updatedDealer.status },
    });
  } catch (error) {
    reqLogger.error('Suspend dealer error', {}, error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
