import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@ironscout/db';
import { logger } from '@/lib/logger';

// Force dynamic rendering - this route uses cookies for auth
export const dynamic = 'force-dynamic';

// Lazy-load Redis and BullMQ to avoid connection during build
let dealerFeedIngestQueue: import('bullmq').Queue | null = null;

async function getQueue() {
  if (!dealerFeedIngestQueue) {
    logger.debug('Initializing BullMQ queue connection');
    const { Queue } = await import('bullmq');
    const Redis = (await import('ioredis')).default;
    
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    logger.debug('Connecting to Redis', { redisUrl: redisUrl.replace(/\/\/.*@/, '//***@') });
    
    const redisConnection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
    });
    
    dealerFeedIngestQueue = new Queue('dealer-feed-ingest', {
      connection: redisConnection,
    });
    
    logger.info('BullMQ queue initialized');
  }
  return dealerFeedIngestQueue;
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
    
    if (!session || session.type !== 'dealer') {
      reqLogger.warn('Unauthorized feed refresh attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const dealerId = session.dealerId;
    reqLogger.debug('Session verified', { dealerId });

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

    reqLogger.debug('Looking up feed', { feedId, dealerId });

    // Verify ownership
    const feed = await prisma.dealerFeed.findFirst({
      where: { id: feedId, dealerId },
    });

    if (!feed) {
      reqLogger.warn('Feed not found or not owned by dealer', { feedId, dealerId });
      return NextResponse.json(
        { error: 'Feed not found' },
        { status: 404 }
      );
    }

    reqLogger.debug('Feed found', { feedId, accessType: feed.accessType });

    // Check dealer status
    const dealer = await prisma.dealer.findUnique({
      where: { id: dealerId },
    });

    if (!dealer || dealer.status !== 'ACTIVE') {
      reqLogger.warn('Feed refresh denied - dealer not active', { 
        dealerId, 
        status: dealer?.status 
      });
      return NextResponse.json(
        { error: 'Your account must be active to refresh feeds' },
        { status: 403 }
      );
    }

    // Check for rate limiting (max 1 manual refresh per 5 minutes)
    const recentRun = await prisma.dealerFeedRun.findFirst({
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

    reqLogger.info('Creating feed run record', { feedId, dealerId });

    // Create a feed run record
    const run = await prisma.dealerFeedRun.create({
      data: {
        dealerId,
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
        dealerId,
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
