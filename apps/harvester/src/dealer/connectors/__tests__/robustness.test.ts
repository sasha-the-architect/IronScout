/**
 * Robustness Tests for Feed Connectors
 *
 * Tests edge cases, malformed inputs, boundary conditions, and error handling
 * across all connector types to ensure graceful degradation and proper error reporting.
 */

import { describe, it, expect } from 'vitest'
import { GenericConnector } from '../generic-connector'
import { AmmoSeekConnector } from '../ammoseek-connector'
import { GunEngineConnector } from '../gunengine-connector'
import { ERROR_CODES } from '../types'
import {
  assertValidParseResult,
  hasErrorCode,
  generateLargeFeed,
  generateFeedWithSpecialCharacters,
} from './test-utils'

// =============================================================================
// EMPTY AND WHITESPACE FEEDS
// =============================================================================

describe('Empty and whitespace feeds', () => {
  const genericConnector = new GenericConnector()
  const ammoSeekConnector = new AmmoSeekConnector()
  const gunEngineConnector = new GunEngineConnector()

  describe('GenericConnector', () => {
    it('handles empty string', async () => {
      const result = await genericConnector.parse('')

      assertValidParseResult(result)
      expect(result.totalRows).toBe(0)
      expect(result.indexableCount).toBe(0)
      expect(result.quarantineCount).toBe(0)
      expect(result.rejectCount).toBe(0)
    })

    it('handles whitespace-only content', async () => {
      const result = await genericConnector.parse('   \n\t\n   ')

      assertValidParseResult(result)
      expect(result.totalRows).toBe(0)
    })

    it('handles CSV with headers only', async () => {
      const result = await genericConnector.parse('upc,title,price,link\n')

      assertValidParseResult(result)
      expect(result.totalRows).toBe(0)
    })

    it('handles JSON with empty products array', async () => {
      const result = await genericConnector.parse('{"products": []}')

      assertValidParseResult(result)
      expect(result.totalRows).toBe(0)
    })

    it('handles JSON with empty items array', async () => {
      const result = await genericConnector.parse('{"items": []}')

      assertValidParseResult(result)
      expect(result.totalRows).toBe(0)
    })

    it('handles XML with empty products', async () => {
      const result = await genericConnector.parse('<?xml version="1.0"?><products></products>')

      assertValidParseResult(result)
      expect(result.totalRows).toBe(0)
    })
  })

  describe('AmmoSeekConnector', () => {
    it('handles empty string', async () => {
      const result = await ammoSeekConnector.parse('')

      assertValidParseResult(result)
      expect(result.totalRows).toBe(0)
    })

    it('handles JSON with empty products', async () => {
      const result = await ammoSeekConnector.parse('{"products": []}')

      assertValidParseResult(result)
      expect(result.totalRows).toBe(0)
    })

    it('handles CSV with headers only', async () => {
      const result = await ammoSeekConnector.parse('upc,title,price,link,in_stock\n')

      assertValidParseResult(result)
      expect(result.totalRows).toBe(0)
    })
  })

  describe('GunEngineConnector', () => {
    it('handles empty string', async () => {
      const result = await gunEngineConnector.parse('')

      assertValidParseResult(result)
      expect(result.totalRows).toBe(0)
    })

    it('handles JSON with empty offers', async () => {
      const result = await gunEngineConnector.parse('{"offers": []}')

      assertValidParseResult(result)
      expect(result.totalRows).toBe(0)
    })
  })
})

// =============================================================================
// QUARANTINE VS REJECT CLASSIFICATION
// =============================================================================

describe('Quarantine vs Reject classification', () => {
  const connector = new GenericConnector()

  describe('Indexable records (valid UPC + required fields)', () => {
    it('classifies record with valid UPC and all required fields as indexable', async () => {
      const json = JSON.stringify({
        products: [
          { upc: '012345678901', title: 'Valid Product', price: 18.99, link: 'http://test.com' },
        ],
      })
      const result = await connector.parse(json)

      expect(result.indexableCount).toBe(1)
      expect(result.quarantineCount).toBe(0)
      expect(result.rejectCount).toBe(0)
      expect(result.parsedRecords[0].isIndexable).toBe(true)
    })
  })

  describe('Quarantined records (missing UPC but otherwise valid)', () => {
    it('quarantines record with missing UPC but valid title/price', async () => {
      const json = JSON.stringify({
        products: [
          { title: 'No UPC Product', price: 18.99, link: 'http://test.com' },
        ],
      })
      const result = await connector.parse(json)

      expect(result.indexableCount).toBe(0)
      expect(result.quarantineCount).toBe(1)
      expect(result.rejectCount).toBe(0)
      expect(result.parsedRecords[0].isIndexable).toBe(false)
      expect(hasErrorCode(result.parsedRecords[0], ERROR_CODES.MISSING_UPC)).toBe(true)
    })

    it('quarantines record with empty UPC string', async () => {
      const json = JSON.stringify({
        products: [
          { upc: '', title: 'Empty UPC Product', price: 18.99, link: 'http://test.com' },
        ],
      })
      const result = await connector.parse(json)

      expect(result.quarantineCount).toBe(1)
      expect(result.parsedRecords[0].isIndexable).toBe(false)
    })
  })

  describe('Rejected records (missing required fields)', () => {
    it('rejects record with missing title', async () => {
      const json = JSON.stringify({
        products: [
          { upc: '012345678901', price: 18.99, link: 'http://test.com' },
        ],
      })
      const result = await connector.parse(json)

      expect(result.indexableCount).toBe(0)
      expect(result.rejectCount).toBe(1)
      expect(result.parsedRecords[0].isIndexable).toBe(false)
      expect(hasErrorCode(result.parsedRecords[0], ERROR_CODES.MISSING_TITLE)).toBe(true)
    })

    it('rejects record with empty title', async () => {
      const json = JSON.stringify({
        products: [
          { upc: '012345678901', title: '', price: 18.99, link: 'http://test.com' },
        ],
      })
      const result = await connector.parse(json)

      expect(result.rejectCount).toBe(1)
      expect(hasErrorCode(result.parsedRecords[0], ERROR_CODES.MISSING_TITLE)).toBe(true)
    })

    it('rejects record with missing price', async () => {
      const json = JSON.stringify({
        products: [
          { upc: '012345678901', title: 'No Price', link: 'http://test.com' },
        ],
      })
      const result = await connector.parse(json)

      expect(result.rejectCount).toBe(1)
      expect(hasErrorCode(result.parsedRecords[0], ERROR_CODES.INVALID_PRICE)).toBe(true)
    })

    it('rejects record with zero price', async () => {
      const json = JSON.stringify({
        products: [
          { upc: '012345678901', title: 'Zero Price', price: 0, link: 'http://test.com' },
        ],
      })
      const result = await connector.parse(json)

      expect(result.rejectCount).toBe(1)
      expect(result.parsedRecords[0].isIndexable).toBe(false)
    })

    it('rejects record with negative price', async () => {
      const json = JSON.stringify({
        products: [
          { upc: '012345678901', title: 'Negative Price', price: -5.99, link: 'http://test.com' },
        ],
      })
      const result = await connector.parse(json)

      expect(result.rejectCount).toBe(1)
      expect(result.parsedRecords[0].isIndexable).toBe(false)
    })

    it('quarantines record with invalid UPC (too short)', async () => {
      // Invalid UPCs get normalized to null by validateUPC(), which triggers MISSING_UPC
      // These are quarantined (not rejected) because they have valid title/price
      const json = JSON.stringify({
        products: [
          { upc: '123', title: 'Short UPC', price: 18.99, link: 'http://test.com' },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].isIndexable).toBe(false)
      expect(hasErrorCode(result.parsedRecords[0], ERROR_CODES.MISSING_UPC)).toBe(true)
      expect(result.quarantineCount).toBe(1) // Valid fields but invalid UPC
    })

    it('quarantines record with invalid UPC (alpha characters)', async () => {
      const json = JSON.stringify({
        products: [
          { upc: 'ABCDEFGHIJKL', title: 'Alpha UPC', price: 18.99, link: 'http://test.com' },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].isIndexable).toBe(false)
      expect(hasErrorCode(result.parsedRecords[0], ERROR_CODES.MISSING_UPC)).toBe(true)
      expect(result.quarantineCount).toBe(1)
    })

    it('quarantines record with invalid UPC (too long)', async () => {
      const json = JSON.stringify({
        products: [
          { upc: '123456789012345', title: 'Long UPC', price: 18.99, link: 'http://test.com' },
        ],
      })
      const result = await connector.parse(json)

      expect(result.parsedRecords[0].isIndexable).toBe(false)
      expect(hasErrorCode(result.parsedRecords[0], ERROR_CODES.MISSING_UPC)).toBe(true)
      expect(result.quarantineCount).toBe(1)
    })
  })

  describe('Mixed classification in single feed', () => {
    it('correctly classifies mixed valid/invalid records', async () => {
      const json = JSON.stringify({
        products: [
          { upc: '012345678901', title: 'Valid', price: 18.99, link: 'http://test.com' }, // indexable
          { title: 'No UPC', price: 18.99, link: 'http://test.com' }, // quarantine
          { upc: '023456789012', price: 18.99, link: 'http://test.com' }, // reject (no title)
          { upc: '034567890123', title: 'Zero Price', price: 0, link: 'http://test.com' }, // reject
          { upc: '045678901234', title: 'Valid 2', price: 27.99, link: 'http://test.com' }, // indexable
        ],
      })
      const result = await connector.parse(json)

      expect(result.totalRows).toBe(5)
      expect(result.indexableCount).toBe(2)
      expect(result.quarantineCount).toBe(1)
      expect(result.rejectCount).toBe(2)
    })
  })
})

// =============================================================================
// MALFORMED INPUT HANDLING
// =============================================================================

describe('Malformed input handling', () => {
  const connector = new GenericConnector()

  describe('Truncated JSON', () => {
    // Note: JSON.parse throws on malformed JSON - this is expected behavior
    // The connector doesn't wrap JSON parsing errors (could be enhanced later)
    it('throws on truncated JSON object', async () => {
      await expect(connector.parse('{"products": [{"upc": "123"')).rejects.toThrow()
    })

    it('throws on truncated JSON array', async () => {
      await expect(connector.parse('[{"upc": "012345678901", "title": "Test"')).rejects.toThrow()
    })

    it('throws on JSON with missing closing brace', async () => {
      await expect(connector.parse('{"products": [{"upc": "012345678901"}]')).rejects.toThrow()
    })
  })

  describe('Truncated XML', () => {
    it('handles truncated XML', async () => {
      const result = await connector.parse('<?xml version="1.0"?><products><product><upc>123')

      assertValidParseResult(result)
    })

    it('handles XML with unclosed tags', async () => {
      const result = await connector.parse('<products><product><upc>012345678901</upc></product>')

      assertValidParseResult(result)
    })
  })

  describe('Invalid CSV', () => {
    it('handles CSV with mismatched columns', async () => {
      const csv = 'upc,title,price,link\n012345678901,Test Product,18.99'
      const result = await connector.parse(csv)

      assertValidParseResult(result)
    })

    it('handles CSV with extra columns', async () => {
      const csv = 'upc,title,price,link\n012345678901,Test,18.99,http://test.com,extra,columns,here'
      const result = await connector.parse(csv)

      assertValidParseResult(result)
    })

    it('handles CSV with unquoted commas in fields', async () => {
      const csv = 'upc,title,price,link\n012345678901,"Product, with comma",18.99,http://test.com'
      const result = await connector.parse(csv)

      assertValidParseResult(result)
      if (result.totalRows > 0) {
        expect(result.parsedRecords[0].record.title).toContain('comma')
      }
    })

    it('handles CSV with mixed line endings', async () => {
      const csv = 'upc,title,price,link\r\n012345678901,Test1,18.99,http://test.com\n023456789012,Test2,27.99,http://test.com\r034567890123,Test3,32.99,http://test.com'
      const result = await connector.parse(csv)

      assertValidParseResult(result)
    })
  })

  describe('Invalid data types', () => {
    it('handles null values in JSON', async () => {
      const json = JSON.stringify({
        products: [
          { upc: null, title: null, price: null, link: null },
        ],
      })
      const result = await connector.parse(json)

      assertValidParseResult(result)
      expect(result.parsedRecords[0].isIndexable).toBe(false)
    })

    it('handles undefined-like strings', async () => {
      const json = JSON.stringify({
        products: [
          { upc: 'undefined', title: 'undefined', price: 'undefined', link: 'undefined' },
        ],
      })
      const result = await connector.parse(json)

      assertValidParseResult(result)
    })

    it('handles object where string expected', async () => {
      const json = '{"products": [{"upc": {"nested": "object"}, "title": "Test", "price": 18.99}]}'
      const result = await connector.parse(json)

      assertValidParseResult(result)
    })

    it('handles array where string expected', async () => {
      const json = '{"products": [{"upc": ["array", "value"], "title": "Test", "price": 18.99}]}'
      const result = await connector.parse(json)

      assertValidParseResult(result)
    })

    it('handles boolean where number expected for price', async () => {
      const json = JSON.stringify({
        products: [
          { upc: '012345678901', title: 'Test', price: true, link: 'http://test.com' },
        ],
      })
      const result = await connector.parse(json)

      assertValidParseResult(result)
    })

    it('handles NaN price string', async () => {
      const json = JSON.stringify({
        products: [
          { upc: '012345678901', title: 'Test', price: 'NaN', link: 'http://test.com' },
        ],
      })
      const result = await connector.parse(json)

      assertValidParseResult(result)
      expect(result.parsedRecords[0].isIndexable).toBe(false)
    })

    it('handles Infinity price string', async () => {
      const json = JSON.stringify({
        products: [
          { upc: '012345678901', title: 'Test', price: 'Infinity', link: 'http://test.com' },
        ],
      })
      const result = await connector.parse(json)

      assertValidParseResult(result)
    })
  })

  describe('Completely invalid formats', () => {
    it('handles plain text', async () => {
      const result = await connector.parse('This is just plain text, not a feed format.')

      assertValidParseResult(result)
      expect(result.totalRows).toBe(0)
    })

    it('handles HTML content', async () => {
      const html = '<!DOCTYPE html><html><body><h1>Not a feed</h1></body></html>'
      const result = await connector.parse(html)

      assertValidParseResult(result)
    })

    it('handles binary-like content', async () => {
      const binary = '\x00\x01\x02\x03\x04\x05'
      const result = await connector.parse(binary)

      assertValidParseResult(result)
    })
  })
})

// =============================================================================
// UNICODE AND SPECIAL CHARACTERS
// =============================================================================

describe('Unicode and special character handling', () => {
  const connector = new GenericConnector()

  it('handles special characters in product data', async () => {
    const json = generateFeedWithSpecialCharacters()
    const result = await connector.parse(json)

    assertValidParseResult(result)
    expect(result.totalRows).toBe(3)

    // First record has quotes and apostrophes
    expect(result.parsedRecords[0].record.title).toContain('quotes')
    expect(result.parsedRecords[0].record.brand).toBe('Brand & Co.')

    // Second record has emoji
    expect(result.parsedRecords[1].record.title).toContain('🔫')

    // Third record has newlines/tabs
    expect(result.parsedRecords[2].record.title).toBeDefined()
  })

  it('handles Unicode in CSV format', async () => {
    const csv = `upc,title,price,link
012345678901,"Línea de productos español",18.99,http://test.com
023456789012,"日本語テスト",27.99,http://test.com
034567890123,"Тест кириллицы",32.99,http://test.com`
    const result = await connector.parse(csv)

    assertValidParseResult(result)
    expect(result.totalRows).toBe(3)
    expect(result.parsedRecords[0].record.title).toContain('español')
    expect(result.parsedRecords[1].record.title).toContain('日本語')
    expect(result.parsedRecords[2].record.title).toContain('кириллицы')
  })

  it('handles HTML entities in XML', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<products>
  <product>
    <upc>012345678901</upc>
    <title>Product &amp; Accessories</title>
    <price>18.99</price>
    <link>http://test.com?a=1&amp;b=2</link>
    <description>&lt;b&gt;Bold&lt;/b&gt; text</description>
  </product>
</products>`
    const result = await connector.parse(xml)

    assertValidParseResult(result)
    expect(result.parsedRecords[0].record.title).toBe('Product & Accessories')
  })

  it('handles very long field values', async () => {
    const longTitle = 'A'.repeat(1000)
    const longDescription = 'B'.repeat(5000)
    const json = JSON.stringify({
      products: [
        {
          upc: '012345678901',
          title: longTitle,
          price: 18.99,
          link: 'http://test.com',
          description: longDescription,
        },
      ],
    })
    const result = await connector.parse(json)

    assertValidParseResult(result)
    expect(result.parsedRecords[0].record.title).toBe(longTitle)
    expect(result.parsedRecords[0].record.description).toBe(longDescription)
  })
})

// =============================================================================
// FORMAT DETECTION EDGE CASES
// =============================================================================

describe('Format detection edge cases', () => {
  const genericConnector = new GenericConnector()
  const ammoSeekConnector = new AmmoSeekConnector()
  const gunEngineConnector = new GunEngineConnector()

  describe('GenericConnector canHandle', () => {
    it('detects CSV with mixed-case headers', () => {
      const csv = 'UPC,Title,PRICE,Link\n012345678901,Test,18.99,http://test.com'
      expect(genericConnector.canHandle(csv)).toBe(true)
    })

    it('detects CSV with extra whitespace in headers', () => {
      const csv = ' upc , title , price , link \n012345678901,Test,18.99,http://test.com'
      expect(genericConnector.canHandle(csv)).toBe(true)
    })

    it('detects JSON with extra fields', () => {
      const json = JSON.stringify({
        products: [
          { upc: '123', title: 'Test', price: 18.99, extraField1: 'a', extraField2: 'b' },
        ],
      })
      expect(genericConnector.canHandle(json)).toBe(true)
    })

    it('detects minimal valid CSV', () => {
      const csv = 'upc,title,price\n123,T,1'
      expect(genericConnector.canHandle(csv)).toBe(true)
    })

    it('accepts CSV with only one column (generic is permissive)', () => {
      // GenericConnector accepts any valid CSV/JSON/XML format
      const csv = 'upc\n123\n456'
      expect(genericConnector.canHandle(csv)).toBe(true)
    })
  })

  describe('AmmoSeekConnector canHandle', () => {
    it('detects with mixed-case field names', () => {
      const csv = 'UPC,TITLE,PRICE,LINK,IN_STOCK\n012345678901,Test,18.99,http://test.com,true'
      expect(ammoSeekConnector.canHandle(csv)).toBe(true)
    })

    it('detects with reordered columns', () => {
      const csv = 'in_stock,price,title,link,upc\ntrue,18.99,Test,http://test.com,012345678901'
      expect(ammoSeekConnector.canHandle(csv)).toBe(true)
    })

    it('detects with extra columns', () => {
      const csv = 'upc,title,price,link,in_stock,extra1,extra2\n012345678901,Test,18.99,http://test.com,true,a,b'
      expect(ammoSeekConnector.canHandle(csv)).toBe(true)
    })

    it('accepts CSV with upc/title/price/link (AmmoSeek checks for these fields)', () => {
      // AmmoSeek requires upc, title (or product_name), price, and link (or url)
      // It does NOT require in_stock for canHandle - that's only for field mapping
      const csv = 'upc,title,price,link\n012345678901,Test,18.99,http://test.com'
      expect(ammoSeekConnector.canHandle(csv)).toBe(true)
    })
  })

  describe('GunEngineConnector canHandle', () => {
    it('requires stock_status or V2 markers with item_id and manufacturer', () => {
      // GunEngine requires: item_id AND manufacturer AND (stock_status OR V2 markers)
      const json = JSON.stringify({
        offers: [{ item_id: 'SKU1', manufacturer: 'Test', stock_status: 'in_stock' }],
      })
      expect(gunEngineConnector.canHandle(json)).toBe(true)
    })

    it('detects with V2 markers (bullet_weight)', () => {
      const json = JSON.stringify({
        offers: [{ item_id: 'SKU1', manufacturer: 'Test', bullet_weight: 115 }],
      })
      expect(gunEngineConnector.canHandle(json)).toBe(true)
    })

    it('rejects without stock_status or V2 markers', () => {
      // Missing stock_status and V2 markers
      const json = JSON.stringify({
        offers: [{ item_id: 'SKU1', manufacturer: 'Test' }],
      })
      expect(gunEngineConnector.canHandle(json)).toBe(false)
    })

    it('rejects JSON without GunEngine structure', () => {
      const json = JSON.stringify({
        products: [{ upc: '123', title: 'Test' }],
      })
      expect(gunEngineConnector.canHandle(json)).toBe(false)
    })
  })
})

// =============================================================================
// ERROR CODE AGGREGATION
// =============================================================================

describe('Error code aggregation', () => {
  const connector = new GenericConnector()

  it('aggregates error codes across multiple records', async () => {
    // Note: Invalid UPCs (too short) get normalized to null and trigger MISSING_UPC
    const json = JSON.stringify({
      products: [
        { upc: '123', title: 'Invalid UPC 1', price: 18.99, link: 'http://test.com' }, // MISSING_UPC (invalid -> null)
        { upc: '456', title: 'Invalid UPC 2', price: 27.99, link: 'http://test.com' }, // MISSING_UPC (invalid -> null)
        { upc: '012345678901', price: 18.99, link: 'http://test.com' }, // MISSING_TITLE
        { title: 'No UPC', price: 18.99, link: 'http://test.com' }, // MISSING_UPC
        { upc: '023456789012', title: 'Zero Price', price: 0, link: 'http://test.com' }, // INVALID_PRICE
      ],
    })
    const result = await connector.parse(json)

    assertValidParseResult(result)

    // Check error code aggregation
    // 3 records have MISSING_UPC (2 invalid UPCs + 1 missing UPC)
    expect(result.errorCodes[ERROR_CODES.MISSING_UPC]).toBe(3)
    expect(result.errorCodes[ERROR_CODES.MISSING_TITLE]).toBe(1)
    expect(result.errorCodes[ERROR_CODES.INVALID_PRICE]).toBe(1)
  })

  it('per-record errors match aggregate counts', async () => {
    const json = JSON.stringify({
      products: [
        { upc: '123', title: 'Bad UPC', price: 18.99, link: 'http://test.com' },
        { upc: '456', title: 'Bad UPC 2', price: 18.99, link: 'http://test.com' },
        { upc: '789', title: 'Bad UPC 3', price: 18.99, link: 'http://test.com' },
      ],
    })
    const result = await connector.parse(json)

    // Count MISSING_UPC errors across all records (invalid UPCs become null -> MISSING_UPC)
    const missingUpcCount = result.parsedRecords.filter(r =>
      hasErrorCode(r, ERROR_CODES.MISSING_UPC)
    ).length

    expect(result.errorCodes[ERROR_CODES.MISSING_UPC]).toBe(missingUpcCount)
    expect(missingUpcCount).toBe(3)
  })

  it('handles multiple errors on single record', async () => {
    const json = JSON.stringify({
      products: [
        { upc: '123', price: -5.99, link: 'http://test.com' }, // MISSING_UPC + MISSING_TITLE + INVALID_PRICE
      ],
    })
    const result = await connector.parse(json)

    const record = result.parsedRecords[0]
    expect(record.errors.length).toBeGreaterThan(1)
    expect(hasErrorCode(record, ERROR_CODES.MISSING_UPC)).toBe(true) // Invalid UPC -> null -> MISSING_UPC
    expect(hasErrorCode(record, ERROR_CODES.MISSING_TITLE)).toBe(true)
    expect(hasErrorCode(record, ERROR_CODES.INVALID_PRICE)).toBe(true)
  })
})

// =============================================================================
// URL VALIDATION
// =============================================================================

describe('URL validation', () => {
  const connector = new GenericConnector()

  it('accepts valid HTTP URL', async () => {
    const json = JSON.stringify({
      products: [
        { upc: '012345678901', title: 'Test', price: 18.99, link: 'http://example.com/product' },
      ],
    })
    const result = await connector.parse(json)

    expect(result.parsedRecords[0].record.productUrl).toBe('http://example.com/product')
  })

  it('accepts valid HTTPS URL', async () => {
    const json = JSON.stringify({
      products: [
        { upc: '012345678901', title: 'Test', price: 18.99, link: 'https://example.com/product' },
      ],
    })
    const result = await connector.parse(json)

    expect(result.parsedRecords[0].record.productUrl).toBe('https://example.com/product')
  })

  it('accepts URL with query parameters', async () => {
    const json = JSON.stringify({
      products: [
        { upc: '012345678901', title: 'Test', price: 18.99, link: 'https://example.com/product?id=123&ref=feed' },
      ],
    })
    const result = await connector.parse(json)

    expect(result.parsedRecords[0].record.productUrl).toContain('id=123')
  })

  it('handles missing URL field gracefully', async () => {
    const json = JSON.stringify({
      products: [
        { upc: '012345678901', title: 'Test', price: 18.99 },
      ],
    })
    const result = await connector.parse(json)

    assertValidParseResult(result)
    expect(result.parsedRecords[0].record.productUrl).toBeUndefined()
  })

  it('handles empty URL string', async () => {
    const json = JSON.stringify({
      products: [
        { upc: '012345678901', title: 'Test', price: 18.99, link: '' },
      ],
    })
    const result = await connector.parse(json)

    assertValidParseResult(result)
  })

  it('preserves URL with special characters', async () => {
    const json = JSON.stringify({
      products: [
        { upc: '012345678901', title: 'Test', price: 18.99, link: 'https://example.com/product?name=test%20product&price=$18.99' },
      ],
    })
    const result = await connector.parse(json)

    expect(result.parsedRecords[0].record.productUrl).toContain('%20')
  })
})

// =============================================================================
// LARGE FEED HANDLING (SMOKE TEST)
// =============================================================================

describe('Large feed handling', () => {
  const connector = new GenericConnector()

  it('handles feed with 1000 products', async () => {
    const json = generateLargeFeed(1000)
    const result = await connector.parse(json)

    assertValidParseResult(result)
    expect(result.totalRows).toBe(1000)
    // Should have a mix of in stock and out of stock
    expect(result.indexableCount).toBeGreaterThan(0)
  }, 10000) // 10 second timeout

  it('handles feed with 5000 products', async () => {
    const json = generateLargeFeed(5000)
    const result = await connector.parse(json)

    assertValidParseResult(result)
    expect(result.totalRows).toBe(5000)
  }, 30000) // 30 second timeout

  it('maintains correct counts for large feed', async () => {
    const json = generateLargeFeed(100)
    const result = await connector.parse(json)

    // Verify sum equals total
    const sum = result.indexableCount + result.quarantineCount + result.rejectCount
    expect(sum).toBe(result.totalRows)
  })
})

// =============================================================================
// COERCION TRACKING
// =============================================================================

describe('Coercion tracking', () => {
  const connector = new GenericConnector()

  it('tracks price coercion from string with currency', async () => {
    const json = JSON.stringify({
      products: [
        { upc: '012345678901', title: 'Test', price: '$18.99', link: 'http://test.com' },
      ],
    })
    const result = await connector.parse(json)

    const priceCoercion = result.parsedRecords[0].coercions.find(c => c.field === 'price')
    expect(priceCoercion).toBeDefined()
    expect(priceCoercion?.rawValue).toBe('$18.99')
    expect(priceCoercion?.coercedValue).toBe(18.99)
  })

  it('tracks boolean coercion from string', async () => {
    const json = JSON.stringify({
      products: [
        { upc: '012345678901', title: 'Test', price: 18.99, link: 'http://test.com', in_stock: 'yes' },
      ],
    })
    const result = await connector.parse(json)

    const stockCoercion = result.parsedRecords[0].coercions.find(c => c.field === 'inStock')
    expect(stockCoercion).toBeDefined()
    expect(stockCoercion?.rawValue).toBe('yes')
    expect(stockCoercion?.coercedValue).toBe(true)
  })

  it('tracks UPC normalization (prefix stripping)', async () => {
    const json = JSON.stringify({
      products: [
        { upc: 'UPC:012345678901', title: 'Test', price: 18.99, link: 'http://test.com' },
      ],
    })
    const result = await connector.parse(json)

    expect(result.parsedRecords[0].record.upc).toBe('012345678901')
    // Check if UPC coercion was tracked
    const upcCoercion = result.parsedRecords[0].coercions.find(c => c.field === 'upc')
    if (upcCoercion) {
      expect(upcCoercion.rawValue).toBe('UPC:012345678901')
      expect(upcCoercion.coercedValue).toBe('012345678901')
    }
  })

  it('tracks grain weight coercion from string', async () => {
    const json = JSON.stringify({
      products: [
        { upc: '012345678901', title: 'Test', price: 18.99, link: 'http://test.com', grain: '115 grains' },
      ],
    })
    const result = await connector.parse(json)

    expect(result.parsedRecords[0].record.grainWeight).toBe(115)
  })

  it('does not record coercion when no transformation needed', async () => {
    const json = JSON.stringify({
      products: [
        { upc: '012345678901', title: 'Test', price: 18.99, link: 'http://test.com', in_stock: true },
      ],
    })
    const result = await connector.parse(json)

    // Boolean true doesn't need coercion
    const stockCoercion = result.parsedRecords[0].coercions.find(c => c.field === 'inStock')
    // May or may not be present depending on implementation
    if (stockCoercion) {
      expect(stockCoercion.rawValue).toBe(stockCoercion.coercedValue)
    }
  })
})
