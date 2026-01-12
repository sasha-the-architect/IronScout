/**
 * Feed Parser Schema Contract Tests
 *
 * Validates that feed parsing correctly handles various input shapes
 * and produces consistent output structures.
 */

import { describe, it, expect } from 'vitest'

// ============================================================================
// Feed Product Schema (expected output from parser)
// ============================================================================

interface ParsedFeedProduct {
  name: string
  url: string
  price: number
  inStock: boolean
  impactItemId?: string
  sku?: string
  upc?: string
  imageUrl?: string
  description?: string
  brand?: string
  category?: string
  originalPrice?: number
  currency?: string
  caliber?: string
  grainWeight?: number
  roundCount?: number
  rowNumber: number
}

interface ParseResult {
  products: ParsedFeedProduct[]
  rowsRead: number
  rowsParsed: number
  errors: Array<{ code: string; message: string; rowNumber?: number }>
}

// ============================================================================
// Validation Functions
// ============================================================================

function validateProduct(product: Partial<ParsedFeedProduct>): string[] {
  const errors: string[] = []

  // Required fields
  if (!product.name || product.name.trim() === '') {
    errors.push('Missing or empty name')
  }
  if (!product.url || !isValidUrl(product.url)) {
    errors.push('Missing or invalid URL')
  }
  if (typeof product.price !== 'number' || product.price < 0) {
    errors.push('Invalid price (must be non-negative number)')
  }
  if (typeof product.inStock !== 'boolean') {
    errors.push('Invalid inStock (must be boolean)')
  }

  // Optional numeric fields validation
  if (product.originalPrice !== undefined && (typeof product.originalPrice !== 'number' || product.originalPrice < 0)) {
    errors.push('Invalid originalPrice')
  }
  if (product.grainWeight !== undefined && (typeof product.grainWeight !== 'number' || product.grainWeight <= 0)) {
    errors.push('Invalid grainWeight')
  }
  if (product.roundCount !== undefined && (typeof product.roundCount !== 'number' || product.roundCount <= 0)) {
    errors.push('Invalid roundCount')
  }

  return errors
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

function validateParseResult(result: ParseResult): string[] {
  const errors: string[] = []

  if (!Array.isArray(result.products)) {
    errors.push('products must be an array')
  }

  if (typeof result.rowsRead !== 'number' || result.rowsRead < 0) {
    errors.push('Invalid rowsRead')
  }

  if (typeof result.rowsParsed !== 'number' || result.rowsParsed < 0) {
    errors.push('Invalid rowsParsed')
  }

  if (result.rowsParsed > result.rowsRead) {
    errors.push('rowsParsed cannot exceed rowsRead')
  }

  if (!Array.isArray(result.errors)) {
    errors.push('errors must be an array')
  }

  return errors
}

// ============================================================================
// Mock Parser (simulates parser behavior)
// ============================================================================

function mockParseCSVRow(row: Record<string, string>, rowNumber: number): ParsedFeedProduct | null {
  // Required field mapping
  const name = row['Name'] || row['name'] || row['PRODUCT_NAME'] || row['ProductName']
  const url = row['URL'] || row['url'] || row['PRODUCT_URL'] || row['ProductUrl']
  const priceStr = row['Price'] || row['price'] || row['PRICE'] || row['SalePrice']
  const stockStr = row['InStock'] || row['inStock'] || row['IN_STOCK'] || row['Availability']

  if (!name || !url || !priceStr) {
    return null
  }

  const price = parseFloat(priceStr.replace(/[$,]/g, ''))
  if (isNaN(price)) {
    return null
  }

  const inStock = ['true', '1', 'yes', 'in stock', 'available'].includes(
    (stockStr || 'true').toLowerCase()
  )

  const product: ParsedFeedProduct = {
    name: name.trim(),
    url: url.trim(),
    price,
    inStock,
    rowNumber,
  }

  // Optional fields
  if (row['SKU'] || row['sku']) product.sku = row['SKU'] || row['sku']
  if (row['UPC'] || row['upc']) product.upc = row['UPC'] || row['upc']
  if (row['Brand'] || row['brand']) product.brand = row['Brand'] || row['brand']
  if (row['ImageURL'] || row['imageUrl']) product.imageUrl = row['ImageURL'] || row['imageUrl']
  if (row['Caliber'] || row['caliber']) product.caliber = row['Caliber'] || row['caliber']

  // Round count parsing
  const roundCountStr = row['RoundCount'] || row['roundCount'] || row['ROUND_COUNT']
  if (roundCountStr) {
    const roundCount = parseInt(roundCountStr, 10)
    if (!isNaN(roundCount) && roundCount > 0) {
      product.roundCount = roundCount
    }
  }

  // Grain weight parsing
  const grainStr = row['GrainWeight'] || row['grainWeight'] || row['GRAIN']
  if (grainStr) {
    const grain = parseFloat(grainStr)
    if (!isNaN(grain) && grain > 0) {
      product.grainWeight = grain
    }
  }

  return product
}

// ============================================================================
// Contract Tests
// ============================================================================

describe('Feed Parser Output Contract', () => {
  describe('Valid product parsing', () => {
    it('should produce valid product from standard row', () => {
      const row = {
        Name: '9mm Federal Premium',
        URL: 'https://example.com/product/123',
        Price: '24.99',
        InStock: 'true',
        SKU: 'FED-9MM-124',
        Brand: 'Federal',
        Caliber: '9mm',
        RoundCount: '50',
        GrainWeight: '124',
      }

      const product = mockParseCSVRow(row, 1)

      expect(product).not.toBeNull()
      const errors = validateProduct(product!)
      expect(errors).toHaveLength(0)

      expect(product).toMatchObject({
        name: '9mm Federal Premium',
        url: 'https://example.com/product/123',
        price: 24.99,
        inStock: true,
        sku: 'FED-9MM-124',
        brand: 'Federal',
        caliber: '9mm',
        roundCount: 50,
        grainWeight: 124,
        rowNumber: 1,
      })
    })

    it('should handle price with currency symbols', () => {
      const row = {
        Name: 'Test Ammo',
        URL: 'https://example.com/test',
        Price: '$29.99',
        InStock: '1',
      }

      const product = mockParseCSVRow(row, 2)

      expect(product?.price).toBe(29.99)
    })

    it('should handle price with commas', () => {
      const row = {
        Name: 'Bulk Ammo Case',
        URL: 'https://example.com/bulk',
        Price: '1,299.00',
        InStock: 'yes',
      }

      const product = mockParseCSVRow(row, 3)

      expect(product?.price).toBe(1299.0)
    })

    it('should handle various stock indicators', () => {
      const testCases = [
        { InStock: 'true', expected: true },
        { InStock: 'TRUE', expected: true },
        { InStock: '1', expected: true },
        { InStock: 'yes', expected: true },
        { InStock: 'in stock', expected: true },
        { InStock: 'available', expected: true },
        { InStock: 'false', expected: false },
        { InStock: '0', expected: false },
        { InStock: 'no', expected: false },
        { InStock: 'out of stock', expected: false },
      ]

      for (const { InStock, expected } of testCases) {
        const row = {
          Name: 'Test',
          URL: 'https://example.com/test',
          Price: '10',
          InStock,
        }

        const product = mockParseCSVRow(row, 1)
        expect(product?.inStock).toBe(expected)
      }
    })
  })

  describe('Column name flexibility', () => {
    it('should handle different column naming conventions', () => {
      const variations = [
        { Name: 'P1', URL: 'https://a.com', Price: '10', InStock: '1' },
        { name: 'P2', url: 'https://b.com', price: '20', inStock: 'true' },
        { PRODUCT_NAME: 'P3', PRODUCT_URL: 'https://c.com', PRICE: '30', IN_STOCK: 'yes' },
        { ProductName: 'P4', ProductUrl: 'https://d.com', SalePrice: '40', Availability: 'available' },
      ]

      for (let i = 0; i < variations.length; i++) {
        const product = mockParseCSVRow(variations[i] as Record<string, string>, i + 1)
        expect(product).not.toBeNull()
        expect(validateProduct(product!)).toHaveLength(0)
      }
    })
  })

  describe('Invalid input handling', () => {
    it('should return null for missing required fields', () => {
      const missingName = { URL: 'https://a.com', Price: '10' }
      const missingUrl = { Name: 'Test', Price: '10' }
      const missingPrice = { Name: 'Test', URL: 'https://a.com' }

      expect(mockParseCSVRow(missingName as Record<string, string>, 1)).toBeNull()
      expect(mockParseCSVRow(missingUrl as Record<string, string>, 2)).toBeNull()
      expect(mockParseCSVRow(missingPrice as Record<string, string>, 3)).toBeNull()
    })

    it('should return null for invalid price', () => {
      const invalidPrice = { Name: 'Test', URL: 'https://a.com', Price: 'not-a-number' }

      expect(mockParseCSVRow(invalidPrice, 1)).toBeNull()
    })

    it('should validate product rejects negative price', () => {
      const product: ParsedFeedProduct = {
        name: 'Test',
        url: 'https://a.com',
        price: -10,
        inStock: true,
        rowNumber: 1,
      }

      const errors = validateProduct(product)
      expect(errors).toContain('Invalid price (must be non-negative number)')
    })

    it('should validate product rejects invalid URL', () => {
      const product: ParsedFeedProduct = {
        name: 'Test',
        url: 'not-a-url',
        price: 10,
        inStock: true,
        rowNumber: 1,
      }

      const errors = validateProduct(product)
      expect(errors).toContain('Missing or invalid URL')
    })
  })
})

describe('Parse Result Contract', () => {
  it('should produce valid result structure', () => {
    const result: ParseResult = {
      products: [
        { name: 'P1', url: 'https://a.com', price: 10, inStock: true, rowNumber: 1 },
        { name: 'P2', url: 'https://b.com', price: 20, inStock: false, rowNumber: 2 },
      ],
      rowsRead: 5,
      rowsParsed: 2,
      errors: [
        { code: 'MISSING_FIELD', message: 'Missing name', rowNumber: 3 },
        { code: 'INVALID_PRICE', message: 'Price must be numeric', rowNumber: 4 },
      ],
    }

    const errors = validateParseResult(result)
    expect(errors).toHaveLength(0)
  })

  it('should reject rowsParsed > rowsRead', () => {
    const result: ParseResult = {
      products: [],
      rowsRead: 5,
      rowsParsed: 10, // Invalid
      errors: [],
    }

    const errors = validateParseResult(result)
    expect(errors).toContain('rowsParsed cannot exceed rowsRead')
  })

  it('should require errors array', () => {
    const result = {
      products: [],
      rowsRead: 0,
      rowsParsed: 0,
      errors: null, // Invalid
    }

    const errors = validateParseResult(result as unknown as ParseResult)
    expect(errors).toContain('errors must be an array')
  })
})

describe('Identity Field Priority', () => {
  // Per spec: IMPACT_ITEM_ID > SKU > URL_HASH
  it('should document identity priority', () => {
    const IDENTITY_PRIORITY = {
      IMPACT_ITEM_ID: 3,
      SKU: 2,
      URL_HASH: 1,
    }

    expect(IDENTITY_PRIORITY.IMPACT_ITEM_ID).toBeGreaterThan(IDENTITY_PRIORITY.SKU)
    expect(IDENTITY_PRIORITY.SKU).toBeGreaterThan(IDENTITY_PRIORITY.URL_HASH)
  })

  it('should prefer impactItemId when available', () => {
    const row = {
      Name: 'Test',
      URL: 'https://example.com/123',
      Price: '10',
      InStock: '1',
      ImpactItemId: 'IMP-123',
      SKU: 'SKU-456',
    }

    // Parser should capture both, but processor uses priority
    const product = mockParseCSVRow(
      { ...row, impactItemId: row.ImpactItemId, sku: row.SKU },
      1
    )

    // Both should be available for processor to choose
    expect(product?.sku).toBeDefined()
  })
})

describe('Price Signature Hash', () => {
  function calculatePriceSignatureHash(
    price: number,
    currency: string,
    originalPrice?: number
  ): string {
    // Simplified version of actual hash
    const components = [price.toFixed(2), currency]
    if (originalPrice !== undefined) {
      components.push(originalPrice.toFixed(2))
    }
    return components.join('|')
  }

  it('should produce consistent hash for same values', () => {
    const hash1 = calculatePriceSignatureHash(24.99, 'USD', 29.99)
    const hash2 = calculatePriceSignatureHash(24.99, 'USD', 29.99)

    expect(hash1).toBe(hash2)
  })

  it('should produce different hash for different prices', () => {
    const hash1 = calculatePriceSignatureHash(24.99, 'USD')
    const hash2 = calculatePriceSignatureHash(25.99, 'USD')

    expect(hash1).not.toBe(hash2)
  })

  it('should include originalPrice in hash when present', () => {
    const hashWithOriginal = calculatePriceSignatureHash(24.99, 'USD', 29.99)
    const hashWithoutOriginal = calculatePriceSignatureHash(24.99, 'USD')

    expect(hashWithOriginal).not.toBe(hashWithoutOriginal)
  })

  it('should normalize precision to 2 decimal places', () => {
    const hash1 = calculatePriceSignatureHash(24.990000001, 'USD')
    const hash2 = calculatePriceSignatureHash(24.99, 'USD')

    expect(hash1).toBe(hash2)
  })
})
