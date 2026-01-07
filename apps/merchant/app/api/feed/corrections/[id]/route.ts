import { NextResponse } from 'next/server';
import { getSession, requireRetailerContext, RetailerContextError } from '@/lib/auth';
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

    // Resolve retailer context from query param
    const url = new URL(request.url);
    const inputRetailerId = url.searchParams.get('retailerId') || undefined;
    const retailerContext = await requireRetailerContext(session, inputRetailerId);
    const { retailerId } = retailerContext;

    // Verify ownership
    const correction = await prisma.feed_corrections.findFirst({
      where: {
        id,
        retailerId,
      },
    });

    if (!correction) {
      return NextResponse.json({ error: 'Correction not found' }, { status: 404 });
    }

    await prisma.feed_corrections.delete({
      where: { id },
    });

    reqLogger.info('Correction deleted', { correctionId: id });

    return NextResponse.json({ success: true, retailerContext });
  } catch (error) {
    if (error instanceof RetailerContextError) {
      reqLogger.warn('Retailer context error', { code: error.code, message: error.message });
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    reqLogger.error('Failed to delete correction', {}, error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
