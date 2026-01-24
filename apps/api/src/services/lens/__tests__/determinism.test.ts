import { describe, it, expect } from 'vitest'
import { applyEligibility } from '../eligibility'
import { applyOrdering } from '../ordering'
import { RANGE_LENS, DEFENSIVE_LENS, ALL_LENS } from '../definitions'
import { AggregatedProduct, EligibilityRule } from '../types'

// Explicit eligibility rules for testing (independent of lens definitions)
// These test the eligibility logic, not the lens configurations
const FMJ_ELIGIBILITY: EligibilityRule[] = [
  { field: 'bulletType', operator: 'IN', value: ['FMJ'] },
]

const HP_ELIGIBILITY: EligibilityRule[] = [
  { field: 'bulletType', operator: 'IN', value: ['HP'] },
]

// Helper to create a test product
function createProduct(overrides: Partial<AggregatedProduct> = {}): AggregatedProduct {
  return {
    productId: `product-${Math.random().toString(36).slice(2, 9)}`,
    bulletType: 'FMJ',
    grain: 115,
    casing: 'BRASS',
    packSize: 50,
    canonicalConfidence: 0.85,
    price: 29.99,
    availability: 'IN_STOCK',
    pricePerRound: 0.5998,
    _originalProduct: {},
    _visibleOfferCount: 3,
    ...overrides,
  }
}

/**
 * Generate a fixed set of test products for determinism testing.
 */
function generateFixedProducts(): AggregatedProduct[] {
  return [
    // FMJ products (eligible for RANGE lens)
    createProduct({ productId: 'fmj-01', bulletType: 'FMJ', pricePerRound: 0.30, availability: 'IN_STOCK', canonicalConfidence: 0.90 }),
    createProduct({ productId: 'fmj-02', bulletType: 'FMJ', pricePerRound: 0.25, availability: 'LOW_STOCK', canonicalConfidence: 0.85 }),
    createProduct({ productId: 'fmj-03', bulletType: 'FMJ', pricePerRound: 0.35, availability: 'IN_STOCK', canonicalConfidence: 0.95 }),
    createProduct({ productId: 'fmj-04', bulletType: 'FMJ', pricePerRound: null, availability: 'IN_STOCK', canonicalConfidence: 0.80 }),
    createProduct({ productId: 'fmj-05', bulletType: 'FMJ', pricePerRound: 0.25, availability: 'IN_STOCK', canonicalConfidence: 0.88 }),

    // HP products (eligible for DEFENSIVE lens)
    createProduct({ productId: 'hp-01', bulletType: 'HP', pricePerRound: 0.80, availability: 'IN_STOCK', canonicalConfidence: 0.95 }),
    createProduct({ productId: 'hp-02', bulletType: 'HP', pricePerRound: 0.75, availability: 'OUT_OF_STOCK', canonicalConfidence: 0.90 }),
    createProduct({ productId: 'hp-03', bulletType: 'HP', pricePerRound: 0.85, availability: 'IN_STOCK', canonicalConfidence: 0.92 }),

    // OTM/MATCH products (eligible for MATCH lens)
    createProduct({ productId: 'otm-01', bulletType: 'OTM', pricePerRound: 1.20, availability: 'LOW_STOCK', canonicalConfidence: 0.98 }),
    createProduct({ productId: 'match-01', bulletType: 'MATCH', pricePerRound: 1.50, availability: 'IN_STOCK', canonicalConfidence: 0.99 }),

    // Other products
    createProduct({ productId: 'sp-01', bulletType: 'SP', pricePerRound: 0.60, availability: 'IN_STOCK', canonicalConfidence: 0.75 }),
    createProduct({ productId: 'null-01', bulletType: null, pricePerRound: 0.40, availability: 'IN_STOCK', canonicalConfidence: 0.70 }),
  ]
}

describe('Lens Determinism Tests', () => {
  describe('RANGE lens determinism', () => {
    it('produces identical results across 1000 iterations', () => {
      const products = generateFixedProducts()
      const results: string[] = []

      for (let i = 0; i < 1000; i++) {
        const { eligible } = applyEligibility(products, FMJ_ELIGIBILITY)
        const ordered = applyOrdering(eligible, RANGE_LENS.ordering)
        results.push(JSON.stringify(ordered.map(p => p.productId)))
      }

      const uniqueResults = new Set(results)
      expect(uniqueResults.size).toBe(1)
    })

    it('filters to only FMJ products', () => {
      const products = generateFixedProducts()
      const { eligible } = applyEligibility(products, FMJ_ELIGIBILITY)

      expect(eligible.every(p => p.bulletType === 'FMJ')).toBe(true)
    })

    it('orders by pricePerRound ASC, availability DESC, canonicalConfidence DESC', () => {
      const products = generateFixedProducts()
      const { eligible } = applyEligibility(products, FMJ_ELIGIBILITY)
      const ordered = applyOrdering(eligible, RANGE_LENS.ordering)

      // First should be lowest pricePerRound that's IN_STOCK
      // fmj-05 has pricePerRound 0.25 and IN_STOCK
      expect(ordered[0].productId).toBe('fmj-05')

      // fmj-04 with null pricePerRound should be last
      expect(ordered[ordered.length - 1].productId).toBe('fmj-04')
    })
  })

  describe('DEFENSIVE lens determinism', () => {
    it('produces identical results across 1000 iterations', () => {
      const products = generateFixedProducts()
      const results: string[] = []

      for (let i = 0; i < 1000; i++) {
        const { eligible } = applyEligibility(products, HP_ELIGIBILITY)
        const ordered = applyOrdering(eligible, DEFENSIVE_LENS.ordering)
        results.push(JSON.stringify(ordered.map(p => p.productId)))
      }

      const uniqueResults = new Set(results)
      expect(uniqueResults.size).toBe(1)
    })

    it('filters to only HP products', () => {
      const products = generateFixedProducts()
      const { eligible } = applyEligibility(products, HP_ELIGIBILITY)

      expect(eligible.every(p => p.bulletType === 'HP')).toBe(true)
    })

    it('orders by availability DESC, canonicalConfidence DESC, pricePerRound ASC', () => {
      const products = generateFixedProducts()
      const { eligible } = applyEligibility(products, HP_ELIGIBILITY)
      const ordered = applyOrdering(eligible, DEFENSIVE_LENS.ordering)

      // IN_STOCK should come first, ordered by confidence
      const inStockProducts = ordered.filter(p => p.availability === 'IN_STOCK')
      expect(inStockProducts.length).toBeGreaterThan(0)
      expect(ordered[0].availability).toBe('IN_STOCK')
    })
  })

  describe('ALL lens determinism', () => {
    it('produces identical results across 1000 iterations', () => {
      const products = generateFixedProducts()
      const results: string[] = []

      for (let i = 0; i < 1000; i++) {
        const { eligible } = applyEligibility(products, ALL_LENS.eligibility ?? [])
        const ordered = applyOrdering(eligible, ALL_LENS.ordering)
        results.push(JSON.stringify(ordered.map(p => p.productId)))
      }

      const uniqueResults = new Set(results)
      expect(uniqueResults.size).toBe(1)
    })

    it('does not filter any products', () => {
      const products = generateFixedProducts()
      const { eligible } = applyEligibility(products, ALL_LENS.eligibility ?? [])

      expect(eligible.length).toBe(products.length)
    })
  })

  describe('empty results', () => {
    it('returns empty array deterministically when no products match', () => {
      const products = [
        createProduct({ productId: 'hp-only', bulletType: 'HP' }),
      ]
      const results: string[] = []

      for (let i = 0; i < 100; i++) {
        // RANGE lens requires FMJ
        const { eligible } = applyEligibility(products, FMJ_ELIGIBILITY)
        results.push(JSON.stringify(eligible))
      }

      const uniqueResults = new Set(results)
      expect(uniqueResults.size).toBe(1)
      expect(JSON.parse(results[0])).toEqual([])
    })
  })

  describe('null field handling determinism', () => {
    it('handles null bulletType deterministically', () => {
      const products = [
        createProduct({ productId: 'p1', bulletType: null }),
        createProduct({ productId: 'p2', bulletType: 'FMJ' }),
        createProduct({ productId: 'p3', bulletType: null }),
      ]
      const results: string[] = []

      for (let i = 0; i < 100; i++) {
        const { eligible } = applyEligibility(products, FMJ_ELIGIBILITY)
        results.push(JSON.stringify(eligible.map(p => p.productId)))
      }

      const uniqueResults = new Set(results)
      expect(uniqueResults.size).toBe(1)
      // Only p2 should be eligible
      expect(JSON.parse(results[0])).toEqual(['p2'])
    })

    it('sorts null pricePerRound last deterministically', () => {
      const products = [
        createProduct({ productId: 'p1', bulletType: 'FMJ', pricePerRound: null }),
        createProduct({ productId: 'p2', bulletType: 'FMJ', pricePerRound: 0.30 }),
        createProduct({ productId: 'p3', bulletType: 'FMJ', pricePerRound: null }),
      ]
      const results: string[] = []

      for (let i = 0; i < 100; i++) {
        const { eligible } = applyEligibility(products, FMJ_ELIGIBILITY)
        const ordered = applyOrdering(eligible, RANGE_LENS.ordering)
        results.push(JSON.stringify(ordered.map(p => p.productId)))
      }

      const uniqueResults = new Set(results)
      expect(uniqueResults.size).toBe(1)

      const orderedIds = JSON.parse(results[0])
      // p2 should be first (has pricePerRound)
      expect(orderedIds[0]).toBe('p2')
      // p1 and p3 (null pricePerRound) should be last, sorted by productId
      expect(orderedIds.slice(-2)).toEqual(['p1', 'p3'])
    })
  })

  describe('tie-breaker determinism', () => {
    it('breaks ties by productId ASC deterministically', () => {
      const products = [
        createProduct({
          productId: 'p-zebra',
          bulletType: 'FMJ',
          pricePerRound: 0.30,
          availability: 'IN_STOCK',
          canonicalConfidence: 0.90,
        }),
        createProduct({
          productId: 'p-alpha',
          bulletType: 'FMJ',
          pricePerRound: 0.30,
          availability: 'IN_STOCK',
          canonicalConfidence: 0.90,
        }),
        createProduct({
          productId: 'p-beta',
          bulletType: 'FMJ',
          pricePerRound: 0.30,
          availability: 'IN_STOCK',
          canonicalConfidence: 0.90,
        }),
      ]
      const results: string[] = []

      for (let i = 0; i < 1000; i++) {
        const { eligible } = applyEligibility(products, FMJ_ELIGIBILITY)
        const ordered = applyOrdering(eligible, RANGE_LENS.ordering)
        results.push(JSON.stringify(ordered.map(p => p.productId)))
      }

      const uniqueResults = new Set(results)
      expect(uniqueResults.size).toBe(1)

      // Should be sorted alphabetically by productId
      expect(JSON.parse(results[0])).toEqual(['p-alpha', 'p-beta', 'p-zebra'])
    })
  })
})
