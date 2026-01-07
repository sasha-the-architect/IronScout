import { NextResponse } from 'next/server';
import { getSession, requireRetailerContext, getRetailerContext, RetailerContextError } from '@/lib/auth';
import { prisma } from '@ironscout/db';
import { z } from 'zod';
import { logger } from '@/lib/logger';

// Force dynamic rendering - this route uses cookies for auth
export const dynamic = 'force-dynamic';

const createCorrectionSchema = z.object({
  quarantinedRecordId: z.string(),
  field: z.string().min(1),
  newValue: z.string(),
  retailerId: z.string().optional(), // Optional: for multi-retailer merchants
});

/**
 * GET /api/feed/corrections
 * List corrections for the retailer's feed
 */
export async function GET(request: Request) {
  const reqLogger = logger.child({ endpoint: '/api/feed/corrections', method: 'GET' });

  try {
    const session = await getSession();

    if (!session || session.type !== 'merchant') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Resolve retailer context from query param (use getRetailerContext to allow empty result)
    const { searchParams } = new URL(request.url);
    const inputRetailerId = searchParams.get('retailerId') || undefined;
    const retailerContext = await getRetailerContext(session, inputRetailerId);

    if (!retailerContext) {
      return NextResponse.json({ corrections: [], retailerContext: null });
    }

    const { retailerId } = retailerContext;

    const quarantinedRecordId = searchParams.get('quarantinedRecordId');
    const feedId = searchParams.get('feedId');

    // Get merchant's feed if not specified
    let targetFeedId: string | null = feedId;
    if (!targetFeedId) {
      const feed = await prisma.retailer_feeds.findFirst({
        where: { retailerId },
      });
      targetFeedId = feed?.id ?? null;
    }

    if (!targetFeedId) {
      return NextResponse.json({ corrections: [] });
    }

    const where: { retailerId: string; feedId: string; quarantinedRecordId?: string } = {
      retailerId,
      feedId: targetFeedId,
    };

    if (quarantinedRecordId) {
      where.quarantinedRecordId = quarantinedRecordId;
    }

    const corrections = await prisma.feed_corrections.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        quarantined_records: {
          select: {
            id: true,
            matchKey: true,
            parsedFields: true,
          },
        },
      },
    });

    return NextResponse.json({ corrections, retailerContext });
  } catch (error) {
    if (error instanceof RetailerContextError) {
      reqLogger.warn('Retailer context error', { code: error.code, message: error.message });
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    reqLogger.error('Failed to fetch corrections', {}, error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}

/**
 * POST /api/feed/corrections
 * Create a new correction for a quarantined record
 */
export async function POST(request: Request) {
  const reqLogger = logger.child({ endpoint: '/api/feed/corrections', method: 'POST' });

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

    const validation = createCorrectionSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0]?.message || 'Invalid data' },
        { status: 400 }
      );
    }

    const { quarantinedRecordId, field, newValue, retailerId: inputRetailerId } = validation.data;

    // Resolve retailer context (supports multi-retailer merchants)
    const retailerContext = await requireRetailerContext(session, inputRetailerId);
    const { retailerId } = retailerContext;

    // Get the quarantined record and verify ownership
    const quarantinedRecord = await prisma.quarantined_records.findFirst({
      where: {
        id: quarantinedRecordId,
        retailerId,
      },
      include: {
        retailer_feeds: true,
      },
    });

    if (!quarantinedRecord) {
      return NextResponse.json({ error: 'Quarantined record not found' }, { status: 404 });
    }

    // Get old value from parsed fields
    const parsedFields = quarantinedRecord.parsedFields as Record<string, unknown> | null;
    const oldValue = parsedFields?.[field] !== undefined
      ? String(parsedFields[field])
      : null;

    // Create the correction
    const correction = await prisma.feed_corrections.create({
      data: {
        retailerId,
        feedId: quarantinedRecord.feedId,
        quarantinedRecordId,
        recordRef: quarantinedRecord.matchKey,
        field,
        oldValue,
        newValue,
        createdBy: session.merchantUserId || session.merchantId,
      },
    });

    reqLogger.info('Correction created', {
      correctionId: correction.id,
      quarantinedRecordId,
      field,
    });

    return NextResponse.json({ correction, retailerContext });
  } catch (error) {
    if (error instanceof RetailerContextError) {
      reqLogger.warn('Retailer context error', { code: error.code, message: error.message });
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    reqLogger.error('Failed to create correction', {}, error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
