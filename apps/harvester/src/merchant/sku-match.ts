/**
 * Merchant SKU Matching Worker - Batch Optimized
 *
 * Matches merchant SKUs to canonical SKUs using:
 * 1. UPC exact match (HIGH confidence)
 * 2. Attribute matching - caliber + grain + brand + pack size (MEDIUM confidence)
 * 3. Fuzzy matching with AI hints (LOW confidence, flagged for review)
 *
 * PERFORMANCE OPTIMIZATIONS:
 * - Batch fetches merchant SKUs in single query
 * - Pre-loads canonical SKUs by UPC into Map for O(1) lookups
 * - Pre-loads canonical SKUs by caliber-brand for attribute matching
 * - Batch updates using Prisma transactions
 * - Reduces O(n²) database queries to O(1) batch operations
 */

import { Worker, Job } from 'bullmq'
import { prisma, Prisma } from '@ironscout/db'
import type { retailer_skus, canonical_skus, MappingConfidence } from '@ironscout/db/generated/prisma'
import { redisConnection } from '../config/redis'
import { QUEUE_NAMES, MerchantSkuMatchJobData } from '../config/queues'
import {
  extractCaliber,
  extractGrainWeight,
  extractCaseMaterial,
  classifyPurpose,
  extractRoundCount,
} from '../normalizer/ammo-utils'
import { logger } from '../config/logger'

const log = logger.merchant

// ============================================================================
// TYPES
// ============================================================================

interface ParsedAttributes {
  caliber: string | null
  grain: number | null
  packSize: number | null
  bulletType: string | null
  brand: string | null
  caseMaterial: string | null
  purpose: string | null
}

interface MatchResult {
  canonicalSkuId: string | null
  confidence: MappingConfidence
  needsReview: boolean
}

interface SkuWithParsedAttrs {
  sku: retailer_skus
  attrs: ParsedAttributes
  matchResult: MatchResult
}

interface BatchStats {
  matchedCount: number
  createdCount: number
  reviewCount: number
}

// Batch size for database operations
const DB_BATCH_SIZE = 500

// ============================================================================
// ATTRIBUTE PARSING
// ============================================================================

function parseAttributes(sku: retailer_skus): ParsedAttributes {
  // Use raw values if provided, otherwise parse from title
  const caliber = sku.rawCaliber || extractCaliber(sku.rawTitle)

  // Parse grain from raw value or title
  let grain: number | null = null
  if (sku.rawGrain) {
    grain = parseInt(String(sku.rawGrain), 10)
    if (isNaN(grain)) grain = null
  }
  if (!grain) {
    grain = extractGrainWeight(sku.rawTitle)
  }

  // Pack size
  let packSize = sku.rawPackSize || null
  if (!packSize) {
    packSize = extractRoundCount(sku.rawTitle)
  }

  // Bullet type - try raw value first, then parse
  const bulletType = sku.rawBulletType || extractBulletType(sku.rawTitle)

  // Brand - clean up if provided
  const brand = sku.rawBrand ? normalizeBrand(sku.rawBrand) : extractBrand(sku.rawTitle)

  // Case material
  const caseMaterial = sku.rawCase || extractCaseMaterial(sku.rawTitle)

  // Purpose
  const purpose = classifyPurpose(sku.rawTitle)

  return {
    caliber,
    grain,
    packSize,
    bulletType,
    brand,
    caseMaterial,
    purpose,
  }
}

// ============================================================================
// BULLET TYPE EXTRACTION
// ============================================================================

const BULLET_TYPE_PATTERNS: Array<{ pattern: RegExp; type: string }> = [
  { pattern: /\bfmj\b/i, type: 'FMJ' },
  { pattern: /\bjhp\b/i, type: 'JHP' },
  { pattern: /\bhp\b/i, type: 'HP' },
  { pattern: /\bhst\b/i, type: 'HST' },
  { pattern: /\bgold\s?dot\b/i, type: 'GDHP' },
  { pattern: /\bv-?max\b/i, type: 'VMAX' },
  { pattern: /\bsp\b/i, type: 'SP' },
  { pattern: /\bjsp\b/i, type: 'JSP' },
  { pattern: /\btmj\b/i, type: 'TMJ' },
  { pattern: /\bwadcutter\b/i, type: 'WADCUTTER' },
  { pattern: /\bswc\b/i, type: 'SWC' },
  { pattern: /\bfrangible\b/i, type: 'FRANGIBLE' },
  { pattern: /\bballistic\s?tip\b/i, type: 'BALLISTIC_TIP' },
  { pattern: /\bsoft\s?point\b/i, type: 'SP' },
  { pattern: /\bhollow\s?point\b/i, type: 'HP' },
  { pattern: /\bfull\s?metal\s?jacket\b/i, type: 'FMJ' },
]

function extractBulletType(title: string): string | null {
  for (const { pattern, type } of BULLET_TYPE_PATTERNS) {
    if (pattern.test(title)) {
      return type
    }
  }
  return null
}

// ============================================================================
// BRAND EXTRACTION & NORMALIZATION
// ============================================================================

const KNOWN_BRANDS: Array<{ pattern: RegExp; normalized: string }> = [
  { pattern: /\bfederal\b/i, normalized: 'Federal' },
  { pattern: /\bhornady\b/i, normalized: 'Hornady' },
  { pattern: /\bremington\b/i, normalized: 'Remington' },
  { pattern: /\bwinchester\b/i, normalized: 'Winchester' },
  { pattern: /\bspeer\b/i, normalized: 'Speer' },
  { pattern: /\bfiocchi\b/i, normalized: 'Fiocchi' },
  { pattern: /\bsellier.*bellot|s&b\b/i, normalized: 'Sellier & Bellot' },
  { pattern: /\bpmc\b/i, normalized: 'PMC' },
  { pattern: /\bmagtech\b/i, normalized: 'Magtech' },
  { pattern: /\baguila\b/i, normalized: 'Aguila' },
  { pattern: /\bcci\b/i, normalized: 'CCI' },
  { pattern: /\bamerican\s?eagle\b/i, normalized: 'American Eagle' },
  { pattern: /\bblazer\b/i, normalized: 'Blazer' },
  { pattern: /\btulaammo|tula\b/i, normalized: 'TulAmmo' },
  { pattern: /\bwolf\b/i, normalized: 'Wolf' },
  { pattern: /\bbarnaul\b/i, normalized: 'Barnaul' },
  { pattern: /\bnorma\b/i, normalized: 'Norma' },
  { pattern: /\bgeco\b/i, normalized: 'GECO' },
  { pattern: /\bprvi\s?partizan|ppu\b/i, normalized: 'Prvi Partizan' },
  { pattern: /\bsig\s?sauer|sig\b/i, normalized: 'SIG Sauer' },
  { pattern: /\bunderwood\b/i, normalized: 'Underwood' },
  { pattern: /\bbuffalo\s?bore\b/i, normalized: 'Buffalo Bore' },
  { pattern: /\bnosler\b/i, normalized: 'Nosler' },
  { pattern: /\bbarnes\b/i, normalized: 'Barnes' },
]

function normalizeBrand(brand: string): string {
  const cleaned = brand.trim()

  for (const { pattern, normalized } of KNOWN_BRANDS) {
    if (pattern.test(cleaned)) {
      return normalized
    }
  }

  // Title case the brand if not recognized
  return cleaned
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

function extractBrand(title: string): string | null {
  for (const { pattern, normalized } of KNOWN_BRANDS) {
    if (pattern.test(title)) {
      return normalized
    }
  }
  return null
}

// ============================================================================
// BATCH LOADING FUNCTIONS
// ============================================================================

/**
 * Build a Map of UPC -> canonical_skus for O(1) lookups
 */
async function buildUpcLookupMap(upcs: string[]): Promise<Map<string, canonical_skus>> {
  if (upcs.length === 0) return new Map()

  const canonicalSkus = await prisma.canonical_skus.findMany({
    where: {
      upc: { in: upcs },
    },
  })

  const map = new Map<string, canonical_skus>()
  for (const canon of canonicalSkus) {
    if (canon.upc) {
      map.set(canon.upc, canon)
    }
  }
  return map
}

/**
 * Build a Map of "caliber|brand" -> canonical_skus[] for attribute matching
 */
async function buildAttributeLookupMap(
  calibers: string[],
  brands: string[]
): Promise<Map<string, canonical_skus[]>> {
  if (calibers.length === 0 || brands.length === 0) return new Map()

  // Deduplicate
  const uniqueCalibers = Array.from(new Set(calibers.filter(Boolean)))
  const uniqueBrands = Array.from(new Set(brands.filter(Boolean)))

  if (uniqueCalibers.length === 0 || uniqueBrands.length === 0) return new Map()

  const canonicalSkus = await prisma.canonical_skus.findMany({
    where: {
      caliber: { in: uniqueCalibers },
      brand: { in: uniqueBrands },
    },
  })

  // Group by caliber|brand key
  const map = new Map<string, canonical_skus[]>()
  for (const canon of canonicalSkus) {
    const key = `${canon.caliber}|${canon.brand}`
    if (!map.has(key)) {
      map.set(key, [])
    }
    map.get(key)!.push(canon)
  }
  return map
}

// ============================================================================
// MATCHING LOGIC (Using pre-loaded maps)
// ============================================================================

function matchByUPC(
  upc: string,
  upcMap: Map<string, canonical_skus>
): MatchResult {
  const canonical = upcMap.get(upc)

  if (canonical) {
    return {
      canonicalSkuId: canonical.id,
      confidence: 'HIGH',
      needsReview: false,
    }
  }

  return { canonicalSkuId: null, confidence: 'NONE', needsReview: false }
}

function matchByAttributes(
  attrs: ParsedAttributes,
  attrMap: Map<string, canonical_skus[]>
): MatchResult {
  // Need at minimum caliber and brand for matching
  if (!attrs.caliber || !attrs.brand) {
    return { canonicalSkuId: null, confidence: 'NONE', needsReview: true }
  }

  const key = `${attrs.caliber}|${attrs.brand}`
  const candidates = attrMap.get(key) || []

  if (candidates.length === 0) {
    return { canonicalSkuId: null, confidence: 'NONE', needsReview: true }
  }

  // Filter by grain and pack size if available
  let matches = candidates
  if (attrs.grain) {
    matches = matches.filter((c) => c.grain === attrs.grain)
  }
  if (attrs.packSize) {
    matches = matches.filter((c) => c.packSize === attrs.packSize)
  }

  if (matches.length === 1) {
    // Exact single match
    return {
      canonicalSkuId: matches[0].id,
      confidence: attrs.grain && attrs.packSize ? 'MEDIUM' : 'LOW',
      needsReview: !attrs.grain || !attrs.packSize,
    }
  }

  if (matches.length > 1) {
    // Multiple matches - try to narrow down by bullet type
    const exactMatch = matches.find(
      (m) =>
        m.grain === attrs.grain &&
        m.packSize === attrs.packSize &&
        m.bulletType === attrs.bulletType
    )

    if (exactMatch) {
      return {
        canonicalSkuId: exactMatch.id,
        confidence: 'MEDIUM',
        needsReview: false,
      }
    }

    // Flag for review if multiple ambiguous matches
    return {
      canonicalSkuId: null,
      confidence: 'LOW',
      needsReview: true,
    }
  }

  // No match found
  return { canonicalSkuId: null, confidence: 'NONE', needsReview: true }
}

// ============================================================================
// BATCH CREATE CANONICAL SKUS
// ============================================================================

interface PendingCanonical {
  skuIndex: number
  attrs: ParsedAttributes
  upc?: string
}

async function batchCreatecanonical_skuss(
  pending: PendingCanonical[]
): Promise<Map<number, canonical_skus>> {
  const results = new Map<number, canonical_skus>()
  if (pending.length === 0) return results

  // Create in batches to avoid overwhelming the database
  for (let i = 0; i < pending.length; i += DB_BATCH_SIZE) {
    const batch = pending.slice(i, i + DB_BATCH_SIZE)

    const createData = batch
      .filter(
        (p) => p.attrs.caliber && p.attrs.brand && p.attrs.grain && p.attrs.packSize
      )
      .map((p) => {
        const name = [
          p.attrs.brand,
          p.attrs.caliber,
          `${p.attrs.grain}gr`,
          p.attrs.bulletType || '',
          `${p.attrs.packSize}rd`,
        ]
          .filter(Boolean)
          .join(' ')

        return {
          skuIndex: p.skuIndex,
          data: {
            upc: p.upc || null,
            caliber: p.attrs.caliber!,
            grain: p.attrs.grain!,
            caseType: p.attrs.caseMaterial,
            bulletType: p.attrs.bulletType,
            brand: p.attrs.brand!,
            packSize: p.attrs.packSize!,
            name,
          },
        }
      })

    // Create each one and track the result
    // Note: Prisma doesn't support createMany with returning, so we use a transaction
    const created = await prisma.$transaction(
      createData.map((item) =>
        prisma.canonical_skus.create({
          data: item.data,
        })
      )
    )

    // Map back to sku indices
    for (let j = 0; j < created.length; j++) {
      results.set(createData[j].skuIndex, created[j])
    }
  }

  return results
}

// ============================================================================
// BATCH UPDATE DEALER SKUS
// ============================================================================

interface SkuUpdate {
  id: string
  parsedCaliber: string | null
  parsedGrain: number | null
  parsedPackSize: number | null
  parsedBulletType: string | null
  parsedBrand: string | null
  canonicalSkuId: string | null
  mappingConfidence: MappingConfidence
  needsReview: boolean
  mappedAt: Date | null
  mappedBy: string | null
}

async function batchUpdateretailer_skuss(updates: SkuUpdate[]): Promise<void> {
  if (updates.length === 0) return

  // Process in batches
  for (let i = 0; i < updates.length; i += DB_BATCH_SIZE) {
    const batch = updates.slice(i, i + DB_BATCH_SIZE)

    // Use a transaction for atomic updates
    await prisma.$transaction(
      batch.map((update) =>
        prisma.retailer_skus.update({
          where: { id: update.id },
          data: {
            parsedCaliber: update.parsedCaliber,
            parsedGrain: update.parsedGrain,
            parsedPackSize: update.parsedPackSize,
            parsedBulletType: update.parsedBulletType,
            parsedBrand: update.parsedBrand,
            canonicalSkuId: update.canonicalSkuId,
            mappingConfidence: update.mappingConfidence,
            needsReview: update.needsReview,
            mappedAt: update.mappedAt,
            mappedBy: update.mappedBy,
          },
        })
      )
    )
  }
}

// ============================================================================
// MAIN PROCESSING FUNCTION (Batch Optimized)
// ============================================================================

async function processSkuMatch(job: Job<MerchantSkuMatchJobData>): Promise<BatchStats> {
  const { retailerId, feedRunId, merchantSkuIds } = job.data

  log.info('Processing SKUs', { count: merchantSkuIds.length, retailerId })

  // STEP 1: Batch fetch all dealer SKUs
  const merchantSkus = await prisma.retailer_skus.findMany({
    where: {
      id: { in: merchantSkuIds },
    },
  })

  if (merchantSkus.length === 0) {
    log.debug('No SKUs found for IDs')
    return { matchedCount: 0, createdCount: 0, reviewCount: 0 }
  }

  // STEP 2: Parse attributes for all SKUs (CPU-bound, no DB)
  const skusWithAttrs: SkuWithParsedAttrs[] = merchantSkus.map((sku) => ({
    sku,
    attrs: parseAttributes(sku),
    matchResult: { canonicalSkuId: null, confidence: 'NONE' as MappingConfidence, needsReview: true },
  }))

  // STEP 3: Collect unique UPCs and attributes for batch loading
  const upcs: string[] = []
  const calibers: string[] = []
  const brands: string[] = []

  for (const { sku, attrs } of skusWithAttrs) {
    if (sku.rawUpc) upcs.push(sku.rawUpc)
    if (attrs.caliber) calibers.push(attrs.caliber)
    if (attrs.brand) brands.push(attrs.brand)
  }

  // STEP 4: Batch load canonical SKUs into lookup maps
  const [upcMap, attrMap] = await Promise.all([
    buildUpcLookupMap(upcs),
    buildAttributeLookupMap(calibers, brands),
  ])

  // STEP 5: Match all SKUs using pre-loaded maps (no DB queries)
  const pendingCreates: PendingCanonical[] = []

  for (let i = 0; i < skusWithAttrs.length; i++) {
    const { sku, attrs } = skusWithAttrs[i]
    let result: MatchResult = { canonicalSkuId: null, confidence: 'NONE', needsReview: true }

    // 1. Try UPC match first
    if (sku.rawUpc) {
      result = matchByUPC(sku.rawUpc, upcMap)
    }

    // 2. Try attribute match
    if (!result.canonicalSkuId) {
      result = matchByAttributes(attrs, attrMap)
    }

    // 3. Queue for canonical creation if we have enough data
    if (
      !result.canonicalSkuId &&
      attrs.caliber &&
      attrs.brand &&
      attrs.grain &&
      attrs.packSize
    ) {
      pendingCreates.push({
        skuIndex: i,
        attrs,
        upc: sku.rawUpc || undefined,
      })
    }

    skusWithAttrs[i].matchResult = result
  }

  // STEP 6: Batch create new canonical SKUs
  const createdCanonicals = await batchCreatecanonical_skuss(pendingCreates)

  // Update match results for newly created canonicals
  for (const [skuIndex, canonical] of Array.from(createdCanonicals.entries())) {
    const { sku } = skusWithAttrs[skuIndex]
    skusWithAttrs[skuIndex].matchResult = {
      canonicalSkuId: canonical.id,
      confidence: sku.rawUpc ? 'HIGH' : 'MEDIUM',
      needsReview: false,
    }
  }

  // STEP 7: Prepare batch updates
  const updates: SkuUpdate[] = skusWithAttrs.map(({ sku, attrs, matchResult }) => ({
    id: sku.id,
    parsedCaliber: attrs.caliber,
    parsedGrain: attrs.grain,
    parsedPackSize: attrs.packSize,
    parsedBulletType: attrs.bulletType,
    parsedBrand: attrs.brand,
    canonicalSkuId: matchResult.canonicalSkuId,
    mappingConfidence: matchResult.confidence,
    needsReview: matchResult.needsReview,
    mappedAt: matchResult.canonicalSkuId ? new Date() : null,
    mappedBy: matchResult.canonicalSkuId ? 'auto' : null,
  }))

  // STEP 8: Batch update all dealer SKUs
  await batchUpdateretailer_skuss(updates)

  // Calculate stats
  const stats: BatchStats = {
    matchedCount: skusWithAttrs.filter((s) => s.matchResult.canonicalSkuId).length,
    createdCount: createdCanonicals.size,
    reviewCount: skusWithAttrs.filter((s) => s.matchResult.needsReview).length,
  }

  // Update feed run with match stats
  await prisma.retailer_feed_runs.update({
    where: { id: feedRunId },
    data: {
      matchedCount: {
        increment: stats.matchedCount,
      },
    },
  })

  log.info('SKU matching completed', {
    matchedCount: stats.matchedCount,
    createdCount: stats.createdCount,
    reviewCount: stats.reviewCount,
  })

  return stats
}

// ============================================================================
// WORKER EXPORT
// ============================================================================

export const merchantSkuMatchWorker = new Worker(QUEUE_NAMES.MERCHANT_SKU_MATCH, processSkuMatch, {
  connection: redisConnection,
  concurrency: 10,
})

merchantSkuMatchWorker.on('completed', (job) => {
  log.info('Job completed', { jobId: job.id })
})

merchantSkuMatchWorker.on('failed', (job, error) => {
  log.error('Job failed', { jobId: job?.id, error: error.message }, error)
})
