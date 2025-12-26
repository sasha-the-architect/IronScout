import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '@ironscout/db'
import { logger } from '../config/logger'

const log = logger.child('logs')

const router: any = Router()

// Query schema
const listLogsSchema = z.object({
  page: z.string().default('1'),
  limit: z.string().default('100'),
  level: z.enum(['INFO', 'WARN', 'ERROR']).optional(),
  event: z.string().optional(),
  executionId: z.string().optional(),
  search: z.string().optional(),
})

// GET /api/logs - List logs with filtering
router.get('/', async (req: Request, res: Response) => {
  try {
    const { page, limit, level, event, executionId, search } = listLogsSchema.parse(req.query)

    const pageNum = parseInt(page)
    const limitNum = parseInt(limit)
    const skip = (pageNum - 1) * limitNum

    const where: any = {}
    if (level) where.level = level
    if (event) where.event = event
    if (executionId) where.executionId = executionId
    if (search) {
      where.message = {
        contains: search,
        mode: 'insensitive',
      }
    }

    const [logs, total] = await Promise.all([
      prisma.executionLog.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { timestamp: 'desc' },
        include: {
          execution: {
            include: {
              source: true,
            },
          },
        },
      }),
      prisma.executionLog.count({ where }),
    ])

    res.json({
      logs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    })
  } catch (error) {
    log.error('Error fetching logs', { error }, error as Error)
    res.status(500).json({ error: 'Failed to fetch logs' })
  }
})

// GET /api/logs/events - Get list of unique events
router.get('/events', async (req: Request, res: Response) => {
  try {
    const events = await prisma.executionLog.findMany({
      select: {
        event: true,
      },
      distinct: ['event'],
      orderBy: {
        event: 'asc',
      },
    })

    res.json(events.map((e: any) => e.event))
  } catch (error) {
    log.error('Error fetching events', { error }, error as Error)
    res.status(500).json({ error: 'Failed to fetch events' })
  }
})

export { router as logsRouter }
