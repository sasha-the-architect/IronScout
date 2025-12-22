import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@ironscout/db';
import { z } from 'zod';
import { logger } from '@/lib/logger';

// Force dynamic rendering - this route uses cookies for auth
export const dynamic = 'force-dynamic';

const feedSchema = z.object({
  id: z.string().optional(),
  accessType: z.enum(['URL', 'AUTH_URL', 'FTP', 'SFTP', 'UPLOAD']),
  formatType: z.enum(['GENERIC', 'AMMOSEEK_V1', 'GUNENGINE_V2']).optional().default('GENERIC'),
  url: z.string().url().optional().nullable(),
  username: z.string().optional().nullable(),
  password: z.string().optional().nullable(),
  scheduleMinutes: z.number().min(60).max(1440),
});

export async function GET() {
  const reqLogger = logger.child({ endpoint: '/api/feed', method: 'GET' });
  
  reqLogger.debug('Feed GET request received');
  
  try {
    const session = await getSession();
    
    if (!session || session.type !== 'dealer') {
      reqLogger.warn('Unauthorized feed access attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    reqLogger.debug('Fetching feed for dealer', { dealerId: session.dealerId });

    const feed = await prisma.dealerFeed.findFirst({
      where: { dealerId: session.dealerId },
    });

    reqLogger.debug('Feed lookup complete', { 
      dealerId: session.dealerId, 
      found: !!feed 
    });

    return NextResponse.json({ feed });
  } catch (error) {
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
    
    if (!session || session.type !== 'dealer') {
      reqLogger.warn('Unauthorized feed create attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const dealerId = session.dealerId;
    reqLogger.debug('Session verified', { dealerId });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      reqLogger.warn('Failed to parse request body');
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const validation = feedSchema.safeParse(body);
    
    if (!validation.success) {
      const errors = validation.error.errors.map(e => e.message);
      reqLogger.warn('Feed validation failed', { errors });
      return NextResponse.json(
        { error: errors[0] },
        { status: 400 }
      );
    }

    const { accessType, formatType, url, username, password, scheduleMinutes } = validation.data;

    reqLogger.debug('Checking for existing feed', { dealerId });

    // Check if dealer already has a feed
    const existingFeed = await prisma.dealerFeed.findFirst({
      where: { dealerId },
    });

    if (existingFeed) {
      reqLogger.warn('Feed already exists', { dealerId, existingFeedId: existingFeed.id });
      return NextResponse.json(
        { error: 'Feed already exists. Use PUT to update.' },
        { status: 400 }
      );
    }

    reqLogger.info('Creating new feed', {
      dealerId,
      accessType,
      formatType,
      scheduleMinutes
    });

    // Create feed
    const feed = await prisma.dealerFeed.create({
      data: {
        dealerId,
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
      dealerId,
      accessType,
      formatType
    });

    return NextResponse.json({ success: true, feed });
  } catch (error) {
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
    
    if (!session || session.type !== 'dealer') {
      reqLogger.warn('Unauthorized feed update attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const dealerId = session.dealerId;
    reqLogger.debug('Session verified', { dealerId });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      reqLogger.warn('Failed to parse request body');
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const validation = feedSchema.safeParse(body);
    
    if (!validation.success) {
      const errors = validation.error.errors.map(e => e.message);
      reqLogger.warn('Feed validation failed', { errors });
      return NextResponse.json(
        { error: errors[0] },
        { status: 400 }
      );
    }

    const { id, accessType, formatType, url, username, password, scheduleMinutes } = validation.data;

    if (!id) {
      reqLogger.warn('Feed ID missing for update');
      return NextResponse.json(
        { error: 'Feed ID required for update' },
        { status: 400 }
      );
    }

    reqLogger.debug('Verifying feed ownership', { feedId: id, dealerId });

    // Verify ownership
    const existingFeed = await prisma.dealerFeed.findFirst({
      where: { id, dealerId },
    });

    if (!existingFeed) {
      reqLogger.warn('Feed not found or not owned', { feedId: id, dealerId });
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
    const feed = await prisma.dealerFeed.update({
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

    return NextResponse.json({ success: true, feed });
  } catch (error) {
    reqLogger.error('Failed to update feed', {}, error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
