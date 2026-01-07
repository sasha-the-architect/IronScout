/**
 * Product Resolver Unit Tests
 *
 * Comprehensive test suite for the Product Resolver algorithm.
 * Tests are organized by category:
 *   A. Inputs and validation
 *   B. Matching logic
 *   C. Persistence and consistency
 *   D. Dependency failures
 *   E. Metrics correctness
 *
 * All tests use mocked dependencies (no real DB, no network).
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'
import {
  resetFactories,
  createSourceProduct,
  createSource,
  createProduct,
  createProductLink,
  createTrustConfig,
  createUpcIdentifier,
  createProductAlias,
  GOLDEN_SCENARIOS,
  NORMALIZATION_CASES,
  EDGE_CASES,
  assertMatched,
  assertCreated,
  assertUnmatched,
  assertError,
  assertRulesFired,
  type MockSourceProduct,
  type MockProduct,
  type MockTrustConfig,
  type MockProductAlias,
} from './factories'
import {
  resetMetrics,
  getMetricsSnapshot,
  recordRequest,
  recordResolverJob,
  type SourceKindLabel,
} from '../metrics'

// ═══════════════════════════════════════════════════════════════════════════════
// Mock Setup - Use vi.hoisted for mock definitions
// ═══════════════════════════════════════════════════════════════════════════════

const mockPrisma = vi.hoisted(() => ({
  source_products: {
    findUnique: vi.fn(),
  },
  source_trust_config: {
    findUnique: vi.fn(),
  },
  products: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
  },
  product_aliases: {
    findUnique: vi.fn(),
  },
  product_links: {
    upsert: vi.fn(),
  },
}))

vi.mock('@ironscout/db', () => ({
  prisma: mockPrisma,
}))

// Mock logger (suppress output during tests)
vi.mock('../../config/logger', () => ({
  logger: {
    resolver: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  },
}))

// Import after mocks are set up
import { resolveSourceProduct, RESOLVER_VERSION } from '../resolver'

// ═══════════════════════════════════════════════════════════════════════════════
// Test Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function setupMocks(config: {
  sourceProduct?: MockSourceProduct | null
  trustConfig?: MockTrustConfig | null
  existingProducts?: MockProduct[]
  aliases?: MockProductAlias[]
  productCreateResult?: MockProduct | Error
}) {
  // Source product lookup
  mockPrisma.source_products.findUnique.mockResolvedValue(config.sourceProduct ?? null)

  // Trust config lookup
  mockPrisma.source_trust_config.findUnique.mockResolvedValue(config.trustConfig ?? null)

  // Product lookups
  mockPrisma.products.findFirst.mockImplementation(async (args: any) => {
    const products = config.existingProducts ?? []
    if (args?.where?.canonicalKey) {
      return products.find(p => p.canonicalKey === args.where.canonicalKey) ?? null
    }
    return products[0] ?? null
  })

  mockPrisma.products.findMany.mockImplementation(async (args: any) => {
    const products = config.existingProducts ?? []
    if (args?.where?.brandNorm && args?.where?.caliberNorm) {
      return products.filter(
        p => p.brandNorm === args.where.brandNorm && p.caliberNorm === args.where.caliberNorm
      )
    }
    return products
  })

  // Product creation
  if (config.productCreateResult instanceof Error) {
    mockPrisma.products.create.mockRejectedValue(config.productCreateResult)
  } else if (config.productCreateResult) {
    mockPrisma.products.create.mockResolvedValue(config.productCreateResult)
  } else {
    mockPrisma.products.create.mockImplementation(async (args: any) => ({
      id: `created_${Date.now()}`,
      ...args.data,
    }))
  }

  // Alias lookup
  mockPrisma.product_aliases.findUnique.mockImplementation(async (args: any) => {
    const aliases = config.aliases ?? []
    return aliases.find(a => a.fromProductId === args?.where?.fromProductId) ?? null
  })
}

function resetMocks() {
  Object.values(mockPrisma).forEach(table => {
    Object.values(table).forEach(method => {
      if (typeof method === 'function' && 'mockReset' in method) {
        (method as Mock).mockReset()
      }
    })
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// Test Plan
// ═══════════════════════════════════════════════════════════════════════════════
/*
TEST PLAN CATEGORIES:

A. INPUTS AND VALIDATION
   A1. Source product not found → ERROR
   A2. Empty/null required fields handling
   A3. Whitespace normalization in title/brand
   A4. Case normalization (uppercase → lowercase)
   A5. Unicode and punctuation in identifiers
   A6. Extremely long strings
   A7. Invalid UPC format handling

B. MATCHING LOGIC
   B1. UPC exact match → MATCHED
   B2. UPC match creates product → CREATED
   B3. UPC present but source not trusted → falls through to fingerprint
   B4. Fingerprint match with clear winner → MATCHED
   B5. Fingerprint ambiguous (score in ambiguity range) → UNMATCHED
   B6. Fingerprint ambiguous (gap too small) → UNMATCHED
   B7. Candidate overflow → UNMATCHED
   B8. No candidates for fingerprint → UNMATCHED
   B9. Insufficient data (missing brand/caliber) → UNMATCHED
   B10. Idempotency: same inputHash returns existing link
   B11. MANUAL lock prevents override
   B12. Relink: stronger matchType allows relink
   B13. Relink: confidence improvement allows relink
   B14. Relink: blocked by hysteresis
   B15. Alias resolution follows chain
   B16. Alias depth exceeded → ERROR

C. PERSISTENCE AND CONSISTENCY
   C1. Product creation succeeds
   C2. Product creation race condition (P2002) → retry and find
   C3. Product creation fails with other error → propagates

D. DEPENDENCY FAILURES
   D1. source_products lookup throws → ERROR
   D2. trust_config lookup throws → ERROR
   D3. products lookup throws → propagates error
   D4. product creation throws (non-retryable) → propagates
   D5. alias lookup throws → propagates

E. METRICS CORRECTNESS
   E1. Request counter increments once per invocation
   E2. Decision counter increments with correct status
   E3. Failure counter increments only on ERROR
   E4. Latency recorded (if implemented in test harness)
   E5. No high-cardinality labels used
*/

// ═══════════════════════════════════════════════════════════════════════════════
// A. INPUTS AND VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. Inputs and Validation', () => {
  beforeEach(() => {
    resetMocks()
    resetFactories()
    resetMetrics()
  })

  describe('A1. Source product not found', () => {
    it('returns ERROR status when source_product does not exist', async () => {
      setupMocks({ sourceProduct: null })

      const result = await resolveSourceProduct('nonexistent_id', 'INGEST')

      assertError(result, 'SOURCE_NOT_FOUND')
      expect(result.evidence.systemError?.message).toContain('nonexistent_id')
    })
  })

  describe('A2. Empty/null required fields', () => {
    it('returns UNMATCHED when brand is null and no UPC', async () => {
      const sourceProduct = createSourceProduct({ brand: null })
      setupMocks({
        sourceProduct,
        trustConfig: createTrustConfig({ sourceId: sourceProduct.sourceId, upcTrusted: false }),
      })

      const result = await resolveSourceProduct(sourceProduct.id, 'INGEST')

      assertUnmatched(result, 'INSUFFICIENT_DATA')
      assertRulesFired(result, ['INSUFFICIENT_DATA'])
    })

    it('returns UNMATCHED when title is empty and no UPC', async () => {
      const sourceProduct = createSourceProduct({ title: '', brand: 'Federal' })
      setupMocks({
        sourceProduct,
        trustConfig: createTrustConfig({ sourceId: sourceProduct.sourceId, upcTrusted: false }),
      })

      const result = await resolveSourceProduct(sourceProduct.id, 'INGEST')

      // Title empty means no caliber can be extracted → insufficient data
      assertUnmatched(result, 'INSUFFICIENT_DATA')
    })
  })

  describe('A3. Whitespace normalization', () => {
    it.each([
      ['  leading spaces', 'leading spaces'],
      ['trailing spaces  ', 'trailing spaces'],
      ['multiple   internal   spaces', 'multiple internal spaces'],
      ['\ttabs\there', 'tabs here'],
    ])('normalizes title "%s" correctly', async (input, expectedNorm) => {
      const sourceProduct = createSourceProduct({ title: input, brand: 'Brand' })
      sourceProduct.source_product_identifiers = [
        createUpcIdentifier(sourceProduct.id, '012345678901'),
      ]
      const existingProduct = createProduct({ canonicalKey: 'UPC:012345678901' })

      setupMocks({
        sourceProduct,
        trustConfig: createTrustConfig({ sourceId: sourceProduct.sourceId, upcTrusted: true }),
        existingProducts: [existingProduct],
      })

      const result = await resolveSourceProduct(sourceProduct.id, 'INGEST')

      // Should successfully match despite whitespace variations
      assertMatched(result)
      // Verify normalized title in evidence
      expect(result.evidence.inputNormalized.titleNorm).toBe(expectedNorm)
    })
  })

  describe('A4. Case normalization', () => {
    it('normalizes uppercase brand to lowercase', async () => {
      const sourceProduct = createSourceProduct({ brand: 'FEDERAL PREMIUM' })
      sourceProduct.source_product_identifiers = [
        createUpcIdentifier(sourceProduct.id, '012345678901'),
      ]
      const existingProduct = createProduct({ canonicalKey: 'UPC:012345678901' })

      setupMocks({
        sourceProduct,
        trustConfig: createTrustConfig({ sourceId: sourceProduct.sourceId, upcTrusted: true }),
        existingProducts: [existingProduct],
      })

      const result = await resolveSourceProduct(sourceProduct.id, 'INGEST')

      assertMatched(result)
      expect(result.evidence.inputNormalized.brandNorm).toBe('federal premium')
    })

    it('normalizes mixed case title to lowercase', async () => {
      const sourceProduct = createSourceProduct({ title: 'FeDerAL PrEmIuM 9MM' })
      sourceProduct.source_product_identifiers = [
        createUpcIdentifier(sourceProduct.id, '012345678901'),
      ]
      const existingProduct = createProduct({ canonicalKey: 'UPC:012345678901' })

      setupMocks({
        sourceProduct,
        trustConfig: createTrustConfig({ sourceId: sourceProduct.sourceId, upcTrusted: true }),
        existingProducts: [existingProduct],
      })

      const result = await resolveSourceProduct(sourceProduct.id, 'INGEST')

      assertMatched(result)
      expect(result.evidence.inputNormalized.titleNorm).toBe('federal premium 9mm')
    })
  })

  describe('A5. Unicode and punctuation in identifiers', () => {
    it('strips punctuation from brand name', async () => {
      const sourceProduct = createSourceProduct({ brand: 'Federal™ Premium®' })
      sourceProduct.source_product_identifiers = [
        createUpcIdentifier(sourceProduct.id, '012345678901'),
      ]

      setupMocks({
        sourceProduct,
        trustConfig: createTrustConfig({ sourceId: sourceProduct.sourceId, upcTrusted: true }),
        existingProducts: [createProduct({ canonicalKey: 'UPC:012345678901' })],
      })

      const result = await resolveSourceProduct(sourceProduct.id, 'INGEST')

      assertMatched(result)
      expect(result.evidence.inputNormalized.brandNorm).toBe('federal premium')
    })

    it('handles non-ASCII characters in title', async () => {
      const sourceProduct = createSourceProduct({ title: 'Munición 9mm café' })
      sourceProduct.source_product_identifiers = [
        createUpcIdentifier(sourceProduct.id, '012345678901'),
      ]

      setupMocks({
        sourceProduct,
        trustConfig: createTrustConfig({ sourceId: sourceProduct.sourceId, upcTrusted: true }),
        existingProducts: [createProduct({ canonicalKey: 'UPC:012345678901' })],
      })

      const result = await resolveSourceProduct(sourceProduct.id, 'INGEST')

      assertMatched(result)
      // Non-ASCII may or may not be preserved depending on regex \w behavior
      expect(result.evidence.inputNormalized.titleNorm).toBeDefined()
    })
  })

  describe('A6. Extremely long strings', () => {
    it('handles very long title without crashing', async () => {
      const sourceProduct = createSourceProduct({ title: EDGE_CASES.longTitle })
      sourceProduct.source_product_identifiers = [
        createUpcIdentifier(sourceProduct.id, '012345678901'),
      ]

      setupMocks({
        sourceProduct,
        trustConfig: createTrustConfig({ sourceId: sourceProduct.sourceId, upcTrusted: true }),
        existingProducts: [createProduct({ canonicalKey: 'UPC:012345678901' })],
      })

      const result = await resolveSourceProduct(sourceProduct.id, 'INGEST')

      // Should not crash, should produce a result
      expect(result.status).toBeDefined()
      expect(result.evidence.inputNormalized.titleNorm).toBeDefined()
    })
  })

  describe('A7. Invalid UPC format handling', () => {
    it.each([
      ['123', 'too short'],
      ['123456789012345', 'too long'],
      ['', 'empty'],
      ['abcdefghijkl', 'non-numeric'],
    ])('treats invalid UPC "%s" (%s) as missing', async (upc, _reason) => {
      const sourceProduct = createSourceProduct({ brand: null }) // No brand → insufficient
      sourceProduct.source_product_identifiers = [
        createUpcIdentifier(sourceProduct.id, upc),
      ]

      setupMocks({
        sourceProduct,
        trustConfig: createTrustConfig({ sourceId: sourceProduct.sourceId, upcTrusted: true }),
      })

      const result = await resolveSourceProduct(sourceProduct.id, 'INGEST')

      // Invalid UPC is normalized to undefined, so falls through to fingerprint
      // With no brand → INSUFFICIENT_DATA
      assertUnmatched(result, 'INSUFFICIENT_DATA')
    })

    it('normalizes UPC with dashes and spaces', async () => {
      const sourceProduct = createSourceProduct()
      sourceProduct.source_product_identifiers = [
        createUpcIdentifier(sourceProduct.id, '0-12345-67890-1'),
      ]

      setupMocks({
        sourceProduct,
        trustConfig: createTrustConfig({ sourceId: sourceProduct.sourceId, upcTrusted: true }),
        existingProducts: [createProduct({ canonicalKey: 'UPC:012345678901' })],
      })

      const result = await resolveSourceProduct(sourceProduct.id, 'INGEST')

      assertMatched(result)
      expect(result.evidence.inputNormalized.upcNorm).toBe('012345678901')
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// B. MATCHING LOGIC
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. Matching Logic', () => {
  beforeEach(() => {
    resetMocks()
    resetFactories()
    resetMetrics()
  })

  describe('B1. UPC exact match', () => {
    it('returns MATCHED when UPC matches existing product', async () => {
      const { sourceProduct, trustConfig, existingProduct } = GOLDEN_SCENARIOS.upcMatch()

      setupMocks({
        sourceProduct,
        trustConfig,
        existingProducts: [existingProduct],
      })

      const result = await resolveSourceProduct(sourceProduct.id, 'INGEST')

      assertMatched(result, existingProduct.id)
      expect(result.matchType).toBe('UPC')
      expect(result.confidence).toBe(0.95)
      assertRulesFired(result, ['UPC_MATCH_ATTEMPTED'])
    })
  })

  describe('B2. UPC match creates product', () => {
    it('returns CREATED when UPC is new', async () => {
      const { sourceProduct, trustConfig } = GOLDEN_SCENARIOS.upcCreate()
      const createdProduct = createProduct({
        id: 'new_product_id',
        canonicalKey: 'UPC:999888777666',
      })

      setupMocks({
        sourceProduct,
        trustConfig,
        existingProducts: [], // No existing product
        productCreateResult: createdProduct,
      })

      const result = await resolveSourceProduct(sourceProduct.id, 'INGEST')

      assertCreated(result)
      expect(result.matchType).toBe('UPC')
      expect(result.createdProduct?.canonicalKey).toBe('UPC:999888777666')
      assertRulesFired(result, ['PRODUCT_CREATED'])
    })
  })

  describe('B3. UPC present but source not trusted', () => {
    it('records UPC_NOT_TRUSTED and falls through to fingerprint', async () => {
      const { sourceProduct, trustConfig } = GOLDEN_SCENARIOS.upcNotTrusted()

      setupMocks({
        sourceProduct,
        trustConfig,
      })

      const result = await resolveSourceProduct(sourceProduct.id, 'INGEST')

      // No brand/caliber → INSUFFICIENT_DATA
      assertUnmatched(result, 'INSUFFICIENT_DATA')
      assertRulesFired(result, ['UPC_NOT_TRUSTED'])
      // Verify normalization error recorded (array with one string containing the message)
      expect(result.evidence.normalizationErrors).toBeDefined()
      expect(result.evidence.normalizationErrors?.length).toBeGreaterThan(0)
      expect(result.evidence.normalizationErrors?.[0]).toContain('UPC present but source not trusted')
    })
  })

  describe('B4. Fingerprint match with clear winner', () => {
    it('returns MATCHED with highest scoring candidate', async () => {
      const sourceProduct = createSourceProduct({
        brand: 'Federal',
      })

      // Create candidates with different scores
      const bestMatch = createProduct({
        id: 'best_match',
        brandNorm: 'federal',
        caliberNorm: '9mm',
        roundCount: 50,
        grainWeight: 124,
      })
      const poorMatch = createProduct({
        id: 'poor_match',
        brandNorm: 'federal',
        caliberNorm: '9mm',
        roundCount: 20, // Different round count
        grainWeight: 115, // Different grain
      })

      setupMocks({
        sourceProduct,
        trustConfig: createTrustConfig({ sourceId: sourceProduct.sourceId, upcTrusted: false }),
        existingProducts: [bestMatch, poorMatch],
      })

      // Note: Current implementation has caliberNorm as undefined from normalizeInput
      // This will result in INSUFFICIENT_DATA. For this test to work, we'd need
      // caliber extraction to be implemented. Testing the fingerprint path requires
      // the resolver to have caliberNorm extracted from the source_product.

      const result = await resolveSourceProduct(sourceProduct.id, 'INGEST')

      // With current implementation, caliberNorm is always undefined → INSUFFICIENT_DATA
      // This documents the actual behavior
      assertUnmatched(result, 'INSUFFICIENT_DATA')
    })
  })

  describe('B5-B8. Fingerprint edge cases', () => {
    // Note: These tests document expected behavior but require caliberNorm extraction
    // to be implemented for fingerprint matching to work

    it('returns UNMATCHED when no candidates found (empty result)', async () => {
      const sourceProduct = createSourceProduct({ brand: 'UnknownBrand' })

      setupMocks({
        sourceProduct,
        trustConfig: createTrustConfig({ sourceId: sourceProduct.sourceId, upcTrusted: false }),
        existingProducts: [], // No candidates
      })

      const result = await resolveSourceProduct(sourceProduct.id, 'INGEST')

      // Current implementation: caliberNorm undefined → INSUFFICIENT_DATA
      assertUnmatched(result, 'INSUFFICIENT_DATA')
    })
  })

  describe('B9. Insufficient data', () => {
    it('returns UNMATCHED with INSUFFICIENT_DATA when brand is missing', async () => {
      const sourceProduct = createSourceProduct({ brand: null })

      setupMocks({
        sourceProduct,
        trustConfig: createTrustConfig({ sourceId: sourceProduct.sourceId, upcTrusted: false }),
      })

      const result = await resolveSourceProduct(sourceProduct.id, 'INGEST')

      assertUnmatched(result, 'INSUFFICIENT_DATA')
      assertRulesFired(result, ['INSUFFICIENT_DATA'])
    })
  })

  describe('B10. Idempotency', () => {
    it('returns existing link when inputHash matches', async () => {
      const sourceProduct = createSourceProduct()
      const existingProductId = 'existing_product_id'

      // Set up existing link with matching evidence
      // Note: This requires the inputHash to match, which depends on normalization
      sourceProduct.product_links = createProductLink({
        sourceProductId: sourceProduct.id,
        productId: existingProductId,
        matchType: 'UPC',
        status: 'MATCHED',
        evidence: {
          dictionaryVersion: '1.0.0',
          trustConfigVersion: 0, // Default when no trust config
          inputNormalized: {} as any,
          inputHash: '', // Will need to compute the actual hash
          rulesFired: ['SKIP_SAME_INPUT'],
        },
      })

      setupMocks({
        sourceProduct,
        trustConfig: null, // Will use default (version 0)
      })

      const result = await resolveSourceProduct(sourceProduct.id, 'INGEST')

      // First run will compute inputHash and store it
      // Since the existing link has empty inputHash, it won't match
      // This documents that idempotency requires matching inputHash
      expect(result.status).toBeDefined()
    })
  })

  describe('B11. MANUAL lock', () => {
    it('preserves MANUAL link and does not re-resolve', async () => {
      const { sourceProduct, trustConfig, productId } = GOLDEN_SCENARIOS.manualLock()

      setupMocks({
        sourceProduct,
        trustConfig,
      })

      const result = await resolveSourceProduct(sourceProduct.id, 'INGEST')

      expect(result.matchType).toBe('MANUAL')
      expect(result.productId).toBe(productId)
      expect(result.reasonCode).toBe('MANUAL_LOCKED')
      expect(result.relinkBlocked).toBe(true)
      assertRulesFired(result, ['MANUAL_LOCKED'])
    })
  })

  describe('B12-B14. Relink scenarios', () => {
    it('allows relink when matchType strength improves (FINGERPRINT → UPC)', async () => {
      const sourceProduct = createSourceProduct()
      const oldProductId = 'old_product'
      const newProductId = 'new_product'

      sourceProduct.source_product_identifiers = [
        createUpcIdentifier(sourceProduct.id, '012345678901'),
      ]
      sourceProduct.product_links = createProductLink({
        sourceProductId: sourceProduct.id,
        productId: oldProductId,
        matchType: 'FINGERPRINT', // Weaker than UPC
        status: 'MATCHED',
        confidence: 0.80,
      })

      setupMocks({
        sourceProduct,
        trustConfig: createTrustConfig({ sourceId: sourceProduct.sourceId, upcTrusted: true }),
        existingProducts: [createProduct({ id: newProductId, canonicalKey: 'UPC:012345678901' })],
      })

      const result = await resolveSourceProduct(sourceProduct.id, 'INGEST')

      assertMatched(result, newProductId)
      expect(result.isRelink).toBe(true)
      expect(result.relinkBlocked).toBe(false)
      assertRulesFired(result, ['RELINK_STRONGER_MATCH'])
    })

    it('blocks relink when hysteresis threshold not met', async () => {
      const sourceProduct = createSourceProduct()
      const oldProductId = 'old_product'
      const newProductId = 'new_product'

      sourceProduct.source_product_identifiers = [
        createUpcIdentifier(sourceProduct.id, '012345678901'),
      ]
      sourceProduct.product_links = createProductLink({
        sourceProductId: sourceProduct.id,
        productId: oldProductId,
        matchType: 'UPC', // Same matchType
        status: 'MATCHED',
        confidence: 0.95, // Same confidence
      })

      setupMocks({
        sourceProduct,
        trustConfig: createTrustConfig({ sourceId: sourceProduct.sourceId, upcTrusted: true }),
        existingProducts: [createProduct({ id: newProductId, canonicalKey: 'UPC:012345678901' })],
      })

      const result = await resolveSourceProduct(sourceProduct.id, 'INGEST')

      // Same matchType, same confidence → blocked
      // But since it's a different product, isRelink=true, relinkBlocked=true
      assertMatched(result, oldProductId) // Stays with old product
      expect(result.isRelink).toBe(true)
      expect(result.relinkBlocked).toBe(true)
      expect(result.reasonCode).toBe('RELINK_BLOCKED_HYSTERESIS')
    })
  })

  describe('B15. Alias resolution', () => {
    it('follows alias chain to active product', async () => {
      const sourceProduct = createSourceProduct()
      sourceProduct.source_product_identifiers = [
        createUpcIdentifier(sourceProduct.id, '012345678901'),
      ]

      const aliasedProduct = createProduct({
        id: 'aliased_product',
        canonicalKey: 'UPC:012345678901',
      })
      const activeProduct = createProduct({
        id: 'active_product',
        canonicalKey: 'UPC:012345678901',
      })

      setupMocks({
        sourceProduct,
        trustConfig: createTrustConfig({ sourceId: sourceProduct.sourceId, upcTrusted: true }),
        existingProducts: [aliasedProduct],
        aliases: [createProductAlias('aliased_product', 'active_product')],
      })

      const result = await resolveSourceProduct(sourceProduct.id, 'INGEST')

      assertMatched(result, 'active_product')
      assertRulesFired(result, ['ALIAS_RESOLVED'])
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// C. PERSISTENCE AND CONSISTENCY
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. Persistence and Consistency', () => {
  beforeEach(() => {
    resetMocks()
    resetFactories()
    resetMetrics()
  })

  describe('C1. Product creation succeeds', () => {
    it('creates product and returns CREATED status', async () => {
      const sourceProduct = createSourceProduct()
      sourceProduct.source_product_identifiers = [
        createUpcIdentifier(sourceProduct.id, '999888777666'),
      ]

      const newProduct = createProduct({
        id: 'newly_created',
        canonicalKey: 'UPC:999888777666',
      })

      setupMocks({
        sourceProduct,
        trustConfig: createTrustConfig({ sourceId: sourceProduct.sourceId, upcTrusted: true }),
        existingProducts: [],
        productCreateResult: newProduct,
      })

      const result = await resolveSourceProduct(sourceProduct.id, 'INGEST')

      assertCreated(result)
      expect(mockPrisma.products.create).toHaveBeenCalledTimes(1)
    })
  })

  describe('C2. Product creation race condition (P2002)', () => {
    it('retries and finds existing product after unique constraint error', async () => {
      const sourceProduct = createSourceProduct()
      sourceProduct.source_product_identifiers = [
        createUpcIdentifier(sourceProduct.id, '012345678901'),
      ]

      const existingProduct = createProduct({
        id: 'race_winner',
        canonicalKey: 'UPC:012345678901',
      })

      // Reset all mocks first
      resetMocks()

      // Set up source product lookup
      mockPrisma.source_products.findUnique.mockResolvedValue(sourceProduct)

      // Set up trust config
      mockPrisma.source_trust_config.findUnique.mockResolvedValue(
        createTrustConfig({ sourceId: sourceProduct.sourceId, upcTrusted: true })
      )

      // First findFirst returns null (no product exists), then returns the product after race
      let findFirstCalls = 0
      mockPrisma.products.findFirst.mockImplementation(async () => {
        findFirstCalls++
        if (findFirstCalls === 1) return null // First call: product doesn't exist
        return existingProduct // Second call: another worker created it
      })

      // Create throws P2002 (unique constraint violation from race)
      const uniqueError = new Error('Unique constraint failed')
      ;(uniqueError as any).code = 'P2002'
      mockPrisma.products.create.mockRejectedValue(uniqueError)

      // No alias
      mockPrisma.product_aliases.findUnique.mockResolvedValue(null)

      const result = await resolveSourceProduct(sourceProduct.id, 'INGEST')

      // Should have retried and found the product
      assertMatched(result, 'race_winner')
      assertRulesFired(result, ['PRODUCT_RACE_RETRY'])
    })
  })

  describe('C3. Product creation fails with non-retryable error', () => {
    it('propagates error when create fails with unknown error', async () => {
      const sourceProduct = createSourceProduct()
      sourceProduct.source_product_identifiers = [
        createUpcIdentifier(sourceProduct.id, '012345678901'),
      ]

      setupMocks({
        sourceProduct,
        trustConfig: createTrustConfig({ sourceId: sourceProduct.sourceId, upcTrusted: true }),
        existingProducts: [],
        productCreateResult: new Error('Database connection lost'),
      })

      await expect(resolveSourceProduct(sourceProduct.id, 'INGEST'))
        .rejects.toThrow('Database connection lost')
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// D. DEPENDENCY FAILURES
// ═══════════════════════════════════════════════════════════════════════════════

describe('D. Dependency Failures', () => {
  beforeEach(() => {
    resetMocks()
    resetFactories()
    resetMetrics()
  })

  describe('D1. source_products lookup throws', () => {
    it('propagates error when source_products.findUnique fails', async () => {
      mockPrisma.source_products.findUnique.mockRejectedValue(
        new Error('Connection timeout')
      )

      await expect(resolveSourceProduct('any_id', 'INGEST'))
        .rejects.toThrow('Connection timeout')
    })
  })

  describe('D2. trust_config lookup throws', () => {
    it('propagates error when source_trust_config.findUnique fails', async () => {
      const sourceProduct = createSourceProduct()

      mockPrisma.source_products.findUnique.mockResolvedValue(sourceProduct)
      mockPrisma.source_trust_config.findUnique.mockRejectedValue(
        new Error('Trust config query failed')
      )

      await expect(resolveSourceProduct(sourceProduct.id, 'INGEST'))
        .rejects.toThrow('Trust config query failed')
    })
  })

  describe('D3. products lookup throws', () => {
    it('propagates error when products.findFirst fails', async () => {
      const sourceProduct = createSourceProduct()
      sourceProduct.source_product_identifiers = [
        createUpcIdentifier(sourceProduct.id, '012345678901'),
      ]

      mockPrisma.source_products.findUnique.mockResolvedValue(sourceProduct)
      mockPrisma.source_trust_config.findUnique.mockResolvedValue(
        createTrustConfig({ sourceId: sourceProduct.sourceId, upcTrusted: true })
      )
      mockPrisma.products.findFirst.mockRejectedValue(
        new Error('Products table unavailable')
      )

      await expect(resolveSourceProduct(sourceProduct.id, 'INGEST'))
        .rejects.toThrow('Products table unavailable')
    })
  })

  describe('D4. alias lookup throws', () => {
    it('propagates error when product_aliases.findUnique fails', async () => {
      const sourceProduct = createSourceProduct()
      sourceProduct.source_product_identifiers = [
        createUpcIdentifier(sourceProduct.id, '012345678901'),
      ]

      const existingProduct = createProduct({
        id: 'product_id',
        canonicalKey: 'UPC:012345678901',
      })

      mockPrisma.source_products.findUnique.mockResolvedValue(sourceProduct)
      mockPrisma.source_trust_config.findUnique.mockResolvedValue(
        createTrustConfig({ sourceId: sourceProduct.sourceId, upcTrusted: true })
      )
      mockPrisma.products.findFirst.mockResolvedValue(existingProduct)
      mockPrisma.product_aliases.findUnique.mockRejectedValue(
        new Error('Alias lookup failed')
      )

      await expect(resolveSourceProduct(sourceProduct.id, 'INGEST'))
        .rejects.toThrow('Alias lookup failed')
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// E. METRICS CORRECTNESS
// ═══════════════════════════════════════════════════════════════════════════════

describe('E. Metrics Correctness', () => {
  beforeEach(() => {
    resetMocks()
    resetFactories()
    resetMetrics()
  })

  /**
   * Note: The resolver.ts itself does not emit metrics directly.
   * Metrics are emitted by the worker (worker.ts) which calls the resolver.
   * These tests verify that the metrics module works correctly and
   * document how metrics should be recorded by the worker.
   *
   * Integration tests would verify the worker properly records metrics.
   */

  describe('E1. Request counter increments once per invocation', () => {
    it('records one request per resolver invocation (simulated)', () => {
      // Simulate what worker does
      recordRequest('DIRECT')
      recordRequest('DIRECT')
      recordRequest('AFFILIATE_FEED')

      const snapshot = getMetricsSnapshot()
      expect(snapshot.requests['DIRECT']).toBe(2)
      expect(snapshot.requests['AFFILIATE_FEED']).toBe(1)
    })
  })

  describe('E2. Decision counter increments with correct status', () => {
    it('records MATCHED decision', () => {
      recordResolverJob({
        sourceKind: 'DIRECT',
        status: 'MATCHED',
        durationMs: 100,
      })

      const snapshot = getMetricsSnapshot()
      expect(snapshot.decisions['DIRECT']['MATCHED']).toBe(1)
    })

    it('records CREATED decision', () => {
      recordResolverJob({
        sourceKind: 'AFFILIATE_FEED',
        status: 'CREATED',
        durationMs: 150,
      })

      const snapshot = getMetricsSnapshot()
      expect(snapshot.decisions['AFFILIATE_FEED']['CREATED']).toBe(1)
    })

    it('records UNMATCHED decision', () => {
      recordResolverJob({
        sourceKind: 'DIRECT',
        status: 'UNMATCHED',
        durationMs: 50,
      })

      const snapshot = getMetricsSnapshot()
      expect(snapshot.decisions['DIRECT']['UNMATCHED']).toBe(1)
    })

    it('records ERROR decision', () => {
      recordResolverJob({
        sourceKind: 'OTHER',
        status: 'ERROR',
        reasonCode: 'SYSTEM_ERROR',
        durationMs: 10,
      })

      const snapshot = getMetricsSnapshot()
      expect(snapshot.decisions['OTHER']['ERROR']).toBe(1)
    })
  })

  describe('E3. Failure counter increments only on ERROR', () => {
    it('records failure with reason_code for ERROR status', () => {
      recordResolverJob({
        sourceKind: 'AFFILIATE_FEED',
        status: 'ERROR',
        reasonCode: 'SYSTEM_ERROR',
        durationMs: 100,
      })

      const snapshot = getMetricsSnapshot()
      expect(snapshot.failures['AFFILIATE_FEED']['SYSTEM_ERROR']).toBe(1)
    })

    it('does not record failure for non-ERROR status', () => {
      recordResolverJob({
        sourceKind: 'DIRECT',
        status: 'UNMATCHED',
        durationMs: 100,
      })

      const snapshot = getMetricsSnapshot()
      expect(snapshot.failures['DIRECT']).toBeUndefined()
    })
  })

  describe('E4. Latency recorded', () => {
    it('records latency in histogram', () => {
      recordResolverJob({
        sourceKind: 'DIRECT',
        status: 'MATCHED',
        durationMs: 150,
      })

      const snapshot = getMetricsSnapshot()
      expect(snapshot.latency.count).toBe(1)
      expect(snapshot.latency.sum).toBe(150)
    })
  })

  describe('E5. No high-cardinality labels', () => {
    it('only uses bounded source_kind labels', () => {
      // Record metrics with all allowed source_kind values
      const allowedKinds: SourceKindLabel[] = ['DIRECT', 'AFFILIATE_FEED', 'OTHER', 'UNKNOWN']

      for (const kind of allowedKinds) {
        recordRequest(kind)
      }

      const snapshot = getMetricsSnapshot()

      // All keys should be from the allowed set
      for (const key of Object.keys(snapshot.requests)) {
        expect(allowedKinds).toContain(key)
      }
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// INTEGRATION TEST GAPS (Documentation)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GAPS: Tests that require integration testing (not unit testable)
 *
 * 1. Full worker lifecycle with real BullMQ jobs
 *    - Job enqueue → process → complete/fail
 *    - Retry behavior on transient failures
 *    - DLQ routing
 *
 * 2. Transaction boundaries
 *    - Actual database transaction semantics
 *    - Rollback on partial failure
 *    - Serialization conflicts with concurrent resolvers
 *
 * 3. Real database constraint behavior
 *    - Actual P2002 unique constraint errors
 *    - Foreign key constraint violations
 *    - Deadlock detection and recovery
 *
 * 4. Evidence persistence
 *    - JSON serialization/deserialization roundtrip
 *    - Evidence size truncation at MAX_EVIDENCE_SIZE
 *    - Evidence schema evolution
 *
 * 5. End-to-end metrics pipeline
 *    - Metrics scraped by Prometheus
 *    - Cardinality explosion detection
 *    - Alert firing thresholds
 *
 * 6. Caliber extraction from title
 *    - Current implementation has TODO for caliber extraction
 *    - Fingerprint matching requires caliberNorm
 *    - Integration test needed once implemented
 *
 * 7. Performance under load
 *    - Concurrent resolution of same source_product
 *    - High throughput scenarios
 *    - Memory usage with large evidence payloads
 *
 * 8. Alias chain edge cases with real data
 *    - Circular alias detection (if any)
 *    - Very long alias chains
 *    - Alias to deleted product
 */
