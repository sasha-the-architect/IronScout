import { Router, Request, Response } from 'express'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { prisma } from '@ironscout/db'
import { Queue } from 'bullmq'
import Redis from 'ioredis'
import { logger } from '../config/logger'

const log = logger.child('harvester')

const router: any = Router()

// Redis connection for BullMQ
const redisHost = process.env.REDIS_HOST || 'localhost'
const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10)
const redisPassword = process.env.REDIS_PASSWORD || undefined

const redisConnection = {
  host: redisHost,
  port: redisPort,
  password: redisPassword,
  maxRetriesPerRequest: null,
}

// Create crawl queue
const crawlQueue = new Queue('crawl', { connection: redisConnection })

// Validation schema
const triggerCrawlSchema = z.object({
  sourceId: z.string().optional(), // If not provided, crawl all enabled sources
})

// POST /api/harvester/trigger - Trigger manual crawl
router.post('/trigger', async (req: Request, res: Response) => {
  try {
    const { sourceId } = triggerCrawlSchema.parse(req.body)

    // This endpoint will queue crawl jobs
    // For MVP, we'll create execution records and rely on the harvester worker to pick them up
    // In production, you'd use the BullMQ queue directly here

    let sources

    if (sourceId) {
      const source = await prisma.sources.findUnique({
        where: { id: sourceId },
      })

      if (!source) {
        return res.status(404).json({ error: 'Source not found' })
      }

      if (!source.enabled) {
        return res.status(400).json({ error: 'Source is disabled' })
      }

      sources = [source]
    } else {
      // Get all enabled sources
      sources = await prisma.sources.findMany({
        where: { enabled: true },
      })

      if (sources.length === 0) {
        return res.status(400).json({ error: 'No enabled sources found' })
      }
    }

    // Create execution records and queue jobs for each source
    const executions = []

    for (const source of sources) {
      // Create execution record
      const execution = await prisma.executions.create({
        data: {
          id: randomUUID(),
          sourceId: source.id,
          status: 'PENDING',
        },
        include: {
          sources: true,
        },
      })

      executions.push(execution)

      // Queue job in BullMQ
      await crawlQueue.add('crawl', {
        sourceId: source.id,
        executionId: execution.id,
      })

      log.info('Queued crawl job', { sourceName: source.name, executionId: execution.id })
    }

    res.json({
      message: `Triggered crawl for ${executions.length} source(s)`,
      executions,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.issues })
    }
    log.error('Error triggering crawl', { error }, error as Error)
    res.status(500).json({ error: 'Failed to trigger crawl' })
  }
})

// GET /api/harvester/status - Get harvester service status
router.get('/status', async (req: Request, res: Response) => {
  try {
    // Check for running executions
    const runningCount = await prisma.executions.count({
      where: { status: 'RUNNING' },
    })

    const pendingCount = await prisma.executions.count({
      where: { status: 'PENDING' },
    })

    // Get last execution time
    const lastExecution = await prisma.executions.findFirst({
      orderBy: { startedAt: 'desc' },
      include: {
        sources: true,
      },
    })

    res.json({
      status: runningCount > 0 ? 'running' : 'idle',
      runningExecutions: runningCount,
      pendingExecutions: pendingCount,
      lastExecution: lastExecution
        ? {
            id: lastExecution.id,
            source: lastExecution.sources.name,
            status: lastExecution.status,
            startedAt: lastExecution.startedAt,
          }
        : null,
    })
  } catch (error) {
    log.error('Error fetching harvester status', { error }, error as Error)
    res.status(500).json({ error: 'Failed to fetch status' })
  }
})

export { router as harvesterRouter }
