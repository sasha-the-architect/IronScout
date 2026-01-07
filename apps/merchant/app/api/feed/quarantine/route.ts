import { NextResponse } from 'next/server';
import { getSession, requireRetailerContext, RetailerContextError } from '@/lib/auth';
import { prisma } from '@ironscout/db';
import { z } from 'zod';
import { logger } from '@/lib/logger';

// Force dynamic rendering - this route uses cookies for auth
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  retailerId: z.string().optional(), // Optional: for multi-retailer merchants
  status: z.enum(['QUARANTINED', 'RESOLVED', 'DISMISSED']).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
});

/**
 * GET /api/feed/quarantine
 * List quarantined records for the retailer's feed
 */
export async function GET(request: Request) {
  const reqLogger = logger.child({ endpoint: '/api/feed/quarantine', method: 'GET' });

  try {
    const session = await getSession();

    if (!session || session.type !== 'merchant') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const queryResult = querySchema.safeParse(Object.fromEntries(searchParams));

    if (!queryResult.success) {
      return NextResponse.json({ error: 'Invalid query parameters' }, { status: 400 });
    }

    const { retailerId: inputRetailerId, status, page, limit, search } = queryResult.data;
    const offset = (page - 1) * limit;

    // Resolve retailer context (supports multi-retailer merchants)
    const retailerContext = await requireRetailerContext(session, inputRetailerId);
    const { retailerId } = retailerContext;

    // Get retailer's feed
    const feed = await prisma.retailer_feeds.findFirst({
      where: { retailerId },
    });

    if (!feed) {
      return NextResponse.json({ records: [], total: 0, page, limit, retailerContext });
    }

    // Build where clause
    const where: {
      feedId: string;
      status?: 'QUARANTINED' | 'RESOLVED' | 'DISMISSED';
      OR?: Array<{
        matchKey?: { contains: string };
        parsedFields?: { path: string[]; string_contains: string };
      }>;
    } = {
      feedId: feed.id,
    };

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { matchKey: { contains: search } },
        { parsedFields: { path: ['title'], string_contains: search } },
      ];
    }

    // Fetch records with pagination
    const [records, total] = await Promise.all([
      prisma.quarantined_records.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        include: {
          feed_corrections: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
      }),
      prisma.quarantined_records.count({ where }),
    ]);

    // Get status counts
    const statusCounts = await prisma.quarantined_records.groupBy({
      by: ['status'],
      where: { feedId: feed.id },
      _count: true,
    });

    const counts = {
      QUARANTINED: 0,
      RESOLVED: 0,
      DISMISSED: 0,
    };
    for (const item of statusCounts) {
      counts[item.status] = item._count;
    }

    return NextResponse.json({
      records,
      total,
      page,
      limit,
      counts,
      retailerContext,
    });
  } catch (error) {
    if (error instanceof RetailerContextError) {
      reqLogger.warn('Retailer context error', { code: error.code, message: error.message });
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    reqLogger.error('Failed to fetch quarantine records', {}, error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
