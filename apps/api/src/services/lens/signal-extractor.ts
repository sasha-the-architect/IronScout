/**
 * Lens Signal Extractor
 *
 * Extracts intent signals from search queries for lens trigger evaluation.
 * Wraps the existing intent parser to output signals in the format required by lens selection.
 * Implements the Search Lens Specification v1.1.0.
 *
 * Requirements:
 * - Model version pinned in configuration
 * - Temperature = 0
 * - Model ID logged with every search response
 * - Output schema validated before lens selection
 *
 * Failure handling:
 * - Timeout, malformed output, or schema validation failure → empty signals {}
 * - Lens selection resolves to ALL with reasonCode = NO_MATCH
 */

import { SearchIntent, parseSearchIntent } from '../ai-search/intent-parser'
import type { LensSignals, IntentStatus } from './types'
import { loggers } from '../../config/logger'

const log = loggers.ai

/**
 * Configuration for the intent extractor.
 */
export interface ExtractorConfig {
  /** The model ID used for extraction */
  modelId: string
  /** The temperature setting (should be 0) */
  temperature: number
  /** Timeout in milliseconds */
  timeoutMs: number
}

/**
 * Default extractor configuration.
 * Model version is pinned for determinism.
 */
export const DEFAULT_EXTRACTOR_CONFIG: ExtractorConfig = {
  modelId: process.env.INTENT_EXTRACTOR_MODEL || 'gpt-4o-mini',
  temperature: 0,
  timeoutMs: 5000,
}

/**
 * Result of signal extraction.
 */
export interface SignalExtractionResult {
  /** Extracted signals for lens trigger evaluation */
  signals: LensSignals
  /** The full search intent (for search service) */
  intent: SearchIntent
  /** Extraction status */
  status: IntentStatus
  /** Failure reason if status != OK */
  failureReason?: string
  /** The model ID used */
  extractorModelId: string
  /** Extraction latency in ms */
  latencyMs: number
}

/**
 * Map purpose values to lens signal values.
 * Normalizes the various purpose strings to lens-compatible values.
 */
function mapPurposeToUsageHint(purpose: string | undefined): string | null {
  if (!purpose) return null

  const lowerPurpose = purpose.toLowerCase()

  // Map to RANGE
  if (lowerPurpose.includes('target') ||
      lowerPurpose.includes('practice') ||
      lowerPurpose.includes('range') ||
      lowerPurpose.includes('training')) {
    return 'RANGE'
  }

  // Map to DEFENSIVE
  if (lowerPurpose.includes('defense') ||
      lowerPurpose.includes('defensive') ||
      lowerPurpose.includes('protection') ||
      lowerPurpose.includes('home') ||
      lowerPurpose.includes('carry') ||
      lowerPurpose.includes('duty')) {
    return 'DEFENSIVE'
  }

  // Map to MATCH
  if (lowerPurpose.includes('match') ||
      lowerPurpose.includes('competition') ||
      lowerPurpose.includes('precision')) {
    return 'MATCH'
  }

  // Map to HUNTING (not a lens in v1, but track the signal)
  if (lowerPurpose.includes('hunt') ||
      lowerPurpose.includes('game')) {
    return 'HUNTING'
  }

  return null
}

/**
 * Convert SearchIntent to LensSignals.
 * Extracts relevant fields and maps them to the signal format.
 *
 * @param intent - The parsed search intent
 * @returns Signals for lens trigger evaluation
 */
export function intentToSignals(intent: SearchIntent): LensSignals {
  const signals: LensSignals = {}

  // Extract usage_hint from purpose
  const usageHint = mapPurposeToUsageHint(intent.purpose)
  if (usageHint) {
    signals.usage_hint = {
      value: usageHint,
      confidence: intent.confidence,
    }
  }

  // Extract purpose signal
  if (intent.purpose) {
    signals.purpose = {
      value: intent.purpose,
      confidence: intent.confidence,
    }
  }

  // Extract qualityLevel signal
  if (intent.qualityLevel) {
    signals.qualityLevel = {
      value: intent.qualityLevel,
      confidence: intent.confidence,
    }
  }

  // Extract bullet type preferences from premium intent
  if (intent.premiumIntent?.preferredBulletTypes?.length) {
    const bulletTypes = intent.premiumIntent.preferredBulletTypes
    // Check for defensive bullet types
    if (bulletTypes.some(t => ['JHP', 'HP', 'BJHP', 'HST', 'GDHP', 'XTP'].includes(t))) {
      signals.bullet_type_hint = {
        value: 'DEFENSIVE',
        confidence: intent.confidence,
      }
    }
    // Check for match bullet types
    else if (bulletTypes.some(t => ['OTM', 'MATCH', 'BTHP', 'SMK'].includes(t))) {
      signals.bullet_type_hint = {
        value: 'MATCH',
        confidence: intent.confidence,
      }
    }
    // Check for range bullet types
    else if (bulletTypes.some(t => ['FMJ', 'TMJ', 'CMJ'].includes(t))) {
      signals.bullet_type_hint = {
        value: 'RANGE',
        confidence: intent.confidence,
      }
    }
  }

  // Extract environment signal
  if (intent.premiumIntent?.environment) {
    signals.environment = {
      value: intent.premiumIntent.environment,
      confidence: intent.confidence,
    }
  }

  // Extract suppressor signal
  if (intent.premiumIntent?.suppressorUse) {
    signals.suppressor_use = {
      value: 'true',
      confidence: intent.confidence,
    }
  }

  // Extract barrel length signal
  if (intent.premiumIntent?.barrelLength) {
    signals.barrel_length = {
      value: intent.premiumIntent.barrelLength,
      confidence: intent.confidence,
    }
  }

  return signals
}

/**
 * Validate that signals have the expected structure.
 * Returns true if valid, false if malformed.
 */
function validateSignals(signals: unknown): signals is LensSignals {
  if (!signals || typeof signals !== 'object') {
    return false
  }

  for (const [key, value] of Object.entries(signals)) {
    if (typeof key !== 'string') return false
    if (!value || typeof value !== 'object') return false
    if (typeof (value as any).value !== 'string') return false
    if (typeof (value as any).confidence !== 'number') return false
    if ((value as any).confidence < 0 || (value as any).confidence > 1) return false
  }

  return true
}

/**
 * Extract lens signals from a search query.
 * Wraps the intent parser and converts to signal format.
 *
 * @param query - The user's search query
 * @param config - Extractor configuration
 * @returns Signal extraction result
 */
export async function extractLensSignals(
  query: string,
  config: ExtractorConfig = DEFAULT_EXTRACTOR_CONFIG
): Promise<SignalExtractionResult> {
  const startTime = Date.now()

  try {
    // Parse intent with timeout
    const intentPromise = parseSearchIntent(query, { userTier: 'PREMIUM' })
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Intent extraction timeout')), config.timeoutMs)
    })

    const intent = await Promise.race([intentPromise, timeoutPromise])

    // Convert to signals
    const signals = intentToSignals(intent)

    // Validate signals
    if (!validateSignals(signals)) {
      log.warn('Signal validation failed', { query })
      return {
        signals: {},
        intent,
        status: 'PARTIAL',
        failureReason: 'Signal validation failed',
        extractorModelId: config.modelId,
        latencyMs: Date.now() - startTime,
      }
    }

    const latencyMs = Date.now() - startTime
    log.debug('Signals extracted', {
      query: query.substring(0, 50),
      signalCount: Object.keys(signals).length,
      latencyMs,
    })

    return {
      signals,
      intent,
      status: 'OK',
      extractorModelId: config.modelId,
      latencyMs,
    }
  } catch (error) {
    const latencyMs = Date.now() - startTime
    const failureReason = error instanceof Error ? error.message : 'Unknown error'

    log.warn('Signal extraction failed', {
      query: query.substring(0, 50),
      error: failureReason,
      latencyMs,
    })

    // Return empty signals on failure
    // Lens selection will resolve to ALL with NO_MATCH
    return {
      signals: {},
      intent: {
        originalQuery: query,
        confidence: 0,
      },
      status: 'FAILED',
      failureReason,
      extractorModelId: config.modelId,
      latencyMs,
    }
  }
}

/**
 * Get signals as an array for telemetry logging.
 */
export function signalsToArray(signals: LensSignals): Array<{ key: string; value: string; confidence: number }> {
  return Object.entries(signals).map(([key, signal]) => ({
    key,
    value: signal.value,
    confidence: signal.confidence,
  }))
}
