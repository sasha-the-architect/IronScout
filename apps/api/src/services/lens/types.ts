/**
 * Search Lens Types
 *
 * Type definitions for the deterministic lens-based filtering and ordering system.
 * Implements the Search Lens Specification v1.1.0.
 *
 * A Lens is a deterministic, versioned policy object that controls:
 * - Eligibility: which products or offers are allowed
 * - Ordering: how allowed results are sorted
 * - Presentation metadata: how the view is labeled and explained
 */

// ============================================================================
// Lens Signal Types
// ============================================================================

/**
 * A single intent signal extracted from the query.
 * Used as input to lens trigger evaluation.
 */
export interface LensSignal {
  /** The extracted value (e.g., "RANGE", "DEFENSIVE") */
  value: string
  /** Confidence score from the intent extractor (0.0 - 1.0) */
  confidence: number
}

/**
 * All signals extracted from a query.
 * Keys are signal names (e.g., "usage_hint", "quantity_hint").
 */
export type LensSignals = Record<string, LensSignal>

// ============================================================================
// Lens ID Types
// ============================================================================

/**
 * Valid lens identifiers for v1.
 * New lenses require spec updates and ADR review.
 */
export type LensId = 'ALL' | 'RANGE' | 'DEFENSIVE' | 'MATCH'

/**
 * Array of all valid lens IDs for validation.
 */
export const VALID_LENS_IDS: readonly LensId[] = ['ALL', 'RANGE', 'DEFENSIVE', 'MATCH'] as const

/**
 * Check if a string is a valid lens ID.
 */
export function isValidLensId(id: string): id is LensId {
  return (VALID_LENS_IDS as readonly string[]).includes(id)
}

// ============================================================================
// Reason Code Types
// ============================================================================

/**
 * Machine-parseable reason codes for lens selection.
 * Clients MUST use reasonCode for logic, not the human-readable reason field.
 */
export type ReasonCode =
  | 'TRIGGER_MATCH'   // Exactly one lens trigger matched
  | 'USER_OVERRIDE'   // User explicitly selected lens
  | 'NO_MATCH'        // No lens triggers matched, defaulted to ALL
  | 'AMBIGUOUS'       // Multiple lens triggers matched
  | 'ZERO_RESULTS'    // Eligibility filtered all candidates

// ============================================================================
// Trigger Rules
// ============================================================================

/**
 * A trigger rule defines when a Lens may be auto-applied.
 * A lens matches if ANY trigger rule matches (OR logic).
 */
export interface LensTriggerRule {
  /** The signal name to check (e.g., "usage_hint") */
  signal: string
  /** The expected value (exact, case-sensitive string match) */
  value: string
  /** Minimum confidence threshold (inclusive), defaults to 0.0 */
  minConfidence?: number
}

// ============================================================================
// Eligibility Rules
// ============================================================================

/**
 * Eligibility operators for filtering products.
 * No implicit type coercion - types must match exactly.
 */
export type EligibilityOperator =
  | 'EQ'          // field === value
  | 'NOT_EQ'      // field !== value
  | 'IN'          // value (array) includes field
  | 'NOT_IN'      // value (array) does not include field
  | 'GTE'         // field >= value
  | 'LTE'         // field <= value
  | 'IS_NULL'     // field === null
  | 'IS_NOT_NULL' // field !== null

/**
 * An eligibility rule defines a hard constraint.
 * Binary evaluation - no scoring. Failure excludes the product.
 */
export interface EligibilityRule {
  /** The product field to check */
  field: string
  /** The comparison operator */
  operator: EligibilityOperator
  /** The value to compare against. MUST be array for IN/NOT_IN. */
  value: unknown
}

// ============================================================================
// Ordering Rules
// ============================================================================

/**
 * Sort direction for ordering rules.
 */
export type SortDirection = 'ASC' | 'DESC'

/**
 * An ordering rule defines deterministic sorting.
 * Embeddings scores are forbidden.
 */
export interface OrderingRule {
  /** The product field to sort by */
  field: string
  /** The sort direction */
  direction: SortDirection
}

// ============================================================================
// Lens Definition
// ============================================================================

/**
 * A Lens is a deterministic, versioned policy object.
 *
 * Design Philosophy (v1.1):
 * - Lenses are **ordering-focused** - they optimize sort order for use cases
 * - Eligibility filtering is optional and used sparingly
 * - Best-effort approach: missing metadata should not hide products
 * - Embeddings never rank - only declared ordering rules
 *
 * Invariants:
 * - Lenses are deterministic given intent signals
 * - Ordering derives from declared rules only
 * - Products with null fields sort LAST, not excluded
 */
export interface Lens {
  /** Unique lens identifier */
  id: LensId
  /** Human-readable label for the lens */
  label: string
  /** Description of the lens purpose */
  description: string
  /** Trigger rules - lens matches if ANY rule matches (OR logic) */
  triggers: LensTriggerRule[]
  /** Eligibility rules (optional) - ALL must pass for a product to be included */
  eligibility?: EligibilityRule[]
  /** Ordering rules - applied in sequence, nulls sort LAST */
  ordering: OrderingRule[]
  /** Semantic version of the lens definition */
  version: string
}

// ============================================================================
// Lens Metadata (Response)
// ============================================================================

/**
 * Lens metadata included in search responses.
 * Provides transparency about lens selection and behavior.
 */
export interface LensMetadata {
  /** Lens identifier */
  id: LensId
  /** Human-readable label */
  label: string
  /** True if lens was auto-applied based on triggers */
  autoApplied: boolean
  /** True when 2+ triggers matched (only when using ALL as fallback) */
  ambiguous?: boolean
  /** Lens IDs that matched, sorted lexicographically (only when ambiguous) */
  candidates?: LensId[]
  /** True when eligibility filtered all candidates */
  zeroResults?: boolean
  /** Machine-parseable reason for lens selection (REQUIRED) */
  reasonCode: ReasonCode
  /** Human-readable reason (OPTIONAL, informational only) */
  reason?: string
  /** True if user can override this lens (always true in v1) */
  canOverride: boolean
  /** Lens definition version */
  version: string
  /** Intent extractor model version */
  extractorModelId: string
}

// ============================================================================
// Aggregated Product Types
// ============================================================================

/**
 * Availability status for products.
 * Sort order (DESC): IN_STOCK > LOW_STOCK > OUT_OF_STOCK
 */
export type Availability = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK'

/**
 * Numeric rank for availability to enable deterministic sorting.
 * Higher rank = better availability.
 */
export const AVAILABILITY_RANK: Record<Availability, number> = {
  OUT_OF_STOCK: 1,
  LOW_STOCK: 2,
  IN_STOCK: 3,
}

/**
 * Get availability rank, treating null as OUT_OF_STOCK.
 */
export function getAvailabilityRank(availability: Availability | null | undefined): number {
  if (!availability) return AVAILABILITY_RANK.OUT_OF_STOCK
  return AVAILABILITY_RANK[availability] ?? AVAILABILITY_RANK.OUT_OF_STOCK
}

/**
 * An aggregated product view computed from visible offers.
 * This is the input to lens eligibility and ordering evaluation.
 */
export interface AggregatedProduct {
  // Product-level fields (canonical, no aggregation)
  productId: string
  bulletType: string | null
  grain: number | null
  casing: string | null
  packSize: number | null
  canonicalConfidence: number | null

  // Offer-level fields (aggregated across visible offers)
  price: number | null          // min(offer.price)
  availability: Availability    // max(offer.availabilityRank)

  // Derived fields
  pricePerRound: number | null  // price / packSize, null if either is null/invalid

  // Original product data (for response)
  _originalProduct: unknown
  _visibleOfferCount: number
}

// ============================================================================
// Lens Selection Result
// ============================================================================

/**
 * Result of lens selection logic.
 */
export interface LensSelectionResult {
  /** The selected lens */
  lens: Lens
  /** Metadata about the selection */
  metadata: LensMetadata
  /** Lens IDs that matched triggers (for ambiguity detection) */
  matchedLensIds: LensId[]
}

// ============================================================================
// Telemetry Types (Appendix A)
// ============================================================================

/**
 * Intent extraction status for telemetry.
 */
export type IntentStatus = 'OK' | 'PARTIAL' | 'FAILED'

/**
 * A single trigger match result for telemetry.
 * Per spec A.7: provides deterministic representation of trigger evaluation.
 */
export interface TriggerMatch {
  /** The lens this trigger belongs to */
  lensId: LensId
  /** Index of the trigger rule in the lens definition */
  triggerId: number
  /** The signal key being checked */
  signalKey: string
  /** The expected value from the trigger rule */
  expected: string
  /** The actual value from the signal (null if signal missing) */
  actual: string | null
  /** The actual confidence from the signal (null if signal missing) */
  actualConfidence: number | null
  /** The minimum confidence required */
  minConfidence: number
  /** Whether this trigger passed */
  passed: boolean
}

/**
 * Lens evaluation telemetry event (lens_eval.v1).
 * Emitted server-side after lens evaluation completes.
 */
export interface LensEvalTelemetry {
  eventName: 'lens_eval.v1'
  schemaVersion: 1
  lensSpecVersion: string
  timestamp: string // ISO-8601 UTC
  requestId: string
  traceId?: string

  actor: {
    userIdHash?: string
    sessionId?: string
  }

  query: {
    hash: string      // sha256 of normalized query
    length: number
    piiFlag: boolean  // heuristic PII detection
    norm?: string     // optional normalized query (redacted for PII)
  }

  intent: {
    extractorModelId: string
    extractorVersion: string  // Per spec A.6: extractor version for audit
    extractorTemp: number // explicitly log even if 0
    status: IntentStatus
    signals: Array<{ key: string; value: string; confidence: number }>
    failureReason?: string
  }

  lens: {
    overrideId: LensId | null
    selectedId: LensId
    version: string
    reasonCode: ReasonCode
    candidates: Array<{
      lensId: LensId
      version: string
      triggerScore: number
    }>
    /** Per spec A.7: deterministic trigger evaluation proof */
    triggerMatches: TriggerMatch[]
  }

  config: {
    priceLookbackDays: number
    asOfTime: string // ISO-8601 UTC
    eligibilityConfigVersion?: string
    orderingConfigVersion?: string
  }

  eligibility: {
    candidates: number      // pre-filter count
    eligible: number        // post-filter count
    filteredByReason: Record<string, number>
    zeroResults: boolean
    zeroResultsReasonCode?: string
  }

  results: {
    returned: number
    top: Array<{
      productId: string
      sortKeys: Record<string, unknown>
    }>
    finalProductIdsTopN?: string[]
    offerSummary?: Array<{
      productId: string
      visibleOfferCount: number
      aggregatedPrice: number | null
      availabilityRank: number
      pricePerRound: number | null
      priceMeta: {
        windowDays: number
        sampleCount: number
        asOf: string
      }
    }>
  }

  perf: {
    latencyMsTotal: number
    latencyMsIntent: number
    latencyMsOffers: number
    latencyMsRank: number
  }

  status: 'OK' | 'DEGRADED' | 'FAILED'
}

// ============================================================================
// Feature Flag
// ============================================================================

/**
 * Check if the lens feature is enabled.
 * Default: false (off).
 */
export function isLensEnabled(): boolean {
  return process.env.ENABLE_LENS_V1 === 'true'
}
