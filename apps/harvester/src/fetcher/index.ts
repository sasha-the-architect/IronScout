import { Worker, Job } from 'bullmq'
import { prisma } from '@zeroedin/db'
import axios from 'axios'
import { redisConnection } from '../config/redis'
import { extractQueue, FetchJobData } from '../config/queues'

// Fetcher worker - retrieves content from URLs
export const fetcherWorker = new Worker<FetchJobData>(
  'fetch',
  async (job: Job<FetchJobData>) => {
    const { sourceId, executionId, url, type } = job.data

    console.log(`[Fetcher] Fetching ${url}`)

    try {
      await prisma.executionLog.create({
        data: {
          executionId,
          level: 'INFO',
          event: 'FETCH_START',
          message: `Fetching ${url}`,
        },
      })

      let content: string

      if (type === 'JS_RENDERED') {
        // For JS-rendered pages, we'd use Puppeteer
        // For now, we'll use a simple fetch
        // TODO: Implement Puppeteer for JS-rendered pages
        const response = await axios.get(url, {
          headers: {
            'User-Agent': 'ZeroedIn Price Crawler/1.0',
          },
          timeout: 30000,
        })
        content = response.data
      } else {
        // Standard HTTP fetch
        const response = await axios.get(url, {
          headers: {
            'User-Agent': 'ZeroedIn Price Crawler/1.0',
          },
          timeout: 30000,
        })
        content = response.data
      }

      await prisma.executionLog.create({
        data: {
          executionId,
          level: 'INFO',
          event: 'FETCH_OK',
          message: `Successfully fetched ${url} (${content.length} bytes)`,
          metadata: { contentLength: content.length },
        },
      })

      // Queue extraction job
      await extractQueue.add('extract', {
        executionId,
        sourceId,
        content,
        sourceType: type,
      })

      await prisma.executionLog.create({
        data: {
          executionId,
          level: 'INFO',
          event: 'EXTRACT_QUEUED',
          message: 'Extract job queued',
        },
      })

      return { success: true, contentLength: content.length }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      await prisma.executionLog.create({
        data: {
          executionId,
          level: 'ERROR',
          event: 'FETCH_FAIL',
          message: `Failed to fetch ${url}: ${errorMessage}`,
        },
      })

      // Update execution status
      await prisma.execution.update({
        where: { id: executionId },
        data: {
          status: 'FAILED',
          errorMessage: `Fetch failed: ${errorMessage}`,
          completedAt: new Date(),
        },
      })

      throw error
    }
  },
  {
    connection: redisConnection,
    concurrency: 5, // Process up to 5 fetches concurrently
  }
)

fetcherWorker.on('completed', (job) => {
  console.log(`[Fetcher] Job ${job.id} completed`)
})

fetcherWorker.on('failed', (job, err) => {
  console.error(`[Fetcher] Job ${job?.id} failed:`, err.message)
})
