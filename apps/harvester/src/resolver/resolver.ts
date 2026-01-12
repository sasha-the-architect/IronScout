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
import { logResolverDetail } from '../config/run-file-logger'
import {
  deriveShotgunLoadType,
  extractCaliber,
  extractGrainWeight,
  extractRoundCount,
  extractShellLength,
  extractShotSize,
  extractSlugWeight,
} from '../normalizer/ammo-utils'
import { DEFAULT_SCORING_STRATEGY } from './scoring'
import { normalizeBrandString } from './brand-normalization'
import { brandAliasCache, recordAliasApplication } from './brand-alias-cache'
import { recordMatchPath, recordMissingFields, type MissingFieldLabel } from './metrics'

const log = logger.resolver

// Current resolver version - bump on algorithm changes
export const RESOLVER_VERSION = '1.2.0'

// Dictionary version - bump on normalization dictionary changes
const DICTIONARY_VERSION = '1.0.0'

// Identity key version - bump on identity key format changes
// This allows coexistence of products created with different identity key algorithms
export const IDENTITY_KEY_VERSION = 'v1'

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
 * Logs to both console and per-run file (when affiliateFeedRunId is provided)
 */
function createResolverLog(sourceProductId: string, trigger: string, affiliateFeedRunId?: string) {
  return {
    debug: (event: string, meta?: Record<string, unknown>) => {
      log.debug(event, { sourceProductId, trigger, ...meta })
      logResolverDetail('debug', sourceProductId, event, { trigger, ...meta }, affiliateFeedRunId)
    },
    info: (event: string, meta?: Record<string, unknown>) => {
      log.info(event, { sourceProductId, trigger, ...meta })
      logResolverDetail('info', sourceProductId, event, { trigger, ...meta }, affiliateFeedRunId)
    },
    warn: (event: string, meta?: Record<string, unknown>) => {
      log.warn(event, { sourceProductId, trigger, ...meta })
      logResolverDetail('warn', sourceProductId, event, { trigger, ...meta }, affiliateFeedRunId)
    },
    error: (event: string, meta?: Record<string, unknown>, error?: unknown) => {
      log.error(event, { sourceProductId, trigger, ...meta }, error)
      logResolverDetail('error', sourceProductId, event, { trigger, ...meta, error: error instanceof Error ? error.message : String(error) }, affiliateFeedRunId)
    },
  }
}

/**
 * Main resolver entry point
 * Per Spec v1.2 §1: Takes sourceProductId, returns ResolverResult
 */
export async function resolveSourceProduct(
  sourceProductId: string,
  trigger: 'INGEST' | 'RECONCILE' | 'MANUAL',
  affiliateFeedRunId?: string
): Promise<ResolverResult> {
  const startTime = Date.now()
  const config = DEFAULT_RESOLVER_CONFIG
  const rulesFired: string[] = []
  const normalizationErrors: string[] = []
  const rlog = createResolverLog(sourceProductId, trigger, affiliateFeedRunId)

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
    // WARN not ERROR: Expected when source product was deleted after job enqueue
    // or due to race conditions during ingestion. Worker handles gracefully.
    rlog.warn('SOURCE_NOT_FOUND', {
      event_name: 'SOURCE_NOT_FOUND',
      phase: 'load',
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

  const { normalized, brandAliasApplied, brandAliasId } = normalizeInput(
    sourceProduct,
    sourceProduct.source_product_identifiers,
    rlog
  )

  // Track brand alias application
  if (brandAliasApplied) {
    rulesFired.push('BRAND_ALIAS_APPLIED')
    // Record for daily tracking (fire-and-forget, non-blocking)
    if (brandAliasId) {
      recordAliasApplication(prisma, brandAliasId).catch(() => {
        // Ignore errors - non-critical
      })
    }
  }

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
    recordMatchPath('NONE', 'MATCHED') // NONE path = no match possible
    const missingFields = []
    if (!normalized.brandNorm) missingFields.push('brandNorm')
    if (!normalized.caliberNorm) missingFields.push('caliberNorm')
    // Track these missing fields
    const missingFieldLabels: MissingFieldLabel[] = []
    if (!normalized.brandNorm) missingFieldLabels.push('brandNorm')
    if (!normalized.caliberNorm) missingFieldLabels.push('caliberNorm')
    recordMissingFields(missingFieldLabels)

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
 * Per brand-aliases-v1: Also applies brand aliases and returns tracking info
 */
function normalizeInput(
  sourceProduct: any,
  identifiers: any[],
  rlog: ReturnType<typeof createResolverLog>
): { normalized: NormalizedInput; brandAliasApplied: boolean; brandAliasId?: string } {
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

  // Normalize brand with alias lookup
  const rawBrand = sourceProduct.brand
  const brandResult = normalizeBrand(rawBrand)
  const normalizedBrand = brandResult.brandNorm

  if (rawBrand && !normalizedBrand) {
    rlog.warn('BRAND_NORMALIZATION_FAILED', {
      phase: 'normalize',
      rawBrand,
      reason: 'Brand normalization resulted in empty string',
    })
  }

  // Log if brand alias was applied
  if (brandResult.aliasApplied) {
    rlog.info('BRAND_ALIAS_APPLIED', {
      phase: 'normalize',
      rawBrand,
      originalNorm: normalizeBrandString(rawBrand),
      resolvedNorm: normalizedBrand,
      aliasId: brandResult.aliasId,
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
  const extractedShotSize = extractShotSize(rawTitle || '')
  const extractedSlugWeight = extractSlugWeight(rawTitle || '')
  const extractedShellLength = extractShellLength(rawTitle || '')
  const extractedLoadType = deriveShotgunLoadType(
    rawTitle || '',
    extractedShotSize,
    extractedSlugWeight
  )

  const resolvedCaliber = sourceProduct.caliber || extractedCaliber
  const resolvedGrain = sourceProduct.grainWeight ?? extractedGrain
  const resolvedRoundCount = sourceProduct.roundCount ?? extractedRoundCount
  const resolvedShotSize = extractedShotSize ?? undefined
  const resolvedSlugWeight = extractedSlugWeight ?? undefined
  const resolvedShellLength = extractedShellLength ?? undefined
  const resolvedLoadType = extractedLoadType ?? undefined

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
      shotSize: resolvedShotSize,
      slugWeight: resolvedSlugWeight,
      shellLength: resolvedShellLength,
      loadType: resolvedLoadType,
    },
    identifierCount: identifiers.length,
    identifierTypes: identifiers.map(i => i.idType),
  })

  return {
    normalized: {
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
      shotSize: resolvedShotSize,
      slugWeight: resolvedSlugWeight,
      shellLength: resolvedShellLength,
      loadType: resolvedLoadType,
      url: sourceProduct.url,
      normalizedUrl: sourceProduct.normalizedUrl,
    },
    brandAliasApplied: brandResult.aliasApplied,
    brandAliasId: brandResult.aliasId,
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
 * Normalize brand name with alias lookup
 * Per brand-aliases-v1 spec: Normalize raw brand, then look up alias in cache.
 *
 * @returns Object with normalized brand and whether alias was applied
 */
function normalizeBrand(brand?: string | null): {
  brandNorm: string | undefined
  aliasApplied: boolean
  aliasId?: string
} {
  const normalized = normalizeBrandString(brand)
  if (!normalized) {
    return { brandNorm: undefined, aliasApplied: false }
  }

  // Look up alias in cache
  const { resolvedBrand, aliasApplied, aliasId } = brandAliasCache.lookup(normalized)

  return {
    brandNorm: resolvedBrand,
    aliasApplied,
    aliasId,
  }
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
          brand: normalized.brand ?? null,
          brandNorm: normalized.brandNorm,
          caliber: normalized.caliber ?? null,
          caliberNorm: normalized.caliberNorm,
        },
      })
      isCreated = true
      recordMatchPath('UPC', 'CREATED')

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
        // Race condition - another worker created, so this is still a MATCHED outcome
        recordMatchPath('UPC', 'MATCHED')
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
    recordMatchPath('UPC', 'MATCHED')
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
 *
 * Uses "identity-key first" model:
 * 1. If all identity fields present → direct lookup by canonicalKey
 * 2. If identity fields missing → fall back to fuzzy scoring
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
  // ============================================================================
  // IDENTITY-KEY FIRST: Direct lookup when all identity fields are present
  // ============================================================================
  const isShotgun = normalized.caliberNorm?.includes('Gauge') || normalized.caliberNorm === '.410 Bore'
  const hasGrain = normalized.grain != null && normalized.grain > 0
  const hasPackCount = normalized.packCount != null && normalized.packCount > 0
  const hasShellOrSignature = Boolean(normalized.shellLength || normalized.titleSignature)
  const hasShotgunIdentity = Boolean(
    isShotgun &&
    normalized.brandNorm &&
    normalized.caliberNorm &&
    normalized.loadType &&
    hasPackCount &&
    hasShellOrSignature
  )
  const hasCompleteIdentity = Boolean(
    !isShotgun &&
    normalized.brandNorm &&
    normalized.caliberNorm &&
    normalized.titleSignature &&
    hasGrain &&
    hasPackCount
  )

  if (hasShotgunIdentity) {
    const shellOrSignature = normalized.shellLength || normalized.titleSignature || ''
    const fingerprintData = [
      normalized.brandNorm,
      normalized.caliberNorm,
      String(normalized.packCount),
      normalized.loadType,
      shellOrSignature,
    ].join('|')
    const identityKey = `FP_SG:${IDENTITY_KEY_VERSION}:${createHash('sha256').update(fingerprintData).digest('hex')}`

    rlog.debug('IDENTITY_KEY_LOOKUP', {
      phase: 'identity_key',
      identityKey,
      identityKeyVersion: IDENTITY_KEY_VERSION,
      identityKeyType: 'shotgun',
      fingerprintFields: {
        brandNorm: normalized.brandNorm,
        caliberNorm: normalized.caliberNorm,
        packCount: normalized.packCount,
        loadType: normalized.loadType,
        shellLength: normalized.shellLength,
        titleSignature: normalized.titleSignature?.slice(0, 30),
      },
    })

    const existingProduct = await prisma.products.findUnique({
      where: { canonicalKey: identityKey },
    })

    if (existingProduct) {
      rulesFired.push('IDENTITY_KEY_MATCHED')
      recordMatchPath('IDENTITY_KEY_SHOTGUN', 'MATCHED')

      rlog.info('IDENTITY_KEY_MATCHED', {
        phase: 'identity_key',
        decision: 'MATCHED',
        productId: existingProduct.id,
        identityKey,
        identityKeyType: 'shotgun',
      })

      const isRelink = existingLink && existingLink.productId !== existingProduct.id
      const relinkBlocked = isRelink && !shouldRelink(existingLink, 'FINGERPRINT', 1.0, rulesFired, rlog)
      const finalProductId = relinkBlocked ? existingLink.productId : existingProduct.id

      return {
        productId: finalProductId,
        matchType: 'FINGERPRINT' as const,
        status: 'MATCHED' as const,
        reasonCode: relinkBlocked ? 'RELINK_BLOCKED_HYSTERESIS' : null,
        confidence: 1.0,
        resolverVersion: RESOLVER_VERSION,
        evidence: {
          dictionaryVersion: DICTIONARY_VERSION,
          trustConfigVersion: trustConfig.version,
          inputNormalized: normalized,
          inputHash,
          rulesFired,
          candidates: [],
        },
        sourceKind,
        skipped: false,
        isRelink,
        relinkBlocked,
      }
    }

    rlog.info('IDENTITY_KEY_CREATE_ATTEMPT', {
      phase: 'identity_key',
      identityKey,
      identityKeyType: 'shotgun',
      productData: {
        name: normalized.title?.slice(0, 80),
        brandNorm: normalized.brandNorm,
        caliberNorm: normalized.caliberNorm,
        packCount: normalized.packCount,
        loadType: normalized.loadType,
        shellLength: normalized.shellLength,
      },
    })

    let product: any
    let isCreated = false

    try {
      product = await prisma.products.create({
        data: {
          canonicalKey: identityKey,
          name: normalized.title,
          category: 'ammunition',
          brand: normalized.brand ?? null,
          brandNorm: normalized.brandNorm,
          caliber: normalized.caliber ?? null,
          caliberNorm: normalized.caliberNorm,
          roundCount: normalized.packCount ?? null,
        },
      })
      isCreated = true
      rulesFired.push('IDENTITY_KEY_CREATED')
      recordMatchPath('IDENTITY_KEY_SHOTGUN', 'CREATED')

      rlog.info('IDENTITY_KEY_CREATED', {
        phase: 'identity_key',
        productId: product.id,
        identityKey,
        identityKeyType: 'shotgun',
      })
    } catch (error: any) {
      if (error.code === 'P2002') {
        rulesFired.push('IDENTITY_KEY_RACE_RETRY')
        // Race condition - another worker created, so this is still a MATCHED outcome
        recordMatchPath('IDENTITY_KEY_SHOTGUN', 'MATCHED')
        rlog.warn('IDENTITY_KEY_RACE_CONDITION', {
          phase: 'identity_key',
          identityKey,
          identityKeyType: 'shotgun',
          reason: 'Another worker created product concurrently, retrying lookup',
        })
        product = await prisma.products.findUnique({
          where: { canonicalKey: identityKey },
        })
      } else {
        rlog.error('IDENTITY_KEY_CREATE_ERROR', {
          phase: 'identity_key',
          identityKey,
          identityKeyType: 'shotgun',
          errorCode: error.code,
          errorMessage: error.message,
        }, error)
        throw error
      }
    }

    if (product) {
      rlog.info('IDENTITY_KEY_RESULT', {
        phase: 'identity_key',
        decision: isCreated ? 'CREATED' : 'MATCHED',
        productId: product.id,
        identityKey,
        identityKeyType: 'shotgun',
        isCreated,
      })

      return {
        productId: product.id,
        matchType: 'FINGERPRINT' as const,
        status: isCreated ? 'CREATED' : 'MATCHED',
        reasonCode: null,
        confidence: 1.0,
        resolverVersion: RESOLVER_VERSION,
        evidence: {
          dictionaryVersion: DICTIONARY_VERSION,
          trustConfigVersion: trustConfig.version,
          inputNormalized: normalized,
          inputHash,
          rulesFired,
          candidates: [],
        },
        sourceKind,
        skipped: false,
        isRelink: false,
        relinkBlocked: false,
        createdProduct: isCreated ? { id: product.id, canonicalKey: identityKey } : undefined,
      }
    }

    recordMatchPath('IDENTITY_KEY_SHOTGUN', 'FALLTHROUGH')
    rlog.warn('IDENTITY_KEY_FALLTHROUGH', {
      phase: 'identity_key',
      identityKey,
      identityKeyType: 'shotgun',
      reason: 'Product null after race retry, falling through to fuzzy scoring',
    })
  }

  if (hasCompleteIdentity) {
    // Compute deterministic identity key
    const fingerprintData = [
      normalized.brandNorm,
      normalized.caliberNorm,
      String(normalized.grain),
      String(normalized.packCount),
      normalized.titleSignature,
    ].join('|')
    const identityKey = `FP:${IDENTITY_KEY_VERSION}:${createHash('sha256').update(fingerprintData).digest('hex')}`

    rlog.debug('IDENTITY_KEY_LOOKUP', {
      phase: 'identity_key',
      identityKey,
      identityKeyVersion: IDENTITY_KEY_VERSION,
      fingerprintFields: {
        brandNorm: normalized.brandNorm,
        caliberNorm: normalized.caliberNorm,
        grain: normalized.grain,
        packCount: normalized.packCount,
        titleSignature: normalized.titleSignature?.slice(0, 30),
      },
    })

    // Direct lookup by identity key
    const existingProduct = await prisma.products.findUnique({
      where: { canonicalKey: identityKey },
    })

    if (existingProduct) {
      // Found exact match by identity key
      rulesFired.push('IDENTITY_KEY_MATCHED')
      recordMatchPath('IDENTITY_KEY', 'MATCHED')

      rlog.info('IDENTITY_KEY_MATCHED', {
        phase: 'identity_key',
        decision: 'MATCHED',
        productId: existingProduct.id,
        identityKey,
      })

      // Check hysteresis for relink
      const isRelink = existingLink && existingLink.productId !== existingProduct.id
      const relinkBlocked = isRelink && !shouldRelink(existingLink, 'FINGERPRINT', 1.0, rulesFired, rlog)
      const finalProductId = relinkBlocked ? existingLink.productId : existingProduct.id

      return {
        productId: finalProductId,
        matchType: 'FINGERPRINT' as const,
        status: 'MATCHED' as const,
        reasonCode: relinkBlocked ? 'RELINK_BLOCKED_HYSTERESIS' : null,
        confidence: 1.0,
        resolverVersion: RESOLVER_VERSION,
        evidence: {
          dictionaryVersion: DICTIONARY_VERSION,
          trustConfigVersion: trustConfig.version,
          inputNormalized: normalized,
          inputHash,
          rulesFired,
          candidates: [],
        },
        sourceKind,
        skipped: false,
        isRelink,
        relinkBlocked,
      }
    }

    // No existing product - create new one
    rlog.info('IDENTITY_KEY_CREATE_ATTEMPT', {
      phase: 'identity_key',
      identityKey,
      productData: {
        name: normalized.title?.slice(0, 80),
        brandNorm: normalized.brandNorm,
        caliberNorm: normalized.caliberNorm,
        grain: normalized.grain,
        packCount: normalized.packCount,
      },
    })

    let product: any
    let isCreated = false

    try {
      product = await prisma.products.create({
        data: {
          canonicalKey: identityKey,
          name: normalized.title,
          category: 'ammunition',
          brand: normalized.brand ?? null,
          brandNorm: normalized.brandNorm,
          caliber: normalized.caliber ?? null,
          caliberNorm: normalized.caliberNorm,
          grainWeight: normalized.grain ?? null,
          roundCount: normalized.packCount ?? null,
        },
      })
      isCreated = true
      rulesFired.push('IDENTITY_KEY_CREATED')
      recordMatchPath('IDENTITY_KEY', 'CREATED')

      rlog.info('IDENTITY_KEY_CREATED', {
        phase: 'identity_key',
        productId: product.id,
        identityKey,
      })
    } catch (error: any) {
      // Handle race condition - another worker created it
      if (error.code === 'P2002') {
        rulesFired.push('IDENTITY_KEY_RACE_RETRY')
        // Race condition - another worker created, so this is still a MATCHED outcome
        recordMatchPath('IDENTITY_KEY', 'MATCHED')
        rlog.warn('IDENTITY_KEY_RACE_CONDITION', {
          phase: 'identity_key',
          identityKey,
          reason: 'Another worker created product concurrently, retrying lookup',
        })
        product = await prisma.products.findUnique({
          where: { canonicalKey: identityKey },
        })
      } else {
        rlog.error('IDENTITY_KEY_CREATE_ERROR', {
          phase: 'identity_key',
          identityKey,
          errorCode: error.code,
          errorMessage: error.message,
        }, error)
        throw error
      }
    }

    if (product) {
      rlog.info('IDENTITY_KEY_RESULT', {
        phase: 'identity_key',
        decision: isCreated ? 'CREATED' : 'MATCHED',
        productId: product.id,
        identityKey,
        isCreated,
      })

      return {
        productId: product.id,
        matchType: 'FINGERPRINT' as const,
        status: isCreated ? 'CREATED' : 'MATCHED',
        reasonCode: null,
        confidence: 1.0,
        resolverVersion: RESOLVER_VERSION,
        evidence: {
          dictionaryVersion: DICTIONARY_VERSION,
          trustConfigVersion: trustConfig.version,
          inputNormalized: normalized,
          inputHash,
          rulesFired,
          candidates: [],
        },
        sourceKind,
        skipped: false,
        isRelink: false,
        relinkBlocked: false,
        createdProduct: isCreated ? { id: product.id, canonicalKey: identityKey } : undefined,
      }
    }

    // Extremely rare: race retry returned null, fall through to fuzzy scoring
    recordMatchPath('IDENTITY_KEY', 'FALLTHROUGH')
    rlog.warn('IDENTITY_KEY_FALLTHROUGH', {
      phase: 'identity_key',
      identityKey,
      reason: 'Product null after race retry, falling through to fuzzy scoring',
    })
  }

  // ============================================================================
  // FUZZY SCORING: Fall back when identity fields are incomplete
  // ============================================================================

  // Track missing fields that caused fuzzy fallback
  const missingFieldsList: MissingFieldLabel[] = []
  if (!normalized.brandNorm) missingFieldsList.push('brandNorm')
  if (!normalized.caliberNorm) missingFieldsList.push('caliberNorm')
  if (!normalized.titleSignature) missingFieldsList.push('titleSignature')
  if (!hasGrain) missingFieldsList.push('grain')
  if (!hasPackCount) missingFieldsList.push('packCount')
  if (isShotgun && !normalized.loadType) missingFieldsList.push('loadType')
  if (isShotgun && !normalized.shellLength) missingFieldsList.push('shellLength')

  if (missingFieldsList.length > 0) {
    recordMissingFields(missingFieldsList)
  }

  rlog.debug('FINGERPRINT_CANDIDATE_QUERY', {
    phase: 'fingerprint_match',
    reason: hasCompleteIdentity ? 'identity_key_fallthrough' : 'incomplete_identity_fields',
    queryParams: {
      brandNorm: normalized.brandNorm,
      caliberNorm: normalized.caliberNorm,
    },
    missingFields: {
      brandNorm: !normalized.brandNorm,
      caliberNorm: !normalized.caliberNorm,
      titleSignature: !normalized.titleSignature,
      grain: !hasGrain,
      packCount: !hasPackCount,
      loadType: isShotgun ? !normalized.loadType : undefined,
      shellLength: isShotgun ? !normalized.shellLength : undefined,
    },
    missingFieldsList,
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

  // No candidates found - create new product if we have sufficient data
  if (scoredCandidates.length === 0) {
    if (isShotgun) {
      const hasLoadType = Boolean(normalized.loadType)
      const hasShellOrSignature = Boolean(normalized.shellLength || normalized.titleSignature)
      if (!normalized.brandNorm || !normalized.caliberNorm || !hasPackCount || !hasLoadType || !hasShellOrSignature) {
        rulesFired.push('FINGERPRINT_INSUFFICIENT_DATA')
        rlog.info('FINGERPRINT_NO_CANDIDATES_INSUFFICIENT_DATA', {
          phase: 'fingerprint_match',
          decision: 'NEEDS_REVIEW',
          reason: 'No candidates and insufficient shotgun identity data to create product',
          hasBrandNorm: !!normalized.brandNorm,
          hasCaliberNorm: !!normalized.caliberNorm,
          hasPackCount,
          hasLoadType,
          hasShellOrSignature,
        })
        return createNeedsReviewResult(
          'INSUFFICIENT_DATA',
          normalized,
          inputHash,
          trustConfig,
          rulesFired,
          [],
          sourceKind,
          topK
        )
      }

      rlog.warn('SHOTGUN_IDENTITY_FALLTHROUGH', {
        phase: 'fingerprint_match',
        decision: 'NEEDS_REVIEW',
        reason: 'Shotgun identity was complete but identity-key path did not return',
        identityFields: {
          brandNorm: normalized.brandNorm,
          caliberNorm: normalized.caliberNorm,
          packCount: normalized.packCount,
          loadType: normalized.loadType,
          shellLength: normalized.shellLength,
        },
      })
      return createNeedsReviewResult(
        'INSUFFICIENT_DATA',
        normalized,
        inputHash,
        trustConfig,
        rulesFired,
        [],
        sourceKind,
        topK
      )
    }

    // Check for minimum required fields to create a product
    // Per design: require grain and packCount to avoid bad merges (e.g., 50-round vs 20-round boxes)
    if (!normalized.brandNorm || !normalized.caliberNorm || !normalized.titleSignature || !hasGrain || !hasPackCount) {
      rulesFired.push('FINGERPRINT_INSUFFICIENT_DATA')
      rlog.info('FINGERPRINT_NO_CANDIDATES_INSUFFICIENT_DATA', {
        phase: 'fingerprint_match',
        decision: 'NEEDS_REVIEW',
        reason: 'No candidates and insufficient data to create product',
        hasBrandNorm: !!normalized.brandNorm,
        hasCaliberNorm: !!normalized.caliberNorm,
        hasTitleSignature: !!normalized.titleSignature,
        hasGrain,
        hasPackCount,
      })
      return createNeedsReviewResult(
        'INSUFFICIENT_DATA',
        normalized,
        inputHash,
        trustConfig,
        rulesFired,
        [],
        sourceKind,
        topK
      )
    }

    // Generate deterministic canonicalKey for fingerprint-based product
    // Format: FP:<version>:<sha256 hash> per schema comment
    const fingerprintData = [
      normalized.brandNorm,
      normalized.caliberNorm,
      String(normalized.grain),
      String(normalized.packCount),
      normalized.titleSignature,
    ].join('|')
    const canonicalKey = `FP:${IDENTITY_KEY_VERSION}:${createHash('sha256').update(fingerprintData).digest('hex')}`

    rlog.info('FINGERPRINT_PRODUCT_CREATE_ATTEMPT', {
      phase: 'fingerprint_match',
      canonicalKey,
      fingerprintData,
      reason: 'No candidates found, creating new product',
      productData: {
        name: normalized.title?.slice(0, 80),
        brandNorm: normalized.brandNorm,
        caliberNorm: normalized.caliberNorm,
        grain: normalized.grain,
        packCount: normalized.packCount,
      },
    })

    let product: any
    let isCreated = false

    try {
      product = await prisma.products.create({
        data: {
          canonicalKey,
          name: normalized.title,
          category: 'ammunition',
          brand: normalized.brand ?? null,
          brandNorm: normalized.brandNorm,
          caliber: normalized.caliber ?? null,
          caliberNorm: normalized.caliberNorm,
          grainWeight: normalized.grain ?? null,
          roundCount: normalized.packCount ?? null,
        },
      })
      isCreated = true
      rulesFired.push('FINGERPRINT_PRODUCT_CREATED')
      recordMatchPath('FUZZY', 'CREATED')

      rlog.info('FINGERPRINT_PRODUCT_CREATED', {
        phase: 'fingerprint_match',
        productId: product.id,
        canonicalKey,
      })
    } catch (error: any) {
      // Handle race condition - another worker created it
      if (error.code === 'P2002') {
        rulesFired.push('FINGERPRINT_PRODUCT_RACE_RETRY')
        // Race condition - another worker created, so this is still a MATCHED outcome
        recordMatchPath('FUZZY', 'MATCHED')
        rlog.warn('FINGERPRINT_PRODUCT_RACE_CONDITION', {
          phase: 'fingerprint_match',
          canonicalKey,
          errorCode: error.code,
          reason: 'Another worker created product concurrently, retrying lookup',
        })
        product = await prisma.products.findUnique({
          where: { canonicalKey },
        })
      } else {
        rlog.error('FINGERPRINT_PRODUCT_CREATE_ERROR', {
          phase: 'fingerprint_match',
          canonicalKey,
          errorCode: error.code,
          errorMessage: error.message,
        }, error)
        throw error
      }
    }

    if (!product) {
      rlog.error('FINGERPRINT_PRODUCT_MISSING_AFTER_CREATE', {
        phase: 'fingerprint_match',
        canonicalKey,
        reason: 'Product not found after create/race retry',
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

    rlog.info('FINGERPRINT_CREATE_RESULT', {
      phase: 'fingerprint_match',
      decision: isCreated ? 'CREATED' : 'MATCHED',
      productId: product.id,
      canonicalKey,
      isCreated,
    })

    return {
      productId: product.id,
      matchType: 'FINGERPRINT' as const,
      status: isCreated ? 'CREATED' : 'MATCHED',
      reasonCode: null,
      confidence: 1.0,
      resolverVersion: RESOLVER_VERSION,
      evidence: {
        dictionaryVersion: DICTIONARY_VERSION,
        trustConfigVersion: trustConfig.version,
        inputNormalized: normalized,
        inputHash,
        rulesFired,
        candidates: [],
      },
      sourceKind,
      skipped: false,
      isRelink: false,
      relinkBlocked: false,
      createdProduct: isCreated ? { id: product.id, canonicalKey } : undefined,
    }
  }

  // Truly ambiguous - multiple candidates with unclear winner
  // Note: Products with complete identity data are handled by identity-key-first (above),
  // so this path is only for products with incomplete identity fields.
  if (isAmbiguous) {
    rulesFired.push('AMBIGUOUS_FINGERPRINT')

    const ambiguityReason = inAmbiguousZone
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

  // Best match found via fuzzy scoring
  const bestCandidate = scoredCandidates[0]
  rulesFired.push('FINGERPRINT_MATCHED')
  recordMatchPath('FUZZY', 'MATCHED')

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
