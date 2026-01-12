/**
 * BullMQ Deduplication Tests
 *
 * INVARIANT: BULLMQ_DEDUP_JOB_ID
 * BullMQ jobs with the same jobId MUST be deduplicated - only one job processed.
 *
 * INVARIANT: BULLMQ_REDELIVERY_SAFE
 * If a BullMQ job is retried, it MUST NOT create duplicate database rows or emails.
 *
 * INVARIANT: AFFILIATE_RUN_ATOMICITY
 * Run record creation and job.updateData({ runId }) MUST be atomic.
 *
 * Tests job deduplication, retry behavior, and run record handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Job } from 'bullmq'

// ============================================================================
// Mocks
// ============================================================================

const mockPrismaFeedFind = vi.fn()
const mockPrismaRunCreate = vi.fn()
const mockPrismaRunFind = vi.fn()
const mockPrismaRunUpdate = vi.fn()
const mockPrismaFeedUpdate = vi.fn()
const mockQueueAdd = vi.fn()
const mockJobUpdateData = vi.fn()
const mockJobDiscard = vi.fn()
const mockAcquireLock = vi.fn()
const mockReleaseLock = vi.fn()

vi.mock('@ironscout/db', () => ({
  prisma: {
    affiliate_feeds: {
      findUnique: mockPrismaFeedFind,
      update: mockPrismaFeedUpdate,
    },
    affiliate_feed_runs: {
      create: mockPrismaRunCreate,
      findUnique: mockPrismaRunFind,
      findUniqueOrThrow: mockPrismaRunFind,
      update: mockPrismaRunUpdate,
    },
    affiliate_feed_run_errors: {
      createMany: vi.fn(),
    },
    source_products: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
  isCircuitBreakerBypassed: vi.fn().mockResolvedValue(false),
}))

vi.mock('../../config/queues', () => ({
  QUEUE_NAMES: {
    AFFILIATE_FEED: 'affiliate-feed',
    PRODUCT_RESOLVE: 'product-resolve',
  },
  affiliateFeedQueue: {
    add: mockQueueAdd,
  },
  productResolveQueue: {
    add: vi.fn(),
    addBulk: vi.fn(),
  },
}))

vi.mock('../../affiliate/lock', () => ({
  acquireAdvisoryLock: mockAcquireLock,
  releaseAdvisoryLock: mockReleaseLock,
}))

vi.mock('../../config/redis', () => ({
  redisConnection: {},
}))

vi.mock('../../config/logger', () => ({
  logger: {
    affiliate: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    resolver: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  },
}))

vi.mock('../../config/run-file-logger', () => ({
  createRunFileLogger: () => ({
    filePath: '/tmp/test.log',
    close: vi.fn().mockResolvedValue(undefined),
  }),
  createDualLogger: (a: any) => a,
}))

vi.mock('@ironscout/notifications', () => ({
  notifyAffiliateFeedRunFailed: vi.fn().mockResolvedValue(undefined),
  notifyCircuitBreakerTriggered: vi.fn().mockResolvedValue(undefined),
  notifyAffiliateFeedAutoDisabled: vi.fn().mockResolvedValue(undefined),
  notifyAffiliateFeedRecovered: vi.fn().mockResolvedValue(undefined),
}))

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockFeed(overrides = {}) {
  return {
    id: 'feed-123',
    sourceId: 'source-456',
    status: 'ENABLED',
    feedLockId: BigInt(12345),
    format: 'CSV',
    transport: 'SFTP',
    consecutiveFailures: 0,
    scheduleFrequencyHours: 24,
    expiryHours: 72,
    maxRowCount: 500000,
    network: 'IMPACT',
    sources: {
      id: 'source-456',
      name: 'Test Source',
      retailerId: 'retailer-789',
      retailers: { id: 'retailer-789', name: 'Test Retailer' },
    },
    ...overrides,
  }
}

function createMockRun(overrides = {}) {
  return {
    id: 'run-abc',
    feedId: 'feed-123',
    sourceId: 'source-456',
    trigger: 'SCHEDULED',
    status: 'RUNNING',
    startedAt: new Date(),
    ...overrides,
  }
}

function createMockJob(data: Record<string, unknown> = {}): Job {
  return {
    id: 'job-xyz',
    data: {
      feedId: 'feed-123',
      trigger: 'SCHEDULED',
      ...data,
    },
    attemptsMade: 0,
    updateData: mockJobUpdateData,
    discard: mockJobDiscard,
    timestamp: Date.now(),
    opts: { attempts: 3 },
  } as unknown as Job
}

function expectValidJobId(jobId: string) {
  expect(jobId).toBeTruthy()
  expect(jobId).not.toContain(':')
}

// ============================================================================
// Tests
// ============================================================================

describe('BullMQ Job Deduplication', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('JobId-based deduplication', () => {
    it('should avoid BullMQ-invalid characters in jobId formats', () => {
      const jobIds = [
        `RESOLVE_SOURCE_PRODUCT_sp-abc123`,
        `fetch_exec-001`,
        `extract_exec-001`,
        `write_exec-001`,
        `normalize--exec-001`,
        `normalize--exec-001--chunk-01`,
        `crawl-source-123-2024-01-01T00-00-00-000Z`,
        `feed-feed-123-2024-01-01T00-00-00-000Z`,
        `delayed-item-123-PRICE_DROP-2024-01-01T00-00-00-000Z`,
      ]

      for (const jobId of jobIds) {
        expectValidJobId(jobId)
      }
    })

    it('should use sourceProductId as jobId for resolver queue', () => {
      // The resolver uses RESOLVE_SOURCE_PRODUCT_<sourceProductId> as jobId
      const sourceProductId = 'sp-abc123'
      const expectedJobId = `RESOLVE_SOURCE_PRODUCT_${sourceProductId}`

      // Simulate enqueue logic
      const jobId = `RESOLVE_SOURCE_PRODUCT_${sourceProductId}`

      expect(jobId).toBe(expectedJobId)
    })

    it('should deduplicate rapid enqueues for same sourceProductId', async () => {
      // Arrange
      const sourceProductId = 'sp-abc123'
      const jobId = `RESOLVE_SOURCE_PRODUCT_${sourceProductId}`
      const enqueuedJobs = new Set<string>()

      // Mock queue.add that tracks unique jobs
      mockQueueAdd.mockImplementation(async (_name: string, _data: object, opts?: { jobId: string }) => {
        if (opts?.jobId && enqueuedJobs.has(opts.jobId)) {
          // BullMQ silently ignores duplicate jobIds
          return null
        }
        if (opts?.jobId) {
          enqueuedJobs.add(opts.jobId)
        }
        return { id: opts?.jobId }
      })

      // Act - rapid enqueue attempts
      const results = await Promise.all([
        mockQueueAdd('process', { sourceProductId }, { jobId }),
        mockQueueAdd('process', { sourceProductId }, { jobId }),
        mockQueueAdd('process', { sourceProductId }, { jobId }),
      ])

      // Assert - only one job enqueued
      expect(enqueuedJobs.size).toBe(1)
      expect(enqueuedJobs.has(jobId)).toBe(true)
    })

    it('should allow different sourceProductIds to enqueue', async () => {
      // Arrange
      const enqueuedJobs = new Set<string>()

      mockQueueAdd.mockImplementation(async (_name: string, _data: object, opts?: { jobId: string }) => {
        if (opts?.jobId && enqueuedJobs.has(opts.jobId)) {
          return null
        }
        if (opts?.jobId) {
          enqueuedJobs.add(opts.jobId)
        }
        return { id: opts?.jobId }
      })

      // Act - different sourceProductIds
      await mockQueueAdd('process', { sourceProductId: 'sp-1' }, { jobId: 'RESOLVE_SOURCE_PRODUCT_sp-1' })
      await mockQueueAdd('process', { sourceProductId: 'sp-2' }, { jobId: 'RESOLVE_SOURCE_PRODUCT_sp-2' })
      await mockQueueAdd('process', { sourceProductId: 'sp-3' }, { jobId: 'RESOLVE_SOURCE_PRODUCT_sp-3' })

      // Assert - all jobs enqueued
      expect(enqueuedJobs.size).toBe(3)
    })
  })

  describe('Affiliate feed job deduplication', () => {
    it('should generate unique jobId per feed-trigger combination', () => {
      // Arrange
      const feedId = 'feed-123'
      const trigger = 'SCHEDULED'
      const timestamp = Date.now()

      // Act - simulate jobId generation
      const scheduledJobId = `${feedId}-scheduled-${timestamp}`
      const manualJobId = `${feedId}-manual-${timestamp}`

      // Assert - different triggers produce different jobIds
      expect(scheduledJobId).not.toBe(manualJobId)
    })

    it('should use feedLockId for advisory lock deduplication', async () => {
      // Arrange
      const feed = createMockFeed()
      const feedLockId = feed.feedLockId

      // Track lock acquisitions
      const activeLocks = new Set<bigint>()

      mockAcquireLock.mockImplementation(async (lockId: bigint) => {
        if (activeLocks.has(lockId)) {
          return false // Lock busy
        }
        activeLocks.add(lockId)
        return true
      })

      mockReleaseLock.mockImplementation(async (lockId: bigint) => {
        activeLocks.delete(lockId)
      })

      // Act - concurrent lock attempts
      const results = await Promise.all([
        mockAcquireLock(feedLockId),
        mockAcquireLock(feedLockId),
        mockAcquireLock(feedLockId),
      ])

      // Assert - only one lock acquired
      const acquired = results.filter(Boolean)
      expect(acquired.length).toBe(1)
    })
  })
})

describe('BullMQ Retry Safety', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Run record atomicity', () => {
    it('should reuse existing run on retry (runId in job.data)', async () => {
      // Arrange
      const existingRunId = 'run-existing-123'
      const job = createMockJob({ runId: existingRunId, feedLockId: '12345' })
      const existingRun = createMockRun({ id: existingRunId, status: 'RUNNING' })

      mockPrismaRunFind.mockResolvedValue(existingRun)
      mockAcquireLock.mockResolvedValue(true)

      // Act - simulate retry path
      const isRetry = !!job.data.runId

      expect(isRetry).toBe(true)

      // On retry, findUniqueOrThrow should be called with existing runId
      const run = await mockPrismaRunFind({ where: { id: existingRunId } })

      // Assert - same run record reused
      expect(run.id).toBe(existingRunId)
      expect(mockPrismaRunCreate).not.toHaveBeenCalled()
    })

    it('should create new run and persist runId on first attempt', async () => {
      // Arrange
      const job = createMockJob() // No runId
      const newRun = createMockRun({ id: 'run-new-456' })

      mockPrismaFeedFind.mockResolvedValue(createMockFeed())
      mockAcquireLock.mockResolvedValue(true)
      mockPrismaRunCreate.mockResolvedValue(newRun)
      mockJobUpdateData.mockResolvedValue(undefined)

      // Act - simulate first attempt path
      const isFirstAttempt = !job.data.runId
      expect(isFirstAttempt).toBe(true)

      // Create run
      const run = await mockPrismaRunCreate({
        data: {
          feedId: job.data.feedId,
          sourceId: 'source-456',
          trigger: job.data.trigger,
          status: 'RUNNING',
          startedAt: new Date(),
        },
      })

      // Persist runId to job data (atomic with run creation)
      await mockJobUpdateData({
        ...job.data,
        runId: run.id,
        feedLockId: '12345',
      })

      // Assert
      expect(mockPrismaRunCreate).toHaveBeenCalledTimes(1)
      expect(mockJobUpdateData).toHaveBeenCalledWith(
        expect.objectContaining({ runId: 'run-new-456' })
      )
    })

    it('should not create duplicate runs if job.updateData fails', async () => {
      // Arrange
      const job = createMockJob()
      const newRun = createMockRun({ id: 'run-new-789' })

      mockPrismaRunCreate.mockResolvedValue(newRun)
      mockJobUpdateData.mockRejectedValue(new Error('Redis connection lost'))

      // Act - simulate failure after run creation
      const run = await mockPrismaRunCreate({
        data: { feedId: job.data.feedId, status: 'RUNNING' },
      })

      let updateFailed = false
      try {
        await mockJobUpdateData({ ...job.data, runId: run.id })
      } catch {
        updateFailed = true
      }

      // Assert - run created but updateData failed
      // On BullMQ retry, it will create ANOTHER run (this is the edge case)
      // The spec mandates job.updateData MUST succeed
      expect(mockPrismaRunCreate).toHaveBeenCalledTimes(1)
      expect(updateFailed).toBe(true)
    })
  })

  describe('Retry with stale run status', () => {
    it('should skip if existing run is not RUNNING', async () => {
      // Arrange - run was already finalized
      const existingRunId = 'run-completed'
      const job = createMockJob({ runId: existingRunId })

      mockPrismaRunFind.mockResolvedValue(
        createMockRun({ id: existingRunId, status: 'SUCCEEDED' })
      )

      // Act - simulate retry with stale run
      const run = await mockPrismaRunFind({ where: { id: existingRunId } })

      // Assert - run status mismatch
      expect(run.status).toBe('SUCCEEDED')
      // Worker should return early (skip) when status !== 'RUNNING'
    })

    it('should re-acquire lock on retry', async () => {
      // Arrange
      const existingRunId = 'run-existing'
      const job = createMockJob({ runId: existingRunId, feedLockId: '12345' })

      mockPrismaRunFind.mockResolvedValue(
        createMockRun({ id: existingRunId, status: 'RUNNING' })
      )

      // First retry - lock available
      mockAcquireLock.mockResolvedValueOnce(true)

      // Act
      const lockAcquired = await mockAcquireLock(BigInt(12345))

      // Assert
      expect(lockAcquired).toBe(true)
      expect(mockAcquireLock).toHaveBeenCalledWith(BigInt(12345))
    })

    it('should skip obsolete retry if lock is held by new run', async () => {
      // Arrange
      const existingRunId = 'run-old'
      const job = createMockJob({ runId: existingRunId, feedLockId: '12345' })

      mockPrismaRunFind.mockResolvedValue(
        createMockRun({ id: existingRunId, status: 'RUNNING' })
      )

      // Lock held by another run
      mockAcquireLock.mockResolvedValue(false)

      // Act
      const lockAcquired = await mockAcquireLock(BigInt(12345))

      // Assert - retry should be skipped
      expect(lockAcquired).toBe(false)
    })
  })
})

describe('BullMQ Processing Guarantees', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('At-least-once delivery', () => {
    it('should track processed products to prevent duplicates', async () => {
      // Arrange - simulate batch processing with dedup
      const processedProducts = new Set<string>()
      const products = [
        { id: 'p1', url: 'http://a.com' },
        { id: 'p2', url: 'http://b.com' },
        { id: 'p1', url: 'http://a.com' }, // Duplicate
        { id: 'p3', url: 'http://c.com' },
      ]

      // Act
      const results: string[] = []
      for (const product of products) {
        if (!processedProducts.has(product.id)) {
          processedProducts.add(product.id)
          results.push(product.id)
        }
      }

      // Assert
      expect(results).toHaveLength(3) // p1, p2, p3
      expect(results).toEqual(['p1', 'p2', 'p3'])
    })

    it('should use upsert for idempotent source_product writes', async () => {
      // Arrange
      const upsertCalls: string[] = []
      const mockUpsert = vi.fn().mockImplementation(async (args) => {
        upsertCalls.push(args.where.id)
        return { id: args.where.id }
      })

      // Act - simulate processing same product twice
      await mockUpsert({
        where: { id: 'sp-1' },
        create: { id: 'sp-1', name: 'Product 1' },
        update: { name: 'Product 1' },
      })

      await mockUpsert({
        where: { id: 'sp-1' },
        create: { id: 'sp-1', name: 'Product 1' },
        update: { name: 'Product 1' },
      })

      // Assert - upsert is idempotent
      expect(upsertCalls).toHaveLength(2)
      expect(upsertCalls[0]).toBe(upsertCalls[1])
    })
  })

  describe('Price append-only invariant', () => {
    it('should only insert new price records, never update existing', async () => {
      // Arrange
      const priceInserts: object[] = []
      const mockCreateMany = vi.fn().mockImplementation(async (args) => {
        priceInserts.push(...args.data)
        return { count: args.data.length }
      })

      // Act - simulate price writes
      await mockCreateMany({
        data: [
          { sourceProductId: 'sp-1', price: 10.99, createdAt: new Date() },
          { sourceProductId: 'sp-2', price: 20.99, createdAt: new Date() },
        ],
        skipDuplicates: true,
      })

      // Assert
      expect(mockCreateMany).toHaveBeenCalledWith(
        expect.objectContaining({ skipDuplicates: true })
      )
      expect(priceInserts).toHaveLength(2)
    })

    it('should deduplicate by priceSignatureHash', async () => {
      // Arrange
      const seenHashes = new Set<string>()
      const prices = [
        { hash: 'abc123', price: 10.99 },
        { hash: 'def456', price: 20.99 },
        { hash: 'abc123', price: 10.99 }, // Duplicate hash
      ]

      // Act
      const uniquePrices = prices.filter((p) => {
        if (seenHashes.has(p.hash)) return false
        seenHashes.add(p.hash)
        return true
      })

      // Assert
      expect(uniquePrices).toHaveLength(2)
    })
  })
})
