/**
 * Gun Locker Routes
 *
 * Endpoints for managing user's Gun Locker.
 * Per gun_locker_v1_spec.md - calibers are constrained to canonical enum.
 *
 * Routes:
 * - GET    /api/gun-locker      - List all guns
 * - POST   /api/gun-locker      - Add a gun
 * - DELETE /api/gun-locker/:id  - Remove a gun
 */

import { Router, Request, Response } from 'express'
import { z } from 'zod'
import {
  getGuns,
  addGun,
  removeGun,
  countGuns,
  CANONICAL_CALIBERS,
  isValidCaliber,
} from '../services/gun-locker'
import { getAuthenticatedUserId } from '../middleware/auth'
import { loggers } from '../config/logger'

const log = loggers.watchlist // Use watchlist logger for user data operations

const router: Router = Router()

// ============================================================================
// Validation Schemas
// ============================================================================

const addGunSchema = z.object({
  caliber: z.string().refine(isValidCaliber, {
    message: `Invalid caliber. Must be one of: ${CANONICAL_CALIBERS.join(', ')}`,
  }),
  nickname: z.string().max(100).optional().nullable(),
})

// ============================================================================
// GET /api/gun-locker - List all guns
// ============================================================================

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = getAuthenticatedUserId(req)
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const guns = await getGuns(userId)

    res.json({
      guns,
      _meta: {
        count: guns.length,
      },
    })
  } catch (error) {
    const err = error as Error
    log.error('Get gun locker error', { message: err.message }, err)
    res.status(500).json({ error: 'Failed to fetch gun locker' })
  }
})

// ============================================================================
// POST /api/gun-locker - Add a gun
// ============================================================================

router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = getAuthenticatedUserId(req)
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const parsed = addGunSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid data',
        details: parsed.error.issues,
      })
    }

    const { caliber, nickname } = parsed.data
    const gun = await addGun(userId, caliber, nickname)
    const count = await countGuns(userId)

    res.status(201).json({
      gun,
      _meta: {
        count,
      },
    })
  } catch (error) {
    const err = error as Error
    log.error('Add gun error', { message: err.message }, err)

    if (err.message.startsWith('Invalid caliber')) {
      return res.status(400).json({ error: err.message })
    }

    res.status(500).json({ error: 'Failed to add gun' })
  }
})

// ============================================================================
// DELETE /api/gun-locker/:id - Remove a gun
// ============================================================================

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = getAuthenticatedUserId(req)
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const gunId = req.params.id as string

    await removeGun(userId, gunId)

    res.json({ message: 'Gun removed', gunId })
  } catch (error) {
    const err = error as Error
    log.error('Remove gun error', { message: err.message }, err)

    if (err.message === 'Gun not found') {
      return res.status(404).json({ error: 'Gun not found' })
    }

    res.status(500).json({ error: 'Failed to remove gun' })
  }
})

export { router as gunLockerRouter }
