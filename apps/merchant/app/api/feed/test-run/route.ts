import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@ironscout/db';
import type { FeedFormatType } from '@ironscout/db';
import { logger } from '@/lib/logger';

// Force dynamic rendering - this route uses cookies for auth
export const dynamic = 'force-dynamic';

/**
 * POST /api/feed/test-run
 * Run a dry-run test of the feed without persisting data
 * Samples first 50 records and reports what would happen
 */
export async function POST(request: Request) {
  const reqLogger = logger.child({ endpoint: '/api/feed/test-run', method: 'POST' });

  try {
    const session = await getSession();

    if (!session || session.type !== 'merchant') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get merchant's feed
    const feed = await prisma.retailer_feeds.findFirst({
      where: { retailerId: session.merchantId },
    });

    if (!feed) {
      return NextResponse.json({ error: 'Feed not found' }, { status: 404 });
    }

    if (!feed.url && feed.accessType !== 'UPLOAD') {
      return NextResponse.json({ error: 'Feed URL is required' }, { status: 400 });
    }

    const startTime = Date.now();

    // Fetch feed content
    let content: string;
    try {
      const headers: Record<string, string> = {};

      if (feed.accessType === 'AUTH_URL' && feed.username && feed.password) {
        const auth = Buffer.from(`${feed.username}:${feed.password}`).toString('base64');
        headers['Authorization'] = `Basic ${auth}`;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(feed.url!, {
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return NextResponse.json(
          { error: `Feed fetch failed: ${response.status} ${response.statusText}` },
          { status: 400 }
        );
      }

      content = await response.text();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return NextResponse.json({ error: 'Feed fetch timed out' }, { status: 400 });
      }
      return NextResponse.json(
        { error: `Feed fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}` },
        { status: 400 }
      );
    }

    // Import connectors dynamically to avoid bundling issues
    const { getConnector, detectConnector } = await import('@/lib/feed-connectors');

    // Get the appropriate connector
    const connector =
      feed.formatType === 'GENERIC'
        ? detectConnector(content)
        : getConnector(feed.formatType as FeedFormatType);

    // Parse feed (sample first 50 records)
    const parseResult = await connector.parse(content);

    // Take only first 50 for analysis
    const sampleSize = Math.min(50, parseResult.parsedRecords.length);
    const sampleRecords = parseResult.parsedRecords.slice(0, sampleSize);

    // Analyze sample
    let wouldIndex = 0;
    let wouldQuarantine = 0;
    let wouldReject = 0;
    const errorSamples: Array<{
      rowIndex: number;
      title: string;
      errors: Array<{ field: string; code: string; message: string }>;
    }> = [];
    const coercionSummary: Record<string, number> = {};

    for (const result of sampleRecords) {
      if (result.isIndexable) {
        wouldIndex++;
      } else if (result.record.title && result.record.price > 0) {
        wouldQuarantine++;
      } else {
        wouldReject++;
      }

      // Track error samples (first 10)
      if (result.errors.length > 0 && errorSamples.length < 10) {
        errorSamples.push({
          rowIndex: result.record.rowIndex,
          title: result.record.title || 'Unknown',
          errors: result.errors.map((e) => ({
            field: e.field,
            code: e.code,
            message: e.message,
          })),
        });
      }

      // Track coercion types
      for (const coercion of result.coercions) {
        const key = `${coercion.field}:${coercion.coercionType}`;
        coercionSummary[key] = (coercionSummary[key] || 0) + 1;
      }
    }

    // Determine status
    const indexableRatio = wouldIndex / sampleSize;
    let status: 'PASS' | 'WARN' | 'FAIL';
    if (indexableRatio >= 0.9) {
      status = 'PASS';
    } else if (indexableRatio >= 0.5) {
      status = 'WARN';
    } else {
      status = 'FAIL';
    }

    // Save test run result
    const testRun = await prisma.retailer_feed_test_runs.create({
      data: {
        retailerId: session.merchantId,
        feedId: feed.id,
        sampleSize,
        status,
        recordsParsed: parseResult.totalRows,
        wouldIndex,
        wouldQuarantine,
        wouldReject,
        warningCount: Object.keys(parseResult.errorCodes).length,
        errorCount: wouldReject,
        primaryErrorCode: Object.entries(parseResult.errorCodes).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
        errorSamples: errorSamples.length > 0 ? errorSamples : undefined,
        coercionSummary: Object.keys(coercionSummary).length > 0 ? coercionSummary : undefined,
        duration: Date.now() - startTime,
        completedAt: new Date(),
      },
    });

    reqLogger.info('Test run completed', {
      testRunId: testRun.id,
      status,
      wouldIndex,
      wouldQuarantine,
      wouldReject,
    });

    return NextResponse.json({
      success: true,
      testRun: {
        id: testRun.id,
        status,
        sampleSize,
        totalRows: parseResult.totalRows,
        wouldIndex,
        wouldQuarantine,
        wouldReject,
        indexableRatio: Math.round(indexableRatio * 100),
        errorSamples,
        coercionSummary,
        connectorUsed: connector.name,
        duration: Date.now() - startTime,
      },
    });
  } catch (error) {
    reqLogger.error('Test run failed', {}, error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}

/**
 * GET /api/feed/test-run
 * Get recent test runs
 */
export async function GET(request: Request) {
  const reqLogger = logger.child({ endpoint: '/api/feed/test-run', method: 'GET' });

  try {
    const session = await getSession();

    if (!session || session.type !== 'merchant') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const testRuns = await prisma.retailer_feed_test_runs.findMany({
      where: { retailerId: session.merchantId },
      orderBy: { startedAt: 'desc' },
      take: 10,
    });

    return NextResponse.json({ testRuns });
  } catch (error) {
    reqLogger.error('Failed to fetch test runs', {}, error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
