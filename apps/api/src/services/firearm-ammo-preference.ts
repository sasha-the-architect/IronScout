/**
 * Firearm Ammo Preference Service
 *
 * Per firearm_preferred_ammo_mapping_spec_v3.md:
 * - User-declared ammo usage context for firearms
 * - NOT a recommendation system
 * - Supports recall and re-purchase workflows
 *
 * Key invariants:
 * - Use-case enum only (TRAINING | CARRY | COMPETITION | GENERAL)
 * - No inference, ranking, or recommendations
 * - Soft-delete with delete_reason
 * - Superseded SKUs resolve to canonical at read time
 */

import { prisma } from '@ironscout/db'
import { AmmoUseCase, AmmoPreferenceDeleteReason } from '@ironscout/db/generated/prisma'

// ============================================================================
// Types
// ============================================================================

export { AmmoUseCase, AmmoPreferenceDeleteReason }

export interface AmmoPreference {
  id: string
  firearmId: string
  ammoSkuId: string
  useCase: AmmoUseCase
  createdAt: Date
  updatedAt: Date
  // Resolved ammo SKU data (with supersession)
  ammoSku: {
    id: string
    name: string
    brand: string | null
    caliber: string | null
    grainWeight: number | null
    roundCount: number | null
    isActive: boolean
  }
}

export interface AmmoPreferenceGroup {
  useCase: AmmoUseCase
  preferences: AmmoPreference[]
}

// Use case display order per spec: CARRY, TRAINING, COMPETITION, GENERAL
const USE_CASE_ORDER: AmmoUseCase[] = ['CARRY', 'TRAINING', 'COMPETITION', 'GENERAL']

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Resolve superseded SKU to canonical SKU
 * Per spec: "Deprecated SKUs resolve to canonical SKU at read time"
 */
async function resolveSupersededSku(productId: string): Promise<string> {
  let currentId = productId
  const visited = new Set<string>()

  // Follow supersession chain (with cycle protection)
  while (true) {
    if (visited.has(currentId)) {
      console.warn('[AmmoPreference] Supersession cycle detected', { productId, visited: Array.from(visited) })
      break
    }
    visited.add(currentId)

    const product = await prisma.products.findUnique({
      where: { id: currentId },
      select: { supersededById: true, isActiveSku: true },
    })

    if (!product || !product.supersededById || product.isActiveSku) {
      break
    }

    currentId = product.supersededById
  }

  return currentId
}

/**
 * Map database record to AmmoPreference with resolved SKU data
 */
async function mapToAmmoPreference(
  record: {
    id: string
    firearmId: string
    ammoSkuId: string
    useCase: AmmoUseCase
    createdAt: Date
    updatedAt: Date
    products: {
      id: string
      name: string
      brand: string | null
      caliber: string | null
      grainWeight: number | null
      roundCount: number | null
      isActiveSku: boolean
      supersededById: string | null
    }
  }
): Promise<AmmoPreference> {
  let ammoSku = record.products

  // Resolve supersession if needed
  if (!ammoSku.isActiveSku && ammoSku.supersededById) {
    const canonicalId = await resolveSupersededSku(record.ammoSkuId)
    if (canonicalId !== record.ammoSkuId) {
      const canonical = await prisma.products.findUnique({
        where: { id: canonicalId },
        select: {
          id: true,
          name: true,
          brand: true,
          caliber: true,
          grainWeight: true,
          roundCount: true,
          isActiveSku: true,
          supersededById: true,
        },
      })
      if (canonical) {
        ammoSku = canonical
      }
    }
  }

  return {
    id: record.id,
    firearmId: record.firearmId,
    ammoSkuId: ammoSku.id,
    useCase: record.useCase,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ammoSku: {
      id: ammoSku.id,
      name: ammoSku.name,
      brand: ammoSku.brand,
      caliber: ammoSku.caliber,
      grainWeight: ammoSku.grainWeight,
      roundCount: ammoSku.roundCount,
      isActive: ammoSku.isActiveSku,
    },
  }
}

// ============================================================================
// Core Operations
// ============================================================================

/**
 * Get all ammo preferences for a firearm, grouped by use case
 * Per spec: Fixed display order CARRY, TRAINING, COMPETITION, GENERAL
 */
export async function getPreferencesForFirearm(
  userId: string,
  firearmId: string
): Promise<AmmoPreferenceGroup[]> {
  // Verify firearm belongs to user
  const firearm = await prisma.user_guns.findUnique({
    where: { id: firearmId },
  })

  if (!firearm || firearm.userId !== userId) {
    throw new Error('Firearm not found')
  }

  // Get active preferences
  const preferences = await prisma.firearm_ammo_preferences.findMany({
    where: {
      userId,
      firearmId,
      deletedAt: null,
    },
    include: {
      products: {
        select: {
          id: true,
          name: true,
          brand: true,
          caliber: true,
          grainWeight: true,
          roundCount: true,
          isActiveSku: true,
          supersededById: true,
        },
      },
    },
    orderBy: [
      { updatedAt: 'desc' },
      { ammoSkuId: 'asc' }, // Tie-breaker for deterministic ordering per spec
    ],
  })

  // Map and resolve supersession
  const mapped = await Promise.all(preferences.map(mapToAmmoPreference))

  // A4: Dedupe after supersession resolution - multiple deprecated SKUs may resolve to same canonical
  // Per spec: "If both deprecated and canonical SKUs are mapped, render canonical only"
  const deduped: AmmoPreference[] = []
  const seenKeys = new Set<string>()
  for (const pref of mapped) {
    const key = `${pref.firearmId}:${pref.ammoSkuId}:${pref.useCase}`
    if (!seenKeys.has(key)) {
      seenKeys.add(key)
      deduped.push(pref)
    }
    // Skip duplicates - first one wins (most recently updated due to orderBy)
  }

  // Group by use case in fixed order
  const groups: AmmoPreferenceGroup[] = []
  for (const useCase of USE_CASE_ORDER) {
    const prefs = deduped.filter((p) => p.useCase === useCase)
    if (prefs.length > 0) {
      groups.push({ useCase, preferences: prefs })
    }
  }

  return groups
}

/**
 * Get all ammo preferences for a user (for My Loadout)
 * Per spec: "Most recently updated mapping first"
 */
export async function getPreferencesForUser(
  userId: string
): Promise<AmmoPreference[]> {
  const preferences = await prisma.firearm_ammo_preferences.findMany({
    where: {
      userId,
      deletedAt: null,
    },
    include: {
      products: {
        select: {
          id: true,
          name: true,
          brand: true,
          caliber: true,
          grainWeight: true,
          roundCount: true,
          isActiveSku: true,
          supersededById: true,
        },
      },
    },
    orderBy: [
      { updatedAt: 'desc' },
      { ammoSkuId: 'asc' }, // Tie-breaker per spec
    ],
  })

  return Promise.all(preferences.map(mapToAmmoPreference))
}

/**
 * Add ammo preference for a firearm
 * Per spec: "Ammo can be mapped in ≤2 focused user decisions"
 */
export async function addPreference(
  userId: string,
  firearmId: string,
  ammoSkuId: string,
  useCase: AmmoUseCase
): Promise<AmmoPreference> {
  // Verify firearm belongs to user
  const firearm = await prisma.user_guns.findUnique({
    where: { id: firearmId },
  })

  if (!firearm || firearm.userId !== userId) {
    throw new Error('Firearm not found')
  }

  // Verify ammo SKU exists
  const ammoSku = await prisma.products.findUnique({
    where: { id: ammoSkuId },
    select: {
      id: true,
      name: true,
      brand: true,
      caliber: true,
      grainWeight: true,
      roundCount: true,
      isActiveSku: true,
      supersededById: true,
    },
  })

  if (!ammoSku) {
    throw new Error('Ammo SKU not found')
  }

  // A6: Caliber compatibility validation (fail-closed per ADR-009)
  // Per spec: "Firearm-Scoped Search: Apply caliber compatibility filter"
  if (firearm.caliber && ammoSku.caliber && firearm.caliber !== ammoSku.caliber) {
    console.warn('[AmmoPreference] Caliber mismatch blocked', {
      userId,
      firearmId,
      firearmCaliber: firearm.caliber,
      ammoCaliber: ammoSku.caliber,
      ammoSkuId,
    })
    throw new Error(`Caliber mismatch: firearm is ${firearm.caliber}, ammo is ${ammoSku.caliber}`)
  }

  // Resolve to canonical if superseded
  let resolvedSkuId = ammoSkuId
  if (!ammoSku.isActiveSku && ammoSku.supersededById) {
    resolvedSkuId = await resolveSupersededSku(ammoSkuId)
  }

  // Check for existing active preference (partial unique index handles DB constraint)
  const existing = await prisma.firearm_ammo_preferences.findFirst({
    where: {
      userId,
      firearmId,
      ammoSkuId: resolvedSkuId,
      useCase,
      deletedAt: null,
    },
  })

  if (existing) {
    throw new Error('Preference already exists for this ammo and use case')
  }

  // Create preference
  const preference = await prisma.firearm_ammo_preferences.create({
    data: {
      userId,
      firearmId,
      ammoSkuId: resolvedSkuId,
      useCase,
    },
    include: {
      products: {
        select: {
          id: true,
          name: true,
          brand: true,
          caliber: true,
          grainWeight: true,
          roundCount: true,
          isActiveSku: true,
          supersededById: true,
        },
      },
    },
  })

  return mapToAmmoPreference(preference)
}

/**
 * Update ammo preference use case
 * Per spec: "Overflow: Change use case / Remove"
 */
export async function updatePreferenceUseCase(
  userId: string,
  preferenceId: string,
  newUseCase: AmmoUseCase
): Promise<AmmoPreference> {
  const preference = await prisma.firearm_ammo_preferences.findUnique({
    where: { id: preferenceId },
  })

  if (!preference || preference.userId !== userId || preference.deletedAt) {
    throw new Error('Preference not found')
  }

  // Check for conflict with existing preference at new use case
  const conflict = await prisma.firearm_ammo_preferences.findFirst({
    where: {
      userId,
      firearmId: preference.firearmId,
      ammoSkuId: preference.ammoSkuId,
      useCase: newUseCase,
      deletedAt: null,
      id: { not: preferenceId },
    },
  })

  if (conflict) {
    throw new Error('Preference already exists for this ammo and use case')
  }

  const updated = await prisma.firearm_ammo_preferences.update({
    where: { id: preferenceId },
    data: { useCase: newUseCase },
    include: {
      products: {
        select: {
          id: true,
          name: true,
          brand: true,
          caliber: true,
          grainWeight: true,
          roundCount: true,
          isActiveSku: true,
          supersededById: true,
        },
      },
    },
  })

  return mapToAmmoPreference(updated)
}

/**
 * Remove ammo preference (soft delete)
 * Per spec: "Mappings are soft-deleted"
 */
export async function removePreference(
  userId: string,
  preferenceId: string,
  reason: AmmoPreferenceDeleteReason = 'USER_REMOVED'
): Promise<void> {
  const preference = await prisma.firearm_ammo_preferences.findUnique({
    where: { id: preferenceId },
  })

  if (!preference || preference.userId !== userId) {
    throw new Error('Preference not found')
  }

  if (preference.deletedAt) {
    // Already deleted
    return
  }

  await prisma.firearm_ammo_preferences.update({
    where: { id: preferenceId },
    data: {
      deletedAt: new Date(),
      deleteReason: reason,
    },
  })
}

/**
 * Handle firearm deletion - cascade soft-delete preferences
 * Per spec: "Firearm deletion: Cascade soft-delete all mappings with delete_reason = FIREARM_DELETED"
 */
export async function cascadeFirearmDeletion(
  userId: string,
  firearmId: string
): Promise<number> {
  const result = await prisma.firearm_ammo_preferences.updateMany({
    where: {
      userId,
      firearmId,
      deletedAt: null,
    },
    data: {
      deletedAt: new Date(),
      deleteReason: 'FIREARM_DELETED',
    },
  })

  return result.count
}

/**
 * Handle SKU supersession - migrate preferences to canonical
 * Per spec: "If both deprecated and canonical SKUs are mapped:
 *   - Render canonical only.
 *   - Soft-delete deprecated mapping with delete_reason = SKU_SUPERSEDED."
 */
export async function handleSkuSupersession(
  deprecatedSkuId: string,
  canonicalSkuId: string
): Promise<number> {
  // Find all preferences pointing to deprecated SKU
  const deprecatedPrefs = await prisma.firearm_ammo_preferences.findMany({
    where: {
      ammoSkuId: deprecatedSkuId,
      deletedAt: null,
    },
  })

  let migratedCount = 0

  for (const pref of deprecatedPrefs) {
    // Check if canonical already exists for same user+firearm+useCase
    const existingCanonical = await prisma.firearm_ammo_preferences.findFirst({
      where: {
        userId: pref.userId,
        firearmId: pref.firearmId,
        ammoSkuId: canonicalSkuId,
        useCase: pref.useCase,
        deletedAt: null,
      },
    })

    if (existingCanonical) {
      // Both exist - soft-delete deprecated
      await prisma.firearm_ammo_preferences.update({
        where: { id: pref.id },
        data: {
          deletedAt: new Date(),
          deleteReason: 'SKU_SUPERSEDED',
        },
      })
    } else {
      // Only deprecated exists - migrate to canonical
      await prisma.firearm_ammo_preferences.update({
        where: { id: pref.id },
        data: { ammoSkuId: canonicalSkuId },
      })
    }

    migratedCount++
  }

  return migratedCount
}

/**
 * Get caliber compatibility check for firearm-scoped search
 * Per spec: "Firearm-Scoped Search: Apply caliber compatibility filter"
 */
export async function getFirearmCaliber(
  userId: string,
  firearmId: string
): Promise<string | null> {
  const firearm = await prisma.user_guns.findUnique({
    where: { id: firearmId },
  })

  if (!firearm || firearm.userId !== userId) {
    throw new Error('Firearm not found')
  }

  return firearm.caliber
}
