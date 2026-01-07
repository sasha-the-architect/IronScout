/**
 * A1 Visibility Predicate Integration Tests
 *
 * These tests verify that the alerter's visibility predicate correctly
 * implements A1 semantics by testing against a real database.
 *
 * A1 Semantics (per Merchant-and-Retailer-Reference):
 * - ELIGIBLE + no merchant_retailers → Visible (crawl-only)
 * - ELIGIBLE + all SUSPENDED relationships → Visible (crawl-only)
 * - ELIGIBLE + ACTIVE + UNLISTED → Hidden (delinquency)
 * - ELIGIBLE + ACTIVE + LISTED → Visible (merchant-managed)
 *
 * Test cases:
 * 1. Retailer has 0 merchant_retailers → alert fires
 * 2. Retailer has only SUSPENDED relationships → alert fires
 * 3. Retailer has at least one ACTIVE+UNLISTED → alert does NOT fire
 *
 * To run: pnpm --filter harvester test:integration
 * Requires: TEST_DATABASE_URL environment variable
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { PrismaClient } from '@ironscout/db/generated/prisma'

// Skip if no test database configured
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const describeIntegration = TEST_DATABASE_URL ? describe : describe.skip

let prisma: PrismaClient

/**
 * Import the shared visibility predicate dynamically to avoid
 * triggering Prisma client creation when tests are skipped.
 */
let visibleRetailerPriceWhere: () => any

describeIntegration('A1 Visibility Predicate Integration', () => {
  // Track created entities for cleanup
  let createdRetailerIds: string[] = []
  let createdMerchantIds: string[] = []
  let createdProductIds: string[] = []
  let createdPriceIds: string[] = []

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) {
      throw new Error('TEST_DATABASE_URL required for integration tests')
    }
    prisma = new PrismaClient()
    await prisma.$connect()

    // Dynamically import the shared visibility predicate
    // This avoids triggering Prisma client creation when DATABASE_URL is not set
    const db = await import('@ironscout/db')
    visibleRetailerPriceWhere = db.visibleRetailerPriceWhere
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  afterEach(async () => {
    // Clean up in reverse order of dependencies
    if (createdPriceIds.length > 0) {
      await prisma.prices.deleteMany({ where: { id: { in: createdPriceIds } } })
      createdPriceIds = []
    }
    // Delete merchant_retailers (implicit via cascade, but explicit is safer)
    if (createdMerchantIds.length > 0 && createdRetailerIds.length > 0) {
      await prisma.merchant_retailers.deleteMany({
        where: {
          merchantId: { in: createdMerchantIds },
          retailerId: { in: createdRetailerIds },
        },
      })
    }
    if (createdRetailerIds.length > 0) {
      await prisma.retailers.deleteMany({ where: { id: { in: createdRetailerIds } } })
      createdRetailerIds = []
    }
    if (createdMerchantIds.length > 0) {
      await prisma.merchants.deleteMany({ where: { id: { in: createdMerchantIds } } })
      createdMerchantIds = []
    }
    if (createdProductIds.length > 0) {
      await prisma.products.deleteMany({ where: { id: { in: createdProductIds } } })
      createdProductIds = []
    }
  })

  /**
   * Helper: Create a test retailer with ELIGIBLE visibility status
   */
  async function createEligibleRetailer(suffix: string) {
    const retailer = await prisma.retailers.create({
      data: {
        name: `Test Retailer A1 ${suffix} ${Date.now()}`,
        website: `https://test-a1-${suffix}-${Date.now()}.example.com`,
        visibilityStatus: 'ELIGIBLE',
      },
    })
    createdRetailerIds.push(retailer.id)
    return retailer
  }

  /**
   * Helper: Create a test merchant
   */
  async function createMerchant(suffix: string) {
    const merchant = await prisma.merchants.create({
      data: {
        businessName: `Test Merchant A1 ${suffix}`,
        websiteUrl: `https://test-a1-${suffix}.example.com`,
        contactFirstName: 'Test',
        contactLastName: 'User',
        subscriptionStatus: 'ACTIVE',
      },
    })
    createdMerchantIds.push(merchant.id)
    return merchant
  }

  /**
   * Helper: Create a test product
   */
  async function createProduct(suffix: string) {
    const product = await prisma.products.create({
      data: {
        name: `Test Product A1 ${suffix} ${Date.now()}`,
        category: 'ammunition',
      },
    })
    createdProductIds.push(product.id)
    return product
  }

  /**
   * Helper: Create a price linking product to retailer
   */
  async function createPrice(productId: string, retailerId: string) {
    const price = await prisma.prices.create({
      data: {
        productId,
        retailerId,
        price: 19.99,
        currency: 'USD',
        url: `https://test.example.com/product-${Date.now()}`,
        inStock: true,
      },
    })
    createdPriceIds.push(price.id)
    return price
  }

  /**
   * Helper: Query for visible prices using the shared A1 predicate
   */
  async function hasVisiblePrice(productId: string): Promise<boolean> {
    const price = await prisma.prices.findFirst({
      where: {
        productId,
        ...visibleRetailerPriceWhere(),
      },
      select: { id: true },
    })
    return price !== null
  }

  // ============================================================================
  // TEST CASE 1: Retailer has 0 merchant_retailers rows → alert fires
  // ============================================================================
  it('alert_fires_when_retailer_has_zero_merchant_retailers', async () => {
    // Setup: ELIGIBLE retailer with NO merchant_retailers
    const retailer = await createEligibleRetailer('zero-mr')
    const product = await createProduct('zero-mr')
    await createPrice(product.id, retailer.id)

    // Verify: no merchant_retailers exist
    const mrCount = await prisma.merchant_retailers.count({
      where: { retailerId: retailer.id },
    })
    expect(mrCount).toBe(0)

    // Assert: price IS visible (alert should fire)
    const isVisible = await hasVisiblePrice(product.id)
    expect(isVisible).toBe(true)
  })

  // ============================================================================
  // TEST CASE 2: Retailer has only SUSPENDED relationships → alert fires
  // ============================================================================
  it('alert_fires_when_retailer_has_only_suspended_relationships', async () => {
    // Setup: ELIGIBLE retailer with ONLY SUSPENDED merchant_retailers
    const retailer = await createEligibleRetailer('suspended')
    const merchant = await createMerchant('suspended')
    const product = await createProduct('suspended')
    await createPrice(product.id, retailer.id)

    // Create SUSPENDED relationship
    await prisma.merchant_retailers.create({
      data: {
        merchantId: merchant.id,
        retailerId: retailer.id,
        status: 'SUSPENDED',
        listingStatus: 'LISTED', // Doesn't matter when SUSPENDED
      },
    })

    // Verify: relationship exists and is SUSPENDED
    const mr = await prisma.merchant_retailers.findFirst({
      where: { retailerId: retailer.id },
    })
    expect(mr).toBeTruthy()
    expect(mr?.status).toBe('SUSPENDED')

    // Assert: price IS visible (alert should fire)
    // Per A1: "no ACTIVE relationships" means crawl-only visible
    const isVisible = await hasVisiblePrice(product.id)
    expect(isVisible).toBe(true)
  })

  // ============================================================================
  // TEST CASE 3: Retailer has ACTIVE+UNLISTED relationship → alert does NOT fire
  // ============================================================================
  it('alert_does_not_fire_when_retailer_has_active_unlisted_relationship', async () => {
    // Setup: ELIGIBLE retailer with ACTIVE but UNLISTED merchant_retailers
    const retailer = await createEligibleRetailer('active-unlisted')
    const merchant = await createMerchant('active-unlisted')
    const product = await createProduct('active-unlisted')
    await createPrice(product.id, retailer.id)

    // Create ACTIVE + UNLISTED relationship (delinquency case)
    await prisma.merchant_retailers.create({
      data: {
        merchantId: merchant.id,
        retailerId: retailer.id,
        status: 'ACTIVE',
        listingStatus: 'UNLISTED',
      },
    })

    // Verify: relationship exists and is ACTIVE + UNLISTED
    const mr = await prisma.merchant_retailers.findFirst({
      where: { retailerId: retailer.id },
    })
    expect(mr).toBeTruthy()
    expect(mr?.status).toBe('ACTIVE')
    expect(mr?.listingStatus).toBe('UNLISTED')

    // Assert: price is NOT visible (alert should NOT fire)
    // Per A1:
    // - `{ none: { status: 'ACTIVE' } }` is FALSE (ACTIVE exists)
    // - `{ some: { status: 'ACTIVE', listingStatus: 'LISTED' } }` is FALSE (not LISTED)
    // - Both OR conditions fail → hidden
    const isVisible = await hasVisiblePrice(product.id)
    expect(isVisible).toBe(false)
  })

  // ============================================================================
  // BONUS: Verify ACTIVE+LISTED makes retailer visible
  // ============================================================================
  it('alert_fires_when_retailer_has_active_listed_relationship', async () => {
    // Setup: ELIGIBLE retailer with ACTIVE + LISTED merchant_retailers
    const retailer = await createEligibleRetailer('active-listed')
    const merchant = await createMerchant('active-listed')
    const product = await createProduct('active-listed')
    await createPrice(product.id, retailer.id)

    // Create ACTIVE + LISTED relationship (normal merchant-managed case)
    await prisma.merchant_retailers.create({
      data: {
        merchantId: merchant.id,
        retailerId: retailer.id,
        status: 'ACTIVE',
        listingStatus: 'LISTED',
      },
    })

    // Verify: relationship exists and is ACTIVE + LISTED
    const mr = await prisma.merchant_retailers.findFirst({
      where: { retailerId: retailer.id },
    })
    expect(mr).toBeTruthy()
    expect(mr?.status).toBe('ACTIVE')
    expect(mr?.listingStatus).toBe('LISTED')

    // Assert: price IS visible (alert should fire)
    const isVisible = await hasVisiblePrice(product.id)
    expect(isVisible).toBe(true)
  })

  // ============================================================================
  // BONUS: Verify INELIGIBLE retailer is always hidden
  // ============================================================================
  it('alert_does_not_fire_when_retailer_is_ineligible', async () => {
    // Setup: INELIGIBLE retailer (should never be visible regardless of relationships)
    const retailer = await prisma.retailers.create({
      data: {
        name: `Test Retailer A1 ineligible ${Date.now()}`,
        website: `https://test-a1-ineligible-${Date.now()}.example.com`,
        visibilityStatus: 'INELIGIBLE',
      },
    })
    createdRetailerIds.push(retailer.id)

    const product = await createProduct('ineligible')
    await createPrice(product.id, retailer.id)

    // Assert: price is NOT visible (alert should NOT fire)
    const isVisible = await hasVisiblePrice(product.id)
    expect(isVisible).toBe(false)
  })
})
