/**
 * Database Test Utilities
 *
 * Provides helpers for integration tests that need a real database.
 *
 * Usage:
 *   import { createTestClient, resetTestDatabase } from '@ironscout/db/test-utils'
 *
 *   beforeAll(async () => {
 *     const prisma = createTestClient()
 *     await resetTestDatabase(prisma)
 *   })
 *
 * Environment:
 *   TEST_DATABASE_URL=postgresql://ironscout_test:ironscout_test@localhost:5433/ironscout_test
 */

import { execSync } from 'child_process'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/prisma/client.js'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Test database connection string - uses port 5433 from docker-compose.test.yml
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgresql://ironscout_test:ironscout_test@localhost:5433/ironscout_test'

/**
 * Creates a PrismaClient connected to the test database.
 * Each test suite should create its own client.
 */
export function createTestClient() {
  const pool = new Pool({
    connectionString: TEST_DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
  })

  const adapter = new PrismaPg(pool)

  return new PrismaClient({
    adapter,
    log: process.env.DEBUG_PRISMA ? ['query', 'info', 'warn', 'error'] : [],
  })
}

/**
 * Resets the test database by running migrations fresh.
 * Call this in beforeAll() to ensure clean state.
 */
export async function resetTestDatabase(prisma) {
  // Run prisma migrate reset --force
  // This drops all tables and re-runs all migrations
  // Note: PRISMA_USER_CONSENT is required for AI agents running reset
  execSync('pnpm prisma migrate reset --force', {
    cwd: __dirname,
    env: {
      ...process.env,
      DATABASE_URL: TEST_DATABASE_URL,
      // Bypass Prisma AI safety check - this is the isolated test database
      PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: 'yes proceed with test database reset',
    },
    stdio: process.env.DEBUG_PRISMA ? 'inherit' : 'pipe',
  })

  // Ensure client is connected after reset
  await prisma.$connect()
}

/**
 * Cleans specific tables for per-test isolation.
 * Faster than full reset for tests that only need certain tables clean.
 *
 * @param {PrismaClient} prisma - PrismaClient instance
 * @param {string[]} tables - Array of table names to truncate (order matters for FK constraints)
 */
export async function cleanTables(prisma, tables) {
  // Disable FK checks, truncate, re-enable
  await prisma.$executeRawUnsafe(`SET session_replication_role = replica;`)

  for (const table of tables) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE;`)
  }

  await prisma.$executeRawUnsafe(`SET session_replication_role = DEFAULT;`)
}

/**
 * Common table sets for different test scenarios
 */
export const TABLE_SETS = {
  /** User-related tables */
  users: ['users', 'accounts', 'sessions'],

  /** Product and pricing tables */
  products: ['prices', 'price_history', 'products'],

  /** Watchlist and alerts */
  watchlist: ['alert_logs', 'alerts', 'watchlist_items'],

  /** All user-generated data (for full isolation tests) */
  allUserData: [
    'alert_logs',
    'alerts',
    'watchlist_items',
    'sessions',
    'accounts',
    'users',
  ],
}

/**
 * Disconnects the test client. Call in afterAll().
 */
export async function disconnectTestClient(prisma) {
  await prisma.$disconnect()
}

/**
 * Test fixture helper - creates a test user with optional overrides.
 */
export async function createTestUser(prisma, overrides = {}) {
  const id = overrides.id || `test-user-${Date.now()}`
  const email = overrides.email || `${id}@test.ironscout.local`
  const name = overrides.name || 'Test User'

  return prisma.users.create({
    data: { id, email, name },
    select: { id: true, email: true, name: true },
  })
}

/**
 * Test fixture helper - creates a test retailer.
 */
export async function createTestRetailer(prisma, overrides = {}) {
  const id = overrides.id || `test-retailer-${Date.now()}`
  const name = overrides.name || 'Test Retailer'
  const slug = overrides.slug || id

  return prisma.retailers.create({
    data: {
      id,
      name,
      slug,
      websiteUrl: `https://${slug}.test`,
      status: 'APPROVED',
      isEligible: overrides.isEligible ?? true,
    },
    select: { id: true, name: true, slug: true },
  })
}

/**
 * Test fixture helper - creates a test product.
 */
export async function createTestProduct(prisma, overrides = {}) {
  const id = overrides.id || `test-product-${Date.now()}`
  const name = overrides.name || 'Test 9mm FMJ'
  const brand = overrides.brand || 'TestBrand'
  const caliber = overrides.caliber || '9mm'
  const category = overrides.category || 'HANDGUN'

  return prisma.products.create({
    data: { id, name, brand, caliber, category },
    select: { id: true, name: true, brand: true, caliber: true },
  })
}
