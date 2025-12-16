/**
 * Base Connector Unit Tests
 *
 * Tests for shared parsing utilities, content detection,
 * value extraction, and UPC validation.
 */

import { describe, it, expect } from 'vitest'
import {
  detectContentFormat,
  parseCSV,
  parseJSON,
  parseXML,
  parseContent,
  extractString,
  extractNumber,
  extractBoolean,
  validateUPC,
} from '../base-connector'
import type { FieldCoercion } from '../types'
import {
  loadCsvFixture,
  loadJsonFixture,
  loadXmlFixture,
  INVALID_UPCS,
  VALID_UPCS,
  UPC_WITH_PREFIXES,
  PRICE_EDGE_CASES,
  BOOLEAN_EDGE_CASES,
} from './test-utils'

// ============================================================================
// CONTENT FORMAT DETECTION
// ============================================================================

describe('detectContentFormat', () => {
  describe('JSON detection', () => {
    it('detects JSON array', () => {
      expect(detectContentFormat('[{"foo": "bar"}]')).toBe('json')
    })

    it('detects JSON object', () => {
      expect(detectContentFormat('{"products": []}')).toBe('json')
    })

    it('detects JSON with whitespace', () => {
      expect(detectContentFormat('  \n  {"foo": "bar"}')).toBe('json')
    })
  })

  describe('XML detection', () => {
    it('detects XML with declaration', () => {
      expect(detectContentFormat('<?xml version="1.0"?><root></root>')).toBe('xml')
    })

    it('detects XML without declaration', () => {
      expect(detectContentFormat('<products><product></product></products>')).toBe('xml')
    })

    it('detects XML with whitespace', () => {
      expect(detectContentFormat('  \n  <root></root>')).toBe('xml')
    })
  })

  describe('CSV detection (default)', () => {
    it('detects CSV with headers', () => {
      expect(detectContentFormat('upc,title,price\n123,test,10.99')).toBe('csv')
    })

    it('detects plain text as CSV', () => {
      expect(detectContentFormat('some plain text')).toBe('csv')
    })

    it('detects empty string as CSV', () => {
      expect(detectContentFormat('')).toBe('csv')
    })
  })
})

// ============================================================================
// CSV PARSING
// ============================================================================

describe('parseCSV', () => {
  it('parses basic CSV with headers', () => {
    const csv = 'upc,title,price\n123,Test Product,18.99'
    const result = parseCSV(csv)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      upc: '123',
      title: 'Test Product',
      price: '18.99',
    })
  })

  it('parses CSV with quoted values', () => {
    const csv = 'upc,title,price\n123,"Product, with comma",18.99'
    const result = parseCSV(csv)
    expect(result[0].title).toBe('Product, with comma')
  })

  it('parses CSV with empty values', () => {
    const csv = 'upc,title,price\n123,,18.99'
    const result = parseCSV(csv)
    expect(result[0].title).toBe('')
  })

  it('handles varying column counts (relax_column_count)', () => {
    const csv = 'a,b,c\n1,2\n1,2,3,4'
    const result = parseCSV(csv)
    expect(result).toHaveLength(2)
  })

  it('skips empty lines', () => {
    const csv = 'upc,title\n123,Test\n\n456,Test2'
    const result = parseCSV(csv)
    expect(result).toHaveLength(2)
  })

  it('trims whitespace from values', () => {
    const csv = 'upc,title\n  123  ,  Test Product  '
    const result = parseCSV(csv)
    expect(result[0].upc).toBe('123')
    expect(result[0].title).toBe('Test Product')
  })

  it('loads and parses generic CSV fixture', () => {
    const csv = loadCsvFixture('generic-valid.csv')
    const result = parseCSV(csv)
    expect(result.length).toBeGreaterThan(0)
    expect(result[0]).toHaveProperty('upc')
    expect(result[0]).toHaveProperty('title')
    expect(result[0]).toHaveProperty('price')
  })
})

// ============================================================================
// JSON PARSING
// ============================================================================

describe('parseJSON', () => {
  it('parses JSON array directly', () => {
    const json = '[{"upc": "123", "title": "Test"}]'
    const result = parseJSON(json)
    expect(result).toHaveLength(1)
    expect(result[0].upc).toBe('123')
  })

  it('unwraps products array', () => {
    const json = '{"products": [{"upc": "123"}]}'
    const result = parseJSON(json)
    expect(result).toHaveLength(1)
    expect(result[0].upc).toBe('123')
  })

  it('unwraps items array', () => {
    const json = '{"items": [{"upc": "123"}]}'
    const result = parseJSON(json)
    expect(result).toHaveLength(1)
  })

  it('unwraps data array', () => {
    const json = '{"data": [{"upc": "123"}]}'
    const result = parseJSON(json)
    expect(result).toHaveLength(1)
  })

  it('unwraps offers array', () => {
    const json = '{"offers": [{"upc": "123"}]}'
    const result = parseJSON(json)
    expect(result).toHaveLength(1)
  })

  it('wraps single object in array', () => {
    const json = '{"upc": "123", "title": "Single"}'
    const result = parseJSON(json)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Single')
  })

  it('loads and parses generic JSON fixture', () => {
    const json = loadJsonFixture('generic-valid.json')
    const result = parseJSON(json)
    expect(result.length).toBeGreaterThan(0)
    expect(result[0]).toHaveProperty('upc')
  })

  it('handles all JSON wrapper types', () => {
    const productsJson = loadJsonFixture('generic-valid.json')
    const arrayJson = loadJsonFixture('generic-array.json')
    const itemsJson = loadJsonFixture('generic-items-wrapper.json')
    const dataJson = loadJsonFixture('generic-data-wrapper.json')

    expect(parseJSON(productsJson).length).toBeGreaterThan(0)
    expect(parseJSON(arrayJson).length).toBeGreaterThan(0)
    expect(parseJSON(itemsJson).length).toBeGreaterThan(0)
    expect(parseJSON(dataJson).length).toBeGreaterThan(0)
  })
})

// ============================================================================
// XML PARSING
// ============================================================================

describe('parseXML', () => {
  it('parses products/product structure', () => {
    const xml = '<?xml version="1.0"?><products><product><upc>123</upc></product></products>'
    const result = parseXML(xml)
    expect(result).toHaveLength(1)
    expect(result[0].upc).toBe('123')
  })

  it('parses catalog/product structure', () => {
    const xml = loadXmlFixture('generic-catalog.xml')
    const result = parseXML(xml)
    expect(result.length).toBeGreaterThan(0)
  })

  it('parses feed/products/product structure', () => {
    const xml = loadXmlFixture('generic-feed-wrapper.xml')
    const result = parseXML(xml)
    expect(result.length).toBeGreaterThan(0)
  })

  it('parses offers/offer structure', () => {
    const xml = loadXmlFixture('gunengine-valid.xml')
    const result = parseXML(xml)
    expect(result.length).toBeGreaterThan(0)
  })

  it('handles single item (not wrapped in array)', () => {
    const xml = '<?xml version="1.0"?><products><product><upc>123</upc></product></products>'
    const result = parseXML(xml)
    expect(Array.isArray(result)).toBe(true)
  })

  it('loads and parses generic XML fixture', () => {
    const xml = loadXmlFixture('generic-valid.xml')
    const result = parseXML(xml)
    expect(result.length).toBeGreaterThan(0)
    expect(result[0]).toHaveProperty('upc')
  })
})

// ============================================================================
// CONTENT AUTO-DETECTION AND PARSING
// ============================================================================

describe('parseContent', () => {
  it('auto-detects and parses CSV', () => {
    const csv = loadCsvFixture('generic-valid.csv')
    const result = parseContent(csv)
    expect(result.length).toBeGreaterThan(0)
  })

  it('auto-detects and parses JSON', () => {
    const json = loadJsonFixture('generic-valid.json')
    const result = parseContent(json)
    expect(result.length).toBeGreaterThan(0)
  })

  it('auto-detects and parses XML', () => {
    const xml = loadXmlFixture('generic-valid.xml')
    const result = parseContent(xml)
    expect(result.length).toBeGreaterThan(0)
  })
})

// ============================================================================
// VALUE EXTRACTION - STRING
// ============================================================================

describe('extractString', () => {
  it('extracts string from first matching field', () => {
    const row = { title: 'Test Product' }
    const coercions: FieldCoercion[] = []
    const result = extractString(row, ['title', 'name'], coercions, 'title')
    expect(result).toBe('Test Product')
  })

  it('falls back to second field if first is missing', () => {
    const row = { name: 'Test Product' }
    const coercions: FieldCoercion[] = []
    const result = extractString(row, ['title', 'name'], coercions, 'title')
    expect(result).toBe('Test Product')
  })

  it('returns undefined if no fields match', () => {
    const row = { other: 'value' }
    const coercions: FieldCoercion[] = []
    const result = extractString(row, ['title', 'name'], coercions, 'title')
    expect(result).toBeUndefined()
  })

  it('trims whitespace and records coercion', () => {
    const row = { title: '  Trimmed  ' }
    const coercions: FieldCoercion[] = []
    const result = extractString(row, ['title'], coercions, 'title')
    expect(result).toBe('Trimmed')
    expect(coercions).toHaveLength(1)
    expect(coercions[0].coercionType).toBe('trim')
  })

  it('converts number to string', () => {
    const row = { title: 12345 }
    const coercions: FieldCoercion[] = []
    const result = extractString(row, ['title'], coercions, 'title')
    expect(result).toBe('12345')
  })

  it('handles null value', () => {
    const row = { title: null }
    const coercions: FieldCoercion[] = []
    const result = extractString(row, ['title'], coercions, 'title')
    expect(result).toBeUndefined()
  })

  it('handles empty string', () => {
    const row = { title: '' }
    const coercions: FieldCoercion[] = []
    const result = extractString(row, ['title'], coercions, 'title')
    expect(result).toBeUndefined()
  })
})

// ============================================================================
// VALUE EXTRACTION - NUMBER
// ============================================================================

describe('extractNumber', () => {
  it('extracts numeric value directly', () => {
    const row = { price: 18.99 }
    const coercions: FieldCoercion[] = []
    const result = extractNumber(row, ['price'], coercions, 'price')
    expect(result).toBe(18.99)
  })

  it('parses string to number and records coercion', () => {
    const row = { price: '18.99' }
    const coercions: FieldCoercion[] = []
    const result = extractNumber(row, ['price'], coercions, 'price')
    expect(result).toBe(18.99)
    expect(coercions).toHaveLength(1)
    expect(coercions[0].coercionType).toBe('numeric')
  })

  it('handles price with currency symbol', () => {
    const row = { price: '$18.99' }
    const coercions: FieldCoercion[] = []
    const result = extractNumber(row, ['price'], coercions, 'price')
    expect(result).toBe(18.99)
  })

  it('handles price with commas', () => {
    const row = { price: '1,234.56' }
    const coercions: FieldCoercion[] = []
    const result = extractNumber(row, ['price'], coercions, 'price')
    expect(result).toBe(1234.56)
  })

  it('handles price with whitespace', () => {
    const row = { price: '  18.99  ' }
    const coercions: FieldCoercion[] = []
    const result = extractNumber(row, ['price'], coercions, 'price')
    expect(result).toBe(18.99)
  })

  it('returns undefined for non-numeric string', () => {
    const row = { price: 'free' }
    const coercions: FieldCoercion[] = []
    const result = extractNumber(row, ['price'], coercions, 'price')
    expect(result).toBeUndefined()
  })

  it('returns undefined for empty string', () => {
    const row = { price: '' }
    const coercions: FieldCoercion[] = []
    const result = extractNumber(row, ['price'], coercions, 'price')
    expect(result).toBeUndefined()
  })

  it('returns undefined for null', () => {
    const row = { price: null }
    const coercions: FieldCoercion[] = []
    const result = extractNumber(row, ['price'], coercions, 'price')
    expect(result).toBeUndefined()
  })

  it('handles zero', () => {
    const row = { price: 0 }
    const coercions: FieldCoercion[] = []
    const result = extractNumber(row, ['price'], coercions, 'price')
    expect(result).toBe(0)
  })

  it('handles negative numbers', () => {
    const row = { price: '-5.99' }
    const coercions: FieldCoercion[] = []
    const result = extractNumber(row, ['price'], coercions, 'price')
    expect(result).toBe(-5.99)
  })

  it.each(PRICE_EDGE_CASES.filter(c => c.expected !== undefined))(
    'parses price edge case: $input',
    ({ input, expected }) => {
      const row = { price: input }
      const coercions: FieldCoercion[] = []
      const result = extractNumber(row, ['price'], coercions, 'price')
      expect(result).toBe(expected)
    }
  )
})

// ============================================================================
// VALUE EXTRACTION - BOOLEAN
// ============================================================================

describe('extractBoolean', () => {
  it('returns boolean directly', () => {
    const row = { in_stock: true }
    const coercions: FieldCoercion[] = []
    const result = extractBoolean(row, ['in_stock'], coercions, 'inStock')
    expect(result).toBe(true)
  })

  it('parses "true" string', () => {
    const row = { in_stock: 'true' }
    const coercions: FieldCoercion[] = []
    const result = extractBoolean(row, ['in_stock'], coercions, 'inStock')
    expect(result).toBe(true)
  })

  it('parses "false" string', () => {
    const row = { in_stock: 'false' }
    const coercions: FieldCoercion[] = []
    const result = extractBoolean(row, ['in_stock'], coercions, 'inStock')
    expect(result).toBe(false)
  })

  it('parses "1" as true', () => {
    const row = { in_stock: '1' }
    const coercions: FieldCoercion[] = []
    const result = extractBoolean(row, ['in_stock'], coercions, 'inStock')
    expect(result).toBe(true)
  })

  it('parses "0" as false', () => {
    const row = { in_stock: '0' }
    const coercions: FieldCoercion[] = []
    const result = extractBoolean(row, ['in_stock'], coercions, 'inStock')
    expect(result).toBe(false)
  })

  it('parses "yes" as true', () => {
    const row = { in_stock: 'yes' }
    const coercions: FieldCoercion[] = []
    const result = extractBoolean(row, ['in_stock'], coercions, 'inStock')
    expect(result).toBe(true)
  })

  it('parses "in stock" as true', () => {
    const row = { in_stock: 'in stock' }
    const coercions: FieldCoercion[] = []
    const result = extractBoolean(row, ['in_stock'], coercions, 'inStock')
    expect(result).toBe(true)
  })

  it('parses "available" as true', () => {
    const row = { in_stock: 'available' }
    const coercions: FieldCoercion[] = []
    const result = extractBoolean(row, ['in_stock'], coercions, 'inStock')
    expect(result).toBe(true)
  })

  it('returns default value when field missing', () => {
    const row = {}
    const coercions: FieldCoercion[] = []
    const result = extractBoolean(row, ['in_stock'], coercions, 'inStock', true)
    expect(result).toBe(true)
  })

  it('returns custom default value', () => {
    const row = {}
    const coercions: FieldCoercion[] = []
    const result = extractBoolean(row, ['in_stock'], coercions, 'inStock', false)
    expect(result).toBe(false)
  })

  it('records coercion for string to boolean', () => {
    const row = { in_stock: 'yes' }
    const coercions: FieldCoercion[] = []
    extractBoolean(row, ['in_stock'], coercions, 'inStock')
    expect(coercions).toHaveLength(1)
    expect(coercions[0].coercionType).toBe('boolean')
    expect(coercions[0].rawValue).toBe('yes')
    expect(coercions[0].coercedValue).toBe(true)
  })

  it.each(BOOLEAN_EDGE_CASES)(
    'parses boolean edge case: $input -> $expected',
    ({ input, expected }) => {
      const row = { in_stock: input }
      const coercions: FieldCoercion[] = []
      const result = extractBoolean(row, ['in_stock'], coercions, 'inStock')
      expect(result).toBe(expected)
    }
  )
})

// ============================================================================
// UPC VALIDATION
// ============================================================================

describe('validateUPC', () => {
  describe('valid UPCs', () => {
    it.each(VALID_UPCS)('validates UPC: %s', upc => {
      expect(validateUPC(upc)).toBe(upc)
    })
  })

  describe('invalid UPCs', () => {
    it.each(INVALID_UPCS)('rejects invalid UPC: %s', upc => {
      expect(validateUPC(upc)).toBeNull()
    })
  })

  describe('UPC cleanup', () => {
    it.each(UPC_WITH_PREFIXES)(
      'removes prefix from: $input',
      ({ input, expected }) => {
        expect(validateUPC(input)).toBe(expected)
      }
    )

    it('removes dashes from UPC', () => {
      expect(validateUPC('012-345-678-901')).toBe('012345678901')
    })

    it('removes spaces from UPC', () => {
      expect(validateUPC('012 345 678 901')).toBe('012345678901')
    })

    it('handles undefined', () => {
      expect(validateUPC(undefined)).toBeNull()
    })

    it('handles empty string', () => {
      expect(validateUPC('')).toBeNull()
    })
  })

  describe('UPC length validation', () => {
    it('accepts 8-digit UPC-E', () => {
      expect(validateUPC('12345678')).toBe('12345678')
    })

    it('accepts 12-digit UPC-A', () => {
      expect(validateUPC('123456789012')).toBe('123456789012')
    })

    it('accepts 13-digit EAN', () => {
      expect(validateUPC('1234567890123')).toBe('1234567890123')
    })

    it('accepts 14-digit GTIN', () => {
      expect(validateUPC('12345678901234')).toBe('12345678901234')
    })

    it('rejects 7-digit UPC', () => {
      expect(validateUPC('1234567')).toBeNull()
    })

    it('rejects 15-digit UPC', () => {
      expect(validateUPC('123456789012345')).toBeNull()
    })
  })
})
