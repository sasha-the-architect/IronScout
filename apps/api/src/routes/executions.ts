import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '@ironscout/db'
import { logger } from '../config/logger'

const log = logger.child('executions')

const router: any = Router()

// Query schema
const listExecutionsSchema = z.object({
  page: z.string().default('1'),
  limit: z.string().default('20'),
  status: z.enum(['PENDING', 'RUNNING', 'SUCCESS', 'FAILED']).optional(),
  sourceId: z.string().optional(),
})

// GET /api/executions - List executions with pagination
router.get('/', async (req: Request, res: Response) => {
  try {
    const { page, limit, status, sourceId } = listExecutionsSchema.parse(req.query)

    const pageNum = parseInt(page)
    const limitNum = parseInt(limit)
    const skip = (pageNum - 1) * limitNum

    const where: any = {}
    if (status) where.status = status
    if (sourceId) where.sourceId = sourceId

    const [executions, total] = await Promise.all([
      prisma.executions.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { startedAt: 'desc' },
        include: {
          sources: true,
          _count: {
            select: { execution_logs: true },
          },
        },
      }),
      prisma.executions.count({ where }),
    ])

    res.json({
      executions,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    })
  } catch (error) {
    log.error('Error fetching executions', { error }, error as Error)
    res.status(500).json({ error: 'Failed to fetch executions' })
  }
})

// GET /api/executions/stats - Get execution statistics
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const [total, successful, failed, running, activeSources] = await Promise.all([
      prisma.executions.count(),
      prisma.executions.count({ where: { status: 'SUCCESS' } }),
      prisma.executions.count({ where: { status: 'FAILED' } }),
      prisma.executions.count({ where: { status: 'RUNNING' } }),
      prisma.sources.count({ where: { enabled: true } }),
    ])

    const successRate = total > 0 ? ((successful / total) * 100).toFixed(1) : '0.0'

    // Get total items harvested
    const itemsResult = await prisma.executions.aggregate({
      _sum: {
        itemsUpserted: true,
      },
      where: {
        status: 'SUCCESS',
      },
    })

    const totalItemsHarvested = itemsResult._sum.itemsUpserted || 0

    res.json({
      totalExecutions: total,
      successfulExecutions: successful,
      failedExecutions: failed,
      runningExecutions: running,
      activeSources,
      successRate: parseFloat(successRate),
      totalItemsHarvested,
    })
  } catch (error) {
    log.error('Error fetching execution stats', { error }, error as Error)
    res.status(500).json({ error: 'Failed to fetch stats' })
  }
})

// GET /api/executions/:id - Get single execution with logs
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string

    const execution = await prisma.executions.findUnique({
      where: { id },
      include: {
        sources: true,
        execution_logs: {
          orderBy: { timestamp: 'asc' },
        },
      },
    })

    if (!execution) {
      return res.status(404).json({ error: 'Execution not found' })
    }

    res.json(execution)
  } catch (error) {
    log.error('Error fetching execution', { error }, error as Error)
    res.status(500).json({ error: 'Failed to fetch execution' })
  }
})

// GET /api/executions/:id/logs - Get logs for execution
router.get('/:id/logs', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string
    const { level, event } = req.query

    const where: any = { executionId: id }
    if (level) where.level = level
    if (event) where.event = event

    const logs = await prisma.execution_logs.findMany({
      where,
      orderBy: { timestamp: 'asc' },
    })

    res.json(logs)
  } catch (error) {
    log.error('Error fetching execution logs', { error }, error as Error)
    res.status(500).json({ error: 'Failed to fetch logs' })
  }
})

// DELETE /api/executions/:id - Delete execution and its logs
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string

    await prisma.executions.delete({
      where: { id },
    })

    res.json({ success: true })
  } catch (error) {
    log.error('Error deleting execution', { error }, error as Error)
    res.status(500).json({ error: 'Failed to delete execution' })
  }
})

export { router as executionsRouter }
