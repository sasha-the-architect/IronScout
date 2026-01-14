/**
 * Affiliate Feed Circuit Breaker
 *
 * Phase 2: Spike detection before promoting products.
 * Prevents catastrophic data loss from bad feeds by detecting:
 * 1. Excessive expiry rate (too many products would be marked expired)
 * 2. URL_HASH fallback spike (data quality degradation)
 *
 * Per spec Section 8.2: Two-phase circuit breaker with 30% threshold.
 *
 * Key definitions (per spec):
 * - activeCountBefore: Previously-active products (lastSeenSuccessAt NOT NULL and within expiry window)
 * - seenSuccessCount: Previously-active products that were ALSO seen in this run
 * - wouldExpireCount: activeCountBefore - seenSuccessCount (clamped to 0)
 *
 * New products (lastSeenSuccessAt IS NULL) are EXCLUDED from circuit breaker math.
 * They don't affect the calculation - only previously-active products that would become stale matter.
 */

import { prisma } from '@ironscout/db'
import { logger } from '../config/logger'
import type { CircuitBreakerResult, CircuitBreakerMetrics } from './types'
import { CIRCUIT_BREAKER_THRESHOLDS } from './types'

const log = logger.affiliate

/**
 * Evaluate circuit breaker before promoting products
 *
 * @param runId - The current run ID
 * @param feedId - The feed ID
 * @param expiryHours - The feed's expiry threshold in hours
 * @param t0 - The run start timestamp (used for all queries - no NOW() in SQL)
 * @param urlHashFallbackCount - Count of products that used URL_HASH identity
 * @param totalProductsProcessed - Total products processed in this run (for URL_HASH percentage)
 */
export async function evaluateCircuitBreaker(
  runId: string,
  feedId: string,
  expiryHours: number,
  t0: Date,
  urlHashFallbackCount: number,
  totalProductsProcessed: number
): Promise<CircuitBreakerResult> {
  log.info('CIRCUIT_BREAKER_START', { runId, feedId, t0: t0.toISOString(), expiryHours })

  // Get feed's source ID
  const feed = await prisma.affiliate_feeds.findUnique({
    where: { id: feedId },
    select: { sourceId: true },
  })

  if (!feed) {
    throw new Error(`Feed not found: ${feedId}`)
  }

  // Compute expiry threshold using t0 (not NOW())
  // Per spec §8.2: All Phase 2 queries must use the same captured timestamp
  const expiryThreshold = new Date(t0.getTime() - expiryHours * 3600000)

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 1: Count "active before run" (products that were promoted and not yet expired)
  // Per spec §8.2: lastSeenSuccessAt IS NOT NULL AND within expiry window
  // ═══════════════════════════════════════════════════════════════════════════
  const activeCountBefore = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count
    FROM source_product_presence spp
    INNER JOIN source_products sp ON sp.id = spp."sourceProductId"
    WHERE sp."sourceId" = ${feed.sourceId}
      AND spp."lastSeenSuccessAt" IS NOT NULL
      AND spp."lastSeenSuccessAt" >= ${expiryThreshold}
  `.then((r) => Number(r[0]?.count ?? 0))

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 2: Count "active before that we ALSO saw this run" (overlap)
  // Per spec §8.2: Same criteria as activeCountBefore, but also in SourceProductSeen
  // New products (NULL lastSeenSuccessAt) are EXCLUDED from this count
  // ═══════════════════════════════════════════════════════════════════════════
  const seenSuccessCount = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count
    FROM source_product_presence spp
    INNER JOIN source_products sp ON sp.id = spp."sourceProductId"
    INNER JOIN source_product_seen seen ON seen."sourceProductId" = spp."sourceProductId"
    WHERE sp."sourceId" = ${feed.sourceId}
      AND seen."runId" = ${runId}
      AND spp."lastSeenSuccessAt" IS NOT NULL
      AND spp."lastSeenSuccessAt" >= ${expiryThreshold}
  `.then((r) => Number(r[0]?.count ?? 0))

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 3: Compute derived values with edge case handling
  // Per spec §8.2: Clamp to zero - negative values indicate data anomalies
  // ═══════════════════════════════════════════════════════════════════════════
  const rawExpireCount = activeCountBefore - seenSuccessCount
  const wouldExpireCount = Math.max(0, rawExpireCount)

  // Log warning if clamping occurred - this is a smoke alarm
  if (rawExpireCount < 0) {
    log.warn('CIRCUIT_BREAKER_NEGATIVE_EXPIRE_COUNT', {
      runId,
      feedId,
      activeCountBefore,
      seenSuccessCount,
      rawExpireCount,
      // Possible causes: NULL lastSeenSuccessAt, clock skew, missing presence rows
    })
  }

  // Handle division by zero: if no active products, nothing can expire
  const expiryPercentage =
    activeCountBefore > 0
      ? (wouldExpireCount / activeCountBefore) * 100
      : 0

  // URL_HASH percentage uses total products processed as denominator
  // Per spec Q6.1.5: "Track urlHashFallbackCount per run. Block if >50%"
  const urlHashPercentage =
    totalProductsProcessed > 0
      ? (urlHashFallbackCount / totalProductsProcessed) * 100
      : 0

  const metrics: CircuitBreakerMetrics = {
    activeCountBefore,
    seenSuccessCount,
    wouldExpireCount,
    urlHashFallbackCount,
    expiryPercentage,
  }

  log.debug('CIRCUIT_BREAKER_COUNTS', {
    runId,
    feedId,
    activeCountBefore,
    seenSuccessCount,
    wouldExpireCount,
    expirePercent: expiryPercentage.toFixed(2),
    urlHashFallbackCount,
    urlHashPercent: urlHashPercentage.toFixed(2),
    totalProductsProcessed,
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 4: Apply thresholds
  //
  // Quality gate logic per spec:
  // - Absolute caps (expiry >= 500) apply unconditionally - catastrophic loss prevention
  // - Percentage checks require minimum active products (cold-start safe)
  // - URL_HASH checks only fire if feed has established history (activeCountBefore >= MIN)
  //   This prevents blocking legitimate new feeds with poor identity coverage
  // ═══════════════════════════════════════════════════════════════════════════

  // Check absolute expiry cap first (regardless of percentage or active count)
  // Per spec Q7.2.2: Block if wouldExpire >= 500
  if (wouldExpireCount >= CIRCUIT_BREAKER_THRESHOLDS.ABSOLUTE_EXPIRY_CAP) {
    log.warn('CIRCUIT_BREAKER_TRIPPED', {
      runId,
      feedId,
      reason: 'SPIKE_THRESHOLD_EXCEEDED',
      wouldExpireCount,
      expirePercent: expiryPercentage.toFixed(2),
      thresholdPercent: CIRCUIT_BREAKER_THRESHOLDS.MAX_EXPIRY_PERCENTAGE,
      thresholdAbsolute: CIRCUIT_BREAKER_THRESHOLDS.ABSOLUTE_EXPIRY_CAP,
    })

    return {
      passed: false,
      reason: 'SPIKE_THRESHOLD_EXCEEDED',
      metrics,
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // URL_HASH quality gates - only apply to established feeds
  //
  // Per spec: URL_HASH fallback indicates identity column gaps.
  // For NEW feeds (low activeCountBefore), high URL_HASH is expected and acceptable.
  // For ESTABLISHED feeds, URL_HASH spike indicates data quality degradation.
  //
  // Both absolute cap and percentage checks require established history.
  // ═══════════════════════════════════════════════════════════════════════════
  if (activeCountBefore >= CIRCUIT_BREAKER_THRESHOLDS.MIN_ACTIVE_FOR_PERCENTAGE_CHECK) {
    // Check expiry spike
    // Per spec Q7.2.2: Block if (wouldExpire / activeBefore) > 30% AND wouldExpire >= 10
    const exceedsPercentage = expiryPercentage > CIRCUIT_BREAKER_THRESHOLDS.MAX_EXPIRY_PERCENTAGE
    const exceedsMinCount = wouldExpireCount >= CIRCUIT_BREAKER_THRESHOLDS.MIN_EXPIRY_COUNT_FOR_SPIKE

    if (exceedsPercentage && exceedsMinCount) {
      log.warn('CIRCUIT_BREAKER_TRIPPED', {
        runId,
        feedId,
        reason: 'SPIKE_THRESHOLD_EXCEEDED',
        wouldExpireCount,
        expirePercent: expiryPercentage.toFixed(2),
        thresholdPercent: CIRCUIT_BREAKER_THRESHOLDS.MAX_EXPIRY_PERCENTAGE,
        thresholdAbsolute: CIRCUIT_BREAKER_THRESHOLDS.ABSOLUTE_EXPIRY_CAP,
        thresholdMinCount: CIRCUIT_BREAKER_THRESHOLDS.MIN_EXPIRY_COUNT_FOR_SPIKE,
      })

      return {
        passed: false,
        reason: 'SPIKE_THRESHOLD_EXCEEDED',
        metrics,
      }
    }

    // Check absolute URL_HASH cap (only for established feeds)
    // Per spec Q6.1.5: Block if >1000 products use URL_HASH
    // Note: This cap only applies to feeds with history - new feeds can have high URL_HASH
    if (urlHashFallbackCount > CIRCUIT_BREAKER_THRESHOLDS.ABSOLUTE_URL_HASH_CAP) {
      log.warn('CIRCUIT_BREAKER_TRIPPED', {
        runId,
        feedId,
        reason: 'DATA_QUALITY_URL_HASH_SPIKE',
        urlHashFallbackCount,
        urlHashPercent: urlHashPercentage.toFixed(2),
        thresholdAbsolute: CIRCUIT_BREAKER_THRESHOLDS.ABSOLUTE_URL_HASH_CAP,
        activeCountBefore,
      })

      return {
        passed: false,
        reason: 'DATA_QUALITY_URL_HASH_SPIKE',
        metrics,
      }
    }

    // Check URL_HASH fallback percentage spike
    if (urlHashPercentage > CIRCUIT_BREAKER_THRESHOLDS.MAX_URL_HASH_FALLBACK_PERCENTAGE) {
      log.warn('CIRCUIT_BREAKER_TRIPPED', {
        runId,
        feedId,
        reason: 'DATA_QUALITY_URL_HASH_SPIKE',
        urlHashFallbackCount,
        urlHashPercent: urlHashPercentage.toFixed(2),
        threshold: CIRCUIT_BREAKER_THRESHOLDS.MAX_URL_HASH_FALLBACK_PERCENTAGE,
        totalProductsProcessed,
      })

      return {
        passed: false,
        reason: 'DATA_QUALITY_URL_HASH_SPIKE',
        metrics,
      }
    }
  } else {
    // Feed is new/cold - log URL_HASH stats but don't block
    if (urlHashFallbackCount > 0) {
      log.debug('CIRCUIT_BREAKER_URL_HASH_COLD_START', {
        runId,
        feedId,
        urlHashFallbackCount,
        urlHashPercent: urlHashPercentage.toFixed(2),
        activeCountBefore,
        note: 'URL_HASH checks skipped - feed has insufficient history',
      })
    }
  }

  log.info('CIRCUIT_BREAKER_PASSED', {
    runId,
    feedId,
    wouldExpireCount,
    expirePercent: expiryPercentage.toFixed(2),
    thresholdPercent: CIRCUIT_BREAKER_THRESHOLDS.MAX_EXPIRY_PERCENTAGE,
    thresholdAbsolute: CIRCUIT_BREAKER_THRESHOLDS.ABSOLUTE_EXPIRY_CAP,
  })

  return {
    passed: true,
    metrics,
  }
}

/**
 * Promote products after circuit breaker passes
 * Updates lastSeenSuccessAt for all products seen in this run
 */
export async function promoteProducts(runId: string, t0: Date): Promise<number> {
  const result = await prisma.$executeRaw`
    UPDATE source_product_presence spp
    SET "lastSeenSuccessAt" = ${t0}, "updatedAt" = ${t0}
    FROM source_product_seen sps
    WHERE sps."runId" = ${runId}
      AND sps."sourceProductId" = spp."sourceProductId"
  `

  log.info('Products promoted', { runId, count: result })

  return result
}

/**
 * Copy seen rows from a previous run and refresh presence timestamps.
 * Used when a feed is unchanged but needs freshness refresh after downtime.
 */
export async function copySeenFromPreviousRun(
  previousRunId: string,
  runId: string,
  t0: Date
): Promise<number> {
  const copiedCount = await prisma.$executeRaw`
    INSERT INTO source_product_seen ("id", "runId", "sourceProductId", "createdAt")
    SELECT gen_random_uuid(), ${runId}, sps."sourceProductId", ${t0}
    FROM source_product_seen sps
    WHERE sps."runId" = ${previousRunId}
    ON CONFLICT ("runId", "sourceProductId") DO NOTHING
  `

  await prisma.$executeRaw`
    INSERT INTO source_product_presence ("id", "sourceProductId", "lastSeenAt", "updatedAt")
    SELECT gen_random_uuid(), sps."sourceProductId", ${t0}, ${t0}
    FROM source_product_seen sps
    WHERE sps."runId" = ${runId}
    ON CONFLICT ("sourceProductId") DO UPDATE SET
      "lastSeenAt" = ${t0},
      "updatedAt" = ${t0}
  `

  log.info('Seen rows copied for refresh', {
    previousRunId,
    runId,
    count: copiedCount,
  })

  return copiedCount
}

/**
 * Get expiry status for a feed (for monitoring)
 */
export async function getExpiryStatus(
  feedId: string
): Promise<{
  activeCount: number
  expiredCount: number
  pendingCount: number
}> {
  const feed = await prisma.affiliate_feeds.findUnique({
    where: { id: feedId },
    select: { sourceId: true, expiryHours: true },
  })

  if (!feed) {
    throw new Error(`Feed not found: ${feedId}`)
  }

  const now = new Date()
  const expiryThreshold = new Date(now.getTime() - feed.expiryHours * 3600000)

  // Active: lastSeenSuccessAt within window
  const activeCount = await prisma.source_product_presence.count({
    where: {
      source_products: { sourceId: feed.sourceId },
      lastSeenSuccessAt: { gte: expiryThreshold },
    },
  })

  // Expired: lastSeenSuccessAt outside window
  const expiredCount = await prisma.source_product_presence.count({
    where: {
      source_products: { sourceId: feed.sourceId },
      OR: [
        { lastSeenSuccessAt: { lt: expiryThreshold } },
        { lastSeenSuccessAt: null },
      ],
    },
  })

  // Pending: seen but not yet promoted (lastSeenAt > lastSeenSuccessAt)
  const pendingCount = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count
    FROM source_product_presence spp
    INNER JOIN source_products sp ON sp.id = spp."sourceProductId"
    WHERE sp."sourceId" = ${feed.sourceId}
      AND spp."lastSeenAt" > COALESCE(spp."lastSeenSuccessAt", '1970-01-01'::timestamp)
  `.then((r) => Number(r[0]?.count || 0))

  return { activeCount, expiredCount, pendingCount }
}
