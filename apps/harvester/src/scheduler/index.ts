import { Worker, Job } from 'bullmq'
import { prisma } from '@ironscout/db'
import { redisConnection } from '../config/redis'
import { logger } from '../config/logger'
import { crawlQueue, fetchQueue, CrawlJobData } from '../config/queues'

const log = logger.scheduler

// Scheduler worker - creates crawl jobs for enabled sources
export const schedulerWorker = new Worker<CrawlJobData>(
  'crawl',
  async (job: Job<CrawlJobData>) => {
    const { sourceId, executionId } = job.data

    log.info('Processing crawl job', { sourceId, executionId })

    try {
      // Update execution status to RUNNING
      await prisma.executions.update({
        where: { id: executionId },
        data: { status: 'RUNNING' },
      })

      // Log start
      await prisma.execution_logs.create({
        data: {
          executionId,
          level: 'INFO',
          event: 'CRAWL_START',
          message: `Starting crawl for source ${sourceId}`,
        },
      })

      // Get source details
      const source = await prisma.sources.findUnique({
        where: { id: sourceId },
      })

      if (!source) {
        throw new Error(`Source ${sourceId} not found`)
      }

      if (!source.enabled) {
        throw new Error(`Source ${sourceId} is disabled`)
      }

      // Create fetch job with idempotent jobId (one fetch per execution)
      await fetchQueue.add('fetch', {
        sourceId: source.id,
        executionId,
        url: source.url,
        type: source.type,
      }, {
        jobId: `fetch_${executionId}`, // Idempotent: one fetch per execution
      })

      await prisma.execution_logs.create({
        data: {
          executionId,
          level: 'INFO',
          event: 'FETCH_QUEUED',
          message: `Fetch job queued for ${source.url}`,
        },
      })

      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      await prisma.execution_logs.create({
        data: {
          executionId,
          level: 'ERROR',
          event: 'CRAWL_FAIL',
          message: errorMessage,
        },
      })

      await prisma.executions.update({
        where: { id: executionId },
        data: {
          status: 'FAILED',
          errorMessage,
          completedAt: new Date(),
        },
      })

      throw error
    }
  },
  { connection: redisConnection }
)

/**
 * Get the current hourly scheduling window
 * Used for idempotency: only one crawl job per source per hour
 */
function getHourlyWindow(): string {
  const now = new Date()
  now.setMinutes(0, 0, 0)
  return now.toISOString()
}

/**
 * Schedule crawls for all enabled sources
 * Idempotent: uses jobId based on (sourceId, hourlyWindow)
 */
export async function scheduleAllCrawls() {
  const schedulingWindow = getHourlyWindow()
  const sources = await prisma.sources.findMany({
    where: { enabled: true },
  })

  log.info('Scheduling enabled sources', { sourceCount: sources.length, schedulingWindow })

  let scheduledCount = 0
  let skippedCount = 0
  let errorCount = 0

  for (const source of sources) {
    try {
      // Idempotent job ID: only one crawl per source per hourly window
      // BullMQ job IDs cannot contain colons, so sanitize the ISO timestamp
      const sanitizedWindow = schedulingWindow.replace(/[:.]/g, '-')
      const jobId = `crawl-${source.id}-${sanitizedWindow}`

      // Check if job already exists (idempotency check)
      const existingJob = await crawlQueue.getJob(jobId)
      if (existingJob) {
        skippedCount++
        continue // Already scheduled in this window
      }

      // Create execution record
      const execution = await prisma.executions.create({
        data: {
          sourceId: source.id,
          status: 'PENDING',
        },
      })

      // Add job to queue with idempotent jobId
      await crawlQueue.add('crawl', {
        sourceId: source.id,
        executionId: execution.id,
      }, {
        jobId, // Idempotent job ID
      })

      // Update lastRunAt ONLY AFTER successful enqueue
      await prisma.sources.update({
        where: { id: source.id },
        data: { lastRunAt: new Date() },
      })

      scheduledCount++
      log.debug('Queued crawl for source', { sourceName: source.name, sourceId: source.id })
    } catch (error) {
      // Log error but continue with remaining sources
      errorCount++
      log.error('Failed to schedule source', {
        sourceId: source.id,
        sourceName: source.name,
        error: error instanceof Error ? error.message : String(error),
      }, error instanceof Error ? error : undefined)
    }
  }

  log.info('Crawl scheduling complete', { scheduledCount, skippedCount, errorCount })
}

schedulerWorker.on('completed', (job) => {
  log.info('Job completed', { jobId: job.id })
})

schedulerWorker.on('failed', (job, err) => {
  log.error('Job failed', { jobId: job?.id, error: err.message })
})
