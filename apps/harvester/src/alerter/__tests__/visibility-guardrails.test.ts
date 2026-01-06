/**
 * Alerter Visibility Guardrail Tests
 *
 * These tests enforce that:
 * 1. The alerter imports the shared visibility predicate from @ironscout/db
 * 2. The shared predicate implements A1 semantics
 *
 * A1 semantics:
 * - ACTIVE relationships control visibility
 * - No ACTIVE relationships means crawl-only fallback (alerts SHOULD fire)
 * - Visibility requires ELIGIBLE + (no ACTIVE OR at least one ACTIVE+LISTED)
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const ALERTER_PATH = path.resolve(__dirname, '../index.ts').replace(/\\/g, '/')
// Navigate up to monorepo root, then into packages/db
// From: apps/harvester/src/alerter/__tests__ (5 levels to root)
// __tests__ -> alerter -> src -> harvester -> apps -> IronScout (root)
const SHARED_VISIBILITY_PATH = path.resolve(__dirname, '../../../../..', 'packages/db/visibility.js').replace(/\\/g, '/')

describe('Alerter Visibility Guardrails', () => {
  let alerterSource: string
  let sharedVisibilitySource: string

  beforeAll(() => {
    alerterSource = fs.readFileSync(ALERTER_PATH, 'utf-8')
    sharedVisibilitySource = fs.readFileSync(SHARED_VISIBILITY_PATH, 'utf-8')
  })

  /**
   * CRITICAL GUARDRAIL: Alerter must use shared predicate
   *
   * This prevents drift between apps/api and apps/harvester visibility logic.
   */
  it('alerter_imports_shared_visibility_predicate', () => {
    // The alerter MUST import from @ironscout/db/visibility.js
    expect(alerterSource).toContain('visibleRetailerPriceWhere')
    expect(alerterSource).toContain("from '@ironscout/db/visibility.js'")
  })

  /**
   * CRITICAL GUARDRAIL: A1 Semantics in shared package
   *
   * The shared predicate MUST use `{ none: { status: 'ACTIVE' } }` NOT `{ none: {} }`
   *
   * Why this matters:
   * - `{ none: {} }` = "no relationships at all" → all-SUSPENDED retailers are HIDDEN
   * - `{ none: { status: 'ACTIVE' } }` = "no ACTIVE relationships" → all-SUSPENDED retailers are VISIBLE
   *
   * Per A1 policy: all-SUSPENDED should be crawl-only visible, so alerts SHOULD fire.
   */
  it('alerts_fire_when_no_active_merchant_relationships', () => {
    // This test name IS the invariant. If you need to change this, update the ADR first.

    // The shared predicate must use A1 semantics
    expect(sharedVisibilitySource).toContain("{ merchant_retailers: { none: { status: 'ACTIVE' } } }")

    // It must NOT use the old A2 semantics
    expect(sharedVisibilitySource).not.toMatch(/merchant_retailers:\s*\{\s*none:\s*\{\s*\}\s*\}/)
  })

  it('shared_predicate_documents_A1_semantics', () => {
    expect(sharedVisibilitySource).toContain('A1')
  })

  it('shared_predicate_checks_visibilityStatus_ELIGIBLE', () => {
    expect(sharedVisibilitySource).toContain("visibilityStatus: 'ELIGIBLE'")
  })

  it('shared_predicate_checks_ACTIVE_LISTED_in_OR_clause', () => {
    // The second OR condition must require both ACTIVE and LISTED
    expect(sharedVisibilitySource).toContain("listingStatus: 'LISTED'")
    expect(sharedVisibilitySource).toContain("status: 'ACTIVE'")
  })
})
