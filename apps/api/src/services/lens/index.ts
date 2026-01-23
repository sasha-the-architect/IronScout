/**
 * Search Lens Module
 *
 * A deterministic, policy-based filtering and ordering system for search results.
 * Implements the Search Lens Specification v1.1.0.
 *
 * A Lens defines how IronScout interprets buyer intent and shapes search results.
 * Lenses encode policy, not intelligence:
 * - Does not recommend
 * - Does not judge quality
 * - Does not optimize for engagement
 * - Does not learn implicitly
 *
 * @module lens
 */

// Types (type-only exports for ESM compatibility)
export type {
  // Core types
  LensSignal,
  LensSignals,
  LensId,
  ReasonCode,
  LensTriggerRule,
  EligibilityOperator,
  EligibilityRule,
  SortDirection,
  OrderingRule,
  Lens,
  LensMetadata,
  Availability,
  AggregatedProduct,
  LensSelectionResult,
  // Telemetry types
  IntentStatus,
  TriggerMatch,
  LensEvalTelemetry,
} from './types'

// Value exports from types
export {
  VALID_LENS_IDS,
  isValidLensId,
  AVAILABILITY_RANK,
  getAvailabilityRank,
  isLensEnabled,
} from './types'

// Definitions
export {
  LENS_SPEC_VERSION,
  LENS_DEFINITION_VERSION,
  ALL_LENS,
  RANGE_LENS,
  DEFENSIVE_LENS,
  MATCH_LENS,
  LENS_REGISTRY,
  getLens,
  getAutoApplyableLenses,
  getValidLensIds,
  // Deploy-time validation
  EXPECTED_FIELDS,
  LensValidationError,
  validateLensDefinition,
  validateAllLensDefinitions,
  validateAndLogLensDefinitions,
} from './definitions'

// Eligibility
export {
  RuleEvaluationResult,
  EligibilityResult,
  evaluateRule,
  evaluateEligibility,
  applyEligibility,
  countFilterReasons,
} from './eligibility'

// Ordering
export {
  createComparator,
  applyOrdering,
  extractSortKeys,
  verifyDeterminism,
} from './ordering'

// Aggregation
export {
  VisibleOffer,
  ProductWithOffers,
  aggregateProduct,
  aggregateProducts,
  hasVisibleOffers,
  getOfferSummary,
} from './aggregation'

// Signal Extraction
export {
  ExtractorConfig,
  DEFAULT_EXTRACTOR_CONFIG,
  SignalExtractionResult,
  intentToSignals,
  extractLensSignals,
  signalsToArray,
} from './signal-extractor'

// Selection
export {
  InvalidLensError,
  evaluateTrigger,
  lensMatchesTriggers,
  getMatchingLenses,
  selectLens,
  markZeroResults,
  calculateTriggerScore,
  getCandidatesForTelemetry,
  getTriggerMatchesForTelemetry,
} from './selector'

// Telemetry
export {
  LensTelemetryConfig,
  DEFAULT_TELEMETRY_CONFIG,
  createTelemetryConfig,
  LensPerfTiming,
  LensEvalContext,
  buildLensEvalEvent,
  emitLensTelemetry,
  createTimingTracker,
} from './telemetry'

/**
 * Apply the full lens pipeline to products.
 *
 * This is the main entry point for lens evaluation:
 * 1. Extract signals from intent
 * 2. Select lens (user override or trigger match)
 * 3. Aggregate products (min price, best availability)
 * 4. Apply eligibility filter
 * 5. Apply ordering
 * 6. Emit telemetry
 *
 * @example
 * ```typescript
 * import { applyLensPipeline, isLensEnabled } from './lens'
 *
 * if (isLensEnabled()) {
 *   const result = await applyLensPipeline({
 *     query,
 *     products,
 *     userLensId,
 *     requestId,
 *   })
 *   // result.products are filtered and ordered
 *   // result.metadata includes lens info for response
 * }
 * ```
 */
import { extractLensSignals, SignalExtractionResult } from './signal-extractor'
import { selectLens, InvalidLensError, markZeroResults } from './selector'
import { aggregateProducts, ProductWithOffers } from './aggregation'
import { applyEligibility, countFilterReasons } from './eligibility'
import { applyOrdering } from './ordering'
import { emitLensTelemetry, createTimingTracker, createTelemetryConfig } from './telemetry'
import type { AggregatedProduct, LensMetadata, LensId } from './types'
import { isLensEnabled } from './types'

export interface LensPipelineInput {
  /** The user's search query */
  query: string
  /** Products with their visible offers */
  products: ProductWithOffers[]
  /** Optional user-selected lens ID */
  userLensId?: string | null
  /** Request ID for telemetry correlation */
  requestId: string
  /** Optional user ID hash for telemetry */
  userIdHash?: string
  /** Optional session ID for telemetry */
  sessionId?: string
}

export interface LensPipelineResult {
  /** Filtered and ordered products */
  products: AggregatedProduct[]
  /** Lens metadata for the response */
  metadata: LensMetadata
  /** The signal extraction result (for debugging) */
  extraction: SignalExtractionResult
  /** Whether zero results after filtering */
  zeroResults: boolean
}

/**
 * Apply the full lens pipeline to products.
 *
 * @param input - The pipeline input
 * @returns The pipeline result with filtered/ordered products
 * @throws InvalidLensError if userLensId is invalid
 */
export async function applyLensPipeline(input: LensPipelineInput): Promise<LensPipelineResult> {
  const timing = createTimingTracker()

  // 1. Extract signals
  timing.start('intent')
  const extraction = await extractLensSignals(input.query)
  timing.end('intent')

  // 2. Select lens
  const selection = selectLens(
    extraction.signals,
    input.userLensId,
    extraction.extractorModelId
  )

  // 3. Aggregate products
  timing.start('offers')
  const aggregated = aggregateProducts(input.products)
  timing.end('offers')

  // 4. Apply eligibility filter
  timing.start('rank')
  const { eligible, filterReasons } = applyEligibility(aggregated, selection.lens.eligibility)

  // 5. Apply ordering
  const ordered = applyOrdering(eligible, selection.lens.ordering)
  timing.end('rank')

  // 6. Handle zero results
  let metadata = selection.metadata
  const zeroResults = ordered.length === 0 && aggregated.length > 0
  if (zeroResults) {
    metadata = markZeroResults(metadata)
  }

  // 7. Emit telemetry
  emitLensTelemetry({
    requestId: input.requestId,
    userIdHash: input.userIdHash,
    sessionId: input.sessionId,
    query: input.query,
    extractionResult: extraction,
    selectionResult: selection,
    userOverrideId: input.userLensId as LensId | undefined,
    candidateCount: aggregated.length,
    eligibleCount: eligible.length,
    filteredByReason: countFilterReasons(filterReasons),
    orderedProducts: ordered,
    config: createTelemetryConfig(),
    timing: timing.getTiming(),
    status: extraction.status === 'FAILED' ? 'DEGRADED' : 'OK',
  })

  return {
    products: ordered,
    metadata,
    extraction,
    zeroResults,
  }
}
