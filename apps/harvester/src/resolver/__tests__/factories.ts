/**
 * Test Factories for Product Resolver
 *
 * Provides factory functions to create test fixtures with sensible defaults.
 * All factories support partial overrides for flexibility.
 */

import type { ResolverResult, ResolverEvidence, NormalizedInput, SourceTrustConfig, ResolverCandidate } from '../types'

// ═══════════════════════════════════════════════════════════════════════════════
// Source Product Factories
// ═══════════════════════════════════════════════════════════════════════════════

export interface MockSourceProduct {
  id: string
  sourceId: string
  title: string
  brand?: string | null
  url: string
  normalizedUrl?: string | null
  sources: MockSource
  source_product_identifiers: MockIdentifier[]
  product_links?: MockProductLink | null
}

export interface MockSource {
  id: string
  sourceKind: 'DIRECT' | 'AFFILIATE_FEED' | 'OTHER'
  name: string
}

export interface MockIdentifier {
  id: string
  sourceProductId: string
  idType: 'UPC' | 'SKU' | 'ASIN' | 'MPN'
  idValue: string
}

export interface MockProductLink {
  id: string
  sourceProductId: string
  productId: string | null
  matchType: 'UPC' | 'FINGERPRINT' | 'MANUAL' | 'NONE' | 'ERROR'
  status: 'MATCHED' | 'CREATED' | 'UNMATCHED' | 'ERROR'
  reasonCode: string | null
  confidence: number
  resolverVersion: string
  resolvedAt: Date | null
  evidence: ResolverEvidence | null
}

export interface MockProduct {
  id: string
  canonicalKey: string | null
  name: string
  category: string
  brand?: string | null
  brandNorm?: string | null
  caliberNorm?: string | null
  roundCount?: number | null
  grainWeight?: number | null
  upcNorm?: string | null
}

export interface MockTrustConfig {
  sourceId: string
  upcTrusted: boolean
  version: number
}

export interface MockProductAlias {
  fromProductId: string
  toProductId: string
}

let idCounter = 0
function nextId(prefix = 'test'): string {
  return `${prefix}_${++idCounter}_${Date.now()}`
}

/**
 * Reset ID counter (call in beforeEach)
 */
export function resetFactories(): void {
  idCounter = 0
}

/**
 * Create a mock source_product with defaults
 */
export function createSourceProduct(overrides: Partial<MockSourceProduct> = {}): MockSourceProduct {
  const id = overrides.id ?? nextId('sp')
  const sourceId = overrides.sourceId ?? nextId('src')

  return {
    id,
    sourceId,
    title: 'Federal Premium 9mm Luger 124gr JHP',
    brand: 'Federal',
    url: `https://example.com/products/${id}`,
    normalizedUrl: `example.com/products/${id}`,
    sources: overrides.sources ?? createSource({ id: sourceId }),
    source_product_identifiers: overrides.source_product_identifiers ?? [],
    product_links: overrides.product_links ?? null,
    ...overrides,
  }
}

/**
 * Create a mock source
 */
export function createSource(overrides: Partial<MockSource> = {}): MockSource {
  return {
    id: overrides.id ?? nextId('src'),
    sourceKind: 'DIRECT',
    name: 'Test Retailer',
    ...overrides,
  }
}

/**
 * Create a UPC identifier
 */
export function createUpcIdentifier(
  sourceProductId: string,
  upc: string
): MockIdentifier {
  return {
    id: nextId('id'),
    sourceProductId,
    idType: 'UPC',
    idValue: upc,
  }
}

/**
 * Create a SKU identifier
 */
export function createSkuIdentifier(
  sourceProductId: string,
  sku: string
): MockIdentifier {
  return {
    id: nextId('id'),
    sourceProductId,
    idType: 'SKU',
    idValue: sku,
  }
}

/**
 * Create a mock product_link (existing link)
 */
export function createProductLink(overrides: Partial<MockProductLink> = {}): MockProductLink {
  return {
    id: nextId('pl'),
    sourceProductId: overrides.sourceProductId ?? nextId('sp'),
    productId: overrides.productId ?? nextId('prod'),
    matchType: 'UPC',
    status: 'MATCHED',
    reasonCode: null,
    confidence: 0.95,
    resolverVersion: '1.2.0',
    resolvedAt: new Date(),
    evidence: null,
    ...overrides,
  }
}

/**
 * Create a mock canonical product
 */
export function createProduct(overrides: Partial<MockProduct> = {}): MockProduct {
  const id = overrides.id ?? nextId('prod')
  return {
    id,
    canonicalKey: overrides.canonicalKey ?? `UPC:012345678901`,
    name: 'Federal Premium 9mm Luger 124gr JHP',
    category: 'ammunition',
    brand: 'Federal',
    brandNorm: 'federal premium',
    caliberNorm: '9mm',
    roundCount: 50,
    grainWeight: 124,
    upcNorm: '012345678901',
    ...overrides,
  }
}

/**
 * Create a mock trust config
 */
export function createTrustConfig(overrides: Partial<MockTrustConfig> = {}): MockTrustConfig {
  return {
    sourceId: overrides.sourceId ?? nextId('src'),
    upcTrusted: true,
    version: 1,
    ...overrides,
  }
}

/**
 * Create a mock product alias
 */
export function createProductAlias(
  fromProductId: string,
  toProductId: string
): MockProductAlias {
  return { fromProductId, toProductId }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Input Scenarios (Table-driven test data)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Golden test scenarios covering all major paths
 */
export const GOLDEN_SCENARIOS = {
  // MATCHED via UPC (trusted source, UPC present, existing product)
  upcMatch: () => {
    const sourceProduct = createSourceProduct({
      title: 'Federal 9mm 124gr JHP',
      brand: 'Federal',
    })
    sourceProduct.source_product_identifiers = [
      createUpcIdentifier(sourceProduct.id, '012345678901'),
    ]
    const trustConfig = createTrustConfig({
      sourceId: sourceProduct.sourceId,
      upcTrusted: true,
    })
    const existingProduct = createProduct({
      canonicalKey: 'UPC:012345678901',
      upcNorm: '012345678901',
    })
    return { sourceProduct, trustConfig, existingProduct }
  },

  // CREATED via UPC (trusted source, UPC present, no existing product)
  upcCreate: () => {
    const sourceProduct = createSourceProduct({
      title: 'New Ammo Product',
      brand: 'NewBrand',
    })
    sourceProduct.source_product_identifiers = [
      createUpcIdentifier(sourceProduct.id, '999888777666'),
    ]
    const trustConfig = createTrustConfig({
      sourceId: sourceProduct.sourceId,
      upcTrusted: true,
    })
    return { sourceProduct, trustConfig, existingProduct: null }
  },

  // UNMATCHED - insufficient data (no brand)
  insufficientData: () => {
    const sourceProduct = createSourceProduct({
      title: 'Mystery Ammo',
      brand: null, // Missing brand
    })
    const trustConfig = createTrustConfig({
      sourceId: sourceProduct.sourceId,
      upcTrusted: false,
    })
    return { sourceProduct, trustConfig }
  },

  // UNMATCHED - UPC present but source not trusted
  upcNotTrusted: () => {
    const sourceProduct = createSourceProduct({
      title: 'Federal 9mm',
      brand: 'Federal',
    })
    sourceProduct.source_product_identifiers = [
      createUpcIdentifier(sourceProduct.id, '012345678901'),
    ]
    const trustConfig = createTrustConfig({
      sourceId: sourceProduct.sourceId,
      upcTrusted: false, // Not trusted
    })
    return { sourceProduct, trustConfig }
  },

  // ERROR - source_product not found
  sourceNotFound: () => {
    return { sourceProductId: 'nonexistent_id' }
  },

  // MANUAL lock - existing link with MANUAL matchType
  manualLock: () => {
    const productId = nextId('prod')
    const sourceProduct = createSourceProduct()
    sourceProduct.product_links = createProductLink({
      sourceProductId: sourceProduct.id,
      productId,
      matchType: 'MANUAL',
      status: 'MATCHED',
      confidence: 1.0,
    })
    const trustConfig = createTrustConfig({ sourceId: sourceProduct.sourceId })
    return { sourceProduct, trustConfig, productId }
  },

  // Idempotent - same inputHash as existing link
  idempotent: () => {
    const sourceProduct = createSourceProduct({
      title: 'Consistent Product',
      brand: 'Brand',
    })
    // The evidence will have a matching inputHash
    sourceProduct.product_links = createProductLink({
      sourceProductId: sourceProduct.id,
      matchType: 'UPC',
      status: 'MATCHED',
      evidence: {
        dictionaryVersion: '1.0.0',
        trustConfigVersion: 1,
        inputNormalized: {} as NormalizedInput,
        inputHash: 'WILL_BE_COMPUTED', // Test will set this
        rulesFired: [],
      },
    })
    const trustConfig = createTrustConfig({ sourceId: sourceProduct.sourceId })
    return { sourceProduct, trustConfig }
  },
}

// ═══════════════════════════════════════════════════════════════════════════════
// Normalization Test Cases
// ═══════════════════════════════════════════════════════════════════════════════

export const NORMALIZATION_CASES = {
  title: [
    { input: 'Federal Premium 9mm', expected: 'federal premium 9mm' },
    { input: '  Spaced  Out  Title  ', expected: 'spaced out title' },
    { input: 'UPPERCASE TITLE', expected: 'uppercase title' },
    { input: 'Title With Punctuation!@#$%', expected: 'title with punctuation' },
    { input: 'Unicode: Ñoño café', expected: 'unicode oño café' }, // Note: \w matches some unicode
    { input: '', expected: '' },
  ],
  brand: [
    { input: 'Federal', expected: 'federal' },
    { input: 'WINCHESTER', expected: 'winchester' },
    { input: '  Spacy  Brand  ', expected: 'spacy brand' },
    { input: 'Brand™®', expected: 'brand' },
    { input: null, expected: undefined },
    { input: undefined, expected: undefined },
    { input: '', expected: '' },
  ],
  upc: [
    { input: '012345678901', expected: '012345678901' }, // 12 digits
    { input: '12345678901', expected: '012345678901' }, // 11 digits, padded
    { input: '1234567890123', expected: '1234567890123' }, // 13 digits EAN
    { input: '12345678901234', expected: '12345678901234' }, // 14 digits GTIN
    { input: '0-12345-67890-1', expected: '012345678901' }, // With dashes
    { input: '012 345 678 901', expected: '012345678901' }, // With spaces
    { input: '123', expected: undefined }, // Too short
    { input: '123456789012345', expected: undefined }, // Too long
    { input: null, expected: undefined },
    { input: '', expected: undefined },
  ],
}

// ═══════════════════════════════════════════════════════════════════════════════
// Edge Case Inputs
// ═══════════════════════════════════════════════════════════════════════════════

export const EDGE_CASES = {
  // Extremely long strings
  longTitle: 'A'.repeat(10000),
  longBrand: 'B'.repeat(1000),
  longUpc: '1'.repeat(100),

  // Unicode edge cases
  unicodeTitles: [
    '弾薬 9mm', // Japanese
    'Munición 9mm', // Spanish with accent
    '🔫 Ammo', // Emoji
    'Ammo\u0000Null', // Null character
    'Ammo\t\n\rWhitespace', // Various whitespace
  ],

  // Whitespace variations
  whitespaceVariations: [
    '  leading',
    'trailing  ',
    'multiple    spaces',
    '\ttabs\there',
    '\nnewlines\n',
    '\r\nwindows\r\n',
  ],
}

// ═══════════════════════════════════════════════════════════════════════════════
// Assertion Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Assert result is a successful match
 */
export function assertMatched(result: ResolverResult, expectedProductId?: string): void {
  if (result.status !== 'MATCHED') {
    throw new Error(`Expected MATCHED, got ${result.status}: ${JSON.stringify(result)}`)
  }
  if (result.productId === null) {
    throw new Error('Expected productId to be set for MATCHED result')
  }
  if (expectedProductId && result.productId !== expectedProductId) {
    throw new Error(`Expected productId ${expectedProductId}, got ${result.productId}`)
  }
}

/**
 * Assert result is a created product
 */
export function assertCreated(result: ResolverResult): void {
  if (result.status !== 'CREATED') {
    throw new Error(`Expected CREATED, got ${result.status}: ${JSON.stringify(result)}`)
  }
  if (result.productId === null) {
    throw new Error('Expected productId to be set for CREATED result')
  }
  if (!result.createdProduct) {
    throw new Error('Expected createdProduct to be present for CREATED result')
  }
}

/**
 * Assert result is unmatched
 */
/**
 * Assert result is NEEDS_REVIEW (insufficient data or ambiguous)
 */
export function assertNeedsReview(result: ResolverResult, expectedReasonCode?: string): void {
  if (result.status !== 'NEEDS_REVIEW') {
    throw new Error(`Expected NEEDS_REVIEW, got ${result.status}: ${JSON.stringify(result)}`)
  }
  if (result.productId !== null) {
    throw new Error('Expected productId to be null for NEEDS_REVIEW result')
  }
  if (expectedReasonCode && result.reasonCode !== expectedReasonCode) {
    throw new Error(`Expected reasonCode ${expectedReasonCode}, got ${result.reasonCode}`)
  }
}

/**
 * Assert result is an error
 */
export function assertError(result: ResolverResult, expectedCode?: string): void {
  if (result.status !== 'ERROR') {
    throw new Error(`Expected ERROR, got ${result.status}: ${JSON.stringify(result)}`)
  }
  if (result.productId !== null) {
    throw new Error('Expected productId to be null for ERROR result')
  }
  if (expectedCode && result.evidence.systemError?.code !== expectedCode) {
    throw new Error(`Expected error code ${expectedCode}, got ${result.evidence.systemError?.code}`)
  }
}

/**
 * Assert evidence contains expected rules fired
 */
export function assertRulesFired(result: ResolverResult, expectedRules: string[]): void {
  const fired = result.evidence.rulesFired || []
  for (const rule of expectedRules) {
    // Allow prefix matching for rules like ALIAS_RESOLVED:xxx
    const found = fired.some(f => f === rule || f.startsWith(rule))
    if (!found) {
      throw new Error(`Expected rule "${rule}" to be fired. Fired: ${JSON.stringify(fired)}`)
    }
  }
}
