/**
 * Lens Eligibility Evaluator
 *
 * Evaluates eligibility rules against aggregated products.
 * Implements the Search Lens Specification v1.1.0.
 *
 * Key behaviors:
 * - Binary evaluation (pass/fail, no scoring)
 * - Null field = FALSE for comparison operators
 * - No type coercion - types must match exactly
 * - Case-sensitive string comparison
 * - IN/NOT_IN values must be arrays
 */

import type { EligibilityRule, EligibilityOperator, AggregatedProduct } from './types'

/**
 * Result of evaluating a single eligibility rule.
 */
export interface RuleEvaluationResult {
  /** Whether the rule passed */
  passed: boolean
  /** The rule that was evaluated */
  rule: EligibilityRule
  /** The field value that was checked */
  fieldValue: unknown
  /** Reason for failure (if failed) */
  failureReason?: string
}

/**
 * Result of evaluating all eligibility rules for a product.
 */
export interface EligibilityResult {
  /** Whether all rules passed */
  eligible: boolean
  /** Results for each rule */
  ruleResults: RuleEvaluationResult[]
  /** Summary of failure reasons */
  failureReasons: string[]
}

/**
 * Evaluate a single eligibility rule against a product.
 *
 * @param rule - The eligibility rule to evaluate
 * @param product - The aggregated product to check
 * @returns The evaluation result
 */
export function evaluateRule(
  rule: EligibilityRule,
  product: AggregatedProduct
): RuleEvaluationResult {
  const fieldValue = getFieldValue(product, rule.field)

  // Handle IS_NULL and IS_NOT_NULL operators
  if (rule.operator === 'IS_NULL') {
    const passed = fieldValue === null || fieldValue === undefined
    return {
      passed,
      rule,
      fieldValue,
      failureReason: passed ? undefined : `${rule.field} is not null`,
    }
  }

  if (rule.operator === 'IS_NOT_NULL') {
    const passed = fieldValue !== null && fieldValue !== undefined
    return {
      passed,
      rule,
      fieldValue,
      failureReason: passed ? undefined : `${rule.field} is null`,
    }
  }

  // For all other operators, null field = FALSE
  if (fieldValue === null || fieldValue === undefined) {
    return {
      passed: false,
      rule,
      fieldValue,
      failureReason: `${rule.field} is null`,
    }
  }

  // Evaluate based on operator
  switch (rule.operator) {
    case 'EQ':
      return evaluateEq(rule, fieldValue)
    case 'NOT_EQ':
      return evaluateNotEq(rule, fieldValue)
    case 'IN':
      return evaluateIn(rule, fieldValue)
    case 'NOT_IN':
      return evaluateNotIn(rule, fieldValue)
    case 'GTE':
      return evaluateGte(rule, fieldValue)
    case 'LTE':
      return evaluateLte(rule, fieldValue)
    default:
      // Unknown operator - fail closed
      return {
        passed: false,
        rule,
        fieldValue,
        failureReason: `Unknown operator: ${rule.operator}`,
      }
  }
}

/**
 * Evaluate EQ operator.
 * Strict equality check with no type coercion.
 */
function evaluateEq(rule: EligibilityRule, fieldValue: unknown): RuleEvaluationResult {
  // Type check - must match
  if (typeof fieldValue !== typeof rule.value) {
    return {
      passed: false,
      rule,
      fieldValue,
      failureReason: `Type mismatch: ${typeof fieldValue} !== ${typeof rule.value}`,
    }
  }

  const passed = fieldValue === rule.value
  return {
    passed,
    rule,
    fieldValue,
    failureReason: passed ? undefined : `${rule.field} !== ${rule.value}`,
  }
}

/**
 * Evaluate NOT_EQ operator.
 * Strict inequality check with no type coercion.
 */
function evaluateNotEq(rule: EligibilityRule, fieldValue: unknown): RuleEvaluationResult {
  // Type check - must match
  if (typeof fieldValue !== typeof rule.value) {
    return {
      passed: false,
      rule,
      fieldValue,
      failureReason: `Type mismatch: ${typeof fieldValue} !== ${typeof rule.value}`,
    }
  }

  const passed = fieldValue !== rule.value
  return {
    passed,
    rule,
    fieldValue,
    failureReason: passed ? undefined : `${rule.field} === ${rule.value}`,
  }
}

/**
 * Evaluate IN operator.
 * Value MUST be an array. Field value must be in the array.
 */
function evaluateIn(rule: EligibilityRule, fieldValue: unknown): RuleEvaluationResult {
  // Value must be an array
  if (!Array.isArray(rule.value)) {
    return {
      passed: false,
      rule,
      fieldValue,
      failureReason: `IN operator requires array value, got ${typeof rule.value}`,
    }
  }

  // Check if field value is in the array (strict equality)
  const passed = rule.value.some(v => v === fieldValue)
  return {
    passed,
    rule,
    fieldValue,
    failureReason: passed ? undefined : `${rule.field} not in [${rule.value.join(', ')}]`,
  }
}

/**
 * Evaluate NOT_IN operator.
 * Value MUST be an array. Field value must NOT be in the array.
 */
function evaluateNotIn(rule: EligibilityRule, fieldValue: unknown): RuleEvaluationResult {
  // Value must be an array
  if (!Array.isArray(rule.value)) {
    return {
      passed: false,
      rule,
      fieldValue,
      failureReason: `NOT_IN operator requires array value, got ${typeof rule.value}`,
    }
  }

  // Check if field value is NOT in the array (strict equality)
  const passed = !rule.value.some(v => v === fieldValue)
  return {
    passed,
    rule,
    fieldValue,
    failureReason: passed ? undefined : `${rule.field} in [${rule.value.join(', ')}]`,
  }
}

/**
 * Evaluate GTE operator.
 * Both values must be numbers. No type coercion.
 */
function evaluateGte(rule: EligibilityRule, fieldValue: unknown): RuleEvaluationResult {
  // Type check - must be numbers
  if (typeof fieldValue !== 'number' || typeof rule.value !== 'number') {
    return {
      passed: false,
      rule,
      fieldValue,
      failureReason: `GTE requires numbers: ${typeof fieldValue}, ${typeof rule.value}`,
    }
  }

  const passed = fieldValue >= rule.value
  return {
    passed,
    rule,
    fieldValue,
    failureReason: passed ? undefined : `${rule.field} (${fieldValue}) < ${rule.value}`,
  }
}

/**
 * Evaluate LTE operator.
 * Both values must be numbers. No type coercion.
 */
function evaluateLte(rule: EligibilityRule, fieldValue: unknown): RuleEvaluationResult {
  // Type check - must be numbers
  if (typeof fieldValue !== 'number' || typeof rule.value !== 'number') {
    return {
      passed: false,
      rule,
      fieldValue,
      failureReason: `LTE requires numbers: ${typeof fieldValue}, ${typeof rule.value}`,
    }
  }

  const passed = fieldValue <= rule.value
  return {
    passed,
    rule,
    fieldValue,
    failureReason: passed ? undefined : `${rule.field} (${fieldValue}) > ${rule.value}`,
  }
}

/**
 * Get a field value from an aggregated product.
 * Handles nested fields if needed.
 */
function getFieldValue(product: AggregatedProduct, field: string): unknown {
  // Direct field access on the aggregated product
  switch (field) {
    case 'productId':
      return product.productId
    case 'bulletType':
      return product.bulletType
    case 'grain':
      return product.grain
    case 'casing':
      return product.casing
    case 'packSize':
      return product.packSize
    case 'canonicalConfidence':
      return product.canonicalConfidence
    case 'price':
      return product.price
    case 'pricePerRound':
      return product.pricePerRound
    case 'availability':
      return product.availability
    default:
      // Unknown field - return undefined (will cause null check to fail)
      return undefined
  }
}

/**
 * Evaluate all eligibility rules for a product.
 * ALL rules must pass for the product to be eligible.
 *
 * @param rules - The eligibility rules to evaluate
 * @param product - The aggregated product to check
 * @returns The combined eligibility result
 */
export function evaluateEligibility(
  rules: EligibilityRule[],
  product: AggregatedProduct
): EligibilityResult {
  // Empty rules = everything passes
  if (rules.length === 0) {
    return {
      eligible: true,
      ruleResults: [],
      failureReasons: [],
    }
  }

  const ruleResults = rules.map(rule => evaluateRule(rule, product))
  const eligible = ruleResults.every(r => r.passed)
  const failureReasons = ruleResults
    .filter(r => !r.passed && r.failureReason)
    .map(r => r.failureReason!)

  return {
    eligible,
    ruleResults,
    failureReasons,
  }
}

/**
 * Apply eligibility filter to a list of products.
 * Returns only products that pass all eligibility rules.
 *
 * @param products - The products to filter
 * @param rules - The eligibility rules to apply
 * @returns Filtered products with eligibility results
 */
export function applyEligibility(
  products: AggregatedProduct[],
  rules: EligibilityRule[]
): {
  eligible: AggregatedProduct[]
  filtered: AggregatedProduct[]
  filterReasons: Map<string, string[]>
} {
  const eligible: AggregatedProduct[] = []
  const filtered: AggregatedProduct[] = []
  const filterReasons = new Map<string, string[]>()

  for (const product of products) {
    const result = evaluateEligibility(rules, product)
    if (result.eligible) {
      eligible.push(product)
    } else {
      filtered.push(product)
      filterReasons.set(product.productId, result.failureReasons)
    }
  }

  return { eligible, filtered, filterReasons }
}

/**
 * Count products filtered by each unique reason.
 * Used for telemetry.
 */
export function countFilterReasons(
  filterReasons: Map<string, string[]>
): Record<string, number> {
  const counts: Record<string, number> = {}

  for (const reasons of filterReasons.values()) {
    for (const reason of reasons) {
      // Extract the key part of the reason (e.g., "bulletType not in [FMJ]" -> "bulletType_NOT_IN")
      const key = normalizeReasonKey(reason)
      counts[key] = (counts[key] || 0) + 1
    }
  }

  return counts
}

/**
 * Normalize a failure reason to a telemetry-friendly key.
 */
function normalizeReasonKey(reason: string): string {
  // Common patterns to normalize
  if (reason.includes('not in')) return 'NOT_IN_MISMATCH'
  if (reason.includes(' in ')) return 'IN_MISMATCH'
  if (reason.includes('is null')) return 'NULL_FIELD'
  if (reason.includes('Type mismatch')) return 'TYPE_MISMATCH'
  if (reason.includes('Unknown operator')) return 'UNKNOWN_OPERATOR'
  if (reason.includes('<')) return 'GTE_MISMATCH'
  if (reason.includes('>')) return 'LTE_MISMATCH'
  if (reason.includes('!==')) return 'EQ_MISMATCH'
  if (reason.includes('===')) return 'NOT_EQ_MISMATCH'
  return 'UNKNOWN'
}
