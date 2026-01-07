/**
 * Product Resolver Core Algorithm (Spec v1.2)
 *
 * Deterministically links source_products to canonical products.
 *
 * Algorithm priority (§3):
 * 1. UPC match (trusted only, confidence=0.95)
 * 2. Fingerprint match (scored, deterministic)
 * 3. UNMATCHED (insufficient data or ambiguous)
 *
 * @see context/specs/product-resolver-12.md
 */

import { prisma } from '@ironscout/db'
import type { Prisma } from '@ironscout/db/generated/prisma'
import { createHash } from 'crypto'
import {
  ResolverResult,
  ResolverEvidence,
  NormalizedInput,
  ResolverCandidate,
  SourceTrustConfig,
  DEFAULT_RESOLVER_CONFIG,
} from './types'
import { logger } from '../config/logger'

const log = logger.resolver

// Current resolver version - bump on algorithm changes
export const RESOLVER_VERSION = '1.2.0'

// Dictionary version - bump on normalization dictionary changes
const DICTIONARY_VERSION = '1.0.0'

/**
 * Main resolver entry point
 * Per Spec v1.2 §1: Takes sourceProductId, returns ResolverResult
 */
export async function resolveSourceProduct(
  sourceProductId: string,
  trigger: 'INGEST' | 'RECONCILE' | 'MANUAL'
): Promise<ResolverResult> {
  const config = DEFAULT_RESOLVER_CONFIG
  const rulesFired: string[] = []
  const normalizationErrors: string[] = []

  log.info(`[Resolver] Starting resolution for ${sourceProductId} (trigger: ${trigger})`)

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: Load source_product and existing link
  // ═══════════════════════════════════════════════════════════════════════════

  const sourceProduct = await prisma.source_products.findUnique({
    where: { id: sourceProductId },
    include: {
      sources: true,
      source_product_identifiers: true,
      product_links: true,
    },
  })

  if (!sourceProduct) {
    log.error(`[Resolver] source_product not found: ${sourceProductId}`)
    return createErrorResult('SOURCE_NOT_FOUND', `source_product ${sourceProductId} not found`)
  }

  const existingLink = sourceProduct.product_links

  // Check for MANUAL lock (§3: MANUAL is never overridden)
  if (existingLink?.matchType === 'MANUAL') {
    rulesFired.push('MANUAL_LOCKED')
    log.info(`[Resolver] ${sourceProductId} has MANUAL lock, skipping`)

    const existingEvidence = existingLink.evidence as unknown as ResolverEvidence | null
    return {
      productId: existingLink.productId,
      matchType: 'MANUAL',
      status: existingLink.status,
      reasonCode: 'MANUAL_LOCKED',
      confidence: Number(existingLink.confidence),
      resolverVersion: RESOLVER_VERSION,
      evidence: {
        dictionaryVersion: DICTIONARY_VERSION,
        trustConfigVersion: 'PRESERVED',
        inputNormalized: {} as NormalizedInput,
        inputHash: existingEvidence?.inputHash || '',
        rulesFired,
      } as ResolverEvidence,
      isRelink: false,
      relinkBlocked: true,
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: Load trust config
  // ═══════════════════════════════════════════════════════════════════════════

  const trustConfig = await loadTrustConfig(sourceProduct.sourceId)
  rulesFired.push(`TRUST_CONFIG_LOADED:${trustConfig.version}`)

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: Normalize input fields (deterministic, non-throwing)
  // ═══════════════════════════════════════════════════════════════════════════

  const normalized = normalizeInput(sourceProduct, sourceProduct.source_product_identifiers)

  // Compute input hash for idempotency and reconciliation
  const inputHash = computeInputHash(normalized, DICTIONARY_VERSION, trustConfig.version)

  // Check if we can skip (same inputHash = same result)
  const existingEvidence = existingLink?.evidence as unknown as ResolverEvidence | null
  if (existingLink && existingEvidence?.inputHash === inputHash) {
    rulesFired.push('SKIP_SAME_INPUT')
    log.info(`[Resolver] ${sourceProductId} input unchanged, skipping`)

    return {
      productId: existingLink.productId,
      matchType: existingLink.matchType,
      status: existingLink.status,
      reasonCode: existingLink.reasonCode,
      confidence: Number(existingLink.confidence),
      resolverVersion: RESOLVER_VERSION,
      evidence: existingEvidence,
      isRelink: false,
      relinkBlocked: false,
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 4: Attempt UPC match (§3: UPC > FINGERPRINT > NONE)
  // ═══════════════════════════════════════════════════════════════════════════

  if (normalized.upcNorm && trustConfig.upcTrusted) {
    rulesFired.push('UPC_MATCH_ATTEMPTED')

    const upcResult = await attemptUpcMatch(
      normalized.upcNorm,
      normalized,
      inputHash,
      trustConfig,
      existingLink,
      rulesFired
    )

    if (upcResult) {
      return upcResult
    }
  } else if (normalized.upcNorm && !trustConfig.upcTrusted) {
    rulesFired.push('UPC_NOT_TRUSTED')
    normalizationErrors.push(`UPC present but source not trusted: ${normalized.upcNorm}`)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 5: Attempt fingerprint match
  // ═══════════════════════════════════════════════════════════════════════════

  // Check minimum required fields (§3: brandNorm, caliberNorm required)
  if (!normalized.brandNorm || !normalized.caliberNorm) {
    rulesFired.push('INSUFFICIENT_DATA')

    return createUnmatchedResult(
      'INSUFFICIENT_DATA',
      normalized,
      inputHash,
      trustConfig,
      rulesFired,
      normalizationErrors
    )
  }

  rulesFired.push('FINGERPRINT_MATCH_ATTEMPTED')

  const fingerprintResult = await attemptFingerprintMatch(
    normalized,
    inputHash,
    trustConfig,
    existingLink,
    config,
    rulesFired
  )

  return fingerprintResult
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Load trust configuration for a source
 * Per Spec v1.2 §0.1: Default to upcTrusted=false if not configured
 */
async function loadTrustConfig(sourceId: string): Promise<SourceTrustConfig> {
  const config = await prisma.source_trust_config.findUnique({
    where: { sourceId },
  })

  if (!config) {
    return {
      sourceId,
      upcTrusted: false,
      version: 0, // Indicates default/missing
    }
  }

  return {
    sourceId: config.sourceId,
    upcTrusted: config.upcTrusted,
    version: config.version,
  }
}

/**
 * Normalize input fields for matching
 * Per Spec v1.2 §3: Deterministic, non-throwing
 */
function normalizeInput(
  sourceProduct: any,
  identifiers: any[]
): NormalizedInput {
  // Extract UPC from identifiers
  const upcIdentifier = identifiers.find(i => i.idType === 'UPC')

  return {
    title: sourceProduct.title,
    titleNorm: normalizeTitle(sourceProduct.title),
    titleSignature: computeTitleSignature(sourceProduct.title),
    brand: sourceProduct.brand,
    brandNorm: normalizeBrand(sourceProduct.brand),
    caliber: undefined, // TODO: Extract from title or identifiers
    caliberNorm: undefined, // TODO: Normalize caliber
    upc: upcIdentifier?.idValue,
    upcNorm: normalizeUpc(upcIdentifier?.idValue),
    packCount: undefined, // TODO: Extract from title
    grain: undefined, // TODO: Extract from title
    url: sourceProduct.url,
    normalizedUrl: sourceProduct.normalizedUrl,
  }
}

/**
 * Normalize title for matching
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Compute stable title signature for fingerprinting
 */
function computeTitleSignature(title: string): string {
  const normalized = normalizeTitle(title)
  // Extract key tokens, sort, hash
  const tokens = normalized.split(' ').filter(t => t.length > 2).sort()
  return createHash('sha256').update(tokens.join('|')).digest('hex').slice(0, 16)
}

/**
 * Normalize brand name
 */
function normalizeBrand(brand?: string | null): string | undefined {
  if (!brand) return undefined
  return brand
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Normalize UPC code
 * Per Spec v1.2: 12-digit, no check digit issues
 */
function normalizeUpc(upc?: string | null): string | undefined {
  if (!upc) return undefined

  // Remove non-digits
  const digits = upc.replace(/\D/g, '')

  // Validate length (12 for UPC-A, 13 for EAN-13, 14 for GTIN-14)
  if (digits.length < 10 || digits.length > 14) return undefined

  // Pad to 12 digits if shorter
  return digits.padStart(12, '0')
}

/**
 * Compute input hash for idempotency
 * Per Spec v1.2 §2: Hash of inputNormalized + dictionaryVersion + trustConfigVersion
 */
function computeInputHash(
  normalized: NormalizedInput,
  dictionaryVersion: string,
  trustConfigVersion: number
): string {
  const data = JSON.stringify({
    normalized,
    dictionaryVersion,
    trustConfigVersion,
  })
  return createHash('sha256').update(data).digest('hex')
}

/**
 * Attempt UPC-based match
 * Per Spec v1.2 §3: canonicalKey = "UPC:" + upcNorm
 */
async function attemptUpcMatch(
  upcNorm: string,
  normalized: NormalizedInput,
  inputHash: string,
  trustConfig: SourceTrustConfig,
  existingLink: any,
  rulesFired: string[]
): Promise<ResolverResult | null> {
  const canonicalKey = `UPC:${upcNorm}`

  // Check for existing product with this canonicalKey
  let product = await prisma.products.findFirst({
    where: { canonicalKey },
  })

  let isCreated = false
  if (!product) {
    // Create new product
    rulesFired.push('PRODUCT_CREATED')
    try {
      product = await prisma.products.create({
        data: {
          canonicalKey,
          upcNorm,
          name: normalized.title,
          category: 'ammunition', // TODO: Derive from data
          brandNorm: normalized.brandNorm,
          caliberNorm: normalized.caliberNorm,
        },
      })
      isCreated = true
    } catch (error: any) {
      // Handle race condition - another worker created it
      if (error.code === 'P2002') {
        rulesFired.push('PRODUCT_RACE_RETRY')
        product = await prisma.products.findFirst({
          where: { canonicalKey },
        })
      } else {
        throw error
      }
    }
  }

  if (!product) {
    return null // Should not happen
  }

  // Resolve through aliases
  const activeProductId = await resolveAliases(product.id, rulesFired)

  // Check hysteresis for relink
  const isRelink = existingLink && existingLink.productId !== activeProductId
  const relinkBlocked = isRelink && !shouldRelink(existingLink, 'UPC', DEFAULT_RESOLVER_CONFIG.upcConfidence, rulesFired)

  const finalProductId = relinkBlocked ? existingLink.productId : activeProductId

  return {
    productId: finalProductId,
    matchType: 'UPC',
    status: isCreated ? 'CREATED' : 'MATCHED',
    reasonCode: relinkBlocked ? 'RELINK_BLOCKED_HYSTERESIS' : null,
    confidence: DEFAULT_RESOLVER_CONFIG.upcConfidence,
    resolverVersion: RESOLVER_VERSION,
    evidence: {
      dictionaryVersion: DICTIONARY_VERSION,
      trustConfigVersion: trustConfig.version,
      inputNormalized: normalized,
      inputHash,
      rulesFired,
      previousDecision: isRelink ? {
        productId: existingLink.productId,
        matchType: existingLink.matchType,
        confidence: Number(existingLink.confidence),
        resolverVersion: existingLink.resolverVersion,
        resolvedAt: existingLink.resolvedAt,
      } : undefined,
    },
    createdProduct: isCreated ? { id: product.id, canonicalKey } : undefined,
    isRelink,
    relinkBlocked,
  }
}

/**
 * Attempt fingerprint-based match
 * Per Spec v1.2 §3: Score candidates, apply ambiguity rule
 */
async function attemptFingerprintMatch(
  normalized: NormalizedInput,
  inputHash: string,
  trustConfig: SourceTrustConfig,
  existingLink: any,
  config: typeof DEFAULT_RESOLVER_CONFIG,
  rulesFired: string[]
): Promise<ResolverResult> {
  // Query candidates by (brandNorm, caliberNorm)
  const candidates = await prisma.products.findMany({
    where: {
      brandNorm: normalized.brandNorm,
      caliberNorm: normalized.caliberNorm,
    },
    take: config.maxCandidates + 1, // +1 to detect overflow
  })

  // Check for candidate overflow
  if (candidates.length > config.maxCandidates) {
    rulesFired.push('CANDIDATE_OVERFLOW')
    return createUnmatchedResult(
      'AMBIGUOUS_FINGERPRINT',
      normalized,
      inputHash,
      trustConfig,
      rulesFired,
      [`Candidate count ${candidates.length} exceeds max ${config.maxCandidates}`]
    )
  }

  // Score candidates
  const scoredCandidates: ResolverCandidate[] = candidates.map(product => {
    const score = computeFingerprintScore(normalized, product)
    return {
      productId: product.id,
      canonicalKey: product.canonicalKey || '',
      brandNorm: product.brandNorm || undefined,
      caliberNorm: product.caliberNorm || undefined,
      packCount: product.roundCount || undefined,
      grain: product.grainWeight || undefined,
      score: score.total,
      matchDetails: score.details,
    }
  }).sort((a, b) => b.score - a.score)

  const topK = scoredCandidates.slice(0, config.topKCandidates)
  const bestScore = topK[0]?.score ?? 0
  const secondBestScore = topK[1]?.score ?? 0

  // Apply ambiguity rule (§3)
  const isAmbiguous =
    (bestScore >= config.ambiguityLow && bestScore < config.ambiguityHigh) ||
    (bestScore - secondBestScore < config.ambiguityGap)

  if (isAmbiguous || scoredCandidates.length === 0) {
    rulesFired.push('AMBIGUOUS_FINGERPRINT')
    return createUnmatchedResult(
      'AMBIGUOUS_FINGERPRINT',
      normalized,
      inputHash,
      trustConfig,
      rulesFired,
      [],
      topK
    )
  }

  // Best match found
  const bestCandidate = scoredCandidates[0]
  rulesFired.push('FINGERPRINT_MATCHED')

  // Resolve through aliases
  const activeProductId = await resolveAliases(bestCandidate.productId, rulesFired)

  // Check hysteresis for relink
  const isRelink = existingLink && existingLink.productId !== activeProductId
  const relinkBlocked = isRelink && !shouldRelink(existingLink, 'FINGERPRINT', bestScore, rulesFired)

  const finalProductId = relinkBlocked ? existingLink.productId : activeProductId

  return {
    productId: finalProductId,
    matchType: 'FINGERPRINT',
    status: 'MATCHED',
    reasonCode: relinkBlocked ? 'RELINK_BLOCKED_HYSTERESIS' : null,
    confidence: bestScore,
    resolverVersion: RESOLVER_VERSION,
    evidence: {
      dictionaryVersion: DICTIONARY_VERSION,
      trustConfigVersion: trustConfig.version,
      inputNormalized: normalized,
      inputHash,
      rulesFired,
      candidates: topK,
      previousDecision: isRelink ? {
        productId: existingLink.productId,
        matchType: existingLink.matchType,
        confidence: Number(existingLink.confidence),
        resolverVersion: existingLink.resolverVersion,
        resolvedAt: existingLink.resolvedAt,
      } : undefined,
    },
    isRelink,
    relinkBlocked,
  }
}

/**
 * Compute fingerprint score for a candidate
 * Per Spec v1.2 §3: Weighted scoring
 */
function computeFingerprintScore(
  normalized: NormalizedInput,
  candidate: any
): { total: number; details: any } {
  const weights = {
    brand: 0.25,
    caliber: 0.30,
    pack: 0.20,
    grain: 0.15,
    title: 0.10,
  }

  const brandMatch = normalized.brandNorm === candidate.brandNorm
  const caliberMatch = normalized.caliberNorm === candidate.caliberNorm
  const packMatch = normalized.packCount === candidate.roundCount
  const grainMatch = normalized.grain === candidate.grainWeight

  // Simple title similarity (could use more sophisticated algorithm)
  const titleSimilarity = 0.5 // TODO: Implement proper similarity

  const total =
    (brandMatch ? weights.brand : 0) +
    (caliberMatch ? weights.caliber : 0) +
    (packMatch ? weights.pack : 0) +
    (grainMatch ? weights.grain : 0) +
    (titleSimilarity * weights.title)

  return {
    total,
    details: {
      brandMatch,
      caliberMatch,
      packMatch,
      grainMatch,
      titleSimilarity,
    },
  }
}

/**
 * Resolve product through alias chain
 * Per Spec v1.2 §0.1: Transitive, max depth 10
 */
async function resolveAliases(productId: string, rulesFired: string[]): Promise<string> {
  const maxDepth = 10
  let currentId = productId
  let depth = 0

  while (depth < maxDepth) {
    const alias = await prisma.product_aliases.findUnique({
      where: { fromProductId: currentId },
    })

    if (!alias) {
      // No alias, this is the active product
      return currentId
    }

    rulesFired.push(`ALIAS_RESOLVED:${currentId}->${alias.toProductId}`)
    currentId = alias.toProductId
    depth++
  }

  // Max depth exceeded - this is an error condition
  rulesFired.push('ALIAS_DEPTH_EXCEEDED')
  throw new Error(`Alias chain exceeded max depth ${maxDepth} for product ${productId}`)
}

/**
 * Check if relink should be allowed
 * Per Spec v1.2 §3: Relink only if stronger matchType or confidence +0.10
 */
function shouldRelink(
  existingLink: any,
  newMatchType: 'UPC' | 'FINGERPRINT',
  newConfidence: number,
  rulesFired: string[]
): boolean {
  const matchTypeStrength: Record<string, number> = {
    UPC: 3,
    FINGERPRINT: 2,
    MANUAL: 4, // Never overridden
    NONE: 1,
    ERROR: 0,
  }

  const existingStrength = matchTypeStrength[existingLink.matchType] || 0
  const newStrength = matchTypeStrength[newMatchType] || 0

  // Stronger matchType
  if (newStrength > existingStrength) {
    rulesFired.push('RELINK_STRONGER_MATCH')
    return true
  }

  // Same matchType, check confidence delta
  const existingConfidence = Number(existingLink.confidence)
  if (newConfidence >= existingConfidence + DEFAULT_RESOLVER_CONFIG.hysteresisThreshold) {
    rulesFired.push('RELINK_CONFIDENCE_IMPROVED')
    return true
  }

  rulesFired.push('RELINK_BLOCKED')
  return false
}

/**
 * Create UNMATCHED result
 */
function createUnmatchedResult(
  reasonCode: 'INSUFFICIENT_DATA' | 'AMBIGUOUS_FINGERPRINT' | 'UPC_NOT_TRUSTED' | 'CONFLICTING_IDENTIFIERS',
  normalized: NormalizedInput,
  inputHash: string,
  trustConfig: SourceTrustConfig,
  rulesFired: string[],
  normalizationErrors: string[],
  candidates?: ResolverCandidate[]
): ResolverResult {
  return {
    productId: null,
    matchType: 'NONE',
    status: 'UNMATCHED',
    reasonCode,
    confidence: 0,
    resolverVersion: RESOLVER_VERSION,
    evidence: {
      dictionaryVersion: DICTIONARY_VERSION,
      trustConfigVersion: trustConfig.version,
      inputNormalized: normalized,
      inputHash,
      rulesFired,
      candidates,
      normalizationErrors: normalizationErrors.length > 0 ? normalizationErrors : undefined,
    },
    isRelink: false,
    relinkBlocked: false,
  }
}

/**
 * Create ERROR result for system errors
 */
function createErrorResult(code: string, message: string): ResolverResult {
  return {
    productId: null,
    matchType: 'ERROR',
    status: 'ERROR',
    reasonCode: 'SYSTEM_ERROR',
    confidence: 0,
    resolverVersion: RESOLVER_VERSION,
    evidence: {
      dictionaryVersion: DICTIONARY_VERSION,
      trustConfigVersion: 'UNKNOWN',
      inputNormalized: {} as NormalizedInput,
      inputHash: '',
      rulesFired: ['SYSTEM_ERROR'],
      systemError: { code, message },
    },
    isRelink: false,
    relinkBlocked: false,
  }
}
