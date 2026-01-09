import { NextResponse } from 'next/server';
import { getSession, requireRetailerContext, RetailerContextError } from '@/lib/auth';
import { prisma } from '@ironscout/db';
import { logger } from '@/lib/logger';
import { z } from 'zod';

// Force dynamic rendering - this route uses cookies for auth
export const dynamic = 'force-dynamic';

// Lazy-load Redis and BullMQ to avoid connection during build
let retailerFeedIngestQueue: import('bullmq').Queue | null = null;

async function getQueue() {
  if (!retailerFeedIngestQueue) {
    logger.debug('Initializing BullMQ queue connection');
    const { Queue } = await import('bullmq');
    const Redis = (await import('ioredis')).default;

    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    logger.debug('Connecting to Redis', { redisUrl: redisUrl.replace(/\/\/.*@/, '//***@') });

    const redisConnection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
    });

    retailerFeedIngestQueue = new Queue('retailer-feed-ingest', {
      connection: redisConnection,
    });

    logger.info('BullMQ queue initialized');
  }
  return retailerFeedIngestQueue;
}

const refreshSchema = z.object({
  feedId: z.string().min(1),
  retailerId: z.string().optional(), // Optional: for multi-retailer merchants
});

/**
 * Trigger a manual feed refresh
 */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const reqLogger = logger.child({ requestId, endpoint: '/api/feed/refresh' });

  reqLogger.info('Feed refresh request received');

  try {
    const session = await getSession();

    if (!session || session.type !== 'merchant') {
      reqLogger.warn('Unauthorized feed refresh attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const merchantId = session.merchantId;
    reqLogger.debug('Session verified', { merchantId });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      reqLogger.warn('Failed to parse request body');
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const validation = refreshSchema.safeParse(body);
    if (!validation.success) {
      reqLogger.warn('Feed refresh failed - invalid data');
      return NextResponse.json(
        { error: 'Feed ID is required' },
        { status: 400 }
      );
    }

    const { feedId, retailerId: inputRetailerId } = validation.data;

    // Resolve retailer context (supports multi-retailer merchants)
    const retailerContext = await requireRetailerContext(session, inputRetailerId);
    const { retailerId } = retailerContext;

    reqLogger.debug('Looking up feed', { feedId, retailerId });

    // Verify ownership - feed must belong to resolved retailer
    const feed = await prisma.retailer_feeds.findFirst({
      where: { id: feedId, retailerId },
    });

    if (!feed) {
      reqLogger.warn('Feed not found or not owned by retailer', { feedId, retailerId });
      return NextResponse.json(
        { error: 'Feed not found' },
        { status: 404 }
      );
    }

    reqLogger.debug('Feed found', { feedId, accessType: feed.accessType });

    // Check merchant status
    const merchant = await prisma.merchants.findUnique({
      where: { id: merchantId },
    });

    if (!merchant || merchant.status !== 'ACTIVE') {
      reqLogger.warn('Feed refresh denied - merchant not active', {
        merchantId,
        status: merchant?.status
      });
      return NextResponse.json(
        { error: 'Your account must be active to refresh feeds' },
        { status: 403 }
      );
    }

    // Check for rate limiting (max 1 manual refresh per 5 minutes)
    const recentRun = await prisma.retailer_feed_runs.findFirst({
      where: {
        feedId,
        startedAt: {
          gte: new Date(Date.now() - 5 * 60 * 1000), // Last 5 minutes
        },
      },
    });

    if (recentRun) {
      reqLogger.warn('Feed refresh rate limited', {
        feedId,
        lastRunId: recentRun.id,
        lastRunAt: recentRun.startedAt
      });
      return NextResponse.json(
        { error: 'Please wait 5 minutes between manual refreshes' },
        { status: 429 }
      );
    }

    reqLogger.info('Creating feed run record', { feedId, merchantId, retailerId });

    // Create a feed run record
    const run = await prisma.retailer_feed_runs.create({
      data: {
        retailerId,
        feedId,
        status: 'RUNNING',
      },
    });

    reqLogger.debug('Feed run created', { runId: run.id });

    // Queue the feed ingestion job
    reqLogger.debug('Queueing feed ingestion job');
    const queue = await getQueue();

    await queue.add(
      'ingest-manual',
      {
        retailerId,
        feedId: feed.id,
        feedRunId: run.id,
        accessType: feed.accessType,
        formatType: feed.formatType,
        url: feed.url || undefined,
        username: feed.username || undefined,
        password: feed.password || undefined,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 10000 },
        priority: 1, // High priority for manual triggers
      }
    );

    reqLogger.info('Feed refresh queued successfully', {
      feedId,
      runId: run.id,
      accessType: feed.accessType
    });

    return NextResponse.json({
      success: true,
      runId: run.id,
      message: 'Feed refresh started',
      retailerContext,
    });
  } catch (error) {
    if (error instanceof RetailerContextError) {
      reqLogger.warn('Retailer context error', { code: error.code, message: error.message });
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    reqLogger.error('Feed refresh failed - unexpected error', {}, error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
