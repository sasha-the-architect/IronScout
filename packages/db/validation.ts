/**
 * Data Validation utilities for enforcing business rules
 *
 * These functions provide application-level validation for data integrity
 * constraints that cannot be easily expressed as database constraints.
 */

import { prisma } from './index.js'

// =============================================================================
// Provenance Validation (ADR-015)
// =============================================================================

/**
 * Valid ingestion run types for provenance tracking.
 * Must match the IngestionRunType enum in schema.prisma.
 */
export type IngestionRunType = 'SCRAPE' | 'AFFILIATE_FEED' | 'RETAILER_FEED' | 'MANUAL'

/**
 * Provenance data required for prices and pricing_snapshots.
 * ADR-015 mandates these fields on all new writes.
 */
export interface ProvenanceData {
  ingestionRunType: IngestionRunType
  ingestionRunId: string
  observedAt: Date
}

/**
 * Validates that provenance fields are present and valid.
 *
 * ADR-015 requires all new prices/pricing_snapshots to include:
 * - ingestionRunType: The type of ingestion that produced this data
 * - ingestionRunId: A unique identifier for the ingestion run
 * - observedAt: When the price was observed at the source
 *
 * @param data - The provenance data to validate
 * @returns { valid: boolean; errors?: string[] }
 *
 * @example
 * const result = validateProvenance({
 *   ingestionRunType: 'SCRAPE',
 *   ingestionRunId: 'exec-123',
 *   observedAt: new Date()
 * })
 * // => { valid: true }
 *
 * const invalid = validateProvenance({
 *   ingestionRunType: null,
 *   ingestionRunId: '',
 *   observedAt: undefined
 * })
 * // => { valid: false, errors: ['ingestionRunType is required', ...] }
 */
export function validateProvenance(data: {
  ingestionRunType?: IngestionRunType | null
  ingestionRunId?: string | null
  observedAt?: Date | null
}): { valid: boolean; errors?: string[] } {
  const errors: string[] = []

  // Check ingestionRunType
  if (!data.ingestionRunType) {
    errors.push('ingestionRunType is required (ADR-015)')
  } else {
    const validTypes: IngestionRunType[] = ['SCRAPE', 'AFFILIATE_FEED', 'RETAILER_FEED', 'MANUAL']
    if (!validTypes.includes(data.ingestionRunType)) {
      errors.push(`ingestionRunType must be one of: ${validTypes.join(', ')}`)
    }
  }

  // Check ingestionRunId
  if (!data.ingestionRunId || data.ingestionRunId.trim() === '') {
    errors.push('ingestionRunId is required (ADR-015)')
  }

  // Check observedAt
  if (!data.observedAt) {
    errors.push('observedAt is required (ADR-015)')
  } else if (!(data.observedAt instanceof Date) || isNaN(data.observedAt.getTime())) {
    errors.push('observedAt must be a valid Date')
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors }
}

/**
 * Asserts that provenance fields are valid. Throws if validation fails.
 *
 * Use this before creating prices or pricing_snapshots to ensure
 * ADR-015 compliance at the application level.
 *
 * @param data - The provenance data to validate
 * @throws Error if any provenance field is missing or invalid
 *
 * @example
 * // In a write path:
 * const provenance = {
 *   ingestionRunType: 'SCRAPE' as const,
 *   ingestionRunId: executionId,
 *   observedAt: new Date()
 * }
 * assertProvenanceValid(provenance)
 * await prisma.prices.create({ data: { ...priceData, ...provenance } })
 */
export function assertProvenanceValid(data: {
  ingestionRunType?: IngestionRunType | null
  ingestionRunId?: string | null
  observedAt?: Date | null
}): asserts data is ProvenanceData {
  const result = validateProvenance(data)

  if (!result.valid) {
    throw new Error(`Invalid provenance: ${result.errors!.join('; ')}`)
  }
}

/**
 * Creates a provenance object with the required fields.
 * Convenience function to ensure type safety when building price records.
 *
 * @param type - The ingestion run type
 * @param runId - The ingestion run ID
 * @param observedAt - When the price was observed (defaults to now)
 * @returns A validated ProvenanceData object
 *
 * @example
 * const provenance = createProvenance('SCRAPE', executionId)
 * await prisma.prices.create({ data: { ...priceData, ...provenance } })
 */
export function createProvenance(
  type: IngestionRunType,
  runId: string,
  observedAt: Date = new Date()
): ProvenanceData {
  assertProvenanceValid({ ingestionRunType: type, ingestionRunId: runId, observedAt })
  return { ingestionRunType: type, ingestionRunId: runId, observedAt }
}

// =============================================================================
// Pricing Snapshots Alignment Validation
// =============================================================================

/**
 * Validates that a (retailerId, merchantId) pair is valid per merchant_retailers.
 *
 * Rules:
 * - If retailerId is null/undefined, validation passes (merchant-only snapshots are valid)
 * - If retailerId is provided, there must be an ACTIVE merchant_retailers record
 *   linking that retailer to the specified merchant
 *
 * @param retailerId - The retailer ID (optional)
 * @param merchantId - The merchant ID (required)
 * @returns Promise<{ valid: boolean; error?: string }>
 *
 * @example
 * // Merchant-only snapshot (no retailer) - always valid
 * await validatePricingSnapshotAlignment(null, 'merchant_123')
 * // => { valid: true }
 *
 * // Valid retailer-merchant pair
 * await validatePricingSnapshotAlignment('retailer_456', 'merchant_123')
 * // => { valid: true } (if merchant_retailers record exists)
 *
 * // Invalid pair
 * await validatePricingSnapshotAlignment('retailer_456', 'wrong_merchant')
 * // => { valid: false, error: 'Retailer retailer_456 is not associated with merchant wrong_merchant' }
 */
export async function validatePricingSnapshotAlignment(
  retailerId: string | null | undefined,
  merchantId: string
): Promise<{ valid: boolean; error?: string }> {
  // If no retailerId, validation passes (merchant-only snapshots are valid)
  if (!retailerId) {
    return { valid: true }
  }

  // Check if the retailer-merchant pair exists in merchant_retailers
  const relationship = await prisma.merchant_retailers.findFirst({
    where: {
      retailerId,
      merchantId,
      status: 'ACTIVE',
    },
    select: { id: true },
  })

  if (!relationship) {
    return {
      valid: false,
      error: `Retailer ${retailerId} is not associated with merchant ${merchantId} (no active merchant_retailers record)`,
    }
  }

  return { valid: true }
}

/**
 * Validates pricing snapshot data before creation.
 * Throws an error if validation fails.
 *
 * @param data - The pricing snapshot data to validate
 * @throws Error if retailerId-merchantId alignment is invalid
 *
 * @example
 * // Use before creating a pricing snapshot
 * await assertPricingSnapshotValid({ retailerId: 'r1', merchantId: 'm1', ... })
 * await prisma.pricing_snapshots.create({ data: { ... } })
 */
export async function assertPricingSnapshotValid(data: {
  retailerId?: string | null
  merchantId: string
}): Promise<void> {
  const result = await validatePricingSnapshotAlignment(data.retailerId, data.merchantId)

  if (!result.valid) {
    throw new Error(`Invalid pricing snapshot: ${result.error}`)
  }
}

// =============================================================================
// Batch Validation
// =============================================================================

/**
 * Validates multiple retailer-merchant pairs efficiently.
 * Useful for batch inserts where you want to validate all pairs upfront.
 *
 * @param pairs - Array of { retailerId, merchantId } pairs to validate
 * @returns Promise with valid pairs and invalid pairs with errors
 */
export async function validatePricingSnapshotAlignmentBatch(
  pairs: Array<{ retailerId: string | null | undefined; merchantId: string }>
): Promise<{
  valid: Array<{ retailerId: string | null | undefined; merchantId: string }>
  invalid: Array<{ retailerId: string; merchantId: string; error: string }>
}> {
  const valid: Array<{ retailerId: string | null | undefined; merchantId: string }> = []
  const invalid: Array<{ retailerId: string; merchantId: string; error: string }> = []

  // Separate pairs with and without retailerId
  const pairsWithRetailer = pairs.filter((p) => p.retailerId != null) as Array<{
    retailerId: string
    merchantId: string
  }>
  const pairsWithoutRetailer = pairs.filter((p) => p.retailerId == null)

  // Pairs without retailerId are always valid
  valid.push(...pairsWithoutRetailer)

  if (pairsWithRetailer.length === 0) {
    return { valid, invalid }
  }

  // Get all unique retailer-merchant pairs to check
  const uniquePairs = new Map<string, { retailerId: string; merchantId: string }>()
  for (const pair of pairsWithRetailer) {
    const key = `${pair.retailerId}:${pair.merchantId}`
    uniquePairs.set(key, pair)
  }

  // Fetch all valid relationships in one query
  const validRelationships = await prisma.merchant_retailers.findMany({
    where: {
      OR: Array.from(uniquePairs.values()).map((p) => ({
        retailerId: p.retailerId,
        merchantId: p.merchantId,
        status: 'ACTIVE',
      })),
    },
    select: {
      retailerId: true,
      merchantId: true,
    },
  })

  // Build set of valid pairs
  const validPairKeys = new Set(validRelationships.map((r) => `${r.retailerId}:${r.merchantId}`))

  // Categorize original pairs
  for (const pair of pairsWithRetailer) {
    const key = `${pair.retailerId}:${pair.merchantId}`
    if (validPairKeys.has(key)) {
      valid.push(pair)
    } else {
      invalid.push({
        ...pair,
        error: `Retailer ${pair.retailerId} is not associated with merchant ${pair.merchantId}`,
      })
    }
  }

  return { valid, invalid }
}
