/**
 * Firearm Ammo Preference Routes
 *
 * Per firearm_preferred_ammo_mapping_spec_v3.md:
 * - User-declared ammo usage context for firearms
 * - NOT a recommendation system
 *
 * Routes:
 * - GET    /api/gun-locker/:firearmId/ammo-preferences     - List preferences for firearm
 * - POST   /api/gun-locker/:firearmId/ammo-preferences     - Add preference
 * - PATCH  /api/gun-locker/:firearmId/ammo-preferences/:id - Update preference use case
 * - DELETE /api/gun-locker/:firearmId/ammo-preferences/:id - Remove preference
 * - GET    /api/ammo-preferences                           - List all user preferences (My Loadout)
 */

import { Router, Request, Response } from 'express'
import { z } from 'zod'
import {
  getPreferencesForFirearm,
  getPreferencesForUser,
  addPreference,
  updatePreferenceUseCase,
  removePreference,
  getFirearmCaliber,
  AmmoUseCase,
} from '../services/firearm-ammo-preference'
import { getAuthenticatedUserId } from '../middleware/auth'
import { loggers } from '../config/logger'

const log = loggers.watchlist // Use watchlist logger for user data operations

const router: Router = Router()

// ============================================================================
// Validation Schemas
// ============================================================================

const useCaseSchema = z.enum(['TRAINING', 'CARRY', 'COMPETITION', 'GENERAL'])

const addPreferenceSchema = z.object({
  ammoSkuId: z.string().min(1, 'Ammo SKU ID is required'),
  useCase: useCaseSchema,
})

const updatePreferenceSchema = z.object({
  useCase: useCaseSchema,
})

// ============================================================================
// GET /api/gun-locker/:firearmId/ammo-preferences - List preferences for firearm
// ============================================================================

router.get('/:firearmId/ammo-preferences', async (req: Request, res: Response) => {
  try {
    const userId = getAuthenticatedUserId(req)
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const firearmId = req.params.firearmId as string

    const groups = await getPreferencesForFirearm(userId, firearmId)

    res.json({
      groups,
      _meta: {
        firearmId,
        totalPreferences: groups.reduce((acc, g) => acc + g.preferences.length, 0),
      },
    })
  } catch (error) {
    const err = error as Error
    log.error('Get firearm ammo preferences error', { message: err.message }, err)

    if (err.message === 'Firearm not found') {
      return res.status(404).json({ error: 'Firearm not found' })
    }

    res.status(500).json({ error: 'Failed to fetch ammo preferences' })
  }
})

// ============================================================================
// POST /api/gun-locker/:firearmId/ammo-preferences - Add preference
// ============================================================================

router.post('/:firearmId/ammo-preferences', async (req: Request, res: Response) => {
  try {
    const userId = getAuthenticatedUserId(req)
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const firearmId = req.params.firearmId as string

    const parsed = addPreferenceSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid data',
        details: parsed.error.issues,
      })
    }

    const { ammoSkuId, useCase } = parsed.data
    const preference = await addPreference(userId, firearmId, ammoSkuId, useCase as AmmoUseCase)

    res.status(201).json({ preference })
  } catch (error) {
    const err = error as Error
    log.error('Add ammo preference error', { message: err.message }, err)

    if (err.message === 'Firearm not found') {
      return res.status(404).json({ error: 'Firearm not found' })
    }

    if (err.message === 'Ammo SKU not found') {
      return res.status(404).json({ error: 'Ammo SKU not found' })
    }

    if (err.message === 'Preference already exists for this ammo and use case') {
      return res.status(409).json({ error: err.message })
    }

    // A6: Caliber mismatch validation
    if (err.message.startsWith('Caliber mismatch:')) {
      return res.status(400).json({ error: err.message })
    }

    res.status(500).json({ error: 'Failed to add ammo preference' })
  }
})

// ============================================================================
// PATCH /api/gun-locker/:firearmId/ammo-preferences/:id - Update preference use case
// ============================================================================

router.patch('/:firearmId/ammo-preferences/:id', async (req: Request, res: Response) => {
  try {
    const userId = getAuthenticatedUserId(req)
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const id = req.params.id as string

    const parsed = updatePreferenceSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid data',
        details: parsed.error.issues,
      })
    }

    const { useCase } = parsed.data
    const preference = await updatePreferenceUseCase(userId, id, useCase as AmmoUseCase)

    res.json({ preference })
  } catch (error) {
    const err = error as Error
    log.error('Update ammo preference error', { message: err.message }, err)

    if (err.message === 'Preference not found') {
      return res.status(404).json({ error: 'Preference not found' })
    }

    if (err.message === 'Preference already exists for this ammo and use case') {
      return res.status(409).json({ error: err.message })
    }

    res.status(500).json({ error: 'Failed to update ammo preference' })
  }
})

// ============================================================================
// DELETE /api/gun-locker/:firearmId/ammo-preferences/:id - Remove preference
// ============================================================================

router.delete('/:firearmId/ammo-preferences/:id', async (req: Request, res: Response) => {
  try {
    const userId = getAuthenticatedUserId(req)
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const id = req.params.id as string

    await removePreference(userId, id)

    res.json({ message: 'Preference removed', preferenceId: id })
  } catch (error) {
    const err = error as Error
    log.error('Remove ammo preference error', { message: err.message }, err)

    if (err.message === 'Preference not found') {
      return res.status(404).json({ error: 'Preference not found' })
    }

    res.status(500).json({ error: 'Failed to remove ammo preference' })
  }
})

// ============================================================================
// GET /api/gun-locker/:firearmId/caliber - Get firearm caliber for scoped search
// ============================================================================

router.get('/:firearmId/caliber', async (req: Request, res: Response) => {
  try {
    const userId = getAuthenticatedUserId(req)
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const firearmId = req.params.firearmId as string

    const caliber = await getFirearmCaliber(userId, firearmId)

    res.json({ caliber })
  } catch (error) {
    const err = error as Error
    log.error('Get firearm caliber error', { message: err.message }, err)

    if (err.message === 'Firearm not found') {
      return res.status(404).json({ error: 'Firearm not found' })
    }

    res.status(500).json({ error: 'Failed to get firearm caliber' })
  }
})

export { router as firearmAmmoPreferenceRouter }

// ============================================================================
// Standalone user preferences router (for My Loadout)
// ============================================================================

const userPreferencesRouter: Router = Router()

// GET /api/ammo-preferences - List all user preferences
userPreferencesRouter.get('/', async (req: Request, res: Response) => {
  try {
    const userId = getAuthenticatedUserId(req)
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const preferences = await getPreferencesForUser(userId)

    res.json({
      preferences,
      _meta: {
        count: preferences.length,
      },
    })
  } catch (error) {
    const err = error as Error
    log.error('Get user ammo preferences error', { message: err.message }, err)
    res.status(500).json({ error: 'Failed to fetch ammo preferences' })
  }
})

export { userPreferencesRouter as ammoPreferencesRouter }
