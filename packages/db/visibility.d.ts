import type { Prisma } from './generated/prisma/client.js'

/**
 * Prisma where clause for retailer visibility filtering on prices.
 *
 * Implements A1 semantics per Merchant-and-Retailer-Reference:
 * - ELIGIBLE + no ACTIVE relationships → Visible (crawl-only)
 * - ELIGIBLE + ACTIVE + LISTED → Visible (merchant-managed)
 * - ELIGIBLE + ACTIVE + UNLISTED → Hidden (delinquency)
 * - INELIGIBLE → Hidden
 */
export declare function visibleRetailerPriceWhere(): Prisma.pricesWhereInput

/**
 * Prisma where clause for retailer visibility filtering directly on retailers.
 *
 * Same A1 semantics as visibleRetailerPriceWhere, but for queries on the
 * retailers table instead of prices.
 */
export declare function visibleRetailerWhere(): Prisma.retailersWhereInput
