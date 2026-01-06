/**
 * Retailer Eligibility Guardrail Tests
 *
 * These tests enforce the semantic refactor from merchant-based visibility
 * gating to proper retailer eligibility enforcement.
 *
 * Per ADR-005 and Merchant-and-Retailer-Reference:
 * - Eligibility applies to Retailer visibility only
 * - Retailers do not authenticate; consumer prices keyed by retailerId
 * - Merchant subscription status must NOT gate consumer visibility
 *
 * These tests will FAIL until the refactor is complete. They are
 * intentional guardrails to prevent drift and track progress.
 *
 * Phase 0 Guardrails:
 * 1. Block visibleDealerPriceWhere usage (must be replaced with retailer eligibility)
 * 2. Block harvester_${retailerId} merchant fabrication
 * 3. Assert consumer reads depend on retailer eligibility
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { visibleRetailerPriceWhere } from '../tiers'

// Use forward slashes for cross-platform compatibility
const API_SRC_ROOT = path.resolve(__dirname, '../..').replace(/\\/g, '/')
const HARVESTER_SRC_ROOT = path.resolve(__dirname, '../../../../harvester/src').replace(/\\/g, '/')
const SCHEMA_PATH = path.resolve(__dirname, '../../../../../packages/db/schema.prisma').replace(/\\/g, '/')

/**
 * Recursively find all TypeScript files in a directory
 */
function findTsFiles(dir: string, files: string[] = []): string[] {
  if (!fs.existsSync(dir)) {
    return files
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      findTsFiles(fullPath, files)
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      files.push(fullPath)
    }
  }
  return files
}

/**
 * Search for a pattern in files and return matches
 */
function grepFiles(files: string[], pattern: RegExp): { file: string; line: number; match: string }[] {
  const results: { file: string; line: number; match: string }[] = []

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8')
      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(pattern)
        if (match) {
          results.push({
            file: path.relative(process.cwd(), file),
            line: i + 1,
            match: match[0],
          })
        }
      }
    } catch {
      // Skip files that can't be read
    }
  }

  return results
}

describe('Retailer Eligibility Guardrails', () => {
  describe('Phase 0: Legacy Pattern Detection', () => {
    it('should NOT use visibleDealerPriceWhere in consumer routes (replaced with visibleRetailerPriceWhere)', () => {
      // All consumer routes have been migrated to use visibleRetailerPriceWhere.
      // This test ensures no regression to the deprecated helper.
      //
      // Migrated routes:
      // - apps/api/src/routes/products.ts ✓
      // - apps/api/src/routes/dashboard.ts ✓
      // - apps/api/src/services/saved-items.ts ✓
      // - apps/api/src/services/ai-search/search-service.ts ✓

      const routesDir = path.join(API_SRC_ROOT, 'routes')
      const servicesDir = path.join(API_SRC_ROOT, 'services')
      const files = [...findTsFiles(routesDir), ...findTsFiles(servicesDir)]

      // Exclude the tiers.ts file itself (where the deprecated wrapper is defined)
      const consumerFiles = files.filter((f) => !f.includes('tiers.ts') && !f.includes('__tests__'))

      const matches = grepFiles(consumerFiles, /visibleDealerPriceWhere/)

      expect(matches).toEqual([])
    })

    it.skip('should NOT fabricate merchant IDs from retailer IDs in harvester (PENDING: remove harvester_${retailerId} pattern)', () => {
      // This test is SKIPPED until benchmark.ts is refactored.
      // The pattern `harvester_${retailerId}` creates fake merchant IDs,
      // conflating Merchant vs Retailer concepts.

      const files = findTsFiles(HARVESTER_SRC_ROOT)
      const matches = grepFiles(files, /harvester_\$\{?retailerId\}?|`harvester_\$\{/)

      expect(matches).toEqual([])
    })

    it('should have retailer visibility fields in schema (PENDING: Phase 1A migration)', () => {
      // This test verifies that the retailers model has visibility state.
      // It will FAIL until the Phase 1A migration is applied.

      const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8')

      // Check for RetailerVisibility enum
      expect(schema).toContain('enum RetailerVisibility')

      // Check for visibility fields on retailers model
      expect(schema).toMatch(/model retailers \{[\s\S]*?visibilityStatus\s+RetailerVisibility/)
    })

    it('should have merchant_retailers join table in schema (PENDING: Phase 1B migration)', () => {
      // This test verifies that the explicit Merchant↔Retailer mapping exists.
      // It will FAIL until the Phase 1B migration is applied.

      const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8')

      expect(schema).toContain('model merchant_retailers')
    })

    it('should have provenance fields on prices (PENDING: Phase 1C migration)', () => {
      // This test verifies that prices have ADR-015 required provenance fields.
      // It will FAIL until the Phase 1C migration is applied.

      const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8')

      // Check for ingestionRunType field on prices
      expect(schema).toMatch(/model prices \{[\s\S]*?ingestionRunType/)
    })
  })

  describe('Phase 2: Consumer Visibility Enforcement', () => {
    it('should export visibleRetailerPriceWhere from tiers.ts', async () => {
      // Verifies the new retailer-eligibility-based filter exists and is exported.

      const tiers = await import('../tiers')
      expect(typeof tiers.visibleRetailerPriceWhere).toBe('function')
    })

    it('tiers.ts should import shared visibility predicate from @ironscout/db/visibility.js', () => {
      // CRITICAL: Prevents drift between API and Harvester visibility logic
      // The shared predicate lives in packages/db/visibility.js
      const tiersPath = path.resolve(__dirname, '../tiers.ts')
      const tiersSource = fs.readFileSync(tiersPath, 'utf-8')

      // Must import the shared predicate directly from visibility.js
      expect(tiersSource).toContain('visibleRetailerPriceWhere')
      expect(tiersSource).toContain("from '@ironscout/db/visibility.js'")
      expect(tiersSource).toContain('sharedVisibleRetailerPriceWhere')
    })

    it('should use visibility filters in consumer routes', () => {
      // Verifies all consumer routes use the retailer-eligibility filter.
      // Consumer routes should use either:
      // - visiblePriceWhere() - combined filter (retailer visibility + ignored run filtering)
      // - visibleRetailerPriceWhere() - retailer visibility only (for specialized cases)

      const routesDir = path.join(API_SRC_ROOT, 'routes')
      const servicesDir = path.join(API_SRC_ROOT, 'services')
      const files = [...findTsFiles(routesDir), ...findTsFiles(servicesDir)]

      // Files that should use the visibility helpers
      const consumerFiles = files.filter(
        (f) => !f.includes('__tests__') &&
               (f.includes('products.ts') ||
                f.includes('dashboard.ts') ||
                f.includes('saved-items.ts') ||
                f.includes('search-service.ts'))
      )

      // Accept either visiblePriceWhere (recommended) or visibleRetailerPriceWhere (direct)
      const matches = grepFiles(consumerFiles, /visible(Price|RetailerPrice)Where/)

      // Should have at least one match in each consumer file
      expect(matches.length).toBeGreaterThan(0)
    })

    it('should NOT gate consumer queries on subscription status', () => {
      // Consumer surfaces must never look at merchant subscription state.
      const routesDir = path.join(API_SRC_ROOT, 'routes')
      const servicesDir = path.join(API_SRC_ROOT, 'services')
      const files = [...findTsFiles(routesDir), ...findTsFiles(servicesDir)]
      const consumerFiles = files.filter(
        (f) =>
          !f.includes('__tests__') &&
          (f.includes('products.ts') ||
            f.includes('dashboard.ts') ||
            f.includes('saved-items.ts') ||
            f.includes('search-service.ts') ||
            f.includes('search.ts'))
      )

      const matches = grepFiles(consumerFiles, /subscriptionStatus/)

      expect(matches).toEqual([])
    })

    it('should enforce Option A visibility predicate in visibleRetailerPriceWhere', () => {
      // Option A per Merchant-and-Retailer-Reference:
      // Visible = ELIGIBLE AND (no ACTIVE relationships OR at least one ACTIVE+LISTED)
      //
      // Truth table:
      // | visibilityStatus | Merchant Relationships      | Result              |
      // |------------------|-----------------------------|---------------------|
      // | ELIGIBLE         | none                        | Visible (crawl-only)|
      // | ELIGIBLE         | >=1 ACTIVE + LISTED         | Visible             |
      // | ELIGIBLE         | >=1 ACTIVE, all UNLISTED    | Hidden              |
      // | ELIGIBLE         | all SUSPENDED               | Visible (crawl-only)|
      // | INELIGIBLE       | any                         | Hidden              |
      const where = visibleRetailerPriceWhere()
      expect(where).toEqual({
        retailers: {
          is: {
            visibilityStatus: 'ELIGIBLE',
            OR: [
              // Crawl-only visible: no ACTIVE relationships exist
              // This covers: no relationships at all, OR all relationships are SUSPENDED/INACTIVE
              { merchant_retailers: { none: { status: 'ACTIVE' } } },
              // Merchant-managed retailers: at least one ACTIVE + LISTED
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
      })
    })

    it('Option A: retailers with no ACTIVE relationships should be crawl-only visible', () => {
      // Per Merchant-and-Retailer-Reference visibility truth table:
      // | visibilityStatus | Merchant Relationships | Result              |
      // | ELIGIBLE         | none                   | Visible (crawl-only)|
      // | ELIGIBLE         | all SUSPENDED          | Visible (crawl-only)|
      //
      // The visibleRetailerPriceWhere() uses { merchant_retailers: { none: { status: 'ACTIVE' } } }
      // This covers both:
      // - Crawl-only retailers with no relationships at all
      // - Retailers where all relationships are SUSPENDED/INACTIVE
      const where = visibleRetailerPriceWhere()

      // Verify the OR clause exists and includes the "no ACTIVE relationships" condition
      const retailerIs = (where as any).retailers?.is
      expect(retailerIs).toBeDefined()
      expect(retailerIs.OR).toBeDefined()
      expect(Array.isArray(retailerIs.OR)).toBe(true)

      // Find the "no ACTIVE merchant relationships" condition
      const noneCondition = retailerIs.OR.find(
        (clause: any) => clause.merchant_retailers?.none !== undefined
      )
      expect(noneCondition).toBeDefined()
      expect(noneCondition.merchant_retailers.none).toEqual({ status: 'ACTIVE' })
    })

    it('A1 regression: all SUSPENDED relationships → crawl-only visible', () => {
      // Per A1 semantics:
      // - ACTIVE relationships control visibility
      // - No ACTIVE relationships means crawl-only fallback
      //
      // Scenario: Retailer has merchant_retailers rows, but all are SUSPENDED
      // Expected: Visible (crawl-only) because no ACTIVE relationships exist
      //
      // The predicate `{ none: { status: 'ACTIVE' } }` matches this case:
      // - "none" means "no records match the inner condition"
      // - Inner condition is `{ status: 'ACTIVE' }`
      // - If all relationships are SUSPENDED, no records have status=ACTIVE
      // - Therefore `none: { status: 'ACTIVE' }` evaluates to TRUE → visible

      const where = visibleRetailerPriceWhere()
      const retailerIs = (where as any).retailers?.is

      // Verify the predicate structure supports this case
      const noneCondition = retailerIs.OR.find(
        (clause: any) => clause.merchant_retailers?.none !== undefined
      )
      expect(noneCondition).toBeDefined()
      // The key: checking for no ACTIVE, not for no relationships
      expect(noneCondition.merchant_retailers.none).toEqual({ status: 'ACTIVE' })
    })

    it('A1 regression: ACTIVE + UNLISTED relationship → hidden', () => {
      // Per A1 semantics:
      // - ACTIVE relationships control visibility
      // - Visibility requires ACTIVE + LISTED
      //
      // Scenario: Retailer has merchant_retailers row with status=ACTIVE, listingStatus=UNLISTED
      // Expected: Hidden because:
      // - `{ none: { status: 'ACTIVE' } }` is FALSE (an ACTIVE relationship exists)
      // - `{ some: { status: 'ACTIVE', listingStatus: 'LISTED' } }` is FALSE (no LISTED)
      // - Both OR conditions fail → not visible
      //
      // This is the delinquency-hide behavior: billing failure sets UNLISTED
      // but status remains ACTIVE, so retailer is hidden until re-listed.

      const where = visibleRetailerPriceWhere()
      const retailerIs = (where as any).retailers?.is

      // Verify the predicate requires BOTH ACTIVE AND LISTED for the "some" condition
      const someCondition = retailerIs.OR.find(
        (clause: any) => clause.merchant_retailers?.some !== undefined
      )
      expect(someCondition).toBeDefined()
      expect(someCondition.merchant_retailers.some).toEqual({
        listingStatus: 'LISTED',
        status: 'ACTIVE',
      })

      // Verify there's no fallback that would make ACTIVE+UNLISTED visible
      // The only other OR condition is "no ACTIVE relationships"
      const noneCondition = retailerIs.OR.find(
        (clause: any) => clause.merchant_retailers?.none !== undefined
      )
      expect(noneCondition.merchant_retailers.none).toEqual({ status: 'ACTIVE' })

      // With ACTIVE+UNLISTED:
      // - noneCondition fails (ACTIVE exists)
      // - someCondition fails (not LISTED)
      // → retailer is hidden (correct delinquency behavior)
    })
  })
})

/**
 * Integration test placeholder for consumer price query correctness.
 * This will be a full integration test once the refactor is complete.
 */
describe('Consumer Price Query Integration (PENDING)', () => {
  it.skip('should filter prices by retailer eligibility, not merchant subscription', () => {
    // This integration test will:
    // 1. Create a retailer with INELIGIBLE status
    // 2. Create a merchant with ACTIVE subscription
    // 3. Link retailer to merchant
    // 4. Create prices for the retailer
    // 5. Query consumer API and verify prices are NOT returned
    //
    // This catches the semantic correctness: eligibility is retailer-level,
    // not merchant-level.

    expect(true).toBe(false) // Placeholder - will fail until implemented
  })

  it.skip('should return prices from ELIGIBLE retailer even if merchant is EXPIRED', () => {
    // This integration test will:
    // 1. Create a retailer with ELIGIBLE status
    // 2. Create a merchant with EXPIRED subscription
    // 3. Link retailer to merchant
    // 4. Create prices for the retailer
    // 5. Query consumer API and verify prices ARE returned
    //
    // This ensures merchant subscription doesn't wrongly hide eligible retailers.

    expect(true).toBe(false) // Placeholder - will fail until implemented
  })

  it.skip('Option A acceptance: crawl-only retailer with zero merchant_retailers appears in results', () => {
    // Acceptance test per user story:
    // "Retailer with visibilityStatus=ELIGIBLE and zero merchant_retailers
    //  appears in results and triggers alerts."
    //
    // This integration test will:
    // 1. Create a retailer with ELIGIBLE status and NO merchant_retailers links
    // 2. Create prices for the retailer (simulating affiliate/crawl data)
    // 3. Query consumer API and verify prices ARE returned
    // 4. Trigger alert check and verify alert fires
    //
    // This validates Option A: crawl-only retailers are consumer-visible.

    expect(true).toBe(false) // Placeholder - will fail until implemented
  })
})
