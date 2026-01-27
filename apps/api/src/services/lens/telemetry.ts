/**
 * Lens Telemetry
 *
 * Emits structured telemetry events for lens evaluation.
 * Implements the Search Lens Specification v1.1.0 Appendix A.
 *
 * The lens_eval.v1 event supports:
 * - Determinism audits
 * - Lens tuning
 * - Roadmap decisions
 * - Marketing analytics
 *
 * This telemetry is internal-only and does not alter consumer-facing behavior.
 */

import { createHash } from 'crypto'
import type { LensEvalTelemetry, LensId, ReasonCode, IntentStatus, AggregatedProduct, LensSelectionResult, OrderingRule } from './types'
import { LENS_SPEC_VERSION } from './definitions'
import { loggers, LOG_EVENTS } from '../../config/logger'
import { signalsToArray, SignalExtractionResult } from './signal-extractor'
import { extractSortKeys } from './ordering'
import { getCandidatesForTelemetry, getAllTriggerMatchesForTelemetry } from './selector'
import { getPriceLookbackDays } from '../../config/tiers'
import { getOfferSummary } from './aggregation'

const log = loggers.search

/**
 * Configuration for lens telemetry.
 */
export interface LensTelemetryConfig {
  /** Price lookback days setting */
  priceLookbackDays: number
  /** Reference timestamp for offer visibility */
  asOfTime: Date
}

/**
 * Create telemetry configuration with current settings.
 * Uses getPriceLookbackDays() for consistency with actual query filtering.
 */
export function createTelemetryConfig(): LensTelemetryConfig {
  return {
    priceLookbackDays: getPriceLookbackDays(),
    asOfTime: new Date(),
  }
}

/**
 * Default telemetry configuration.
 * @deprecated Use createTelemetryConfig() for current values
 */
export const DEFAULT_TELEMETRY_CONFIG: LensTelemetryConfig = {
  priceLookbackDays: parseInt(process.env.CURRENT_PRICE_LOOKBACK_DAYS || '7', 10),
  asOfTime: new Date(),
}

/**
 * Performance timing data for telemetry.
 */
export interface LensPerfTiming {
  intentMs: number
  offersMs: number
  rankMs: number
  totalMs: number
}

/**
 * Data collected during lens evaluation for telemetry emission.
 */
export interface LensEvalContext {
  requestId: string
  traceId?: string
  userIdHash?: string
  sessionId?: string
  query: string
  extractionResult: SignalExtractionResult
  selectionResult: LensSelectionResult
  userOverrideId?: LensId | null
  candidateCount: number
  eligibleCount: number
  filteredByReason: Record<string, number>
  orderedProducts: AggregatedProduct[]
  config: LensTelemetryConfig
  timing: LensPerfTiming
  status: 'OK' | 'DEGRADED' | 'FAILED'
}

/**
 * Parse extractor version from model ID.
 * Per spec A.6: extractorVersion should be logged for audit.
 *
 * Model IDs may be in formats like:
 * - "gpt-4o-mini" → version "gpt-4o-mini"
 * - "intent-v2.1.0" → version "v2.1.0"
 * - "gpt-4-0125-preview" → version "0125-preview"
 *
 * If no version pattern found, returns the full modelId.
 */
function parseExtractorVersion(modelId: string): string {
  // Try to extract version pattern like v1.0.0, v2.1.0, etc.
  const versionMatch = modelId.match(/v\d+\.\d+\.\d+/)
  if (versionMatch) {
    return versionMatch[0]
  }

  // Try to extract date-based version like 0125-preview, 2024-01-25
  const dateVersionMatch = modelId.match(/\d{4}(-\d{2})?(-\d{2})?(-\w+)?$/)
  if (dateVersionMatch) {
    return dateVersionMatch[0]
  }

  // Return full modelId as version
  return modelId
}

/**
 * Hash a query string for PII-safe logging.
 * Uses SHA-256.
 */
function hashQuery(query: string): string {
  return createHash('sha256')
    .update(normalizeQuery(query))
    .digest('hex')
}

/**
 * Normalize a query for consistent hashing.
 * Lowercases and trims whitespace.
 */
function normalizeQuery(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Check if a query likely contains PII.
 * Simple heuristic check for emails, phone numbers, etc.
 */
function hasPii(query: string): boolean {
  const piiPatterns = [
    /\b[\w.-]+@[\w.-]+\.\w{2,}\b/i,  // Email
    /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/,  // Phone
    /\b\d{3}[-]?\d{2}[-]?\d{4}\b/,   // SSN
    /\b\d{5}(-\d{4})?\b/,            // ZIP code
  ]

  return piiPatterns.some(pattern => pattern.test(query))
}

/**
 * Redact PII from a query string.
 */
function redactPii(query: string): string {
  return query
    .replace(/\b[\w.-]+@[\w.-]+\.\w{2,}\b/gi, '[EMAIL]')
    .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE]')
    .replace(/\b\d{3}[-]?\d{2}[-]?\d{4}\b/g, '[SSN]')
    .replace(/\b\d{5}(-\d{4})?\b/g, '[ZIP]')
}

/**
 * Get the most common filter reason from filtered reasons.
 * Returns null if no reasons.
 */
function getTopFilterReason(filteredByReason: Record<string, number>): string | null {
  const entries = Object.entries(filteredByReason)
  if (entries.length === 0) {
    return null
  }
  // Find the reason with the highest count
  entries.sort((a, b) => b[1] - a[1])
  return entries[0][0]
}

/**
 * Build the top-N results array for telemetry.
 *
 * @param products - Ordered products (already sorted)
 * @param orderingRules - The ordering rules used (for extracting sort keys)
 * @param topN - Number of products to include
 */
function buildTopResults(
  products: AggregatedProduct[],
  orderingRules: OrderingRule[],
  topN: number = 20
): Array<{ productId: string; sortKeys: Record<string, unknown> }> {
  return products.slice(0, topN).map(product => ({
    productId: product.productId,
    sortKeys: extractSortKeys(product, orderingRules),
  }))
}

/**
 * Build the offer summary array for telemetry.
 *
 * @param products - Ordered products (already sorted)
 * @param config - Telemetry config for window/asOf metadata
 * @param topN - Number of products to include
 */
function buildOfferSummary(
  products: AggregatedProduct[],
  config: LensTelemetryConfig,
  topN: number = 20
): Array<{
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
}> {
  const asOf = config.asOfTime.toISOString()
  return getOfferSummary(products, topN).map(summary => ({
    ...summary,
    priceMeta: {
      windowDays: config.priceLookbackDays,
      sampleCount: summary.visibleOfferCount,
      asOf,
    },
  }))
}

/**
 * Build the lens_eval.v1 telemetry event.
 *
 * @param context - The evaluation context
 * @returns The telemetry event
 */
export function buildLensEvalEvent(context: LensEvalContext): LensEvalTelemetry {
  const { query, extractionResult, selectionResult, config, timing } = context
  const piiFlag = hasPii(query)

  return {
    eventName: 'lens_eval.v1',
    schemaVersion: 1,
    lensSpecVersion: LENS_SPEC_VERSION,
    timestamp: new Date().toISOString(),
    requestId: context.requestId,
    ...(context.traceId ? { traceId: context.traceId } : {}),

    actor: {
      userIdHash: context.userIdHash,
      sessionId: context.sessionId,
    },

    query: {
      hash: hashQuery(query),
      length: query.length,
      piiFlag,
      // Only include normalized query if not flagged for PII
      ...(piiFlag ? {} : { norm: redactPii(normalizeQuery(query)) }),
    },

    intent: {
      extractorModelId: extractionResult.extractorModelId,
      // Per spec A.6: extractorVersion for audit (embedded in modelId or separate)
      // We parse version from modelId if present, otherwise use modelId as version
      extractorVersion: parseExtractorVersion(extractionResult.extractorModelId),
      extractorTemp: 0, // Always 0 per spec
      status: extractionResult.status,
      signals: signalsToArray(extractionResult.signals),
      ...(extractionResult.failureReason ? { failureReason: extractionResult.failureReason } : {}),
    },

    lens: {
      overrideId: context.userOverrideId ?? null,
      selectedId: selectionResult.lens.id,
      version: selectionResult.lens.version,
      reasonCode: selectionResult.metadata.reasonCode,
      // Use getCandidatesForTelemetry for proper trigger scores
      candidates: getCandidatesForTelemetry(extractionResult.signals),
      // Per spec A.7: deterministic trigger evaluation proof for ALL auto-applyable lenses
      // This is required for NO_MATCH and AMBIGUOUS cases where selected lens is ALL
      triggerMatches: getAllTriggerMatchesForTelemetry(extractionResult.signals),
    },

    config: {
      priceLookbackDays: config.priceLookbackDays,
      asOfTime: config.asOfTime.toISOString(),
      eligibilityConfigVersion: selectionResult.lens.version,
      orderingConfigVersion: selectionResult.lens.version,
    },

    eligibility: {
      candidates: context.candidateCount,
      eligible: context.eligibleCount,
      filteredByReason: context.filteredByReason,
      zeroResults: context.eligibleCount === 0,
      // Per spec: zeroResultsReasonCode when zeroResults = true
      // Use the most common filter reason or 'NO_MATCHES' as fallback
      ...(context.eligibleCount === 0 ? {
        zeroResultsReasonCode: getTopFilterReason(context.filteredByReason) || 'NO_MATCHES'
      } : {}),
    },

    results: {
      returned: context.orderedProducts.length,
      top: buildTopResults(context.orderedProducts, selectionResult.lens.ordering, 20),
      finalProductIdsTopN: context.orderedProducts.slice(0, 20).map(p => p.productId),
      offerSummary: buildOfferSummary(context.orderedProducts, config, 20),
    },

    perf: {
      latencyMsTotal: timing.totalMs,
      latencyMsIntent: timing.intentMs,
      latencyMsOffers: timing.offersMs,
      latencyMsRank: timing.rankMs,
    },

    status: context.status,
  }
}

/**
 * Emit the lens_eval.v1 telemetry event.
 * Logs the event using the structured logger.
 *
 * @param context - The evaluation context
 */
export function emitLensTelemetry(context: LensEvalContext): void {
  try {
    const event = buildLensEvalEvent(context)

    // Per spec "Metrics (Required)": calculate triggerMatchCount and eligibilityExclusionCount
    // triggerMatchCount = number of lenses that matched (had at least one trigger pass)
    // This aligns with selection logic: 0 = NO_MATCH, 1 = AUTO_APPLIED, >1 = AMBIGUOUS
    const triggerMatchCount = event.lens.candidates.filter(c => c.triggerScore > 0).length
    const eligibilityExclusionCount = context.candidateCount - context.eligibleCount

    // Log as structured event
    log.info(LOG_EVENTS.LENS_EVAL, {
      event_name: event.eventName,
      schema_version: event.schemaVersion,
      lens_spec_version: event.lensSpecVersion,
      request_id: event.requestId,
      lens_id: event.lens.selectedId,
      lens_reason_code: event.lens.reasonCode,
      lens_auto_applied: context.selectionResult.metadata.autoApplied,
      lens_ambiguous: context.selectionResult.metadata.ambiguous ?? false,
      lens_override: event.lens.overrideId !== null,
      intent_status: event.intent.status,
      extractor_model_id: event.intent.extractorModelId,
      signal_count: event.intent.signals.length,
      // Per spec "Metrics (Required)"
      trigger_match_count: triggerMatchCount,
      eligibility_exclusion_count: eligibilityExclusionCount,
      candidates: event.eligibility.candidates,
      eligible: event.eligibility.eligible,
      zero_results: event.eligibility.zeroResults,
      returned: event.results.returned,
      price_lookback_days: event.config.priceLookbackDays,
      latency_ms: event.perf.latencyMsTotal,
      status: event.status,
      // Full event for detailed analysis
      _full_event: event,
    })
  } catch (error) {
    // Telemetry should never break the request
    log.error('Failed to emit lens telemetry', { requestId: context.requestId }, error as Error)
  }
}

/**
 * Create a timing tracker for lens evaluation.
 */
export function createTimingTracker(): {
  start: (phase: 'intent' | 'offers' | 'rank') => void
  end: (phase: 'intent' | 'offers' | 'rank') => void
  getTiming: () => LensPerfTiming
} {
  const startTime = Date.now()
  const phases: Record<string, { start?: number; end?: number }> = {}

  return {
    start(phase) {
      phases[phase] = { start: Date.now() }
    },
    end(phase) {
      if (phases[phase]) {
        phases[phase].end = Date.now()
      }
    },
    getTiming() {
      const getMs = (phase: string) => {
        const p = phases[phase]
        if (p?.start && p?.end) {
          return p.end - p.start
        }
        return 0
      }

      return {
        intentMs: getMs('intent'),
        offersMs: getMs('offers'),
        rankMs: getMs('rank'),
        totalMs: Date.now() - startTime,
      }
    },
  }
}
