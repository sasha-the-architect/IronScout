/**
 * AmmoSeek Connector Unit Tests
 *
 * Tests for the AmmoSeek-compatible feed format connector.
 * Reference: https://ammoseek.com/feed-specifications
 */

import { describe, it, expect } from 'vitest'
import { AmmoSeekConnector } from '../ammoseek-connector'
import { ERROR_CODES } from '../types'
import {
  loadCsvFixture,
  loadJsonFixture,
  assertValidParseResult,
  assertIndexableRecord,
  hasErrorCode,
  countErrorCode,
} from './test-utils'

describe('AmmoSeekConnector', () => {
  const connector = new AmmoSeekConnector()

  // ==========================================================================
  // BASIC PROPERTIES
  // ==========================================================================

  describe('properties', () => {
    it('has correct format type', () => {
      expect(connector.formatType).toBe('AMMOSEEK_V1')
    })

    it('has descriptive name', () => {
      expect(connector.name).toBe('AmmoSeek Compatible Format')
    })

    it('provides field mapping with required indicators', () => {
      const mapping = connector.getFieldMapping()
      expect(mapping.upc).toContain('required')
      expect(mapping.title).toContain('required')
      expect(mapping.price).toContain('required')
      expect(mapping.link).toContain('required')
      expect(mapping.in_stock).toContain('required')
    })
  })

  // ==========================================================================
  // CAN HANDLE DETECTION
  // ==========================================================================

  describe('canHandle', () => {
    it('detects AmmoSeek CSV format', () => {
      const csv = loadCsvFixture('ammoseek-valid.csv')
      expect(connector.canHandle(csv)).toBe(true)
    })

    it('detects AmmoSeek JSON format', () => {
      const json = loadJsonFixture('ammoseek-valid.json')
      expect(connector.canHandle(json)).toBe(true)
    })

    it('detects format with required field names', () => {
      const csv = 'upc,title,price,link,in_stock\n123,Test,10.99,http://test.com,true'
      expect(connector.canHandle(csv)).toBe(true)
    })

    it('rejects content missing upc field', () => {
      const csv = 'title,price,link,in_stock\nTest,10.99,http://test.com,true'
      expect(connector.canHandle(csv)).toBe(false)
    })

    it('rejects content missing price field', () => {
      const csv = 'upc,title,link,in_stock\n123,Test,http://test.com,true'
      expect(connector.canHandle(csv)).toBe(false)
    })

    it('rejects content missing link/url field', () => {
      const csv = 'upc,title,price,in_stock\n123,Test,10.99,true'
      expect(connector.canHandle(csv)).toBe(false)
    })

    it('accepts url as alternative to link', () => {
      const csv = 'upc,title,price,url,in_stock\n123,Test,10.99,http://test.com,true'
      expect(connector.canHandle(csv)).toBe(true)
    })

    it('accepts product_name as alternative to title', () => {
      const csv = 'upc,product_name,price,link,in_stock\n123,Test,10.99,http://test.com,true'
      expect(connector.canHandle(csv)).toBe(true)
    })

    it('rejects non-AmmoSeek format', () => {
      const csv = 'item_id,manufacturer,stock_status\nSKU123,Federal,in_stock'
      expect(connector.canHandle(csv)).toBe(false)
    })
  })

  // ==========================================================================
  // CSV PARSING
  // ==========================================================================

  describe('CSV parsing', () => {
    it('parses valid AmmoSeek CSV feed', async () => {
      const csv = loadCsvFixture('ammoseek-valid.csv')
      const result = await connector.parse(csv)

      assertValidParseResult(result)
      expect(result.formatType).toBe('AMMOSEEK_V1')
      expect(result.totalRows).toBe(4)
      expect(result.indexableCount).toBe(4)
    })

    it('extracts all AmmoSeek fields', async () => {
      const csv = loadCsvFixture('ammoseek-valid.csv')
      const result = await connector.parse(csv)

      const firstRecord = result.parsedRecords[0].record
      expect(firstRecord.upc).toBe('012345678901')
      expect(firstRecord.title).toBe('Federal American Eagle 9mm 115gr FMJ')
      expect(firstRecord.price).toBe(17.99) // Should use sale_price when available
      expect(firstRecord.salePrice).toBe(17.99)
      expect(firstRecord.productUrl).toBe('https://dealer.com/fed-9mm')
      expect(firstRecord.inStock).toBe(true)
      expect(firstRecord.brand).toBe('Federal')
      expect(firstRecord.caliber).toBe('9mm Luger')
      expect(firstRecord.grainWeight).toBe(115)
      expect(firstRecord.caseType).toBe('Brass')
      expect(firstRecord.bulletType).toBe('FMJ')
      expect(firstRecord.roundCount).toBe(50)
      expect(firstRecord.imageUrl).toBe('https://dealer.com/img/fed-9mm.jpg')
      expect(firstRecord.description).toBe('Premium target ammunition')
      expect(firstRecord.sku).toBe('FED-9MM-115')
    })

    it('uses regular price when sale_price not available', async () => {
      const csv = loadCsvFixture('ammoseek-valid.csv')
      const result = await connector.parse(csv)

      // Second row has no sale_price
      const secondRecord = result.parsedRecords[1].record
      expect(secondRecord.price).toBe(27.99)
      expect(secondRecord.salePrice).toBeUndefined()
    })

    it('prefers sale_price over regular price', async () => {
      const csv = loadCsvFixture('ammoseek-valid.csv')
      const result = await connector.parse(csv)

      // First row has sale_price of 17.99, regular price of 18.99
      const firstRecord = result.parsedRecords[0].record
      expect(firstRecord.price).toBe(17.99)
    })

    it('handles out of stock items', async () => {
      const csv = loadCsvFixture('ammoseek-valid.csv')
      const result = await connector.parse(csv)

      // Fourth row is out of stock
      const fourthRecord = result.parsedRecords[3].record
      expect(fourthRecord.inStock).toBe(false)
    })
  })

  // ==========================================================================
  // JSON PARSING
  // ==========================================================================

  describe('JSON parsing', () => {
    it('parses valid AmmoSeek JSON feed', async () => {
      const json = loadJsonFixture('ammoseek-valid.json')
      const result = await connector.parse(json)

      assertValidParseResult(result)
      expect(result.totalRows).toBe(2)
      expect(result.indexableCount).toBe(2)
    })

    it('extracts fields from JSON format', async () => {
      const json = loadJsonFixture('ammoseek-valid.json')
      const result = await connector.parse(json)

      const firstRecord = result.parsedRecords[0].record
      expect(firstRecord.upc).toBe('012345678901')
      expect(firstRecord.price).toBe(17.99) // sale_price preferred
      expect(firstRecord.productUrl).toBe('https://dealer.com/fed-9mm')
    })
  })

  // ==========================================================================
  // UPC VALIDATION
  // ==========================================================================

  describe('UPC validation', () => {
    it('validates and accepts correct UPCs', async () => {
      const json = JSON.stringify({
        products: [
          { upc: '012345678901', title: 'Test', price: 18.99, link: 'http://test.com', in_stock: true },
        ],
      })
      const result = await connector.parse(json)

      assertIndexableRecord(result.parsedRecords[0])
    })

    it('rejects invalid UPCs with error', async () => {
      const json = JSON.stringify({
        products: [
          { upc: '123', title: 'Test', price: 18.99, link: 'http://test.com', in_stock: true },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].isIndexable).toBe(false)
      expect(hasErrorCode(result.parsedRecords[0], ERROR_CODES.INVALID_UPC)).toBe(true)
    })

    it('strips UPC prefix', async () => {
      const json = JSON.stringify({
        products: [
          { upc: 'UPC:012345678901', title: 'Test', price: 18.99, link: 'http://test.com', in_stock: true },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].record.upc).toBe('012345678901')
    })
  })

  // ==========================================================================
  // AMMOSEEK-SPECIFIC VALIDATION
  // ==========================================================================

  describe('AmmoSeek-specific validation', () => {
    it('warns when caliber is missing', async () => {
      const csv = loadCsvFixture('ammoseek-missing-recommended.csv')
      const result = await connector.parse(csv)

      // All records missing caliber should have warning
      const caliberWarnings = countErrorCode(result, ERROR_CODES.MISSING_CALIBER)
      expect(caliberWarnings).toBeGreaterThan(0)
    })

    it('warns when brand is missing', async () => {
      const csv = loadCsvFixture('ammoseek-missing-recommended.csv')
      const result = await connector.parse(csv)

      // Records missing brand should have warning
      const brandWarnings = countErrorCode(result, ERROR_CODES.MISSING_BRAND)
      expect(brandWarnings).toBeGreaterThan(0)
    })

    it('records are still indexable despite missing recommended fields', async () => {
      const json = JSON.stringify({
        products: [
          {
            upc: '012345678901',
            title: 'Test Product',
            price: 18.99,
            link: 'http://test.com',
            in_stock: true,
            // No brand, no caliber
          },
        ],
      })
      const result = await connector.parse(json)

      // Should be indexable (brand/caliber are recommended, not required)
      assertIndexableRecord(result.parsedRecords[0])
      // But should have warnings
      expect(hasErrorCode(result.parsedRecords[0], ERROR_CODES.MISSING_CALIBER)).toBe(true)
      expect(hasErrorCode(result.parsedRecords[0], ERROR_CODES.MISSING_BRAND)).toBe(true)
    })
  })

  // ==========================================================================
  // FIELD MAPPING VARIATIONS
  // ==========================================================================

  describe('field mapping variations', () => {
    it('accepts "name" as alternative to "title"', async () => {
      const json = JSON.stringify({
        products: [
          { upc: '012345678901', name: 'Alt Title', price: 18.99, link: 'http://test.com', in_stock: true },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].record.title).toBe('Alt Title')
    })

    it('accepts "url" as alternative to "link"', async () => {
      const json = JSON.stringify({
        products: [
          { upc: '012345678901', title: 'Test', price: 18.99, url: 'http://alt-url.com', in_stock: true },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].record.productUrl).toBe('http://alt-url.com')
    })

    it('accepts "instock" as alternative to "in_stock"', async () => {
      const json = JSON.stringify({
        products: [
          { upc: '012345678901', title: 'Test', price: 18.99, link: 'http://test.com', instock: false },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].record.inStock).toBe(false)
    })

    it('accepts "manufacturer" as alternative to "brand"', async () => {
      const json = JSON.stringify({
        products: [
          { upc: '012345678901', title: 'Test', price: 18.99, link: 'http://test.com', in_stock: true, manufacturer: 'Federal' },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].record.brand).toBe('Federal')
    })

    it('accepts "grain_weight" as alternative to "grain"', async () => {
      const json = JSON.stringify({
        products: [
          { upc: '012345678901', title: 'Test', price: 18.99, link: 'http://test.com', in_stock: true, grain_weight: 115 },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].record.grainWeight).toBe(115)
    })

    it('accepts "rounds" as alternative to "round_count"', async () => {
      const json = JSON.stringify({
        products: [
          { upc: '012345678901', title: 'Test', price: 18.99, link: 'http://test.com', in_stock: true, rounds: 50 },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].record.roundCount).toBe(50)
    })

    it('accepts "image_url" as alternative to "image_link"', async () => {
      const json = JSON.stringify({
        products: [
          { upc: '012345678901', title: 'Test', price: 18.99, link: 'http://test.com', in_stock: true, image_url: 'http://img.com/test.jpg' },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].record.imageUrl).toBe('http://img.com/test.jpg')
    })
  })

  // ==========================================================================
  // ERROR SCENARIOS
  // ==========================================================================

  describe('error scenarios', () => {
    it('handles missing required title', async () => {
      const json = JSON.stringify({
        products: [
          { upc: '012345678901', price: 18.99, link: 'http://test.com', in_stock: true },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].isIndexable).toBe(false)
      expect(hasErrorCode(result.parsedRecords[0], ERROR_CODES.MISSING_TITLE)).toBe(true)
    })

    it('handles missing required price', async () => {
      const json = JSON.stringify({
        products: [
          { upc: '012345678901', title: 'Test', link: 'http://test.com', in_stock: true },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].isIndexable).toBe(false)
      expect(hasErrorCode(result.parsedRecords[0], ERROR_CODES.INVALID_PRICE)).toBe(true)
    })

    it('handles zero price', async () => {
      const json = JSON.stringify({
        products: [
          { upc: '012345678901', title: 'Test', price: 0, link: 'http://test.com', in_stock: true },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].isIndexable).toBe(false)
    })

    it('handles negative price', async () => {
      const json = JSON.stringify({
        products: [
          { upc: '012345678901', title: 'Test', price: -5.99, link: 'http://test.com', in_stock: true },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].isIndexable).toBe(false)
    })
  })

  // ==========================================================================
  // COERCION SCENARIOS
  // ==========================================================================

  describe('coercion scenarios', () => {
    it('coerces string price to number', async () => {
      const json = JSON.stringify({
        products: [
          { upc: '012345678901', title: 'Test', price: '$18.99', link: 'http://test.com', in_stock: true },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].record.price).toBe(18.99)
    })

    it('coerces various boolean formats', async () => {
      const json = JSON.stringify({
        products: [
          { upc: '012345678901', title: 'Test1', price: 18.99, link: 'http://test.com', in_stock: 'yes' },
          { upc: '023456789012', title: 'Test2', price: 18.99, link: 'http://test.com', in_stock: '1' },
          { upc: '034567890123', title: 'Test3', price: 18.99, link: 'http://test.com', in_stock: 'available' },
          { upc: '045678901234', title: 'Test4', price: 18.99, link: 'http://test.com', in_stock: 'no' },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].record.inStock).toBe(true)
      expect(result.parsedRecords[1].record.inStock).toBe(true)
      expect(result.parsedRecords[2].record.inStock).toBe(true)
      expect(result.parsedRecords[3].record.inStock).toBe(false)
    })

    it('coerces grain weight from string', async () => {
      const json = JSON.stringify({
        products: [
          { upc: '012345678901', title: 'Test', price: 18.99, link: 'http://test.com', in_stock: true, grain: '115' },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].record.grainWeight).toBe(115)
    })
  })
})
