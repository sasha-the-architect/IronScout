/**
 * Runtime Schema Validation
 *
 * Provides startup validation to catch P2022 errors before they occur
 * during job processing. Import and call validateSchemaOrDie() at
 * application startup.
 *
 * Usage in harvester/api:
 *   import { validateSchemaOrDie } from '@ironscout/db/schema-validation.js'
 *   await validateSchemaOrDie()
 */

import { prisma } from './index.js'

// Critical tables and columns that MUST exist for the system to function
// These are the most commonly accessed in hot paths
const CRITICAL_SCHEMA = {
  products: ['id', 'slug', 'name', 'caliber', 'grainWeight', 'roundCount', 'createdAt'],
  source_products: ['id', 'productId', 'retailerId', 'url', 'identityType', 'identityValue', 'lastSeenSuccessAt'],
  prices: ['id', 'sourceProductId', 'productId', 'price', 'inStock', 'currency', 'createdAt'],
  retailers: ['id', 'name', 'slug', 'isEligible', 'trustTier'],
  affiliate_feeds: ['id', 'status', 'feedUrl', 'retailerId'],
  affiliate_feed_runs: ['id', 'feedId', 'status', 'startedAt', 'finishedAt'],
}

const RED = '\x1b[31m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const BOLD = '\x1b[1m'
const RESET = '\x1b[0m'

/**
 * Validates that critical schema elements exist in the database.
 * @returns {Promise<{valid: boolean, errors: string[]}>}
 */
export async function validateSchema() {
  const errors = []

  try {
    // Query each critical table to verify columns exist
    for (const [tableName, expectedColumns] of Object.entries(CRITICAL_SCHEMA)) {
      const result = await prisma.$queryRawUnsafe(`
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
  }
}

/**
 * Validates schema and exits the process if validation fails.
 * Use this at application startup to fail fast before processing any work.
 */
export async function validateSchemaOrDie() {
  console.log(`${YELLOW}[STARTUP]${RESET} Validating database schema...`)

  const { valid, errors } = await validateSchema()

  if (valid) {
    console.log(`${GREEN}[STARTUP]${RESET} Schema validation passed`)
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

/**
 * Lightweight connectivity check without full schema validation.
 * Use when you just want to verify the database is reachable.
 */
export async function checkDatabaseConnectivity() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return { connected: true, error: null }
  } catch (err) {
    return {
      connected: false,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}
