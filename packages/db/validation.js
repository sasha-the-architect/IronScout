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
 * @type {readonly ['SCRAPE', 'AFFILIATE_FEED', 'RETAILER_FEED', 'MANUAL']}
 */
const VALID_INGESTION_RUN_TYPES = ['SCRAPE', 'AFFILIATE_FEED', 'RETAILER_FEED', 'MANUAL']

/**
 * Validates that provenance fields are present and valid.
 *
 * ADR-015 requires all new prices/pricing_snapshots to include:
 * - ingestionRunType: The type of ingestion that produced this data
 * - ingestionRunId: A unique identifier for the ingestion run
 * - observedAt: When the price was observed at the source
 *
 * @param {{ ingestionRunType?: string | null; ingestionRunId?: string | null; observedAt?: Date | null }} data
 * @returns {{ valid: boolean; errors?: string[] }}
 */
export function validateProvenance(data) {
  const errors = []

  // Check ingestionRunType
  if (!data.ingestionRunType) {
    errors.push('ingestionRunType is required (ADR-015)')
  } else if (!VALID_INGESTION_RUN_TYPES.includes(data.ingestionRunType)) {
    errors.push(`ingestionRunType must be one of: ${VALID_INGESTION_RUN_TYPES.join(', ')}`)
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
 * @param {{ ingestionRunType?: string | null; ingestionRunId?: string | null; observedAt?: Date | null }} data
 * @throws {Error} if any provenance field is missing or invalid
 */
export function assertProvenanceValid(data) {
  const result = validateProvenance(data)

  if (!result.valid) {
    throw new Error(`Invalid provenance: ${result.errors.join('; ')}`)
  }
}

/**
 * Creates a provenance object with the required fields.
 * Convenience function to ensure type safety when building price records.
 *
 * @param {'SCRAPE' | 'AFFILIATE_FEED' | 'RETAILER_FEED' | 'MANUAL'} type - The ingestion run type
 * @param {string} runId - The ingestion run ID
 * @param {Date} [observedAt=new Date()] - When the price was observed
 * @returns {{ ingestionRunType: string; ingestionRunId: string; observedAt: Date }}
 */
export function createProvenance(type, runId, observedAt = new Date()) {
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
 * @param {string | null | undefined} retailerId - The retailer ID (optional)
 * @param {string} merchantId - The merchant ID (required)
 * @returns {Promise<{ valid: boolean; error?: string }>}
 */
export async function validatePricingSnapshotAlignment(retailerId, merchantId) {
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
 * @param {{ retailerId?: string | null; merchantId: string }} data - The pricing snapshot data to validate
 * @throws {Error} if retailerId-merchantId alignment is invalid
 */
export async function assertPricingSnapshotValid(data) {
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
 * @param {Array<{ retailerId: string | null | undefined; merchantId: string }>} pairs - Array of pairs to validate
 * @returns {Promise<{ valid: Array<{ retailerId: string | null | undefined; merchantId: string }>; invalid: Array<{ retailerId: string; merchantId: string; error: string }> }>}
 */
export async function validatePricingSnapshotAlignmentBatch(pairs) {
  const valid = []
  const invalid = []

  // Separate pairs with and without retailerId
  const pairsWithRetailer = pairs.filter((p) => p.retailerId != null)
  const pairsWithoutRetailer = pairs.filter((p) => p.retailerId == null)

  // Pairs without retailerId are always valid
  valid.push(...pairsWithoutRetailer)

  if (pairsWithRetailer.length === 0) {
    return { valid, invalid }
  }

  // Get all unique retailer-merchant pairs to check
  const uniquePairs = new Map()
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
