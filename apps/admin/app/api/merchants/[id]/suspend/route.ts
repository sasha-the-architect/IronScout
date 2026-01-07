import { NextResponse } from 'next/server';
import { getAdminSession, logAdminAction } from '@/lib/auth';
import { prisma } from '@ironscout/db';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import { notifyMerchantSuspended } from '@ironscout/notifications';

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

    const { id: merchantId } = await params;

    // Parse optional reason from request body
    let reason: string | undefined;
    try {
      const body = await request.json();
      reason = body.reason;
    } catch {
      // No body or invalid JSON, continue without reason
    }

    reqLogger.info('Merchant suspend request', { merchantId, adminEmail: session.email, reason });

    const merchant = await prisma.merchants.findUnique({
      where: { id: merchantId },
      include: {
        merchant_users: {
          where: { role: 'OWNER' },
          take: 1,
        },
      },
    });

    if (!merchant) {
      reqLogger.warn('Merchant not found', { merchantId });
      return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });
    }

    const ownerUser = merchant.merchant_users[0];

    if (merchant.status === 'SUSPENDED') {
      reqLogger.warn('Merchant already suspended', { merchantId });
      return NextResponse.json({ error: 'Merchant is already suspended' }, { status: 400 });
    }

    reqLogger.info('Suspending merchant', { merchantId, businessName: merchant.businessName });

    const updatedMerchant = await prisma.merchants.update({
      where: { id: merchantId },
      data: { status: 'SUSPENDED' },
    });

    reqLogger.info('Merchant suspended successfully', { merchantId });

    const headersList = await headers();
    await logAdminAction(session.userId, 'suspend', {
      merchantId,
      resource: 'merchant',
      resourceId: merchantId,
      oldValue: { status: merchant.status },
      newValue: { status: 'SUSPENDED', reason },
      ipAddress: headersList.get('x-forwarded-for') || undefined,
      userAgent: headersList.get('user-agent') || undefined,
    });

    // Send suspension notification (email + Slack)
    if (ownerUser) {
      const notifyResult = await notifyMerchantSuspended(
        {
          id: merchant.id,
          email: ownerUser.email,
          businessName: merchant.businessName,
        },
        reason
      );

      if (!notifyResult.email.success) {
        reqLogger.warn('Failed to send suspension email', { merchantId, error: notifyResult.email.error });
      } else {
        reqLogger.info('Suspension email sent', { merchantId, messageId: notifyResult.email.messageId });
      }

      if (!notifyResult.slack.success) {
        reqLogger.warn('Failed to send Slack notification', { merchantId, error: notifyResult.slack.error });
      }
    }

    return NextResponse.json({
      success: true,
      merchant: { id: updatedMerchant.id, status: updatedMerchant.status },
    });
  } catch (error) {
    reqLogger.error('Suspend merchant error', {}, error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
