/**
 * Tests for Affiliate Feed Parser
 *
 * Tests CSV parsing with Impact column mapping and identity resolution.
 * v1 only supports CSV format.
 */

import { describe, it, expect } from 'vitest'
import { parseFeed, computeUrlHash, normalizeUrl } from '../parser'

describe('parseFeed', () => {
  describe('CSV parsing', () => {
    it('should parse valid CSV with Impact columns', async () => {
      const csv = `Name,URL,Price,Stock,Image Link,UPC,SKU
Test Product,https://example.com/product1,29.99,Yes,https://example.com/img.jpg,012345678901,SKU-001
Second Item,https://example.com/product2,49.99,No,https://example.com/img2.jpg,012345678902,SKU-002`

      const result = await parseFeed(csv, 'CSV', 1000)

      expect(result.rowsRead).toBe(2)
      expect(result.rowsParsed).toBe(2)
      expect(result.products).toHaveLength(2)
      expect(result.errors).toHaveLength(0)

      const product = result.products[0]
      expect(product.name).toBe('Test Product')
      expect(product.url).toBe('https://example.com/product1')
      expect(product.price).toBe(29.99)
      expect(product.inStock).toBe(true)
      expect(product.upc).toBe('012345678901')
      expect(product.sku).toBe('SKU-001')
    })

    it('should handle missing optional fields', async () => {
      const csv = `Name,URL,Price,Stock
Basic Product,https://example.com/basic,9.99,Yes`

      const result = await parseFeed(csv, 'CSV', 1000)

      expect(result.rowsParsed).toBe(1)
      expect(result.products[0].sku).toBeUndefined()
      expect(result.products[0].upc).toBeUndefined()
      expect(result.products[0].imageUrl).toBeUndefined()
    })

    it('should reject rows with missing required fields', async () => {
      const csv = `Name,URL,Price,Stock
,https://example.com/missing-name,9.99,Yes
Valid Product,https://example.com/valid,19.99,Yes
No URL Product,,29.99,Yes`

      const result = await parseFeed(csv, 'CSV', 1000)

      expect(result.rowsRead).toBe(3)
      expect(result.rowsParsed).toBe(1)
      expect(result.errors).toHaveLength(2)
      expect(result.products[0].name).toBe('Valid Product')
    })

    it('should reject invalid prices', async () => {
      const csv = `Name,URL,Price,Stock
Bad Price,https://example.com/bad,-5.00,Yes
Zero Price,https://example.com/zero,0,Yes
Valid,https://example.com/valid,10.00,Yes`

      const result = await parseFeed(csv, 'CSV', 1000)

      expect(result.rowsParsed).toBe(1)
      expect(result.errors).toHaveLength(2)
    })

    it('should respect maxRows limit', async () => {
      const csv = `Name,URL,Price,Stock
Product 1,https://example.com/1,10,Yes
Product 2,https://example.com/2,20,Yes
Product 3,https://example.com/3,30,Yes`

      const result = await parseFeed(csv, 'CSV', 2)

      expect(result.rowsParsed).toBe(2)
      expect(result.products).toHaveLength(2)
    })

    it('should map alternative column names', async () => {
      // Using column names that the parser actually supports
      const csv = `ProductName,Link,CurrentPrice,Availability,ImageUrl
Alt Product,https://example.com/alt,15.99,in stock,https://example.com/alt.jpg`

      const result = await parseFeed(csv, 'CSV', 1000)

      expect(result.products[0].name).toBe('Alt Product')
      expect(result.products[0].url).toBe('https://example.com/alt')
      expect(result.products[0].inStock).toBe(true)
    })

    it('should parse stock status variations', async () => {
      // Using 'Availability' column which is supported by the parser
      const csv = `Name,URL,Price,Availability
In Stock,https://example.com/1,10,Yes
Also In Stock,https://example.com/2,10,in stock
Out Stock 1,https://example.com/3,10,No
Out Stock 2,https://example.com/4,10,out of stock
Out Stock 3,https://example.com/5,10,0`

      const result = await parseFeed(csv, 'CSV', 1000)

      expect(result.products[0].inStock).toBe(true)
      expect(result.products[1].inStock).toBe(true)
      expect(result.products[2].inStock).toBe(false)
      expect(result.products[3].inStock).toBe(false)
      expect(result.products[4].inStock).toBe(false)
    })

    it('should parse Attributes payload for structured fields', async () => {
      const csv = `Name,URL,Price,Stock,Attributes
Test Product,https://example.com/product1,29.99,Yes,"{""caliber"": "".300 AAC Blackout"", ""grain"": 125, ""rounds"": 20}"`

      const result = await parseFeed(csv, 'CSV', 1000)

      expect(result.rowsParsed).toBe(1)
      expect(result.products[0].caliber).toBe('.300 Blackout')
      expect(result.products[0].grainWeight).toBe(125)
      expect(result.products[0].roundCount).toBe(20)
    })

    it('should derive structured fields from URL slug when missing', async () => {
      const csv = `Name,URL,Price,Stock
Basic Product,https://example.com/cci-stinger-22lr-32gr-50rd.html,9.99,Yes`

      const result = await parseFeed(csv, 'CSV', 1000)

      expect(result.rowsParsed).toBe(1)
      expect(result.products[0].caliber).toBe('.22 LR')
      expect(result.products[0].grainWeight).toBe(32)
      expect(result.products[0].roundCount).toBe(50)
    })
  })

  // Note: TSV/XML/JSON parsing tests removed - v1 only supports CSV
})

describe('computeUrlHash', () => {
  it('should generate consistent hash for same URL', () => {
    const url = 'https://example.com/product/123'
    const hash1 = computeUrlHash(url)
    const hash2 = computeUrlHash(url)

    expect(hash1).toBe(hash2)
    expect(hash1).toHaveLength(64) // SHA-256 hex
  })

  it('should normalize URLs before hashing', () => {
    // Same content, different formats
    const hash1 = computeUrlHash('https://example.com/product?a=1&b=2')
    const hash2 = computeUrlHash('https://example.com/product?b=2&a=1')

    // Query param order shouldn't matter after normalization
    expect(hash1).toBe(hash2)
  })

  it('should generate different hashes for different URLs', () => {
    const hash1 = computeUrlHash('https://example.com/product/1')
    const hash2 = computeUrlHash('https://example.com/product/2')

    expect(hash1).not.toBe(hash2)
  })
})

describe('normalizeUrl', () => {
  it('should lowercase the hostname', () => {
    const normalized = normalizeUrl('https://EXAMPLE.COM/path')
    expect(normalized).toContain('example.com')
  })

  it('should remove trailing slashes', () => {
    const normalized = normalizeUrl('https://example.com/path/')
    expect(normalized).toBe('https://example.com/path')
  })

  it('should remove tracking parameters', () => {
    const normalized = normalizeUrl('https://example.com/path?utm_source=test&id=123')
    expect(normalized).not.toContain('utm_source')
    expect(normalized).toContain('id=123')
  })

  it('should sort query parameters', () => {
    const normalized = normalizeUrl('https://example.com/path?z=1&a=2')
    expect(normalized).toBe('https://example.com/path?a=2&z=1')
  })

  it('should preserve path case (case-sensitive servers)', () => {
    const normalized = normalizeUrl('https://example.com/Products/9MM-Luger')
    expect(normalized).toBe('https://example.com/Products/9MM-Luger')
  })

  describe('Impact Network tracking params', () => {
    it('should strip irclickid parameter', () => {
      const url = 'https://ammo.com/product/9mm?irclickid=abc123xyz&sku=SKU-001'
      const normalized = normalizeUrl(url)
      expect(normalized).not.toContain('irclickid')
      expect(normalized).toContain('sku=SKU-001')
    })

    it('should strip clickid parameter', () => {
      const url = 'https://ammo.com/product/9mm?clickid=def456&variant=100rd'
      const normalized = normalizeUrl(url)
      expect(normalized).not.toContain('clickid')
      expect(normalized).toContain('variant=100rd')
    })

    it('should strip impactradius_ prefixed parameters', () => {
      const url = 'https://ammo.com/product/9mm?impactradius_campaignid=12345&impactradius_adid=67890&pid=9mm-fmj'
      const normalized = normalizeUrl(url)
      expect(normalized).not.toContain('impactradius_')
      expect(normalized).toContain('pid=9mm-fmj')
    })

    it('should normalize URLs differing only by irclickid to same hash', () => {
      const url1 = 'https://ammo.com/product/9mm-luger-115gr?irclickid=abc123&sku=SKU-001'
      const url2 = 'https://ammo.com/product/9mm-luger-115gr?irclickid=xyz789&sku=SKU-001'

      const hash1 = computeUrlHash(url1)
      const hash2 = computeUrlHash(url2)

      expect(hash1).toBe(hash2)
    })

    it('should not normalize URLs differing by sku to same hash', () => {
      const url1 = 'https://ammo.com/product/9mm?sku=SKU-001'
      const url2 = 'https://ammo.com/product/9mm?sku=SKU-002'

      const hash1 = computeUrlHash(url1)
      const hash2 = computeUrlHash(url2)

      expect(hash1).not.toBe(hash2)
    })

    it('should handle real Impact affiliate URL', () => {
      // Realistic Impact URL format
      const url = 'https://www.ammunitiondepot.com/9mm-luger-ammo-115-grain-fmj?irclickid=wqKz8dXuJxyKRG%3AwUx0Mo38AUks0Uc%3An3QznRg0&irgwc=1&impactradius_campaignid=11051'
      const normalized = normalizeUrl(url)

      expect(normalized).not.toContain('irclickid')
      expect(normalized).not.toContain('irgwc')  // Note: irgwc not in list, that's OK - it's a tracking param
      expect(normalized).not.toContain('impactradius_')
      expect(normalized).toContain('ammunitiondepot.com')
      expect(normalized).toContain('9mm-luger-ammo-115-grain-fmj')
    })
  })
})
