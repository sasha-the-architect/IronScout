import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@ironscout/db';
import { z } from 'zod';
import { logger } from '@/lib/logger';

// Force dynamic rendering - this route uses cookies for auth
export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  status: z.enum(['RESOLVED', 'DISMISSED']).optional(),
});

/**
 * GET /api/feed/quarantine/[id]
 * Get a single quarantined record with full details
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const reqLogger = logger.child({ endpoint: `/api/feed/quarantine/${id}`, method: 'GET' });

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

    const record = await prisma.quarantined_records.findFirst({
      where: {
        id,
        retailerId: merchantRetailer.retailerId,
      },
      include: {
        feed_corrections: {
          orderBy: { createdAt: 'desc' },
        },
        retailer_feeds: {
          select: {
            name: true,
            formatType: true,
          },
        },
      },
    });

    if (!record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }

    return NextResponse.json({ record });
  } catch (error) {
    reqLogger.error('Failed to fetch quarantine record', {}, error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}

/**
 * PATCH /api/feed/quarantine/[id]
 * Update quarantine status (dismiss or resolve)
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const reqLogger = logger.child({ endpoint: `/api/feed/quarantine/${id}`, method: 'PATCH' });

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

    const validation = updateSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid update data' }, { status: 400 });
    }

    // Look up retailerId via merchant_retailers
    const merchantRetailer = await prisma.merchant_retailers.findFirst({
      where: { merchantId: session.merchantId },
      select: { retailerId: true }
    });

    if (!merchantRetailer?.retailerId) {
      return NextResponse.json({ error: 'No retailer configured for this merchant' }, { status: 400 });
    }

    // Verify ownership
    const existing = await prisma.quarantined_records.findFirst({
      where: {
        id,
        retailerId: merchantRetailer.retailerId,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }

    const { status } = validation.data;

    if (status) {
      const record = await prisma.quarantined_records.update({
        where: { id },
        data: { status },
      });

      reqLogger.info('Quarantine status updated', { recordId: id, status });
      return NextResponse.json({ record });
    }

    return NextResponse.json({ record: existing });
  } catch (error) {
    reqLogger.error('Failed to update quarantine record', {}, error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
