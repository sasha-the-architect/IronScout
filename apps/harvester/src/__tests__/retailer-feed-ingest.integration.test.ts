import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import { randomUUID } from 'crypto'
import type { PrismaClient } from '@ironscout/db/generated/prisma'

vi.mock('bullmq', () => ({
  Worker: class MockWorker {
    constructor() {}
    on() {}
  },
  Job: class MockJob {},
}))

vi.mock('@ironscout/notifications', () => ({
  notifyFeedFailed: vi.fn(),
  notifyFeedRecovered: vi.fn(),
  notifyFeedWarning: vi.fn(),
  notifyMerchantSubscriptionExpired: vi.fn(),
  wrapLoggerWithSlack: vi.fn((logger: unknown) => logger),
}))

vi.mock('../config/queues', () => ({
  QUEUE_NAMES: { RETAILER_FEED_INGEST: 'retailer-feed-ingest' },
}))

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const describeIntegration = TEST_DATABASE_URL ? describe : describe.skip

describeIntegration('Retailer feed ingest integration', () => {
  let prisma: PrismaClient
  let processFeedIngest: (job: any) => Promise<any>
  let resetDb: (client: PrismaClient) => Promise<void>
  let disconnectTestClient: (client: PrismaClient) => Promise<void>

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) {
      throw new Error('TEST_DATABASE_URL required for integration tests')
    }

    process.env.DATABASE_URL = TEST_DATABASE_URL
    delete (globalThis as { prisma?: unknown }).prisma

    const dbUtils = await import('@ironscout/db/test-utils')
    prisma = dbUtils.createTestDb()
    resetDb = dbUtils.resetDb
    disconnectTestClient = dbUtils.disconnectTestClient

    await resetDb(prisma)

    const module = await import('../merchant/feed-ingest')
    processFeedIngest = module.processFeedIngest
  })

  afterAll(async () => {
    if (prisma && disconnectTestClient) {
      await disconnectTestClient(prisma)
    }
  })

  async function truncateTables() {
    const tables = [
      'retailer_feed_runs',
      'retailer_feeds',
      'retailer_skus',
      'quarantined_records',
      'prices',
      'merchant_retailers',
      'merchant_contacts',
      'merchants',
      'retailers',
    ]
    const tableList = tables.map((table) => `"${table}"`).join(', ')
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableList} CASCADE;`)
  }

  beforeEach(async () => {
    await truncateTables()
  })

  async function seedRetailerFeed() {
    const merchant = await prisma.merchants.create({
      data: {
        id: randomUUID(),
        businessName: 'E2E Merchant',
        websiteUrl: 'https://merchant.example',
        contactFirstName: 'E2E',
        contactLastName: 'Merchant',
        status: 'ACTIVE',
        tier: 'FOUNDING',
        updatedAt: new Date(),
      },
    })

    await prisma.merchant_contacts.create({
      data: {
        id: randomUUID(),
        merchantId: merchant.id,
        firstName: 'E2E',
        lastName: 'Contact',
        email: 'e2e-contact@example.com',
        communicationOptIn: true,
        updatedAt: new Date(),
      },
    })

    const retailer = await prisma.retailers.create({
      data: {
        id: randomUUID(),
        name: 'E2E Retailer',
        website: 'https://retailer.example',
        updatedAt: new Date(),
      },
    })

    await prisma.merchant_retailers.create({
      data: {
        id: randomUUID(),
        merchantId: merchant.id,
        retailerId: retailer.id,
        status: 'ACTIVE',
        listingStatus: 'LISTED',
        updatedAt: new Date(),
      },
    })

    const feed = await prisma.retailer_feeds.create({
      data: {
        id: randomUUID(),
        retailerId: retailer.id,
        url: 'https://example.com/feed.csv',
        accessType: 'URL',
        formatType: 'GENERIC',
        status: 'PENDING',
        updatedAt: new Date(),
      },
    })

    const run = await prisma.retailer_feed_runs.create({
      data: {
        id: randomUUID(),
        retailerId: retailer.id,
        feedId: feed.id,
        status: 'PENDING',
        startedAt: new Date(),
      },
    })

    return { merchant, retailer, feed, run }
  }

  function buildJobData(overrides: Record<string, unknown> = {}) {
    return {
      accessType: 'URL',
      formatType: 'GENERIC',
      url: 'https://example.com/feed.csv',
      adminOverride: false,
      ...overrides,
    }
  }

  const sampleCsv = [
    'upc,title,price,url',
    '012345678901,Test 9mm FMJ,18.99,https://example.com/product',
  ].join('\n')

  it('ingests a feed and writes retailer_skus', async () => {
    const { retailer, feed, run } = await seedRetailerFeed()

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () => Promise.resolve(sampleCsv),
    })
    ;(globalThis as { fetch?: unknown }).fetch = mockFetch

    const job = {
      id: 'job-1',
      attemptsMade: 0,
      data: buildJobData({ retailerId: retailer.id, feedId: feed.id, feedRunId: run.id }),
    }

    await processFeedIngest(job)

    const runRow = await prisma.retailer_feed_runs.findUnique({ where: { id: run.id } })
    const feedRow = await prisma.retailer_feeds.findUnique({ where: { id: feed.id } })
    const skuCount = await prisma.retailer_skus.count({ where: { retailerId: retailer.id } })

    expect(runRow?.status).toBe('SUCCESS')
    expect(feedRow?.status).toBe('HEALTHY')
    expect(feedRow?.feedHash).toBeTruthy()
    expect(skuCount).toBe(1)
  })

  it('marks runs as failed on fetch errors', async () => {
    const { retailer, feed, run } = await seedRetailerFeed()

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: () => Promise.resolve(''),
    })
    ;(globalThis as { fetch?: unknown }).fetch = mockFetch

    const job = {
      id: 'job-2',
      attemptsMade: 0,
      data: buildJobData({ retailerId: retailer.id, feedId: feed.id, feedRunId: run.id }),
    }

    await expect(processFeedIngest(job)).rejects.toThrow('Feed fetch failed')

    const runRow = await prisma.retailer_feed_runs.findUnique({ where: { id: run.id } })
    const feedRow = await prisma.retailer_feeds.findUnique({ where: { id: feed.id } })

    expect(runRow?.status).toBe('FAILURE')
    expect(runRow?.primaryErrorCode).toBe('FETCH_ERROR')
    expect(feedRow?.status).toBe('FAILED')
  })

  it('skips ingest when feed content hash is unchanged', async () => {
    const { retailer, feed, run } = await seedRetailerFeed()

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () => Promise.resolve(sampleCsv),
    })
    ;(globalThis as { fetch?: unknown }).fetch = mockFetch

    const firstJob = {
      id: 'job-3',
      attemptsMade: 0,
      data: buildJobData({ retailerId: retailer.id, feedId: feed.id, feedRunId: run.id }),
    }

    await processFeedIngest(firstJob)

    const secondRun = await prisma.retailer_feed_runs.create({
      data: {
        id: randomUUID(),
        retailerId: retailer.id,
        feedId: feed.id,
        status: 'PENDING',
        startedAt: new Date(),
      },
    })

    const secondJob = {
      id: 'job-4',
      attemptsMade: 0,
      data: buildJobData({ retailerId: retailer.id, feedId: feed.id, feedRunId: secondRun.id }),
    }

    await processFeedIngest(secondJob)

    const secondRunRow = await prisma.retailer_feed_runs.findUnique({ where: { id: secondRun.id } })
    const skuCount = await prisma.retailer_skus.count({ where: { retailerId: retailer.id } })

    expect(secondRunRow?.status).toBe('SUCCESS')
    expect(secondRunRow?.rowCount).toBe(0)
    expect(skuCount).toBe(1)
  })
})
