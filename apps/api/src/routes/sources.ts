import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '@zeroedin/db'

const router = Router()

// Validation schemas
const createSourceSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  type: z.enum(['RSS', 'HTML', 'JSON', 'JS_RENDERED']),
  enabled: z.boolean().default(true),
  interval: z.number().default(3600),
})

const updateSourceSchema = z.object({
  name: z.string().min(1).optional(),
  url: z.string().url().optional(),
  type: z.enum(['RSS', 'HTML', 'JSON', 'JS_RENDERED']).optional(),
  enabled: z.boolean().optional(),
  interval: z.number().optional(),
})

// GET /api/sources - List all sources
router.get('/', async (req, res) => {
  try {
    const sources = await prisma.source.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { executions: true },
        },
      },
    })

    res.json(sources)
  } catch (error) {
    console.error('Error fetching sources:', error)
    res.status(500).json({ error: 'Failed to fetch sources' })
  }
})

// GET /api/sources/:id - Get single source
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params

    const source = await prisma.source.findUnique({
      where: { id },
      include: {
        executions: {
          take: 10,
          orderBy: { startedAt: 'desc' },
        },
      },
    })

    if (!source) {
      return res.status(404).json({ error: 'Source not found' })
    }

    res.json(source)
  } catch (error) {
    console.error('Error fetching source:', error)
    res.status(500).json({ error: 'Failed to fetch source' })
  }
})

// POST /api/sources - Create new source
router.post('/', async (req, res) => {
  try {
    const data = createSourceSchema.parse(req.body)

    const source = await prisma.source.create({
      data,
    })

    res.status(201).json(source)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors })
    }
    console.error('Error creating source:', error)
    res.status(500).json({ error: 'Failed to create source' })
  }
})

// PUT /api/sources/:id - Update source
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const data = updateSourceSchema.parse(req.body)

    const source = await prisma.source.update({
      where: { id },
      data,
    })

    res.json(source)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors })
    }
    console.error('Error updating source:', error)
    res.status(500).json({ error: 'Failed to update source' })
  }
})

// DELETE /api/sources/:id - Delete source
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params

    await prisma.source.delete({
      where: { id },
    })

    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting source:', error)
    res.status(500).json({ error: 'Failed to delete source' })
  }
})

// POST /api/sources/:id/toggle - Toggle source enabled status
router.post('/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params

    const source = await prisma.source.findUnique({
      where: { id },
    })

    if (!source) {
      return res.status(404).json({ error: 'Source not found' })
    }

    const updated = await prisma.source.update({
      where: { id },
      data: { enabled: !source.enabled },
    })

    res.json(updated)
  } catch (error) {
    console.error('Error toggling source:', error)
    res.status(500).json({ error: 'Failed to toggle source' })
  }
})

export { router as sourcesRouter }
