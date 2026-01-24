'use server';

/**
 * Quarantine Bulk Actions
 *
 * Server actions for bulk operations on quarantined records.
 * Used when logic/matcher/resolver updates require bulk reprocessing.
 */

import { prisma } from '@ironscout/db';
import { revalidatePath } from 'next/cache';
import { getAdminSession, logAdminAction } from '@/lib/auth';
import { loggers } from '@/lib/logger';
import { enqueueQuarantineReprocess, enqueueProductResolve } from '@/lib/queue';

const log = loggers.admin;

// =============================================================================
// Bulk Reprocess
// =============================================================================

export interface BulkReprocessOptions {
  feedType?: 'RETAILER' | 'AFFILIATE';
  limit?: number; // Safety limit, default 1000
}

export interface BulkReprocessResult {
  success: boolean;
  error?: string;
  processed?: number;
  message?: string;
}

/**
 * Reprocess all quarantined records matching the filter.
 *
 * Enqueues records to the quarantine-reprocess queue for the harvester to process.
 * The harvester will:
 * - Validate records against current rules
 * - Create source_products and prices for valid records
 * - Enqueue for product resolver
 * - Update quarantine status to RESOLVED or keep QUARANTINED
 *
 * For safety:
 * - Requires admin session
 * - Has a configurable limit (default 1000)
 * - Logs all bulk operations
 * - Only affects QUARANTINED status records
 */
export async function reprocessAllQuarantined(
  options: BulkReprocessOptions = {}
): Promise<BulkReprocessResult> {
  const session = await getAdminSession();
  if (!session) {
    log.warn('Unauthorized bulk quarantine action attempted', { action: 'reprocess-all' });
    return { success: false, error: 'Unauthorized' };
  }

  const { feedType, limit = 1000 } = options;

  try {
    // Build where clause
    const where: {
      status: 'QUARANTINED';
      feedType?: 'RETAILER' | 'AFFILIATE';
    } = {
      status: 'QUARANTINED',
    };

    if (feedType) {
      where.feedType = feedType;
    }

    // Count total matching records
    const totalCount = await prisma.quarantined_records.count({ where });

    if (totalCount === 0) {
      log.info('Bulk reprocess: no records to process', {
        feedType: feedType || 'ALL',
        actor: session.email,
      });
      return {
        success: true,
        processed: 0,
        message: 'No quarantined records found matching the criteria.',
      };
    }

    // Get records to process (respecting limit)
    const records = await prisma.quarantined_records.findMany({
      where,
      select: { id: true, feedId: true, feedType: true },
      take: limit,
      orderBy: { createdAt: 'asc' }, // Oldest first
    });

    const affectedFeedIds = [...new Set(records.map((r) => r.feedId))];

    // Enqueue records for reprocessing via BullMQ
    const recordsToEnqueue = records.map((r) => ({
      id: r.id,
      feedType: r.feedType as 'AFFILIATE' | 'RETAILER',
    }));

    const { batchId, enqueuedCount } = await enqueueQuarantineReprocess(
      recordsToEnqueue,
      session.email
    );

    // Log the bulk action
    await logAdminAction(session.userId, 'QUARANTINE_BULK_REPROCESS', {
      resource: 'quarantined_records',
      resourceId: 'bulk',
      newValue: {
        feedType: feedType || 'ALL',
        requestedCount: records.length,
        enqueuedCount,
        batchId,
        affectedFeedIds,
        limitApplied: totalCount > limit,
        totalAvailable: totalCount,
      },
    });

    log.info('Bulk reprocess enqueued', {
      feedType: feedType || 'ALL',
      requestedCount: records.length,
      enqueuedCount,
      batchId,
      affectedFeedIds,
      limitApplied: totalCount > limit,
      totalAvailable: totalCount,
      actor: session.email,
    });

    revalidatePath('/quarantine');

    const limitMessage = totalCount > limit
      ? ` (limited to ${limit}, ${totalCount - limit} remaining)`
      : '';

    return {
      success: true,
      processed: enqueuedCount,
      message: `Enqueued ${enqueuedCount} records for reprocessing${limitMessage}. Check harvester logs for progress.`,
    };
  } catch (error) {
    log.error('Failed to bulk reprocess quarantine', { feedType }, error);

    await logAdminAction(session.userId, 'QUARANTINE_BULK_REPROCESS_FAILED', {
      resource: 'quarantined_records',
      resourceId: 'bulk',
      newValue: {
        feedType: feedType || 'ALL',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });

    return { success: false, error: 'Failed to reprocess records' };
  }
}

// =============================================================================
// Bulk Dismiss
// =============================================================================

export interface BulkDismissOptions {
  feedType?: 'RETAILER' | 'AFFILIATE';
  reasonCode?: string; // Filter by specific error code
  note: string;
  limit?: number;
}

export interface BulkDismissResult {
  success: boolean;
  error?: string;
  dismissed?: number;
  message?: string;
}

/**
 * Dismiss all quarantined records matching the filter.
 *
 * Use this for known issues that won't be fixed (e.g., discontinued products,
 * invalid data from feed that won't be corrected).
 */
export async function dismissAllQuarantined(
  options: BulkDismissOptions
): Promise<BulkDismissResult> {
  const session = await getAdminSession();
  if (!session) {
    log.warn('Unauthorized bulk quarantine action attempted', { action: 'dismiss-all' });
    return { success: false, error: 'Unauthorized' };
  }

  const { feedType, reasonCode, note, limit = 500 } = options;

  if (!note || note.trim().length < 10) {
    return { success: false, error: 'Note is required (minimum 10 characters for bulk dismiss)' };
  }

  try {
    // Build where clause
    const where: {
      status: 'QUARANTINED';
      feedType?: 'RETAILER' | 'AFFILIATE';
    } = {
      status: 'QUARANTINED',
    };

    if (feedType) {
      where.feedType = feedType;
    }

    // If reasonCode filter, we need to filter in application layer
    // since blockingErrors is JSON
    let recordIds: string[];

    if (reasonCode) {
      const records = await prisma.quarantined_records.findMany({
        where,
        select: { id: true, blockingErrors: true },
        take: limit * 2, // Get more to account for filtering
      });

      recordIds = records
        .filter((r) => {
          const errors = r.blockingErrors as Array<{ code: string }>;
          return errors?.some((e) => e.code === reasonCode);
        })
        .slice(0, limit)
        .map((r) => r.id);
    } else {
      const records = await prisma.quarantined_records.findMany({
        where,
        select: { id: true },
        take: limit,
        orderBy: { createdAt: 'asc' },
      });
      recordIds = records.map((r) => r.id);
    }

    if (recordIds.length === 0) {
      return {
        success: true,
        dismissed: 0,
        message: 'No quarantined records found matching the criteria.',
      };
    }

    // Update records to DISMISSED
    const updated = await prisma.quarantined_records.updateMany({
      where: {
        id: { in: recordIds },
        status: 'QUARANTINED',
      },
      data: {
        status: 'DISMISSED',
      },
    });

    await logAdminAction(session.userId, 'QUARANTINE_BULK_DISMISS', {
      resource: 'quarantined_records',
      resourceId: 'bulk',
      newValue: {
        feedType: feedType || 'ALL',
        reasonCode: reasonCode || 'ALL',
        note: note.trim(),
        count: updated.count,
      },
    });

    log.info('Bulk dismiss completed', {
      feedType: feedType || 'ALL',
      reasonCode: reasonCode || 'ALL',
      count: updated.count,
      actor: session.email,
    });

    revalidatePath('/quarantine');

    return {
      success: true,
      dismissed: updated.count,
      message: `Dismissed ${updated.count} records.`,
    };
  } catch (error) {
    log.error('Failed to bulk dismiss quarantine', { feedType, reasonCode }, error);
    return { success: false, error: 'Failed to dismiss records' };
  }
}

// =============================================================================
// Get Counts for UI
// =============================================================================

export interface QuarantineCounts {
  total: number;
  byFeedType: {
    RETAILER: number;
    AFFILIATE: number;
  };
  byReasonCode: Record<string, number>;
}

/**
 * Get counts for bulk action UI
 */
export async function getQuarantineCounts(): Promise<QuarantineCounts> {
  const [total, retailer, affiliate, records] = await Promise.all([
    prisma.quarantined_records.count({ where: { status: 'QUARANTINED' } }),
    prisma.quarantined_records.count({ where: { status: 'QUARANTINED', feedType: 'RETAILER' } }),
    prisma.quarantined_records.count({ where: { status: 'QUARANTINED', feedType: 'AFFILIATE' } }),
    // Get sample for reason code distribution (limit for performance)
    prisma.quarantined_records.findMany({
      where: { status: 'QUARANTINED' },
      select: { blockingErrors: true },
      take: 1000,
    }),
  ]);

  // Count by reason code
  const byReasonCode: Record<string, number> = {};
  for (const record of records) {
    const errors = record.blockingErrors as Array<{ code: string }>;
    if (errors?.[0]?.code) {
      byReasonCode[errors[0].code] = (byReasonCode[errors[0].code] || 0) + 1;
    }
  }

  return {
    total,
    byFeedType: {
      RETAILER: retailer,
      AFFILIATE: affiliate,
    },
    byReasonCode,
  };
}

// =============================================================================
// NEEDS_REVIEW Reprocessing (Product Links)
// =============================================================================

// Current resolver version - should match harvester's RESOLVER_VERSION
const RESOLVER_VERSION = 'v1.2';

export interface NeedsReviewReprocessOptions {
  limit?: number; // Safety limit, default 500
}

export interface NeedsReviewReprocessResult {
  success: boolean;
  error?: string;
  processed?: number;
  message?: string;
}

/** Statuses that can be reprocessed */
const REPROCESSABLE_STATUSES = ['NEEDS_REVIEW', 'UNMATCHED'] as const;

/**
 * Reprocess all product_links with NEEDS_REVIEW or UNMATCHED status.
 *
 * Enqueues the associated source_products to the product-resolve queue
 * for re-resolution. Use this after matcher/resolver logic updates.
 *
 * For safety:
 * - Requires admin session
 * - Has a configurable limit (default 500)
 * - Logs all bulk operations
 */
export async function reprocessAllNeedsReview(
  options: NeedsReviewReprocessOptions = {}
): Promise<NeedsReviewReprocessResult> {
  const session = await getAdminSession();
  if (!session) {
    log.warn('Unauthorized NEEDS_REVIEW reprocess action attempted');
    return { success: false, error: 'Unauthorized' };
  }

  const { limit = 500 } = options;

  try {
    // Count total reprocessable links
    const totalCount = await prisma.product_links.count({
      where: { status: { in: [...REPROCESSABLE_STATUSES] } },
    });

    if (totalCount === 0) {
      log.info('NEEDS_REVIEW reprocess: no records to process', {
        actor: session.email,
      });
      return {
        success: true,
        processed: 0,
        message: 'No NEEDS_REVIEW or UNMATCHED product links found.',
      };
    }

    // Get product_links with reprocessable status and their source_products
    const links = await prisma.product_links.findMany({
      where: { status: { in: [...REPROCESSABLE_STATUSES] } },
      select: {
        id: true,
        sourceProductId: true,
        source_products: {
          select: {
            id: true,
            sourceId: true,
            identityKey: true,
          },
        },
      },
      take: limit,
      orderBy: { createdAt: 'asc' }, // Oldest first
    });

    // Note: We don't change the status here - the resolver will handle it.
    // When a source_product is re-resolved, the resolver will update/replace the product_link.

    // Extract unique source products (identityKey is optional - resolver doesn't require it)
    const sourceProductsMap = new Map<string, { id: string; sourceId: string; identityKey: string }>();
    for (const link of links) {
      if (link.source_products) {
        sourceProductsMap.set(link.source_products.id, {
          id: link.source_products.id,
          sourceId: link.source_products.sourceId,
          identityKey: link.source_products.identityKey || '',
        });
      }
    }
    const sourceProducts = Array.from(sourceProductsMap.values());

    // Enqueue for resolution
    const { batchId, enqueuedCount } = await enqueueProductResolve(
      sourceProducts,
      session.email,
      RESOLVER_VERSION
    );

    // Log the bulk action
    await logAdminAction(session.userId, 'NEEDS_REVIEW_BULK_REPROCESS', {
      resource: 'product_links',
      resourceId: 'bulk',
      newValue: {
        linksCount: links.length,
        sourceProductsCount: sourceProducts.length,
        enqueuedCount,
        batchId,
        limitApplied: totalCount > limit,
        totalAvailable: totalCount,
      },
    });

    log.info('NEEDS_REVIEW bulk reprocess enqueued', {
      linksCount: links.length,
      sourceProductsCount: sourceProducts.length,
      enqueuedCount,
      batchId,
      limitApplied: totalCount > limit,
      totalAvailable: totalCount,
      actor: session.email,
    });

    revalidatePath('/quarantine');

    const limitMessage = totalCount > limit
      ? ` (limited to ${limit}, ${totalCount - limit} remaining)`
      : '';

    return {
      success: true,
      processed: enqueuedCount,
      message: `Enqueued ${enqueuedCount} source products for re-resolution from ${links.length} NEEDS_REVIEW links${limitMessage}. Check harvester logs for progress.`,
    };
  } catch (error) {
    log.error('Failed to bulk reprocess NEEDS_REVIEW', {}, error);

    await logAdminAction(session.userId, 'NEEDS_REVIEW_BULK_REPROCESS_FAILED', {
      resource: 'product_links',
      resourceId: 'bulk',
      newValue: {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });

    return { success: false, error: 'Failed to reprocess NEEDS_REVIEW items' };
  }
}

/**
 * Get count of reprocessable items (NEEDS_REVIEW + UNMATCHED) for UI
 */
export async function getNeedsReviewCount(): Promise<number> {
  return prisma.product_links.count({
    where: { status: { in: [...REPROCESSABLE_STATUSES] } },
  });
}
