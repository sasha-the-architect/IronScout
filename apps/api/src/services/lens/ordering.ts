/**
 * Lens Ordering
 *
 * Applies deterministic ordering rules to aggregated products.
 * Implements the Search Lens Specification v1.1.0.
 *
 * Key behaviors:
 * - Nulls sort LAST regardless of direction
 * - Final tie-breaker is always productId ASC
 * - No embedding scores allowed
 * - Deterministic ordering guaranteed
 */

import type { OrderingRule, AggregatedProduct, Availability } from './types'
import { getAvailabilityRank } from './types'

/**
 * The final tie-breaker rule, always appended.
 * Guarantees deterministic ordering across all runs.
 */
const TIE_BREAKER_RULE: OrderingRule = {
  field: 'productId',
  direction: 'ASC',
}

/**
 * Get the sort value for a field, handling null transformation.
 *
 * Null behavior per spec:
 * - price: Infinity (last in ASC)
 * - pricePerRound: Infinity (last in ASC)
 * - availability: OUT_OF_STOCK rank (last in DESC)
 * - canonicalConfidence: 0.0 (last in DESC)
 *
 * @param product - The product to get the value from
 * @param field - The field name
 * @returns A normalized value safe for comparison
 */
function getSortValue(product: AggregatedProduct, field: string): string | number {
  switch (field) {
    case 'productId':
      return product.productId

    case 'price': {
      // Null → Infinity (sorts last in ASC)
      if (product.price === null || product.price === undefined) {
        return Infinity
      }
      return product.price
    }

    case 'pricePerRound': {
      // Null → Infinity (sorts last in ASC)
      if (product.pricePerRound === null || product.pricePerRound === undefined) {
        return Infinity
      }
      return product.pricePerRound
    }

    case 'availability': {
      // Convert to rank for numeric comparison
      // Higher rank = better availability, so DESC works naturally
      return getAvailabilityRank(product.availability)
    }

    case 'canonicalConfidence': {
      // Null → 0.0 (sorts last in DESC)
      if (product.canonicalConfidence === null || product.canonicalConfidence === undefined) {
        return 0
      }
      return product.canonicalConfidence
    }

    case 'grain': {
      // Null → Infinity for ASC, -Infinity for DESC
      // We use Infinity as default to push nulls last in ASC
      if (product.grain === null || product.grain === undefined) {
        return Infinity
      }
      return product.grain
    }

    case 'packSize': {
      if (product.packSize === null || product.packSize === undefined) {
        return Infinity
      }
      return product.packSize
    }

    case 'bulletType': {
      // String fields - empty string for null (sorts first in ASC)
      // But we want nulls LAST, so use a high Unicode value
      if (product.bulletType === null || product.bulletType === undefined) {
        return '\uFFFF'  // Sorts after all normal characters
      }
      return product.bulletType
    }

    case 'casing': {
      if (product.casing === null || product.casing === undefined) {
        return '\uFFFF'
      }
      return product.casing
    }

    default:
      // Unknown field - return empty string
      return ''
  }
}

/**
 * Check if a value represents a null sentinel.
 * Used to implement nulls-last regardless of direction.
 */
function isNullSentinel(value: string | number): boolean {
  if (typeof value === 'number') {
    return value === Infinity || value === -Infinity
  }
  return value === '\uFFFF'
}

/**
 * Compare two values with nulls-last semantics.
 *
 * @param a - First value
 * @param b - Second value
 * @param direction - Sort direction
 * @returns Comparison result (-1, 0, or 1)
 */
function compareWithNullsLast(
  a: string | number,
  b: string | number,
  direction: 'ASC' | 'DESC'
): number {
  const aIsNull = isNullSentinel(a)
  const bIsNull = isNullSentinel(b)

  // Nulls always sort LAST regardless of direction
  if (aIsNull && bIsNull) return 0
  if (aIsNull) return 1   // a is null, goes after b
  if (bIsNull) return -1  // b is null, goes after a

  // Standard comparison
  if (typeof a === 'number' && typeof b === 'number') {
    const diff = a - b
    return direction === 'ASC' ? Math.sign(diff) : -Math.sign(diff)
  }

  // String comparison
  const strA = String(a)
  const strB = String(b)
  const cmp = strA.localeCompare(strB)
  return direction === 'ASC' ? cmp : -cmp
}

/**
 * Create a comparator function from ordering rules.
 * Applies rules in sequence until a non-zero comparison is found.
 * Always appends productId ASC as the final tie-breaker.
 *
 * @param rules - The ordering rules (without tie-breaker)
 * @returns A comparator function for Array.sort()
 */
export function createComparator(rules: OrderingRule[]): (a: AggregatedProduct, b: AggregatedProduct) => number {
  // Add tie-breaker to the end
  const allRules = [...rules, TIE_BREAKER_RULE]

  return (a: AggregatedProduct, b: AggregatedProduct): number => {
    for (const rule of allRules) {
      const aVal = getSortValue(a, rule.field)
      const bVal = getSortValue(b, rule.field)

      const cmp = compareWithNullsLast(aVal, bVal, rule.direction)
      if (cmp !== 0) {
        return cmp
      }
    }

    // All rules resulted in equality
    return 0
  }
}

/**
 * Apply ordering rules to a list of products.
 * Returns a new sorted array (does not mutate input).
 *
 * @param products - The products to sort
 * @param rules - The ordering rules to apply
 * @returns Sorted products
 */
export function applyOrdering(
  products: AggregatedProduct[],
  rules: OrderingRule[]
): AggregatedProduct[] {
  if (products.length <= 1) {
    return [...products]
  }

  const comparator = createComparator(rules)
  return [...products].sort(comparator)
}

/**
 * Extract sort keys for a product (used for telemetry).
 * Returns a record of field -> value for all ordering fields.
 *
 * @param product - The product
 * @param rules - The ordering rules
 * @returns Sort keys record
 */
export function extractSortKeys(
  product: AggregatedProduct,
  rules: OrderingRule[]
): Record<string, unknown> {
  const allRules = [...rules, TIE_BREAKER_RULE]
  const sortKeys: Record<string, unknown> = {}

  for (const rule of allRules) {
    // Use raw values for telemetry (not sentinel values)
    switch (rule.field) {
      case 'productId':
        sortKeys.tie = product.productId
        break
      case 'price':
        sortKeys.price = product.price
        break
      case 'pricePerRound':
        sortKeys.ppr = product.pricePerRound !== null
          ? Math.round(product.pricePerRound * 10000) / 10000
          : null
        break
      case 'availability':
        sortKeys.avail = getAvailabilityRank(product.availability)
        break
      case 'canonicalConfidence':
        sortKeys.conf = product.canonicalConfidence
        break
      default:
        sortKeys[rule.field] = getSortValue(product, rule.field)
    }
  }

  return sortKeys
}

/**
 * Verify that ordering is deterministic.
 * Run the same sort multiple times and compare results.
 * Used for testing only.
 *
 * @param products - Products to sort
 * @param rules - Ordering rules
 * @param iterations - Number of times to sort
 * @returns True if all iterations produce identical results
 */
export function verifyDeterminism(
  products: AggregatedProduct[],
  rules: OrderingRule[],
  iterations: number = 10
): boolean {
  if (products.length === 0) return true

  const firstResult = applyOrdering(products, rules)
  const firstIds = firstResult.map(p => p.productId).join(',')

  for (let i = 1; i < iterations; i++) {
    const result = applyOrdering(products, rules)
    const ids = result.map(p => p.productId).join(',')
    if (ids !== firstIds) {
      return false
    }
  }

  return true
}
