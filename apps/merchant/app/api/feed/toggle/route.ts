import { NextResponse } from 'next/server';
import { getSession, requireRetailerContext, requireRetailerPermission, RetailerContextError } from '@/lib/auth';
import { prisma } from '@ironscout/db';
import { z } from 'zod';
import { logger } from '@/lib/logger';

// Force dynamic rendering - this route uses cookies for auth
export const dynamic = 'force-dynamic';

const toggleSchema = z.object({
  enabled: z.boolean(),
  retailerId: z.string().optional(), // Optional: for multi-retailer merchants
});

/**
 * POST /api/feed/toggle
 * Enable or disable the retailer's feed
 */
export async function POST(request: Request) {
  const reqLogger = logger.child({ endpoint: '/api/feed/toggle', method: 'POST' });

  try {
    const session = await getSession();

    if (!session || session.type !== 'merchant') {
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

    const { enabled, retailerId: inputRetailerId } = validation.data;

    // Resolve retailer context (supports multi-retailer merchants)
    const retailerContext = await requireRetailerContext(session, inputRetailerId);
    const { retailerId } = retailerContext;

    // Require EDITOR permission to toggle feeds
    requireRetailerPermission(retailerContext, 'EDITOR', 'toggle feed status');

    // Get retailer's feed
    const feed = await prisma.retailer_feeds.findFirst({
      where: { retailerId },
    });

    if (!feed) {
      return NextResponse.json({ error: 'Feed not found' }, { status: 404 });
    }

    // Update enabled status
    const updatedFeed = await prisma.retailer_feeds.update({
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

    reqLogger.info('Feed toggle', { feedId: feed.id, retailerId, enabled });

    return NextResponse.json({
      success: true,
      enabled: updatedFeed.enabled,
      status: updatedFeed.status,
      retailerContext,
    });
  } catch (error) {
    if (error instanceof RetailerContextError) {
      reqLogger.warn('Retailer context error', { code: error.code, message: error.message });
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    reqLogger.error('Failed to toggle feed', {}, error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
