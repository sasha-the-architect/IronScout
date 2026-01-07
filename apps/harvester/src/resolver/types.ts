/**
 * Product Resolver Types (Spec v1.2)
 *
 * Type definitions for the resolver algorithm and evidence storage.
 */

import type {
  ProductLinkMatchType,
  ProductLinkStatus,
  ProductLinkReasonCode,
} from '@ironscout/db/generated/prisma'

/**
 * Normalized input fields used for resolution
 * Per Spec v1.2 §2: These are recorded in evidence.inputNormalized
 */
export interface NormalizedInput {
  title: string
  titleNorm?: string
  titleSignature?: string
  brand?: string
  brandNorm?: string
  caliber?: string
  caliberNorm?: string
  upc?: string
  upcNorm?: string
  packCount?: number
  grain?: number
  url: string
  normalizedUrl?: string
}

/**
 * Candidate product for fingerprint scoring
 * Per Spec v1.2 §3: Top K candidates stored in evidence
 */
export interface ResolverCandidate {
  productId: string
  canonicalKey: string
  brandNorm?: string
  caliberNorm?: string
  packCount?: number
  grain?: number
  score: number
  matchDetails: {
    brandMatch: boolean
    caliberMatch: boolean
    packMatch: boolean
    grainMatch: boolean
    titleSimilarity: number
  }
}

/**
 * Previous decision info for relink evidence
 * Per Spec v1.2 §3: Recorded when productId changes
 */
export interface PreviousDecision {
  productId: string | null
  matchType: ProductLinkMatchType
  confidence: number
  resolverVersion: string
  resolvedAt: Date | null
}

/**
 * Manual override provenance
 * Per Spec v1.2 §5: Required for MANUAL matchType
 */
export interface ManualProvenance {
  actor: string
  timestamp: string
  ticket: string
  reason: string
}

/**
 * Resolver evidence stored in product_links.evidence
 * Per Spec v1.2 §2: Must include all fields for auditability
 */
export interface ResolverEvidence {
  // Version tracking
  dictionaryVersion: string
  trustConfigVersion: string | number
  weightsVersion?: number

  // Input snapshot
  inputNormalized: NormalizedInput
  inputHash: string

  // Decision audit trail
  rulesFired: string[]
  candidates?: ResolverCandidate[]
  normalizationErrors?: string[]

  // Relink info (if applicable)
  previousDecision?: PreviousDecision

  // Manual override (if applicable)
  manual?: ManualProvenance

  // System error details (if applicable)
  systemError?: {
    code: string
    message: string
    stack?: string
  }

  // Evidence size management
  truncated?: boolean
}

/**
 * Result of resolver execution
 * Per Spec v1.2 §1: Output of resolver algorithm
 */
export interface ResolverResult {
  // Link fields
  productId: string | null
  matchType: ProductLinkMatchType
  status: ProductLinkStatus
  reasonCode: ProductLinkReasonCode | null
  confidence: number

  // Metadata
  resolverVersion: string
  evidence: ResolverEvidence

  // Canonical product (if created)
  createdProduct?: {
    id: string
    canonicalKey: string
  }

  // Relink info
  isRelink: boolean
  relinkBlocked: boolean
}

/**
 * Trust configuration for a source
 * Per Spec v1.2 §0.1: Loaded from source_trust_config
 */
export interface SourceTrustConfig {
  sourceId: string
  upcTrusted: boolean
  version: number
}

/**
 * Fingerprint scoring weights
 * Per Spec v1.2 §3: Fixed per resolverVersion
 */
export interface FingerprintWeights {
  version: number
  weights: {
    brand: number
    caliber: number
    pack: number
    grain: number
    title: number
  }
}

/**
 * Resolver configuration (runtime)
 */
export interface ResolverConfig {
  // Algorithm tuning
  maxCandidates: number
  maxEvidenceSize: number
  topKCandidates: number

  // Ambiguity thresholds (Spec v1.2 §3)
  ambiguityLow: number // 0.55
  ambiguityHigh: number // 0.70
  ambiguityGap: number // 0.03

  // Hysteresis threshold (Spec v1.2 §3)
  hysteresisThreshold: number // 0.10

  // UPC confidence (Spec v1.2 §3)
  upcConfidence: number // 0.95
}

/**
 * Default resolver configuration
 */
export const DEFAULT_RESOLVER_CONFIG: ResolverConfig = {
  maxCandidates: 200,
  maxEvidenceSize: 500 * 1024, // 500KB
  topKCandidates: 10,
  ambiguityLow: 0.55,
  ambiguityHigh: 0.70,
  ambiguityGap: 0.03,
  hysteresisThreshold: 0.10,
  upcConfidence: 0.95,
}
