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
  assertNeedsReview,
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
    findUnique: vi.fn(),
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
import { resolveSourceProduct, RESOLVER_VERSION, clearTrustConfigCache } from '../resolver'

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
  mockPrisma.products.findUnique.mockImplementation(async (args: any) => {
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
   B5. Fingerprint ambiguous (score in ambiguity range) → NEEDS_REVIEW
   B6. Fingerprint ambiguous (gap too small) → NEEDS_REVIEW
   B7. Candidate overflow → NEEDS_REVIEW
   B8. No candidates for fingerprint → NEEDS_REVIEW
   B9. Insufficient data (missing brand/caliber) → NEEDS_REVIEW
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
    clearTrustConfigCache()
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
    it('returns NEEDS_REVIEW when brand is null and no UPC', async () => {
      const sourceProduct = createSourceProduct({ brand: null })
      setupMocks({
        sourceProduct,
        trustConfig: createTrustConfig({ sourceId: sourceProduct.sourceId, upcTrusted: false }),
      })

      const result = await resolveSourceProduct(sourceProduct.id, 'INGEST')

      assertNeedsReview(result, 'INSUFFICIENT_DATA')
      assertRulesFired(result, ['INSUFFICIENT_DATA'])
    })

    it('returns NEEDS_REVIEW when title is empty and no UPC', async () => {
      const sourceProduct = createSourceProduct({ title: '', brand: 'Federal' })
      setupMocks({
        sourceProduct,
        trustConfig: createTrustConfig({ sourceId: sourceProduct.sourceId, upcTrusted: false }),
      })

      const result = await resolveSourceProduct(sourceProduct.id, 'INGEST')

      // Title empty means no caliber can be extracted → insufficient data
      assertNeedsReview(result, 'INSUFFICIENT_DATA')
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
      assertNeedsReview(result, 'INSUFFICIENT_DATA')
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
    clearTrustConfigCache()
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
        existingProducts: [], // No fingerprint candidates
      })

      const result = await resolveSourceProduct(sourceProduct.id, 'INGEST')

      // Caliber is extracted from "Federal 9mm" title, so fingerprint matching proceeds
      // With no candidates, result is AMBIGUOUS_FINGERPRINT
      assertNeedsReview(result, 'AMBIGUOUS_FINGERPRINT')
      // UPC_NOT_TRUSTED rule is fired, proving the UPC path was attempted but skipped
      assertRulesFired(result, ['UPC_NOT_TRUSTED'])
      // Note: normalizationErrors from UPC path are not preserved in final result
      // because fingerprint matching creates a new result object
    })
  })

  describe('B4. Fingerprint match with clear winner', () => {
    it('returns MATCHED with highest scoring candidate', async () => {
      const sourceProduct = createSourceProduct({
        brand: 'Federal',
        // Default title: 'Federal Premium 9mm Luger 124gr JHP'
        // This extracts: caliber='9mm', grain=124
      })

      // Create candidates with different scores
      const bestMatch = createProduct({
        id: 'best_match',
        brandNorm: 'federal premium',
        caliberNorm: '9mm',
        roundCount: 50,
        grainWeight: 124, // Matches extracted grain
      })
      const poorMatch = createProduct({
        id: 'poor_match',
        brandNorm: 'federal premium',
        caliberNorm: '9mm',
        roundCount: 20, // Different round count
        grainWeight: 115, // Different grain
      })

      setupMocks({
        sourceProduct,
        trustConfig: createTrustConfig({ sourceId: sourceProduct.sourceId, upcTrusted: false }),
        existingProducts: [bestMatch, poorMatch],
      })

      const result = await resolveSourceProduct(sourceProduct.id, 'INGEST')

      // Caliber extraction works now! Title "Federal Premium 9mm Luger 124gr JHP"
      // extracts caliber='9mm' and grain=124, enabling fingerprint matching
      assertMatched(result, 'best_match')
      expect(result.matchType).toBe('FINGERPRINT')
      expect(result.confidence).toBeGreaterThan(0.7) // brand + caliber + grain matches
      assertRulesFired(result, ['FINGERPRINT_MATCHED'])
    })
  })

  describe('B5-B8. Fingerprint edge cases', () => {
    it('returns NEEDS_REVIEW when no candidates found (empty result)', async () => {
      // Default title "Federal Premium 9mm Luger 124gr JHP" extracts caliber='9mm'
      const sourceProduct = createSourceProduct({ brand: 'UnknownBrand' })

      setupMocks({
        sourceProduct,
        trustConfig: createTrustConfig({ sourceId: sourceProduct.sourceId, upcTrusted: false }),
        existingProducts: [], // No candidates match (unknownbrand, 9mm)
      })

      const result = await resolveSourceProduct(sourceProduct.id, 'INGEST')

      // Caliber extraction works, but no candidates match the fingerprint
      // → AMBIGUOUS_FINGERPRINT (no candidates found)
      assertNeedsReview(result, 'AMBIGUOUS_FINGERPRINT')
      assertRulesFired(result, ['AMBIGUOUS_FINGERPRINT'])
    })
  })

  describe('B9. Insufficient data', () => {
    it('returns NEEDS_REVIEW with INSUFFICIENT_DATA when brand is missing', async () => {
      const sourceProduct = createSourceProduct({ brand: null })

      setupMocks({
        sourceProduct,
        trustConfig: createTrustConfig({ sourceId: sourceProduct.sourceId, upcTrusted: false }),
      })

      const result = await resolveSourceProduct(sourceProduct.id, 'INGEST')

      assertNeedsReview(result, 'INSUFFICIENT_DATA')
      assertRulesFired(result, ['INSUFFICIENT_DATA'])
    })
  })

  describe('B10. Idempotency', () => {
    it('returns existing link when inputHash matches (skipped=true, no upsert)', async () => {
      const sourceProduct = createSourceProduct({
        title: 'Federal 9mm 124gr JHP',
        brand: 'Federal',
      })
      sourceProduct.source_product_identifiers = [
        createUpcIdentifier(sourceProduct.id, '012345678901'),
      ]
      const existingProductId = 'existing_product_id'
      const trustConfig = createTrustConfig({
        sourceId: sourceProduct.sourceId,
        upcTrusted: true,
      })

      // Step 1: Run resolver WITHOUT existing link to compute inputHash
      setupMocks({
        sourceProduct: { ...sourceProduct, product_links: null },
        trustConfig,
        existingProducts: [createProduct({ id: existingProductId, canonicalKey: 'UPC:012345678901' })],
      })

      const firstResult = await resolveSourceProduct(sourceProduct.id, 'INGEST')

      // Capture the computed inputHash
      const computedInputHash = firstResult.evidence.inputHash
      expect(computedInputHash).toBeDefined()
      expect(computedInputHash.length).toBe(64) // SHA256 hex

      // Step 2: Reset mocks and set up existing link with matching inputHash
      resetMocks()
      clearTrustConfigCache()

      sourceProduct.product_links = createProductLink({
        sourceProductId: sourceProduct.id,
        productId: existingProductId,
        matchType: 'UPC',
        status: 'MATCHED',
        confidence: 0.99,
        evidence: {
          dictionaryVersion: '1.0.0',
          trustConfigVersion: trustConfig.version,
          inputNormalized: firstResult.evidence.inputNormalized,
          inputHash: computedInputHash, // Use the computed hash
          rulesFired: ['UPC_MATCH_ATTEMPTED', 'UPC_MATCHED'],
        },
      })

      setupMocks({
        sourceProduct,
        trustConfig,
        existingProducts: [createProduct({ id: existingProductId, canonicalKey: 'UPC:012345678901' })],
      })

      // Step 3: Run resolver again - should short-circuit
      const secondResult = await resolveSourceProduct(sourceProduct.id, 'INGEST')

      // Assertions: idempotent short-circuit
      expect(secondResult.skipped).toBe(true)
      expect(secondResult.productId).toBe(existingProductId)
      expect(secondResult.matchType).toBe('UPC')
      expect(secondResult.status).toBe('MATCHED')
      expect(secondResult.evidence.inputHash).toBe(computedInputHash)

      // Short-circuit should avoid UPC lookup/creation
      expect(mockPrisma.products.findUnique).not.toHaveBeenCalled()
      expect(mockPrisma.products.create).not.toHaveBeenCalled()
    })

    it('re-resolves when inputHash differs (input changed)', async () => {
      const sourceProduct = createSourceProduct({
        title: 'Federal 9mm 124gr JHP',
        brand: 'Federal',
      })
      sourceProduct.source_product_identifiers = [
        createUpcIdentifier(sourceProduct.id, '012345678901'),
      ]
      const existingProductId = 'existing_product_id'
      const trustConfig = createTrustConfig({
        sourceId: sourceProduct.sourceId,
        upcTrusted: true,
      })

      // Set up existing link with OLD inputHash (simulating input change)
      sourceProduct.product_links = createProductLink({
        sourceProductId: sourceProduct.id,
        productId: existingProductId,
        matchType: 'UPC',
        status: 'MATCHED',
        evidence: {
          dictionaryVersion: '1.0.0',
          trustConfigVersion: trustConfig.version,
          inputNormalized: {} as any,
          inputHash: 'old_hash_that_will_not_match_new_input_12345678901234567890123456789012',
          rulesFired: ['UPC_MATCHED'],
        },
      })

      setupMocks({
        sourceProduct,
        trustConfig,
        existingProducts: [createProduct({ id: existingProductId, canonicalKey: 'UPC:012345678901' })],
      })

      const result = await resolveSourceProduct(sourceProduct.id, 'INGEST')

      // Should re-resolve (not skipped) because inputHash differs
      expect(result.skipped).toBe(false)
      expect(result.productId).toBe(existingProductId)
      // Should NOT have SKIP_SAME_INPUT in rules
      expect(result.evidence.rulesFired).not.toContain('SKIP_SAME_INPUT')
      // Should have processed normally
      assertRulesFired(result, ['UPC_MATCH_ATTEMPTED'])
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
    clearTrustConfigCache()
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

      // First findUnique returns null (no product exists), then returns the product after race
      let findUniqueCalls = 0
      mockPrisma.products.findUnique.mockImplementation(async () => {
        findUniqueCalls++
        if (findUniqueCalls === 1) return null // First call: product doesn't exist
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

  describe('C4. Persistence shape assertions', () => {
    it('NEEDS_REVIEW result has productId = null', async () => {
      const sourceProduct = createSourceProduct({ brand: null })

      setupMocks({
        sourceProduct,
        trustConfig: createTrustConfig({ sourceId: sourceProduct.sourceId, upcTrusted: false }),
      })

      const result = await resolveSourceProduct(sourceProduct.id, 'INGEST')

      // Core assertion: NEEDS_REVIEW must have null productId
      expect(result.status).toBe('NEEDS_REVIEW')
      expect(result.productId).toBeNull()
      expect(result.matchType).toBe('NONE')
      expect(result.reasonCode).toBe('INSUFFICIENT_DATA')
    })

    it('CREATED result has productId != null', async () => {
      const sourceProduct = createSourceProduct()
      sourceProduct.source_product_identifiers = [
        createUpcIdentifier(sourceProduct.id, '999888777666'),
      ]

      const newProduct = createProduct({
        id: 'newly_created_product',
        canonicalKey: 'UPC:999888777666',
      })

      setupMocks({
        sourceProduct,
        trustConfig: createTrustConfig({ sourceId: sourceProduct.sourceId, upcTrusted: true }),
        existingProducts: [],
        productCreateResult: newProduct,
      })

      const result = await resolveSourceProduct(sourceProduct.id, 'INGEST')

      // Core assertion: CREATED must have non-null productId
      expect(result.status).toBe('CREATED')
      expect(result.productId).toBe('newly_created_product')
      expect(result.productId).not.toBeNull()
      expect(result.createdProduct).toBeDefined()
      expect(result.createdProduct?.id).toBe('newly_created_product')
    })

    it('MATCHED result has productId != null', async () => {
      const sourceProduct = createSourceProduct()
      sourceProduct.source_product_identifiers = [
        createUpcIdentifier(sourceProduct.id, '012345678901'),
      ]
      const existingProductId = 'existing_matched_product'

      setupMocks({
        sourceProduct,
        trustConfig: createTrustConfig({ sourceId: sourceProduct.sourceId, upcTrusted: true }),
        existingProducts: [createProduct({ id: existingProductId, canonicalKey: 'UPC:012345678901' })],
      })

      const result = await resolveSourceProduct(sourceProduct.id, 'INGEST')

      // Core assertion: MATCHED must have non-null productId
      expect(result.status).toBe('MATCHED')
      expect(result.productId).toBe(existingProductId)
      expect(result.productId).not.toBeNull()
    })

    it('ERROR result has productId = null', async () => {
      // Source not found → ERROR status
      setupMocks({
        sourceProduct: null,
      })

      const result = await resolveSourceProduct('nonexistent_id', 'INGEST')

      // Core assertion: ERROR must have null productId
      expect(result.status).toBe('ERROR')
      expect(result.productId).toBeNull()
      // reasonCode is always SYSTEM_ERROR, specific code is in evidence
      expect(result.reasonCode).toBe('SYSTEM_ERROR')
      expect(result.evidence.systemError?.code).toBe('SOURCE_NOT_FOUND')
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
    clearTrustConfigCache()
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
    it('propagates error when products.findUnique fails', async () => {
      const sourceProduct = createSourceProduct()
      sourceProduct.source_product_identifiers = [
        createUpcIdentifier(sourceProduct.id, '012345678901'),
      ]

      mockPrisma.source_products.findUnique.mockResolvedValue(sourceProduct)
      mockPrisma.source_trust_config.findUnique.mockResolvedValue(
        createTrustConfig({ sourceId: sourceProduct.sourceId, upcTrusted: true })
      )
      mockPrisma.products.findUnique.mockRejectedValue(
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
      mockPrisma.products.findUnique.mockResolvedValue(existingProduct)
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
    clearTrustConfigCache()
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

    it('records NEEDS_REVIEW decision', () => {
      recordResolverJob({
        sourceKind: 'DIRECT',
        status: 'NEEDS_REVIEW',
        durationMs: 50,
      })

      const snapshot = getMetricsSnapshot()
      expect(snapshot.decisions['DIRECT']['NEEDS_REVIEW']).toBe(1)
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
        status: 'NEEDS_REVIEW',
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
