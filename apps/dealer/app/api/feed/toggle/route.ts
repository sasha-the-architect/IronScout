import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@ironscout/db';
import { z } from 'zod';
import { logger } from '@/lib/logger';

// Force dynamic rendering - this route uses cookies for auth
export const dynamic = 'force-dynamic';

const toggleSchema = z.object({
  enabled: z.boolean(),
});

/**
 * POST /api/feed/toggle
 * Enable or disable the dealer's feed
 */
export async function POST(request: Request) {
  const reqLogger = logger.child({ endpoint: '/api/feed/toggle', method: 'POST' });

  try {
    const session = await getSession();

    if (!session || session.type !== 'dealer') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const validation = toggleSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    }

    const { enabled } = validation.data;

    // Get dealer's feed
    const feed = await prisma.dealerFeed.findFirst({
      where: { dealerId: session.dealerId },
    });

    if (!feed) {
      return NextResponse.json({ error: 'Feed not found' }, { status: 404 });
    }

    // Update enabled status
    const updatedFeed = await prisma.dealerFeed.update({
      where: { id: feed.id },
      data: {
        enabled,
        // Clear error state when re-enabling
        ...(enabled && feed.status === 'FAILED' && {
          status: 'PENDING',
          lastError: null,
          primaryErrorCode: null,
        }),
      },
    });

    reqLogger.info('Feed toggle', { feedId: feed.id, enabled });

    return NextResponse.json({
      success: true,
      enabled: updatedFeed.enabled,
      status: updatedFeed.status,
    });
  } catch (error) {
    reqLogger.error('Failed to toggle feed', {}, error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
