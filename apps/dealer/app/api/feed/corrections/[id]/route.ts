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

    if (!session || session.type !== 'dealer') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify ownership
    const correction = await prisma.feedCorrection.findFirst({
      where: {
        id,
        dealerId: session.dealerId,
      },
    });

    if (!correction) {
      return NextResponse.json({ error: 'Correction not found' }, { status: 404 });
    }

    await prisma.feedCorrection.delete({
      where: { id },
    });

    reqLogger.info('Correction deleted', { correctionId: id });

    return NextResponse.json({ success: true });
  } catch (error) {
    reqLogger.error('Failed to delete correction', {}, error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
