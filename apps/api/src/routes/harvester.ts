import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '@zeroedin/db'

const router = Router()

// Validation schema
const triggerCrawlSchema = z.object({
  sourceId: z.string().optional(), // If not provided, crawl all enabled sources
})

// POST /api/harvester/trigger - Trigger manual crawl
router.post('/trigger', async (req, res) => {
  try {
    const { sourceId } = triggerCrawlSchema.parse(req.body)

    // This endpoint will queue crawl jobs
    // For MVP, we'll create execution records and rely on the harvester worker to pick them up
    // In production, you'd use the BullMQ queue directly here

    let sources

    if (sourceId) {
      const source = await prisma.source.findUnique({
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
      sources = await prisma.source.findMany({
        where: { enabled: true },
      })

      if (sources.length === 0) {
        return res.status(400).json({ error: 'No enabled sources found' })
      }
    }

    // Create execution records for each source
    const executions = await Promise.all(
      sources.map((source) =>
        prisma.execution.create({
          data: {
            sourceId: source.id,
            status: 'PENDING',
          },
          include: {
            source: true,
          },
        })
      )
    )

    // TODO: Queue jobs in BullMQ
    // For now, just return the created executions
    // The harvester worker should be running separately and pick these up

    res.json({
      message: `Triggered crawl for ${executions.length} source(s)`,
      executions,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors })
    }
    console.error('Error triggering crawl:', error)
    res.status(500).json({ error: 'Failed to trigger crawl' })
  }
})

// GET /api/harvester/status - Get harvester service status
router.get('/status', async (req, res) => {
  try {
    // Check for running executions
    const runningCount = await prisma.execution.count({
      where: { status: 'RUNNING' },
    })

    const pendingCount = await prisma.execution.count({
      where: { status: 'PENDING' },
    })

    // Get last execution time
    const lastExecution = await prisma.execution.findFirst({
      orderBy: { startedAt: 'desc' },
      include: {
        source: true,
      },
    })

    res.json({
      status: runningCount > 0 ? 'running' : 'idle',
      runningExecutions: runningCount,
      pendingExecutions: pendingCount,
      lastExecution: lastExecution
        ? {
            id: lastExecution.id,
            source: lastExecution.source.name,
            status: lastExecution.status,
            startedAt: lastExecution.startedAt,
          }
        : null,
    })
  } catch (error) {
    console.error('Error fetching harvester status:', error)
    res.status(500).json({ error: 'Failed to fetch status' })
  }
})

export { router as harvesterRouter }
