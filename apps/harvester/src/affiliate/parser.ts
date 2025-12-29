/**
 * Affiliate Feed Parser
 *
 * v1 only supports CSV format. TSV/XML/JSON are post-v1.
 * Uses the existing Impact parser as a foundation.
 *
 * Per spec Section 8.3: Parse rows and resolve identity type.
 */

import { parse as parseCSV } from 'csv-parse/sync'
import { createHash } from 'crypto'
import { logger } from '../config/logger'
import type { ParsedFeedProduct, ParseResult, ParseError, ErrorCode } from './types'
import { ERROR_CODES } from './types'

const log = logger.affiliate

/**
 * Parse feed content (CSV only for v1)
 */
export async function parseFeed(
  content: string,
  format: 'CSV',
  maxRows: number
): Promise<ParseResult> {
  const errors: ParseError[] = []
  let rowsRead = 0
  let rowsParsed = 0

  try {
    // v1 only supports CSV
    if (format !== 'CSV') {
      throw new Error(`Unsupported format: ${format}. Only CSV is supported in v1.`)
    }

    let rawRecords = parseCSVContent(content)

    rowsRead = rawRecords.length

    // Check row count limit
    if (rowsRead > maxRows) {
      errors.push({
        code: ERROR_CODES.TOO_MANY_ROWS,
        message: `Feed has ${rowsRead} rows, exceeds limit of ${maxRows}`,
      })
      // Still process up to the limit
      rawRecords = rawRecords.slice(0, maxRows)
    }

    // Map each record to ParsedFeedProduct
    const products: ParsedFeedProduct[] = []

    for (let i = 0; i < rawRecords.length; i++) {
      const record = rawRecords[i]
      const rowNumber = i + 1 // 1-indexed for human readability

      try {
        const product = mapRecord(record, rowNumber)

        // Validate required fields
        const validationError = validateProduct(product)
        if (validationError) {
          errors.push({
            code: validationError.code,
            message: validationError.message,
            rowNumber,
            sample: { name: product.name, url: product.url, price: product.price },
          })
          continue
        }

        products.push(product)
        rowsParsed++
      } catch (err) {
        errors.push({
          code: ERROR_CODES.PARSE_FAILED,
          message: err instanceof Error ? err.message : 'Parse error',
          rowNumber,
          sample: Object.fromEntries(Object.entries(record).slice(0, 5)),
        })
      }
    }

    log.info('Feed parsed', {
      format,
      rowsRead,
      rowsParsed,
      errors: errors.length,
    })

    return { products, rowsRead, rowsParsed, errors }
  } catch (err) {
    log.error('Feed parse failed', { format }, err as Error)
    return {
      products: [],
      rowsRead: 0,
      rowsParsed: 0,
      errors: [
        {
          code: ERROR_CODES.PARSE_FAILED,
          message: err instanceof Error ? err.message : 'Parse failed',
        },
      ],
    }
  }
}

/**
 * Parse CSV content
 * v1 only supports CSV. TSV/XML/JSON parsing functions are post-v1.
 */
function parseCSVContent(content: string): Record<string, string>[] {
  return parseCSV(content, {
    columns: true,
    skip_empty_lines: true,
    delimiter: ',',
    relax_column_count: true,
    relax_quotes: true,
    trim: true,
  }) as Record<string, string>[]
}

/**
 * Map raw record to ParsedFeedProduct
 * Handles Impact's official column names and common variations
 */
function mapRecord(record: Record<string, string>, rowNumber: number): ParsedFeedProduct {
  // Helper to get value with multiple possible keys (case-insensitive)
  const getValue = (...keys: string[]): string | undefined => {
    for (const key of keys) {
      if (record[key] !== undefined && record[key] !== '') {
        return String(record[key])
      }
      const lowerKey = key.toLowerCase()
      for (const recordKey of Object.keys(record)) {
        if (recordKey.toLowerCase() === lowerKey && record[recordKey] !== undefined && record[recordKey] !== '') {
          return String(record[recordKey])
        }
      }
    }
    return undefined
  }

  // Parse price
  const priceStr = getValue('CurrentPrice', 'Price', 'Current Price', 'SalePrice', 'price')
  const price = priceStr ? parseFloat(priceStr.replace(/[^0-9.-]/g, '')) : 0

  // Parse stock status
  const stockText = getValue('StockAvailability', 'Stock Availability', 'Availability', 'InStock', 'In Stock', 'inStock')
  const inStock = parseStockStatus(stockText)

  // Extract identity fields
  const impactItemId = getValue('CatalogItemId', 'ItemId', 'item_id', 'catalogItemId')
  const sku = getValue('SKU', 'MerchantSKU', 'sku', 'merchant_sku', 'ProductSKU')
  const upc = getValue('Gtin', 'GTIN', 'UPC', 'EAN', 'ISBN', 'upc', 'gtin')

  // Get URL for hash fallback
  const url = getValue('Url', 'URL', 'ProductURL', 'Product URL', 'Link', 'url', 'link') || ''

  return {
    name: getValue('Name', 'ProductName', 'Product Name', 'title', 'Title') || '',
    url,
    price: isNaN(price) ? 0 : price,
    inStock,
    impactItemId,
    sku,
    upc,
    imageUrl: getValue('ImageUrl', 'ImageURL', 'Image URL', 'Image', 'PrimaryImage', 'image_url'),
    description: getValue('Description', 'ProductDescription', 'description'),
    brand: getValue('Manufacturer', 'Brand', 'brand', 'manufacturer'),
    category: getValue('Category', 'ProductCategory', 'category'),
    originalPrice: parseFloat(getValue('OriginalPrice', 'Original Price', 'MSRP', 'ListPrice')?.replace(/[^0-9.-]/g, '') || '0') || undefined,
    currency: getValue('Currency', 'CurrencyCode', 'currency') || 'USD',
    rowNumber,
  }
}

/**
 * Parse stock availability status
 */
function parseStockStatus(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value > 0

  if (typeof value === 'string') {
    const normalized = value.toLowerCase().trim()

    // Out of stock indicators
    if (
      normalized === 'false' ||
      normalized === 'no' ||
      normalized === '0' ||
      normalized === 'out of stock' ||
      normalized === 'outofstock' ||
      normalized === 'unavailable' ||
      normalized === 'sold out' ||
      normalized === 'discontinued'
    ) {
      return false
    }
  }

  return true
}

/**
 * Validate product has required fields
 */
function validateProduct(
  product: ParsedFeedProduct
): { code: ErrorCode; message: string } | null {
  if (!product.name || product.name.trim() === '') {
    return { code: ERROR_CODES.MISSING_REQUIRED_FIELD, message: 'Missing product name' }
  }

  if (!product.url || product.url.trim() === '') {
    return { code: ERROR_CODES.MISSING_REQUIRED_FIELD, message: 'Missing product URL' }
  }

  // Validate URL format
  try {
    new URL(product.url)
  } catch {
    return { code: ERROR_CODES.INVALID_URL, message: `Invalid URL: ${product.url}` }
  }

  if (product.price <= 0) {
    return { code: ERROR_CODES.INVALID_PRICE, message: `Invalid price: ${product.price}` }
  }

  return null
}

/**
 * Compute URL hash for fallback identity
 */
export function computeUrlHash(url: string): string {
  // Normalize URL: lowercase, remove trailing slash, remove tracking params
  const normalized = normalizeUrl(url)
  return createHash('sha256').update(normalized).digest('hex')
}

/**
 * Normalize URL for hashing
 *
 * Rules (per spec Section 3.4):
 * - Lowercase protocol and host only
 * - Preserve pathname exactly (case-sensitive servers)
 * - Preserve query key and value case
 * - Strip trailing slashes
 * - Do not decode or re-encode path segments
 */
// Tracking parameters to strip from URLs for identity normalization
// These do not affect product identity, only attribution
const TRACKING_PARAMS = [
  // Google/Meta
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'fbclid',
  // Generic affiliate
  'ref', 'source', 'partner_id', 'affiliate_id',
  // Impact Network (v1 primary)
  'clickid', 'irclickid', 'irgwc',
]

// Prefixes for tracking parameters (strips any param starting with these)
const TRACKING_PREFIXES = [
  'impactradius_',  // Impact-specific params
  'utm_',           // Any custom UTM params
]

export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url)

    // Remove exact-match tracking parameters
    for (const param of TRACKING_PARAMS) {
      parsed.searchParams.delete(param)
    }

    // Remove prefix-match tracking parameters (e.g., impactradius_*)
    const paramsToDelete: string[] = []
    for (const [key] of parsed.searchParams) {
      for (const prefix of TRACKING_PREFIXES) {
        if (key.toLowerCase().startsWith(prefix)) {
          paramsToDelete.push(key)
          break
        }
      }
    }
    for (const param of paramsToDelete) {
      parsed.searchParams.delete(param)
    }

    // Sort params for consistent hashing (preserves case)
    parsed.searchParams.sort()

    // Lowercase protocol and host only, preserve path and query case
    const normalized =
      `${parsed.protocol.toLowerCase()}//${parsed.host.toLowerCase()}` +
      parsed.pathname +
      (parsed.search ? parsed.search : '')

    return normalized.replace(/\/+$/, '')
  } catch {
    // If URL parsing fails, just trim (do not lowercase - preserves case)
    return url.trim().replace(/\/+$/, '')
  }
}
