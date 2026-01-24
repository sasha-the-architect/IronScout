/**
 * BullMQ Queue Client for Admin App
 *
 * Allows admin to directly enqueue jobs to harvester queues.
 * Uses the same Redis connection as the harvester.
 */

import { Queue } from 'bullmq';
import Redis from 'ioredis';

const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
const redisPassword = process.env.REDIS_PASSWORD || undefined;

// Log Redis config on module load (avoid leaking host/secret)
console.log('[Redis Queue] Configured Redis connection', { passwordSet: !!redisPassword });

const redisConnection = {
  host: redisHost,
  port: redisPort,
  password: redisPassword,
  maxRetriesPerRequest: null,
};

// ============================================================================
// BRAND ALIAS CACHE INVALIDATION (Pub/Sub)
// ============================================================================

const BRAND_ALIAS_INVALIDATE_CHANNEL = 'brand-alias:invalidate';

let pubClient: Redis | null = null;

function getPubClient(): Redis {
  if (!pubClient) {
    pubClient = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      lazyConnect: true,
    });
    pubClient.on('error', (err) => {
      console.error('[Redis Pub/Sub] Client error:', err.message);
    });
  }
  return pubClient;
}

/**
 * Publish a brand alias cache invalidation event.
 * Harvester instances subscribe to this channel and refresh their cache.
 */
export async function publishBrandAliasInvalidation(aliasId: string, action: 'activate' | 'disable'): Promise<void> {
  try {
    const client = getPubClient();
    await client.publish(BRAND_ALIAS_INVALIDATE_CHANNEL, JSON.stringify({ aliasId, action, timestamp: Date.now() }));
    console.log(`[Redis Pub/Sub] Published brand alias invalidation: ${action} ${aliasId}`);
  } catch (error) {
    // Non-critical: log and continue, fallback is periodic refresh
    const err = error as Error;
    console.error('[Redis Pub/Sub] Failed to publish invalidation', { message: err.message });
  }
}

export { BRAND_ALIAS_INVALIDATE_CHANNEL };

// Affiliate Feed Queue
export interface AffiliateFeedJobData {
  feedId: string;
  trigger: 'SCHEDULED' | 'MANUAL' | 'MANUAL_PENDING' | 'ADMIN_TEST' | 'RETRY';
  runId?: string;
  feedLockId?: string;
}

let affiliateFeedQueue: Queue<AffiliateFeedJobData> | null = null;

function getAffiliateFeedQueue(): Queue<AffiliateFeedJobData> {
  if (!affiliateFeedQueue) {
    affiliateFeedQueue = new Queue<AffiliateFeedJobData>('affiliate-feed', {
      connection: redisConnection,
    });
  }
  return affiliateFeedQueue;
}

/**
 * Enqueue an affiliate feed job for immediate processing
 */
export async function enqueueAffiliateFeedJob(
  feedId: string,
  trigger: 'MANUAL' | 'ADMIN_TEST' = 'MANUAL'
): Promise<{ jobId: string }> {
  try {
    const queue = getAffiliateFeedQueue();
    const jobId = `${feedId}-${trigger.toLowerCase()}-${Date.now()}`;

    console.log(`[Redis Queue] Enqueuing job: ${jobId}`);
    await queue.add(
      'process',
      { feedId, trigger },
      { jobId }
    );
    console.log(`[Redis Queue] Job enqueued successfully: ${jobId}`);

    return { jobId };
  } catch (error) {
    const err = error as Error & { code?: string };
    console.error('[Redis Queue] Connection error', { message: err.message, code: err.code });
    throw new Error(`Redis connection failed: ${err.message}`);
  }
}

/**
 * Check if a job exists for a feed (waiting or active)
 */
export async function hasActiveJob(feedId: string): Promise<boolean> {
  try {
    const queue = getAffiliateFeedQueue();
    console.log(`[Redis Queue] Checking active jobs for feed: ${feedId}`);
    const jobs = await queue.getJobs(['waiting', 'active']);
    const hasJob = jobs.some((j) => j.data.feedId === feedId);
    console.log(`[Redis Queue] Active job check: ${hasJob ? 'found' : 'none'}`);
    return hasJob;
  } catch (error) {
    const err = error as Error & { code?: string };
    console.error('[Redis Queue] Connection error', { message: err.message, code: err.code });
    throw new Error(`Redis connection failed: ${err.message}`);
  }
}

// ============================================================================
// QUARANTINE REPROCESS QUEUE
// ============================================================================

export interface QuarantineReprocessJobData {
  quarantineRecordId: string;
  feedType: 'AFFILIATE' | 'RETAILER';
  triggeredBy: string;
  batchId: string;
}

let quarantineReprocessQueue: Queue<QuarantineReprocessJobData> | null = null;

function getQuarantineReprocessQueue(): Queue<QuarantineReprocessJobData> {
  if (!quarantineReprocessQueue) {
    quarantineReprocessQueue = new Queue<QuarantineReprocessJobData>('quarantine-reprocess', {
      connection: redisConnection,
    });
  }
  return quarantineReprocessQueue;
}

/**
 * Generate a unique batch ID for grouping reprocess jobs
 */
function generateBatchId(): string {
  return `batch-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Enqueue quarantine records for reprocessing
 * @param records - Array of quarantine record IDs and their feed types
 * @param triggeredBy - Email of admin user who triggered the reprocess
 * @returns Batch ID and count of enqueued jobs
 */
export async function enqueueQuarantineReprocess(
  records: Array<{ id: string; feedType: 'AFFILIATE' | 'RETAILER' }>,
  triggeredBy: string
): Promise<{ batchId: string; enqueuedCount: number }> {
  if (records.length === 0) {
    return { batchId: '', enqueuedCount: 0 };
  }

  const batchId = generateBatchId();
  const queue = getQuarantineReprocessQueue();

  console.log(`[Quarantine Reprocess] Enqueuing ${records.length} records for reprocessing`, {
    batchId,
    triggeredBy,
    feedTypes: {
      affiliate: records.filter(r => r.feedType === 'AFFILIATE').length,
      retailer: records.filter(r => r.feedType === 'RETAILER').length,
    },
  });

  try {
    const jobs = records.map((record) => ({
      name: 'REPROCESS_QUARANTINE',
      data: {
        quarantineRecordId: record.id,
        feedType: record.feedType,
        triggeredBy,
        batchId,
      } satisfies QuarantineReprocessJobData,
      opts: {
        jobId: `QUARANTINE_REPROCESS_${record.id}`,
      },
    }));

    await queue.addBulk(jobs);

    console.log(`[Quarantine Reprocess] Successfully enqueued ${records.length} jobs`, { batchId });
    return { batchId, enqueuedCount: records.length };
  } catch (error) {
    const err = error as Error & { code?: string };
    console.error('[Quarantine Reprocess] Failed to enqueue jobs', {
      message: err.message,
      code: err.code,
      batchId,
    });
    throw new Error(`Failed to enqueue reprocess jobs: ${err.message}`);
  }
}
