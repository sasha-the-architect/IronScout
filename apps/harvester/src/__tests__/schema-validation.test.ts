/**
 * Schema Validation Tests
 *
 * Validates that raw SQL queries reference columns that actually exist in the schema.
 * This catches bugs like the "createdAt" column issue where raw SQL referenced
 * a non-existent column.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Schema definition for tables used in raw SQL.
 * ONLY include columns that are referenced in $executeRaw or $queryRaw.
 *
 * This is intentionally minimal - we only validate columns we USE,
 * not all columns that exist. This makes the test focused and maintainable.
 *
 * IMPORTANT: When you add raw SQL that uses new columns, ADD THEM HERE.
 */
const SCHEMA: Record<string, string[]> = {
  // Used in processor.ts batchUpdatePresence()
  source_product_presence: [
    'id',
    'sourceProductId',
    'lastSeenAt',
    'lastSeenSuccessAt',  // Used in circuit breaker promotion
    'updatedAt',
    // NOTE: No 'createdAt' column exists - this was a bug!
  ],

  // Used in processor.ts batchRecordSeen()
  source_product_seen: [
    'id',
    'runId',
    'sourceProductId',
    'createdAt',
  ],

  // Used in processor.ts batchUpsertSourceProducts()
  source_products: [
    'id',
    'sourceId',
    'title',
    'url',
    'imageUrl',
    'brand',        // Persisted for resolver fingerprinting
    'description',  // Persisted for resolver fingerprinting
    'category',     // Persisted for resolver fingerprinting
    'caliber',
    'grainWeight',
    'roundCount',
    'normalizedUrl',
    'createdByRunId',
    'lastUpdatedByRunId',
    'createdAt',
    'updatedAt',
  ],

  // Used in processor.ts batchInsertIdentifiers() - new identifiers table
  source_product_identifiers: [
    'id',
    'sourceProductId',
    'idType',
    'idValue',
    'namespace',
    'isCanonical',
    'normalizedValue',
    'createdAt',
    'updatedAt',
  ],

  // Used in processor.ts batchInsertPrices()
  prices: [
    'id',
    'retailerId',
    'sourceProductId',
    'productId',  // FK to canonical products
    'affiliateFeedRunId',
    'priceSignatureHash',
    'price',
    'currency',
    'url',
    'inStock',
    'originalPrice',
    'priceType',
    'createdAt',
    // ADR-015 provenance columns
    'observedAt',
    'ingestionRunType',
    'ingestionRunId',
  ],
}

// Extract column references from raw SQL
function extractColumnReferences(sql: string): { table: string; columns: string[] }[] {
  const results: { table: string; columns: string[] }[] = []

  // Match INSERT INTO table_name ("col1", "col2", ...)
  const insertPattern = /INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)/gi
  let match
  while ((match = insertPattern.exec(sql)) !== null) {
    const table = match[1]
    const columnsStr = match[2]
    const columns = columnsStr
      .split(',')
      .map(c => c.trim().replace(/"/g, ''))
      .filter(c => c && !c.startsWith('$'))

    if (columns.length > 0) {
      results.push({ table, columns })
    }
  }

  // Match UPDATE table_name SET "col1" = ...
  const updatePattern = /UPDATE\s+(\w+)\s+.*?SET\s+([^WHERE]+)/gi
  while ((match = updatePattern.exec(sql)) !== null) {
    const table = match[1]
    const setClause = match[2]
    const columnPattern = /"(\w+)"\s*=/g
    const columns: string[] = []
    let colMatch
    while ((colMatch = columnPattern.exec(setClause)) !== null) {
      columns.push(colMatch[1])
    }
    if (columns.length > 0) {
      results.push({ table, columns })
    }
  }

  return results
}

// Find all raw SQL in source files
function findRawSqlInFile(filePath: string): { line: number; sql: string }[] {
  const content = fs.readFileSync(filePath, 'utf-8')
  const results: { line: number; sql: string }[] = []

  // Match prisma.$executeRaw` ... ` or prisma.$queryRaw` ... `
  const rawPattern = /\$(?:executeRaw|queryRaw)`([^`]+)`/gs
  let match
  while ((match = rawPattern.exec(content)) !== null) {
    const lineNumber = content.substring(0, match.index).split('\n').length
    results.push({ line: lineNumber, sql: match[1] })
  }

  return results
}

// Recursively find all .ts files
function findTsFiles(dir: string): string[] {
  const files: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory() && !entry.name.includes('node_modules') && !entry.name.startsWith('.')) {
      files.push(...findTsFiles(fullPath))
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      files.push(fullPath)
    }
  }

  return files
}

describe('Schema Validation', () => {
  it('all raw SQL column references should exist in schema', () => {
    const srcDir = path.join(__dirname, '..')
    const tsFiles = findTsFiles(srcDir)
    const errors: string[] = []

    for (const file of tsFiles) {
      const rawSqls = findRawSqlInFile(file)

      for (const { line, sql } of rawSqls) {
        const references = extractColumnReferences(sql)

        for (const { table, columns } of references) {
          const schemaColumns = SCHEMA[table]

          if (!schemaColumns) {
            // Table not in our schema map - skip (might be a different table)
            continue
          }

          for (const column of columns) {
            if (!schemaColumns.includes(column)) {
              errors.push(
                `${path.relative(srcDir, file)}:${line} - ` +
                `Column "${column}" does not exist in table "${table}". ` +
                `Valid columns: ${schemaColumns.join(', ')}`
              )
            }
          }
        }
      }
    }

    if (errors.length > 0) {
      throw new Error(
        `Found ${errors.length} schema mismatch(es):\n\n${errors.join('\n\n')}`
      )
    }
  })

  it('SCHEMA constant should match Prisma schema', () => {
    // This test reminds us to update SCHEMA when Prisma schema changes
    const schemaPath = path.join(__dirname, '../../../../packages/db/schema.prisma')
    const schemaContent = fs.readFileSync(schemaPath, 'utf-8')

    for (const [table, columns] of Object.entries(SCHEMA)) {
      // Check table exists in schema
      const tablePattern = new RegExp(`model\\s+${table}\\s*\\{`, 'i')
      expect(
        schemaContent.match(tablePattern),
        `Table "${table}" not found in schema.prisma`
      ).toBeTruthy()

      // Extract table body (handle multi-line properly)
      const tableMatch = schemaContent.match(
        new RegExp(`model\\s+${table}\\s*\\{([\\s\\S]*?)^\\}`, 'im')
      )

      if (tableMatch) {
        const tableBody = tableMatch[1]

        // Check each column exists (match column name at start of line, allowing whitespace)
        for (const column of columns) {
          // Match: whitespace + column name + whitespace + type (or end)
          const columnPattern = new RegExp(`^\\s+${column}\\s`, 'm')
          expect(
            tableBody.match(columnPattern),
            `Column "${column}" not found in table "${table}" in schema.prisma.\nTable body:\n${tableBody.slice(0, 500)}...`
          ).toBeTruthy()
        }
      }
    }
  })
})

describe('Raw SQL Best Practices', () => {
  it('should not use raw SQL for simple operations that Prisma can handle', () => {
    const srcDir = path.join(__dirname, '..')
    const tsFiles = findTsFiles(srcDir)
    const warnings: string[] = []

    for (const file of tsFiles) {
      const rawSqls = findRawSqlInFile(file)

      // Flag if there are many raw SQL statements in a single file
      if (rawSqls.length > 5) {
        warnings.push(
          `${path.relative(srcDir, file)} has ${rawSqls.length} raw SQL statements. ` +
          `Consider if some could use Prisma's type-safe API instead.`
        )
      }
    }

    if (warnings.length > 0) {
      console.warn('Raw SQL warnings:\n' + warnings.join('\n'))
    }
  })
})
