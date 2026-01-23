/**
 * Lens Selector
 *
 * Selects the appropriate lens based on intent signals and user override.
 * Implements the Search Lens Specification v1.1.0.
 *
 * Selection Logic:
 * 1. If user.selectedLensId provided:
 *    - If valid   → use it
 *    - If invalid → reject with 400 (INVALID_LENS)
 * 2. Else evaluate trigger rules:
 *    - 0 matches  → ALL, autoApplied=false
 *    - 1 match    → matched lens, autoApplied=true
 *    - 2+ matches → ALL, autoApplied=false, ambiguous=true
 *
 * Invariants:
 * - User overrides always win
 * - Invalid lens IDs are rejected, not ignored
 * - Ambiguous matches default to ALL with transparency
 * - Trigger matching uses ANY (OR) logic
 * - candidates[] is lexicographically sorted
 */

import type {
  Lens,
  LensId,
  LensSignals,
  LensMetadata,
  LensSelectionResult,
  LensTriggerRule,
  ReasonCode,
  TriggerMatch,
} from './types'
import { isValidLensId } from './types'
import {
  LENS_REGISTRY,
  ALL_LENS,
  getAutoApplyableLenses,
  getValidLensIds,
} from './definitions'

/**
 * Error thrown when an invalid lens ID is provided.
 */
export class InvalidLensError extends Error {
  constructor(
    public readonly lensId: string,
    public readonly validLenses: LensId[]
  ) {
    super(`Unknown lens ID: ${lensId}`)
    this.name = 'InvalidLensError'
  }

  /**
   * Convert to API error response format.
   */
  toApiError(): { error: string; message: string; validLenses: LensId[] } {
    return {
      error: 'INVALID_LENS',
      message: this.message,
      validLenses: this.validLenses,
    }
  }
}

/**
 * Evaluate a single trigger rule against signals.
 *
 * A trigger rule matches if and only if:
 * - signals[rule.signal] exists
 * - signals[rule.signal].value === rule.value (exact, case-sensitive)
 * - signals[rule.signal].confidence >= rule.minConfidence (inclusive)
 *
 * @param rule - The trigger rule to evaluate
 * @param signals - The extracted signals
 * @returns True if the rule matches
 */
export function evaluateTrigger(rule: LensTriggerRule, signals: LensSignals): boolean {
  const signal = signals[rule.signal]

  // Signal must exist
  if (!signal) {
    return false
  }

  // Value must match exactly (case-sensitive)
  if (signal.value !== rule.value) {
    return false
  }

  // Confidence must meet threshold
  const minConfidence = rule.minConfidence ?? 0.0
  if (signal.confidence < minConfidence) {
    return false
  }

  return true
}

/**
 * Check if a lens matches the given signals.
 * A lens matches if ANY trigger rule matches (OR logic).
 *
 * @param lens - The lens to check
 * @param signals - The extracted signals
 * @returns True if any trigger rule matches
 */
export function lensMatchesTriggers(lens: Lens, signals: LensSignals): boolean {
  // Lenses with no triggers never auto-match
  if (lens.triggers.length === 0) {
    return false
  }

  // OR logic: any trigger matching is sufficient
  return lens.triggers.some(rule => evaluateTrigger(rule, signals))
}

/**
 * Get all lenses that match the given signals.
 * Returns lens IDs sorted lexicographically for determinism.
 *
 * @param signals - The extracted signals
 * @returns Matching lens IDs (sorted)
 */
export function getMatchingLenses(signals: LensSignals): LensId[] {
  const autoApplyable = getAutoApplyableLenses()
  const matching: LensId[] = []

  for (const lens of autoApplyable) {
    if (lensMatchesTriggers(lens, signals)) {
      matching.push(lens.id)
    }
  }

  // Sort lexicographically for deterministic output
  return matching.sort()
}

/**
 * Create lens metadata for the response.
 *
 * @param lens - The selected lens
 * @param autoApplied - Whether lens was auto-applied
 * @param reasonCode - The selection reason
 * @param matchedLenses - All lenses that matched triggers
 * @param extractorModelId - The intent extractor model ID
 * @param reason - Optional human-readable reason
 * @returns Lens metadata for the response
 */
function createMetadata(
  lens: Lens,
  autoApplied: boolean,
  reasonCode: ReasonCode,
  matchedLenses: LensId[],
  extractorModelId: string,
  reason?: string
): LensMetadata {
  const metadata: LensMetadata = {
    id: lens.id,
    label: lens.label,
    autoApplied,
    reasonCode,
    canOverride: true,  // Always true in v1
    version: lens.version,
    extractorModelId,
  }

  // Add optional fields
  if (reason) {
    metadata.reason = reason
  }

  // Add ambiguous info if multiple matches
  if (matchedLenses.length > 1) {
    metadata.ambiguous = true
    metadata.candidates = matchedLenses.sort()  // Ensure lexicographic order
  }

  return metadata
}

/**
 * Select the appropriate lens based on signals and optional user override.
 *
 * @param signals - The extracted intent signals
 * @param userLensId - Optional user-selected lens ID
 * @param extractorModelId - The intent extractor model ID
 * @returns The selection result with lens and metadata
 * @throws InvalidLensError if userLensId is invalid
 */
export function selectLens(
  signals: LensSignals,
  userLensId: string | undefined | null,
  extractorModelId: string
): LensSelectionResult {
  // 1. Handle user override
  if (userLensId !== undefined && userLensId !== null && userLensId !== '') {
    // Validate the lens ID
    if (!isValidLensId(userLensId)) {
      throw new InvalidLensError(userLensId, getValidLensIds())
    }

    const lens = LENS_REGISTRY[userLensId]
    const matchedLenses = getMatchingLenses(signals)

    return {
      lens,
      metadata: createMetadata(
        lens,
        false,  // Not auto-applied
        'USER_OVERRIDE',
        matchedLenses,
        extractorModelId,
        `User selected ${lens.label} lens`
      ),
      matchedLensIds: matchedLenses,
    }
  }

  // 2. Evaluate trigger rules
  const matchedLenses = getMatchingLenses(signals)

  // 0 matches → ALL, autoApplied=false
  if (matchedLenses.length === 0) {
    return {
      lens: ALL_LENS,
      metadata: createMetadata(
        ALL_LENS,
        false,
        'NO_MATCH',
        matchedLenses,
        extractorModelId,
        'No lens triggers matched'
      ),
      matchedLensIds: matchedLenses,
    }
  }

  // 1 match → matched lens, autoApplied=true
  if (matchedLenses.length === 1) {
    const lens = LENS_REGISTRY[matchedLenses[0]]
    return {
      lens,
      metadata: createMetadata(
        lens,
        true,  // Auto-applied
        'TRIGGER_MATCH',
        matchedLenses,
        extractorModelId,
        `Detected ${lens.label.toLowerCase()} intent`
      ),
      matchedLensIds: matchedLenses,
    }
  }

  // 2+ matches → ALL, autoApplied=false, ambiguous=true
  return {
    lens: ALL_LENS,
    metadata: createMetadata(
      ALL_LENS,
      false,
      'AMBIGUOUS',
      matchedLenses,
      extractorModelId,
      'Multiple lens triggers matched'
    ),
    matchedLensIds: matchedLenses,
  }
}

/**
 * Mark metadata as having zero results.
 * Called after eligibility filtering produces no results.
 *
 * @param metadata - The lens metadata to update
 * @returns Updated metadata with zeroResults flag
 */
export function markZeroResults(metadata: LensMetadata): LensMetadata {
  return {
    ...metadata,
    zeroResults: true,
    reasonCode: 'ZERO_RESULTS',
    reason: 'No products matched eligibility rules',
  }
}

/**
 * Calculate trigger score for telemetry.
 * Returns the highest matching confidence for the lens.
 *
 * @param lens - The lens to score
 * @param signals - The extracted signals
 * @returns The trigger score (0.0 if no match)
 */
export function calculateTriggerScore(lens: Lens, signals: LensSignals): number {
  if (lens.triggers.length === 0) {
    return 0.0
  }

  let maxScore = 0.0

  for (const rule of lens.triggers) {
    if (evaluateTrigger(rule, signals)) {
      const signal = signals[rule.signal]
      if (signal && signal.confidence > maxScore) {
        maxScore = signal.confidence
      }
    }
  }

  return maxScore
}

/**
 * Get candidates for telemetry with trigger scores.
 *
 * @param signals - The extracted signals
 * @returns Array of lens candidates with scores
 */
export function getCandidatesForTelemetry(
  signals: LensSignals
): Array<{ lensId: LensId; version: string; triggerScore: number }> {
  return getValidLensIds().map(id => {
    const lens = LENS_REGISTRY[id]
    return {
      lensId: id,
      version: lens.version,
      triggerScore: calculateTriggerScore(lens, signals),
    }
  }).sort((a, b) => {
    // Sort by trigger score descending, then by lens ID ascending
    if (b.triggerScore !== a.triggerScore) {
      return b.triggerScore - a.triggerScore
    }
    return a.lensId.localeCompare(b.lensId)
  })
}

/**
 * Generate trigger match details for a single lens.
 *
 * @param lens - The lens to evaluate
 * @param signals - The extracted signals
 * @returns Array of trigger match details for this lens
 */
function evaluateLensTriggers(lens: Lens, signals: LensSignals): TriggerMatch[] {
  return lens.triggers.map((rule, index) => {
    const signal = signals[rule.signal]
    const minConfidence = rule.minConfidence ?? 0.0

    if (!signal) {
      return {
        lensId: lens.id,
        triggerId: index,
        signalKey: rule.signal,
        expected: rule.value,
        actual: null,
        actualConfidence: null,
        minConfidence,
        passed: false,
      }
    }

    const passed = signal.value === rule.value && signal.confidence >= minConfidence

    return {
      lensId: lens.id,
      triggerId: index,
      signalKey: rule.signal,
      expected: rule.value,
      actual: signal.value,
      actualConfidence: signal.confidence,
      minConfidence,
      passed,
    }
  })
}

/**
 * Generate trigger match details for telemetry.
 * Per spec A.7: provides deterministic representation of trigger evaluation.
 *
 * @param lens - The selected lens
 * @param signals - The extracted signals
 * @returns Array of trigger match details
 * @deprecated Use getAllTriggerMatchesForTelemetry for complete trigger evaluation proof
 */
export function getTriggerMatchesForTelemetry(
  lens: Lens,
  signals: LensSignals
): TriggerMatch[] {
  return evaluateLensTriggers(lens, signals)
}

/**
 * Generate trigger match details for ALL auto-applyable lenses.
 * Per spec A.7: provides deterministic representation of trigger evaluation
 * that led to the lens selection decision.
 *
 * This is required for NO_MATCH and AMBIGUOUS cases where the selected lens
 * is ALL (which has no triggers). We need to show the trigger evaluations
 * that determined there was no match or multiple matches.
 *
 * @param signals - The extracted signals
 * @returns Array of trigger match details for all auto-applyable lenses
 */
export function getAllTriggerMatchesForTelemetry(
  signals: LensSignals
): TriggerMatch[] {
  const autoApplyable = getAutoApplyableLenses()
  const allMatches: TriggerMatch[] = []

  // Evaluate triggers for all auto-applyable lenses (sorted by lensId for determinism)
  for (const lens of autoApplyable.sort((a, b) => a.id.localeCompare(b.id))) {
    allMatches.push(...evaluateLensTriggers(lens, signals))
  }

  return allMatches
}
