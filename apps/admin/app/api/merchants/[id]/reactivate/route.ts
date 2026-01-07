import { NextResponse } from 'next/server';
import { getAdminSession, logAdminAction } from '@/lib/auth';
import { prisma } from '@ironscout/db';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import { notifyMerchantReactivated } from '@ironscout/notifications';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const reqLogger = logger.child('reactivate', { requestId });

  try {
    const session = await getAdminSession();

    if (!session) {
      reqLogger.warn('Unauthorized reactivate attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: merchantId } = await params;
    reqLogger.info('Merchant reactivate request', { merchantId, adminEmail: session.email });

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

    if (merchant.status !== 'SUSPENDED') {
      reqLogger.warn('Merchant is not suspended', { merchantId, currentStatus: merchant.status });
      return NextResponse.json({ error: 'Merchant is not suspended' }, { status: 400 });
    }

    reqLogger.info('Reactivating merchant', { merchantId, businessName: merchant.businessName });

    const updatedMerchant = await prisma.merchants.update({
      where: { id: merchantId },
      data: { status: 'ACTIVE' },
    });

    reqLogger.info('Merchant reactivated successfully', { merchantId });

    const headersList = await headers();
    await logAdminAction(session.userId, 'reactivate', {
      merchantId,
      resource: 'merchant',
      resourceId: merchantId,
      oldValue: { status: merchant.status },
      newValue: { status: 'ACTIVE' },
      ipAddress: headersList.get('x-forwarded-for') || undefined,
      userAgent: headersList.get('user-agent') || undefined,
    });

    if (ownerUser) {
      // Send reactivation notification (email + Slack)
      const notifyResult = await notifyMerchantReactivated({
        id: merchant.id,
        email: ownerUser.email,
        businessName: merchant.businessName,
      });

      if (!notifyResult.email.success) {
        reqLogger.warn('Failed to send reactivation email', { merchantId, error: notifyResult.email.error });
      } else {
        reqLogger.info('Reactivation email sent', { merchantId, messageId: notifyResult.email.messageId });
      }

      if (!notifyResult.slack.success) {
        reqLogger.warn('Failed to send Slack notification', { merchantId, error: notifyResult.slack.error });
      }

      return NextResponse.json({
        success: true,
        merchant: { id: updatedMerchant.id, status: updatedMerchant.status },
        emailSent: notifyResult.email.success,
      });
    }

    return NextResponse.json({
      success: true,
      merchant: { id: updatedMerchant.id, status: updatedMerchant.status },
      emailSent: false,
    });
  } catch (error) {
    reqLogger.error('Reactivate merchant error', {}, error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
