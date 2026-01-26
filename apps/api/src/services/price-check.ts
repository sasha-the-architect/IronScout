/**
 * Price Check Service
 *
 * Per mobile_price_check_v1_spec.md:
 * - Answers: "Is this price normal, high, or unusually low right now?"
 * - Classification requires ≥5 price points in trailing 30 days
 * - No verdicts or recommendations
 */

import { prisma } from '@ironscout/db'
import { CANONICAL_CALIBERS, type CaliberValue, isValidCaliber } from './gun-locker'

/**
 * Price classification
 */
export type PriceClassification = 'LOWER' | 'TYPICAL' | 'HIGHER' | 'INSUFFICIENT_DATA'

/**
 * Price Check result
 */
export interface PriceCheckResult {
  classification: PriceClassification
  enteredPricePerRound: number
  caliber: CaliberValue
  context: {
    minPrice: number | null
    maxPrice: number | null
    medianPrice: number | null
    pricePointCount: number
    daysWithData: number
  }
  freshnessIndicator: string
  message: string
}

/**
 * Check a price against recent market data
 *
 * @param caliber - Canonical caliber value
 * @param pricePerRound - Entered price per round in cents (e.g., 0.30 = $0.30/rd)
 * @param brand - Optional brand filter
 * @param grain - Optional grain weight filter
 */
export async function checkPrice(
  caliber: string,
  pricePerRound: number,
  brand?: string,
  grain?: number
): Promise<PriceCheckResult> {
  // Validate caliber is canonical
  if (!isValidCaliber(caliber)) {
    throw new Error(`Invalid caliber: ${caliber}. Must be one of: ${CANONICAL_CALIBERS.join(', ')}`)
  }

  const now = new Date()
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  // Normalize caliber for database query (handle aliases)
  // caliber is validated as CaliberValue on line 51
  const caliberConditions = getCaliberConditions(caliber as CaliberValue)

  // Build brand/grain filters
  let brandCondition = ''
  let grainCondition = ''
  const params: any[] = [thirtyDaysAgo, ...caliberConditions.params]

  if (brand) {
    brandCondition = `AND LOWER(p.brand) LIKE $${params.length + 1}`
    params.push(`%${brand.toLowerCase()}%`)
  }

  if (grain) {
    grainCondition = `AND p."grainWeight" = $${params.length + 1}`
    params.push(grain)
  }

  // Get daily best prices per product for the caliber in trailing 30 days
  // Per spec: "One daily best price per product per caliber (lowest visible offer price on a given UTC calendar day)"
  const priceData = await prisma.$queryRawUnsafe<
    Array<{
      pricePerRound: any
      observedDate: Date
    }>
  >(
    `
    WITH daily_best AS (
      SELECT
        p.id as product_id,
        DATE_TRUNC('day', pr."observedAt" AT TIME ZONE 'UTC') as observed_day,
        MIN(CASE WHEN p."roundCount" > 0 THEN pr.price / p."roundCount" ELSE pr.price END) as price_per_round
      FROM products p
      JOIN product_links pl ON pl."productId" = p.id
      JOIN prices pr ON pr."sourceProductId" = pl."sourceProductId"
      JOIN retailers r ON r.id = pr."retailerId"
      LEFT JOIN merchant_retailers mr ON mr."retailerId" = r.id AND mr.status = 'ACTIVE'
      LEFT JOIN affiliate_feed_runs afr ON afr.id = pr."affiliateFeedRunId"
      WHERE pl.status IN ('MATCHED', 'CREATED')
        AND pr."observedAt" >= $1
        AND pr."inStock" = true
        AND r."visibilityStatus" = 'ELIGIBLE'
        AND (mr.id IS NULL OR (mr."listingStatus" = 'LISTED' AND mr.status = 'ACTIVE'))
        AND (pr."affiliateFeedRunId" IS NULL OR afr."ignoredAt" IS NULL) -- ADR-015: Exclude ignored runs
        AND (${caliberConditions.sql})
        ${brandCondition}
        ${grainCondition}
      GROUP BY p.id, DATE_TRUNC('day', pr."observedAt" AT TIME ZONE 'UTC')
    )
    SELECT
      price_per_round as "pricePerRound",
      observed_day as "observedDate"
    FROM daily_best
    ORDER BY observed_day DESC
  `,
    ...params
  )

  const pricePointCount = priceData.length
  const uniqueDays = new Set(priceData.map((p) => p.observedDate.toISOString().split('T')[0]))
  const daysWithData = uniqueDays.size

  // Handle sparse/no data per spec
  if (pricePointCount === 0) {
    return {
      classification: 'INSUFFICIENT_DATA',
      enteredPricePerRound: pricePerRound,
      caliber: caliber as CaliberValue,
      context: {
        minPrice: null,
        maxPrice: null,
        medianPrice: null,
        pricePointCount: 0,
        daysWithData: 0,
      },
      freshnessIndicator: '',
      message: `No recent data for ${getCaliberLabel(caliber)}.`,
    }
  }

  // Calculate statistics
  const prices = priceData.map((p) => parseFloat(p.pricePerRound.toString()))
  prices.sort((a, b) => a - b)

  const minPrice = prices[0]
  const maxPrice = prices[prices.length - 1]
  const medianPrice = prices[Math.floor(prices.length / 2)]

  // Per spec: Classification requires ≥5 price points
  if (pricePointCount < 5) {
    return {
      classification: 'INSUFFICIENT_DATA',
      enteredPricePerRound: pricePerRound,
      caliber: caliber as CaliberValue,
      context: {
        minPrice: round(minPrice, 4),
        maxPrice: round(maxPrice, 4),
        medianPrice: round(medianPrice, 4),
        pricePointCount,
        daysWithData,
      },
      freshnessIndicator: `Based on prices from the last ${daysWithData} days`,
      message: `Limited data. Recent range: $${formatPrice(minPrice)}–$${formatPrice(maxPrice)}/rd.`,
    }
  }

  // Classify price relative to distribution
  // Lower: at or below 25th percentile
  // Higher: at or above 75th percentile
  // Typical: between 25th and 75th percentile
  const p25 = prices[Math.floor(prices.length * 0.25)]
  const p75 = prices[Math.floor(prices.length * 0.75)]

  let classification: PriceClassification
  let message: string

  if (pricePerRound <= p25) {
    classification = 'LOWER'
    message = 'Lower than usual'
  } else if (pricePerRound >= p75) {
    classification = 'HIGHER'
    message = 'Higher than usual'
  } else {
    classification = 'TYPICAL'
    message = 'Typical range'
  }

  return {
    classification,
    enteredPricePerRound: pricePerRound,
    caliber: caliber as CaliberValue,
    context: {
      minPrice: round(minPrice, 4),
      maxPrice: round(maxPrice, 4),
      medianPrice: round(medianPrice, 4),
      pricePointCount,
      daysWithData,
    },
    freshnessIndicator: `Based on prices from the last ${daysWithData} days`,
    message,
  }
}

/**
 * Get SQL conditions for caliber matching (handles aliases)
 */
function getCaliberConditions(caliber: CaliberValue): { sql: string; params: string[] } {
  // Map canonical caliber to possible database values
  const aliasGroups: Record<CaliberValue, string[]> = {
    '9mm': ['9mm', '9mm luger', '9mm parabellum', '9x19', '9x19mm'],
    '.38 Special': ['.38 special', '38 special', '.38 spl', '38 spl'],
    '.357 Magnum': ['.357 magnum', '357 magnum', '.357 mag', '357 mag'],
    '.25 ACP': ['.25 acp', '25 acp', '.25 auto'],
    '.32 ACP': ['.32 acp', '32 acp', '.32 auto', '7.65mm'],
    '10mm Auto': ['10mm', '10mm auto'],
    '.45 ACP': ['.45 acp', '45 acp', '.45acp', '.45 auto'],
    '.45 Colt': ['.45 colt', '45 colt', '.45 long colt', '45 lc'],
    '.40 S&W': ['.40 s&w', '40 s&w', '.40sw', '.40 smith & wesson'],
    '.380 ACP': ['.380 acp', '380 acp', '.380acp', '.380 auto'],
    '.22 LR': ['.22 lr', '22 lr', '.22lr', '22lr', '.22 long rifle'],
    '.22 WMR': ['.22 wmr', '22 wmr', '.22 magnum', '22 magnum', '.22 mag'],
    '.17 HMR': ['.17 hmr', '17 hmr', '.17 hornady magnum'],
    '.223/5.56': ['.223 rem', '.223 remington', '223 rem', '5.56', '5.56mm', '5.56x45', '5.56 nato', '.223/5.56'],
    '.308/7.62x51': ['.308 win', '.308 winchester', '308 win', '7.62x51', '7.62x51mm', '7.62 nato', '.308/7.62x51'],
    '.30-06': ['.30-06', '30-06', '.30-06 springfield', '.30-06 sprg'],
    '.300 AAC Blackout': ['.300 blackout', '300 blackout', '.300 aac', '300 aac', '.300 blk', '300 blk'],
    '6.5 Creedmoor': ['6.5 creedmoor', '6.5mm creedmoor', '6.5 cm'],
    '7.62x39': ['7.62x39', '7.62x39mm'],
    '.243 Winchester': ['.243 win', '.243 winchester', '243 win'],
    '.270 Winchester': ['.270 win', '.270 winchester', '270 win'],
    '.30-30 Winchester': ['.30-30', '30-30', '.30-30 win', '30-30 winchester'],
    '12ga': ['12 gauge', '12 ga', '12ga', '12g'],
    '20ga': ['20 gauge', '20 ga', '20ga', '20g'],
    '16ga': ['16 gauge', '16 ga', '16ga', '16g'],
    '.410 Bore': ['.410', '410', '.410 bore', '410 bore'],
    'Other': ['other'],
  }

  const aliases = aliasGroups[caliber] || [caliber]
  const placeholders = aliases.map((_, i) => `LOWER(p.caliber) = LOWER($${i + 2})`).join(' OR ')

  return {
    sql: placeholders,
    params: aliases,
  }
}

/**
 * Get human-readable caliber label
 */
function getCaliberLabel(caliber: string): string {
  const labels: Record<CaliberValue, string> = {
    '9mm': '9mm',
    '.38 Special': '.38 Special',
    '.357 Magnum': '.357 Magnum',
    '.25 ACP': '.25 ACP',
    '.32 ACP': '.32 ACP',
    '10mm Auto': '10mm Auto',
    '.45 ACP': '.45 ACP',
    '.45 Colt': '.45 Colt',
    '.40 S&W': '.40 S&W',
    '.380 ACP': '.380 ACP',
    '.22 LR': '.22 LR',
    '.22 WMR': '.22 WMR',
    '.17 HMR': '.17 HMR',
    '.223/5.56': '.223 / 5.56',
    '.308/7.62x51': '.308 / 7.62x51',
    '.30-06': '.30-06',
    '.300 AAC Blackout': '.300 Blackout',
    '6.5 Creedmoor': '6.5 Creedmoor',
    '7.62x39': '7.62x39',
    '.243 Winchester': '.243 Winchester',
    '.270 Winchester': '.270 Winchester',
    '.30-30 Winchester': '.30-30 Winchester',
    '12ga': '12 Gauge',
    '20ga': '20 Gauge',
    '16ga': '16 Gauge',
    '.410 Bore': '.410 Bore',
    'Other': 'Other',
  }
  return labels[caliber as CaliberValue] || caliber
}

function round(value: number, decimals: number): number {
  const multiplier = Math.pow(10, decimals)
  return Math.round(value * multiplier) / multiplier
}

function formatPrice(price: number): string {
  return price.toFixed(2)
}

/**
 * PriceCheckEvent per mobile_price_check_v1_spec.md
 *
 * Intent signal for analytics (internal only)
 *
 * PRIVACY RULES (ENFORCED):
 * - NO individual-level persistence: Raw enteredPrice must not be stored in user-linked records
 * - Aggregation only: Events aggregated to caliber-level statistics before long-term storage
 * - Retention: Raw event logs retained ≤7 days for debugging, then purged or aggregated
 * - No user linking: Events must not be joinable to user identity after aggregation
 */
export interface PriceCheckEvent {
  caliber: CaliberValue
  enteredPrice: number
  classification: PriceClassification
  hasGunLocker: boolean
  clickedOffer: boolean
  timestamp: Date
}

/**
 * Emit a PriceCheckEvent for analytics
 *
 * ⚠️ NON-COMPLIANT STUB: Aggregation pipeline not yet implemented
 *
 * Per mobile_price_check_v1_spec.md Privacy Rules (ENFORCED):
 * - NO individual-level persistence of raw enteredPrice
 * - Aggregation only: Events must be aggregated to caliber-level statistics
 * - Retention: Raw event logs retained ≤7 days, then purged or aggregated
 * - No user linking: Events must not be joinable to user identity
 *
 * CURRENT STATE: This stub only logs aggregate-safe fields (no enteredPrice).
 * Full compliance requires implementing the aggregation pipeline.
 *
 * @param event - The PriceCheckEvent data (without user identity)
 */
export function emitPriceCheckEvent(event: PriceCheckEvent): void {
  // PRIVACY: This function must NEVER receive or store user IDs
  // Any caller providing user identity would violate spec privacy rules

  // PRIVACY: Do NOT log enteredPrice - only aggregate-safe fields
  // enteredPrice is accepted in the interface for future aggregation but NOT logged
  console.log('[PriceCheckEvent]', JSON.stringify({
    caliber: event.caliber,
    classification: event.classification,
    hasGunLocker: event.hasGunLocker,
    clickedOffer: event.clickedOffer,
    timestamp: event.timestamp.toISOString(),
    // NOTE: enteredPrice intentionally omitted from logs per privacy rules
  }))

  // TODO: Implement compliant aggregation pipeline
  // Requirements per spec:
  // 1. Bucket enteredPrice into ranges (e.g., $0.20-0.25, $0.25-0.30) before aggregation
  // 2. Aggregate to caliber-level counts (e.g., "9mm: 150 checks, 45 LOWER, 80 TYPICAL, 25 HIGHER")
  // 3. Store only aggregated statistics for long-term retention
  // 4. Purge raw event logs after 7 days
  // 5. Ensure no join path to user identity after aggregation
}
