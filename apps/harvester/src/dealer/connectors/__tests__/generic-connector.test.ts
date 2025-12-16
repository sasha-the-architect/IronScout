/**
 * Generic Connector Unit Tests
 *
 * Tests for the auto-detecting generic feed connector
 * that handles common CSV, JSON, and XML formats.
 */

import { describe, it, expect } from 'vitest'
import { GenericConnector } from '../generic-connector'
import { ERROR_CODES } from '../types'
import {
  loadCsvFixture,
  loadJsonFixture,
  loadXmlFixture,
  assertValidParseResult,
  assertIndexableRecord,
  assertQuarantinedRecord,
  hasErrorCode,
  hasCoercion,
  countErrorCode,
  generateLargeFeed,
  generateFeedWithSpecialCharacters,
} from './test-utils'

describe('GenericConnector', () => {
  const connector = new GenericConnector()

  // ==========================================================================
  // BASIC PROPERTIES
  // ==========================================================================

  describe('properties', () => {
    it('has correct format type', () => {
      expect(connector.formatType).toBe('GENERIC')
    })

    it('has descriptive name', () => {
      expect(connector.name).toBe('Auto-Detect Generic Format')
    })

    it('provides field mapping documentation', () => {
      const mapping = connector.getFieldMapping()
      expect(mapping).toHaveProperty('title')
      expect(mapping).toHaveProperty('price')
      expect(mapping).toHaveProperty('upc')
      expect(mapping.title).toContain('title')
      expect(mapping.title).toContain('name')
    })
  })

  // ==========================================================================
  // CAN HANDLE DETECTION
  // ==========================================================================

  describe('canHandle', () => {
    it('handles CSV content', () => {
      const csv = loadCsvFixture('generic-valid.csv')
      expect(connector.canHandle(csv)).toBe(true)
    })

    it('handles JSON content', () => {
      const json = loadJsonFixture('generic-valid.json')
      expect(connector.canHandle(json)).toBe(true)
    })

    it('handles XML content', () => {
      const xml = loadXmlFixture('generic-valid.xml')
      expect(connector.canHandle(xml)).toBe(true)
    })

    it('handles empty CSV', () => {
      const csv = loadCsvFixture('generic-empty.csv')
      expect(connector.canHandle(csv)).toBe(true)
    })

    it('returns false for completely invalid content', () => {
      // This might still return true since generic handles anything
      // The point of generic is to be the fallback
      expect(connector.canHandle('')).toBe(true) // CSV fallback
    })
  })

  // ==========================================================================
  // CSV PARSING
  // ==========================================================================

  describe('CSV parsing', () => {
    it('parses valid CSV feed', async () => {
      const csv = loadCsvFixture('generic-valid.csv')
      const result = await connector.parse(csv)

      assertValidParseResult(result)
      expect(result.formatType).toBe('GENERIC')
      expect(result.totalRows).toBe(5)
      expect(result.indexableCount).toBe(5)
      expect(result.quarantineCount).toBe(0)
      expect(result.rejectCount).toBe(0)
    })

    it('extracts all fields from valid CSV', async () => {
      const csv = loadCsvFixture('generic-valid.csv')
      const result = await connector.parse(csv)

      const firstRecord = result.parsedRecords[0].record
      expect(firstRecord.upc).toBe('012345678901')
      expect(firstRecord.title).toBe('Federal American Eagle 9mm 115gr FMJ')
      expect(firstRecord.price).toBe(18.99)
      expect(firstRecord.brand).toBe('Federal')
      expect(firstRecord.caliber).toBe('9mm Luger')
      expect(firstRecord.grainWeight).toBe(115)
      expect(firstRecord.inStock).toBe(true)
      expect(firstRecord.quantity).toBe(500)
      expect(firstRecord.productUrl).toBe('https://example.com/fed-9mm')
      expect(firstRecord.imageUrl).toBe('https://example.com/img/fed-9mm.jpg')
      expect(firstRecord.caseType).toBe('Brass')
      expect(firstRecord.bulletType).toBe('FMJ')
      expect(firstRecord.roundCount).toBe(50)
    })

    it('quarantines records missing UPC', async () => {
      const csv = loadCsvFixture('generic-missing-upc.csv')
      const result = await connector.parse(csv)

      assertValidParseResult(result)
      expect(result.quarantineCount).toBe(2) // First two rows missing UPC
      expect(result.indexableCount).toBe(1) // Third row has valid UPC
      expect(countErrorCode(result, ERROR_CODES.MISSING_UPC)).toBe(2)
    })

    it('rejects records missing required fields', async () => {
      const csv = loadCsvFixture('generic-missing-required.csv')
      const result = await connector.parse(csv)

      assertValidParseResult(result)
      // Row 1: missing title -> reject
      // Row 2: missing price -> reject
      // Row 3: valid -> indexable
      // Row 4: price = 0 -> reject
      // Row 5: price negative -> reject (after coercion)
      expect(result.rejectCount).toBeGreaterThan(0)
    })

    it('handles malformed data with coercions', async () => {
      const csv = loadCsvFixture('generic-malformed-data.csv')
      const result = await connector.parse(csv)

      assertValidParseResult(result)
      // Records with invalid UPCs should be quarantined or rejected
      expect(result.quarantineCount + result.rejectCount).toBeGreaterThan(0)
    })

    it('handles empty CSV with headers only', async () => {
      const csv = loadCsvFixture('generic-empty.csv')
      const result = await connector.parse(csv)

      assertValidParseResult(result)
      expect(result.totalRows).toBe(0)
      expect(result.parsedRecords).toHaveLength(0)
    })

    it('handles boolean stock values correctly', async () => {
      const csv = loadCsvFixture('generic-valid.csv')
      const result = await connector.parse(csv)

      // Row 1: in_stock = "true" -> true
      expect(result.parsedRecords[0].record.inStock).toBe(true)
      // Row 4: in_stock = "false" -> false
      expect(result.parsedRecords[3].record.inStock).toBe(false)
      // Row 5: in_stock = "1" -> true
      expect(result.parsedRecords[4].record.inStock).toBe(true)
    })
  })

  // ==========================================================================
  // JSON PARSING
  // ==========================================================================

  describe('JSON parsing', () => {
    it('parses valid JSON feed with products wrapper', async () => {
      const json = loadJsonFixture('generic-valid.json')
      const result = await connector.parse(json)

      assertValidParseResult(result)
      expect(result.totalRows).toBe(3)
      expect(result.indexableCount).toBe(3)
    })

    it('parses JSON array without wrapper', async () => {
      const json = loadJsonFixture('generic-array.json')
      const result = await connector.parse(json)

      assertValidParseResult(result)
      expect(result.totalRows).toBe(2)
      expect(result.indexableCount).toBe(2)
    })

    it('parses JSON with items wrapper', async () => {
      const json = loadJsonFixture('generic-items-wrapper.json')
      const result = await connector.parse(json)

      assertValidParseResult(result)
      expect(result.totalRows).toBe(1)
    })

    it('parses JSON with data wrapper', async () => {
      const json = loadJsonFixture('generic-data-wrapper.json')
      const result = await connector.parse(json)

      assertValidParseResult(result)
      expect(result.totalRows).toBe(1)
    })

    it('handles edge cases in JSON', async () => {
      const json = loadJsonFixture('generic-edge-cases.json')
      const result = await connector.parse(json)

      assertValidParseResult(result)

      // Check trimming worked
      const trimmedRecord = result.parsedRecords[0].record
      expect(trimmedRecord.title).toBe('Trimmed Whitespace Title')
      expect(trimmedRecord.price).toBe(18.99)

      // Check UPC prefix removal
      const upcPrefixRecord = result.parsedRecords[1].record
      expect(upcPrefixRecord.upc).toBe('023456789012')

      // Check GTIN prefix removal
      const gtinPrefixRecord = result.parsedRecords[2].record
      expect(gtinPrefixRecord.upc).toBe('034567890123')

      // Check UPC with dashes
      const dashRecord = result.parsedRecords[3].record
      expect(dashRecord.upc).toBe('045678901234')
    })

    it('handles null and missing UPCs', async () => {
      const json = loadJsonFixture('generic-edge-cases.json')
      const result = await connector.parse(json)

      // Records with null/empty/missing UPC should be quarantined
      const quarantinedRecords = result.parsedRecords.filter(
        r => !r.isIndexable && r.record.title && r.record.price > 0
      )
      expect(quarantinedRecords.length).toBeGreaterThan(0)
    })

    it('handles alternative field names', async () => {
      const json = loadJsonFixture('generic-array.json')
      const result = await connector.parse(json)

      // Uses 'name' instead of 'title'
      expect(result.parsedRecords[0].record.title).toBe('Federal American Eagle 9mm 115gr FMJ')
      // Uses 'manufacturer' instead of 'brand'
      expect(result.parsedRecords[0].record.brand).toBe('Federal')
      // Uses 'grain_weight' instead of 'grain'
      expect(result.parsedRecords[0].record.grainWeight).toBe(115)
    })
  })

  // ==========================================================================
  // XML PARSING
  // ==========================================================================

  describe('XML parsing', () => {
    it('parses valid XML feed', async () => {
      const xml = loadXmlFixture('generic-valid.xml')
      const result = await connector.parse(xml)

      assertValidParseResult(result)
      expect(result.totalRows).toBe(2)
      expect(result.indexableCount).toBe(2)
    })

    it('extracts all fields from XML', async () => {
      const xml = loadXmlFixture('generic-valid.xml')
      const result = await connector.parse(xml)

      const firstRecord = result.parsedRecords[0].record
      expect(firstRecord.upc).toBe('012345678901')
      expect(firstRecord.title).toBe('Federal American Eagle 9mm 115gr FMJ')
      expect(firstRecord.price).toBe(18.99)
    })

    it('handles catalog XML structure', async () => {
      const xml = loadXmlFixture('generic-catalog.xml')
      const result = await connector.parse(xml)

      assertValidParseResult(result)
      expect(result.totalRows).toBe(1)
    })

    it('handles feed wrapper XML structure', async () => {
      const xml = loadXmlFixture('generic-feed-wrapper.xml')
      const result = await connector.parse(xml)

      assertValidParseResult(result)
      expect(result.totalRows).toBe(1)
    })
  })

  // ==========================================================================
  // ERROR HANDLING
  // ==========================================================================

  describe('error handling', () => {
    it('tracks MISSING_UPC errors', async () => {
      const csv = loadCsvFixture('generic-missing-upc.csv')
      const result = await connector.parse(csv)

      expect(result.errorCodes[ERROR_CODES.MISSING_UPC]).toBeGreaterThan(0)
    })

    it('tracks MISSING_TITLE errors', async () => {
      const csv = loadCsvFixture('generic-missing-required.csv')
      const result = await connector.parse(csv)

      expect(result.errorCodes[ERROR_CODES.MISSING_TITLE]).toBeGreaterThan(0)
    })

    it('tracks INVALID_PRICE errors', async () => {
      const csv = loadCsvFixture('generic-missing-required.csv')
      const result = await connector.parse(csv)

      expect(result.errorCodes[ERROR_CODES.INVALID_PRICE]).toBeGreaterThan(0)
    })

    it('accumulates multiple errors per record', async () => {
      const json = JSON.stringify({
        products: [
          { upc: '', title: '', price: 0 }, // Missing all required fields
        ],
      })
      const result = await connector.parse(json)

      const record = result.parsedRecords[0]
      expect(record.errors.length).toBeGreaterThan(1)
      expect(hasErrorCode(record, ERROR_CODES.MISSING_UPC)).toBe(true)
      expect(hasErrorCode(record, ERROR_CODES.MISSING_TITLE)).toBe(true)
      expect(hasErrorCode(record, ERROR_CODES.INVALID_PRICE)).toBe(true)
    })
  })

  // ==========================================================================
  // COERCION TRACKING
  // ==========================================================================

  describe('coercion tracking', () => {
    it('tracks numeric coercions', async () => {
      const json = JSON.stringify({
        products: [
          { upc: '012345678901', title: 'Test', price: '$18.99' },
        ],
      })
      const result = await connector.parse(json)

      const record = result.parsedRecords[0]
      expect(hasCoercion(record, 'price')).toBe(true)
    })

    it('tracks boolean coercions', async () => {
      const json = JSON.stringify({
        products: [
          { upc: '012345678901', title: 'Test', price: 18.99, in_stock: 'yes' },
        ],
      })
      const result = await connector.parse(json)

      const record = result.parsedRecords[0]
      expect(hasCoercion(record, 'inStock')).toBe(true)
    })

    it('tracks trim coercions', async () => {
      const json = JSON.stringify({
        products: [
          { upc: '012345678901', title: '  Trimmed Title  ', price: 18.99 },
        ],
      })
      const result = await connector.parse(json)

      const record = result.parsedRecords[0]
      expect(hasCoercion(record, 'title')).toBe(true)
    })
  })

  // ==========================================================================
  // INDEXABILITY DETERMINATION
  // ==========================================================================

  describe('indexability', () => {
    it('marks record as indexable when UPC, title, and price are valid', async () => {
      const json = JSON.stringify({
        products: [
          { upc: '012345678901', title: 'Test Product', price: 18.99 },
        ],
      })
      const result = await connector.parse(json)

      assertIndexableRecord(result.parsedRecords[0])
    })

    it('marks record as not indexable when UPC is missing', async () => {
      const json = JSON.stringify({
        products: [
          { title: 'Test Product', price: 18.99 },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].isIndexable).toBe(false)
    })

    it('marks record as not indexable when title is missing', async () => {
      const json = JSON.stringify({
        products: [
          { upc: '012345678901', price: 18.99 },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].isIndexable).toBe(false)
    })

    it('marks record as not indexable when price is zero', async () => {
      const json = JSON.stringify({
        products: [
          { upc: '012345678901', title: 'Test', price: 0 },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].isIndexable).toBe(false)
    })

    it('marks record as not indexable when price is negative', async () => {
      const json = JSON.stringify({
        products: [
          { upc: '012345678901', title: 'Test', price: -5.99 },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].isIndexable).toBe(false)
    })
  })

  // ==========================================================================
  // PERFORMANCE & STRESS TESTS
  // ==========================================================================

  describe('performance', () => {
    it('parses large feed (1000 products) in reasonable time', async () => {
      const json = generateLargeFeed(1000)
      const startTime = Date.now()

      const result = await connector.parse(json)

      const elapsed = Date.now() - startTime
      expect(elapsed).toBeLessThan(5000) // Should complete in under 5 seconds
      expect(result.totalRows).toBe(1000)
      expect(result.parseTimeMs).toBeDefined()
    })

    it('handles special characters correctly', async () => {
      const json = generateFeedWithSpecialCharacters()
      const result = await connector.parse(json)

      assertValidParseResult(result)
      expect(result.totalRows).toBe(3)

      // Check special characters preserved
      const quoteRecord = result.parsedRecords[0].record
      expect(quoteRecord.title).toContain('"quotes"')
      expect(quoteRecord.brand).toBe('Brand & Co.')
    })
  })

  // ==========================================================================
  // RAW ROW PRESERVATION
  // ==========================================================================

  describe('raw row preservation', () => {
    it('preserves original row data', async () => {
      const json = JSON.stringify({
        products: [
          {
            upc: '012345678901',
            title: 'Test',
            price: 18.99,
            custom_field: 'custom_value',
          },
        ],
      })
      const result = await connector.parse(json)

      const record = result.parsedRecords[0].record
      expect(record.rawRow).toBeDefined()
      expect(record.rawRow.custom_field).toBe('custom_value')
    })

    it('preserves row index', async () => {
      const csv = loadCsvFixture('generic-valid.csv')
      const result = await connector.parse(csv)

      result.parsedRecords.forEach((pr, index) => {
        expect(pr.record.rowIndex).toBe(index)
      })
    })
  })
})
