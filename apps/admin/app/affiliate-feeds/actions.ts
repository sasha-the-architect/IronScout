'use server';

import { prisma } from '@ironscout/db';
import { revalidatePath } from 'next/cache';
import { getAdminSession, logAdminAction } from '@/lib/auth';
import { loggers } from '@/lib/logger';
import {
  validateExpiryHours,
  validateScheduleFrequencyHours,
  validateTransportAsync,
  validatePort,
  validateHost,
  validatePath,
  validateNetwork,
  validateFormat,
  validateCompression,
  validateMaxFileSizeBytes,
  validateMaxRowCount,
  ValidationError,
} from '@/lib/affiliate-feed-validation';
import { encryptSecret, decryptSecret } from '@ironscout/crypto';

// =============================================================================
// Types
// =============================================================================

export interface CreateFeedInput {
  sourceId: string;
  network: 'IMPACT';
  transport: 'FTP' | 'SFTP';
  host: string;
  port?: number | null;
  path: string;
  username: string;
  password: string;
  format?: 'CSV'; // v1 only supports CSV
  compression?: 'NONE' | 'GZIP';
  scheduleFrequencyHours?: number | null;
  expiryHours?: number;
  maxFileSizeBytes?: bigint | null;
  maxRowCount?: number | null;
}

export interface UpdateFeedInput {
  host?: string;
  port?: number | null;
  path?: string;
  username?: string;
  password?: string; // Only set if changing
  format?: 'CSV'; // v1 only supports CSV
  compression?: 'NONE' | 'GZIP';
  scheduleFrequencyHours?: number | null;
  expiryHours?: number;
  maxFileSizeBytes?: bigint | null;
  maxRowCount?: number | null;
}

// =============================================================================
// CRUD Operations
// =============================================================================

export async function createAffiliateFeed(data: CreateFeedInput) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Validate inputs
    validateNetwork(data.network);
    await validateTransportAsync(data.transport);
    validateHost(data.host);
    validatePort(data.port ?? null, data.transport);
    validatePath(data.path);
    validateFormat(data.format ?? 'CSV');
    validateCompression(data.compression ?? 'NONE');
    validateExpiryHours(data.expiryHours ?? 48);
    validateScheduleFrequencyHours(data.scheduleFrequencyHours ?? null);
    if (data.maxFileSizeBytes !== undefined) {
      validateMaxFileSizeBytes(data.maxFileSizeBytes);
    }
    if (data.maxRowCount !== undefined) {
      validateMaxRowCount(data.maxRowCount);
    }

    // Verify source exists and doesn't already have a feed
    const source = await prisma.sources.findUnique({
      where: { id: data.sourceId },
      include: { affiliate_feeds: true },
    });

    if (!source) {
      return { success: false, error: 'Source not found' };
    }

    if (source.affiliate_feeds) {
      return { success: false, error: 'Source already has an affiliate feed configured' };
    }

    // Encrypt the password - convert Buffer to Uint8Array for Prisma Bytes type
    const encryptedBuffer = encryptSecret(data.password);
    const secretCiphertext = new Uint8Array(encryptedBuffer) as Uint8Array<ArrayBuffer>;

    // Create the feed
    const feed = await prisma.affiliate_feeds.create({
      data: {
        sourceId: data.sourceId,
        network: data.network,
        status: 'DRAFT',
        transport: data.transport,
        host: data.host,
        port: data.port ?? (data.transport === 'SFTP' ? 22 : 21),
        path: data.path,
        username: data.username,
        secretCiphertext,
        // secretKeyId left null - for future KMS migration
        secretVersion: 1,
        format: data.format ?? 'CSV',
        compression: data.compression ?? 'NONE',
        scheduleFrequencyHours: data.scheduleFrequencyHours,
        expiryHours: data.expiryHours ?? 48,
        maxFileSizeBytes: data.maxFileSizeBytes,
        maxRowCount: data.maxRowCount,
        createdBy: session.email,
      },
    });

    // Update source to mark as affiliate feed
    await prisma.sources.update({
      where: { id: data.sourceId },
      data: {
        sourceKind: 'AFFILIATE_FEED',
        affiliateNetwork: data.network,
      },
    });

    await logAdminAction(session.userId, 'CREATE_AFFILIATE_FEED', {
      resource: 'AffiliateFeed',
      resourceId: feed.id,
      newValue: {
        sourceId: data.sourceId,
        network: data.network,
        host: data.host,
        path: data.path,
      },
    });

    revalidatePath('/affiliate-feeds');

    return { success: true, feed };
  } catch (error) {
    if (error instanceof ValidationError) {
      return { success: false, error: error.message };
    }
    loggers.feeds.error('Failed to create affiliate feed', {}, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to create affiliate feed' };
  }
}

export async function updateAffiliateFeed(id: string, data: UpdateFeedInput) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const oldFeed = await prisma.affiliate_feeds.findUnique({
      where: { id },
    });

    if (!oldFeed) {
      return { success: false, error: 'Feed not found' };
    }

    // Validate inputs
    if (data.host !== undefined) validateHost(data.host);
    if (data.port !== undefined) validatePort(data.port, oldFeed.transport);
    if (data.path !== undefined) validatePath(data.path);
    if (data.format !== undefined) validateFormat(data.format);
    if (data.compression !== undefined) validateCompression(data.compression);
    if (data.expiryHours !== undefined) validateExpiryHours(data.expiryHours);
    if (data.scheduleFrequencyHours !== undefined) {
      validateScheduleFrequencyHours(data.scheduleFrequencyHours);
    }
    if (data.maxFileSizeBytes !== undefined) {
      validateMaxFileSizeBytes(data.maxFileSizeBytes);
    }
    if (data.maxRowCount !== undefined) {
      validateMaxRowCount(data.maxRowCount);
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (data.host !== undefined) updateData.host = data.host;
    if (data.port !== undefined) updateData.port = data.port;
    if (data.path !== undefined) updateData.path = data.path;
    if (data.username !== undefined) updateData.username = data.username;
    if (data.format !== undefined) updateData.format = data.format;
    if (data.compression !== undefined) updateData.compression = data.compression;
    if (data.scheduleFrequencyHours !== undefined) {
      updateData.scheduleFrequencyHours = data.scheduleFrequencyHours;
    }
    if (data.expiryHours !== undefined) updateData.expiryHours = data.expiryHours;
    if (data.maxFileSizeBytes !== undefined) updateData.maxFileSizeBytes = data.maxFileSizeBytes;
    if (data.maxRowCount !== undefined) updateData.maxRowCount = data.maxRowCount;

    // Handle password update
    if (data.password) {
      const encryptedBuffer = encryptSecret(data.password);
      updateData.secretCiphertext = new Uint8Array(encryptedBuffer) as Uint8Array<ArrayBuffer>;
      // secretKeyId left null - for future KMS migration
      updateData.secretVersion = 1;
    }

    const feed = await prisma.affiliate_feeds.update({
      where: { id },
      data: updateData,
    });

    await logAdminAction(session.userId, 'UPDATE_AFFILIATE_FEED', {
      resource: 'AffiliateFeed',
      resourceId: id,
      oldValue: {
        host: oldFeed.host,
        path: oldFeed.path,
        format: oldFeed.format,
        expiryHours: oldFeed.expiryHours,
      },
      newValue: {
        host: data.host,
        path: data.path,
        format: data.format,
        expiryHours: data.expiryHours,
        passwordChanged: !!data.password,
      },
    });

    revalidatePath('/affiliate-feeds');
    revalidatePath(`/affiliate-feeds/${id}`);

    return { success: true, feed };
  } catch (error) {
    if (error instanceof ValidationError) {
      return { success: false, error: error.message };
    }
    loggers.feeds.error('Failed to update affiliate feed', { feedId: id }, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to update affiliate feed' };
  }
}

export async function deleteAffiliateFeed(id: string) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const feed = await prisma.affiliate_feeds.findUnique({
      where: { id },
      include: { sources: true },
    });

    if (!feed) {
      return { success: false, error: 'Feed not found' };
    }

    // Check for active runs
    const activeRun = await prisma.affiliate_feed_runs.findFirst({
      where: { feedId: id, status: 'RUNNING' },
    });

    if (activeRun) {
      return { success: false, error: 'Cannot delete feed with active run. Wait for it to complete.' };
    }

    // Delete the feed (cascade will handle runs, errors, etc.)
    await prisma.affiliate_feeds.delete({
      where: { id },
    });

    // Reset source kind
    await prisma.sources.update({
      where: { id: feed.sourceId },
      data: {
        sourceKind: 'DIRECT',
        affiliateNetwork: null,
      },
    });

    await logAdminAction(session.userId, 'DELETE_AFFILIATE_FEED', {
      resource: 'AffiliateFeed',
      resourceId: id,
      oldValue: {
        sourceId: feed.sourceId,
        network: feed.network,
        host: feed.host,
      },
    });

    revalidatePath('/affiliate-feeds');

    return { success: true };
  } catch (error) {
    loggers.feeds.error('Failed to delete affiliate feed', { feedId: id }, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to delete affiliate feed' };
  }
}

// =============================================================================
// Status Transitions
// =============================================================================

export async function enableFeed(id: string) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const feed = await prisma.affiliate_feeds.findUnique({
      where: { id },
    });

    if (!feed) {
      return { success: false, error: 'Feed not found' };
    }

    if (feed.status === 'ENABLED') {
      return { success: false, error: 'Feed is already enabled' };
    }

    // Validate required fields before enabling
    if (!feed.host || !feed.path || !feed.username || !feed.secretCiphertext) {
      return { success: false, error: 'Feed is missing required connection details' };
    }

    const now = new Date();
    const nextRunAt = feed.scheduleFrequencyHours
      ? new Date(now.getTime() + feed.scheduleFrequencyHours * 3600000)
      : null;

    const updatedFeed = await prisma.affiliate_feeds.update({
      where: { id },
      data: {
        status: 'ENABLED',
        consecutiveFailures: 0,
        nextRunAt,
      },
    });

    await logAdminAction(session.userId, 'ENABLE_AFFILIATE_FEED', {
      resource: 'AffiliateFeed',
      resourceId: id,
      oldValue: { status: feed.status },
      newValue: { status: 'ENABLED' },
    });

    revalidatePath('/affiliate-feeds');
    revalidatePath(`/affiliate-feeds/${id}`);

    return { success: true, feed: updatedFeed };
  } catch (error) {
    loggers.feeds.error('Failed to enable affiliate feed', { feedId: id }, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to enable feed' };
  }
}

export async function pauseFeed(id: string) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const feed = await prisma.affiliate_feeds.findUnique({
      where: { id },
    });

    if (!feed) {
      return { success: false, error: 'Feed not found' };
    }

    if (feed.status !== 'ENABLED') {
      return { success: false, error: 'Can only pause an enabled feed' };
    }

    const updatedFeed = await prisma.affiliate_feeds.update({
      where: { id },
      data: {
        status: 'PAUSED',
        nextRunAt: null,
      },
    });

    await logAdminAction(session.userId, 'PAUSE_AFFILIATE_FEED', {
      resource: 'AffiliateFeed',
      resourceId: id,
      oldValue: { status: 'ENABLED' },
      newValue: { status: 'PAUSED' },
    });

    revalidatePath('/affiliate-feeds');
    revalidatePath(`/affiliate-feeds/${id}`);

    return { success: true, feed: updatedFeed };
  } catch (error) {
    loggers.feeds.error('Failed to pause affiliate feed', { feedId: id }, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to pause feed' };
  }
}

export async function reenableFeed(id: string) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const feed = await prisma.affiliate_feeds.findUnique({
      where: { id },
    });

    if (!feed) {
      return { success: false, error: 'Feed not found' };
    }

    if (feed.status !== 'PAUSED' && feed.status !== 'DISABLED') {
      return { success: false, error: 'Can only re-enable a paused or disabled feed' };
    }

    const now = new Date();
    const nextRunAt = feed.scheduleFrequencyHours
      ? new Date(now.getTime() + feed.scheduleFrequencyHours * 3600000)
      : null;

    const updatedFeed = await prisma.affiliate_feeds.update({
      where: { id },
      data: {
        status: 'ENABLED',
        consecutiveFailures: 0,
        nextRunAt,
      },
    });

    await logAdminAction(session.userId, 'REENABLE_AFFILIATE_FEED', {
      resource: 'AffiliateFeed',
      resourceId: id,
      oldValue: { status: feed.status, consecutiveFailures: feed.consecutiveFailures },
      newValue: { status: 'ENABLED', consecutiveFailures: 0 },
    });

    revalidatePath('/affiliate-feeds');
    revalidatePath(`/affiliate-feeds/${id}`);

    return { success: true, feed: updatedFeed };
  } catch (error) {
    loggers.feeds.error('Failed to re-enable affiliate feed', { feedId: id }, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to re-enable feed' };
  }
}

// =============================================================================
// Manual Operations
// =============================================================================

export async function resetFeedState(feedId: string) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const feed = await prisma.affiliate_feeds.findUnique({
      where: { id: feedId },
    });

    if (!feed) {
      return { success: false, error: 'Feed not found' };
    }

    const now = new Date();

    // Find any stuck RUNNING runs and mark them as CANCELLED
    const stuckRuns = await prisma.affiliate_feed_runs.findMany({
      where: { feedId, status: 'RUNNING' },
      select: { id: true, startedAt: true },
    });

    const cancelledRunIds: string[] = [];
    for (const run of stuckRuns) {
      // Mark as FAILED with admin note (no CANCELLED status in enum)
      await prisma.affiliate_feed_runs.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          finishedAt: now,
          failureKind: 'ADMIN_RESET',
          failureCode: 'MANUALLY_CANCELLED',
          failureMessage: `Manually reset by admin (${session.email})`,
        },
      });
      cancelledRunIds.push(run.id);
    }

    // Reset feed state: clear manualRunPending, consecutiveFailures
    // Also recalculate nextRunAt if the feed is enabled with a schedule
    const nextRunAt =
      feed.status === 'ENABLED' && feed.scheduleFrequencyHours
        ? new Date(now.getTime() + feed.scheduleFrequencyHours * 3600000)
        : null;

    await prisma.affiliate_feeds.update({
      where: { id: feedId },
      data: {
        manualRunPending: false,
        consecutiveFailures: 0,
        nextRunAt,
      },
    });

    await logAdminAction(session.userId, 'RESET_FEED_STATE', {
      resource: 'AffiliateFeed',
      resourceId: feedId,
      oldValue: {
        manualRunPending: feed.manualRunPending,
        consecutiveFailures: feed.consecutiveFailures,
        nextRunAt: feed.nextRunAt,
        stuckRunCount: stuckRuns.length,
      },
      newValue: {
        manualRunPending: false,
        consecutiveFailures: 0,
        nextRunAt,
        cancelledRunIds,
      },
    });

    revalidatePath('/affiliate-feeds');
    revalidatePath(`/affiliate-feeds/${feedId}`);

    const runMsg = cancelledRunIds.length > 0
      ? ` Cancelled ${cancelledRunIds.length} stuck run(s).`
      : '';
    return { success: true, message: `Feed state has been reset.${runMsg}` };
  } catch (error) {
    loggers.feeds.error('Failed to reset feed state', { feedId }, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to reset feed state' };
  }
}

/**
 * Update the next scheduled run time for a feed.
 * This allows fine-tuning feed schedules to space them out.
 * Future runs will be calculated by adding scheduleFrequencyHours to this time.
 */
export async function updateNextRunAt(feedId: string, nextRunAt: Date) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const feed = await prisma.affiliate_feeds.findUnique({
      where: { id: feedId },
    });

    if (!feed) {
      return { success: false, error: 'Feed not found' };
    }

    if (feed.status !== 'ENABLED') {
      return { success: false, error: 'Can only adjust schedule for enabled feeds' };
    }

    // Validate the new time is in the future
    const now = new Date();
    if (nextRunAt <= now) {
      return { success: false, error: 'Next run time must be in the future' };
    }

    // Validate it's not more than 7 days out (reasonable limit)
    const maxFuture = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    if (nextRunAt > maxFuture) {
      return { success: false, error: 'Next run time cannot be more than 7 days in the future' };
    }

    const oldNextRunAt = feed.nextRunAt;

    await prisma.affiliate_feeds.update({
      where: { id: feedId },
      data: { nextRunAt },
    });

    await logAdminAction(session.userId, 'UPDATE_NEXT_RUN_AT', {
      resource: 'AffiliateFeed',
      resourceId: feedId,
      oldValue: { nextRunAt: oldNextRunAt?.toISOString() ?? null },
      newValue: { nextRunAt: nextRunAt.toISOString() },
    });

    revalidatePath('/affiliate-feeds');
    revalidatePath(`/affiliate-feeds/${feedId}`);

    return { success: true };
  } catch (error) {
    loggers.feeds.error('Failed to update next run time', { feedId }, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to update next run time' };
  }
}

export async function forceReprocess(feedId: string) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const feed = await prisma.affiliate_feeds.findUnique({
      where: { id: feedId },
    });

    if (!feed) {
      return { success: false, error: 'Feed not found' };
    }

    // Clear the content hash to force reprocessing on next run
    // Also clear mtime and size to ensure change detection doesn't skip
    const oldHash = feed.lastContentHash?.slice(0, 16);

    await prisma.affiliate_feeds.update({
      where: { id: feedId },
      data: {
        lastContentHash: null,
        lastRemoteMtime: null,
        lastRemoteSize: null,
      },
    });

    await logAdminAction(session.userId, 'FORCE_REPROCESS', {
      resource: 'AffiliateFeed',
      resourceId: feedId,
      oldValue: {
        lastContentHash: oldHash,
        lastRemoteMtime: feed.lastRemoteMtime,
        lastRemoteSize: feed.lastRemoteSize ? Number(feed.lastRemoteSize) : null,
      },
      newValue: {
        lastContentHash: null,
        lastRemoteMtime: null,
        lastRemoteSize: null,
      },
    });

    revalidatePath('/affiliate-feeds');
    revalidatePath(`/affiliate-feeds/${feedId}`);

    return {
      success: true,
      message: 'Content hash cleared. Next run will fully reprocess the feed regardless of file changes.',
    };
  } catch (error) {
    loggers.feeds.error('Failed to force reprocess', { feedId }, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to force reprocess' };
  }
}

export async function triggerManualRun(feedId: string) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const feed = await prisma.affiliate_feeds.findUnique({
      where: { id: feedId },
    });

    if (!feed) {
      return { success: false, error: 'Feed not found' };
    }

    if (feed.status === 'DRAFT') {
      return { success: false, error: 'Cannot run a draft feed. Enable it first.' };
    }

    // Check if a run is already in progress
    const runningRun = await prisma.affiliate_feed_runs.findFirst({
      where: { feedId, status: 'RUNNING' },
      select: { id: true },
    });

    if (runningRun) {
      // Set flag for follow-up run after current completes
      await prisma.affiliate_feeds.update({
        where: { id: feedId },
        data: { manualRunPending: true },
      });

      await logAdminAction(session.userId, 'TRIGGER_MANUAL_RUN', {
        resource: 'AffiliateFeed',
        resourceId: feedId,
        newValue: { manualRunPending: true, reason: 'queued_for_followup' },
      });

      revalidatePath('/affiliate-feeds');
      revalidatePath(`/affiliate-feeds/${feedId}`);

      return {
        success: true,
        message: 'Manual run queued. A run is currently in progress - this will execute after it completes.',
      };
    }

    // No run in progress - directly enqueue the job to BullMQ
    // Import dynamically to avoid issues during build
    const { enqueueAffiliateFeedJob, hasActiveJob } = await import('@/lib/queue');

    // Check if there's already a job in the queue
    const hasJob = await hasActiveJob(feedId);
    if (hasJob) {
      return {
        success: true,
        message: 'A job is already queued for this feed.',
      };
    }

    // Enqueue the job
    const { jobId } = await enqueueAffiliateFeedJob(feedId, 'MANUAL');

    await logAdminAction(session.userId, 'TRIGGER_MANUAL_RUN', {
      resource: 'AffiliateFeed',
      resourceId: feedId,
      newValue: { jobId, enqueued: true },
    });

    revalidatePath('/affiliate-feeds');
    revalidatePath(`/affiliate-feeds/${feedId}`);

    return {
      success: true,
      message: `Manual run started. Job ID: ${jobId}`,
    };
  } catch (error) {
    loggers.feeds.error('Failed to trigger manual run', { feedId }, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to trigger manual run' };
  }
}

export async function approveActivation(runId: string) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const run = await prisma.affiliate_feed_runs.findUnique({
      where: { id: runId },
      include: { affiliate_feeds: true },
    });

    if (!run) {
      return { success: false, error: 'Run not found' };
    }

    if (!run.expiryBlocked) {
      return { success: false, error: 'Run does not require approval' };
    }

    if (run.expiryApprovedAt) {
      return { success: false, error: 'Run has already been approved' };
    }

    // Check for stale run - block approval if a newer successful run exists
    // Per spec Section 8.7: Approving an old run could resurrect products
    // that should have expired (newer run has different seen set)
    const newerRunExists = await prisma.affiliate_feed_runs.count({
      where: {
        feedId: run.feedId,
        status: 'SUCCEEDED',
        startedAt: { gt: run.startedAt }
      }
    }) > 0;

    if (newerRunExists) {
      return {
        success: false,
        error: 'A newer run has completed. This run\'s activation is no longer relevant.'
      };
    }

    // Per spec §8.7: Acquire advisory lock to prevent race with active ingest
    const feedLockId = run.affiliate_feeds.feedLockId;
    const lockResult = await prisma.$queryRaw<[{ acquired: boolean }]>`
      SELECT pg_try_advisory_lock(${feedLockId}::bigint) as acquired
    `;
    const lockAcquired = lockResult[0]?.acquired ?? false;

    if (!lockAcquired) {
      return {
        success: false,
        error: 'Feed is currently being processed. Please try again in a few minutes.'
      };
    }

    try {
      // Mark as approved
      await prisma.affiliate_feed_runs.update({
        where: { id: runId },
        data: {
          expiryApprovedAt: new Date(),
          expiryApprovedBy: session.email,
        },
      });

      // Now perform the promotion (update lastSeenSuccessAt)
      // This is done via raw query for efficiency
      const t0 = new Date();
      await prisma.$executeRaw`
        UPDATE source_product_presence spp
        SET "lastSeenSuccessAt" = ${t0}
        FROM source_product_seen sps
        WHERE sps."runId" = ${runId}
          AND sps."sourceProductId" = spp."sourceProductId"
      `;

      await logAdminAction(session.userId, 'APPROVE_ACTIVATION', {
        resource: 'AffiliateFeedRun',
        resourceId: runId,
        newValue: {
          expiryApprovedBy: session.email,
          promotedAt: t0,
        },
      });

      revalidatePath('/affiliate-feeds');
      revalidatePath(`/affiliate-feeds/${run.feedId}`);

      return { success: true, message: 'Run approved and products promoted' };
    } finally {
      // Always release the lock
      await prisma.$queryRaw`SELECT pg_advisory_unlock(${feedLockId}::bigint)`;
    }
  } catch (error) {
    loggers.feeds.error('Failed to approve activation', { runId }, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to approve activation' };
  }
}

// =============================================================================
// ADR-015: Run Ignore/Unignore Operations
// =============================================================================

/**
 * Ignore a run - prices from this run will be excluded from consumer queries
 * Per ADR-015: Ignored runs are excluded from all user-visible reads
 */
export async function ignoreRun(runId: string, reason: string) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  if (!reason || reason.trim().length < 3) {
    return { success: false, error: 'Reason is required (min 3 characters)' };
  }

  try {
    const run = await prisma.affiliate_feed_runs.findUnique({
      where: { id: runId },
      include: { affiliate_feeds: true },
    });

    if (!run) {
      return { success: false, error: 'Run not found' };
    }

    if (run.ignoredAt) {
      return { success: false, error: 'Run is already ignored' };
    }

    // Mark the run as ignored
    await prisma.affiliate_feed_runs.update({
      where: { id: runId },
      data: {
        ignoredAt: new Date(),
        ignoredBy: session.email,
        ignoredReason: reason.trim(),
      },
    });

    await logAdminAction(session.userId, 'IGNORE_RUN', {
      resource: 'AffiliateFeedRun',
      resourceId: runId,
      newValue: {
        ignoredBy: session.email,
        ignoredReason: reason,
        feedId: run.feedId,
      },
    });

    revalidatePath('/affiliate-feeds');
    revalidatePath(`/affiliate-feeds/${run.feedId}`);

    return { success: true, message: 'Run ignored. Prices from this run are now hidden from consumers.' };
  } catch (error) {
    loggers.feeds.error('Failed to ignore run', { runId }, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to ignore run' };
  }
}

/**
 * Unignore a run - prices from this run will again be visible to consumers
 * Per ADR-015: This should trigger recompute jobs (Phase 2.2)
 */
export async function unignoreRun(runId: string) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const run = await prisma.affiliate_feed_runs.findUnique({
      where: { id: runId },
      include: { affiliate_feeds: true },
    });

    if (!run) {
      return { success: false, error: 'Run not found' };
    }

    if (!run.ignoredAt) {
      return { success: false, error: 'Run is not currently ignored' };
    }

    const oldIgnoreInfo = {
      ignoredAt: run.ignoredAt,
      ignoredBy: run.ignoredBy,
      ignoredReason: run.ignoredReason,
    };

    // Clear the ignore status
    await prisma.affiliate_feed_runs.update({
      where: { id: runId },
      data: {
        ignoredAt: null,
        ignoredBy: null,
        ignoredReason: null,
      },
    });

    await logAdminAction(session.userId, 'UNIGNORE_RUN', {
      resource: 'AffiliateFeedRun',
      resourceId: runId,
      oldValue: oldIgnoreInfo,
      newValue: {
        unignoredBy: session.email,
        feedId: run.feedId,
      },
    });

    revalidatePath('/affiliate-feeds');
    revalidatePath(`/affiliate-feeds/${run.feedId}`);

    return { success: true, message: 'Run un-ignored. Prices from this run are now visible to consumers.' };
  } catch (error) {
    loggers.feeds.error('Failed to unignore run', { runId }, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to unignore run' };
  }
}

// =============================================================================
// Trust Config Operations
// =============================================================================

/**
 * Update trust config for a source
 * Per Spec v1.2: Controls whether UPCs from this source are trusted for canonical matching
 */
export async function updateSourceTrustConfig(sourceId: string, upcTrusted: boolean) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Verify source exists
    const source = await prisma.sources.findUnique({
      where: { id: sourceId },
      select: { id: true, name: true },
    });

    if (!source) {
      return { success: false, error: 'Source not found' };
    }

    // Get existing config to log old value
    const existingConfig = await prisma.source_trust_config.findUnique({
      where: { sourceId },
    });

    const oldValue = {
      upcTrusted: existingConfig?.upcTrusted ?? false,
      version: existingConfig?.version ?? 0,
    };

    // Upsert the trust config - increment version on every change
    const config = await prisma.source_trust_config.upsert({
      where: { sourceId },
      create: {
        sourceId,
        upcTrusted,
        version: 1,
        updatedBy: session.email,
      },
      update: {
        upcTrusted,
        version: { increment: 1 },
        updatedBy: session.email,
      },
    });

    await logAdminAction(session.userId, 'UPDATE_SOURCE_TRUST_CONFIG', {
      resource: 'SourceTrustConfig',
      resourceId: sourceId,
      oldValue,
      newValue: {
        upcTrusted: config.upcTrusted,
        version: config.version,
      },
    });

    revalidatePath('/affiliate-feeds');
    revalidatePath('/retailers');

    return {
      success: true,
      config: {
        upcTrusted: config.upcTrusted,
        version: config.version,
      },
    };
  } catch (error) {
    loggers.feeds.error('Failed to update source trust config', { sourceId }, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to update trust config' };
  }
}

// =============================================================================
// Read Operations
// =============================================================================

export async function getAffiliateFeed(id: string) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized', feed: null };
  }

  try {
    const feed = await prisma.affiliate_feeds.findUnique({
      where: { id },
      include: {
        sources: {
          include: { retailers: true },
        },
        affiliate_feed_runs: {
          orderBy: { startedAt: 'desc' },
          take: 20,
          include: {
            _count: { select: { affiliate_feed_run_errors: true } },
          },
        },
      },
    });

    if (!feed) {
      return { success: false, error: 'Feed not found', feed: null };
    }

    return { success: true, feed };
  } catch (error) {
    loggers.feeds.error('Failed to get affiliate feed', { feedId: id }, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to get feed', feed: null };
  }
}

export async function listAffiliateFeeds() {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized', feeds: [] };
  }

  try {
    const feeds = await prisma.affiliate_feeds.findMany({
      orderBy: [
        { status: 'asc' }, // DRAFT first
        { createdAt: 'desc' },
      ],
      include: {
        sources: {
          include: { retailers: true },
        },
        affiliate_feed_runs: {
          orderBy: { startedAt: 'desc' },
          take: 1,
        },
      },
    });

    return { success: true, feeds };
  } catch (error) {
    loggers.feeds.error('Failed to list affiliate feeds', {}, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to list feeds', feeds: [] };
  }
}

export async function generateRunReport(runId: string) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized', report: null };
  }

  try {
    const run = await prisma.affiliate_feed_runs.findUnique({
      where: { id: runId },
      include: {
        affiliate_feeds: {
          include: {
            sources: {
              include: { retailers: true },
            },
          },
        },
        affiliate_feed_run_errors: {
          orderBy: { rowNumber: 'asc' },
        },
      },
    });

    if (!run) {
      return { success: false, error: 'Run not found', report: null };
    }

    // Build the report
    const report = {
      // Header
      reportGeneratedAt: new Date().toISOString(),
      reportGeneratedBy: session.email,

      // Run identification
      run: {
        id: run.id,
        correlationId: run.correlationId,
        trigger: run.trigger,
        status: run.status,
        startedAt: run.startedAt.toISOString(),
        finishedAt: run.finishedAt?.toISOString() ?? null,
        durationMs: run.durationMs,
        durationFormatted: run.durationMs ? `${(run.durationMs / 1000).toFixed(2)}s` : null,
      },

      // Feed information
      feed: {
        id: run.affiliate_feeds.id,
        sourceName: run.affiliate_feeds.sources.name,
        retailerName: run.affiliate_feeds.sources.retailers?.name ?? 'Unknown',
        network: run.affiliate_feeds.network,
        transport: run.affiliate_feeds.transport,
        host: run.affiliate_feeds.host,
        path: run.affiliate_feeds.path,
        format: run.affiliate_feeds.format,
        compression: run.affiliate_feeds.compression,
        expiryHours: run.affiliate_feeds.expiryHours,
      },

      // Processing metrics
      metrics: {
        downloadBytes: run.downloadBytes ? Number(run.downloadBytes) : null,
        downloadBytesFormatted: run.downloadBytes
          ? `${(Number(run.downloadBytes) / 1024 / 1024).toFixed(2)} MB`
          : null,
        rowsRead: run.rowsRead,
        rowsParsed: run.rowsParsed,
        productsUpserted: run.productsUpserted,
        pricesWritten: run.pricesWritten,
        productsPromoted: run.productsPromoted,
        productsRejected: run.productsRejected,
        duplicateKeyCount: run.duplicateKeyCount,
        urlHashFallbackCount: run.urlHashFallbackCount,
        errorCount: run.errorCount,
      },

      // Calculated rates
      rates: {
        parseSuccessRate: run.rowsRead && run.rowsParsed
          ? `${((run.rowsParsed / run.rowsRead) * 100).toFixed(1)}%`
          : null,
        productSuccessRate: run.rowsParsed && run.productsUpserted
          ? `${((run.productsUpserted / run.rowsParsed) * 100).toFixed(1)}%`
          : null,
        rejectionRate: run.rowsParsed && run.productsRejected
          ? `${((run.productsRejected / run.rowsParsed) * 100).toFixed(1)}%`
          : null,
        urlHashFallbackRate: run.productsUpserted && run.urlHashFallbackCount
          ? `${((run.urlHashFallbackCount / run.productsUpserted) * 100).toFixed(1)}%`
          : null,
      },

      // Circuit breaker / expiry info
      circuitBreaker: {
        expiryBlocked: run.expiryBlocked,
        expiryBlockedReason: run.expiryBlockedReason,
        expiryApprovedAt: run.expiryApprovedAt?.toISOString() ?? null,
        expiryApprovedBy: run.expiryApprovedBy,
      },

      // Failure details (if failed)
      failure: run.status === 'FAILED' ? {
        kind: run.failureKind,
        code: run.failureCode,
        message: run.failureMessage,
      } : null,

      // Skipped reason (if skipped)
      skipped: run.skippedReason ? {
        reason: run.skippedReason,
      } : null,

      // All errors
      errors: run.affiliate_feed_run_errors.map((err) => ({
        id: err.id,
        code: err.code,
        message: err.message,
        rowNumber: err.rowNumber,
        sample: err.sample,
        createdAt: err.createdAt.toISOString(),
      })),

      // Summary
      summary: {
        totalErrors: run.affiliate_feed_run_errors.length,
        errorsByCode: run.affiliate_feed_run_errors.reduce((acc, err) => {
          acc[err.code] = (acc[err.code] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        isPartial: run.isPartial,
      },
    };

    await logAdminAction(session.userId, 'DOWNLOAD_RUN_REPORT', {
      resource: 'AffiliateFeedRun',
      resourceId: runId,
      newValue: { downloadedAt: new Date().toISOString() },
    });

    return { success: true, report };
  } catch (error) {
    loggers.feeds.error('Failed to generate run report', { runId }, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to generate report', report: null };
  }
}

export async function getRunDetails(runId: string) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized', run: null };
  }

  try {
    const run = await prisma.affiliate_feed_runs.findUnique({
      where: { id: runId },
      include: {
        affiliate_feeds: true,
        affiliate_feed_run_errors: {
          orderBy: { createdAt: 'desc' },
          take: 100,
        },
      },
    });

    if (!run) {
      return { success: false, error: 'Run not found', run: null };
    }

    return { success: true, run };
  } catch (error) {
    loggers.feeds.error('Failed to get run details', { runId }, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to get run details', run: null };
  }
}
