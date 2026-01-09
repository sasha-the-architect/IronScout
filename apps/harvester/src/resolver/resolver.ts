/**
 * Product Resolver Core Algorithm (Spec v1.2)
 *
 * Deterministically links source_products to canonical products.
 *
 * Algorithm priority (§3):
 * 1. UPC match (trusted only, confidence=0.95)
 * 2. Fingerprint match (scored, deterministic)
 * 3. NEEDS_REVIEW (insufficient data or ambiguous - requires human action)
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
  type ScoringStrategy,
  type CandidateProduct,
} from './types'
import { logger } from '../config/logger'
import { extractCaliber, extractGrainWeight, extractRoundCount } from '../normalizer/ammo-utils'
import { DEFAULT_SCORING_STRATEGY } from './scoring'

const log = logger.resolver

// Current resolver version - bump on algorithm changes
export const RESOLVER_VERSION = '1.2.0'

// Dictionary version - bump on normalization dictionary changes
const DICTIONARY_VERSION = '1.0.0'

// ═══════════════════════════════════════════════════════════════════════════════
// Trust Config Cache
// Per-source config rarely changes; caching reduces DB queries ~99% in batch runs
// ═══════════════════════════════════════════════════════════════════════════════

interface CachedTrustConfig {
  config: SourceTrustConfig
  cachedAt: number
}

const trustConfigCache = new Map<string, CachedTrustConfig>()
const TRUST_CONFIG_TTL_MS = 60_000 // 1 minute TTL
const TRUST_CONFIG_MAX_ENTRIES = 100 // Max cached sources

/**
 * Clear trust config cache (for testing or admin operations)
 */
export function clearTrustConfigCache(): void {
  trustConfigCache.clear()
}

/**
 * Get trust config cache stats (for observability)
 */
export function getTrustConfigCacheStats(): { size: number; maxSize: number; ttlMs: number } {
  return {
    size: trustConfigCache.size,
    maxSize: TRUST_CONFIG_MAX_ENTRIES,
    ttlMs: TRUST_CONFIG_TTL_MS,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Logging Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a resolver-scoped logger with sourceProductId context
 * All log entries from this resolver run will include the sourceProductId
 */
function createResolverLog(sourceProductId: string, trigger: string) {
  return {
    debug: (event: string, meta?: Record<string, unknown>) =>
      log.debug(event, { sourceProductId, trigger, ...meta }),
    info: (event: string, meta?: Record<string, unknown>) =>
      log.info(event, { sourceProductId, trigger, ...meta }),
    warn: (event: string, meta?: Record<string, unknown>) =>
      log.warn(event, { sourceProductId, trigger, ...meta }),
    error: (event: string, meta?: Record<string, unknown>, error?: unknown) =>
      log.error(event, { sourceProductId, trigger, ...meta }, error),
  }
}

/**
 * Main resolver entry point
 * Per Spec v1.2 §1: Takes sourceProductId, returns ResolverResult
 */
export async function resolveSourceProduct(
  sourceProductId: string,
  trigger: 'INGEST' | 'RECONCILE' | 'MANUAL'
): Promise<ResolverResult> {
  const startTime = Date.now()
  const config = DEFAULT_RESOLVER_CONFIG
  const rulesFired: string[] = []
  const normalizationErrors: string[] = []
  const rlog = createResolverLog(sourceProductId, trigger)

  rlog.info('RESOLVER_START', {
    resolverVersion: RESOLVER_VERSION,
    dictionaryVersion: DICTIONARY_VERSION,
    config: {
      maxCandidates: config.maxCandidates,
      topKCandidates: config.topKCandidates,
      ambiguityLow: config.ambiguityLow,
      ambiguityHigh: config.ambiguityHigh,
      ambiguityGap: config.ambiguityGap,
      hysteresisThreshold: config.hysteresisThreshold,
      upcConfidence: config.upcConfidence,
    },
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: Load source_product and existing link
  // ═══════════════════════════════════════════════════════════════════════════

  rlog.debug('SOURCE_LOAD_START', { phase: 'load' })

  const sourceProduct = await prisma.source_products.findUnique({
    where: { id: sourceProductId },
    include: {
      sources: { select: { sourceKind: true } },
      // Only fetch fields we actually use (Finding 5 optimization)
      source_product_identifiers: {
        select: { idType: true, idValue: true },
      },
      product_links: {
        select: {
          productId: true,
          matchType: true,
          status: true,
          reasonCode: true,
          confidence: true,
          resolverVersion: true,
          resolvedAt: true,
          evidence: true,
        },
      },
    },
  })

  if (!sourceProduct) {
    rlog.error('SOURCE_NOT_FOUND', {
      phase: 'load',
      errorType: 'expected',
      durationMs: Date.now() - startTime,
    })
    return createErrorResult('SOURCE_NOT_FOUND', `source_product ${sourceProductId} not found`, null)
  }

  // Extract sourceKind for metrics (returned to worker to avoid duplicate fetch)
  const sourceKind = sourceProduct.sources?.sourceKind ?? null

  const existingLink = sourceProduct.product_links
  const identifierTypes = sourceProduct.source_product_identifiers.map(i => i.idType)

  rlog.debug('SOURCE_LOADED', {
    phase: 'load',
    sourceId: sourceProduct.sourceId,
    title: sourceProduct.title?.slice(0, 100),
    brand: sourceProduct.brand,
    url: sourceProduct.url?.slice(0, 100),
    identifierCount: sourceProduct.source_product_identifiers.length,
    identifierTypes,
    hasExistingLink: !!existingLink,
    existingLinkInfo: existingLink ? {
      productId: existingLink.productId,
      matchType: existingLink.matchType,
      status: existingLink.status,
      confidence: Number(existingLink.confidence),
      resolverVersion: existingLink.resolverVersion,
    } : null,
  })

  // Check for MANUAL lock (§3: MANUAL is never overridden)
  if (existingLink?.matchType === 'MANUAL') {
    rulesFired.push('MANUAL_LOCKED')
    rlog.info('MANUAL_LOCKED', {
      phase: 'decision',
      decision: 'skip',
      reason: 'MANUAL matchType is never overridden per §3',
      existingProductId: existingLink.productId,
      existingConfidence: Number(existingLink.confidence),
      durationMs: Date.now() - startTime,
    })

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
      sourceKind,
      skipped: true, // No persistence needed - MANUAL lock unchanged
      isRelink: false,
      relinkBlocked: true,
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: Load trust config
  // ═══════════════════════════════════════════════════════════════════════════

  rlog.debug('TRUST_CONFIG_LOAD_START', { phase: 'config', sourceId: sourceProduct.sourceId })

  const trustConfig = await loadTrustConfig(sourceProduct.sourceId, rlog)
  rulesFired.push(`TRUST_CONFIG_LOADED:${trustConfig.version}`)

  rlog.debug('TRUST_CONFIG_LOADED', {
    phase: 'config',
    sourceId: sourceProduct.sourceId,
    upcTrusted: trustConfig.upcTrusted,
    configVersion: trustConfig.version,
    isDefaultConfig: trustConfig.version === 0,
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: Normalize input fields (deterministic, non-throwing)
  // ═══════════════════════════════════════════════════════════════════════════

  rlog.debug('NORMALIZE_START', { phase: 'normalize' })

  const normalized = normalizeInput(sourceProduct, sourceProduct.source_product_identifiers, rlog)

  // Compute input hash for idempotency and reconciliation
  const inputHash = computeInputHash(normalized, DICTIONARY_VERSION, trustConfig.version)

  rlog.info('INPUT_NORMALIZED', {
    phase: 'normalize',
    rawInput: {
      title: sourceProduct.title?.slice(0, 80),
      brand: sourceProduct.brand,
      url: sourceProduct.url?.slice(0, 80),
    },
    normalizedOutput: {
      titleNorm: normalized.titleNorm?.slice(0, 80),
      titleSignature: normalized.titleSignature,
      brandNorm: normalized.brandNorm,
      caliberNorm: normalized.caliberNorm,
      upcNorm: normalized.upcNorm,
      packCount: normalized.packCount,
      grain: normalized.grain,
    },
    inputHash: inputHash.slice(0, 16) + '...',
    hasRequiredFields: {
      brandNorm: !!normalized.brandNorm,
      caliberNorm: !!normalized.caliberNorm,
    },
  })

  // Check if we can skip (same inputHash = same result)
  const existingEvidence = existingLink?.evidence as unknown as ResolverEvidence | null
  if (existingLink && existingEvidence?.inputHash === inputHash) {
    rulesFired.push('SKIP_SAME_INPUT')
    rlog.info('SKIP_SAME_INPUT', {
      phase: 'decision',
      decision: 'skip',
      reason: 'inputHash unchanged, result would be identical',
      inputHash: inputHash.slice(0, 16) + '...',
      existingProductId: existingLink.productId,
      existingMatchType: existingLink.matchType,
      durationMs: Date.now() - startTime,
    })

    return {
      productId: existingLink.productId,
      matchType: existingLink.matchType,
      status: existingLink.status,
      reasonCode: existingLink.reasonCode,
      confidence: Number(existingLink.confidence),
      resolverVersion: RESOLVER_VERSION,
      evidence: existingEvidence,
      sourceKind,
      skipped: true, // No persistence needed - inputHash unchanged
      isRelink: false,
      relinkBlocked: false,
    }
  }
  if (existingLink) {
    if (!existingEvidence?.inputHash) {
      rlog.debug('INPUT_HASH_MISSING', {
        phase: 'normalize',
        reason: 'existing evidence has no inputHash',
        existingMatchType: existingLink.matchType,
        existingStatus: existingLink.status,
      })
    } else {
      rlog.debug('INPUT_HASH_CHANGED', {
        phase: 'normalize',
        existingHashPrefix: existingEvidence.inputHash.slice(0, 16),
        newHashPrefix: inputHash.slice(0, 16),
        existingMatchType: existingLink.matchType,
        existingStatus: existingLink.status,
      })
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 4: Attempt UPC match (§3: UPC > FINGERPRINT > NONE)
  // ═══════════════════════════════════════════════════════════════════════════

  if (normalized.upcNorm && trustConfig.upcTrusted) {
    rulesFired.push('UPC_MATCH_ATTEMPTED')
    rlog.debug('UPC_MATCH_START', {
      phase: 'upc_match',
      upcNorm: normalized.upcNorm,
      upcTrusted: true,
      canonicalKeyWillBe: `UPC:${normalized.upcNorm}`,
    })

    const upcResult = await attemptUpcMatch(
      normalized.upcNorm,
      normalized,
      inputHash,
      trustConfig,
      existingLink,
      rulesFired,
      sourceKind,
      rlog
    )

    if (upcResult) {
      rlog.info('RESOLVER_END', {
        phase: 'complete',
        matchPath: 'UPC',
        matchType: upcResult.matchType,
        status: upcResult.status,
        reasonCode: upcResult.reasonCode,
        productId: upcResult.productId,
        confidence: upcResult.confidence,
        isRelink: upcResult.isRelink,
        relinkBlocked: upcResult.relinkBlocked,
        createdProduct: !!upcResult.createdProduct,
        rulesFired,
        durationMs: Date.now() - startTime,
      })
      return upcResult
    }
  } else if (normalized.upcNorm && !trustConfig.upcTrusted) {
    rulesFired.push('UPC_NOT_TRUSTED')
    normalizationErrors.push(`UPC present but source not trusted: ${normalized.upcNorm}`)
    rlog.warn('UPC_NOT_TRUSTED', {
      phase: 'upc_match',
      upcNorm: normalized.upcNorm,
      sourceId: sourceProduct.sourceId,
      trustConfigVersion: trustConfig.version,
      reason: 'Source is not configured as UPC-trusted, falling through to fingerprint',
    })
  } else if (!normalized.upcNorm) {
    rlog.debug('UPC_MATCH_SKIPPED', {
      phase: 'upc_match',
      reason: 'No UPC available after normalization',
      rawUpc: sourceProduct.source_product_identifiers.find(i => i.idType === 'UPC')?.idValue,
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 5: Attempt fingerprint match
  // ═══════════════════════════════════════════════════════════════════════════

  // Check minimum required fields (§3: brandNorm, caliberNorm required)
  if (!normalized.brandNorm || !normalized.caliberNorm) {
    rulesFired.push('INSUFFICIENT_DATA')
    const missingFields = []
    if (!normalized.brandNorm) missingFields.push('brandNorm')
    if (!normalized.caliberNorm) missingFields.push('caliberNorm')

    rlog.info('INSUFFICIENT_DATA', {
      phase: 'fingerprint_match',
      decision: 'NEEDS_REVIEW',
      reason: 'Missing required fields for fingerprint matching per §3',
      missingFields,
      availableFields: {
        title: !!normalized.title,
        titleNorm: !!normalized.titleNorm,
        brand: !!normalized.brand,
        brandNorm: !!normalized.brandNorm,
        caliberNorm: !!normalized.caliberNorm,
        upcNorm: !!normalized.upcNorm,
      },
      durationMs: Date.now() - startTime,
    })

    const result = createNeedsReviewResult(
      'INSUFFICIENT_DATA',
      normalized,
      inputHash,
      trustConfig,
      rulesFired,
      normalizationErrors,
      sourceKind
    )

    rlog.info('RESOLVER_END', {
      phase: 'complete',
      matchPath: 'NONE',
      matchType: result.matchType,
      status: result.status,
      reasonCode: result.reasonCode,
      productId: result.productId,
      confidence: result.confidence,
      rulesFired,
      durationMs: Date.now() - startTime,
    })

    return result
  }

  rulesFired.push('FINGERPRINT_MATCH_ATTEMPTED')
  rlog.debug('FINGERPRINT_MATCH_START', {
    phase: 'fingerprint_match',
    brandNorm: normalized.brandNorm,
    caliberNorm: normalized.caliberNorm,
    packCount: normalized.packCount,
    grain: normalized.grain,
    titleSignature: normalized.titleSignature,
  })

  const fingerprintResult = await attemptFingerprintMatch(
    normalized,
    inputHash,
    trustConfig,
    existingLink,
    config,
    rulesFired,
    sourceKind,
    rlog
  )

  rlog.info('RESOLVER_END', {
    phase: 'complete',
    matchPath: 'FINGERPRINT',
    matchType: fingerprintResult.matchType,
    status: fingerprintResult.status,
    reasonCode: fingerprintResult.reasonCode,
    productId: fingerprintResult.productId,
    confidence: fingerprintResult.confidence,
    isRelink: fingerprintResult.isRelink,
    relinkBlocked: fingerprintResult.relinkBlocked,
    candidateCount: (fingerprintResult.evidence as ResolverEvidence).candidates?.length ?? 0,
    rulesFired,
    durationMs: Date.now() - startTime,
  })

  return fingerprintResult
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Load trust configuration for a source (cached)
 * Per Spec v1.2 §0.1: Default to upcTrusted=false if not configured
 *
 * Caching: Trust config is per-source and rarely changes. Processing 1000
 * products from one source should not query the DB 1000 times.
 * - TTL: 60 seconds (admin changes take effect within 1 minute)
 * - Max entries: 100 (LRU eviction if exceeded)
 */
async function loadTrustConfig(
  sourceId: string,
  rlog: ReturnType<typeof createResolverLog>
): Promise<SourceTrustConfig> {
  const now = Date.now()

  // Check cache first
  const cached = trustConfigCache.get(sourceId)
  if (cached && now - cached.cachedAt < TRUST_CONFIG_TTL_MS) {
    rlog.debug('TRUST_CONFIG_CACHE_HIT', {
      phase: 'config',
      sourceId,
      upcTrusted: cached.config.upcTrusted,
      version: cached.config.version,
      cacheAgeMs: now - cached.cachedAt,
    })
    return cached.config
  }

  // Cache miss or expired - fetch from DB
  const config = await prisma.source_trust_config.findUnique({
    where: { sourceId },
  })

  let trustConfig: SourceTrustConfig
  if (!config) {
    rlog.debug('TRUST_CONFIG_DEFAULT', {
      phase: 'config',
      sourceId,
      reason: 'No trust config found, using defaults',
      defaultUpcTrusted: false,
      defaultVersion: 0,
      cacheMiss: !cached,
      cacheExpired: !!cached,
    })
    trustConfig = {
      sourceId,
      upcTrusted: false,
      version: 0, // Indicates default/missing
    }
  } else {
    rlog.debug('TRUST_CONFIG_FOUND', {
      phase: 'config',
      sourceId,
      upcTrusted: config.upcTrusted,
      version: config.version,
      updatedAt: config.updatedAt?.toISOString(),
      cacheMiss: !cached,
      cacheExpired: !!cached,
    })
    trustConfig = {
      sourceId: config.sourceId,
      upcTrusted: config.upcTrusted,
      version: config.version,
    }
  }

  // Enforce max cache size (simple LRU: delete oldest entry if at limit)
  if (trustConfigCache.size >= TRUST_CONFIG_MAX_ENTRIES) {
    const oldestKey = trustConfigCache.keys().next().value
    if (oldestKey) {
      trustConfigCache.delete(oldestKey)
      rlog.debug('TRUST_CONFIG_CACHE_EVICT', {
        phase: 'config',
        evictedSourceId: oldestKey,
        cacheSize: trustConfigCache.size,
      })
    }
  }

  // Cache the result
  trustConfigCache.set(sourceId, { config: trustConfig, cachedAt: now })

  return trustConfig
}

/**
 * Normalize input fields for matching
 * Per Spec v1.2 §3: Deterministic, non-throwing
 */
function normalizeInput(
  sourceProduct: any,
  identifiers: any[],
  rlog: ReturnType<typeof createResolverLog>
): NormalizedInput {
  // Extract UPC from identifiers
  const upcIdentifier = identifiers.find(i => i.idType === 'UPC')
  const rawUpc = upcIdentifier?.idValue
  const normalizedUpc = normalizeUpc(rawUpc)

  // Log UPC normalization if there was a change or failure
  if (rawUpc && !normalizedUpc) {
    rlog.warn('UPC_NORMALIZATION_FAILED', {
      phase: 'normalize',
      rawUpc,
      reason: 'UPC failed validation (length or format)',
      rawLength: rawUpc.length,
      digitsOnly: rawUpc.replace(/\D/g, '').length,
    })
  } else if (rawUpc && normalizedUpc !== rawUpc) {
    rlog.debug('UPC_NORMALIZED', {
      phase: 'normalize',
      rawUpc,
      normalizedUpc,
      transformation: rawUpc !== normalizedUpc ? 'padded/cleaned' : 'none',
    })
  }

  // Normalize brand
  const rawBrand = sourceProduct.brand
  const normalizedBrand = normalizeBrand(rawBrand)
  if (rawBrand && !normalizedBrand) {
    rlog.warn('BRAND_NORMALIZATION_FAILED', {
      phase: 'normalize',
      rawBrand,
      reason: 'Brand normalization resulted in empty string',
    })
  }

  // Normalize title
  const rawTitle = sourceProduct.title
  const normalizedTitle = normalizeTitle(rawTitle)
  const titleSignature = computeTitleSignature(rawTitle)

  // Extract caliber, grain, and round count from title
  const extractedCaliber = extractCaliber(rawTitle || '')
  const extractedGrain = extractGrainWeight(rawTitle || '')
  const extractedRoundCount = extractRoundCount(rawTitle || '')

  const resolvedCaliber = sourceProduct.caliber || extractedCaliber
  const resolvedGrain = sourceProduct.grainWeight ?? extractedGrain
  const resolvedRoundCount = sourceProduct.roundCount ?? extractedRoundCount

  if (rawTitle && !extractedCaliber && !sourceProduct.caliber) {
    rlog.debug('CALIBER_EXTRACTION_FAILED', {
      phase: 'normalize',
      rawTitle: rawTitle?.slice(0, 80),
      reason: 'No caliber pattern matched',
    })
  }

  rlog.debug('NORMALIZE_FIELDS', {
    phase: 'normalize',
    rawFields: {
      title: rawTitle?.slice(0, 60),
      brand: rawBrand,
      upc: rawUpc,
    },
    normalizedFields: {
      titleNorm: normalizedTitle?.slice(0, 60),
      titleSignature,
      brandNorm: normalizedBrand,
      upcNorm: normalizedUpc,
    },
    extractedFields: {
      caliber: resolvedCaliber,
      grain: resolvedGrain,
      roundCount: resolvedRoundCount,
    },
    identifierCount: identifiers.length,
    identifierTypes: identifiers.map(i => i.idType),
  })

  return {
    title: sourceProduct.title,
    titleNorm: normalizedTitle,
    titleSignature,
    brand: sourceProduct.brand,
    brandNorm: normalizedBrand,
    caliber: resolvedCaliber ?? undefined,
    caliberNorm: resolvedCaliber ?? undefined, // extractCaliber/normalizer returns normalized form
    upc: rawUpc,
    upcNorm: normalizedUpc,
    packCount: resolvedRoundCount ?? undefined,
    grain: resolvedGrain ?? undefined,
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
  const normalized = brand
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  const alias = BRAND_ALIASES[normalized]
  return alias ?? normalized
}

const BRAND_ALIASES: Record<string, string> = {
  'pmc ammunition': 'pmc',
  'cci ammunition': 'cci',
  'federal': 'federal premium',
  'federal ammunition': 'federal premium',
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
  rulesFired: string[],
  sourceKind: import('@ironscout/db/generated/prisma').SourceKind | null,
  rlog: ReturnType<typeof createResolverLog>
): Promise<ResolverResult | null> {
  const canonicalKey = `UPC:${upcNorm}`

  rlog.debug('UPC_LOOKUP_START', {
    phase: 'upc_match',
    upcNorm,
    canonicalKey,
  })

  // Check for existing product with this canonicalKey (unique index lookup)
  let product = await prisma.products.findUnique({
    where: { canonicalKey },
  })

  let isCreated = false
  if (!product) {
    // Create new product
    rulesFired.push('PRODUCT_CREATED')
    rlog.info('UPC_PRODUCT_CREATE_ATTEMPT', {
      phase: 'upc_match',
      canonicalKey,
      reason: 'No existing product with this UPC',
      productData: {
        name: normalized.title?.slice(0, 80),
        brandNorm: normalized.brandNorm,
        caliberNorm: normalized.caliberNorm,
      },
    })

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

      rlog.info('UPC_PRODUCT_CREATED', {
        phase: 'upc_match',
        productId: product.id,
        canonicalKey,
        upcNorm,
      })
    } catch (error: any) {
      // Handle race condition - another worker created it
      if (error.code === 'P2002') {
        rulesFired.push('PRODUCT_RACE_RETRY')
        rlog.warn('UPC_PRODUCT_RACE_CONDITION', {
          phase: 'upc_match',
          canonicalKey,
          errorCode: error.code,
          reason: 'Another worker created product concurrently, retrying lookup',
        })
        product = await prisma.products.findUnique({
          where: { canonicalKey },
        })
      } else {
        rlog.error('UPC_PRODUCT_CREATE_ERROR', {
          phase: 'upc_match',
          canonicalKey,
          errorCode: error.code,
          errorMessage: error.message,
        }, error)
        throw error
      }
    }
  } else {
    rlog.debug('UPC_PRODUCT_FOUND', {
      phase: 'upc_match',
      productId: product.id,
      canonicalKey,
      productName: product.name?.slice(0, 80),
    })
  }

  if (!product) {
    rlog.error('UPC_PRODUCT_MISSING_AFTER_CREATE', {
      phase: 'upc_match',
      canonicalKey,
      reason: 'Product not found even after race retry - unexpected state',
    })
    return null // Should not happen
  }

  // Resolve through aliases
  const activeProductId = await resolveAliases(product.id, rulesFired, rlog)

  // Check hysteresis for relink
  const isRelink = existingLink && existingLink.productId !== activeProductId
  const relinkBlocked = isRelink && !shouldRelink(existingLink, 'UPC', DEFAULT_RESOLVER_CONFIG.upcConfidence, rulesFired, rlog)

  const finalProductId = relinkBlocked ? existingLink.productId : activeProductId

  if (isRelink) {
    rlog.info('UPC_RELINK_DECISION', {
      phase: 'upc_match',
      isRelink: true,
      relinkBlocked,
      previousProductId: existingLink.productId,
      newProductId: activeProductId,
      finalProductId,
      previousMatchType: existingLink.matchType,
      previousConfidence: Number(existingLink.confidence),
      newConfidence: DEFAULT_RESOLVER_CONFIG.upcConfidence,
    })
  }

  rlog.info('UPC_MATCH_RESULT', {
    phase: 'upc_match',
    decision: 'MATCHED',
    productId: finalProductId,
    canonicalKey,
    isCreated,
    isRelink,
    relinkBlocked,
    confidence: DEFAULT_RESOLVER_CONFIG.upcConfidence,
  })

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
    sourceKind,
    skipped: false, // UPC match requires persistence
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
  rulesFired: string[],
  sourceKind: import('@ironscout/db/generated/prisma').SourceKind | null,
  rlog: ReturnType<typeof createResolverLog>,
  scoringStrategy: ScoringStrategy = DEFAULT_SCORING_STRATEGY
): Promise<ResolverResult> {
  rlog.debug('FINGERPRINT_CANDIDATE_QUERY', {
    phase: 'fingerprint_match',
    queryParams: {
      brandNorm: normalized.brandNorm,
      caliberNorm: normalized.caliberNorm,
    },
    maxCandidates: config.maxCandidates,
    scoringStrategy: {
      name: scoringStrategy.name,
      version: scoringStrategy.version,
    },
  })

  // Query candidates by (brandNorm, caliberNorm)
  const candidates = await prisma.products.findMany({
    where: {
      brandNorm: normalized.brandNorm,
      caliberNorm: normalized.caliberNorm,
    },
    take: config.maxCandidates + 1, // +1 to detect overflow
  })

  rlog.debug('FINGERPRINT_CANDIDATES_FOUND', {
    phase: 'fingerprint_match',
    candidateCount: candidates.length,
    maxCandidates: config.maxCandidates,
    overflow: candidates.length > config.maxCandidates,
  })

  // Check for candidate overflow
  if (candidates.length > config.maxCandidates) {
    rulesFired.push('CANDIDATE_OVERFLOW')
    rlog.warn('FINGERPRINT_CANDIDATE_OVERFLOW', {
      phase: 'fingerprint_match',
      decision: 'NEEDS_REVIEW',
      candidateCount: candidates.length,
      maxCandidates: config.maxCandidates,
      reason: 'Too many candidates to reliably score - marking as ambiguous',
    })
    return createNeedsReviewResult(
      'AMBIGUOUS_FINGERPRINT',
      normalized,
      inputHash,
      trustConfig,
      rulesFired,
      [`Candidate count ${candidates.length} exceeds max ${config.maxCandidates}`],
      sourceKind
    )
  }

  // Score candidates using the scoring strategy
  const scoredCandidates: ResolverCandidate[] = candidates.map(product => {
    const candidateProduct: CandidateProduct = {
      id: product.id,
      canonicalKey: product.canonicalKey,
      brandNorm: product.brandNorm,
      caliberNorm: product.caliberNorm,
      roundCount: product.roundCount,
      grainWeight: product.grainWeight,
      name: product.name,
    }

    const result = scoringStrategy.score(normalized, candidateProduct)

    rlog.debug('FINGERPRINT_SCORE_COMPUTED', {
      phase: 'fingerprint_match',
      candidateId: product.id,
      candidateCanonicalKey: product.canonicalKey?.slice(0, 40),
      strategy: scoringStrategy.name,
      comparison: {
        input: {
          brandNorm: normalized.brandNorm,
          caliberNorm: normalized.caliberNorm,
          packCount: normalized.packCount,
          grain: normalized.grain,
        },
        candidate: {
          brandNorm: product.brandNorm,
          caliberNorm: product.caliberNorm,
          roundCount: product.roundCount,
          grainWeight: product.grainWeight,
        },
      },
      matches: result.matchDetails,
      componentScores: result.componentScores,
      totalScore: result.total,
    })

    return {
      productId: product.id,
      canonicalKey: product.canonicalKey || '',
      brandNorm: product.brandNorm || undefined,
      caliberNorm: product.caliberNorm || undefined,
      packCount: product.roundCount || undefined,
      grain: product.grainWeight || undefined,
      score: result.total,
      matchDetails: result.matchDetails,
    }
  }).sort((a, b) => b.score - a.score)

  const topK = scoredCandidates.slice(0, config.topKCandidates)
  const bestScore = topK[0]?.score ?? 0
  const secondBestScore = topK[1]?.score ?? 0
  const scoreGap = bestScore - secondBestScore

  rlog.debug('FINGERPRINT_SCORING_COMPLETE', {
    phase: 'fingerprint_match',
    totalCandidates: scoredCandidates.length,
    topKCount: topK.length,
    bestScore,
    secondBestScore,
    scoreGap,
    topCandidates: topK.slice(0, 3).map(c => ({
      productId: c.productId,
      canonicalKey: c.canonicalKey?.slice(0, 30),
      score: c.score,
    })),
  })

  // Apply ambiguity rule (§3)
  const inAmbiguousZone = bestScore >= config.ambiguityLow && bestScore < config.ambiguityHigh
  const insufficientGap = scoreGap < config.ambiguityGap
  const isAmbiguous = inAmbiguousZone || insufficientGap

  if (isAmbiguous || scoredCandidates.length === 0) {
    rulesFired.push('AMBIGUOUS_FINGERPRINT')

    const ambiguityReason = scoredCandidates.length === 0
      ? 'No candidates found'
      : inAmbiguousZone
        ? `Best score ${bestScore.toFixed(3)} in ambiguous zone [${config.ambiguityLow}, ${config.ambiguityHigh})`
        : `Score gap ${scoreGap.toFixed(3)} < threshold ${config.ambiguityGap}`

    rlog.info('FINGERPRINT_AMBIGUOUS', {
      phase: 'fingerprint_match',
      decision: 'NEEDS_REVIEW',
      reason: ambiguityReason,
      candidateCount: scoredCandidates.length,
      bestScore,
      secondBestScore,
      scoreGap,
      ambiguityThresholds: {
        ambiguityLow: config.ambiguityLow,
        ambiguityHigh: config.ambiguityHigh,
        ambiguityGap: config.ambiguityGap,
      },
      inAmbiguousZone,
      insufficientGap,
      topCandidates: topK.slice(0, 3).map(c => ({
        productId: c.productId,
        score: c.score,
      })),
    })

    return createNeedsReviewResult(
      'AMBIGUOUS_FINGERPRINT',
      normalized,
      inputHash,
      trustConfig,
      rulesFired,
      [],
      sourceKind,
      topK
    )
  }

  // Best match found
  const bestCandidate = scoredCandidates[0]
  rulesFired.push('FINGERPRINT_MATCHED')

  rlog.debug('FINGERPRINT_BEST_CANDIDATE', {
    phase: 'fingerprint_match',
    bestCandidate: {
      productId: bestCandidate.productId,
      canonicalKey: bestCandidate.canonicalKey,
      score: bestCandidate.score,
      matchDetails: bestCandidate.matchDetails,
    },
    scoreDelta: scoreGap,
    nextCandidate: topK[1] ? {
      productId: topK[1].productId,
      score: topK[1].score,
    } : null,
  })

  // Resolve through aliases
  const activeProductId = await resolveAliases(bestCandidate.productId, rulesFired, rlog)

  // Check hysteresis for relink
  const isRelink = existingLink && existingLink.productId !== activeProductId
  const relinkBlocked = isRelink && !shouldRelink(existingLink, 'FINGERPRINT', bestScore, rulesFired, rlog)

  const finalProductId = relinkBlocked ? existingLink.productId : activeProductId

  if (isRelink) {
    rlog.info('FINGERPRINT_RELINK_DECISION', {
      phase: 'fingerprint_match',
      isRelink: true,
      relinkBlocked,
      previousProductId: existingLink.productId,
      newProductId: activeProductId,
      finalProductId,
      previousMatchType: existingLink.matchType,
      previousConfidence: Number(existingLink.confidence),
      newConfidence: bestScore,
      confidenceDelta: bestScore - Number(existingLink.confidence),
      hysteresisThreshold: config.hysteresisThreshold,
    })
  }

  rlog.info('FINGERPRINT_MATCH_RESULT', {
    phase: 'fingerprint_match',
    decision: 'MATCHED',
    productId: finalProductId,
    canonicalKey: bestCandidate.canonicalKey,
    confidence: bestScore,
    isRelink,
    relinkBlocked,
    candidatesEvaluated: scoredCandidates.length,
  })

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
    sourceKind,
    skipped: false, // Fingerprint match requires persistence
    isRelink,
    relinkBlocked,
  }
}

/**
 * Resolve product through alias chain
 * Per Spec v1.2 §0.1: Transitive, max depth 10
 */
async function resolveAliases(
  productId: string,
  rulesFired: string[],
  rlog: ReturnType<typeof createResolverLog>
): Promise<string> {
  const maxDepth = 10
  let currentId = productId
  let depth = 0
  const aliasChain: Array<{ from: string; to: string }> = []

  rlog.debug('ALIAS_RESOLUTION_START', {
    phase: 'alias_resolution',
    startingProductId: productId,
    maxDepth,
  })

  while (depth < maxDepth) {
    const alias = await prisma.product_aliases.findUnique({
      where: { fromProductId: currentId },
    })

    if (!alias) {
      // No alias, this is the active product
      if (depth > 0) {
        rlog.info('ALIAS_CHAIN_RESOLVED', {
          phase: 'alias_resolution',
          originalProductId: productId,
          finalProductId: currentId,
          chainDepth: depth,
          aliasChain,
        })
      } else {
        rlog.debug('ALIAS_NOT_ALIASED', {
          phase: 'alias_resolution',
          productId: currentId,
          reason: 'Product is not aliased',
        })
      }
      return currentId
    }

    aliasChain.push({ from: currentId, to: alias.toProductId })
    rulesFired.push(`ALIAS_RESOLVED:${currentId}->${alias.toProductId}`)

    rlog.debug('ALIAS_HOP', {
      phase: 'alias_resolution',
      hopNumber: depth + 1,
      fromProductId: currentId,
      toProductId: alias.toProductId,
      reason: alias.reason,
      createdAt: alias.createdAt?.toISOString(),
    })

    currentId = alias.toProductId
    depth++
  }

  // Max depth exceeded - this is an error condition
  rulesFired.push('ALIAS_DEPTH_EXCEEDED')
  rlog.error('ALIAS_DEPTH_EXCEEDED', {
    phase: 'alias_resolution',
    originalProductId: productId,
    currentProductId: currentId,
    depth,
    maxDepth,
    aliasChain,
    reason: 'Possible alias loop or excessively long chain',
  })
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
  rulesFired: string[],
  rlog: ReturnType<typeof createResolverLog>
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
  const existingConfidence = Number(existingLink.confidence)
  const confidenceDelta = newConfidence - existingConfidence
  const hysteresisThreshold = DEFAULT_RESOLVER_CONFIG.hysteresisThreshold

  rlog.debug('RELINK_EVALUATION_START', {
    phase: 'relink_decision',
    existing: {
      productId: existingLink.productId,
      matchType: existingLink.matchType,
      matchTypeStrength: existingStrength,
      confidence: existingConfidence,
      resolverVersion: existingLink.resolverVersion,
    },
    new: {
      matchType: newMatchType,
      matchTypeStrength: newStrength,
      confidence: newConfidence,
    },
    confidenceDelta,
    hysteresisThreshold,
  })

  // Stronger matchType
  if (newStrength > existingStrength) {
    rulesFired.push('RELINK_STRONGER_MATCH')
    rlog.info('RELINK_ALLOWED_STRONGER_MATCH', {
      phase: 'relink_decision',
      decision: 'ALLOW_RELINK',
      reason: 'New matchType is stronger than existing',
      existingMatchType: existingLink.matchType,
      existingStrength,
      newMatchType,
      newStrength,
    })
    return true
  }

  // Same matchType, check confidence delta
  if (newConfidence >= existingConfidence + hysteresisThreshold) {
    rulesFired.push('RELINK_CONFIDENCE_IMPROVED')
    rlog.info('RELINK_ALLOWED_CONFIDENCE', {
      phase: 'relink_decision',
      decision: 'ALLOW_RELINK',
      reason: 'New confidence exceeds hysteresis threshold',
      existingConfidence,
      newConfidence,
      confidenceDelta,
      hysteresisThreshold,
      requiredConfidence: existingConfidence + hysteresisThreshold,
    })
    return true
  }

  rulesFired.push('RELINK_BLOCKED')
  rlog.info('RELINK_BLOCKED', {
    phase: 'relink_decision',
    decision: 'BLOCK_RELINK',
    reason: 'Neither stronger matchType nor sufficient confidence improvement',
    existingMatchType: existingLink.matchType,
    newMatchType,
    strengthComparison: `${newStrength} <= ${existingStrength}`,
    existingConfidence,
    newConfidence,
    confidenceDelta,
    requiredDelta: hysteresisThreshold,
  })
  return false
}

/**
 * Create NEEDS_REVIEW result for cases that require human action
 * (insufficient data, ambiguous matches, untrusted sources)
 */
function createNeedsReviewResult(
  reasonCode: 'INSUFFICIENT_DATA' | 'AMBIGUOUS_FINGERPRINT' | 'UPC_NOT_TRUSTED' | 'CONFLICTING_IDENTIFIERS',
  normalized: NormalizedInput,
  inputHash: string,
  trustConfig: SourceTrustConfig,
  rulesFired: string[],
  normalizationErrors: string[],
  sourceKind: import('@ironscout/db/generated/prisma').SourceKind | null,
  candidates?: ResolverCandidate[]
): ResolverResult {
  return {
    productId: null,
    matchType: 'NONE',
    status: 'NEEDS_REVIEW',
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
    sourceKind,
    skipped: false, // NEEDS_REVIEW still needs persistence for human review queue
    isRelink: false,
    relinkBlocked: false,
  }
}

/**
 * Create ERROR result for system errors
 */
function createErrorResult(
  code: string,
  message: string,
  sourceKind: import('@ironscout/db/generated/prisma').SourceKind | null
): ResolverResult {
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
    sourceKind,
    skipped: false, // ERROR still needs persistence for tracking
    isRelink: false,
    relinkBlocked: false,
  }
}
