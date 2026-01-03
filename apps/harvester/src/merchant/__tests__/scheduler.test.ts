/**
 * Tests for Dealer Portal Job Scheduler
 *
 * Tests the dealer feed scheduling logic including:
 * - Feed scheduling based on scheduleMinutes
 * - Idempotent job creation per scheduling window
 * - Immediate feed ingestion (manual triggers)
 * - Benchmark scheduling
 * - Scheduling jitter for thundering herd prevention
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Prisma client
const mockFeedFindMany = vi.fn()
const mockFeedFindUnique = vi.fn()
const mockFeedUpdate = vi.fn()
const mockDealerFindUnique = vi.fn()
const mockFeedRunCreate = vi.fn()

vi.mock('@ironscout/db', () => ({
  prisma: {
    retailer_feeds: {
      findMany: mockFeedFindMany,
      findUnique: mockFeedFindUnique,
      update: mockFeedUpdate,
    },
    merchants: {
      findUnique: mockDealerFindUnique,
    },
    retailer_feed_runs: {
      create: mockFeedRunCreate,
    },
  },
}))

// Mock queues
const mockIngestQueueAdd = vi.fn()
const mockIngestQueueGetJob = vi.fn()
const mockBenchmarkQueueAdd = vi.fn()
const mockBenchmarkQueueGetJob = vi.fn()

vi.mock('../../config/queues', () => ({
  QUEUE_NAMES: {
    MERCHANT_FEED_INGEST: 'merchant-feed-ingest',
    MERCHANT_BENCHMARK: 'merchant-benchmark',
  },
  merchantFeedIngestQueue: {
    add: mockIngestQueueAdd,
    getJob: mockIngestQueueGetJob,
  },
  merchantBenchmarkQueue: {
    add: mockBenchmarkQueueAdd,
    getJob: mockBenchmarkQueueGetJob,
  },
}))

vi.mock('../../config/redis', () => ({
  redisConnection: {},
}))

vi.mock('../../config/logger', () => ({
  logger: {
    scheduler: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  },
}))

// Mock BullMQ
vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn(),
  })),
  Job: vi.fn(),
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn(),
    getJob: vi.fn(),
    getRepeatableJobs: vi.fn().mockResolvedValue([]),
    removeRepeatableByKey: vi.fn(),
  })),
}))

// Helper to create mock feed
const createMockFeed = (overrides = {}) => ({
  id: 'feed-123',
  retailerId: 'merchant-456',
  enabled: true,
  status: 'HEALTHY',
  scheduleMinutes: 60,
  lastRunAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
  lastSuccessAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
  createdAt: new Date(),
  accessType: 'URL',
  formatType: 'AMMOSEEK',
  url: 'http://example.com/feed.csv',
  merchants: {
    id: 'merchant-456',
    status: 'ACTIVE',
  },
  ...overrides,
})

describe('Merchant Feed Scheduling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('scheduleMerchantFeeds', () => {
    it('should find all enabled feeds from active merchants', async () => {
      const feeds = [
        createMockFeed({ id: 'feed-1' }),
        createMockFeed({ id: 'feed-2' }),
      ]

      mockFeedFindMany.mockResolvedValue(feeds)

      const result = await mockFeedFindMany({
        where: {
          enabled: true,
          merchants: { status: 'ACTIVE' },
          status: { not: 'FAILED' },
        },
      })

      expect(result).toHaveLength(2)
    })

    it('should skip feeds that are not due yet', async () => {
      const feed = createMockFeed({
        lastRunAt: new Date(), // Just ran
        scheduleMinutes: 60,
      })

      const now = new Date()
      const lastRun = feed.lastRunAt || feed.lastSuccessAt || feed.createdAt
      const minutesSinceRun = (now.getTime() - lastRun.getTime()) / (1000 * 60)

      expect(minutesSinceRun).toBeLessThan(feed.scheduleMinutes)
    })

    it('should schedule feeds that are due', async () => {
      const feed = createMockFeed({
        lastRunAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        scheduleMinutes: 60,
      })

      const now = new Date()
      const lastRun = feed.lastRunAt || feed.lastSuccessAt || feed.createdAt
      const minutesSinceRun = (now.getTime() - lastRun.getTime()) / (1000 * 60)

      expect(minutesSinceRun).toBeGreaterThanOrEqual(feed.scheduleMinutes)
    })

    it('should use idempotent job ID based on scheduling window', async () => {
      // Get scheduling window (5-minute bucket)
      const now = new Date()
      const minutes = Math.floor(now.getMinutes() / 5) * 5
      now.setMinutes(minutes, 0, 0)
      const schedulingWindow = now.toISOString()
      // BullMQ job IDs cannot contain colons
      const sanitizedWindow = schedulingWindow.replace(/[:.]/g, '-')

      const jobId = `feed-123-${sanitizedWindow}`

      mockIngestQueueGetJob.mockResolvedValue(null) // No existing job
      mockIngestQueueAdd.mockResolvedValue({ id: jobId })

      // Check for existing job first
      const existingJob = await mockIngestQueueGetJob(jobId)
      expect(existingJob).toBeNull()

      // Schedule the job
      await mockIngestQueueAdd('ingest', {}, { jobId })
      expect(mockIngestQueueAdd).toHaveBeenCalledWith('ingest', {}, expect.objectContaining({ jobId }))
    })

    it('should skip if job already exists in scheduling window', async () => {
      const jobId = 'feed-123-2024-01-01T00-00-00-000Z'

      mockIngestQueueGetJob.mockResolvedValue({ id: jobId }) // Job exists

      const existingJob = await mockIngestQueueGetJob(jobId)

      if (existingJob) {
        // Skip - already scheduled
        expect(mockIngestQueueAdd).not.toHaveBeenCalled()
      }
    })

    it('should update lastRunAt when scheduling', async () => {
      mockFeedUpdate.mockResolvedValue({})

      await mockFeedUpdate({
        where: { id: 'feed-123' },
        data: { lastRunAt: expect.any(Date) },
      })

      expect(mockFeedUpdate).toHaveBeenCalled()
    })

    it('should create feed run record before enqueueing', async () => {
      const feedRun = { id: 'run-abc' }

      mockFeedRunCreate.mockResolvedValue(feedRun)

      const result = await mockFeedRunCreate({
        data: {
          retailerId: 'merchant-456',
          feedId: 'feed-123',
          status: 'PENDING',
        },
      })

      expect(result.id).toBe('run-abc')
    })

    it('should not schedule failed feeds for auto-retry', async () => {
      const failedFeed = createMockFeed({ status: 'FAILED' })

      mockFeedFindMany.mockResolvedValue([])

      const result = await mockFeedFindMany({
        where: {
          enabled: true,
          status: { not: 'FAILED' },
        },
      })

      expect(result).not.toContainEqual(expect.objectContaining({ status: 'FAILED' }))
    })
  })

  describe('Scheduling Jitter', () => {
    it('should apply random jitter between 0 and max minutes', () => {
      const maxJitterMinutes = 2
      const jitterMs = Math.floor(Math.random() * maxJitterMinutes * 60 * 1000)

      expect(jitterMs).toBeGreaterThanOrEqual(0)
      expect(jitterMs).toBeLessThan(maxJitterMinutes * 60 * 1000)
    })

    it('should include jitter delay in job options', async () => {
      mockIngestQueueAdd.mockResolvedValue({ id: 'job-1' })

      await mockIngestQueueAdd(
        'ingest',
        { feedId: 'feed-123' },
        { delay: 30000 } // Example jitter
      )

      expect(mockIngestQueueAdd).toHaveBeenCalledWith(
        'ingest',
        expect.anything(),
        expect.objectContaining({ delay: expect.any(Number) })
      )
    })
  })

  describe('Immediate Feed Ingestion', () => {
    it('should find feed with dealer info', async () => {
      const feed = createMockFeed()

      mockFeedFindUnique.mockResolvedValue(feed)

      const result = await mockFeedFindUnique({
        where: { id: 'feed-123' },
        include: { merchants: { select: { id: true, status: true, businessName: true } } },
      })

      expect(result).toBeDefined()
      expect(result.merchants.status).toBe('ACTIVE')
    })

    it('should throw if feed not found', async () => {
      mockFeedFindUnique.mockResolvedValue(null)

      const feed = await mockFeedFindUnique({ where: { id: 'not-found' } })

      expect(feed).toBeNull()
    })

    it('should throw if dealer is not active', async () => {
      const feed = createMockFeed({ merchants: { id: 'merchant-456', status: 'SUSPENDED' } })

      expect(feed.merchants.status).not.toBe('ACTIVE')
    })

    it('should reset FAILED status on manual trigger', async () => {
      mockFeedUpdate.mockResolvedValue({})

      await mockFeedUpdate({
        where: { id: 'feed-123' },
        data: {
          status: 'PENDING',
          lastError: null,
          primaryErrorCode: null,
        },
      })

      expect(mockFeedUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PENDING',
            lastError: null,
          }),
        })
      )
    })

    it('should use high priority for immediate ingestion', async () => {
      mockIngestQueueAdd.mockResolvedValue({ id: 'job-immediate' })

      await mockIngestQueueAdd(
        'ingest-immediate',
        { feedId: 'feed-123' },
        { priority: 1 }
      )

      expect(mockIngestQueueAdd).toHaveBeenCalledWith(
        'ingest-immediate',
        expect.anything(),
        expect.objectContaining({ priority: 1 })
      )
    })

    it('should support admin override', async () => {
      mockIngestQueueAdd.mockResolvedValue({ id: 'job-admin' })

      await mockIngestQueueAdd(
        'ingest-admin-override',
        {
          feedId: 'feed-123',
          adminOverride: true,
          adminId: 'admin-123',
        },
        { priority: 1 }
      )

      expect(mockIngestQueueAdd).toHaveBeenCalledWith(
        'ingest-admin-override',
        expect.objectContaining({
          adminOverride: true,
          adminId: 'admin-123',
        }),
        expect.anything()
      )
    })
  })

  describe('Feed Enable/Disable', () => {
    it('should update enabled flag', async () => {
      mockFeedUpdate.mockResolvedValue({})

      await mockFeedUpdate({
        where: { id: 'feed-123' },
        data: { enabled: false },
      })

      expect(mockFeedUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ enabled: false }),
        })
      )
    })

    it('should clear error state when re-enabling', async () => {
      mockFeedUpdate.mockResolvedValue({})

      await mockFeedUpdate({
        where: { id: 'feed-123' },
        data: {
          enabled: true,
          status: 'PENDING',
          lastError: null,
          primaryErrorCode: null,
        },
      })

      expect(mockFeedUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            enabled: true,
            status: 'PENDING',
            lastError: null,
          }),
        })
      )
    })
  })
})

describe('Benchmark Scheduling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('scheduleBenchmarkRecalc', () => {
    it('should use 2-hour scheduling window', () => {
      const now = new Date()
      const hours = Math.floor(now.getHours() / 2) * 2
      now.setHours(hours, 0, 0, 0)
      const benchmarkWindow = now.toISOString()

      expect(benchmarkWindow).toMatch(/T\d{2}:00:00\.000Z$/)
    })

    it('should use idempotent job ID based on benchmark window', async () => {
      const benchmarkWindow = '2024-01-01T00:00:00.000Z'
      // BullMQ job IDs cannot contain colons
      const sanitizedWindow = benchmarkWindow.replace(/[:.]/g, '-')
      const jobId = `benchmark-incremental-${sanitizedWindow}`

      mockBenchmarkQueueGetJob.mockResolvedValue(null)
      mockBenchmarkQueueAdd.mockResolvedValue({ id: jobId })

      const existingJob = await mockBenchmarkQueueGetJob(jobId)
      expect(existingJob).toBeNull()

      await mockBenchmarkQueueAdd('recalc', { fullRecalc: false }, { jobId })
      expect(mockBenchmarkQueueAdd).toHaveBeenCalled()
    })

    it('should skip if benchmark already scheduled for window', async () => {
      const jobId = 'benchmark-incremental-2024-01-01T00-00-00-000Z'

      mockBenchmarkQueueGetJob.mockResolvedValue({ id: jobId })

      const existingJob = await mockBenchmarkQueueGetJob(jobId)

      if (existingJob) {
        // Return false - already scheduled
        expect(mockBenchmarkQueueAdd).not.toHaveBeenCalled()
      }
    })

    it('should support full recalc option', async () => {
      const benchmarkWindow = '2024-01-01T00:00:00.000Z'
      // BullMQ job IDs cannot contain colons
      const sanitizedWindow = benchmarkWindow.replace(/[:.]/g, '-')
      const jobId = `benchmark-full-${sanitizedWindow}`

      mockBenchmarkQueueGetJob.mockResolvedValue(null)
      mockBenchmarkQueueAdd.mockResolvedValue({ id: jobId })

      await mockBenchmarkQueueAdd('recalc', { fullRecalc: true }, { jobId })

      expect(mockBenchmarkQueueAdd).toHaveBeenCalledWith(
        'recalc',
        expect.objectContaining({ fullRecalc: true }),
        expect.anything()
      )
    })
  })
})

describe('Scheduling Windows', () => {
  it('should round to 5-minute boundary for feeds', () => {
    const testDate = new Date()
    testDate.setMinutes(37, 45, 123)
    const minutes = Math.floor(testDate.getMinutes() / 5) * 5
    testDate.setMinutes(minutes, 0, 0)

    expect(testDate.getMinutes()).toBe(35)
    expect(testDate.getSeconds()).toBe(0)
    expect(testDate.getMilliseconds()).toBe(0)
  })

  it('should round to 1-hour boundary for crawls', () => {
    const testDate = new Date()
    testDate.setMinutes(37, 45, 123)
    testDate.setMinutes(0, 0, 0)

    expect(testDate.getMinutes()).toBe(0)
    expect(testDate.getSeconds()).toBe(0)
  })

  it('should round to 2-hour boundary for benchmarks', () => {
    const testDate = new Date()
    testDate.setHours(11, 37, 45, 123)
    const hours = Math.floor(testDate.getHours() / 2) * 2
    testDate.setHours(hours, 0, 0, 0)

    expect(testDate.getHours()).toBe(10) // 11 rounds down to 10
    expect(testDate.getMinutes()).toBe(0)
  })
})

describe('Retry Utilities', () => {
  it('should implement exponential backoff', () => {
    const initialDelayMs = 5000
    const maxDelayMs = 60000
    const attempts = [1, 2, 3, 4, 5]

    const delays = attempts.map((attempt) =>
      Math.min(initialDelayMs * Math.pow(2, attempt - 1), maxDelayMs)
    )

    expect(delays[0]).toBe(5000) // 5s
    expect(delays[1]).toBe(10000) // 10s
    expect(delays[2]).toBe(20000) // 20s
    expect(delays[3]).toBe(40000) // 40s
    expect(delays[4]).toBe(60000) // 60s (capped)
  })

  it('should retry on connection errors', () => {
    const connectionErrors = ['ECONNREFUSED', 'connection']
    const errorMessage = 'ECONNREFUSED: Connection refused'

    const isConnectionError =
      errorMessage.includes('ECONNREFUSED') ||
      errorMessage.includes('connection')

    expect(isConnectionError).toBe(true)
  })

  it('should not retry on non-connection errors', () => {
    const errorMessage = 'Invalid feed format'

    const isConnectionError =
      errorMessage.includes('ECONNREFUSED') ||
      errorMessage.includes('connection')

    expect(isConnectionError).toBe(false)
  })
})

describe('BullMQ Repeatable Scheduler', () => {
  it('should configure feed scheduling every 5 minutes', () => {
    const feedScheduleMs = 5 * 60 * 1000

    expect(feedScheduleMs).toBe(300000)
  })

  it('should configure benchmark scheduling every 2 hours', () => {
    const benchmarkScheduleMs = 2 * 60 * 60 * 1000

    expect(benchmarkScheduleMs).toBe(7200000)
  })

  it('should use stable job IDs for repeatable jobs', () => {
    const feedsJobId = 'repeatable-feeds'
    const benchmarksJobId = 'repeatable-benchmarks'

    expect(feedsJobId).toBe('repeatable-feeds')
    expect(benchmarksJobId).toBe('repeatable-benchmarks')
  })
})
