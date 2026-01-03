import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@ironscout/db';
import { logger } from '@/lib/logger';

// Force dynamic rendering - this route uses cookies for auth
export const dynamic = 'force-dynamic';

/**
 * DELETE /api/feed/corrections/[id]
 * Delete a correction
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const reqLogger = logger.child({ endpoint: `/api/feed/corrections/${id}`, method: 'DELETE' });

  try {
    const session = await getSession();

    if (!session || session.type !== 'merchant') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Look up retailerId via merchant_retailers
    const merchantRetailer = await prisma.merchant_retailers.findFirst({
      where: { merchantId: session.merchantId },
      select: { retailerId: true }
    });

    if (!merchantRetailer?.retailerId) {
      return NextResponse.json({ error: 'No retailer configured for this merchant' }, { status: 400 });
    }

    // Verify ownership
    const correction = await prisma.feed_corrections.findFirst({
      where: {
        id,
        retailerId: merchantRetailer.retailerId,
      },
    });

    if (!correction) {
      return NextResponse.json({ error: 'Correction not found' }, { status: 404 });
    }

    await prisma.feed_corrections.delete({
      where: { id },
    });

    reqLogger.info('Correction deleted', { correctionId: id });

    return NextResponse.json({ success: true });
  } catch (error) {
    reqLogger.error('Failed to delete correction', {}, error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
