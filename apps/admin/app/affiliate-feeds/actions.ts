'use server';

import { prisma } from '@ironscout/db';
import { revalidatePath } from 'next/cache';
import { getAdminSession, logAdminAction } from '@/lib/auth';
import { loggers } from '@/lib/logger';
import {
  validateExpiryHours,
  validateScheduleFrequencyHours,
  validateTransport,
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
    validateTransport(data.transport);
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
    const source = await prisma.source.findUnique({
      where: { id: data.sourceId },
      include: { affiliateFeed: true },
    });

    if (!source) {
      return { success: false, error: 'Source not found' };
    }

    if (source.affiliateFeed) {
      return { success: false, error: 'Source already has an affiliate feed configured' };
    }

    // Encrypt the password - convert Buffer to Uint8Array for Prisma Bytes type
    const encryptedBuffer = encryptSecret(data.password);
    const secretCiphertext = new Uint8Array(encryptedBuffer) as Uint8Array<ArrayBuffer>;

    // Create the feed
    const feed = await prisma.affiliateFeed.create({
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
    await prisma.source.update({
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
    const oldFeed = await prisma.affiliateFeed.findUnique({
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

    const feed = await prisma.affiliateFeed.update({
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
    const feed = await prisma.affiliateFeed.findUnique({
      where: { id },
      include: { source: true },
    });

    if (!feed) {
      return { success: false, error: 'Feed not found' };
    }

    // Check for active runs
    const activeRun = await prisma.affiliateFeedRun.findFirst({
      where: { feedId: id, status: 'RUNNING' },
    });

    if (activeRun) {
      return { success: false, error: 'Cannot delete feed with active run. Wait for it to complete.' };
    }

    // Delete the feed (cascade will handle runs, errors, etc.)
    await prisma.affiliateFeed.delete({
      where: { id },
    });

    // Reset source kind
    await prisma.source.update({
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
    const feed = await prisma.affiliateFeed.findUnique({
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

    const updatedFeed = await prisma.affiliateFeed.update({
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
    const feed = await prisma.affiliateFeed.findUnique({
      where: { id },
    });

    if (!feed) {
      return { success: false, error: 'Feed not found' };
    }

    if (feed.status !== 'ENABLED') {
      return { success: false, error: 'Can only pause an enabled feed' };
    }

    const updatedFeed = await prisma.affiliateFeed.update({
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
    const feed = await prisma.affiliateFeed.findUnique({
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

    const updatedFeed = await prisma.affiliateFeed.update({
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

export async function triggerManualRun(feedId: string) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const feed = await prisma.affiliateFeed.findUnique({
      where: { id: feedId },
    });

    if (!feed) {
      return { success: false, error: 'Feed not found' };
    }

    if (feed.status === 'DRAFT') {
      return { success: false, error: 'Cannot run a draft feed. Enable it first.' };
    }

    // Per spec §6.5: Always set manualRunPending=true (idempotent)
    // The lock will serialize execution - no need to reject if a run is in progress
    // If a run is active, it will process the pending flag after completion
    await prisma.affiliateFeed.update({
      where: { id: feedId },
      data: { manualRunPending: true },
    });

    await logAdminAction(session.userId, 'TRIGGER_MANUAL_RUN', {
      resource: 'AffiliateFeed',
      resourceId: feedId,
      newValue: { manualRunPending: true },
    });

    revalidatePath('/affiliate-feeds');
    revalidatePath(`/affiliate-feeds/${feedId}`);

    // Check if a run is in progress to provide accurate feedback
    const runningRun = await prisma.affiliateFeedRun.findFirst({
      where: { feedId, status: 'RUNNING' },
      select: { id: true },
    });

    if (runningRun) {
      return {
        success: true,
        message: 'Manual run queued. A run is currently in progress - this will execute after it completes.',
      };
    }

    return {
      success: true,
      message: 'Manual run queued. The harvester will pick it up shortly.',
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
    const run = await prisma.affiliateFeedRun.findUnique({
      where: { id: runId },
      include: { feed: true },
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
    const newerRunExists = await prisma.affiliateFeedRun.count({
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
    const feedLockId = run.feed.feedLockId;
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
      await prisma.affiliateFeedRun.update({
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
// Read Operations
// =============================================================================

export async function getAffiliateFeed(id: string) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized', feed: null };
  }

  try {
    const feed = await prisma.affiliateFeed.findUnique({
      where: { id },
      include: {
        source: {
          include: { retailer: true },
        },
        runs: {
          orderBy: { startedAt: 'desc' },
          take: 20,
          include: {
            _count: { select: { errors: true } },
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
    const feeds = await prisma.affiliateFeed.findMany({
      orderBy: [
        { status: 'asc' }, // DRAFT first
        { createdAt: 'desc' },
      ],
      include: {
        source: {
          include: { retailer: true },
        },
        runs: {
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

export async function getRunDetails(runId: string) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized', run: null };
  }

  try {
    const run = await prisma.affiliateFeedRun.findUnique({
      where: { id: runId },
      include: {
        feed: true,
        errors: {
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
