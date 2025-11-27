import { Worker, Job } from 'bullmq'
import { prisma } from '@zeroedin/db'
import { redisConnection } from '../config/redis'
import { crawlQueue, fetchQueue, CrawlJobData } from '../config/queues'

// Scheduler worker - creates crawl jobs for enabled sources
export const schedulerWorker = new Worker<CrawlJobData>(
  'crawl',
  async (job: Job<CrawlJobData>) => {
    const { sourceId, executionId } = job.data

    console.log(`[Scheduler] Processing crawl job for source ${sourceId}`)

    try {
      // Update execution status to RUNNING
      await prisma.execution.update({
        where: { id: executionId },
        data: { status: 'RUNNING' },
      })

      // Log start
      await prisma.executionLog.create({
        data: {
          executionId,
          level: 'INFO',
          event: 'CRAWL_START',
          message: `Starting crawl for source ${sourceId}`,
        },
      })

      // Get source details
      const source = await prisma.source.findUnique({
        where: { id: sourceId },
      })

      if (!source) {
        throw new Error(`Source ${sourceId} not found`)
      }

      if (!source.enabled) {
        throw new Error(`Source ${sourceId} is disabled`)
      }

      // Create fetch job
      await fetchQueue.add('fetch', {
        sourceId: source.id,
        executionId,
        url: source.url,
        type: source.type,
      })

      await prisma.executionLog.create({
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

      await prisma.executionLog.create({
        data: {
          executionId,
          level: 'ERROR',
          event: 'CRAWL_FAIL',
          message: errorMessage,
        },
      })

      await prisma.execution.update({
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

// Function to schedule crawls for all enabled sources
export async function scheduleAllCrawls() {
  const sources = await prisma.source.findMany({
    where: { enabled: true },
  })

  console.log(`[Scheduler] Scheduling ${sources.length} enabled sources`)

  for (const source of sources) {
    // Create execution record
    const execution = await prisma.execution.create({
      data: {
        sourceId: source.id,
        status: 'PENDING',
      },
    })

    // Add job to queue
    await crawlQueue.add('crawl', {
      sourceId: source.id,
      executionId: execution.id,
    })

    // Update lastRunAt
    await prisma.source.update({
      where: { id: source.id },
      data: { lastRunAt: new Date() },
    })

    console.log(`[Scheduler] Queued crawl for source ${source.name}`)
  }
}

schedulerWorker.on('completed', (job) => {
  console.log(`[Scheduler] Job ${job.id} completed`)
})

schedulerWorker.on('failed', (job, err) => {
  console.error(`[Scheduler] Job ${job?.id} failed:`, err.message)
})
