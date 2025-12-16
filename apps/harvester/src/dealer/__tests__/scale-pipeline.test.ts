/**
 * Dealer Pipeline Integration Scale Tests
 *
 * Tests the complete dealer feed processing pipeline at scale:
 * 1. Feed Ingest → Parse and classify records
 * 2. SKU Match → Match dealer SKUs to canonical SKUs
 * 3. Benchmark → Calculate price benchmarks
 * 4. Insight → Generate dealer insights
 *
 * These tests simulate the full pipeline with mocked database operations
 * to identify bottlenecks and verify data flow at scale.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  generateDealerFeed,
  TIER_CONFIG,
  measurePerformance,
  formatMetrics,
  type DealerTier,
  type GeneratedFeed,
} from './scale-data-generator'
import { GenericConnector } from '../connectors/generic-connector'
import type { FeedParseResult, ParsedRecordResult } from '../connectors/types'

// ============================================================================
// MOCK PIPELINE COMPONENTS
// ============================================================================

/**
 * Simulates DealerSku record creation (feed-ingest.ts)
 */
interface MockDealerSku {
  id: string
  dealerId: string
  feedId: string
  feedRunId: string
  dealerSkuHash: string
  rawTitle: string
  rawPrice: number
  rawUpc?: string
  isActive: boolean
}

/**
 * Simulates QuarantinedRecord creation
 */
interface MockQuarantinedRecord {
  id: string
  dealerId: string
  feedId: string
  matchKey: string
  rawData: Record<string, unknown>
  status: 'QUARANTINED' | 'RESOLVED'
}

/**
 * Simulates CanonicalSku for matching
 */
interface MockCanonicalSku {
  id: string
  caliber: string
  brand: string
  grainWeight?: number
  packSize?: number
}

/**
 * Simulates Benchmark record
 */
interface MockBenchmark {
  canonicalSkuId: string
  minPrice: number
  medianPrice: number
  maxPrice: number
  avgPrice: number
  sellerCount: number
  confidence: 'HIGH' | 'MEDIUM' | 'NONE'
}

/**
 * Simulates DealerInsight
 */
interface MockDealerInsight {
  id: string
  dealerId: string
  canonicalSkuId: string
  type: 'OVERPRICED' | 'UNDERPRICED' | 'STOCK_OPPORTUNITY' | 'ATTRIBUTE_GAP'
  severity: 'HIGH' | 'MEDIUM'
}

// ============================================================================
// PIPELINE STAGE SIMULATORS
// ============================================================================

/**
 * Stage 1: Feed Ingest Simulator
 * Simulates the feed-ingest worker's database operations
 */
class FeedIngestSimulator {
  private dealerSkus: Map<string, MockDealerSku> = new Map()
  private quarantinedRecords: Map<string, MockQuarantinedRecord> = new Map()
  private batchSize = 100

  async processParseResults(
    dealerId: string,
    feedId: string,
    feedRunId: string,
    results: FeedParseResult
  ): Promise<{
    dealerSkuIds: string[]
    quarantineIds: string[]
    rejectCount: number
    batchJobs: number
    processingTimeMs: number
  }> {
    const startTime = performance.now()
    const dealerSkuIds: string[] = []
    const quarantineIds: string[] = []
    let rejectCount = 0

    for (const record of results.parsedRecords) {
      if (record.isIndexable) {
        const sku = this.createDealerSku(dealerId, feedId, feedRunId, record)
        dealerSkuIds.push(sku.id)
      } else if (this.hasRequiredFields(record)) {
        const quarantine = this.createQuarantinedRecord(dealerId, feedId, record)
        quarantineIds.push(quarantine.id)
      } else {
        rejectCount++
      }
    }

    // Calculate batch jobs for SKU matching
    const batchJobs = Math.ceil(dealerSkuIds.length / this.batchSize)

    return {
      dealerSkuIds,
      quarantineIds,
      rejectCount,
      batchJobs,
      processingTimeMs: performance.now() - startTime,
    }
  }

  private createDealerSku(
    dealerId: string,
    feedId: string,
    feedRunId: string,
    record: ParsedRecordResult
  ): MockDealerSku {
    const id = `sku-${this.dealerSkus.size + 1}`
    const sku: MockDealerSku = {
      id,
      dealerId,
      feedId,
      feedRunId,
      dealerSkuHash: `hash-${id}`,
      rawTitle: record.record.title,
      rawPrice: record.record.price,
      rawUpc: record.record.upc,
      isActive: true,
    }
    this.dealerSkus.set(id, sku)
    return sku
  }

  private createQuarantinedRecord(
    dealerId: string,
    feedId: string,
    record: ParsedRecordResult
  ): MockQuarantinedRecord {
    const id = `qr-${this.quarantinedRecords.size + 1}`
    const qr: MockQuarantinedRecord = {
      id,
      dealerId,
      feedId,
      matchKey: `match-${id}`,
      rawData: record.record.rawRow as Record<string, unknown>,
      status: 'QUARANTINED',
    }
    this.quarantinedRecords.set(id, qr)
    return qr
  }

  private hasRequiredFields(record: ParsedRecordResult): boolean {
    return !!record.record.title && record.record.price > 0
  }

  getDealerSkus(): Map<string, MockDealerSku> {
    return this.dealerSkus
  }

  getQuarantinedRecords(): Map<string, MockQuarantinedRecord> {
    return this.quarantinedRecords
  }

  reset(): void {
    this.dealerSkus.clear()
    this.quarantinedRecords.clear()
  }
}

/**
 * Stage 2: SKU Match Simulator (Batch Optimized)
 *
 * Mirrors the optimized sku-match.ts implementation:
 * - Pre-builds lookup maps for O(1) matching
 * - Uses "caliber|brand" composite keys
 * - Batch processes all SKUs against pre-loaded maps
 */
class SkuMatchSimulator {
  private canonicalSkus: Map<string, MockCanonicalSku> = new Map()
  private matchedSkus: Map<string, string> = new Map() // dealerSkuId -> canonicalSkuId

  // Optimized lookup maps (mirrors sku-match.ts)
  private upcMap: Map<string, MockCanonicalSku> = new Map()
  private attrMap: Map<string, MockCanonicalSku[]> = new Map() // "caliber|brand" -> canonicals

  constructor() {
    this.seedCanonicalSkus()
  }

  private seedCanonicalSkus(): void {
    const calibers = ['9mm Luger', '.45 ACP', '5.56x45mm NATO', '.223 Remington', '.308 Winchester']
    const brands = ['Federal', 'Hornady', 'Winchester']
    let id = 1

    for (const caliber of calibers) {
      for (const brand of brands) {
        for (const grain of [115, 124, 147, 55, 62, 77, 147, 168]) {
          const canon: MockCanonicalSku = {
            id: `canon-${id}`,
            caliber,
            brand,
            grainWeight: grain,
            packSize: 50,
          }
          this.canonicalSkus.set(`canon-${id}`, canon)
          id++
        }
      }
    }

    // Build optimized lookup maps after seeding
    this.buildLookupMaps()
  }

  /**
   * Build O(1) lookup maps - mirrors buildUpcLookupMap and buildAttributeLookupMap
   */
  private buildLookupMaps(): void {
    this.upcMap.clear()
    this.attrMap.clear()

    for (const canon of this.canonicalSkus.values()) {
      // Build attribute map with "caliber|brand" key
      const key = `${canon.caliber}|${canon.brand}`
      if (!this.attrMap.has(key)) {
        this.attrMap.set(key, [])
      }
      this.attrMap.get(key)!.push(canon)
    }
  }

  async processBatch(
    dealerSkus: MockDealerSku[]
  ): Promise<{
    matchedCount: number
    unmatchedCount: number
    autoCreatedCount: number
    processingTimeMs: number
  }> {
    const startTime = performance.now()
    let matchedCount = 0
    let unmatchedCount = 0
    let autoCreatedCount = 0

    // STEP 1: Extract attributes for all SKUs (batch, no lookup yet)
    const skusWithAttrs = dealerSkus.map(sku => ({
      sku,
      caliber: this.extractCaliber(sku.rawTitle),
      brand: this.extractBrand(sku.rawTitle),
    }))

    // STEP 2: Match all SKUs using pre-built maps (O(1) lookups)
    for (const { sku, caliber, brand } of skusWithAttrs) {
      // Simulate UPC lookup (50% match rate)
      if (sku.rawUpc && Math.random() > 0.5) {
        // O(1) attribute lookup using composite key
        const existingCanon = this.findCanonicalByAttributesOptimized(caliber, brand)
        if (existingCanon) {
          this.matchedSkus.set(sku.id, existingCanon.id)
          matchedCount++
        } else {
          // Auto-create canonical SKU
          const newCanon = this.createCanonicalSku(sku, caliber, brand)
          this.matchedSkus.set(sku.id, newCanon.id)
          autoCreatedCount++
        }
      } else {
        unmatchedCount++
      }
    }

    return {
      matchedCount,
      unmatchedCount,
      autoCreatedCount,
      processingTimeMs: performance.now() - startTime,
    }
  }

  /**
   * O(1) attribute matching using pre-built map
   */
  private findCanonicalByAttributesOptimized(caliber: string, brand: string): MockCanonicalSku | undefined {
    const key = `${caliber}|${brand}`
    const candidates = this.attrMap.get(key)
    return candidates?.[0] // Return first match (simplified)
  }

  private createCanonicalSku(sku: MockDealerSku, caliber: string, brand: string): MockCanonicalSku {
    const id = `canon-auto-${this.canonicalSkus.size + 1}`
    const canon: MockCanonicalSku = {
      id,
      caliber,
      brand,
    }
    this.canonicalSkus.set(id, canon)

    // Update lookup map with new canonical
    const key = `${caliber}|${brand}`
    if (!this.attrMap.has(key)) {
      this.attrMap.set(key, [])
    }
    this.attrMap.get(key)!.push(canon)

    return canon
  }

  private extractCaliber(title: string): string {
    const caliberPatterns = ['9mm Luger', '.45 ACP', '5.56x45mm NATO', '.223 Remington', '.308 Winchester', '9mm', '.45 ACP', '5.56', '.223', '.308', '7.62']
    for (const pattern of caliberPatterns) {
      if (title.toLowerCase().includes(pattern.toLowerCase())) {
        return pattern
      }
    }
    return 'Unknown'
  }

  private extractBrand(title: string): string {
    const brands = ['Federal', 'Hornady', 'Winchester', 'Remington', 'CCI']
    for (const brand of brands) {
      if (title.includes(brand)) {
        return brand
      }
    }
    return 'Unknown'
  }

  getMatchedSkuCount(): number {
    return this.matchedSkus.size
  }

  getCanonicalSkuCount(): number {
    return this.canonicalSkus.size
  }

  reset(): void {
    this.matchedSkus.clear()
    this.canonicalSkus.clear()
    this.upcMap.clear()
    this.attrMap.clear()
    this.seedCanonicalSkus()
  }
}

/**
 * Stage 3: Benchmark Simulator
 * Simulates the benchmark worker's price calculations
 */
class BenchmarkSimulator {
  private benchmarks: Map<string, MockBenchmark> = new Map()

  async processCanonicalSkus(
    canonicalSkuIds: string[],
    dealerPrices: Map<string, number[]>
  ): Promise<{
    calculatedCount: number
    skippedCount: number
    processingTimeMs: number
  }> {
    const startTime = performance.now()
    let calculatedCount = 0
    let skippedCount = 0

    for (const canonicalSkuId of canonicalSkuIds) {
      const prices = dealerPrices.get(canonicalSkuId) || []

      if (prices.length < 2) {
        skippedCount++
        continue
      }

      // Calculate benchmark statistics
      const sorted = [...prices].sort((a, b) => a - b)
      const benchmark: MockBenchmark = {
        canonicalSkuId,
        minPrice: Math.min(...prices),
        maxPrice: Math.max(...prices),
        medianPrice: sorted[Math.floor(sorted.length / 2)],
        avgPrice: prices.reduce((a, b) => a + b, 0) / prices.length,
        sellerCount: Math.min(prices.length, 10), // Simulate distinct sellers
        confidence: prices.length >= 5 ? 'HIGH' : prices.length >= 3 ? 'MEDIUM' : 'NONE',
      }

      this.benchmarks.set(canonicalSkuId, benchmark)
      calculatedCount++
    }

    return {
      calculatedCount,
      skippedCount,
      processingTimeMs: performance.now() - startTime,
    }
  }

  getBenchmarks(): Map<string, MockBenchmark> {
    return this.benchmarks
  }

  reset(): void {
    this.benchmarks.clear()
  }
}

/**
 * Stage 4: Insight Simulator
 * Simulates the insight worker's analysis
 */
class InsightSimulator {
  private insights: MockDealerInsight[] = []

  async generateInsights(
    dealerId: string,
    dealerPrices: Map<string, { skuId: string; price: number }[]>,
    benchmarks: Map<string, MockBenchmark>
  ): Promise<{
    insightCount: number
    overpricedCount: number
    underpricedCount: number
    processingTimeMs: number
  }> {
    const startTime = performance.now()
    let overpricedCount = 0
    let underpricedCount = 0

    for (const [canonicalSkuId, skuPrices] of dealerPrices) {
      const benchmark = benchmarks.get(canonicalSkuId)
      if (!benchmark || benchmark.confidence === 'NONE') continue

      for (const { skuId, price } of skuPrices) {
        const priceDiff = (price - benchmark.medianPrice) / benchmark.medianPrice

        if (priceDiff > 0.15) {
          this.insights.push({
            id: `insight-${this.insights.length + 1}`,
            dealerId,
            canonicalSkuId,
            type: 'OVERPRICED',
            severity: priceDiff > 0.25 ? 'HIGH' : 'MEDIUM',
          })
          overpricedCount++
        } else if (priceDiff < -0.15) {
          this.insights.push({
            id: `insight-${this.insights.length + 1}`,
            dealerId,
            canonicalSkuId,
            type: 'UNDERPRICED',
            severity: priceDiff < -0.25 ? 'HIGH' : 'MEDIUM',
          })
          underpricedCount++
        }
      }
    }

    return {
      insightCount: this.insights.length,
      overpricedCount,
      underpricedCount,
      processingTimeMs: performance.now() - startTime,
    }
  }

  getInsights(): MockDealerInsight[] {
    return this.insights
  }

  reset(): void {
    this.insights = []
  }
}

// ============================================================================
// FULL PIPELINE SIMULATOR
// ============================================================================

class PipelineSimulator {
  private feedIngest = new FeedIngestSimulator()
  private skuMatch = new SkuMatchSimulator()
  private benchmark = new BenchmarkSimulator()
  private insight = new InsightSimulator()

  async runPipeline(
    dealerId: string,
    feedId: string,
    feed: GeneratedFeed
  ): Promise<{
    stages: {
      parse: { timeMs: number; throughput: number }
      ingest: { timeMs: number; skuCount: number; quarantineCount: number; batchJobs: number }
      match: { timeMs: number; matchedCount: number; autoCreatedCount: number }
      benchmark: { timeMs: number; calculatedCount: number }
      insight: { timeMs: number; insightCount: number }
    }
    totalTimeMs: number
  }> {
    const totalStartTime = performance.now()
    const feedRunId = `run-${Date.now()}`

    // Stage 1: Parse feed
    const connector = new GenericConnector()
    const parseStart = performance.now()
    const parseResults = await connector.parse(feed.content)
    const parseTime = performance.now() - parseStart

    // Stage 2: Ingest to database (simulated)
    const ingestResult = await this.feedIngest.processParseResults(
      dealerId,
      feedId,
      feedRunId,
      parseResults
    )

    // Stage 3: SKU Matching (in batches)
    const skus = Array.from(this.feedIngest.getDealerSkus().values())
    const batchSize = 100
    let totalMatchTime = 0
    let totalMatched = 0
    let totalAutoCreated = 0

    for (let i = 0; i < skus.length; i += batchSize) {
      const batch = skus.slice(i, i + batchSize)
      const matchResult = await this.skuMatch.processBatch(batch)
      totalMatchTime += matchResult.processingTimeMs
      totalMatched += matchResult.matchedCount
      totalAutoCreated += matchResult.autoCreatedCount
    }

    // Stage 4: Benchmark calculation
    // Simulate price data for matched canonical SKUs
    const dealerPrices = new Map<string, number[]>()
    for (const sku of skus) {
      const canonicalId = `canon-${(parseInt(sku.id.split('-')[1]) % 50) + 1}` // Simulate mapping
      if (!dealerPrices.has(canonicalId)) {
        dealerPrices.set(canonicalId, [])
      }
      dealerPrices.get(canonicalId)!.push(sku.rawPrice)
    }

    const benchmarkResult = await this.benchmark.processCanonicalSkus(
      Array.from(dealerPrices.keys()),
      dealerPrices
    )

    // Stage 5: Insight generation
    const skuPrices = new Map<string, { skuId: string; price: number }[]>()
    for (const sku of skus) {
      const canonicalId = `canon-${(parseInt(sku.id.split('-')[1]) % 50) + 1}`
      if (!skuPrices.has(canonicalId)) {
        skuPrices.set(canonicalId, [])
      }
      skuPrices.get(canonicalId)!.push({ skuId: sku.id, price: sku.rawPrice })
    }

    const insightResult = await this.insight.generateInsights(
      dealerId,
      skuPrices,
      this.benchmark.getBenchmarks()
    )

    return {
      stages: {
        parse: {
          timeMs: parseTime,
          throughput: feed.stats.total / (parseTime / 1000),
        },
        ingest: {
          timeMs: ingestResult.processingTimeMs,
          skuCount: ingestResult.dealerSkuIds.length,
          quarantineCount: ingestResult.quarantineIds.length,
          batchJobs: ingestResult.batchJobs,
        },
        match: {
          timeMs: totalMatchTime,
          matchedCount: totalMatched,
          autoCreatedCount: totalAutoCreated,
        },
        benchmark: {
          timeMs: benchmarkResult.processingTimeMs,
          calculatedCount: benchmarkResult.calculatedCount,
        },
        insight: {
          timeMs: insightResult.processingTimeMs,
          insightCount: insightResult.insightCount,
        },
      },
      totalTimeMs: performance.now() - totalStartTime,
    }
  }

  reset(): void {
    this.feedIngest.reset()
    this.skuMatch.reset()
    this.benchmark.reset()
    this.insight.reset()
  }
}

// ============================================================================
// PIPELINE SCALE TESTS
// ============================================================================

describe('Full Pipeline Scale Tests', () => {
  let pipeline: PipelineSimulator

  beforeEach(() => {
    pipeline = new PipelineSimulator()
  })

  afterEach(() => {
    pipeline.reset()
  })

  describe('Hobbyist Pipeline', () => {
    const tier: DealerTier = 'hobbyist'

    it('processes hobbyist catalog through full pipeline', async () => {
      const feed = generateDealerFeed({
        tier,
        count: 150,
        quality: 'good',
        seed: 12345,
        format: 'json',
      })

      const result = await pipeline.runPipeline('dealer-1', 'feed-1', feed)

      console.log('\nHobbyist Pipeline Results:')
      console.table(result.stages)
      console.log(`Total time: ${result.totalTimeMs.toFixed(2)}ms`)

      expect(result.stages.ingest.skuCount + result.stages.ingest.quarantineCount)
        .toBeGreaterThan(0)
      expect(result.totalTimeMs).toBeLessThan(5000) // 5 seconds max
    })
  })

  describe('Serious Seller Pipeline', () => {
    const tier: DealerTier = 'serious'

    it('processes serious catalog through full pipeline', async () => {
      const feed = generateDealerFeed({
        tier,
        count: 800,
        quality: 'good',
        seed: 12345,
        format: 'json',
      })

      const result = await pipeline.runPipeline('dealer-1', 'feed-1', feed)

      console.log('\nSerious Seller Pipeline Results:')
      console.table(result.stages)
      console.log(`Total time: ${result.totalTimeMs.toFixed(2)}ms`)

      // Verify batch jobs were created correctly
      expect(result.stages.ingest.batchJobs).toBe(
        Math.ceil(result.stages.ingest.skuCount / 100)
      )
      expect(result.totalTimeMs).toBeLessThan(15000) // 15 seconds max
    }, 20000)

    it('handles high quarantine rate gracefully', async () => {
      const feed = generateDealerFeed({
        tier,
        count: 500,
        quality: 'poor', // High missing UPC rate
        seed: 12345,
        format: 'json',
      })

      const result = await pipeline.runPipeline('dealer-1', 'feed-1', feed)

      // Should still complete even with high quarantine rate
      expect(result.stages.ingest.quarantineCount).toBeGreaterThan(
        result.stages.ingest.skuCount * 0.2 // At least 20% quarantined
      )
    }, 20000)
  })

  describe('National Operation Pipeline', () => {
    const tier: DealerTier = 'national'

    it('processes national catalog through full pipeline', async () => {
      const feed = generateDealerFeed({
        tier,
        count: 3000,
        quality: 'good',
        seed: 12345,
        format: 'json',
      })

      const result = await pipeline.runPipeline('dealer-1', 'feed-1', feed)

      console.log('\nNational Operation Pipeline Results:')
      console.table(result.stages)
      console.log(`Total time: ${result.totalTimeMs.toFixed(2)}ms`)

      // Should create 30 batch jobs (3000 / 100)
      expect(result.stages.ingest.batchJobs).toBeGreaterThanOrEqual(
        Math.floor(result.stages.ingest.skuCount / 100)
      )
      expect(result.totalTimeMs).toBeLessThan(60000) // 1 minute max
    }, 90000)
  })

  describe('Top-Tier Pipeline', () => {
    const tier: DealerTier = 'top-tier'

    it('processes top-tier catalog through full pipeline', async () => {
      const feed = generateDealerFeed({
        tier,
        count: 5000,
        quality: 'good',
        seed: 12345,
        format: 'json',
      })

      const result = await pipeline.runPipeline('dealer-1', 'feed-1', feed)

      console.log('\nTop-Tier Pipeline Results:')
      console.table(result.stages)
      console.log(`Total time: ${result.totalTimeMs.toFixed(2)}ms`)

      // Verify benchmarks were calculated
      expect(result.stages.benchmark.calculatedCount).toBeGreaterThan(0)
      expect(result.totalTimeMs).toBeLessThan(180000) // 3 minutes max
    }, 240000)
  })
})

// ============================================================================
// BOTTLENECK ANALYSIS TESTS
// ============================================================================

describe('Pipeline Bottleneck Analysis', () => {
  let pipeline: PipelineSimulator

  beforeEach(() => {
    pipeline = new PipelineSimulator()
  })

  afterEach(() => {
    pipeline.reset()
  })

  it('identifies slowest stage across catalog sizes', async () => {
    const sizes = [100, 500, 1000, 2000]
    const stageTimings: Record<number, Record<string, number>> = {}

    for (const size of sizes) {
      const feed = generateDealerFeed({
        tier: 'national',
        count: size,
        quality: 'good',
        seed: 12345,
        format: 'json',
      })

      const result = await pipeline.runPipeline('dealer-1', 'feed-1', feed)
      pipeline.reset()

      stageTimings[size] = {
        parse: result.stages.parse.timeMs,
        ingest: result.stages.ingest.timeMs,
        match: result.stages.match.timeMs,
        benchmark: result.stages.benchmark.timeMs,
        insight: result.stages.insight.timeMs,
      }
    }

    console.log('\nStage Timings by Catalog Size (ms):')
    console.table(stageTimings)

    // Identify the stage that scales worst
    const scalingFactors: Record<string, number> = {}
    const stages = ['parse', 'ingest', 'match', 'benchmark', 'insight']

    for (const stage of stages) {
      const small = stageTimings[100][stage]
      const large = stageTimings[2000][stage]
      scalingFactors[stage] = large / Math.max(small, 0.1) // Avoid division by zero
    }

    console.log('\nScaling Factors (2000 SKUs / 100 SKUs):')
    console.table(scalingFactors)

    // Parse and ingest should scale roughly linearly (factor < 25 for 20x data)
    expect(scalingFactors.parse).toBeLessThan(30)
    expect(scalingFactors.ingest).toBeLessThan(30)
  }, 120000)

  it('measures throughput degradation under load', async () => {
    const results: { size: number; throughput: number; perStage: Record<string, number> }[] = []

    for (const size of [500, 1000, 2000, 4000]) {
      const feed = generateDealerFeed({
        tier: 'national',
        count: size,
        quality: 'good',
        seed: 12345,
        format: 'json',
      })

      const result = await pipeline.runPipeline('dealer-1', 'feed-1', feed)
      pipeline.reset()

      results.push({
        size,
        throughput: size / (result.totalTimeMs / 1000),
        perStage: {
          parse: size / (result.stages.parse.timeMs / 1000),
          ingest: result.stages.ingest.skuCount / (result.stages.ingest.timeMs / 1000),
          match: (result.stages.match.matchedCount + result.stages.match.autoCreatedCount) /
            (result.stages.match.timeMs / 1000),
        },
      })
    }

    console.log('\nThroughput by Catalog Size (items/sec):')
    console.table(results.map(r => ({
      size: r.size,
      overall: r.throughput.toFixed(0),
      parse: r.perStage.parse.toFixed(0),
      ingest: r.perStage.ingest.toFixed(0),
      match: r.perStage.match.toFixed(0),
    })))

    // Throughput should not degrade by more than 75% (allows for O(n log n) or worse scaling)
    // At 8x data size (4000 vs 500), expect at least 25% of original throughput
    const smallThroughput = results[0].throughput
    const largeThroughput = results[results.length - 1].throughput
    expect(largeThroughput).toBeGreaterThan(smallThroughput * 0.25)
  }, 180000)
})

// ============================================================================
// CONCURRENT PROCESSING SIMULATION
// ============================================================================

describe('Concurrent Dealer Processing', () => {
  it('simulates multiple dealers processing simultaneously', async () => {
    const dealerCount = 5
    const skusPerDealer = 500

    const pipelines = Array.from({ length: dealerCount }, () => new PipelineSimulator())
    const feeds = Array.from({ length: dealerCount }, (_, i) =>
      generateDealerFeed({
        tier: 'serious',
        count: skusPerDealer,
        quality: 'good',
        seed: 12345 + i,
        format: 'json',
      })
    )

    const startTime = performance.now()

    // Process all dealers concurrently
    const results = await Promise.all(
      pipelines.map((pipeline, i) =>
        pipeline.runPipeline(`dealer-${i}`, `feed-${i}`, feeds[i])
      )
    )

    const totalTime = performance.now() - startTime

    console.log(`\nConcurrent Processing (${dealerCount} dealers × ${skusPerDealer} SKUs):`)
    console.log(`Total wall-clock time: ${totalTime.toFixed(2)}ms`)
    console.log(`Individual processing times: ${results.map(r => r.totalTimeMs.toFixed(0)).join(', ')}ms`)
    console.log(`Combined throughput: ${(dealerCount * skusPerDealer / (totalTime / 1000)).toFixed(0)} items/sec`)

    // All should complete successfully
    for (const result of results) {
      expect(result.stages.ingest.skuCount + result.stages.ingest.quarantineCount)
        .toBeGreaterThan(0)
    }

    // Cleanup
    pipelines.forEach(p => p.reset())
  }, 60000)
})

// ============================================================================
// DATA QUALITY IMPACT TESTS
// ============================================================================

describe('Data Quality Impact on Pipeline', () => {
  let pipeline: PipelineSimulator

  beforeEach(() => {
    pipeline = new PipelineSimulator()
  })

  afterEach(() => {
    pipeline.reset()
  })

  it.each(['excellent', 'good', 'fair', 'poor'] as const)(
    'measures pipeline efficiency with %s data quality',
    async (quality) => {
      const feed = generateDealerFeed({
        tier: 'serious',
        count: 1000,
        quality,
        seed: 12345,
        format: 'json',
      })

      const result = await pipeline.runPipeline('dealer-1', 'feed-1', feed)

      const efficiency = {
        quality,
        indexableRate: (result.stages.ingest.skuCount / 1000 * 100).toFixed(1) + '%',
        quarantineRate: (result.stages.ingest.quarantineCount / 1000 * 100).toFixed(1) + '%',
        matchRate: (result.stages.match.matchedCount / Math.max(result.stages.ingest.skuCount, 1) * 100).toFixed(1) + '%',
        insightCount: result.stages.insight.insightCount,
        totalTimeMs: result.totalTimeMs.toFixed(0),
      }

      console.log(`Quality "${quality}":`, efficiency)

      // Better quality should yield higher indexable rate
      if (quality === 'excellent') {
        expect(result.stages.ingest.skuCount / 1000).toBeGreaterThan(0.90)
      } else if (quality === 'poor') {
        expect(result.stages.ingest.quarantineCount / 1000).toBeGreaterThan(0.15)
      }
    },
    30000
  )
})
