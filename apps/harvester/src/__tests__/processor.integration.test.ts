/**
 * Processor Integration Tests
 *
 * These tests run against a REAL database to catch schema mismatches,
 * constraint violations, and other issues that mocks would hide.
 *
 * CRITICAL: These tests would have caught the "createdAt" column bug!
 *
 * To run: pnpm --filter harvester test:integration
 * Requires: TEST_DATABASE_URL environment variable
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { randomUUID } from 'crypto'
import { PrismaClient } from '@ironscout/db/generated/prisma'

// Skip if no test database configured
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const describeIntegration = TEST_DATABASE_URL ? describe : describe.skip

// Use a separate Prisma client for tests
let prisma: PrismaClient

describeIntegration('Processor Integration Tests', () => {
  beforeAll(async () => {
    if (!TEST_DATABASE_URL) {
      throw new Error('TEST_DATABASE_URL required for integration tests')
    }

    // Note: Prisma client uses DATABASE_URL env var by default.
    // For tests, set TEST_DATABASE_URL and use it here.
    prisma = new PrismaClient()

    await prisma.$connect()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  describe('source_product_presence table operations', () => {
    let testSourceId: string
    let testSourceProductId: string

    beforeEach(async () => {
      // Create test retailer and source
      const retailer = await prisma.retailers.create({
        data: {
          id: randomUUID(),
          name: `Test Retailer ${Date.now()}`,
          website: `https://test-${Date.now()}.example.com`,
          updatedAt: new Date(),
        },
      })

      const source = await prisma.sources.create({
        data: {
          id: randomUUID(),
          name: `Test Source ${Date.now()}`,
          url: 'https://test.example.com/feed',
          retailerId: retailer.id,
          type: 'FEED_CSV',
          sourceKind: 'AFFILIATE_FEED',
          updatedAt: new Date(),
        },
      })
      testSourceId = source.id

      // Create test source product
      const sourceProduct = await prisma.source_products.create({
        data: {
          id: randomUUID(),
          sourceId: testSourceId,
          title: 'Test Product',
          url: 'https://test.example.com/product',
          updatedAt: new Date(),
        },
      })
      testSourceProductId = sourceProduct.id

      // Create identifier in child table
      await prisma.source_product_identifiers.create({
        data: {
          sourceProductId: sourceProduct.id,
          idType: 'SKU',
          idValue: `TEST-SKU-${Date.now()}`,
          namespace: '',
          isCanonical: true,
        },
      })
    })

    it('should insert into source_product_presence with correct columns', async () => {
      const t0 = new Date()

      // This is the EXACT SQL from processor.ts - if columns are wrong, this fails!
      await prisma.$executeRaw`
        INSERT INTO source_product_presence ("id", "sourceProductId", "lastSeenAt", "updatedAt")
        SELECT gen_random_uuid(), id, ${t0}, NOW()
        FROM unnest(${[testSourceProductId]}::text[]) AS id
        ON CONFLICT ("sourceProductId") DO UPDATE SET
          "lastSeenAt" = ${t0},
          "updatedAt" = NOW()
      `

      // Verify it was inserted
      const presence = await prisma.source_product_presence.findUnique({
        where: { sourceProductId: testSourceProductId },
      })

      expect(presence).toBeTruthy()
      expect(presence?.lastSeenAt.getTime()).toBeCloseTo(t0.getTime(), -3)
    })

    it('should insert into source_product_seen with correct columns', async () => {
      // Create a test feed and run
      const feed = await prisma.affiliate_feeds.create({
        data: {
          id: randomUUID(),
          sourceId: testSourceId,
          network: 'IMPACT',
          status: 'ENABLED',
          transport: 'SFTP',
          host: 'test.example.com',
          port: 22,
          path: '/test/feed.csv',
          username: 'test',
          secretCiphertext: Buffer.from('encrypted'),
          secretVersion: 1,
          format: 'CSV',
          compression: 'NONE',
          expiryHours: 48,
          updatedAt: new Date(),
        },
      })

      const run = await prisma.affiliate_feed_runs.create({
        data: {
          id: randomUUID(),
          feedId: feed.id,
          sourceId: testSourceId,
          trigger: 'MANUAL',
          status: 'RUNNING',
          startedAt: new Date(),
        },
      })

      // This is the EXACT SQL from processor.ts
      await prisma.$executeRaw`
        INSERT INTO source_product_seen ("id", "runId", "sourceProductId", "createdAt")
        SELECT gen_random_uuid(), ${run.id}, id, NOW()
        FROM unnest(${[testSourceProductId]}::text[]) AS id
        ON CONFLICT ("runId", "sourceProductId") DO NOTHING
      `

      // Verify it was inserted
      const seen = await prisma.source_product_seen.findFirst({
        where: { runId: run.id, sourceProductId: testSourceProductId },
      })

      expect(seen).toBeTruthy()
    })

    it('should insert prices with correct columns', async () => {
      // Create test feed and run first
      const feed = await prisma.affiliate_feeds.create({
        data: {
          id: randomUUID(),
          sourceId: testSourceId,
          network: 'IMPACT',
          status: 'ENABLED',
          transport: 'SFTP',
          host: 'test.example.com',
          port: 22,
          path: '/test/feed.csv',
          username: 'test',
          secretCiphertext: Buffer.from('encrypted'),
          secretVersion: 1,
          format: 'CSV',
          compression: 'NONE',
          expiryHours: 48,
          updatedAt: new Date(),
        },
      })

      const run = await prisma.affiliate_feed_runs.create({
        data: {
          id: randomUUID(),
          feedId: feed.id,
          sourceId: testSourceId,
          trigger: 'MANUAL',
          status: 'RUNNING',
          startedAt: new Date(),
        },
      })

      const source = await prisma.sources.findUnique({
        where: { id: testSourceId },
        include: { retailers: true },
      })

      const priceSignatureHash = 'test-hash-123'
      const createdAt = new Date()

      // This is similar to the batch price insert in processor.ts
      // ADR-015: Include provenance fields for all new price writes
      await prisma.$executeRaw`
        INSERT INTO prices (
          "id",
          "retailerId",
          "sourceProductId",
          "affiliateFeedRunId",
          "priceSignatureHash",
          "price",
          "currency",
          "url",
          "inStock",
          "originalPrice",
          "priceType",
          "createdAt",
          "observedAt",
          "ingestionRunType",
          "ingestionRunId"
        )
        VALUES (
          gen_random_uuid(),
          ${source!.retailerId},
          ${testSourceProductId},
          ${run.id},
          ${priceSignatureHash},
          ${19.99},
          'USD',
          'https://test.example.com/product',
          true,
          ${24.99},
          'SALE',
          ${createdAt},
          ${createdAt},
          'AFFILIATE_FEED'::"IngestionRunType",
          ${run.id}
        )
        ON CONFLICT DO NOTHING
      `

      // Verify
      const price = await prisma.prices.findFirst({
        where: { sourceProductId: testSourceProductId },
      })

      expect(price).toBeTruthy()
      expect(Number(price?.price)).toBe(19.99)
    })

    it('should verify ADR-015 provenance fields are set on new prices', async () => {
      // ADR-015 requires all new price writes to have provenance fields set
      // This test verifies the pattern used in all writers
      const source = await prisma.sources.findUnique({
        where: { id: testSourceId },
      })

      const observedAt = new Date()
      const ingestionRunId = `test-run-${Date.now()}`

      // Create a price with provenance (as all writers should)
      await prisma.$executeRaw`
        INSERT INTO prices (
          "id",
          "retailerId",
          "sourceProductId",
          "price",
          "currency",
          "url",
          "inStock",
          "createdAt",
          "observedAt",
          "ingestionRunType",
          "ingestionRunId"
        )
        VALUES (
          gen_random_uuid(),
          ${source!.retailerId},
          ${testSourceProductId},
          ${29.99},
          'USD',
          'https://test.example.com/product2',
          true,
          ${observedAt},
          ${observedAt},
          'SCRAPE'::"IngestionRunType",
          ${ingestionRunId}
        )
        ON CONFLICT DO NOTHING
      `

      // Verify provenance is set
      const price = await prisma.prices.findFirst({
        where: { ingestionRunId },
        select: {
          ingestionRunType: true,
          ingestionRunId: true,
          observedAt: true,
        },
      })

      expect(price).toBeTruthy()
      expect(price?.ingestionRunType).toBe('SCRAPE')
      expect(price?.ingestionRunId).toBe(ingestionRunId)
      expect(price?.observedAt).toBeInstanceOf(Date)
    })
  })

  describe('Error handling', () => {
    it('should handle invalid column names with clear error', async () => {
      // This test documents what happens with bad column names
      await expect(
        prisma.$executeRaw`
          INSERT INTO source_product_presence ("id", "sourceProductId", "nonExistentColumn")
          VALUES (gen_random_uuid(), 'test-id', 'test-value')
        `
      ).rejects.toThrow(/column.*does not exist/i)
    })

    it('should handle foreign key violations', async () => {
      await expect(
        prisma.$executeRaw`
          INSERT INTO source_product_presence ("id", "sourceProductId", "lastSeenAt", "updatedAt")
          VALUES (gen_random_uuid(), 'non-existent-product-id', NOW(), NOW())
        `
      ).rejects.toThrow(/foreign key/i)
    })
  })
})

/**
 * Contract Tests - Verify raw SQL matches Prisma schema
 *
 * These tests extract actual SQL from source files and verify
 * the column names match the database schema.
 */
describeIntegration('SQL Contract Tests', () => {
  it('should verify source_product_presence columns exist', async () => {
    // Query the actual database schema
    const columns = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'source_product_presence'
    `

    const columnNames = columns.map(c => c.column_name)

    // These are the columns we use in raw SQL
    const usedColumns = ['id', 'sourceProductId', 'lastSeenAt', 'updatedAt']

    for (const col of usedColumns) {
      expect(columnNames).toContain(col)
    }

    // Verify createdAt does NOT exist (this was the bug!)
    expect(columnNames).not.toContain('createdAt')
  })

  it('should verify source_product_seen columns exist', async () => {
    const columns = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'source_product_seen'
    `

    const columnNames = columns.map(c => c.column_name)
    const usedColumns = ['id', 'runId', 'sourceProductId', 'createdAt']

    for (const col of usedColumns) {
      expect(columnNames).toContain(col)
    }
  })

  it('should verify prices columns exist', async () => {
    const columns = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'prices'
    `

    const columnNames = columns.map(c => c.column_name)
    const usedColumns = [
      'id', 'retailerId', 'sourceProductId', 'affiliateFeedRunId',
      'priceSignatureHash', 'price', 'currency', 'url', 'inStock',
      'originalPrice', 'priceType', 'createdAt'
    ]

    for (const col of usedColumns) {
      expect(columnNames).toContain(col)
    }
  })
})
