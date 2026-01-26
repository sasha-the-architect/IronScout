/**
 * Firearm Ammo Preference Service Tests
 *
 * Per firearm_preferred_ammo_mapping_spec_v3.md:
 * - Minimum test set for spec compliance
 *
 * Test coverage:
 * - Supersession dedupe: deprecated + canonical → canonical returned, deprecated soft-deleted
 * - Compatibility blocking: unknown caliber → 400 + blocked event
 * - User deletion: soft-deletes mappings with correct deleteReason
 * - Ordering: updatedAt DESC, tie by ammoSkuId ASC
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// vi.mock must use inline factory - cannot reference external variables
vi.mock('@ironscout/db', () => ({
  prisma: {
    user_guns: {
      findUnique: vi.fn(),
    },
    products: {
      findUnique: vi.fn(),
    },
    firearm_ammo_preferences: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}))

vi.mock('../../config/logger', () => ({
  loggers: {
    watchlist: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  },
}))

// Import the mocked prisma after vi.mock
import { prisma } from '@ironscout/db'
const mockPrisma = prisma as any

import { loggers } from '../../config/logger'
const mockLogger = loggers.watchlist as any

// Import after mocking
import {
  getPreferencesForFirearm,
  getPreferencesForUser,
  addPreference,
  cascadeUserDeletion,
  cascadeFirearmDeletion,
} from '../firearm-ammo-preference'

// ============================================================================
// Test Data Factories
// ============================================================================

function createMockFirearm(overrides: Partial<{
  id: string
  userId: string
  caliber: string | null
}> = {}) {
  return {
    id: 'firearm-1',
    userId: 'user-1',
    caliber: '9mm',
    ...overrides,
  }
}

function createMockProduct(overrides: Partial<{
  id: string
  name: string
  brand: string | null
  caliber: string | null
  grainWeight: number | null
  roundCount: number | null
  isActiveSku: boolean
  supersededById: string | null
}> = {}) {
  return {
    id: 'product-1',
    name: 'Test Ammo 9mm 115gr',
    brand: 'TestBrand',
    caliber: '9mm',
    grainWeight: 115,
    roundCount: 50,
    isActiveSku: true,
    supersededById: null,
    ...overrides,
  }
}

function createMockPreference(overrides: Partial<{
  id: string
  userId: string
  firearmId: string
  ammoSkuId: string
  useCase: 'TRAINING' | 'CARRY' | 'COMPETITION' | 'GENERAL'
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
  deleteReason: string | null
  products: ReturnType<typeof createMockProduct>
}> = {}) {
  const now = new Date()
  return {
    id: 'pref-1',
    userId: 'user-1',
    firearmId: 'firearm-1',
    ammoSkuId: 'product-1',
    useCase: 'TRAINING' as const,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    deleteReason: null,
    products: createMockProduct(),
    ...overrides,
  }
}

// ============================================================================
// Supersession Dedupe Tests
// ============================================================================

/**
 * Helper to set up product mocks for supersession tests.
 * Uses mockImplementation to handle parallel Promise.all calls correctly.
 */
function setupSupersessionMocks(
  deprecatedProduct: ReturnType<typeof createMockProduct>,
  canonicalProduct: ReturnType<typeof createMockProduct>
) {
  // Use mockImplementation to handle calls by their arguments
  // (Promise.all runs mapToAmmoPreference in parallel, so order is non-deterministic)
  mockPrisma.products.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
    if (where.id === deprecatedProduct.id) {
      return Promise.resolve(deprecatedProduct)
    }
    if (where.id === canonicalProduct.id) {
      return Promise.resolve(canonicalProduct)
    }
    return Promise.resolve(null)
  })
}

describe('Supersession dedupe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns canonical only when both deprecated and canonical are mapped', async () => {
    const deprecatedProduct = createMockProduct({
      id: 'deprecated-sku',
      name: 'Old Ammo',
      isActiveSku: false,
      supersededById: 'canonical-sku',
    })

    const canonicalProduct = createMockProduct({
      id: 'canonical-sku',
      name: 'New Ammo',
      isActiveSku: true,
      supersededById: null,
    })

    // User has both deprecated and canonical mapped
    const deprecatedPref = createMockPreference({
      id: 'pref-deprecated',
      ammoSkuId: 'deprecated-sku',
      useCase: 'TRAINING',
      updatedAt: new Date('2024-01-01'), // Older
      products: deprecatedProduct,
    })

    const canonicalPref = createMockPreference({
      id: 'pref-canonical',
      ammoSkuId: 'canonical-sku',
      useCase: 'TRAINING',
      updatedAt: new Date('2024-01-02'), // Newer
      products: canonicalProduct,
    })

    mockPrisma.user_guns.findUnique.mockResolvedValue(createMockFirearm())
    mockPrisma.firearm_ammo_preferences.findMany.mockResolvedValue([
      canonicalPref,
      deprecatedPref,
    ])
    setupSupersessionMocks(deprecatedProduct, canonicalProduct)
    mockPrisma.firearm_ammo_preferences.updateMany.mockResolvedValue({ count: 1 })

    const result = await getPreferencesForFirearm('user-1', 'firearm-1')

    // Should return only one preference (canonical)
    const allPrefs = result.flatMap((g) => g.preferences)
    expect(allPrefs).toHaveLength(1)
    expect(allPrefs[0].ammoSkuId).toBe('canonical-sku')
  })

  it('soft-deletes deprecated mapping with SKU_SUPERSEDED reason', async () => {
    const deprecatedProduct = createMockProduct({
      id: 'deprecated-sku',
      name: 'Old Ammo',
      isActiveSku: false,
      supersededById: 'canonical-sku',
    })

    const canonicalProduct = createMockProduct({
      id: 'canonical-sku',
      name: 'New Ammo',
      isActiveSku: true,
      supersededById: null,
    })

    const deprecatedPref = createMockPreference({
      id: 'pref-deprecated',
      ammoSkuId: 'deprecated-sku',
      useCase: 'TRAINING',
      products: deprecatedProduct,
    })

    const canonicalPref = createMockPreference({
      id: 'pref-canonical',
      ammoSkuId: 'canonical-sku',
      useCase: 'TRAINING',
      products: canonicalProduct,
    })

    mockPrisma.user_guns.findUnique.mockResolvedValue(createMockFirearm())
    mockPrisma.firearm_ammo_preferences.findMany.mockResolvedValue([
      canonicalPref,
      deprecatedPref,
    ])
    setupSupersessionMocks(deprecatedProduct, canonicalProduct)
    mockPrisma.firearm_ammo_preferences.updateMany.mockResolvedValue({ count: 1 })

    await getPreferencesForFirearm('user-1', 'firearm-1')

    // Verify soft-delete was called with SKU_SUPERSEDED
    expect(mockPrisma.firearm_ammo_preferences.updateMany).toHaveBeenCalledWith({
      where: { id: { in: expect.arrayContaining(['pref-deprecated']) } },
      data: {
        deletedAt: expect.any(Date),
        deleteReason: 'SKU_SUPERSEDED',
      },
    })
  })

  it('prefers canonical over deprecated regardless of updatedAt order', async () => {
    // Edge case: deprecated was updated more recently than canonical
    const deprecatedProduct = createMockProduct({
      id: 'deprecated-sku',
      isActiveSku: false,
      supersededById: 'canonical-sku',
    })

    const canonicalProduct = createMockProduct({
      id: 'canonical-sku',
      isActiveSku: true,
    })

    // Deprecated is MORE recent (would win by updatedAt sort)
    const deprecatedPref = createMockPreference({
      id: 'pref-deprecated',
      ammoSkuId: 'deprecated-sku',
      useCase: 'TRAINING',
      updatedAt: new Date('2024-02-01'), // Newer!
      products: deprecatedProduct,
    })

    const canonicalPref = createMockPreference({
      id: 'pref-canonical',
      ammoSkuId: 'canonical-sku',
      useCase: 'TRAINING',
      updatedAt: new Date('2024-01-01'), // Older
      products: canonicalProduct,
    })

    mockPrisma.user_guns.findUnique.mockResolvedValue(createMockFirearm())
    // Deprecated comes first due to updatedAt DESC
    mockPrisma.firearm_ammo_preferences.findMany.mockResolvedValue([
      deprecatedPref,
      canonicalPref,
    ])
    setupSupersessionMocks(deprecatedProduct, canonicalProduct)
    mockPrisma.firearm_ammo_preferences.updateMany.mockResolvedValue({ count: 1 })

    const result = await getPreferencesForFirearm('user-1', 'firearm-1')

    // Should still return canonical, not deprecated
    const allPrefs = result.flatMap((g) => g.preferences)
    expect(allPrefs).toHaveLength(1)
    expect(allPrefs[0].ammoSkuId).toBe('canonical-sku')
  })
})

// ============================================================================
// Compatibility Blocking Tests (A6: Fail-closed)
// ============================================================================

describe('Compatibility blocking (fail-closed)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('blocks when firearm caliber is unknown and emits blocked event', async () => {
    const firearmWithoutCaliber = createMockFirearm({ caliber: null })
    const ammo = createMockProduct({ caliber: '9mm' })

    mockPrisma.user_guns.findUnique.mockResolvedValue(firearmWithoutCaliber)
    mockPrisma.products.findUnique.mockResolvedValue(ammo)

    await expect(
      addPreference('user-1', 'firearm-1', 'product-1', 'TRAINING')
    ).rejects.toThrow('Cannot add ammo: firearm caliber is unknown')

    // Verify blocked event was logged
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'firearm_ammo_preference.blocked',
      expect.objectContaining({
        event: 'firearm_ammo_preference.blocked',
        reason: 'unknown_firearm_caliber',
        userId: 'user-1',
        firearmId: 'firearm-1',
        ammoSkuId: 'product-1',
        firearmCaliber: 'unknown',
        ammoCaliber: '9mm',
      })
    )
  })

  it('blocks when ammo caliber is unknown and emits blocked event', async () => {
    const firearm = createMockFirearm({ caliber: '9mm' })
    const ammoWithoutCaliber = createMockProduct({ caliber: null })

    mockPrisma.user_guns.findUnique.mockResolvedValue(firearm)
    mockPrisma.products.findUnique.mockResolvedValue(ammoWithoutCaliber)

    await expect(
      addPreference('user-1', 'firearm-1', 'product-1', 'TRAINING')
    ).rejects.toThrow('Cannot add ammo: ammo caliber is unknown')

    expect(mockLogger.warn).toHaveBeenCalledWith(
      'firearm_ammo_preference.blocked',
      expect.objectContaining({
        event: 'firearm_ammo_preference.blocked',
        reason: 'unknown_ammo_caliber',
        firearmCaliber: '9mm',
        ammoCaliber: 'unknown',
      })
    )
  })

  it('blocks when calibers mismatch and emits blocked event', async () => {
    const firearm = createMockFirearm({ caliber: '9mm' })
    const ammo = createMockProduct({ caliber: '.45 ACP' })

    mockPrisma.user_guns.findUnique.mockResolvedValue(firearm)
    mockPrisma.products.findUnique.mockResolvedValue(ammo)

    await expect(
      addPreference('user-1', 'firearm-1', 'product-1', 'TRAINING')
    ).rejects.toThrow('Caliber mismatch: firearm is 9mm, ammo is .45 ACP')

    expect(mockLogger.warn).toHaveBeenCalledWith(
      'firearm_ammo_preference.blocked',
      expect.objectContaining({
        event: 'firearm_ammo_preference.blocked',
        reason: 'caliber_mismatch',
        firearmCaliber: '9mm',
        ammoCaliber: '.45 ACP',
      })
    )
  })

  it('allows preference when calibers match', async () => {
    const firearm = createMockFirearm({ caliber: '9mm' })
    const ammo = createMockProduct({ caliber: '9mm' })
    const createdPref = createMockPreference()

    mockPrisma.user_guns.findUnique.mockResolvedValue(firearm)
    mockPrisma.products.findUnique.mockResolvedValue(ammo)
    mockPrisma.firearm_ammo_preferences.findFirst.mockResolvedValue(null)
    mockPrisma.firearm_ammo_preferences.create.mockResolvedValue(createdPref)

    const result = await addPreference('user-1', 'firearm-1', 'product-1', 'TRAINING')

    expect(result).toBeDefined()
    expect(mockLogger.warn).not.toHaveBeenCalled()
  })
})

// ============================================================================
// User Deletion Cascade Tests
// ============================================================================

describe('User deletion cascade', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('soft-deletes all user preferences with USER_REMOVED reason', async () => {
    mockPrisma.firearm_ammo_preferences.updateMany.mockResolvedValue({ count: 5 })

    const count = await cascadeUserDeletion('user-1')

    expect(count).toBe(5)
    expect(mockPrisma.firearm_ammo_preferences.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        deletedAt: null,
      },
      data: {
        deletedAt: expect.any(Date),
        deleteReason: 'USER_REMOVED',
      },
    })
  })

  it('logs the cascade operation', async () => {
    mockPrisma.firearm_ammo_preferences.updateMany.mockResolvedValue({ count: 3 })

    await cascadeUserDeletion('user-1')

    expect(mockLogger.info).toHaveBeenCalledWith(
      'Cascade user deletion: soft-deleted ammo preferences',
      { userId: 'user-1', count: 3 }
    )
  })
})

// ============================================================================
// Firearm Deletion Cascade Tests
// ============================================================================

describe('Firearm deletion cascade', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('soft-deletes preferences for firearm with FIREARM_DELETED reason', async () => {
    mockPrisma.firearm_ammo_preferences.updateMany.mockResolvedValue({ count: 2 })

    const count = await cascadeFirearmDeletion('user-1', 'firearm-1')

    expect(count).toBe(2)
    expect(mockPrisma.firearm_ammo_preferences.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        firearmId: 'firearm-1',
        deletedAt: null,
      },
      data: {
        deletedAt: expect.any(Date),
        deleteReason: 'FIREARM_DELETED',
      },
    })
  })
})

// ============================================================================
// Ordering Tests
// ============================================================================

describe('Preference ordering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('orders by updatedAt DESC within same use case', async () => {
    const older = createMockPreference({
      id: 'pref-older',
      ammoSkuId: 'product-1',
      useCase: 'TRAINING',
      updatedAt: new Date('2024-01-01'),
      products: createMockProduct({ id: 'product-1' }),
    })

    const newer = createMockPreference({
      id: 'pref-newer',
      ammoSkuId: 'product-2',
      useCase: 'TRAINING',
      updatedAt: new Date('2024-02-01'),
      products: createMockProduct({ id: 'product-2' }),
    })

    mockPrisma.user_guns.findUnique.mockResolvedValue(createMockFirearm())
    // Return in updatedAt DESC order (as service would receive from DB)
    mockPrisma.firearm_ammo_preferences.findMany.mockResolvedValue([newer, older])

    const result = await getPreferencesForFirearm('user-1', 'firearm-1')

    const trainingGroup = result.find((g) => g.useCase === 'TRAINING')
    expect(trainingGroup).toBeDefined()
    expect(trainingGroup!.preferences[0].ammoSkuId).toBe('product-2') // Newer first
    expect(trainingGroup!.preferences[1].ammoSkuId).toBe('product-1') // Older second
  })

  it('uses ammoSkuId ASC as tie-breaker when updatedAt is same', async () => {
    const sameTime = new Date('2024-01-01')

    const prefA = createMockPreference({
      id: 'pref-a',
      ammoSkuId: 'aaa-product',
      useCase: 'TRAINING',
      updatedAt: sameTime,
      products: createMockProduct({ id: 'aaa-product' }),
    })

    const prefZ = createMockPreference({
      id: 'pref-z',
      ammoSkuId: 'zzz-product',
      useCase: 'TRAINING',
      updatedAt: sameTime,
      products: createMockProduct({ id: 'zzz-product' }),
    })

    mockPrisma.user_guns.findUnique.mockResolvedValue(createMockFirearm())
    // DB would return with ammoSkuId ASC as tie-breaker
    mockPrisma.firearm_ammo_preferences.findMany.mockResolvedValue([prefA, prefZ])

    const result = await getPreferencesForFirearm('user-1', 'firearm-1')

    const trainingGroup = result.find((g) => g.useCase === 'TRAINING')
    expect(trainingGroup).toBeDefined()
    expect(trainingGroup!.preferences[0].ammoSkuId).toBe('aaa-product')
    expect(trainingGroup!.preferences[1].ammoSkuId).toBe('zzz-product')
  })

  it('groups preferences by use case in fixed order: CARRY, TRAINING, COMPETITION, GENERAL', async () => {
    const prefs = [
      createMockPreference({
        id: 'pref-general',
        useCase: 'GENERAL',
        products: createMockProduct({ id: 'p-general' }),
      }),
      createMockPreference({
        id: 'pref-carry',
        useCase: 'CARRY',
        products: createMockProduct({ id: 'p-carry' }),
      }),
      createMockPreference({
        id: 'pref-training',
        useCase: 'TRAINING',
        products: createMockProduct({ id: 'p-training' }),
      }),
      createMockPreference({
        id: 'pref-competition',
        useCase: 'COMPETITION',
        products: createMockProduct({ id: 'p-competition' }),
      }),
    ]

    mockPrisma.user_guns.findUnique.mockResolvedValue(createMockFirearm())
    mockPrisma.firearm_ammo_preferences.findMany.mockResolvedValue(prefs)

    const result = await getPreferencesForFirearm('user-1', 'firearm-1')

    // Verify fixed order: CARRY, TRAINING, COMPETITION, GENERAL
    expect(result.map((g) => g.useCase)).toEqual([
      'CARRY',
      'TRAINING',
      'COMPETITION',
      'GENERAL',
    ])
  })
})

// ============================================================================
// getPreferencesForUser Tests
// ============================================================================

describe('getPreferencesForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns preferences ordered by updatedAt DESC with ammoSkuId tie-breaker', async () => {
    const prefs = [
      createMockPreference({
        id: 'pref-1',
        ammoSkuId: 'product-newer',
        updatedAt: new Date('2024-02-01'),
        products: createMockProduct({ id: 'product-newer' }),
      }),
      createMockPreference({
        id: 'pref-2',
        ammoSkuId: 'product-older',
        updatedAt: new Date('2024-01-01'),
        products: createMockProduct({ id: 'product-older' }),
      }),
    ]

    mockPrisma.firearm_ammo_preferences.findMany.mockResolvedValue(prefs)

    const result = await getPreferencesForUser('user-1')

    expect(result[0].ammoSkuId).toBe('product-newer')
    expect(result[1].ammoSkuId).toBe('product-older')
  })

  it('dedupes superseded SKUs across all firearms', async () => {
    const deprecatedProduct = createMockProduct({
      id: 'deprecated-sku',
      isActiveSku: false,
      supersededById: 'canonical-sku',
    })

    const canonicalProduct = createMockProduct({
      id: 'canonical-sku',
      isActiveSku: true,
    })

    const prefs = [
      createMockPreference({
        id: 'pref-canonical',
        firearmId: 'firearm-1',
        ammoSkuId: 'canonical-sku',
        useCase: 'TRAINING',
        products: canonicalProduct,
      }),
      createMockPreference({
        id: 'pref-deprecated',
        firearmId: 'firearm-1',
        ammoSkuId: 'deprecated-sku',
        useCase: 'TRAINING',
        products: deprecatedProduct,
      }),
    ]

    mockPrisma.firearm_ammo_preferences.findMany.mockResolvedValue(prefs)
    // Use mockImplementation for parallel Promise.all handling
    mockPrisma.products.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
      if (where.id === deprecatedProduct.id) {
        return Promise.resolve(deprecatedProduct)
      }
      if (where.id === canonicalProduct.id) {
        return Promise.resolve(canonicalProduct)
      }
      return Promise.resolve(null)
    })
    mockPrisma.firearm_ammo_preferences.updateMany.mockResolvedValue({ count: 1 })

    const result = await getPreferencesForUser('user-1')

    // Should only return canonical
    expect(result).toHaveLength(1)
    expect(result[0].ammoSkuId).toBe('canonical-sku')
  })
})
