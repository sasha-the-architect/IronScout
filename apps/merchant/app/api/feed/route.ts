import { NextResponse } from 'next/server';
import { getSession, requireRetailerContext, requireRetailerPermission, RetailerContextError } from '@/lib/auth';
import { prisma } from '@ironscout/db';
import { z } from 'zod';
import { logger } from '@/lib/logger';

// Force dynamic rendering - this route uses cookies for auth
export const dynamic = 'force-dynamic';

const feedSchema = z.object({
  id: z.string().optional(),
  retailerId: z.string().optional(), // Optional: for multi-retailer merchants
  accessType: z.enum(['URL', 'AUTH_URL', 'FTP', 'SFTP', 'UPLOAD']),
  formatType: z.enum(['GENERIC', 'AMMOSEEK_V1', 'GUNENGINE_V2', 'IMPACT']).optional().default('GENERIC'),
  url: z.string().url().optional().nullable(),
  username: z.string().optional().nullable(),
  password: z.string().optional().nullable(),
  scheduleMinutes: z.number().min(60).max(1440),
});

export async function GET(request: Request) {
  const reqLogger = logger.child({ endpoint: '/api/feed', method: 'GET' });

  reqLogger.debug('Feed GET request received');

  try {
    const session = await getSession();

    if (!session || session.type !== 'merchant') {
      reqLogger.warn('Unauthorized feed access attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Resolve retailer context (supports multi-retailer merchants)
    const url = new URL(request.url);
    const inputRetailerId = url.searchParams.get('retailerId') || undefined;
    const retailerContext = await requireRetailerContext(session, inputRetailerId);

    reqLogger.debug('Fetching feed for retailer', {
      merchantId: session.merchantId,
      retailerId: retailerContext.retailerId,
      retailerName: retailerContext.retailerName,
    });

    const feed = await prisma.retailer_feeds.findFirst({
      where: { retailerId: retailerContext.retailerId },
    });

    reqLogger.debug('Feed lookup complete', {
      retailerId: retailerContext.retailerId,
      found: !!feed
    });

    return NextResponse.json({ feed, retailerContext });
  } catch (error) {
    if (error instanceof RetailerContextError) {
      reqLogger.warn('Retailer context error', { code: error.code, message: error.message });
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    reqLogger.error('Failed to get feed', {}, error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const reqLogger = logger.child({ requestId, endpoint: '/api/feed', method: 'POST' });

  reqLogger.info('Feed create request received');

  try {
    const session = await getSession();

    if (!session || session.type !== 'merchant') {
      reqLogger.warn('Unauthorized feed create attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      reqLogger.warn('Failed to parse request body');
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const validation = feedSchema.safeParse(body);

    if (!validation.success) {
      const errors = validation.error.issues.map(e => e.message);
      reqLogger.warn('Feed validation failed', { errors });
      return NextResponse.json(
        { error: errors[0] },
        { status: 400 }
      );
    }

    const { retailerId: inputRetailerId, accessType, formatType, url, username, password, scheduleMinutes } = validation.data;

    // Resolve retailer context (supports multi-retailer merchants)
    const retailerContext = await requireRetailerContext(session, inputRetailerId);
    const { retailerId } = retailerContext;

    // Require ADMIN permission to create feeds
    requireRetailerPermission(retailerContext, 'ADMIN', 'create feeds');

    reqLogger.debug('Session verified', { merchantId: session.merchantId, retailerId });

    reqLogger.debug('Checking for existing feed', { retailerId });

    // Check if retailer already has a feed
    const existingFeed = await prisma.retailer_feeds.findFirst({
      where: { retailerId },
    });

    if (existingFeed) {
      reqLogger.warn('Feed already exists', { retailerId, existingFeedId: existingFeed.id });
      return NextResponse.json(
        { error: 'Feed already exists. Use PUT to update.' },
        { status: 400 }
      );
    }

    reqLogger.info('Creating new feed', {
      retailerId,
      accessType,
      formatType,
      scheduleMinutes
    });

    // Create feed
    const feed = await prisma.retailer_feeds.create({
      data: {
        retailerId,
        accessType,
        formatType,
        url: url || null,
        username: username || null,
        password: password || null, // TODO: Encrypt at app layer
        scheduleMinutes,
        status: 'PENDING',
      },
    });

    reqLogger.info('Feed created successfully', {
      feedId: feed.id,
      retailerId,
      accessType,
      formatType
    });

    return NextResponse.json({ success: true, feed, retailerContext });
  } catch (error) {
    if (error instanceof RetailerContextError) {
      reqLogger.warn('Retailer context error', { code: error.code, message: error.message });
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    reqLogger.error('Failed to create feed', {}, error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const reqLogger = logger.child({ requestId, endpoint: '/api/feed', method: 'PUT' });

  reqLogger.info('Feed update request received');

  try {
    const session = await getSession();

    if (!session || session.type !== 'merchant') {
      reqLogger.warn('Unauthorized feed update attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      reqLogger.warn('Failed to parse request body');
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const validation = feedSchema.safeParse(body);

    if (!validation.success) {
      const errors = validation.error.issues.map(e => e.message);
      reqLogger.warn('Feed validation failed', { errors });
      return NextResponse.json(
        { error: errors[0] },
        { status: 400 }
      );
    }

    const { id, retailerId: inputRetailerId, accessType, formatType, url, username, password, scheduleMinutes } = validation.data;

    if (!id) {
      reqLogger.warn('Feed ID missing for update');
      return NextResponse.json(
        { error: 'Feed ID required for update' },
        { status: 400 }
      );
    }

    // Resolve retailer context (supports multi-retailer merchants)
    const retailerContext = await requireRetailerContext(session, inputRetailerId);
    const { retailerId } = retailerContext;

    // Require EDITOR permission to update feeds
    requireRetailerPermission(retailerContext, 'EDITOR', 'update feeds');

    reqLogger.debug('Session verified', { merchantId: session.merchantId, retailerId });
    reqLogger.debug('Verifying feed ownership', { feedId: id, retailerId });

    // Verify ownership - feed must belong to the resolved retailer
    const existingFeed = await prisma.retailer_feeds.findFirst({
      where: { id, retailerId },
    });

    if (!existingFeed) {
      reqLogger.warn('Feed not found or not owned', { feedId: id, retailerId });
      return NextResponse.json(
        { error: 'Feed not found' },
        { status: 404 }
      );
    }

    reqLogger.info('Updating feed', {
      feedId: id,
      accessType,
      formatType,
      scheduleMinutes
    });

    // Update feed
    const feed = await prisma.retailer_feeds.update({
      where: { id },
      data: {
        accessType,
        formatType,
        url: url || null,
        username: username || null,
        // Only update password if provided (non-empty)
        ...(password ? { password } : {}),
        scheduleMinutes,
      },
    });

    reqLogger.info('Feed updated successfully', { feedId: feed.id });

    return NextResponse.json({ success: true, feed, retailerContext });
  } catch (error) {
    if (error instanceof RetailerContextError) {
      reqLogger.warn('Retailer context error', { code: error.code, message: error.message });
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    reqLogger.error('Failed to update feed', {}, error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const reqLogger = logger.child({ requestId, endpoint: '/api/feed', method: 'DELETE' });

  reqLogger.info('Feed delete request received');

  try {
    const session = await getSession();

    if (!session || session.type !== 'merchant') {
      reqLogger.warn('Unauthorized feed delete attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Resolve retailer context (supports multi-retailer merchants)
    const url = new URL(request.url);
    const inputRetailerId = url.searchParams.get('retailerId') || undefined;
    const retailerContext = await requireRetailerContext(session, inputRetailerId);
    const { retailerId } = retailerContext;

    // Require ADMIN permission to delete feeds
    requireRetailerPermission(retailerContext, 'ADMIN', 'delete feeds');

    reqLogger.debug('Session verified', { merchantId: session.merchantId, retailerId });

    // Find and verify ownership
    const feed = await prisma.retailer_feeds.findFirst({
      where: { retailerId },
    });

    if (!feed) {
      reqLogger.warn('Feed not found for deletion', { retailerId });
      return NextResponse.json({ error: 'Feed not found' }, { status: 404 });
    }

    reqLogger.info('Deleting feed', { feedId: feed.id, retailerId });

    // Delete the feed (cascade will handle related records)
    await prisma.retailer_feeds.delete({
      where: { id: feed.id },
    });

    reqLogger.info('Feed deleted successfully', { feedId: feed.id, retailerId });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof RetailerContextError) {
      reqLogger.warn('Retailer context error', { code: error.code, message: error.message });
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    reqLogger.error('Failed to delete feed', {}, error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
