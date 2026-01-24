/**
 * Search Service Tests
 *
 * CRITICAL: These tests verify the core search functionality of IronScout.
 * Search is the key platform feature - these tests protect against regressions.
 *
 * Key invariants tested:
 * 1. AI intent values (purpose, brands, grainWeights, caseMaterials) should NOT be used as hard filters
 * 2. Only explicit user filters should be applied as hard database filters
 * 3. Caliber from intent IS applied (fundamental to ammunition search)
 * 4. AI intent values are used for scoring/ranking, not filtering
 * 5. Premium features are properly gated
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the database before importing the search service
vi.mock('@ironscout/db', () => ({
  prisma: {
    products: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    $disconnect: vi.fn(),
  },
  Prisma: {
    sql: vi.fn(),
  },
}))

// Mock other services that require external dependencies
vi.mock('../intent-parser', async (importOriginal) => {
  const actual = await importOriginal() as any
  return {
    ...actual,
    parseSearchIntent: vi.fn().mockResolvedValue({
      calibers: ['9mm'],
      purpose: 'Target',
      confidence: 0.8,
      originalQuery: 'test',
    }),
  }
})

vi.mock('../embedding-service', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0)),
  buildProductText: vi.fn().mockReturnValue('test'),
}))

vi.mock('../price-resolver', () => ({
  batchGetPricesViaProductLinks: vi.fn().mockResolvedValue(new Map()),
  batchGetPricesWithConfidence: vi.fn().mockResolvedValue({ confidenceMap: new Map() }),
}))

vi.mock('../price-signal-index', () => ({
  batchCalculatePriceSignalIndex: vi.fn().mockResolvedValue(new Map()),
  PriceSignalIndex: {},
}))

vi.mock('../premium-ranking', () => ({
  applyPremiumRanking: vi.fn().mockImplementation((products) => products),
  applyFreeRanking: vi.fn().mockImplementation((products) => products),
}))

vi.mock('../../lens', () => ({
  isLensEnabled: vi.fn().mockReturnValue(false),
  applyLensPipeline: vi.fn(),
  InvalidLensError: class extends Error {},
}))

vi.mock('../../../config/logger', () => ({
  loggers: {
    ai: {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  },
  logger: {
    child: () => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('../cache', () => ({
  getCachedIntent: vi.fn().mockResolvedValue(null),
  cacheIntent: vi.fn().mockResolvedValue(undefined),
  getCachedEmbedding: vi.fn().mockResolvedValue(null),
  cacheEmbedding: vi.fn().mockResolvedValue(undefined),
}))

import { _testExports, ExplicitFilters } from '../search-service'
import { SearchIntent } from '../intent-parser'

const {
  mergeFiltersWithIntent,
  buildWhereClause,
  buildPriceConditions,
  reRankProducts,
  formatProduct,
  addCondition,
} = _testExports

// =============================================
// Test Helpers
// =============================================

function createBaseIntent(overrides: Partial<SearchIntent> = {}): SearchIntent {
  return {
    originalQuery: 'test query',
    confidence: 0.8,
    ...overrides,
  }
}

function createProduct(overrides: Partial<any> = {}): any {
  return {
    id: 'test-product-1',
    name: 'Test Ammo 9mm 115gr FMJ',
    description: 'Test ammunition',
    category: 'AMMUNITION',
    brand: 'Federal',
    caliber: '9mm',
    grainWeight: 115,
    caseMaterial: 'Brass',
    purpose: 'Target',
    roundCount: 50,
    prices: [
      {
        id: 'price-1',
        price: 24.99,
        currency: 'USD',
        url: 'https://example.com/product',
        inStock: true,
        retailers: {
          id: 'retailer-1',
          name: 'Test Retailer',
          tier: 'PREMIUM',
          logoUrl: 'https://example.com/logo.png',
        },
      },
    ],
    ...overrides,
  }
}

// =============================================
// buildWhereClause Tests
// =============================================

describe('buildWhereClause', () => {
  const isPremium = true

  describe('CRITICAL: AI intent values should NOT become hard filters', () => {
    it('should NOT filter by AI intent purpose', () => {
      const intent = createBaseIntent({
        calibers: ['9mm'],
        purpose: 'Target', // AI detected purpose
      })
      const explicitFilters: ExplicitFilters = {}

      const where = buildWhereClause(intent, explicitFilters, isPremium)

      // Should have caliber filter but NOT purpose filter
      expect(where.OR).toBeDefined()
      expect(where.purpose).toBeUndefined()
      expect(where.AND).toBeUndefined() // No AND clause with purpose
    })

    it('should NOT filter by AI intent brands', () => {
      const intent = createBaseIntent({
        calibers: ['9mm'],
        brands: ['Federal', 'Hornady'], // AI detected brands
      })
      const explicitFilters: ExplicitFilters = {}

      const where = buildWhereClause(intent, explicitFilters, isPremium)

      // Should have caliber filter but NOT brand filter
      expect(where.OR).toBeDefined()
      expect(where.brand).toBeUndefined()
    })

    it('should NOT filter by AI intent grainWeights', () => {
      const intent = createBaseIntent({
        calibers: ['9mm'],
        grainWeights: [115, 124, 147], // AI detected grain weights
      })
      const explicitFilters: ExplicitFilters = {}

      const where = buildWhereClause(intent, explicitFilters, isPremium)

      // Should have caliber filter but NOT grainWeight filter
      expect(where.OR).toBeDefined()
      expect(where.grainWeight).toBeUndefined()
    })

    it('should NOT filter by AI intent caseMaterials', () => {
      const intent = createBaseIntent({
        calibers: ['9mm'],
        caseMaterials: ['Brass', 'Steel'], // AI detected case materials
      })
      const explicitFilters: ExplicitFilters = {}

      const where = buildWhereClause(intent, explicitFilters, isPremium)

      // Should have caliber filter but NOT caseMaterial filter
      expect(where.OR).toBeDefined()
      expect(where.caseMaterial).toBeUndefined()
    })

    it('should NOT filter by ANY AI intent when user specifies only caliber explicitly', () => {
      const intent = createBaseIntent({
        calibers: ['9mm'],
        purpose: 'Target',
        brands: ['Federal'],
        grainWeights: [115, 124],
        caseMaterials: ['Brass'],
      })
      const explicitFilters: ExplicitFilters = {
        caliber: '9mm',
      }

      const where = buildWhereClause(intent, explicitFilters, isPremium)

      // Should only have caliber filter
      expect(where.OR).toBeDefined()
      expect(where.OR).toHaveLength(1)
      expect(where.purpose).toBeUndefined()
      expect(where.brand).toBeUndefined()
      expect(where.grainWeight).toBeUndefined()
      expect(where.caseMaterial).toBeUndefined()
    })
  })

  describe('Caliber filter behavior', () => {
    it('should apply caliber from AI intent (fundamental to search)', () => {
      const intent = createBaseIntent({
        calibers: ['9mm'],
      })
      const explicitFilters: ExplicitFilters = {}

      const where = buildWhereClause(intent, explicitFilters, isPremium)

      expect(where.OR).toBeDefined()
      expect(where.OR).toHaveLength(1)
      expect(where.OR[0].caliberNorm.contains).toBe('9mm')
    })

    it('should handle multiple calibers from AI intent', () => {
      const intent = createBaseIntent({
        calibers: ['9mm', '.45 ACP'],
      })
      const explicitFilters: ExplicitFilters = {}

      const where = buildWhereClause(intent, explicitFilters, isPremium)

      expect(where.OR).toBeDefined()
      expect(where.OR).toHaveLength(2)
    })

    it('should prefer explicit caliber over AI intent caliber', () => {
      const intent = createBaseIntent({
        calibers: ['9mm'],
      })
      const explicitFilters: ExplicitFilters = {
        caliber: '.45 ACP',
      }

      const where = buildWhereClause(intent, explicitFilters, isPremium)

      expect(where.OR).toBeDefined()
      expect(where.OR).toHaveLength(1)
      expect(where.OR[0].caliberNorm.contains).toBe('.45 ACP')
    })
  })

  describe('Explicit filter application', () => {
    it('should apply explicit purpose filter', () => {
      const intent = createBaseIntent({
        calibers: ['9mm'],
      })
      const explicitFilters: ExplicitFilters = {
        purpose: 'Defense',
      }

      const where = buildWhereClause(intent, explicitFilters, isPremium)

      expect(where.AND).toBeDefined()
      expect(where.AND).toHaveLength(2)
      expect(where.AND[1].purpose.contains).toBe('Defense')
    })

    it('should apply explicit brand filter', () => {
      const intent = createBaseIntent({
        calibers: ['9mm'],
      })
      const explicitFilters: ExplicitFilters = {
        brand: 'Federal',
      }

      const where = buildWhereClause(intent, explicitFilters, isPremium)

      // With caliber present, brand goes into AND clause
      expect(where.AND).toBeDefined()
      const brandCondition = where.AND.find((c: any) => c.brand)
      expect(brandCondition.brand.contains).toBe('Federal')
    })

    it('should apply explicit caseMaterial filter', () => {
      const intent = createBaseIntent({
        calibers: ['9mm'],
      })
      const explicitFilters: ExplicitFilters = {
        caseMaterial: 'Brass',
      }

      const where = buildWhereClause(intent, explicitFilters, isPremium)

      // With caliber present, caseMaterial goes into AND clause
      expect(where.AND).toBeDefined()
      const caseMaterialCondition = where.AND.find((c: any) => c.caseMaterial)
      expect(caseMaterialCondition.caseMaterial.contains).toBe('Brass')
    })

    it('should apply explicit grain range filters', () => {
      const intent = createBaseIntent({
        calibers: ['9mm'],
      })
      const explicitFilters: ExplicitFilters = {
        minGrain: 115,
        maxGrain: 147,
      }

      const where = buildWhereClause(intent, explicitFilters, isPremium)

      // With caliber present, grain filters go into AND clause
      expect(where.AND).toBeDefined()
      const grainCondition = where.AND.find((c: any) => c.grainWeight)
      expect(grainCondition.grainWeight.gte).toBe(115)
      expect(grainCondition.grainWeight.lte).toBe(147)
    })

    it('should apply multiple explicit filters together', () => {
      const intent = createBaseIntent({
        calibers: ['9mm'],
      })
      const explicitFilters: ExplicitFilters = {
        purpose: 'Target',
        brand: 'Federal',
        minGrain: 115,
      }

      const where = buildWhereClause(intent, explicitFilters, isPremium)

      // All explicit filters should be applied
      expect(where.AND).toBeDefined()
    })
  })

  describe('Premium filter support', () => {
    it('should apply bulletType filter when premium', () => {
      const intent = createBaseIntent({
        calibers: ['9mm'],
      })
      const explicitFilters: ExplicitFilters = {
        bulletType: 'FMJ',
      }

      const where = buildWhereClause(intent, explicitFilters, true)

      // With caliber present, bulletType goes into AND clause
      expect(where.AND).toBeDefined()
      const bulletTypeCondition = where.AND.find((c: any) => c.bulletType !== undefined)
      expect(bulletTypeCondition.bulletType).toBe('FMJ')
    })

    it('should apply pressureRating filter when premium', () => {
      const intent = createBaseIntent({
        calibers: ['9mm'],
      })
      const explicitFilters: ExplicitFilters = {
        pressureRating: 'STANDARD',
      }

      const where = buildWhereClause(intent, explicitFilters, true)

      // With caliber present, pressureRating goes into AND clause
      expect(where.AND).toBeDefined()
      const pressureRatingCondition = where.AND.find((c: any) => c.pressureRating !== undefined)
      expect(pressureRatingCondition.pressureRating).toBe('STANDARD')
    })

    it('should apply subsonic filter when premium', () => {
      const intent = createBaseIntent({
        calibers: ['9mm'],
      })
      const explicitFilters: ExplicitFilters = {
        isSubsonic: true,
      }

      const where = buildWhereClause(intent, explicitFilters, true)

      // With caliber present, isSubsonic goes into AND clause
      expect(where.AND).toBeDefined()
      const subsonicCondition = where.AND.find((c: any) => c.isSubsonic !== undefined)
      expect(subsonicCondition.isSubsonic).toBe(true)
    })

    it('should apply velocity range filters when premium', () => {
      const intent = createBaseIntent({
        calibers: ['9mm'],
      })
      const explicitFilters: ExplicitFilters = {
        minVelocity: 1000,
        maxVelocity: 1200,
      }

      const where = buildWhereClause(intent, explicitFilters, true)

      // With caliber present, velocity goes into AND clause
      expect(where.AND).toBeDefined()
      const velocityCondition = where.AND.find((c: any) => c.muzzleVelocityFps !== undefined)
      expect(velocityCondition.muzzleVelocityFps.gte).toBe(1000)
      expect(velocityCondition.muzzleVelocityFps.lte).toBe(1200)
    })

    it('should NOT apply premium filters when not premium', () => {
      const intent = createBaseIntent({
        calibers: ['9mm'],
      })
      const explicitFilters: ExplicitFilters = {
        bulletType: 'FMJ',
        pressureRating: 'STANDARD',
      }

      const where = buildWhereClause(intent, explicitFilters, false)

      expect(where.bulletType).toBeUndefined()
      expect(where.pressureRating).toBeUndefined()
    })
  })

  describe('Keyword fallback', () => {
    it('should fall back to keyword search when no structured filters match', () => {
      const intent = createBaseIntent({
        originalQuery: 'some random ammo search',
        keywords: ['random', 'ammo'],
      })
      const explicitFilters: ExplicitFilters = {}

      const where = buildWhereClause(intent, explicitFilters, isPremium)

      expect(where.OR).toBeDefined()
      // Keywords should search name, description, brand
      expect(where.OR.length).toBeGreaterThan(0)
    })
  })
})

// =============================================
// mergeFiltersWithIntent Tests
// =============================================

describe('mergeFiltersWithIntent', () => {
  describe('Caliber merging', () => {
    it('should override AI caliber with explicit caliber', () => {
      const intent = createBaseIntent({
        calibers: ['9mm'],
      })
      const filters: ExplicitFilters = {
        caliber: '.45 ACP',
      }

      const merged = mergeFiltersWithIntent(intent, filters)

      expect(merged.calibers).toEqual(['.45 ACP'])
    })

    it('should preserve AI caliber when no explicit caliber', () => {
      const intent = createBaseIntent({
        calibers: ['9mm', '.380'],
      })
      const filters: ExplicitFilters = {}

      const merged = mergeFiltersWithIntent(intent, filters)

      expect(merged.calibers).toEqual(['9mm', '.380'])
    })

    it('should discard AI grain weights when caliber explicitly changed', () => {
      const intent = createBaseIntent({
        calibers: ['9mm'],
        grainWeights: [115, 124], // 9mm typical weights
      })
      const filters: ExplicitFilters = {
        caliber: '.223', // Different caliber - grain weights would be wrong
      }

      const merged = mergeFiltersWithIntent(intent, filters)

      expect(merged.calibers).toEqual(['.223'])
      expect(merged.grainWeights).toBeUndefined()
    })
  })

  describe('Purpose merging', () => {
    it('should override AI purpose with explicit purpose', () => {
      const intent = createBaseIntent({
        purpose: 'Target',
      })
      const filters: ExplicitFilters = {
        purpose: 'Defense',
      }

      const merged = mergeFiltersWithIntent(intent, filters)

      expect(merged.purpose).toBe('Defense')
    })

    it('should preserve AI purpose when no explicit purpose', () => {
      const intent = createBaseIntent({
        purpose: 'Target',
      })
      const filters: ExplicitFilters = {}

      const merged = mergeFiltersWithIntent(intent, filters)

      expect(merged.purpose).toBe('Target')
    })
  })

  describe('Case material merging', () => {
    it('should override AI case material with explicit case material', () => {
      const intent = createBaseIntent({
        caseMaterials: ['Steel'],
      })
      const filters: ExplicitFilters = {
        caseMaterial: 'Brass',
      }

      const merged = mergeFiltersWithIntent(intent, filters)

      expect(merged.caseMaterials).toEqual(['Brass'])
    })
  })

  describe('Grain weight merging', () => {
    it('should discard AI grain weights when explicit min/max specified', () => {
      const intent = createBaseIntent({
        grainWeights: [115, 124],
      })
      const filters: ExplicitFilters = {
        minGrain: 100,
        maxGrain: 150,
      }

      const merged = mergeFiltersWithIntent(intent, filters)

      expect(merged.grainWeights).toBeUndefined()
    })
  })

  describe('Brand merging', () => {
    it('should override AI brands with explicit brand', () => {
      const intent = createBaseIntent({
        brands: ['Hornady', 'Speer'],
      })
      const filters: ExplicitFilters = {
        brand: 'Federal',
      }

      const merged = mergeFiltersWithIntent(intent, filters)

      expect(merged.brands).toEqual(['Federal'])
    })
  })

  describe('Price merging', () => {
    it('should override AI price with explicit price', () => {
      const intent = createBaseIntent({
        minPrice: 10,
        maxPrice: 50,
      })
      const filters: ExplicitFilters = {
        minPrice: 20,
        maxPrice: 40,
      }

      const merged = mergeFiltersWithIntent(intent, filters)

      expect(merged.minPrice).toBe(20)
      expect(merged.maxPrice).toBe(40)
    })
  })

  describe('In-stock merging', () => {
    it('should override AI in-stock with explicit in-stock', () => {
      const intent = createBaseIntent({
        inStockOnly: false,
      })
      const filters: ExplicitFilters = {
        inStock: true,
      }

      const merged = mergeFiltersWithIntent(intent, filters)

      expect(merged.inStockOnly).toBe(true)
    })
  })
})

// =============================================
// buildPriceConditions Tests
// =============================================

describe('buildPriceConditions', () => {
  it('should return empty object when no price conditions', () => {
    const intent = createBaseIntent({})
    const filters: ExplicitFilters = {}

    const conditions = buildPriceConditions(intent, filters)

    expect(conditions).toEqual({})
  })

  it('should include minPrice from explicit filters', () => {
    const intent = createBaseIntent({})
    const filters: ExplicitFilters = {
      minPrice: 20,
    }

    const conditions = buildPriceConditions(intent, filters)

    expect(conditions.price?.gte).toBe(20)
  })

  it('should include maxPrice from explicit filters', () => {
    const intent = createBaseIntent({})
    const filters: ExplicitFilters = {
      maxPrice: 50,
    }

    const conditions = buildPriceConditions(intent, filters)

    expect(conditions.price?.lte).toBe(50)
  })

  it('should include both min and max price', () => {
    const intent = createBaseIntent({})
    const filters: ExplicitFilters = {
      minPrice: 20,
      maxPrice: 50,
    }

    const conditions = buildPriceConditions(intent, filters)

    expect(conditions.price?.gte).toBe(20)
    expect(conditions.price?.lte).toBe(50)
  })

  it('should include inStock condition', () => {
    const intent = createBaseIntent({})
    const filters: ExplicitFilters = {
      inStock: true,
    }

    const conditions = buildPriceConditions(intent, filters)

    expect(conditions.inStock).toBe(true)
  })

  it('should fallback to intent price when no explicit filter', () => {
    const intent = createBaseIntent({
      minPrice: 15,
      maxPrice: 45,
    })
    const filters: ExplicitFilters = {}

    const conditions = buildPriceConditions(intent, filters)

    expect(conditions.price?.gte).toBe(15)
    expect(conditions.price?.lte).toBe(45)
  })

  it('should prefer explicit price over intent price', () => {
    const intent = createBaseIntent({
      minPrice: 15,
      maxPrice: 45,
    })
    const filters: ExplicitFilters = {
      minPrice: 20,
    }

    const conditions = buildPriceConditions(intent, filters)

    expect(conditions.price?.gte).toBe(20)
    expect(conditions.price?.lte).toBe(45)
  })
})

// =============================================
// reRankProducts Tests
// =============================================

describe('reRankProducts', () => {
  describe('Grain weight scoring', () => {
    it('should boost products matching AI intent grain weights', () => {
      const intent = createBaseIntent({
        grainWeights: [115],
      })
      const products = [
        createProduct({ id: 'p1', grainWeight: 115 }), // Exact match
        createProduct({ id: 'p2', grainWeight: 147 }), // No match
      ]

      const ranked = reRankProducts(products, intent)

      const p1Score = ranked.find((p: any) => p.id === 'p1')._relevanceScore
      const p2Score = ranked.find((p: any) => p.id === 'p2')._relevanceScore

      expect(p1Score).toBeGreaterThan(p2Score)
    })

    it('should give partial score for close grain weights', () => {
      const intent = createBaseIntent({
        grainWeights: [115],
      })
      const products = [
        createProduct({ id: 'p1', grainWeight: 115 }), // Exact match
        createProduct({ id: 'p2', grainWeight: 118 }), // Close match (within 5)
        createProduct({ id: 'p3', grainWeight: 147 }), // Far match
      ]

      const ranked = reRankProducts(products, intent)

      const p1Score = ranked.find((p: any) => p.id === 'p1')._relevanceScore
      const p2Score = ranked.find((p: any) => p.id === 'p2')._relevanceScore
      const p3Score = ranked.find((p: any) => p.id === 'p3')._relevanceScore

      expect(p1Score).toBeGreaterThan(p2Score)
      expect(p2Score).toBeGreaterThan(p3Score)
    })
  })

  describe('Quality level scoring', () => {
    it('should boost match-grade products for match-grade intent', () => {
      const intent = createBaseIntent({
        qualityLevel: 'match-grade',
      })
      const products = [
        createProduct({ id: 'p1', name: 'Match Grade 9mm Premium' }),
        createProduct({ id: 'p2', name: 'Regular 9mm FMJ' }),
      ]

      const ranked = reRankProducts(products, intent)

      const p1Score = ranked.find((p: any) => p.id === 'p1')._relevanceScore
      const p2Score = ranked.find((p: any) => p.id === 'p2')._relevanceScore

      expect(p1Score).toBeGreaterThan(p2Score)
    })

    it('should boost budget products for budget intent', () => {
      const intent = createBaseIntent({
        qualityLevel: 'budget',
      })
      // Use product names that match QUALITY_INDICATORS.budget
      const products = [
        createProduct({
          id: 'p1',
          name: 'Value Pack Range Ammo',
          prices: [{ id: 'pr1', price: 0.30, inStock: true, retailers: {} }],
        }),
        createProduct({
          id: 'p2',
          name: 'HST Premium Defense',
          prices: [{ id: 'pr2', price: 1.50, inStock: true, retailers: {} }],
        }),
      ]

      const ranked = reRankProducts(products, intent)

      const p1Score = ranked.find((p: any) => p.id === 'p1')._relevanceScore
      const p2Score = ranked.find((p: any) => p.id === 'p2')._relevanceScore

      // p1 should have higher score due to 'value' keyword matching budget quality
      expect(p1Score).toBeGreaterThanOrEqual(p2Score)
    })
  })

  describe('Case material scoring', () => {
    it('should boost products matching AI intent case material', () => {
      const intent = createBaseIntent({
        caseMaterials: ['Brass'],
      })
      const products = [
        createProduct({ id: 'p1', caseMaterial: 'Brass' }),
        createProduct({ id: 'p2', caseMaterial: 'Steel' }),
      ]

      const ranked = reRankProducts(products, intent)

      const p1Score = ranked.find((p: any) => p.id === 'p1')._relevanceScore
      const p2Score = ranked.find((p: any) => p.id === 'p2')._relevanceScore

      expect(p1Score).toBeGreaterThan(p2Score)
    })
  })

  describe('Brand scoring', () => {
    it('should boost products matching AI intent brands', () => {
      const intent = createBaseIntent({
        brands: ['Federal'],
      })
      const products = [
        createProduct({ id: 'p1', brand: 'Federal' }),
        createProduct({ id: 'p2', brand: 'Tula' }),
      ]

      const ranked = reRankProducts(products, intent)

      const p1Score = ranked.find((p: any) => p.id === 'p1')._relevanceScore
      const p2Score = ranked.find((p: any) => p.id === 'p2')._relevanceScore

      expect(p1Score).toBeGreaterThan(p2Score)
    })
  })

  describe('Purpose scoring', () => {
    it('should boost products matching AI intent purpose', () => {
      const intent = createBaseIntent({
        purpose: 'Target',
      })
      const products = [
        createProduct({ id: 'p1', purpose: 'Target' }),
        createProduct({ id: 'p2', purpose: 'Defense' }),
      ]

      const ranked = reRankProducts(products, intent)

      const p1Score = ranked.find((p: any) => p.id === 'p1')._relevanceScore
      const p2Score = ranked.find((p: any) => p.id === 'p2')._relevanceScore

      expect(p1Score).toBeGreaterThan(p2Score)
    })
  })

  describe('Stock availability scoring', () => {
    it('should boost in-stock products', () => {
      const intent = createBaseIntent({})
      const products = [
        createProduct({
          id: 'p1',
          prices: [{ id: 'pr1', price: 25, inStock: true, retailers: {} }],
        }),
        createProduct({
          id: 'p2',
          prices: [{ id: 'pr2', price: 25, inStock: false, retailers: {} }],
        }),
      ]

      const ranked = reRankProducts(products, intent)

      const p1Score = ranked.find((p: any) => p.id === 'p1')._relevanceScore
      const p2Score = ranked.find((p: any) => p.id === 'p2')._relevanceScore

      expect(p1Score).toBeGreaterThan(p2Score)
    })
  })

  describe('Combined scoring', () => {
    it('should combine multiple scoring factors', () => {
      const intent = createBaseIntent({
        grainWeights: [115],
        purpose: 'Target',
        brands: ['Federal'],
      })
      const products = [
        createProduct({
          id: 'best',
          grainWeight: 115,
          purpose: 'Target',
          brand: 'Federal',
        }),
        createProduct({
          id: 'medium',
          grainWeight: 115,
          purpose: 'Defense',
          brand: 'Hornady',
        }),
        createProduct({
          id: 'worst',
          grainWeight: 147,
          purpose: 'Defense',
          brand: 'Tula',
        }),
      ]

      const ranked = reRankProducts(products, intent)

      expect(ranked[0].id).toBe('best')
      expect(ranked[2].id).toBe('worst')
    })
  })
})

// =============================================
// formatProduct Tests
// =============================================

describe('formatProduct', () => {
  describe('Base product formatting', () => {
    it('should include all base fields', () => {
      const product = createProduct()

      const formatted = formatProduct(product, false)

      expect(formatted.id).toBe('test-product-1')
      expect(formatted.name).toBe('Test Ammo 9mm 115gr FMJ')
      expect(formatted.brand).toBe('Federal')
      expect(formatted.caliber).toBe('9mm')
      expect(formatted.grainWeight).toBe(115)
      expect(formatted.caseMaterial).toBe('Brass')
      expect(formatted.purpose).toBe('Target')
      expect(formatted.roundCount).toBe(50)
    })

    it('should format prices correctly', () => {
      const product = createProduct()

      const formatted = formatProduct(product, false)

      expect(formatted.prices).toHaveLength(1)
      expect(formatted.prices[0].price).toBe(24.99)
      expect(formatted.prices[0].inStock).toBe(true)
      expect(formatted.prices[0].retailer.name).toBe('Test Retailer')
    })
  })

  describe('Price context tier enforcement', () => {
    it('should include only contextBand for FREE tier', () => {
      const product = createProduct({
        _priceSignal: {
          contextBand: 'LOW',
          relativePricePct: -10,
          positionInRange: 0.25,
          meta: { windowDays: 30, sampleCount: 100, asOf: '2024-01-01' },
        },
      })

      const formatted = formatProduct(product, false)

      expect(formatted.priceContext).toBeDefined()
      expect(formatted.priceContext.contextBand).toBe('LOW')
      expect(formatted.priceContext.relativePricePct).toBeUndefined()
      expect(formatted.priceContext.positionInRange).toBeUndefined()
      expect(formatted.priceContext.meta).toBeUndefined()
    })

    it('should include full priceContext for PREMIUM tier', () => {
      const product = createProduct({
        _priceSignal: {
          contextBand: 'LOW',
          relativePricePct: -10,
          positionInRange: 0.25,
          meta: { windowDays: 30, sampleCount: 100, asOf: '2024-01-01' },
        },
      })

      const formatted = formatProduct(product, true)

      expect(formatted.priceContext).toBeDefined()
      expect(formatted.priceContext.contextBand).toBe('LOW')
      expect(formatted.priceContext.relativePricePct).toBe(-10)
      expect(formatted.priceContext.positionInRange).toBe(0.25)
      expect(formatted.priceContext.meta).toBeDefined()
    })
  })

  describe('Premium fields', () => {
    it('should NOT include premium fields for FREE tier', () => {
      const product = createProduct({
        bulletType: 'FMJ',
        pressureRating: 'STANDARD',
        muzzleVelocityFps: 1150,
        isSubsonic: false,
      })

      const formatted = formatProduct(product, false)

      expect(formatted.premium).toBeUndefined()
    })

    it('should include premium fields for PREMIUM tier', () => {
      const product = createProduct({
        bulletType: 'FMJ',
        pressureRating: 'STANDARD',
        muzzleVelocityFps: 1150,
        isSubsonic: false,
        matchGrade: false,
      })

      const formatted = formatProduct(product, true)

      expect(formatted.premium).toBeDefined()
      expect(formatted.premium.bulletType).toBe('FMJ')
      expect(formatted.premium.pressureRating).toBe('STANDARD')
      expect(formatted.premium.muzzleVelocityFps).toBe(1150)
    })

    it('should include premiumRanking data when available', () => {
      const product = createProduct({
        premiumRanking: {
          finalScore: 85,
          breakdown: { grain: 30, quality: 25, brand: 15 },
          badges: ['match-grade', 'premium-brand'],
          explanation: 'Great match for target shooting',
          priceSignal: {
            relativePricePct: -5,
            positionInRange: 0.3,
            contextBand: 'LOW',
            meta: { windowDays: 30, sampleCount: 50, asOf: '2024-01-01' },
          },
        },
      })

      const formatted = formatProduct(product, true)

      expect(formatted.premium.premiumRanking).toBeDefined()
      expect(formatted.premium.premiumRanking.finalScore).toBe(85)
      expect(formatted.premium.premiumRanking.badges).toContain('match-grade')
    })
  })
})

// =============================================
// addCondition Helper Tests
// =============================================

describe('addCondition', () => {
  it('should add condition to empty where clause', () => {
    const where: any = {}

    addCondition(where, { field1: 'value1' })

    expect(where.field1).toBe('value1')
  })

  it('should create AND clause when OR already exists', () => {
    const where: any = {
      OR: [{ caliber: '9mm' }],
    }

    addCondition(where, { brand: 'Federal' })

    expect(where.AND).toBeDefined()
    expect(where.AND).toHaveLength(2)
    expect(where.OR).toBeUndefined()
  })

  it('should append to existing AND clause', () => {
    const where: any = {
      AND: [{ field1: 'value1' }],
    }

    addCondition(where, { field2: 'value2' })

    expect(where.AND).toHaveLength(2)
    expect(where.AND[1].field2).toBe('value2')
  })
})

// =============================================
// Real-World Query Scenarios
// =============================================

describe('Real-World Query Scenarios', () => {
  const isPremium = true

  describe('Scenario: "9mm bulk for range"', () => {
    it('should NOT filter out products missing AI-detected grain weights', () => {
      // This was the original bug: AI detected grainWeights [115, 124, 147]
      // and those were used as hard filters, filtering out all products
      const intent = createBaseIntent({
        calibers: ['9mm'],
        purpose: 'Target',
        grainWeights: [115, 124, 147], // AI detected "common range weights"
        caseMaterials: ['Brass'],
        brands: ['Federal', 'Blazer'],
      })
      const explicitFilters: ExplicitFilters = {}

      const where = buildWhereClause(intent, explicitFilters, isPremium)

      // Should have caliber filter
      expect(where.OR).toBeDefined()

      // Should NOT have these hard filters
      expect(where.grainWeight).toBeUndefined()
      expect(where.caseMaterial).toBeUndefined()
      expect(where.brand).toBeUndefined()
      expect(where.purpose).toBeUndefined()
    })
  })

  describe('Scenario: "defense ammo 9mm"', () => {
    it('should apply caliber but not purpose from AI intent', () => {
      const intent = createBaseIntent({
        calibers: ['9mm'],
        purpose: 'Defense',
        grainWeights: [124, 147], // Heavier for defense
        brands: ['Federal', 'Hornady', 'Speer'],
      })
      const explicitFilters: ExplicitFilters = {}

      const where = buildWhereClause(intent, explicitFilters, isPremium)

      expect(where.OR).toBeDefined()
      expect(where.purpose).toBeUndefined()
      expect(where.brand).toBeUndefined()
    })
  })

  describe('Scenario: User explicitly filters by brand', () => {
    it('should apply explicit brand filter while keeping caliber from AI', () => {
      const intent = createBaseIntent({
        calibers: ['9mm'],
        purpose: 'Target',
        brands: ['Federal', 'Blazer'], // AI detected multiple brands
      })
      const explicitFilters: ExplicitFilters = {
        brand: 'Hornady', // User explicitly wants Hornady only
      }

      const where = buildWhereClause(intent, explicitFilters, isPremium)

      // With caliber present, structure uses AND to combine caliber OR clause with brand
      expect(where.AND).toBeDefined()
      // First element in AND is the caliber OR clause
      expect(where.AND[0].OR).toBeDefined()
      // Brand should be in the AND clause
      const brandCondition = where.AND.find((c: any) => c.brand)
      expect(brandCondition.brand.contains).toBe('Hornady')
    })
  })

  describe('Scenario: Empty query (browse all)', () => {
    it('should return broad query when no filters specified', () => {
      const intent = createBaseIntent({
        originalQuery: '',
        keywords: [],
      })
      const explicitFilters: ExplicitFilters = {}

      const where = buildWhereClause(intent, explicitFilters, isPremium)

      // Should have minimal/no filters for broad browse
      expect(Object.keys(where).length).toBeLessThanOrEqual(1)
    })
  })

  describe('Scenario: User changes caliber from AI detection', () => {
    it('should discard AI grain weights when caliber is changed', () => {
      const intent = createBaseIntent({
        calibers: ['9mm'],
        grainWeights: [115, 124], // 9mm typical weights
      })
      const explicitFilters: ExplicitFilters = {
        caliber: '.223', // User changes to different caliber
      }

      const merged = mergeFiltersWithIntent(intent, explicitFilters)
      const where = buildWhereClause(merged, explicitFilters, isPremium)

      // Caliber should be .223
      expect(where.OR[0].caliberNorm.contains).toBe('.223')

      // Grain weights should not be applied (they were for 9mm)
      expect(where.grainWeight).toBeUndefined()
    })
  })
})
