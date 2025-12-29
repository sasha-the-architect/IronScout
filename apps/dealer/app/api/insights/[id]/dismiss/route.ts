import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@ironscout/db';
import { loggers } from '@/lib/logger';

// Force dynamic rendering - this route uses cookies for auth
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();

    if (!session || session.type !== 'dealer') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { days } = await request.json();

    if (!days || typeof days !== 'number' || days < 1 || days > 365) {
      return NextResponse.json(
        { error: 'Invalid dismiss duration' },
        { status: 400 }
      );
    }

    const { id: insightId } = await params;

    // Verify ownership
    const insight = await prisma.dealerInsight.findFirst({
      where: { id: insightId, dealerId: session.dealerId },
    });

    if (!insight) {
      return NextResponse.json(
        { error: 'Insight not found' },
        { status: 404 }
      );
    }

    // Calculate dismiss until date
    const dismissedUntil = new Date();
    dismissedUntil.setDate(dismissedUntil.getDate() + days);

    // Update insight
    await prisma.dealerInsight.update({
      where: { id: insightId },
      data: {
        dismissedAt: new Date(),
        dismissedUntil,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    loggers.insights.error('Dismiss insight error', {}, error instanceof Error ? error : new Error(String(error)));
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
