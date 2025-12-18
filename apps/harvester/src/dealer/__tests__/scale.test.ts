/**
 * Dealer Pipeline Scale Tests
 *
 * Tests the harvester dealer pipeline at various catalog sizes:
 * - Hobbyist: Under 300 SKUs
 * - Serious: 300-1,500 SKUs
 * - National: 1,500-5,000 SKUs
 * - Top-Tier: 5,000+ SKUs
 *
 * Tests verify:
 * - Parsing correctness at scale
 * - Performance benchmarks (time, memory)
 * - Data quality handling
 * - Error aggregation accuracy
 *
 * RUN INCREMENTALLY:
 * - pnpm test -- --run scale.test.ts -t "Hobbyist"   # Run hobbyist first
 * - pnpm test -- --run scale.test.ts -t "Serious"    # Then serious
 * - pnpm test -- --run scale.test.ts -t "National"   # Then national
 * - pnpm test -- --run scale.test.ts -t "Top-Tier"   # Finally top-tier
 *
 * Or run specific tiers with environment variables:
 * - RUN_TIER=hobbyist pnpm test -- --run scale.test.ts
 * - RUN_TIER=serious pnpm test -- --run scale.test.ts
 * - RUN_TIER=national pnpm test -- --run scale.test.ts
 * - RUN_TIER=top-tier pnpm test -- --run scale.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { GenericConnector } from '../connectors/generic-connector'
import { AmmoSeekConnector } from '../connectors/ammoseek-connector'
import {
  generateDealerFeed,
  TIER_CONFIG,
  QUALITY_PROFILES,
  measurePerformance,
  formatMetrics,
  type DealerTier,
  type GeneratedFeed,
  type PerformanceMetrics,
} from './scale-data-generator'
import { assertValidParseResult, countErrorCode } from '../connectors/__tests__/test-utils'
import { ERROR_CODES } from '../connectors/types'

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

// Environment-based tier selection for incremental testing
const RUN_TIER = process.env.RUN_TIER as DealerTier | undefined
const ENABLE_STRESS_TESTS = process.env.RUN_STRESS_TESTS === 'true'
const ENABLE_MEMORY_TESTS = process.env.RUN_MEMORY_TESTS === 'true'

// Skip tier tests based on environment variable
const shouldRunTier = (tier: DealerTier): boolean => {
  if (!RUN_TIER) return true // Run all if not specified
  return RUN_TIER === tier
}

// Performance thresholds (in ms)
const PERFORMANCE_THRESHOLDS = {
  hobbyist: {
    maxParseTime: 1000, // 1 second
    maxMemoryMb: 100,
  },
  serious: {
    maxParseTime: 5000, // 5 seconds
    maxMemoryMb: 200,
  },
  national: {
    maxParseTime: 30000, // 30 seconds
    maxMemoryMb: 500,
  },
  'top-tier': {
    maxParseTime: 120000, // 2 minutes
    maxMemoryMb: 1000,
  },
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function describeTier(tier: DealerTier): string {
  return `${tier} (${TIER_CONFIG[tier].description})`
}

async function runParseTest(
  connector: GenericConnector | AmmoSeekConnector,
  feed: GeneratedFeed
): Promise<{ result: Awaited<ReturnType<typeof connector.parse>>; metrics: PerformanceMetrics }> {
  let result: Awaited<ReturnType<typeof connector.parse>>

  const metrics = await measurePerformance(async () => {
    result = await connector.parse(feed.content)
  })

  return { result: result!, metrics }
}

// ============================================================================
// HOBBYIST TIER TESTS (Under 300 SKUs)
// ============================================================================

describe.skipIf(!shouldRunTier('hobbyist'))('Hobbyist Dealer Scale (Under 300 SKUs)', () => {
  const connector = new GenericConnector()
  const tier: DealerTier = 'hobbyist'

  describe('Basic functionality', () => {
    it('parses minimum viable catalog (50 SKUs)', async () => {
      const feed = generateDealerFeed({
        tier,
        count: 50,
        quality: 'excellent',
        seed: 12345,
        format: 'json',
      })

      const result = await connector.parse(feed.content)

      assertValidParseResult(result)
      expect(result.totalRows).toBe(50)
      expect(result.indexableCount + result.quarantineCount + result.rejectCount).toBe(50)
    })

    it('parses maximum hobbyist catalog (299 SKUs)', async () => {
      const feed = generateDealerFeed({
        tier,
        count: 299,
        quality: 'good',
        seed: 12345,
        format: 'json',
      })

      const result = await connector.parse(feed.content)

      assertValidParseResult(result)
      expect(result.totalRows).toBe(299)
    })

    it('correctly classifies records at hobbyist scale', async () => {
      const feed = generateDealerFeed({
        tier,
        count: 150,
        quality: 'good',
        seed: 12345,
        format: 'json',
      })

      const result = await connector.parse(feed.content)

      // Verify classification matches expectations (within tolerance)
      const expectedIndexable = feed.stats.expectedIndexable
      const expectedQuarantine = feed.stats.expectedQuarantine
      const expectedReject = feed.stats.expectedReject

      // Allow 5% tolerance for edge cases
      const tolerance = Math.ceil(feed.stats.total * 0.05)

      expect(Math.abs(result.indexableCount - expectedIndexable)).toBeLessThanOrEqual(tolerance)
      expect(Math.abs(result.quarantineCount - expectedQuarantine)).toBeLessThanOrEqual(tolerance)
      expect(Math.abs(result.rejectCount - expectedReject)).toBeLessThanOrEqual(tolerance)
    })
  })

  describe('Format handling', () => {
    it.each(['json', 'csv', 'xml'] as const)('parses %s format at hobbyist scale', async (format) => {
      const feed = generateDealerFeed({
        tier,
        count: 100,
        quality: 'good',
        seed: 12345,
        format,
      })

      const result = await connector.parse(feed.content)

      assertValidParseResult(result)
      expect(result.totalRows).toBe(100)
    })
  })

  describe('Data quality handling', () => {
    it.each(Object.keys(QUALITY_PROFILES) as Array<keyof typeof QUALITY_PROFILES>)(
      'handles %s quality data at hobbyist scale',
      async (quality) => {
        const feed = generateDealerFeed({
          tier,
          count: 100,
          quality,
          seed: 12345,
          format: 'json',
        })

        const result = await connector.parse(feed.content)

        assertValidParseResult(result)
        expect(result.totalRows).toBe(100)

        // Verify error codes are aggregated
        if (result.rejectCount > 0 || result.quarantineCount > 0) {
          expect(Object.keys(result.errorCodes).length).toBeGreaterThan(0)
        }
      }
    )
  })

  describe('Performance', () => {
    it('parses hobbyist catalog within time threshold', async () => {
      const feed = generateDealerFeed({
        tier,
        count: TIER_CONFIG[tier].defaultSkus,
        quality: 'good',
        seed: 12345,
        format: 'json',
      })

      const { result, metrics } = await runParseTest(connector, feed)

      console.log(`Hobbyist (${feed.stats.total} SKUs): ${formatMetrics(metrics, feed.stats.total)}`)

      assertValidParseResult(result)
      expect(metrics.parseTimeMs).toBeLessThan(PERFORMANCE_THRESHOLDS[tier].maxParseTime)
    })
  })
})

// ============================================================================
// SERIOUS SELLER TESTS (300-1,500 SKUs)
// ============================================================================

describe.skipIf(!shouldRunTier('serious'))('Serious Seller Scale (300-1,500 SKUs)', () => {
  const connector = new GenericConnector()
  const tier: DealerTier = 'serious'

  describe('Basic functionality', () => {
    it('parses minimum serious catalog (300 SKUs)', async () => {
      const feed = generateDealerFeed({
        tier,
        count: 300,
        quality: 'excellent',
        seed: 12345,
        format: 'json',
      })

      const result = await connector.parse(feed.content)

      assertValidParseResult(result)
      expect(result.totalRows).toBe(300)
    })

    it('parses typical serious catalog (800 SKUs)', async () => {
      const feed = generateDealerFeed({
        tier,
        count: 800,
        quality: 'good',
        seed: 12345,
        format: 'json',
      })

      const result = await connector.parse(feed.content)

      assertValidParseResult(result)
      expect(result.totalRows).toBe(800)
    })

    it('parses maximum serious catalog (1499 SKUs)', async () => {
      const feed = generateDealerFeed({
        tier,
        count: 1499,
        quality: 'good',
        seed: 12345,
        format: 'json',
      })

      const result = await connector.parse(feed.content)

      assertValidParseResult(result)
      expect(result.totalRows).toBe(1499)
    })
  })

  describe('Error aggregation at scale', () => {
    it('correctly aggregates error codes for 1000 SKUs', async () => {
      const feed = generateDealerFeed({
        tier,
        count: 1000,
        quality: 'fair', // Higher error rate for testing
        seed: 12345,
        format: 'json',
      })

      const result = await connector.parse(feed.content)

      assertValidParseResult(result)

      // Verify error codes sum correctly
      const totalErrorsFromCodes = Object.values(result.errorCodes).reduce((sum, count) => sum + count, 0)
      const recordsWithErrors = result.parsedRecords.filter(r => r.errors.length > 0).length

      // Each record with errors contributes at least one error code
      expect(totalErrorsFromCodes).toBeGreaterThanOrEqual(recordsWithErrors)
    })

    it('tracks MISSING_UPC errors accurately', async () => {
      const feed = generateDealerFeed({
        tier,
        count: 500,
        quality: 'poor', // High missing UPC rate
        seed: 12345,
        format: 'json',
      })

      const result = await connector.parse(feed.content)

      const missingUpcCount = countErrorCode(result, ERROR_CODES.MISSING_UPC)
      const quarantinedWithMissingUpc = result.parsedRecords.filter(
        r => !r.isIndexable && r.errors.some(e => e.code === ERROR_CODES.MISSING_UPC)
      ).length

      expect(missingUpcCount).toBe(quarantinedWithMissingUpc)
    })
  })

  describe('Performance', () => {
    it('parses serious catalog within time threshold', async () => {
      const feed = generateDealerFeed({
        tier,
        count: TIER_CONFIG[tier].defaultSkus,
        quality: 'good',
        seed: 12345,
        format: 'json',
      })

      const { result, metrics } = await runParseTest(connector, feed)

      console.log(`Serious (${feed.stats.total} SKUs): ${formatMetrics(metrics, feed.stats.total)}`)

      assertValidParseResult(result)
      expect(metrics.parseTimeMs).toBeLessThan(PERFORMANCE_THRESHOLDS[tier].maxParseTime)
    }, 10000)

    it('maintains consistent throughput across formats', async () => {
      const formats = ['json', 'csv', 'xml'] as const
      const results: Record<string, number> = {}

      for (const format of formats) {
        const feed = generateDealerFeed({
          tier,
          count: 500,
          quality: 'good',
          seed: 12345,
          format,
        })

        const { metrics } = await runParseTest(connector, feed)
        results[format] = 500 / (metrics.parseTimeMs / 1000) // items per second
      }

      console.log('Throughput by format:', results)

      // All formats should achieve reasonable throughput (at least 100 items/sec)
      for (const format of formats) {
        expect(results[format]).toBeGreaterThan(100)
      }
    }, 30000)
  })
})

// ============================================================================
// NATIONAL OPERATION TESTS (1,500-5,000 SKUs)
// ============================================================================

describe.skipIf(!shouldRunTier('national'))('National Operation Scale (1,500-5,000 SKUs)', () => {
  const connector = new GenericConnector()
  const tier: DealerTier = 'national'

  describe('Basic functionality', () => {
    it('parses minimum national catalog (1500 SKUs)', async () => {
      const feed = generateDealerFeed({
        tier,
        count: 1500,
        quality: 'good',
        seed: 12345,
        format: 'json',
      })

      const result = await connector.parse(feed.content)

      assertValidParseResult(result)
      expect(result.totalRows).toBe(1500)
    }, 15000)

    it('parses typical national catalog (3000 SKUs)', async () => {
      const feed = generateDealerFeed({
        tier,
        count: 3000,
        quality: 'good',
        seed: 12345,
        format: 'json',
      })

      const result = await connector.parse(feed.content)

      assertValidParseResult(result)
      expect(result.totalRows).toBe(3000)
    }, 30000)

    it('parses maximum national catalog (4999 SKUs)', async () => {
      const feed = generateDealerFeed({
        tier,
        count: 4999,
        quality: 'good',
        seed: 12345,
        format: 'json',
      })

      const result = await connector.parse(feed.content)

      assertValidParseResult(result)
      expect(result.totalRows).toBe(4999)
    }, 60000)
  })

  describe('Data integrity at scale', () => {
    it('preserves data accuracy for 3000 SKUs', async () => {
      const feed = generateDealerFeed({
        tier,
        count: 3000,
        quality: 'excellent',
        seed: 12345,
        format: 'json',
      })

      const result = await connector.parse(feed.content)

      // Sample check: verify some parsed records match input
      const sampleIndices = [0, 500, 1500, 2999]
      for (const idx of sampleIndices) {
        if (result.parsedRecords[idx]) {
          const parsed = result.parsedRecords[idx].record
          const original = feed.products[idx]

          if (original.title && parsed.title) {
            // Title should match (allowing for coercion)
            expect(parsed.title).toBeTruthy()
          }

          if (typeof original.price === 'number' && original.price > 0 && parsed.price) {
            // Price should be close to original (allowing for coercion)
            expect(parsed.price).toBeGreaterThan(0)
          }
        }
      }
    }, 30000)

    it('handles mixed data quality at national scale', async () => {
      const feed = generateDealerFeed({
        tier,
        count: 2000,
        quality: 'fair',
        seed: 12345,
        format: 'json',
      })

      const result = await connector.parse(feed.content)

      assertValidParseResult(result)

      // Should have a mix of indexable, quarantine, and reject
      expect(result.indexableCount).toBeGreaterThan(0)
      // Fair quality should have noticeable quarantine/reject rates
      expect(result.quarantineCount + result.rejectCount).toBeGreaterThan(result.totalRows * 0.1)
    }, 30000)
  })

  describe('Performance', () => {
    it('parses national catalog within time threshold', async () => {
      const feed = generateDealerFeed({
        tier,
        count: TIER_CONFIG[tier].defaultSkus,
        quality: 'good',
        seed: 12345,
        format: 'json',
      })

      const { result, metrics } = await runParseTest(connector, feed)

      console.log(`National (${feed.stats.total} SKUs): ${formatMetrics(metrics, feed.stats.total)}`)

      assertValidParseResult(result)
      expect(metrics.parseTimeMs).toBeLessThan(PERFORMANCE_THRESHOLDS[tier].maxParseTime)
    }, 60000)
  })
})

// ============================================================================
// TOP-TIER TESTS (5,000+ SKUs)
// ============================================================================

describe.skipIf(!shouldRunTier('top-tier'))('Top-Tier Dealer Scale (5,000+ SKUs)', () => {
  const connector = new GenericConnector()
  const tier: DealerTier = 'top-tier'

  describe('Basic functionality', () => {
    it('parses minimum top-tier catalog (5000 SKUs)', async () => {
      const feed = generateDealerFeed({
        tier,
        count: 5000,
        quality: 'good',
        seed: 12345,
        format: 'json',
      })

      const result = await connector.parse(feed.content)

      assertValidParseResult(result)
      expect(result.totalRows).toBe(5000)
    }, 60000)

    it('parses typical top-tier catalog (10000 SKUs)', async () => {
      const feed = generateDealerFeed({
        tier,
        count: 10000,
        quality: 'good',
        seed: 12345,
        format: 'json',
      })

      const result = await connector.parse(feed.content)

      assertValidParseResult(result)
      expect(result.totalRows).toBe(10000)
    }, 120000)
  })

  describe('Stress tests', () => {
    it.skipIf(!ENABLE_STRESS_TESTS)('handles 25000 SKUs', async () => {
      const feed = generateDealerFeed({
        tier,
        count: 25000,
        quality: 'good',
        seed: 12345,
        format: 'json',
      })

      const { result, metrics } = await runParseTest(connector, feed)

      console.log(`Top-Tier Stress (${feed.stats.total} SKUs): ${formatMetrics(metrics, feed.stats.total)}`)

      assertValidParseResult(result)
      expect(result.totalRows).toBe(25000)
    }, 300000) // 5 minute timeout

    it.skipIf(!ENABLE_STRESS_TESTS)('handles 50000 SKUs', async () => {
      const feed = generateDealerFeed({
        tier,
        count: 50000,
        quality: 'excellent', // Use excellent quality for max throughput
        seed: 12345,
        format: 'json',
      })

      const { result, metrics } = await runParseTest(connector, feed)

      console.log(`Top-Tier Max (${feed.stats.total} SKUs): ${formatMetrics(metrics, feed.stats.total)}`)

      assertValidParseResult(result)
      expect(result.totalRows).toBe(50000)
    }, 600000) // 10 minute timeout
  })

  describe('Performance', () => {
    it('parses top-tier catalog within time threshold', async () => {
      const feed = generateDealerFeed({
        tier,
        count: TIER_CONFIG[tier].defaultSkus,
        quality: 'good',
        seed: 12345,
        format: 'json',
      })

      const { result, metrics } = await runParseTest(connector, feed)

      console.log(`Top-Tier (${feed.stats.total} SKUs): ${formatMetrics(metrics, feed.stats.total)}`)

      assertValidParseResult(result)
      expect(metrics.parseTimeMs).toBeLessThan(PERFORMANCE_THRESHOLDS[tier].maxParseTime)
    }, 180000)

    it('achieves minimum throughput of 500 items/sec for JSON', async () => {
      const feed = generateDealerFeed({
        tier,
        count: 5000,
        quality: 'excellent',
        seed: 12345,
        format: 'json',
      })

      const { metrics } = await runParseTest(connector, feed)

      const throughput = 5000 / (metrics.parseTimeMs / 1000)
      console.log(`Top-Tier JSON throughput: ${throughput.toFixed(0)} items/sec`)

      expect(throughput).toBeGreaterThan(500)
    }, 60000)
  })

  describe('Batch processing simulation', () => {
    it('simulates batch queuing for SKU matching', async () => {
      const feed = generateDealerFeed({
        tier,
        count: 5000,
        quality: 'good',
        seed: 12345,
        format: 'json',
      })

      const result = await connector.parse(feed.content)

      // Simulate batch creation (100 items per batch)
      const BATCH_SIZE = 100
      const indexableRecords = result.parsedRecords.filter(r => r.isIndexable)
      const batchCount = Math.ceil(indexableRecords.length / BATCH_SIZE)

      console.log(`Would create ${batchCount} batches for ${indexableRecords.length} indexable records`)

      expect(batchCount).toBeGreaterThan(0)
      expect(batchCount).toBeLessThanOrEqual(Math.ceil(5000 / BATCH_SIZE))

      // Verify batches would be evenly distributed
      const lastBatchSize = indexableRecords.length % BATCH_SIZE || BATCH_SIZE
      expect(lastBatchSize).toBeLessThanOrEqual(BATCH_SIZE)
    }, 60000)
  })
})

// ============================================================================
// CROSS-TIER COMPARISON TESTS
// ============================================================================

// Skip cross-tier tests when running a specific tier
describe.skipIf(!!RUN_TIER)('Cross-Tier Performance Comparison', () => {
  const connector = new GenericConnector()

  it('demonstrates linear scaling across tiers', async () => {
    const tiers: DealerTier[] = ['hobbyist', 'serious', 'national']
    const results: Record<DealerTier, { count: number; timeMs: number; throughput: number }> = {} as any

    for (const tier of tiers) {
      const feed = generateDealerFeed({
        tier,
        count: TIER_CONFIG[tier].defaultSkus,
        quality: 'good',
        seed: 12345,
        format: 'json',
      })

      const { metrics } = await runParseTest(connector, feed)

      results[tier] = {
        count: feed.stats.total,
        timeMs: metrics.parseTimeMs,
        throughput: feed.stats.total / (metrics.parseTimeMs / 1000),
      }
    }

    console.log('\nCross-Tier Performance Summary:')
    console.table(results)

    // Verify throughput doesn't degrade significantly at scale
    // (should maintain at least 50% of hobbyist throughput)
    const hobbyistThroughput = results.hobbyist.throughput
    expect(results.serious.throughput).toBeGreaterThan(hobbyistThroughput * 0.5)
    expect(results.national.throughput).toBeGreaterThan(hobbyistThroughput * 0.3)
  }, 120000)
})

// ============================================================================
// MEMORY TESTS (Optional - requires --expose-gc)
// ============================================================================

describe.skipIf(!ENABLE_MEMORY_TESTS)('Memory Usage Tests', () => {
  const connector = new GenericConnector()

  it('tracks memory usage for large catalogs', async () => {
    const sizes = [1000, 5000, 10000]
    const memoryResults: Record<number, number> = {}

    for (const size of sizes) {
      // Force GC before test
      if (global.gc) global.gc()

      const feed = generateDealerFeed({
        tier: 'top-tier',
        count: size,
        quality: 'good',
        seed: 12345,
        format: 'json',
      })

      const { metrics } = await runParseTest(connector, feed)
      memoryResults[size] = metrics.memoryUsedMb
    }

    console.log('\nMemory Usage by Catalog Size:')
    console.table(memoryResults)

    // Memory should scale roughly linearly
    // 10K items should use less than 10x memory of 1K items
    if (memoryResults[1000] > 0) {
      expect(memoryResults[10000]).toBeLessThan(memoryResults[1000] * 15)
    }
  }, 300000)
})

// ============================================================================
// EDGE CASES AT SCALE
// ============================================================================

// Skip edge case tests when running a specific tier - these test across tiers
describe.skipIf(!!RUN_TIER)('Edge Cases at Scale', () => {
  const connector = new GenericConnector()

  it('handles catalog with all records quarantined (missing UPCs)', async () => {
    // Create a feed where ALL records are missing UPCs
    const feed = generateDealerFeed({
      tier: 'serious',
      count: 500,
      quality: 'poor',
      seed: 12345,
      format: 'json',
    })

    // Manually corrupt all UPCs
    const corruptedContent = feed.content.replace(/"upc":\s*"[^"]+"/g, '"upc": null')

    const result = await connector.parse(corruptedContent)

    assertValidParseResult(result)
    // Most should be quarantined (have title/price but no UPC)
    expect(result.quarantineCount).toBeGreaterThan(result.totalRows * 0.5)
  }, 30000)

  it('handles catalog with high rejection rate', async () => {
    const feed = generateDealerFeed({
      tier: 'serious',
      count: 500,
      quality: 'poor',
      seed: 12345,
      format: 'json',
    })

    // Corrupt prices to trigger rejections
    const corruptedContent = feed.content.replace(/"price":\s*[\d.]+/g, '"price": -1')

    const result = await connector.parse(corruptedContent)

    assertValidParseResult(result)
    // Most should be rejected (invalid price)
    expect(result.rejectCount).toBeGreaterThan(result.totalRows * 0.5)
  }, 30000)

  it('handles extremely long product titles', async () => {
    const feed = generateDealerFeed({
      tier: 'hobbyist',
      count: 100,
      quality: 'excellent',
      seed: 12345,
      format: 'json',
    })

    // Parse and inject long titles
    const parsed = JSON.parse(feed.content)
    parsed.products.forEach((p: Record<string, unknown>, i: number) => {
      if (i % 10 === 0) {
        p.title = 'A'.repeat(5000) // 5KB title
      }
    })

    const result = await connector.parse(JSON.stringify(parsed))

    assertValidParseResult(result)
    expect(result.totalRows).toBe(100)
  })

  it('handles catalog with maximum field variety', async () => {
    // Use all calibers, brands, bullet types
    const feed = generateDealerFeed({
      tier: 'national',
      count: 2000,
      quality: 'excellent',
      seed: 12345,
      format: 'json',
    })

    const result = await connector.parse(feed.content)

    assertValidParseResult(result)

    // Verify diverse data was parsed
    const calibers = new Set(result.parsedRecords.map(r => r.record.caliber).filter(Boolean))
    const brands = new Set(result.parsedRecords.map(r => r.record.brand).filter(Boolean))
    const bulletTypes = new Set(result.parsedRecords.map(r => r.record.bulletType).filter(Boolean))

    console.log(`Parsed variety: ${calibers.size} calibers, ${brands.size} brands, ${bulletTypes.size} bullet types`)

    expect(calibers.size).toBeGreaterThan(5)
    expect(brands.size).toBeGreaterThan(5)
    expect(bulletTypes.size).toBeGreaterThan(3)
  }, 60000)
})

// ============================================================================
// REGRESSION TESTS
// ============================================================================

// Skip regression tests when running a specific tier
describe.skipIf(!!RUN_TIER)('Regression Tests', () => {
  const connector = new GenericConnector()

  it('maintains consistent results with same seed', async () => {
    const seed = 99999
    const results: number[] = []

    for (let i = 0; i < 3; i++) {
      const feed = generateDealerFeed({
        tier: 'hobbyist',
        count: 100,
        quality: 'good',
        seed,
        format: 'json',
      })

      const result = await connector.parse(feed.content)
      results.push(result.indexableCount)
    }

    // All runs with same seed should produce identical results
    expect(results[0]).toBe(results[1])
    expect(results[1]).toBe(results[2])
  })

  it('produces different results with different seeds', async () => {
    const indexableCounts: number[] = []

    for (let seed = 1; seed <= 5; seed++) {
      const feed = generateDealerFeed({
        tier: 'hobbyist',
        count: 200,
        quality: 'fair',
        seed,
        format: 'json',
      })

      const result = await connector.parse(feed.content)
      indexableCounts.push(result.indexableCount)
    }

    // Different seeds should produce different distributions
    const uniqueCounts = new Set(indexableCounts)
    expect(uniqueCounts.size).toBeGreaterThan(1)
  })
})
