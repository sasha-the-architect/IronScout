import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@ironscout/db';
import { logger } from '@/lib/logger';

// Force dynamic rendering - this route uses cookies for auth
export const dynamic = 'force-dynamic';

// Lazy-load Redis and BullMQ to avoid connection during build
let merchantFeedIngestQueue: import('bullmq').Queue | null = null;

async function getQueue() {
  if (!merchantFeedIngestQueue) {
    logger.debug('Initializing BullMQ queue connection');
    const { Queue } = await import('bullmq');
    const Redis = (await import('ioredis')).default;
    
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    logger.debug('Connecting to Redis', { redisUrl: redisUrl.replace(/\/\/.*@/, '//***@') });
    
    const redisConnection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
    });
    
    merchantFeedIngestQueue = new Queue('merchant-feed-ingest', {
      connection: redisConnection,
    });

    logger.info('BullMQ queue initialized');
  }
  return merchantFeedIngestQueue;
}

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

    let body: { feedId?: string };
    try {
      body = await request.json();
    } catch {
      reqLogger.warn('Failed to parse request body');
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { feedId } = body;

    if (!feedId) {
      reqLogger.warn('Feed refresh failed - no feedId provided');
      return NextResponse.json(
        { error: 'Feed ID is required' },
        { status: 400 }
      );
    }

    reqLogger.debug('Looking up feed', { feedId, merchantId });

    // Verify ownership
    const feed = await prisma.retailer_feeds.findFirst({
      where: { id: feedId, retailerId: merchantId },
    });

    if (!feed) {
      reqLogger.warn('Feed not found or not owned by merchant', { feedId, merchantId });
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

    // Look up retailerId via merchant_retailers
    const merchantRetailer = await prisma.merchant_retailers.findFirst({
      where: { merchantId },
      select: { retailerId: true }
    });
    const retailerId = merchantRetailer?.retailerId;

    if (!retailerId) {
      reqLogger.warn('No retailerId found for merchant', { merchantId });
      return NextResponse.json(
        { error: 'No retailer configured for this merchant' },
        { status: 400 }
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
        retailerId: merchantId,
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
    });
  } catch (error) {
    reqLogger.error('Feed refresh failed - unexpected error', {}, error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
