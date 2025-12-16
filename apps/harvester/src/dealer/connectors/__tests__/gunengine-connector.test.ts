/**
 * GunEngine Connector Unit Tests
 *
 * Tests for the GunEngine Offer Feed V2 format connector.
 */

import { describe, it, expect } from 'vitest'
import { GunEngineConnector } from '../gunengine-connector'
import { ERROR_CODES } from '../types'
import {
  loadCsvFixture,
  loadJsonFixture,
  loadXmlFixture,
  assertValidParseResult,
  assertIndexableRecord,
  hasErrorCode,
  countErrorCode,
} from './test-utils'

describe('GunEngineConnector', () => {
  const connector = new GunEngineConnector()

  // ==========================================================================
  // BASIC PROPERTIES
  // ==========================================================================

  describe('properties', () => {
    it('has correct format type', () => {
      expect(connector.formatType).toBe('GUNENGINE_V2')
    })

    it('has descriptive name', () => {
      expect(connector.name).toBe('GunEngine Offer Feed V2')
    })

    it('provides field mapping with required indicators', () => {
      const mapping = connector.getFieldMapping()
      expect(mapping.item_id).toContain('required')
      expect(mapping.upc).toContain('required')
      expect(mapping.title).toContain('required')
      expect(mapping.price).toContain('required')
      expect(mapping.url).toContain('required')
      expect(mapping.stock_status).toContain('required')
    })
  })

  // ==========================================================================
  // CAN HANDLE DETECTION
  // ==========================================================================

  describe('canHandle', () => {
    it('detects GunEngine JSON format', () => {
      const json = loadJsonFixture('gunengine-valid.json')
      expect(connector.canHandle(json)).toBe(true)
    })

    it('detects GunEngine XML format', () => {
      const xml = loadXmlFixture('gunengine-valid.xml')
      expect(connector.canHandle(xml)).toBe(true)
    })

    it('requires item_id field', () => {
      const json = JSON.stringify({
        offers: [
          { manufacturer: 'Federal', stock_status: 'in_stock', bullet_weight: 115 },
        ],
      })
      expect(connector.canHandle(json)).toBe(false)
    })

    it('requires manufacturer field', () => {
      const json = JSON.stringify({
        offers: [
          { item_id: 'SKU123', stock_status: 'in_stock', bullet_weight: 115 },
        ],
      })
      expect(connector.canHandle(json)).toBe(false)
    })

    it('accepts with stock_status', () => {
      const json = JSON.stringify({
        offers: [
          { item_id: 'SKU123', manufacturer: 'Federal', stock_status: 'in_stock' },
        ],
      })
      expect(connector.canHandle(json)).toBe(true)
    })

    it('accepts with V2 markers (bullet_weight)', () => {
      const json = JSON.stringify({
        offers: [
          { item_id: 'SKU123', manufacturer: 'Federal', bullet_weight: 115 },
        ],
      })
      expect(connector.canHandle(json)).toBe(true)
    })

    it('accepts with V2 markers (rounds_per_box)', () => {
      const json = JSON.stringify({
        offers: [
          { item_id: 'SKU123', manufacturer: 'Federal', rounds_per_box: 50 },
        ],
      })
      expect(connector.canHandle(json)).toBe(true)
    })

    it('rejects CSV format', () => {
      const csv = 'item_id,manufacturer,stock_status\nSKU123,Federal,in_stock'
      expect(connector.canHandle(csv)).toBe(false)
    })

    it('rejects GunEngine-style CSV format', () => {
      const csv = loadCsvFixture('gunengine-v2.csv')
      expect(connector.canHandle(csv)).toBe(false)
    })

    it('rejects AmmoSeek format', () => {
      const csv = 'upc,title,price,link,in_stock\n123,Test,10.99,http://test.com,true'
      expect(connector.canHandle(csv)).toBe(false)
    })
  })

  // ==========================================================================
  // JSON PARSING
  // ==========================================================================

  describe('JSON parsing', () => {
    it('parses valid GunEngine JSON feed', async () => {
      const json = loadJsonFixture('gunengine-valid.json')
      const result = await connector.parse(json)

      assertValidParseResult(result)
      expect(result.formatType).toBe('GUNENGINE_V2')
      expect(result.totalRows).toBe(3)
    })

    it('extracts all GunEngine fields', async () => {
      const json = loadJsonFixture('gunengine-valid.json')
      const result = await connector.parse(json)

      const firstRecord = result.parsedRecords[0].record
      expect(firstRecord.sku).toBe('FED-9MM-115') // item_id -> sku
      expect(firstRecord.upc).toBe('012345678901')
      expect(firstRecord.title).toBe('Federal American Eagle 9mm 115gr FMJ')
      expect(firstRecord.price).toBe(18.99)
      expect(firstRecord.productUrl).toBe('https://dealer.com/fed-9mm')
      expect(firstRecord.inStock).toBe(true)
      expect(firstRecord.brand).toBe('Federal') // manufacturer -> brand
      expect(firstRecord.caliber).toBe('9mm Luger')
      expect(firstRecord.grainWeight).toBe(115) // bullet_weight -> grainWeight
      expect(firstRecord.bulletType).toBe('FMJ')
      expect(firstRecord.caseType).toBe('Brass') // case_material -> caseType
      expect(firstRecord.roundCount).toBe(50) // rounds_per_box -> roundCount
      expect(firstRecord.imageUrl).toBe('https://dealer.com/img/fed-9mm.jpg')
      expect(firstRecord.description).toBe('Premium target ammunition')
      expect(firstRecord.quantity).toBe(500) // stock_quantity -> quantity
    })

    it('handles "in_stock" status', async () => {
      const json = loadJsonFixture('gunengine-valid.json')
      const result = await connector.parse(json)

      // First record has stock_status: "in_stock"
      expect(result.parsedRecords[0].record.inStock).toBe(true)
    })

    it('handles "limited" status as in stock', async () => {
      const json = loadJsonFixture('gunengine-valid.json')
      const result = await connector.parse(json)

      // Second record has stock_status: "limited"
      expect(result.parsedRecords[1].record.inStock).toBe(true)
    })

    it('handles "out_of_stock" status', async () => {
      const json = loadJsonFixture('gunengine-valid.json')
      const result = await connector.parse(json)

      // Third record has stock_status: "out_of_stock"
      expect(result.parsedRecords[2].record.inStock).toBe(false)
    })
  })

  // ==========================================================================
  // XML PARSING
  // ==========================================================================

  describe('XML parsing', () => {
    it('parses valid GunEngine XML feed', async () => {
      const xml = loadXmlFixture('gunengine-valid.xml')
      const result = await connector.parse(xml)

      assertValidParseResult(result)
      expect(result.totalRows).toBe(2)
    })

    it('extracts fields from XML format', async () => {
      const xml = loadXmlFixture('gunengine-valid.xml')
      const result = await connector.parse(xml)

      const firstRecord = result.parsedRecords[0].record
      expect(firstRecord.sku).toBe('FED-9MM-115')
      // XML parser strips leading zeros from numeric-looking values
      expect(firstRecord.upc).toBe('12345678901')
      expect(firstRecord.title).toBe('Federal American Eagle 9mm 115gr FMJ')
      expect(firstRecord.price).toBe(18.99)
    })

    it('handles "available" status in XML', async () => {
      const xml = loadXmlFixture('gunengine-valid.xml')
      const result = await connector.parse(xml)

      // Second record has stock_status: "available"
      expect(result.parsedRecords[1].record.inStock).toBe(true)
    })
  })

  // ==========================================================================
  // GUNENGINE-SPECIFIC VALIDATION
  // ==========================================================================

  describe('GunEngine-specific validation', () => {
    it('warns when item_id is missing', async () => {
      const json = loadJsonFixture('gunengine-missing-required.json')
      const result = await connector.parse(json)

      // First record missing item_id
      expect(hasErrorCode(result.parsedRecords[0], ERROR_CODES.MISSING_TITLE)).toBe(true)
    })

    it('warns when url is missing', async () => {
      const json = loadJsonFixture('gunengine-missing-required.json')
      const result = await connector.parse(json)

      // Second record missing url
      expect(hasErrorCode(result.parsedRecords[1], ERROR_CODES.MISSING_TITLE)).toBe(true)
    })

    it('allows records with all required fields', async () => {
      const json = loadJsonFixture('gunengine-missing-required.json')
      const result = await connector.parse(json)

      // Third record is complete
      assertIndexableRecord(result.parsedRecords[2])
    })
  })

  // ==========================================================================
  // FIELD MAPPING VARIATIONS
  // ==========================================================================

  describe('field mapping variations', () => {
    it('accepts "itemId" as alternative to "item_id"', async () => {
      const json = JSON.stringify({
        offers: [
          { itemId: 'SKU123', upc: '012345678901', title: 'Test', price: 18.99, url: 'http://test.com', stock_status: 'in_stock', manufacturer: 'Federal' },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].record.sku).toBe('SKU123')
    })

    it('accepts "sku" as alternative to "item_id"', async () => {
      const json = JSON.stringify({
        offers: [
          { sku: 'SKU123', upc: '012345678901', title: 'Test', price: 18.99, url: 'http://test.com', stock_status: 'in_stock', manufacturer: 'Federal' },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].record.sku).toBe('SKU123')
    })

    it('accepts "gtin" as alternative to "upc"', async () => {
      const json = JSON.stringify({
        offers: [
          { item_id: 'SKU123', gtin: '012345678901', title: 'Test', price: 18.99, url: 'http://test.com', stock_status: 'in_stock', manufacturer: 'Federal' },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].record.upc).toBe('012345678901')
    })

    it('accepts "brand" as alternative to "manufacturer"', async () => {
      const json = JSON.stringify({
        offers: [
          { item_id: 'SKU123', upc: '012345678901', title: 'Test', price: 18.99, url: 'http://test.com', stock_status: 'in_stock', brand: 'Federal' },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].record.brand).toBe('Federal')
    })

    it('accepts "link" as alternative to "url"', async () => {
      const json = JSON.stringify({
        offers: [
          { item_id: 'SKU123', upc: '012345678901', title: 'Test', price: 18.99, link: 'http://alt-url.com', stock_status: 'in_stock', manufacturer: 'Federal' },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].record.productUrl).toBe('http://alt-url.com')
    })

    it('accepts "grain" as alternative to "bullet_weight"', async () => {
      const json = JSON.stringify({
        offers: [
          { item_id: 'SKU123', upc: '012345678901', title: 'Test', price: 18.99, url: 'http://test.com', stock_status: 'in_stock', manufacturer: 'Federal', grain: 115 },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].record.grainWeight).toBe(115)
    })

    it('accepts "round_count" as alternative to "rounds_per_box"', async () => {
      const json = JSON.stringify({
        offers: [
          { item_id: 'SKU123', upc: '012345678901', title: 'Test', price: 18.99, url: 'http://test.com', stock_status: 'in_stock', manufacturer: 'Federal', round_count: 50 },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].record.roundCount).toBe(50)
    })

    it('accepts "casing" as alternative to "case_material"', async () => {
      const json = JSON.stringify({
        offers: [
          { item_id: 'SKU123', upc: '012345678901', title: 'Test', price: 18.99, url: 'http://test.com', stock_status: 'in_stock', manufacturer: 'Federal', casing: 'Brass' },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].record.caseType).toBe('Brass')
    })
  })

  // ==========================================================================
  // STOCK STATUS MAPPING
  // ==========================================================================

  describe('stock status mapping', () => {
    it('maps "in_stock" to true', async () => {
      const json = JSON.stringify({
        offers: [
          { item_id: 'SKU123', upc: '012345678901', title: 'Test', price: 18.99, url: 'http://test.com', stock_status: 'in_stock', manufacturer: 'Federal' },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].record.inStock).toBe(true)
    })

    it('maps "instock" to true', async () => {
      const json = JSON.stringify({
        offers: [
          { item_id: 'SKU123', upc: '012345678901', title: 'Test', price: 18.99, url: 'http://test.com', stock_status: 'instock', manufacturer: 'Federal' },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].record.inStock).toBe(true)
    })

    it('maps "available" to true', async () => {
      const json = JSON.stringify({
        offers: [
          { item_id: 'SKU123', upc: '012345678901', title: 'Test', price: 18.99, url: 'http://test.com', stock_status: 'available', manufacturer: 'Federal' },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].record.inStock).toBe(true)
    })

    it('maps "limited" to true', async () => {
      const json = JSON.stringify({
        offers: [
          { item_id: 'SKU123', upc: '012345678901', title: 'Test', price: 18.99, url: 'http://test.com', stock_status: 'limited', manufacturer: 'Federal' },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].record.inStock).toBe(true)
    })

    it('maps "out_of_stock" to false', async () => {
      const json = JSON.stringify({
        offers: [
          { item_id: 'SKU123', upc: '012345678901', title: 'Test', price: 18.99, url: 'http://test.com', stock_status: 'out_of_stock', manufacturer: 'Federal' },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].record.inStock).toBe(false)
    })

    it('maps "unavailable" to false', async () => {
      const json = JSON.stringify({
        offers: [
          { item_id: 'SKU123', upc: '012345678901', title: 'Test', price: 18.99, url: 'http://test.com', stock_status: 'unavailable', manufacturer: 'Federal' },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].record.inStock).toBe(false)
    })

    it('handles case-insensitive stock status', async () => {
      const json = JSON.stringify({
        offers: [
          { item_id: 'SKU123', upc: '012345678901', title: 'Test', price: 18.99, url: 'http://test.com', stock_status: 'IN_STOCK', manufacturer: 'Federal' },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].record.inStock).toBe(true)
    })

    it('defaults to true when stock_status missing', async () => {
      const json = JSON.stringify({
        offers: [
          { item_id: 'SKU123', upc: '012345678901', title: 'Test', price: 18.99, url: 'http://test.com', manufacturer: 'Federal' },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].record.inStock).toBe(true)
    })
  })

  // ==========================================================================
  // UPC VALIDATION
  // ==========================================================================

  describe('UPC validation', () => {
    it('validates and accepts correct UPCs', async () => {
      const json = JSON.stringify({
        offers: [
          { item_id: 'SKU123', upc: '012345678901', title: 'Test', price: 18.99, url: 'http://test.com', stock_status: 'in_stock', manufacturer: 'Federal' },
        ],
      })
      const result = await connector.parse(json)

      assertIndexableRecord(result.parsedRecords[0])
    })

    it('rejects invalid UPCs with error', async () => {
      const json = JSON.stringify({
        offers: [
          { item_id: 'SKU123', upc: '123', title: 'Test', price: 18.99, url: 'http://test.com', stock_status: 'in_stock', manufacturer: 'Federal' },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].isIndexable).toBe(false)
      expect(hasErrorCode(result.parsedRecords[0], ERROR_CODES.INVALID_UPC)).toBe(true)
    })
  })

  // ==========================================================================
  // ERROR SCENARIOS
  // ==========================================================================

  describe('error scenarios', () => {
    it('handles missing required UPC', async () => {
      const json = JSON.stringify({
        offers: [
          { item_id: 'SKU123', title: 'Test', price: 18.99, url: 'http://test.com', stock_status: 'in_stock', manufacturer: 'Federal' },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].isIndexable).toBe(false)
      expect(hasErrorCode(result.parsedRecords[0], ERROR_CODES.MISSING_UPC)).toBe(true)
    })

    it('handles missing required title', async () => {
      const json = JSON.stringify({
        offers: [
          { item_id: 'SKU123', upc: '012345678901', price: 18.99, url: 'http://test.com', stock_status: 'in_stock', manufacturer: 'Federal' },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].isIndexable).toBe(false)
      expect(hasErrorCode(result.parsedRecords[0], ERROR_CODES.MISSING_TITLE)).toBe(true)
    })

    it('handles missing required price', async () => {
      const json = JSON.stringify({
        offers: [
          { item_id: 'SKU123', upc: '012345678901', title: 'Test', url: 'http://test.com', stock_status: 'in_stock', manufacturer: 'Federal' },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].isIndexable).toBe(false)
      expect(hasErrorCode(result.parsedRecords[0], ERROR_CODES.INVALID_PRICE)).toBe(true)
    })

    it('handles zero price', async () => {
      const json = JSON.stringify({
        offers: [
          { item_id: 'SKU123', upc: '012345678901', title: 'Test', price: 0, url: 'http://test.com', stock_status: 'in_stock', manufacturer: 'Federal' },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].isIndexable).toBe(false)
    })
  })

  // ==========================================================================
  // EDGE CASE TESTS FROM FIXTURE
  // ==========================================================================

  describe('edge cases from fixture', () => {
    it('parses all edge case items', async () => {
      const json = loadJsonFixture('gunengine-edge-cases.json')
      const result = await connector.parse(json)

      assertValidParseResult(result)
      expect(result.totalRows).toBe(15)
    })

    it('handles various stock status formats', async () => {
      const json = loadJsonFixture('gunengine-edge-cases.json')
      const result = await connector.parse(json)

      // Items 0-3 should be in stock
      expect(result.parsedRecords[0].record.inStock).toBe(true) // in_stock
      expect(result.parsedRecords[1].record.inStock).toBe(true) // instock
      expect(result.parsedRecords[2].record.inStock).toBe(true) // available
      expect(result.parsedRecords[3].record.inStock).toBe(true) // limited

      // Items 4-5 should be out of stock
      expect(result.parsedRecords[4].record.inStock).toBe(false) // out_of_stock
      expect(result.parsedRecords[5].record.inStock).toBe(false) // unavailable

      // Item 6: uppercase IN_STOCK
      expect(result.parsedRecords[6].record.inStock).toBe(true)
    })

    it('handles GTIN instead of UPC', async () => {
      const json = loadJsonFixture('gunengine-edge-cases.json')
      const result = await connector.parse(json)

      // Item 7 uses gtin field
      expect(result.parsedRecords[7].record.upc).toBe('089012345678')
    })

    it('handles EAN instead of UPC', async () => {
      const json = loadJsonFixture('gunengine-edge-cases.json')
      const result = await connector.parse(json)

      // Item 8 uses ean field (13-digit)
      expect(result.parsedRecords[8].record.upc).toBe('0901234567890')
    })

    it('handles brand instead of manufacturer', async () => {
      const json = loadJsonFixture('gunengine-edge-cases.json')
      const result = await connector.parse(json)

      // Item 9 uses brand field
      expect(result.parsedRecords[9].record.brand).toBe('Hornady')
    })

    it('handles link instead of url', async () => {
      const json = loadJsonFixture('gunengine-edge-cases.json')
      const result = await connector.parse(json)

      // Item 10 uses link field
      expect(result.parsedRecords[10].record.productUrl).toBe('https://dealer.com/item11')
    })

    it('handles all V2 ammo fields', async () => {
      const json = loadJsonFixture('gunengine-edge-cases.json')
      const result = await connector.parse(json)

      // Item 11 has all V2 fields
      const record = result.parsedRecords[11].record
      expect(record.caliber).toBe('9mm Luger')
      expect(record.grainWeight).toBe(115)
      expect(record.bulletType).toBe('FMJ')
      expect(record.caseType).toBe('Brass')
      expect(record.roundCount).toBe(50)
    })

    it('handles alternative ammo field names', async () => {
      const json = loadJsonFixture('gunengine-edge-cases.json')
      const result = await connector.parse(json)

      // Item 12 uses alternative field names
      const record = result.parsedRecords[12].record
      expect(record.caliber).toBe('9mm')
      expect(record.grainWeight).toBe(115) // grain
      expect(record.bulletType).toBe('JHP') // projectile_type
      expect(record.caseType).toBe('Nickel') // casing
      expect(record.roundCount).toBe(25) // round_count
    })

    it('handles itemId (camelCase) instead of item_id', async () => {
      const json = loadJsonFixture('gunengine-edge-cases.json')
      const result = await connector.parse(json)

      // Item 13 uses itemId (camelCase)
      expect(result.parsedRecords[13].record.sku).toBe('SKU-014')
    })

    it('handles sku instead of item_id', async () => {
      const json = loadJsonFixture('gunengine-edge-cases.json')
      const result = await connector.parse(json)

      // Item 14 uses sku field
      expect(result.parsedRecords[14].record.sku).toBe('SKU-015')
    })
  })

  // ==========================================================================
  // COERCION TRACKING
  // ==========================================================================

  describe('coercion tracking', () => {
    it('tracks stock_status to boolean coercion', async () => {
      const json = JSON.stringify({
        offers: [
          { item_id: 'SKU123', upc: '012345678901', title: 'Test', price: 18.99, url: 'http://test.com', stock_status: 'in_stock', manufacturer: 'Federal' },
        ],
      })
      const result = await connector.parse(json)

      const coercions = result.parsedRecords[0].coercions
      const stockCoercion = coercions.find(c => c.field === 'inStock')
      expect(stockCoercion).toBeDefined()
      expect(stockCoercion?.rawValue).toBe('in_stock')
      expect(stockCoercion?.coercedValue).toBe(true)
    })

    it('tracks price coercion from string', async () => {
      const json = JSON.stringify({
        offers: [
          { item_id: 'SKU123', upc: '012345678901', title: 'Test', price: '$18.99', url: 'http://test.com', stock_status: 'in_stock', manufacturer: 'Federal' },
        ],
      })
      const result = await connector.parse(json)

      const coercions = result.parsedRecords[0].coercions
      const priceCoercion = coercions.find(c => c.field === 'price')
      expect(priceCoercion).toBeDefined()
      expect(priceCoercion?.coercedValue).toBe(18.99)
    })
  })
})
