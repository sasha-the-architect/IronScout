/**
 * Current Price Recompute Logic
 *
 * Per ADR-015: Rebuilds the current_visible_prices derived table.
 * This table materializes the result of applying corrections, run-ignore,
 * and retailer visibility filters so hot paths can read without evaluation.
 *
 * Algorithm:
 * 1. Delete existing rows in derived table for the given scope
 * 2. Query prices with full visibility predicate + corrections overlay
 * 3. Apply MULTIPLIER corrections to compute visiblePrice
 * 4. Exclude prices with IGNORE corrections
 * 5. Batch insert into current_visible_prices
 */

import { prisma, Prisma } from '@ironscout/db'
import { logger } from '../config/logger'

const log = logger.currentprice

// Batch size for insert operations
const BATCH_SIZE = 1000

// Price lookback days (matches API config)
const PRICE_LOOKBACK_DAYS = parseInt(process.env.CURRENT_PRICE_LOOKBACK_DAYS || '7', 10)

export interface RecomputeResult {
  processed: number
  inserted: number
  deleted: number
  durationMs: number
  scope: 'FULL' | 'PRODUCT' | 'RETAILER' | 'SOURCE'
  scopeId?: string
}

/**
 * Recompute current visible prices for a given scope
 *
 * @param scope - Scope of recompute (FULL, PRODUCT, RETAILER, SOURCE)
 * @param scopeId - ID of the scoped entity (required for non-FULL scopes)
 * @param correlationId - Correlation ID for tracing
 * @returns Recompute result with metrics
 */
export async function recomputeCurrentPrices(
  scope: 'FULL' | 'PRODUCT' | 'RETAILER' | 'SOURCE',
  scopeId: string | undefined,
  correlationId: string
): Promise<RecomputeResult> {
  const startTime = Date.now()

  log.info('RECOMPUTE_START', {
    event_name: 'RECOMPUTE_START',
    scope,
    scopeId,
    correlationId,
    lookbackDays: PRICE_LOOKBACK_DAYS,
  })

  // Calculate lookback cutoff
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - PRICE_LOOKBACK_DAYS)

  try {
    // Step 1: Delete existing rows for the scope
    const deleteResult = await deleteExistingForScope(scope, scopeId)

    // Step 2-5: Query visible prices and insert into derived table
    const { processed, inserted } = await buildDerivedTable(scope, scopeId, cutoffDate, correlationId)

    const durationMs = Date.now() - startTime

    log.info('RECOMPUTE_COMPLETE', {
      event_name: 'RECOMPUTE_COMPLETE',
      scope,
      scopeId,
      correlationId,
      processed,
      inserted,
      deleted: deleteResult,
      durationMs,
    })

    return {
      processed,
      inserted,
      deleted: deleteResult,
      durationMs,
      scope,
      scopeId,
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    log.error(
      'RECOMPUTE_FAILED',
      {
        event_name: 'RECOMPUTE_FAILED',
        scope,
        scopeId,
        correlationId,
        durationMs,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      error instanceof Error ? error : new Error(String(error))
    )
    throw error
  }
}

/**
 * Delete existing rows in derived table for the given scope
 */
async function deleteExistingForScope(
  scope: 'FULL' | 'PRODUCT' | 'RETAILER' | 'SOURCE',
  scopeId?: string
): Promise<number> {
  let where: Prisma.current_visible_pricesWhereInput = {}

  switch (scope) {
    case 'FULL':
      // Delete all rows
      where = {}
      break
    case 'PRODUCT':
      where = { productId: scopeId }
      break
    case 'RETAILER':
      where = { retailerId: scopeId }
      break
    case 'SOURCE':
      where = { sourceId: scopeId }
      break
  }

  const result = await prisma.current_visible_prices.deleteMany({ where })
  return result.count
}

/**
 * Build the derived table by querying visible prices and applying corrections
 */
async function buildDerivedTable(
  scope: 'FULL' | 'PRODUCT' | 'RETAILER' | 'SOURCE',
  scopeId: string | undefined,
  cutoffDate: Date,
  correlationId: string
): Promise<{ processed: number; inserted: number }> {
  // Build scope filter for raw SQL
  let scopeFilter = ''
  const params: any[] = [cutoffDate]

  switch (scope) {
    case 'PRODUCT':
      scopeFilter = 'AND pr."productId" = $2'
      params.push(scopeId)
      break
    case 'RETAILER':
      scopeFilter = 'AND pr."retailerId" = $2'
      params.push(scopeId)
      break
    case 'SOURCE':
      scopeFilter = 'AND pr."sourceId" = $2'
      params.push(scopeId)
      break
  }

  // Query visible prices with corrections overlay
  // This is the comprehensive query that applies:
  // - Retailer visibility (ELIGIBLE + listing status)
  // - Run ignore exclusion
  // - Lookback window
  // - IGNORE corrections exclusion
  // - MULTIPLIER corrections applied
  const visiblePrices = await prisma.$queryRawUnsafe<
    Array<{
      id: string
      productId: string | null
      retailerId: string
      merchantId: string | null
      sourceId: string | null
      sourceProductId: string | null
      price: string // Decimal comes as string
      currency: string
      url: string
      inStock: boolean
      observedAt: Date
      shippingCost: string | null
      retailerName: string
      retailerTier: string
      ingestionRunType: string | null
      ingestionRunId: string | null
      multiplier: string | null // Applied multiplier from corrections
    }>
  >(
    `
    WITH retailer_visibility AS (
      -- ADR-005: Retailer visibility predicate
      SELECT r.id as "retailerId", r.name as "retailerName", r.tier as "retailerTier"
      FROM retailers r
      WHERE r."visibilityStatus" = 'ELIGIBLE'
        AND (
          -- Crawl-only: no ACTIVE relationships
          NOT EXISTS (
            SELECT 1 FROM merchant_retailers mr
            WHERE mr."retailerId" = r.id AND mr.status = 'ACTIVE'
          )
          OR
          -- Merchant-managed: at least one ACTIVE + LISTED
          EXISTS (
            SELECT 1 FROM merchant_retailers mr
            WHERE mr."retailerId" = r.id
              AND mr.status = 'ACTIVE'
              AND mr."listingStatus" = 'LISTED'
          )
        )
    ),
    ignored_runs AS (
      -- ADR-015: Runs marked as ignored
      SELECT id FROM affiliate_feed_runs WHERE "ignoredAt" IS NOT NULL
      UNION ALL
      SELECT id FROM retailer_feed_runs WHERE "ignoredAt" IS NOT NULL
      UNION ALL
      SELECT id FROM executions WHERE "ignoredAt" IS NOT NULL
    ),
    active_ignore_corrections AS (
      -- ADR-015: Active IGNORE corrections
      SELECT pc."scopeType", pc."scopeId", pc."startTs", pc."endTs"
      FROM price_corrections pc
      WHERE pc.action = 'IGNORE'
        AND pc."revokedAt" IS NULL
    ),
    active_multiplier_corrections AS (
      -- ADR-015: Active MULTIPLIER corrections
      -- Per ADR-015 precedence: PRODUCT > RETAILER > MERCHANT > SOURCE > AFFILIATE > FEED_RUN
      SELECT pc."scopeType", pc."scopeId", pc."startTs", pc."endTs", pc.value
      FROM price_corrections pc
      WHERE pc.action = 'MULTIPLIER'
        AND pc."revokedAt" IS NULL
    )
    SELECT
      pr.id,
      pr."productId",
      pr."retailerId",
      pr."merchantId",
      pr."sourceId",
      pr."sourceProductId",
      pr.price::text,
      pr.currency,
      pr.url,
      pr."inStock",
      pr."observedAt",
      pr."shippingCost"::text,
      rv."retailerName",
      rv."retailerTier",
      pr."ingestionRunType"::text,
      pr."ingestionRunId",
      -- Find the highest-precedence multiplier correction
      COALESCE(
        (SELECT value::text FROM active_multiplier_corrections amc
         WHERE amc."scopeType" = 'PRODUCT' AND amc."scopeId" = pr."productId"
           AND pr."observedAt" >= amc."startTs" AND pr."observedAt" < amc."endTs"
         LIMIT 1),
        (SELECT value::text FROM active_multiplier_corrections amc
         WHERE amc."scopeType" = 'RETAILER' AND amc."scopeId" = pr."retailerId"
           AND pr."observedAt" >= amc."startTs" AND pr."observedAt" < amc."endTs"
         LIMIT 1),
        (SELECT value::text FROM active_multiplier_corrections amc
         WHERE amc."scopeType" = 'MERCHANT' AND amc."scopeId" = pr."merchantId"
           AND pr."observedAt" >= amc."startTs" AND pr."observedAt" < amc."endTs"
         LIMIT 1),
        (SELECT value::text FROM active_multiplier_corrections amc
         WHERE amc."scopeType" = 'SOURCE' AND amc."scopeId" = pr."sourceId"
           AND pr."observedAt" >= amc."startTs" AND pr."observedAt" < amc."endTs"
         LIMIT 1),
        (SELECT value::text FROM active_multiplier_corrections amc
         WHERE amc."scopeType" = 'FEED_RUN' AND amc."scopeId" = pr."ingestionRunId"
           AND pr."observedAt" >= amc."startTs" AND pr."observedAt" < amc."endTs"
         LIMIT 1)
      ) as multiplier
    FROM prices pr
    INNER JOIN retailer_visibility rv ON rv."retailerId" = pr."retailerId"
    WHERE pr."observedAt" >= $1
      ${scopeFilter}
      -- Exclude ignored runs
      AND (pr."affiliateFeedRunId" IS NULL OR pr."affiliateFeedRunId" NOT IN (SELECT id FROM ignored_runs))
      AND (pr."ingestionRunId" IS NULL OR pr."ingestionRunId" NOT IN (SELECT id FROM ignored_runs))
      -- ADR-015: Exclude prices matching IGNORE corrections
      AND NOT EXISTS (
        SELECT 1 FROM active_ignore_corrections aic
        WHERE pr."observedAt" >= aic."startTs" AND pr."observedAt" < aic."endTs"
          AND (
            (aic."scopeType" = 'PRODUCT' AND aic."scopeId" = pr."productId")
            OR (aic."scopeType" = 'RETAILER' AND aic."scopeId" = pr."retailerId")
            OR (aic."scopeType" = 'MERCHANT' AND aic."scopeId" = pr."merchantId")
            OR (aic."scopeType" = 'SOURCE' AND aic."scopeId" = pr."sourceId")
            OR (aic."scopeType" = 'FEED_RUN' AND aic."scopeId" = pr."ingestionRunId")
          )
      )
    `,
    ...params
  )

  const processed = visiblePrices.length

  if (processed === 0) {
    log.debug('RECOMPUTE_NO_PRICES', {
      event_name: 'RECOMPUTE_NO_PRICES',
      scope,
      scopeId,
      correlationId,
    })
    return { processed: 0, inserted: 0 }
  }

  // Batch insert into derived table
  let inserted = 0
  for (let i = 0; i < visiblePrices.length; i += BATCH_SIZE) {
    const batch = visiblePrices.slice(i, i + BATCH_SIZE)

    const insertData = batch.map((p) => {
      const rawPrice = parseFloat(p.price)
      const multiplier = p.multiplier ? parseFloat(p.multiplier) : 1.0
      const visiblePrice = rawPrice * multiplier

      return {
        id: p.id,
        productId: p.productId,
        retailerId: p.retailerId,
        merchantId: p.merchantId,
        sourceId: p.sourceId,
        sourceProductId: p.sourceProductId,
        price: rawPrice,
        visiblePrice: visiblePrice,
        currency: p.currency,
        url: p.url,
        inStock: p.inStock,
        observedAt: p.observedAt,
        shippingCost: p.shippingCost ? parseFloat(p.shippingCost) : null,
        retailerName: p.retailerName,
        retailerTier: p.retailerTier as 'STANDARD' | 'PREMIUM',
        ingestionRunType: p.ingestionRunType as any,
        ingestionRunId: p.ingestionRunId,
        recomputedAt: new Date(),
        recomputeJobId: correlationId,
      }
    })

    // Use createMany for batch insert
    const result = await prisma.current_visible_prices.createMany({
      data: insertData,
      skipDuplicates: true, // Skip if ID already exists (shouldn't happen but safe)
    })

    inserted += result.count
  }

  return { processed, inserted }
}

/**
 * Get recompute status/metrics
 */
export async function getRecomputeStatus(): Promise<{
  totalRows: number
  oldestRecompute: Date | null
  newestRecompute: Date | null
}> {
  const [count, oldest, newest] = await Promise.all([
    prisma.current_visible_prices.count(),
    prisma.current_visible_prices.findFirst({
      orderBy: { recomputedAt: 'asc' },
      select: { recomputedAt: true },
    }),
    prisma.current_visible_prices.findFirst({
      orderBy: { recomputedAt: 'desc' },
      select: { recomputedAt: true },
    }),
  ])

  return {
    totalRows: count,
    oldestRecompute: oldest?.recomputedAt ?? null,
    newestRecompute: newest?.recomputedAt ?? null,
  }
}
