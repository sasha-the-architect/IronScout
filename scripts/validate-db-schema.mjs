#!/usr/bin/env node
/**
 * Validate Database Schema
 * Cross-platform Node.js version
 *
 * Validates that the Prisma schema matches the actual database schema.
 *
 * Usage:
 *   node scripts/validate-db-schema.mjs
 *   node scripts/validate-db-schema.mjs --verbose
 */

import { readFileSync, writeFileSync, copyFileSync, unlinkSync, existsSync, statSync, readdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  colors,
  success,
  error,
  warn,
  info,
  header,
  run,
  runCapture,
  parseArgs,
} from './lib/utils.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..')
const DB_PATH = resolve(PROJECT_ROOT, 'packages/db')

let hasErrors = false
const warnings = []
const errors = []

function logSuccess(msg) {
  console.log(`  ${colors.green}[OK]${colors.reset} ${msg}`)
}

function logWarn(msg) {
  console.log(`  ${colors.yellow}[WARN]${colors.reset} ${msg}`)
  warnings.push(msg)
}

function logErr(msg) {
  console.log(`  ${colors.red}[ERROR]${colors.reset} ${msg}`)
  errors.push(msg)
  hasErrors = true
}

function logInfo(msg) {
  console.log(`  ${colors.cyan}${msg}${colors.reset}`)
}

function logDetail(msg, verbose) {
  if (verbose) {
    console.log(`    ${colors.gray}${msg}${colors.reset}`)
  }
}

/**
 * Parse a Prisma schema and extract models with columns
 */
function parseSchemaModels(content, useDbColumnNames = false) {
  const models = {}
  let currentModel = null
  let currentColumns = []

  const lines = content.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()

    // Start of a model
    const modelMatch = trimmed.match(/^model\s+(\w+)\s*\{/)
    if (modelMatch) {
      currentModel = modelMatch[1]
      currentColumns = []
      continue
    }

    // End of a model
    if (currentModel && trimmed === '}') {
      models[currentModel] = currentColumns
      currentModel = null
      continue
    }

    // Column definition (not a relation, not @@, not empty)
    if (
      currentModel &&
      trimmed &&
      !trimmed.startsWith('//') &&
      !trimmed.startsWith('@@')
    ) {
      // Match column definitions: name Type ...
      const colMatch = trimmed.match(/^(\w+)\s+(String|Int|Boolean|DateTime|Decimal|Json|BigInt|Float|Bytes)/)
      if (colMatch) {
        let colName = colMatch[1]

        // Check for @map() directive to get actual DB column name
        if (useDbColumnNames) {
          const mapMatch = trimmed.match(/@map\("([^"]+)"\)/)
          if (mapMatch) {
            colName = mapMatch[1]
          }
        }

        currentColumns.push(colName)
      }
    }
  }

  return models
}

async function main() {
  const args = parseArgs()
  const verbose = args.flags.verbose || args.flags.v

  console.log('')
  console.log(`${colors.magenta}=== Prisma Schema Validation ===${colors.reset}`)
  console.log('')

  // Step 1: Check for pending migrations
  console.log(`${colors.white}1. Checking migration status...${colors.reset}`)

  const migrateStatus = runCapture('pnpm exec prisma migrate status', { cwd: DB_PATH })
  const statusOutput = migrateStatus.output || ''

  if (statusOutput.includes('have not yet been applied')) {
    logErr('Pending migrations found!')
    logInfo('Run: pnpm exec prisma migrate deploy')
  } else if (statusOutput.includes('Database schema is up to date')) {
    logSuccess('All migrations applied')
  } else if (statusOutput.includes('failed to apply')) {
    logErr('Migration failure detected!')
    logInfo('Check: pnpm exec prisma migrate status')
  } else {
    logWarn('Could not determine migration status')
    logDetail(statusOutput, verbose)
  }

  // Step 2: Pull database schema and compare columns
  console.log('')
  console.log(`${colors.white}2. Comparing database schema with Prisma schema...${colors.reset}`)

  const schemaPath = resolve(DB_PATH, 'schema.prisma')
  const backupPath = resolve(DB_PATH, 'schema.prisma.backup')

  // Read expected schema (use DB column names from @map directives)
  const expectedContent = readFileSync(schemaPath, 'utf-8')
  const expectedModels = parseSchemaModels(expectedContent, true)

  // Backup current schema
  copyFileSync(schemaPath, backupPath)

  // Pull actual database schema
  run('pnpm exec prisma db pull --force', { cwd: DB_PATH, silent: true })

  // Read pulled schema
  const actualContent = readFileSync(schemaPath, 'utf-8')
  const actualModels = parseSchemaModels(actualContent)

  // Restore original schema
  copyFileSync(backupPath, schemaPath)
  unlinkSync(backupPath)

  // Compare models and columns
  const missingFromDb = []
  const extraInDb = []
  const dealerColumns = []

  for (const model of Object.keys(expectedModels)) {
    const expectedCols = expectedModels[model]
    const actualCols = actualModels[model]

    if (!actualCols) {
      logDetail(`Model ${model} not found in database (may need migration)`, verbose)
      continue
    }

    for (const col of expectedCols) {
      if (!actualCols.includes(col)) {
        // Skip Prisma-only fields
        if (!['ignoredAt', 'ignoredBy', 'ignoredReason', 'suppressedAt', 'suppressedBy', 'suppressedReason'].includes(col)) {
          missingFromDb.push(`[${model}] ${col}`)
        }
      }
    }

    for (const col of actualCols) {
      if (!expectedCols.includes(col)) {
        extraInDb.push(`[${model}] ${col}`)
      }
      // Check for dealer terminology in actual column names
      if (col.match(/dealer/i) && !col.match(/merchant/i)) {
        dealerColumns.push(`[${model}] ${col}`)
      }
    }
  }

  // Check for dealer terminology in table names
  const dealerTables = Object.keys(actualModels).filter(
    (t) => t.match(/dealer/i) && !t.match(/merchant/i)
  )

  // Report results
  let hasDrift = false

  if (dealerTables.length > 0) {
    logErr("Found 'dealer' table names (should be 'merchant'):")
    for (const t of dealerTables) {
      console.log(`    ${colors.red}${t}${colors.reset}`)
    }
    hasDrift = true
  }

  if (dealerColumns.length > 0) {
    logErr("Found 'dealer' column names (should be 'merchant'):")
    for (const c of dealerColumns.slice(0, 10)) {
      console.log(`    ${colors.red}${c}${colors.reset}`)
    }
    if (dealerColumns.length > 10) {
      console.log(`    ${colors.red}... and ${dealerColumns.length - 10} more${colors.reset}`)
    }
    hasDrift = true
  }

  if (missingFromDb.length > 0) {
    logErr('Columns in schema but MISSING from database:')
    for (const c of missingFromDb.slice(0, 10)) {
      console.log(`    ${colors.red}${c}${colors.reset}`)
    }
    if (missingFromDb.length > 10) {
      console.log(`    ${colors.red}... and ${missingFromDb.length - 10} more${colors.reset}`)
    }
    hasDrift = true
  }

  if (extraInDb.length > 0 && verbose) {
    logInfo('Extra columns in database (not in schema):')
    for (const c of extraInDb.slice(0, 10)) {
      logDetail(c, verbose)
    }
    if (extraInDb.length > 10) {
      logDetail(`... and ${extraInDb.length - 10} more`, verbose)
    }
  }

  if (!hasDrift) {
    logSuccess('Schema columns match database')
  }

  // Step 3: Check Prisma client generation
  console.log('')
  console.log(`${colors.white}3. Checking Prisma client generation...${colors.reset}`)

  const generatedPath = resolve(DB_PATH, 'generated/prisma')
  if (!existsSync(generatedPath)) {
    logErr('Prisma client not generated!')
    logInfo('Run: pnpm exec prisma generate')
  } else {
    const schemaModified = statSync(schemaPath).mtime
    const clientFiles = readdirSync(generatedPath, { recursive: true })
    let latestClientMod = new Date(0)
    for (const file of clientFiles) {
      try {
        const filePath = resolve(generatedPath, file)
        const stat = statSync(filePath)
        if (stat.mtime > latestClientMod) {
          latestClientMod = stat.mtime
        }
      } catch {
        // Ignore
      }
    }

    if (schemaModified > latestClientMod) {
      logWarn('Schema modified after client generation')
      logInfo('Run: pnpm exec prisma generate')
    } else {
      logSuccess('Prisma client is up to date')
    }
  }

  // Summary
  console.log('')
  console.log(`${colors.magenta}=== Summary ===${colors.reset}`)

  if (errors.length === 0 && warnings.length === 0) {
    console.log('')
    console.log(`  ${colors.green}Database schema is fully in sync!${colors.reset}`)
    console.log('')
    process.exit(0)
  }

  if (warnings.length > 0) {
    console.log('')
    console.log(`  ${colors.yellow}Warnings: ${warnings.length}${colors.reset}`)
  }

  if (errors.length > 0) {
    console.log(`  ${colors.red}Errors: ${errors.length}${colors.reset}`)
    console.log('')
    console.log(`  ${colors.white}Recommended actions:${colors.reset}`)
    console.log(`${colors.gray}    1. Run: pnpm exec prisma migrate status${colors.reset}`)
    console.log(`${colors.gray}    2. Run: pnpm exec prisma migrate deploy${colors.reset}`)
    console.log(`${colors.gray}    3. Run: pnpm exec prisma generate${colors.reset}`)
    console.log(`${colors.gray}    4. If issues persist, create a new migration${colors.reset}`)
    console.log('')
    process.exit(1)
  }

  console.log('')
  process.exit(0)
}

main().catch((e) => {
  error(e.message)
  process.exit(1)
})
