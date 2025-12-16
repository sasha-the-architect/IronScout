/**
 * Test Utilities for Feed Connector Tests
 *
 * Provides helper functions for loading fixtures, creating test data,
 * and asserting on parse results.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import type { FeedParseResult, ParsedRecordResult, ParsedFeedRecord } from '../types'

// ============================================================================
// FIXTURE LOADING
// ============================================================================

const FIXTURES_DIR = join(__dirname, 'fixtures')

export function loadFixture(type: 'csv' | 'json' | 'xml', filename: string): string {
  const filepath = join(FIXTURES_DIR, type, filename)
  return readFileSync(filepath, 'utf-8')
}

export function loadCsvFixture(filename: string): string {
  return loadFixture('csv', filename)
}

export function loadJsonFixture(filename: string): string {
  return loadFixture('json', filename)
}

export function loadXmlFixture(filename: string): string {
  return loadFixture('xml', filename)
}

// ============================================================================
// PARSE RESULT ASSERTIONS
// ============================================================================

export function assertValidParseResult(result: FeedParseResult): void {
  expect(result).toBeDefined()
  expect(result.totalRows).toBeGreaterThanOrEqual(0)
  expect(result.parsedRecords).toBeDefined()
  expect(Array.isArray(result.parsedRecords)).toBe(true)
  expect(result.indexableCount).toBeGreaterThanOrEqual(0)
  expect(result.quarantineCount).toBeGreaterThanOrEqual(0)
  expect(result.rejectCount).toBeGreaterThanOrEqual(0)
  expect(result.parseTimeMs).toBeGreaterThanOrEqual(0)

  // Sum should equal total
  const sum = result.indexableCount + result.quarantineCount + result.rejectCount
  expect(sum).toBe(result.totalRows)
}

export function assertIndexableRecord(record: ParsedRecordResult): void {
  expect(record.isIndexable).toBe(true)
  expect(record.record.upc).toBeDefined()
  expect(record.record.upc!.length).toBeGreaterThanOrEqual(8)
  expect(record.record.upc!.length).toBeLessThanOrEqual(14)
  expect(record.record.title).toBeTruthy()
  expect(record.record.price).toBeGreaterThan(0)
}

export function assertQuarantinedRecord(record: ParsedRecordResult): void {
  expect(record.isIndexable).toBe(false)
  // Quarantined = has required fields but missing UPC
  expect(record.record.title).toBeTruthy()
  expect(record.record.price).toBeGreaterThan(0)
  expect(record.record.upc).toBeUndefined()
}

export function assertRejectedRecord(record: ParsedRecordResult): void {
  expect(record.isIndexable).toBe(false)
  // Rejected = missing required fields (title or valid price)
  const missingTitle = !record.record.title
  const invalidPrice = !record.record.price || record.record.price <= 0
  expect(missingTitle || invalidPrice).toBe(true)
}

// ============================================================================
// ERROR CODE HELPERS
// ============================================================================

export function hasErrorCode(record: ParsedRecordResult, code: string): boolean {
  return record.errors.some(e => e.code === code)
}

export function getErrorCodes(record: ParsedRecordResult): string[] {
  return record.errors.map(e => e.code)
}

export function countErrorCode(result: FeedParseResult, code: string): number {
  return result.errorCodes[code] || 0
}

// ============================================================================
// COERCION HELPERS
// ============================================================================

export function hasCoercion(record: ParsedRecordResult, field: string): boolean {
  return record.coercions.some(c => c.field === field)
}

export function getCoercion(
  record: ParsedRecordResult,
  field: string
): { rawValue: unknown; coercedValue: unknown; coercionType: string } | undefined {
  return record.coercions.find(c => c.field === field)
}

// ============================================================================
// TEST DATA FACTORIES
// ============================================================================

export function createValidRecord(overrides: Partial<ParsedFeedRecord> = {}): ParsedFeedRecord {
  return {
    upc: '012345678901',
    sku: 'TEST-SKU-001',
    title: 'Test Product 9mm 115gr FMJ',
    description: 'Test product description',
    brand: 'TestBrand',
    price: 18.99,
    caliber: '9mm Luger',
    grainWeight: 115,
    caseType: 'Brass',
    bulletType: 'FMJ',
    roundCount: 50,
    inStock: true,
    quantity: 100,
    productUrl: 'https://example.com/test-product',
    imageUrl: 'https://example.com/img/test.jpg',
    rawRow: {},
    rowIndex: 0,
    ...overrides,
  }
}

export function createCsvRow(fields: Record<string, string | number | boolean>): string {
  const headers = Object.keys(fields).join(',')
  const values = Object.values(fields)
    .map(v => {
      if (typeof v === 'string' && v.includes(',')) {
        return `"${v}"`
      }
      return String(v)
    })
    .join(',')
  return `${headers}\n${values}`
}

export function createJsonFeed(products: Record<string, unknown>[]): string {
  return JSON.stringify({ products })
}

export function createXmlFeed(products: Record<string, unknown>[]): string {
  const items = products
    .map(p => {
      const fields = Object.entries(p)
        .map(([k, v]) => `    <${k}>${v}</${k}>`)
        .join('\n')
      return `  <product>\n${fields}\n  </product>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<products>\n${items}\n</products>`
}

// ============================================================================
// EDGE CASE DATA GENERATORS
// ============================================================================

export const INVALID_UPCS = [
  '', // Empty
  '123', // Too short
  '12345', // Still too short
  '1234567', // 7 digits (minimum is 8)
  '123456789012345', // 15 digits (max is 14)
  '12345678901234567890', // Way too long
  'ABCDEFGHIJKL', // Non-numeric
  'ABC12345DEF', // Mixed
  // Note: '12.345.678.901' is actually VALID - dots get stripped leaving 11 digits
]

export const VALID_UPCS = [
  '12345678', // UPC-E (8 digits)
  '123456789012', // UPC-A (12 digits)
  '1234567890123', // EAN-13 (13 digits)
  '12345678901234', // GTIN-14 (14 digits)
]

export const UPC_WITH_PREFIXES = [
  { input: 'UPC:123456789012', expected: '123456789012' },
  { input: 'GTIN:1234567890123', expected: '1234567890123' },
  { input: 'upc:123456789012', expected: '123456789012' },
  { input: 'gtin:1234567890123', expected: '1234567890123' },
]

export const PRICE_EDGE_CASES = [
  { input: '$18.99', expected: 18.99 },
  { input: '  $18.99  ', expected: 18.99 },
  { input: '18.99 USD', expected: 18.99 },
  { input: '1,234.56', expected: 1234.56 },
  { input: '18', expected: 18 },
  { input: 18.99, expected: 18.99 },
  { input: '0', expected: 0 },
  { input: '-5.99', expected: -5.99 },
  { input: '', expected: undefined },
  { input: 'free', expected: undefined },
  { input: null, expected: undefined },
]

export const BOOLEAN_EDGE_CASES = [
  { input: true, expected: true },
  { input: false, expected: false },
  { input: 'true', expected: true },
  { input: 'false', expected: false },
  { input: '1', expected: true },
  { input: '0', expected: false },
  { input: 'yes', expected: true },
  { input: 'no', expected: false },
  { input: 'y', expected: true },
  { input: 'n', expected: false },
  { input: 'in stock', expected: true },
  { input: 'out of stock', expected: false },
  { input: 'available', expected: true },
  { input: 'unavailable', expected: false },
  { input: 'IN STOCK', expected: true },
  { input: 'Available', expected: true },
]

// ============================================================================
// STRESS TEST DATA
// ============================================================================

export function generateLargeFeed(count: number): string {
  const products = []
  for (let i = 0; i < count; i++) {
    products.push({
      upc: String(100000000000 + i).padStart(12, '0'),
      title: `Test Product ${i} - 9mm 115gr FMJ`,
      price: 15 + (i % 20),
      brand: ['Federal', 'Hornady', 'Winchester', 'Remington'][i % 4],
      caliber: '9mm Luger',
      grain: 115,
      in_stock: i % 3 !== 0,
    })
  }
  return JSON.stringify({ products })
}

export function generateFeedWithSpecialCharacters(): string {
  return JSON.stringify({
    products: [
      {
        upc: '012345678901',
        title: 'Product with "quotes" and \'apostrophes\'',
        price: 18.99,
        brand: 'Brand & Co.',
        description: 'Contains <html> tags & special chars: © ® ™',
        in_stock: true,
      },
      {
        upc: '023456789012',
        title: 'Emoji test 🔫 💥 🎯',
        price: 27.99,
        brand: 'Unicode™ Brand',
        description: 'Línea de productos en español',
        in_stock: true,
      },
      {
        upc: '034567890123',
        title: 'Newline\nand\ttab\tcharacters',
        price: 32.99,
        brand: 'Test',
        in_stock: true,
      },
    ],
  })
}
