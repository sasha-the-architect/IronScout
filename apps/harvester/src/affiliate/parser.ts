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
  maxRows: number,
  feedId?: string
): Promise<ParseResult> {
  const parseLog = feedId ? log.child({ feedId }) : log
  const parseStart = Date.now()
  const errors: ParseError[] = []
  let rowsRead = 0
  let rowsParsed = 0

  // Track validation statistics
  const validationStats = {
    missingName: 0,
    missingUrl: 0,
    invalidUrl: 0,
    invalidPrice: 0,
    parseErrors: 0,
  }

  parseLog.debug('PARSE_START', {
    phase: 'init',
    format,
    maxRows,
    contentBytes: content.length,
    contentKB: (content.length / 1024).toFixed(2),
    hasBOM: content.charCodeAt(0) === 0xFEFF,
  })

  try {
    // v1 only supports CSV
    if (format !== 'CSV') {
      parseLog.error('PARSE_UNSUPPORTED_FORMAT', {
        phase: 'init',
        format,
        supportedFormats: ['CSV'],
      })
      throw new Error(`Unsupported format: ${format}. Only CSV is supported in v1.`)
    }

    let rawRecords: Record<string, string>[]
    const csvParseStart = Date.now()
    try {
      rawRecords = parseCSVContent(content)
      parseLog.debug('PARSE_CSV_COMPLETE', {
        phase: 'csv_parse',
        rowCount: rawRecords.length,
        durationMs: Date.now() - csvParseStart,
        columnCount: rawRecords.length > 0 ? Object.keys(rawRecords[0]).length : 0,
        columns: rawRecords.length > 0 ? Object.keys(rawRecords[0]).slice(0, 20) : [],
      })
    } catch (err) {
      // CSV parse errors are anticipated for malformed feeds - return gracefully
      const message = err instanceof Error ? err.message : 'Parse failed'
      parseLog.warn('PARSE_CSV_FAILED', {
        phase: 'csv_parse',
        errorMessage: message,
        contentPreview: content.slice(0, 200),
        durationMs: Date.now() - csvParseStart,
      })
      return {
        products: [],
        rowsRead: 0,
        rowsParsed: 0,
        errors: [
          {
            code: ERROR_CODES.PARSE_FAILED,
            message,
          },
        ],
      }
    }

    rowsRead = rawRecords.length

    // Check row count limit
    if (rowsRead > maxRows) {
      parseLog.warn('PARSE_ROW_LIMIT_EXCEEDED', {
        phase: 'validation',
        rowsRead,
        maxRows,
        rowsTruncated: rowsRead - maxRows,
        truncatedPercent: (((rowsRead - maxRows) / rowsRead) * 100).toFixed(2),
      })
      errors.push({
        code: ERROR_CODES.TOO_MANY_ROWS,
        message: `Feed has ${rowsRead} rows, exceeds limit of ${maxRows}`,
      })
      // Still process up to the limit
      rawRecords = rawRecords.slice(0, maxRows)
    }

    parseLog.debug('PARSE_MAPPING_START', {
      phase: 'mapping',
      recordsToProcess: rawRecords.length,
    })

    // Map each record to ParsedFeedProduct
    const products: ParsedFeedProduct[] = []
    const mappingStart = Date.now()

    for (let i = 0; i < rawRecords.length; i++) {
      const record = rawRecords[i]
      const rowNumber = i + 1 // 1-indexed for human readability

      try {
        const product = mapRecord(record, rowNumber)

        // Validate required fields
        const validationError = validateProduct(product)
        if (validationError) {
          // Track validation failure type
          if (validationError.code === ERROR_CODES.MISSING_REQUIRED_FIELD) {
            if (validationError.message.includes('name')) validationStats.missingName++
            else if (validationError.message.includes('URL')) validationStats.missingUrl++
          } else if (validationError.code === ERROR_CODES.INVALID_URL) {
            validationStats.invalidUrl++
          } else if (validationError.code === ERROR_CODES.INVALID_PRICE) {
            validationStats.invalidPrice++
          }

          errors.push({
            code: validationError.code,
            message: validationError.message,
            rowNumber,
            sample: { name: product.name, url: product.url, price: product.price },
          })

          // Log first few validation errors in detail
          if (errors.length <= 5) {
            parseLog.debug('PARSE_VALIDATION_ERROR', {
              phase: 'validation',
              rowNumber,
              errorCode: validationError.code,
              errorMessage: validationError.message,
              productName: product.name?.slice(0, 50),
              productUrl: product.url?.slice(0, 100),
              productPrice: product.price,
            })
          }
          continue
        }

        products.push(product)
        rowsParsed++
      } catch (err) {
        validationStats.parseErrors++
        errors.push({
          code: ERROR_CODES.PARSE_FAILED,
          message: err instanceof Error ? err.message : 'Parse error',
          rowNumber,
          sample: Object.fromEntries(Object.entries(record).slice(0, 5)),
        })

        // Log first few parse errors in detail
        if (validationStats.parseErrors <= 3) {
          parseLog.debug('PARSE_ROW_ERROR', {
            phase: 'mapping',
            rowNumber,
            errorMessage: err instanceof Error ? err.message : 'Parse error',
            recordKeys: Object.keys(record).slice(0, 10),
          })
        }
      }
    }

    const mappingDurationMs = Date.now() - mappingStart
    const totalDurationMs = Date.now() - parseStart

    // Calculate statistics
    const successRate = rowsRead > 0 ? ((rowsParsed / rowsRead) * 100).toFixed(2) : '0'
    const avgMsPerRow = rowsRead > 0 ? (mappingDurationMs / rowsRead).toFixed(3) : '0'

    parseLog.debug('PARSE_VALIDATION_STATS', {
      phase: 'validation',
      stats: validationStats,
      totalErrors: errors.length,
      errorBreakdown: {
        missingName: validationStats.missingName,
        missingUrl: validationStats.missingUrl,
        invalidUrl: validationStats.invalidUrl,
        invalidPrice: validationStats.invalidPrice,
        parseErrors: validationStats.parseErrors,
      },
    })

    parseLog.info('PARSE_COMPLETE', {
      phase: 'complete',
      format,
      rowsRead,
      rowsParsed,
      rowsRejected: rowsRead - rowsParsed,
      errorCount: errors.length,
      successRate: successRate + '%',
      durationMs: totalDurationMs,
      mappingDurationMs,
      avgMsPerRow,
      throughputRowsPerSec: totalDurationMs > 0 ? Math.round((rowsRead / totalDurationMs) * 1000) : 0,
    })

    return { products, rowsRead, rowsParsed, errors }
  } catch (err) {
    const totalDurationMs = Date.now() - parseStart
    parseLog.error('PARSE_FAILED', {
      phase: 'error',
      format,
      errorMessage: err instanceof Error ? err.message : 'Parse failed',
      errorName: err instanceof Error ? err.name : 'Unknown',
      durationMs: totalDurationMs,
      rowsRead,
      rowsParsed,
    }, err as Error)
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
 * Strip UTF-8 BOM (Byte Order Mark) from content
 * BOM is common in files exported from Excel and can break header parsing
 */
function stripBOM(content: string): string {
  // UTF-8 BOM is EF BB BF, which appears as \uFEFF in JavaScript
  if (content.charCodeAt(0) === 0xFEFF) {
    return content.slice(1)
  }
  return content
}

/**
 * Parse CSV content
 * v1 only supports CSV. TSV/XML/JSON parsing functions are post-v1.
 */
function parseCSVContent(content: string): Record<string, string>[] {
  // Strip BOM before parsing to prevent header mismatch
  const cleanContent = stripBOM(content)

  return parseCSV(cleanContent, {
    columns: true,
    skip_empty_lines: true,
    delimiter: ',',
    relax_column_count: true,
    relax_quotes: true,
    trim: true,
  }) as Record<string, string>[]
}

// ============================================================================
// Field Normalization Utilities
// ============================================================================

/**
 * Trim and normalize whitespace (collapse multiple spaces to single)
 */
function normalizeString(value: string | undefined): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim().replace(/\s+/g, ' ')
  return trimmed || undefined
}

/**
 * Normalize SKU: uppercase, trim, remove invalid characters
 * SKUs should be alphanumeric with dashes/underscores
 */
function normalizeSku(value: string | undefined): string | undefined {
  if (!value) return undefined
  return value.trim().toUpperCase().replace(/\s+/g, '-')
}

/**
 * Normalize UPC/GTIN/EAN: digits only, validate length
 * Valid lengths: 8 (EAN-8), 12 (UPC-A), 13 (EAN-13), 14 (GTIN-14)
 */
function normalizeUpc(value: string | undefined): string | undefined {
  if (!value) return undefined
  const digitsOnly = value.replace(/\D/g, '')
  // Valid UPC/EAN/GTIN lengths
  if ([8, 12, 13, 14].includes(digitsOnly.length)) {
    return digitsOnly
  }
  // If invalid length but has digits, still return (may be MPN or partial)
  return digitsOnly || undefined
}

/**
 * Normalize currency code: uppercase, validate ISO 4217
 */
function normalizeCurrency(value: string | undefined): string {
  if (!value) return 'USD'
  const upper = value.trim().toUpperCase()
  // Common currency codes
  const validCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY', 'MXN']
  return validCurrencies.includes(upper) ? upper : 'USD'
}

/**
 * Parse and normalize price: ensure positive number with 2 decimal precision
 */
function normalizePrice(value: string | undefined): number {
  if (!value) return 0
  // Remove currency symbols, commas, and other non-numeric chars except decimal point
  const cleaned = value.replace(/[^0-9.-]/g, '')
  const parsed = parseFloat(cleaned)
  if (isNaN(parsed) || parsed < 0) return 0
  // Round to 2 decimal places
  return Math.round(parsed * 100) / 100
}

/**
 * Normalize brand/manufacturer: title case, trim
 */
function normalizeBrand(value: string | undefined): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  // Title case but preserve known acronyms
  const acronyms = ['PMC', 'CCI', 'FMJ', 'JHP', 'NATO', 'ACP', 'USA', 'LLC', 'INC']
  return trimmed
    .split(/\s+/)
    .map(word => {
      const upper = word.toUpperCase()
      if (acronyms.includes(upper)) return upper
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
}

/**
 * Normalize URL: trim, ensure valid format
 */
function normalizeProductUrl(value: string | undefined): string {
  if (!value) return ''
  const trimmed = value.trim()
  // Basic URL validation - must have protocol
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return 'https://' + trimmed
  }
  return trimmed
}

// ============================================================================
// Record Mapping
// ============================================================================

/**
 * Map raw record to ParsedFeedProduct
 * Handles Impact's official column names and common variations
 * Applies normalization to all extracted fields
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

  // Extract and normalize price
  // Priority: SalePrice > CurrentPrice > Price (SalePrice is the actual selling price)
  const salePriceStr = getValue('SalePrice', 'Sale Price', 'CurrentPrice', 'Current Price')
  const listPriceStr = getValue('Price', 'price', 'ListPrice', 'List Price')
  // Use sale price if available, otherwise fall back to list price
  const priceStr = salePriceStr || listPriceStr
  const price = normalizePrice(priceStr)

  // Parse stock status
  const stockText = getValue('StockAvailability', 'Stock Availability', 'Availability', 'InStock', 'In Stock', 'inStock')
  const inStock = parseStockStatus(stockText)

  // Extract and normalize identity fields
  const impactItemId = normalizeString(getValue('CatalogItemId', 'ItemId', 'item_id', 'catalogItemId'))
  const sku = normalizeSku(getValue(
    'SKU', 'MerchantSKU', 'sku', 'merchant_sku', 'ProductSKU',
    'Unique Merchant SKU', 'UniqueMerchantSKU', 'unique_merchant_sku'
  ))
  const upc = normalizeUpc(getValue('Gtin', 'GTIN', 'UPC', 'EAN', 'ISBN', 'upc', 'gtin', 'ean'))

  // Get and normalize URL
  const url = normalizeProductUrl(getValue('Url', 'URL', 'ProductURL', 'Product URL', 'Link', 'url', 'link'))

  // Extract and normalize original price
  // If we used SalePrice, the list price (Price column) becomes the original/MSRP
  // Otherwise check explicit OriginalPrice/MSRP fields
  const explicitOriginalPriceStr = getValue('OriginalPrice', 'Original Price', 'MSRP', 'RetailPrice', 'Retail Price')
  // Use explicit original price if available, or list price if we used sale price
  const originalPriceStr = explicitOriginalPriceStr || (salePriceStr ? listPriceStr : undefined)
  const originalPrice = normalizePrice(originalPriceStr)

  return {
    name: normalizeString(getValue('Name', 'ProductName', 'Product Name', 'title', 'Title')) || '',
    url,
    price,
    inStock,
    impactItemId,
    sku,
    upc,
    imageUrl: normalizeString(getValue('ImageUrl', 'ImageURL', 'Image URL', 'Image', 'PrimaryImage', 'image_url', 'Primary Image URL')),
    description: normalizeString(getValue('Description', 'ProductDescription', 'Product Description', 'description')),
    brand: normalizeBrand(getValue('Manufacturer', 'Brand', 'brand', 'manufacturer')),
    category: normalizeString(getValue('Category', 'ProductCategory', 'category', 'Product Type')),
    originalPrice: originalPrice > 0 ? originalPrice : undefined,
    currency: normalizeCurrency(getValue('Currency', 'CurrencyCode', 'currency')),
    rowNumber,
  }
}

/**
 * Parse stock availability status
 * Handles various formats: Y/N, Yes/No, true/false, In Stock/Out of Stock, 1/0
 */
function parseStockStatus(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value > 0

  if (typeof value === 'string') {
    const normalized = value.toLowerCase().trim()

    // In stock indicators (explicit)
    if (
      normalized === 'y' ||
      normalized === 'yes' ||
      normalized === 'true' ||
      normalized === '1' ||
      normalized === 'in stock' ||
      normalized === 'instock' ||
      normalized === 'available' ||
      normalized === 'in_stock' ||
      normalized === 'low stock' ||
      normalized === 'lowstock' ||
      normalized === 'low_stock' ||
      normalized === 'limited'
    ) {
      return true
    }

    // Out of stock indicators
    if (
      normalized === 'n' ||
      normalized === 'false' ||
      normalized === 'no' ||
      normalized === '0' ||
      normalized === 'out of stock' ||
      normalized === 'outofstock' ||
      normalized === 'out_of_stock' ||
      normalized === 'unavailable' ||
      normalized === 'sold out' ||
      normalized === 'soldout' ||
      normalized === 'discontinued' ||
      normalized === 'backordered' ||
      normalized === 'preorder' ||
      normalized === 'pre-order'
    ) {
      return false
    }
  }

  // Default to true if unrecognized (assume in stock)
  return true
}

/**
 * Validate product has required fields
 */
/**
 * Validate URL has a proper hostname (not empty, not just a path)
 * Returns true if URL is valid for a product link
 */
function isValidProductUrl(url: string): boolean {
  try {
    const parsed = new URL(url)

    // Must be http or https
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false
    }

    // Must have a non-empty hostname
    if (!parsed.hostname || parsed.hostname.length === 0) {
      return false
    }

    // Hostname must contain at least one dot (domain.tld) or be localhost
    // This rejects things like "https://not-a-url" which new URL() accepts
    if (parsed.hostname !== 'localhost' && !parsed.hostname.includes('.')) {
      return false
    }

    // Reject localhost/internal URLs in production feeds
    const invalidHosts = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]']
    if (invalidHosts.includes(parsed.hostname.toLowerCase())) {
      return false
    }

    return true
  } catch {
    return false
  }
}

function validateProduct(
  product: ParsedFeedProduct
): { code: ErrorCode; message: string } | null {
  if (!product.name || product.name.trim() === '') {
    return { code: ERROR_CODES.MISSING_REQUIRED_FIELD, message: 'Missing product name' }
  }

  if (!product.url || product.url.trim() === '') {
    return { code: ERROR_CODES.MISSING_REQUIRED_FIELD, message: 'Missing product URL' }
  }

  // Validate URL format with stricter rules
  if (!isValidProductUrl(product.url)) {
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
