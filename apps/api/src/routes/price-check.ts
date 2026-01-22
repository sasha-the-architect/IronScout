/**
 * Price Check Routes
 *
 * Per mobile_price_check_v1_spec.md:
 * - Mobile route for instant price sanity checks
 * - Answers: "Is this price normal, high, or unusually low right now?"
 * - No verdicts or recommendations
 *
 * Routes:
 * - POST /api/price-check - Check a price against recent market data
 */

import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { checkPrice } from '../services/price-check'
import { CANONICAL_CALIBERS, isValidCaliber } from '../services/gun-locker'
import { getAuthenticatedUserId } from '../middleware/auth'
import { loggers } from '../config/logger'

const log = loggers.dashboard // Use dashboard logger for user-facing features

const router: Router = Router()

// ============================================================================
// Validation Schema
// ============================================================================

const priceCheckSchema = z.object({
  caliber: z.string().refine(isValidCaliber, {
    message: `Invalid caliber. Must be one of: ${CANONICAL_CALIBERS.join(', ')}`,
  }),
  pricePerRound: z
    .number()
    .positive('Price per round must be positive')
    .max(10, 'Price per round seems too high (max $10/rd)'),
  brand: z.string().max(100).optional(),
  grain: z.number().int().min(1).max(1000).optional(),
})

// ============================================================================
// POST /api/price-check - Check a price against recent market data
// ============================================================================

router.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = priceCheckSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid data',
        details: parsed.error.issues,
      })
    }

    const { caliber, pricePerRound, brand, grain } = parsed.data

    const result = await checkPrice(caliber, pricePerRound, brand, grain)

    // Check if user has Gun Locker (for optional prompt)
    const userId = getAuthenticatedUserId(req)
    let hasGunLocker = false

    if (userId) {
      // Don't query DB for now - this is optional per spec
      // Could be added later for "Add to Gun Locker" prompt
      hasGunLocker = false
    }

    res.json({
      ...result,
      _meta: {
        hasGunLocker,
        authenticated: !!userId,
      },
    })
  } catch (error) {
    const err = error as Error
    log.error('Price check error', { message: err.message }, err)

    if (err.message.startsWith('Invalid caliber')) {
      return res.status(400).json({ error: err.message })
    }

    res.status(500).json({ error: 'Failed to check price' })
  }
})

// ============================================================================
// GET /api/price-check/calibers - Get available calibers
// ============================================================================

router.get('/calibers', async (_req: Request, res: Response) => {
  const calibers = CANONICAL_CALIBERS.map((value) => ({
    value,
    label: getCaliberLabel(value),
  }))

  res.json({ calibers })
})

function getCaliberLabel(caliber: string): string {
  const labels: Record<string, string> = {
    '9mm': '9mm',
    '.45_acp': '.45 ACP',
    '.40_sw': '.40 S&W',
    '.380_acp': '.380 ACP',
    '.22_lr': '.22 LR',
    '.223_556': '.223 / 5.56',
    '.308_762x51': '.308 / 7.62x51',
    '.30-06': '.30-06',
    '6.5_creedmoor': '6.5 Creedmoor',
    '7.62x39': '7.62x39',
    '12ga': '12 Gauge',
    '20ga': '20 Gauge',
  }
  return labels[caliber] || caliber
}

export { router as priceCheckRouter }
