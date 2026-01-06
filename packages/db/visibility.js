/**
 * Shared Retailer Visibility Predicates
 *
 * A1 Semantics per Merchant-and-Retailer-Reference:
 *
 * | visibilityStatus | Merchant Relationships      | Result              |
 * |------------------|-----------------------------|---------------------|
 * | ELIGIBLE         | none                        | Visible (crawl-only)|
 * | ELIGIBLE         | >=1 ACTIVE + LISTED         | Visible             |
 * | ELIGIBLE         | >=1 ACTIVE, all UNLISTED    | Hidden              |
 * | ELIGIBLE         | all SUSPENDED               | Visible (crawl-only)|
 * | INELIGIBLE       | any                         | Hidden              |
 *
 * CRITICAL: Both apps/api and apps/harvester MUST use this shared predicate
 * to prevent drift. Do NOT duplicate this logic.
 */

/**
 * Prisma where clause for retailer visibility filtering on prices.
 *
 * Implements A1 semantics:
 * - `{ none: { status: 'ACTIVE' } }` = "no ACTIVE relationships"
 * - This covers: no relationships at all, OR all relationships are SUSPENDED
 *
 * Usage:
 * ```ts
 * import { visibleRetailerPriceWhere } from '@ironscout/db'
 *
 * const prices = await prisma.prices.findMany({
 *   where: {
 *     ...visibleRetailerPriceWhere(),
 *     // other conditions
 *   }
 * })
 * ```
 *
 * @returns Prisma.pricesWhereInput
 */
export function visibleRetailerPriceWhere() {
  return {
    retailers: {
      is: {
        // Policy-level visibility check (data quality, compliance, etc.)
        visibilityStatus: 'ELIGIBLE',
        // A1 semantics: visible if no ACTIVE relationships OR at least one ACTIVE+LISTED
        OR: [
          // Crawl-only visible: no ACTIVE relationships exist
          // This covers: no relationships at all, OR all relationships are SUSPENDED/INACTIVE
          { merchant_retailers: { none: { status: 'ACTIVE' } } },
          // Merchant-managed retailers: at least one ACTIVE + LISTED relationship
          {
            merchant_retailers: {
              some: {
                listingStatus: 'LISTED',
                status: 'ACTIVE',
              },
            },
          },
        ],
      },
    },
  }
}

/**
 * Prisma where clause for retailer visibility filtering directly on retailers.
 *
 * Same A1 semantics as visibleRetailerPriceWhere, but for queries on the
 * retailers table instead of prices.
 *
 * Usage:
 * ```ts
 * import { visibleRetailerWhere } from '@ironscout/db'
 *
 * const retailers = await prisma.retailers.findMany({
 *   where: visibleRetailerWhere()
 * })
 * ```
 *
 * @returns Prisma.retailersWhereInput
 */
export function visibleRetailerWhere() {
  return {
    visibilityStatus: 'ELIGIBLE',
    OR: [
      { merchant_retailers: { none: { status: 'ACTIVE' } } },
      {
        merchant_retailers: {
          some: {
            listingStatus: 'LISTED',
            status: 'ACTIVE',
          },
        },
      },
    ],
  }
}
