/**
 * Database Test Utilities - Type Definitions
 */

import type { PrismaClient } from './generated/prisma/client.js'

/**
 * Creates a PrismaClient connected to the test database.
 * Each test suite should create its own client.
 */
export declare function createTestClient(): PrismaClient

/**
 * Resets the test database by running migrations fresh.
 * Call this in beforeAll() to ensure clean state.
 */
export declare function resetTestDatabase(prisma: PrismaClient): Promise<void>

/**
 * Cleans specific tables for per-test isolation.
 * Faster than full reset for tests that only need certain tables clean.
 *
 * @param prisma - PrismaClient instance
 * @param tables - Array of table names to truncate (order matters for FK constraints)
 */
export declare function cleanTables(
  prisma: PrismaClient,
  tables: string[]
): Promise<void>

/**
 * Common table sets for different test scenarios
 */
export declare const TABLE_SETS: {
  /** User-related tables */
  readonly users: readonly ['users', 'accounts', 'sessions']

  /** Product and pricing tables */
  readonly products: readonly ['prices', 'price_history', 'products']

  /** Watchlist and alerts */
  readonly watchlist: readonly ['alert_logs', 'alerts', 'watchlist_items']

  /** All user-generated data (for full isolation tests) */
  readonly allUserData: readonly [
    'alert_logs',
    'alerts',
    'watchlist_items',
    'sessions',
    'accounts',
    'users'
  ]
}

/**
 * Disconnects the test client. Call in afterAll().
 */
export declare function disconnectTestClient(prisma: PrismaClient): Promise<void>

/**
 * Test fixture helper - creates a test user with optional overrides.
 */
export declare function createTestUser(
  prisma: PrismaClient,
  overrides?: Partial<{
    id: string
    email: string
    name: string
  }>
): Promise<{ id: string; email: string; name: string | null }>

/**
 * Test fixture helper - creates a test retailer.
 */
export declare function createTestRetailer(
  prisma: PrismaClient,
  overrides?: Partial<{
    id: string
    name: string
    slug: string
    isEligible: boolean
  }>
): Promise<{ id: string; name: string; slug: string }>

/**
 * Test fixture helper - creates a test product.
 */
export declare function createTestProduct(
  prisma: PrismaClient,
  overrides?: Partial<{
    id: string
    name: string
    brand: string
    caliber: string
  }>
): Promise<{ id: string; name: string; brand: string | null; caliber: string | null }>
