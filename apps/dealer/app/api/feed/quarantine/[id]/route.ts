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

    if (!session || session.type !== 'dealer') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const record = await prisma.quarantinedRecord.findFirst({
      where: {
        id,
        dealerId: session.dealerId,
      },
      include: {
        corrections: {
          orderBy: { createdAt: 'desc' },
        },
        feed: {
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

    if (!session || session.type !== 'dealer') {
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

    // Verify ownership
    const existing = await prisma.quarantinedRecord.findFirst({
      where: {
        id,
        dealerId: session.dealerId,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }

    const { status } = validation.data;

    if (status) {
      const record = await prisma.quarantinedRecord.update({
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
