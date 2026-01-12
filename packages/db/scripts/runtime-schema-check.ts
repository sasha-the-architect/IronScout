#!/usr/bin/env npx tsx
/**
 * Runtime Schema Validation
 *
 * This is the LAST LINE OF DEFENSE against P2022 errors.
 * Run at application startup to verify critical tables/columns exist.
 *
 * Unlike CI checks, this runs against the ACTUAL production database
 * and catches drift that may have occurred due to:
 * - Failed migrations
 * - Manual schema changes
 * - Wrong database connection
 *
 * Usage:
 *   import { validateSchemaOrDie } from '@ironscout/db/runtime-schema-check'
 *   await validateSchemaOrDie()  // Throws if schema is invalid
 *
 * Exit behavior:
 *   - On validation failure: logs error and process.exit(1)
 *   - On success: returns silently
 */

import { PrismaClient } from '../generated/prisma/index.js'

// Critical tables and columns that MUST exist for the system to function
// These are the most commonly accessed in hot paths
const CRITICAL_SCHEMA = {
  products: ['id', 'slug', 'name', 'caliber', 'grainWeight', 'roundCount', 'createdAt'],
  source_products: ['id', 'productId', 'retailerId', 'url', 'identityType', 'identityValue', 'lastSeenSuccessAt'],
  prices: ['id', 'sourceProductId', 'productId', 'price', 'inStock', 'currency', 'createdAt'],
  retailers: ['id', 'name', 'slug', 'isEligible', 'trustTier'],
  affiliate_feeds: ['id', 'status', 'feedUrl', 'retailerId'],
  affiliate_feed_runs: ['id', 'feedId', 'status', 'startedAt', 'finishedAt'],
} as const

const RED = '\x1b[31m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const BOLD = '\x1b[1m'
const RESET = '\x1b[0m'

interface ColumnInfo {
  column_name: string
  table_name: string
}

/**
 * Validates that critical schema elements exist in the database.
 * Throws an error with actionable message if validation fails.
 */
export async function validateSchema(): Promise<{ valid: boolean; errors: string[] }> {
  const prisma = new PrismaClient()
  const errors: string[] = []

  try {
    // Query information_schema for all columns in our critical tables
    const tableNames = Object.keys(CRITICAL_SCHEMA)
    const tableList = tableNames.map(t => `'${t}'`).join(', ')

    const columns = await prisma.$queryRaw<ColumnInfo[]>`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN (${tableNames.join(', ')})
    `

    // This raw query approach may fail, so let's use a safer method
    // Query each table individually
    for (const [tableName, expectedColumns] of Object.entries(CRITICAL_SCHEMA)) {
      const result = await prisma.$queryRawUnsafe<ColumnInfo[]>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = '${tableName}'
      `)

      const actualColumns = new Set(result.map(r => r.column_name))

      // Check table exists
      if (actualColumns.size === 0) {
        errors.push(`Table "${tableName}" does not exist`)
        continue
      }

      // Check each expected column
      for (const col of expectedColumns) {
        if (!actualColumns.has(col)) {
          errors.push(`Column "${tableName}.${col}" does not exist`)
        }
      }
    }

    return { valid: errors.length === 0, errors }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    // Check for P2022 specifically
    if (message.includes('P2022') || message.includes('does not exist')) {
      errors.push(`Schema validation query failed with P2022: ${message}`)
    } else {
      errors.push(`Schema validation failed: ${message}`)
    }

    return { valid: false, errors }
  } finally {
    await prisma.$disconnect()
  }
}

/**
 * Validates schema and exits the process if validation fails.
 * Use this at application startup to fail fast before processing any work.
 */
export async function validateSchemaOrDie(): Promise<void> {
  console.error(`${YELLOW}[STARTUP]${RESET} Validating database schema...`)

  const { valid, errors } = await validateSchema()

  if (valid) {
    console.error(`${GREEN}[STARTUP]${RESET} Schema validation passed`)
    return
  }

  console.error('')
  console.error(`${RED}${BOLD}════════════════════════════════════════════════════════════${RESET}`)
  console.error(`${RED}${BOLD}  FATAL: DATABASE SCHEMA VALIDATION FAILED${RESET}`)
  console.error(`${RED}${BOLD}════════════════════════════════════════════════════════════${RESET}`)
  console.error('')
  console.error(`${RED}The database schema does not match what this code expects.${RESET}`)
  console.error(`${RED}This will cause P2022 errors during query execution.${RESET}`)
  console.error('')
  console.error(`${YELLOW}Missing schema elements:${RESET}`)
  for (const error of errors) {
    console.error(`  ${RED}•${RESET} ${error}`)
  }
  console.error('')
  console.error(`${YELLOW}Possible causes:${RESET}`)
  console.error('  1. Migrations were not applied to this database')
  console.error('  2. Code was deployed before migrations ran')
  console.error('  3. Database connection points to wrong environment')
  console.error('')
  console.error(`${YELLOW}Fix:${RESET}`)
  console.error('  1. Verify DATABASE_URL points to the correct database')
  console.error('  2. Run: pnpm db:migrate:deploy')
  console.error('  3. Check migration logs for failures')
  console.error('')
  console.error(`${RED}Refusing to start with invalid schema.${RESET}`)
  console.error('')

  process.exit(1)
}

// Allow running directly for testing
if (import.meta.url === `file://${process.argv[1]}`) {
  validateSchemaOrDie()
}
