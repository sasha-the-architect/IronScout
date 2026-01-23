#!/usr/bin/env npx ts-node
/**
 * Smoke Test: Product Resolver Flow
 *
 * Verifies the resolver pipeline works end-to-end:
 * 1. Creates a test source_product
 * 2. Enqueues a resolve job
 * 3. Waits for processing
 * 4. Verifies product_links and product_resolve_requests state
 *
 * Usage:
 *   pnpm exec ts-node src/scripts/smoke-test-resolver.ts
 *
 * Prerequisites:
 *   - Database migrated
 *   - Redis running
 *   - Worker running (in another terminal): pnpm worker
 */

import 'dotenv/config'
import { prisma } from '@ironscout/db'
import { createId } from '@paralleldrive/cuid2'
import { enqueueProductResolve, QUEUE_NAMES } from '../config/queues'
import { RESOLVER_VERSION } from '../resolver'
import { warmupRedis } from '../config/redis'

const TEST_PREFIX = 'smoke_test_'

interface TestResult {
  step: string
  passed: boolean
  details?: string
  error?: string
}

const results: TestResult[] = []

function log(msg: string) {
  console.log(`[smoke-test] ${msg}`)
}

function record(step: string, passed: boolean, details?: string, error?: string) {
  results.push({ step, passed, details, error })
  const icon = passed ? '✓' : '✗'
  console.log(`  ${icon} ${step}${details ? `: ${details}` : ''}${error ? ` (${error})` : ''}`)
}

async function cleanup(sourceProductId: string, sourceId: string) {
  log('Cleaning up test data...')

  // Delete in order respecting foreign keys
  await prisma.product_resolve_requests.deleteMany({
    where: { sourceProductId }
  })
  await prisma.product_links.deleteMany({
    where: { sourceProductId }
  })
  await prisma.source_product_identifiers.deleteMany({
    where: { sourceProductId }
  })
  await prisma.source_products.deleteMany({
    where: { id: sourceProductId }
  })
  await prisma.sources.deleteMany({
    where: { id: sourceId }
  })
}

async function main() {
  log('Starting Product Resolver Smoke Test')
  log('=====================================\n')

  // Step 0: Verify connections
  log('Step 0: Verify connections')

  try {
    await prisma.$queryRaw`SELECT 1`
    record('Database connection', true)
  } catch (err) {
    record('Database connection', false, undefined, (err as Error).message)
    process.exit(1)
  }

  const redisOk = await warmupRedis()
  if (!redisOk) {
    record('Redis connection', false, undefined, 'Redis not available')
    process.exit(1)
  }
  record('Redis connection', true)

  // Generate test IDs
  const testId = createId()
  const sourceId = `${TEST_PREFIX}source_${testId}`
  const sourceProductId = `${TEST_PREFIX}sp_${testId}`
  const retailerId = `${TEST_PREFIX}retailer_${testId}`

  log(`\nTest IDs: sourceProductId=${sourceProductId.slice(0, 20)}...`)

  try {
    // Step 1: Create test retailer and source
    log('\nStep 1: Create test retailer and source')

    const retailer = await prisma.retailers.create({
      data: {
        id: retailerId,
        name: 'Smoke Test Retailer',
        website: 'https://smoke-test.example.com',
      }
    })
    record('Retailer created', true, retailer.id)

    const source = await prisma.sources.create({
      data: {
        id: sourceId,
        name: 'Smoke Test Source',
        url: 'https://smoke-test.example.com/feed',
        type: 'JSON',
        retailerId: retailer.id,
        sourceKind: 'DIRECT',
        enabled: false, // Don't actually crawl
        updatedAt: new Date(),
      }
    })
    record('Source created', true, source.id)

    // Step 2: Create test source_product with UPC
    log('\nStep 2: Create test source_product')

    const sourceProduct = await prisma.source_products.create({
      data: {
        id: sourceProductId,
        sourceId: source.id,
        title: 'Smoke Test 9mm 124gr FMJ',
        brand: 'SmokeTest',
        url: `https://smoke-test.example.com/product/${testId}`,
        normalizedUrl: `smoke-test.example.com/product/${testId}`,
        identityKey: `smoke:${testId}`,
        updatedAt: new Date(),
      }
    })
    record('Source product created', true, sourceProduct.id)

    // Add UPC identifier
    await prisma.source_product_identifiers.create({
      data: {
        sourceProductId: sourceProduct.id,
        idType: 'UPC',
        idValue: '999888777666',
        normalizedValue: '999888777666',
        isCanonical: false,
      }
    })
    record('UPC identifier added', true, '999888777666')

    // Step 3: Create trust config (UPC trusted)
    log('\nStep 3: Create trust config')

    await prisma.source_trust_config.upsert({
      where: { sourceId: source.id },
      create: {
        id: createId(),
        sourceId: source.id,
        upcTrusted: true,
        version: 1,
        updatedAt: new Date(),
      },
      update: {
        upcTrusted: true,
        version: 1,
        updatedAt: new Date(),
      }
    })
    record('Trust config created', true, 'upcTrusted=true')

    // Step 4: Enqueue resolve job
    log('\nStep 4: Enqueue resolve job')

    const requestId = await enqueueProductResolve(
      sourceProductId,
      'MANUAL',
      RESOLVER_VERSION,
      { sourceId: source.id, identityKey: `smoke:${testId}`, delay: 0 }
    )

    if (requestId) {
      record('Job enqueued', true, `requestId=${requestId.slice(0, 16)}...`)
    } else {
      record('Job enqueued', false, undefined, 'enqueueProductResolve returned null (deduped?)')
    }

    // Step 5: Wait for processing
    log('\nStep 5: Wait for processing (max 30s)')

    const startWait = Date.now()
    const maxWaitMs = 30_000
    const pollIntervalMs = 1_000

    let finalStatus: string | null = null
    let productLink: any = null

    while (Date.now() - startWait < maxWaitMs) {
      // Check product_resolve_requests status
      const request = await prisma.product_resolve_requests.findFirst({
        where: { sourceProductId }
      })

      if (request) {
        if (request.status === 'COMPLETED' || request.status === 'FAILED') {
          finalStatus = request.status
          break
        }
        process.stdout.write(`.`)
      }

      await new Promise(r => setTimeout(r, pollIntervalMs))
    }
    console.log() // newline after dots

    const waitDuration = Date.now() - startWait

    if (finalStatus === 'COMPLETED') {
      record('Job completed', true, `${waitDuration}ms`)
    } else if (finalStatus === 'FAILED') {
      const req = await prisma.product_resolve_requests.findFirst({
        where: { sourceProductId }
      })
      record('Job completed', false, undefined, `FAILED: ${req?.errorMessage}`)
    } else {
      record('Job completed', false, undefined, `Timeout after ${maxWaitMs}ms - is worker running?`)
    }

    // Step 6: Verify results
    log('\nStep 6: Verify results')

    // Check product_links
    productLink = await prisma.product_links.findUnique({
      where: { sourceProductId }
    })

    if (productLink) {
      record('Product link created', true, `status=${productLink.status}, matchType=${productLink.matchType}`)

      if (productLink.status === 'CREATED' || productLink.status === 'MATCHED') {
        record('Product resolved', true, `productId=${productLink.productId?.slice(0, 16)}...`)
      } else if (productLink.status === 'NEEDS_REVIEW') {
        record('Product needs review', true, `reasonCode=${productLink.reasonCode}`)
      } else {
        record('Product status', false, productLink.status)
      }
    } else {
      record('Product link created', false, undefined, 'No product_links row found')
    }

    // Check canonical product was created (for CREATED status)
    if (productLink?.productId) {
      const product = await prisma.products.findUnique({
        where: { id: productLink.productId }
      })
      if (product) {
        record('Canonical product exists', true, `canonicalKey=${product.canonicalKey}`)
      }
    }

    // Cleanup
    log('\nCleaning up...')
    await cleanup(sourceProductId, sourceId)

    // Also cleanup the created product if any
    if (productLink?.productId) {
      await prisma.products.deleteMany({
        where: { id: productLink.productId }
      })
    }
    await prisma.retailers.deleteMany({
      where: { id: retailerId }
    })
    record('Cleanup', true)

  } catch (err) {
    console.error('\nUnexpected error:', err)

    // Attempt cleanup on error
    try {
      await cleanup(sourceProductId, sourceId)
      await prisma.retailers.deleteMany({
        where: { id: retailerId }
      })
    } catch {
      // Ignore cleanup errors
    }

    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }

  // Summary
  log('\n=====================================')
  log('Summary')
  log('=====================================')

  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length

  console.log(`  Passed: ${passed}`)
  console.log(`  Failed: ${failed}`)

  if (failed > 0) {
    console.log('\nFailed steps:')
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.step}: ${r.error || 'unknown'}`)
    })
    process.exit(1)
  }

  log('\n✓ Smoke test passed!')
  process.exit(0)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
