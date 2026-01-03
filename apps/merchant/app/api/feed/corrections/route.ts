import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@ironscout/db';
import { z } from 'zod';
import { logger } from '@/lib/logger';

// Force dynamic rendering - this route uses cookies for auth
export const dynamic = 'force-dynamic';

const createCorrectionSchema = z.object({
  quarantinedRecordId: z.string(),
  field: z.string().min(1),
  newValue: z.string(),
});

/**
 * GET /api/feed/corrections
 * List corrections for the merchant's feed
 */
export async function GET(request: Request) {
  const reqLogger = logger.child({ endpoint: '/api/feed/corrections', method: 'GET' });

  try {
    const session = await getSession();

    if (!session || session.type !== 'merchant') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Look up retailerId via merchant_retailers
    const merchantRetailer = await prisma.merchant_retailers.findFirst({
      where: { merchantId: session.merchantId },
      select: { retailerId: true }
    });

    if (!merchantRetailer?.retailerId) {
      return NextResponse.json({ corrections: [] });
    }

    const retailerId = merchantRetailer.retailerId;

    const { searchParams } = new URL(request.url);
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

    return NextResponse.json({ corrections });
  } catch (error) {
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

    // Look up retailerId via merchant_retailers
    const merchantRetailer = await prisma.merchant_retailers.findFirst({
      where: { merchantId: session.merchantId },
      select: { retailerId: true }
    });

    if (!merchantRetailer?.retailerId) {
      return NextResponse.json({ error: 'No retailer configured for this merchant' }, { status: 400 });
    }

    const retailerId = merchantRetailer.retailerId;

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

    const { quarantinedRecordId, field, newValue } = validation.data;

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

    return NextResponse.json({ correction });
  } catch (error) {
    reqLogger.error('Failed to create correction', {}, error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
