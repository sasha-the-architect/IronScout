/**
 * Schema Integrity Integration Test
 *
 * This test validates that:
 * 1. Prisma migrations can be applied to a fresh database
 * 2. The generated Prisma client can execute queries without P2022 errors
 * 3. Critical tables and columns exist as expected
 *
 * Uses Testcontainers to spin up an isolated PostgreSQL instance.
 * This test runs in CI to catch schema drift before deployment.
 *
 * WHY THIS TEST EXISTS:
 * - P2022 errors are silent until a query hits a missing column
 * - CI schema diff checks can miss edge cases
 * - This test proves the ACTUAL migration+query path works
 *
 * WHAT IT CATCHES:
 * - Migrations that fail to create expected columns
 * - Schema.prisma that references columns not in migrations
 * - Type mismatches between schema and generated client
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { Client } from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PACKAGE_ROOT = resolve(__dirname, '..')

// Testcontainers import - dynamically loaded to allow skipping if not available
let PostgreSqlContainer: typeof import('@testcontainers/postgresql').PostgreSqlContainer
let StartedPostgreSqlContainer: import('@testcontainers/postgresql').StartedPostgreSqlContainer

// Skip if testcontainers not available (lightweight CI environments)
const SKIP_TESTCONTAINERS = process.env.SKIP_TESTCONTAINERS === 'true'

// Track if we should skip tests due to missing Docker
let skipReason: string | null = null

describe('Schema Integrity', () => {
  let container: StartedPostgreSqlContainer | null = null
  let connectionString: string

  beforeAll(async () => {
    if (SKIP_TESTCONTAINERS) {
      // Use existing DATABASE_URL for lightweight mode
      connectionString = process.env.DATABASE_URL || ''
      if (!connectionString) {
        skipReason = 'DATABASE_URL required when SKIP_TESTCONTAINERS=true'
        return
      }
      return
    }

    try {
      // Dynamic import of testcontainers
      const tc = await import('@testcontainers/postgresql')
      PostgreSqlContainer = tc.PostgreSqlContainer

      // Start PostgreSQL container
      console.log('Starting PostgreSQL container...')
      container = await new PostgreSqlContainer('postgres:16-alpine')
        .withDatabase('test_db')
        .withUsername('test')
        .withPassword('test')
        .start()

      connectionString = container.getConnectionUri()
      console.log(`PostgreSQL started: ${connectionString}`)

      // Apply migrations
      console.log('Applying Prisma migrations...')
      execSync('npx prisma migrate deploy', {
        cwd: DB_PACKAGE_ROOT,
        env: {
          ...process.env,
          DATABASE_URL: connectionString,
        },
        stdio: 'inherit',
      })
    } catch (error) {
      // Check if this is a "no Docker" error
      if (error instanceof Error && error.message.includes('container runtime')) {
        skipReason = 'Docker not available - skipping testcontainer tests'
        console.log(skipReason)
        return
      }
      throw error
    }
  }, 120000) // 2 minute timeout for container startup

  afterAll(async () => {
    if (container) {
      await container.stop()
    }
  })

  it('should have all critical tables', async ({ skip }) => {
    if (skipReason) return skip()
    const client = new Client({ connectionString })
    await client.connect()

    try {
      const result = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
      `)

      const tables = result.rows.map(r => r.table_name)

      // Critical tables that must exist
      const criticalTables = [
        'products',
        'source_products',
        'prices',
        'retailers',
        'affiliate_feeds',
        'affiliate_feed_runs',
        'source_product_presence',
        'source_product_seen',
        'product_links',
        'users',
        'alerts',
      ]

      for (const table of criticalTables) {
        expect(tables, `Missing table: ${table}`).toContain(table)
      }
    } finally {
      await client.end()
    }
  })

  it('should have critical columns on source_products', async ({ skip }) => {
    if (skipReason) return skip()
    const client = new Client({ connectionString })
    await client.connect()

    try {
      const result = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'source_products'
      `)

      const columns = new Map(result.rows.map(r => [r.column_name, r]))

      // Columns required by harvester resolver
      const requiredColumns = [
        'id',
        'productId',
        'retailerId',
        'url',
        'identityType',
        'identityValue',
        'lastSeenSuccessAt',
        'createdAt',
      ]

      for (const col of requiredColumns) {
        expect(columns.has(col), `Missing column: source_products.${col}`).toBe(true)
      }
    } finally {
      await client.end()
    }
  })

  it('should have critical columns on prices', async ({ skip }) => {
    if (skipReason) return skip()
    const client = new Client({ connectionString })
    await client.connect()

    try {
      const result = await client.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'prices'
      `)

      const columns = new Set(result.rows.map(r => r.column_name))

      const requiredColumns = [
        'id',
        'sourceProductId',
        'productId',
        'price',
        'inStock',
        'currency',
        'createdAt',
        'affiliateFeedRunId',
      ]

      for (const col of requiredColumns) {
        expect(columns.has(col), `Missing column: prices.${col}`).toBe(true)
      }
    } finally {
      await client.end()
    }
  })

  it('should execute a harvester-like query without P2022', async ({ skip }) => {
    if (skipReason) return skip()
    // This test uses the actual Prisma client against the migrated DB
    // to prove the full code path works

    const { PrismaClient } = await import('../generated/prisma/index.js')
    const prisma = new PrismaClient({
      datasourceUrl: connectionString,
    })

    try {
      // Query pattern used by harvester resolver
      // This is the exact query shape that triggered P2022 in production
      const result = await prisma.source_products.findMany({
        where: {
          retailerId: 'nonexistent-retailer', // Won't match anything, but validates schema
        },
        select: {
          id: true,
          productId: true,
          url: true,
          identityType: true,
          identityValue: true,
          lastSeenSuccessAt: true,
        },
        take: 1,
      })

      // If we get here without P2022, the schema is valid
      expect(result).toBeDefined()
      expect(Array.isArray(result)).toBe(true)
    } finally {
      await prisma.$disconnect()
    }
  })

  it('should execute an alert query without P2022', async ({ skip }) => {
    if (skipReason) return skip()
    const { PrismaClient } = await import('../generated/prisma/index.js')
    const prisma = new PrismaClient({
      datasourceUrl: connectionString,
    })

    try {
      // Query pattern used by alert processor
      const result = await prisma.prices.findMany({
        where: {
          sourceProductId: 'nonexistent',
        },
        select: {
          id: true,
          price: true,
          inStock: true,
          currency: true,
          createdAt: true,
          sourceProductId: true,
          productId: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      })

      expect(result).toBeDefined()
    } finally {
      await prisma.$disconnect()
    }
  })

  it('should have consistent enum values', async ({ skip }) => {
    if (skipReason) return skip()
    const client = new Client({ connectionString })
    await client.connect()

    try {
      // Check that enums exist and have expected values
      const result = await client.query(`
        SELECT t.typname, e.enumlabel
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname IN ('IdentityType', 'TrustTier', 'AffiliateFeedStatus')
        ORDER BY t.typname, e.enumsortorder
      `)

      const enums = new Map<string, Set<string>>()
      for (const row of result.rows) {
        if (!enums.has(row.typname)) {
          enums.set(row.typname, new Set())
        }
        enums.get(row.typname)!.add(row.enumlabel)
      }

      // IdentityType must include these values used by harvester
      const identityType = enums.get('IdentityType')
      expect(identityType?.has('IMPACT_ITEM_ID')).toBe(true)
      expect(identityType?.has('SKU')).toBe(true)
      expect(identityType?.has('URL_HASH')).toBe(true)
    } finally {
      await client.end()
    }
  })
})
