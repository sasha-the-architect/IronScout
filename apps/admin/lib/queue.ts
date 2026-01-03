/**
 * BullMQ Queue Client for Admin App
 *
 * Allows admin to directly enqueue jobs to harvester queues.
 * Uses the same Redis connection as the harvester.
 */

import { Queue } from 'bullmq';

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
