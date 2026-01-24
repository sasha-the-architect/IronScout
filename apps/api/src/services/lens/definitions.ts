/**
 * Lens Definitions
 *
 * Static lens configurations for IronScout v1.
 * Implements the Search Lens Specification v1.1.0.
 *
 * Governance:
 * - Lens definitions are versioned
 * - Changes require PR review
 * - Lens changes are treated as product policy changes
 * - No semantic changes without an ADR
 */

import type { Lens, LensId } from './types'

/**
 * Current lens spec version.
 * Update when lens definitions change.
 */
export const LENS_SPEC_VERSION = '1.1.0'

/**
 * Current lens definition version.
 * Bump on any eligibility/ordering/trigger change.
 */
export const LENS_DEFINITION_VERSION = '1.0.0'

/**
 * ALL Lens - Default lens for general searches.
 *
 * Ordering:
 * 1. availability DESC
 * 2. pricePerRound ASC
 * 3. canonicalConfidence DESC
 * 4. productId ASC (tie-breaker)
 */
export const ALL_LENS: Lens = {
  id: 'ALL',
  label: 'All Results',
  description: 'Shows all matching products with availability-first ordering',
  triggers: [],  // ALL never auto-applies via triggers
  ordering: [
    { field: 'availability', direction: 'DESC' },
    { field: 'pricePerRound', direction: 'ASC' },
    { field: 'canonicalConfidence', direction: 'DESC' },
    // productId ASC tie-breaker is automatically appended by ordering logic
  ],
  version: LENS_DEFINITION_VERSION,
}

/**
 * RANGE Lens - For range/target practice ammunition.
 *
 * Optimizes for value (price-first) - ideal for buying practice ammo in bulk.
 * When bulletType is available, FMJ products are boosted in ordering.
 *
 * Ordering:
 * 1. pricePerRound ASC (value-first)
 * 2. availability DESC
 * 3. canonicalConfidence DESC
 * 4. productId ASC (tie-breaker)
 */
export const RANGE_LENS: Lens = {
  id: 'RANGE',
  label: 'Range / Training',
  description: 'Value-optimized ordering for range practice ammunition',
  triggers: [
    { signal: 'usage_hint', value: 'RANGE', minConfidence: 0.7 },
    { signal: 'purpose', value: 'Target', minConfidence: 0.8 },
    { signal: 'purpose', value: 'Training', minConfidence: 0.8 },
  ],
  ordering: [
    { field: 'pricePerRound', direction: 'ASC' },
    { field: 'availability', direction: 'DESC' },
    { field: 'canonicalConfidence', direction: 'DESC' },
  ],
  version: LENS_DEFINITION_VERSION,
}

/**
 * DEFENSIVE Lens - For self-defense ammunition.
 *
 * Optimizes for reliability (availability-first) - critical for defensive ammo.
 * When bulletType is available, HP products are boosted in ordering.
 *
 * Ordering:
 * 1. availability DESC (reliability-first)
 * 2. canonicalConfidence DESC
 * 3. pricePerRound ASC
 * 4. productId ASC (tie-breaker)
 */
export const DEFENSIVE_LENS: Lens = {
  id: 'DEFENSIVE',
  label: 'Defensive',
  description: 'Availability-optimized ordering for self-defense ammunition',
  triggers: [
    { signal: 'usage_hint', value: 'DEFENSIVE', minConfidence: 0.7 },
    { signal: 'purpose', value: 'Defense', minConfidence: 0.8 },
  ],
  ordering: [
    { field: 'availability', direction: 'DESC' },
    { field: 'canonicalConfidence', direction: 'DESC' },
    { field: 'pricePerRound', direction: 'ASC' },
  ],
  version: LENS_DEFINITION_VERSION,
}

/**
 * MATCH Lens - For competition/precision ammunition.
 *
 * Optimizes for quality (confidence-first) - competition shooters want consistency.
 * When bulletType is available, OTM/MATCH products are boosted in ordering.
 *
 * Ordering:
 * 1. canonicalConfidence DESC (quality-first)
 * 2. availability DESC
 * 3. pricePerRound ASC
 * 4. productId ASC (tie-breaker)
 */
export const MATCH_LENS: Lens = {
  id: 'MATCH',
  label: 'Match / Precision',
  description: 'Quality-optimized ordering for competition ammunition',
  triggers: [
    { signal: 'usage_hint', value: 'MATCH', minConfidence: 0.7 },
    { signal: 'qualityLevel', value: 'match-grade', minConfidence: 0.8 },
  ],
  ordering: [
    { field: 'canonicalConfidence', direction: 'DESC' },
    { field: 'availability', direction: 'DESC' },
    { field: 'pricePerRound', direction: 'ASC' },
  ],
  version: LENS_DEFINITION_VERSION,
}

/**
 * Registry of all lens definitions.
 * Keyed by lens ID for O(1) lookup.
 */
export const LENS_REGISTRY: Readonly<Record<LensId, Lens>> = {
  ALL: ALL_LENS,
  RANGE: RANGE_LENS,
  DEFENSIVE: DEFENSIVE_LENS,
  MATCH: MATCH_LENS,
}

/**
 * Get a lens by ID.
 * @param id - The lens ID
 * @returns The lens definition or undefined if not found
 */
export function getLens(id: LensId): Lens | undefined {
  return LENS_REGISTRY[id]
}

/**
 * Get all lenses that can be auto-applied (have triggers).
 * ALL lens is excluded as it has no triggers.
 */
export function getAutoApplyableLenses(): Lens[] {
  return Object.values(LENS_REGISTRY).filter(lens => lens.triggers.length > 0)
}

/**
 * Get all available lens IDs for API response.
 */
export function getValidLensIds(): LensId[] {
  return Object.keys(LENS_REGISTRY) as LensId[]
}

// ============================================================================
// Deploy-Time Validation
// ============================================================================

/**
 * Expected field types per search-lens-v1.md.
 * These are the only fields that can be used in eligibility and ordering rules.
 */
export const EXPECTED_FIELDS: ReadonlySet<string> = new Set([
  // Product-level fields
  'productId',
  'canonicalConfidence',
  'bulletType',
  'grain',
  'casing',
  'packSize',
  // Aggregated/derived fields
  'price',
  'pricePerRound',
  'availability',
])

/**
 * Validation error for lens definitions.
 */
export interface LensValidationError {
  lensId: LensId
  field: string
  type: 'eligibility' | 'ordering'
  message: string
}

/**
 * Validate a lens definition.
 * Per search-lens-v1.md: "Lens definitions must reference only fields in 'Expected Field Types'.
 * Unknown fields fail deploy-time validation."
 *
 * @param lens - The lens to validate
 * @returns Array of validation errors (empty if valid)
 */
export function validateLensDefinition(lens: Lens): LensValidationError[] {
  const errors: LensValidationError[] = []

  // Validate eligibility rule fields (if any)
  for (const rule of lens.eligibility ?? []) {
    if (!EXPECTED_FIELDS.has(rule.field)) {
      errors.push({
        lensId: lens.id,
        field: rule.field,
        type: 'eligibility',
        message: `Unknown field '${rule.field}' in eligibility rule. Valid fields: ${Array.from(EXPECTED_FIELDS).join(', ')}`,
      })
    }
  }

  // Validate ordering rule fields
  for (const rule of lens.ordering) {
    if (!EXPECTED_FIELDS.has(rule.field)) {
      errors.push({
        lensId: lens.id,
        field: rule.field,
        type: 'ordering',
        message: `Unknown field '${rule.field}' in ordering rule. Valid fields: ${Array.from(EXPECTED_FIELDS).join(', ')}`,
      })
    }
  }

  return errors
}

/**
 * Validate all lens definitions in the registry.
 * Should be called at application startup to fail fast on invalid definitions.
 *
 * @throws Error if any lens definition is invalid
 */
export function validateAllLensDefinitions(): void {
  const allErrors: LensValidationError[] = []

  for (const lens of Object.values(LENS_REGISTRY)) {
    const errors = validateLensDefinition(lens)
    allErrors.push(...errors)
  }

  if (allErrors.length > 0) {
    const errorMessages = allErrors.map(e =>
      `[${e.lensId}] ${e.type}: ${e.message}`
    ).join('\n')

    throw new Error(
      `Lens definition validation failed with ${allErrors.length} error(s):\n${errorMessages}`
    )
  }
}

/**
 * Validate lens definitions and log result.
 * Returns true if valid, false otherwise (does not throw).
 */
export function validateAndLogLensDefinitions(): boolean {
  try {
    validateAllLensDefinitions()
    return true
  } catch (error) {
    // Log but don't throw - caller decides how to handle
    console.error('[LENS] Definition validation failed:', error)
    return false
  }
}
