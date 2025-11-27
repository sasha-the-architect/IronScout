import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '@zeroedin/db'

const router = Router()

// Query schema
const listExecutionsSchema = z.object({
  page: z.string().default('1'),
  limit: z.string().default('20'),
  status: z.enum(['PENDING', 'RUNNING', 'SUCCESS', 'FAILED']).optional(),
  sourceId: z.string().optional(),
})

// GET /api/executions - List executions with pagination
router.get('/', async (req, res) => {
  try {
    const { page, limit, status, sourceId } = listExecutionsSchema.parse(req.query)

    const pageNum = parseInt(page)
    const limitNum = parseInt(limit)
    const skip = (pageNum - 1) * limitNum

    const where: any = {}
    if (status) where.status = status
    if (sourceId) where.sourceId = sourceId

    const [executions, total] = await Promise.all([
      prisma.execution.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { startedAt: 'desc' },
        include: {
          source: true,
          _count: {
            select: { logs: true },
          },
        },
      }),
      prisma.execution.count({ where }),
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
    console.error('Error fetching executions:', error)
    res.status(500).json({ error: 'Failed to fetch executions' })
  }
})

// GET /api/executions/stats - Get execution statistics
router.get('/stats', async (req, res) => {
  try {
    const [total, successful, failed, running, activeSources] = await Promise.all([
      prisma.execution.count(),
      prisma.execution.count({ where: { status: 'SUCCESS' } }),
      prisma.execution.count({ where: { status: 'FAILED' } }),
      prisma.execution.count({ where: { status: 'RUNNING' } }),
      prisma.source.count({ where: { enabled: true } }),
    ])

    const successRate = total > 0 ? ((successful / total) * 100).toFixed(1) : '0.0'

    // Get total items harvested
    const itemsResult = await prisma.execution.aggregate({
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
    console.error('Error fetching execution stats:', error)
    res.status(500).json({ error: 'Failed to fetch stats' })
  }
})

// GET /api/executions/:id - Get single execution with logs
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params

    const execution = await prisma.execution.findUnique({
      where: { id },
      include: {
        source: true,
        logs: {
          orderBy: { timestamp: 'asc' },
        },
      },
    })

    if (!execution) {
      return res.status(404).json({ error: 'Execution not found' })
    }

    res.json(execution)
  } catch (error) {
    console.error('Error fetching execution:', error)
    res.status(500).json({ error: 'Failed to fetch execution' })
  }
})

// GET /api/executions/:id/logs - Get logs for execution
router.get('/:id/logs', async (req, res) => {
  try {
    const { id } = req.params
    const { level, event } = req.query

    const where: any = { executionId: id }
    if (level) where.level = level
    if (event) where.event = event

    const logs = await prisma.executionLog.findMany({
      where,
      orderBy: { timestamp: 'asc' },
    })

    res.json(logs)
  } catch (error) {
    console.error('Error fetching execution logs:', error)
    res.status(500).json({ error: 'Failed to fetch logs' })
  }
})

// DELETE /api/executions/:id - Delete execution and its logs
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params

    await prisma.execution.delete({
      where: { id },
    })

    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting execution:', error)
    res.status(500).json({ error: 'Failed to delete execution' })
  }
})

export { router as executionsRouter }
