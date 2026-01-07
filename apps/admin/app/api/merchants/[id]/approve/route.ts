import { NextResponse } from 'next/server';
import { getAdminSession, logAdminAction } from '@/lib/auth';
import { prisma } from '@ironscout/db';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import { notifyMerchantApproved } from '@ironscout/notifications';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const reqLogger = logger.child('approve', { requestId });

  try {
    const session = await getAdminSession();

    if (!session) {
      reqLogger.warn('Unauthorized approval attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: merchantId } = await params;
    reqLogger.info('Merchant approval request', { merchantId, adminEmail: session.email });

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

    if (merchant.status !== 'PENDING') {
      reqLogger.warn('Merchant is not pending', { merchantId, currentStatus: merchant.status });
      return NextResponse.json({ error: 'Merchant is not pending approval' }, { status: 400 });
    }

    reqLogger.info('Approving merchant', { merchantId, businessName: merchant.businessName });

    const updatedMerchant = await prisma.merchants.update({
      where: { id: merchantId },
      data: {
        status: 'ACTIVE',
      },
    });

    // Also verify owner's email
    if (ownerUser && !ownerUser.emailVerified) {
      await prisma.merchant_users.update({
        where: { id: ownerUser.id },
        data: { emailVerified: true },
      });
    }

    reqLogger.info('Merchant approved successfully', { merchantId });

    const headersList = await headers();
    await logAdminAction(session.userId, 'approve', {
      merchantId,
      resource: 'merchant',
      resourceId: merchantId,
      oldValue: { status: merchant.status },
      newValue: { status: 'ACTIVE' },
      ipAddress: headersList.get('x-forwarded-for') || undefined,
      userAgent: headersList.get('user-agent') || undefined,
    });

    if (ownerUser) {
      // Send approval notification (email + Slack)
      const notifyResult = await notifyMerchantApproved({
        id: merchant.id,
        email: ownerUser.email,
        businessName: merchant.businessName,
      });

      if (!notifyResult.email.success) {
        reqLogger.warn('Failed to send approval email', { merchantId, error: notifyResult.email.error });
      } else {
        reqLogger.info('Approval email sent', { merchantId, messageId: notifyResult.email.messageId });
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
    reqLogger.error('Approve merchant error', {}, error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
