/**
 * Impact Feed Connector
 *
 * Handles Impact Radius affiliate feed format.
 * Supports CSV, TSV, XML, and JSON formats with Impact's official field names.
 *
 * Impact Product Catalog Fields:
 * - CatalogItemId, Name, Description, Manufacturer
 * - CurrentPrice, OriginalPrice, StockAvailability
 * - Gtin (UPC), Url, ImageUrl, Category
 */

import type { FeedFormatType } from '@ironscout/db'
import {
  BaseConnector,
  extractString,
  extractNumber,
  extractBoolean,
  validateUPC,
  parseCSV,
  parseJSON,
  parseXML,
} from './base-connector'
import type { ParsedFeedRecord, FieldError, FieldCoercion } from './types'

// ============================================================================
// IMPACT-SPECIFIC FIELD MAPPINGS
// ============================================================================

const TITLE_FIELDS = [
  'Name', 'name', 'ProductName', 'Product Name', 'title',
]

const PRICE_FIELDS = [
  'CurrentPrice', 'currentprice', 'Current Price', 'Price', 'price', 'SalePrice',
]

const UPC_FIELDS = [
  'Gtin', 'GTIN', 'gtin', 'UPC', 'upc', 'EAN', 'ean', 'ISBN', 'isbn',
]

const SKU_FIELDS = [
  'CatalogItemId', 'catalogitemid', 'SKU', 'sku', 'ProductId', 'Product ID', 'MerchantSKU',
]

const DESCRIPTION_FIELDS = [
  'Description', 'description', 'ProductDescription', 'Product Description', 'Bullets',
]

const BRAND_FIELDS = [
  'Manufacturer', 'manufacturer', 'Brand', 'brand', 'Vendor', 'vendor',
]

const STOCK_FIELDS = [
  'StockAvailability', 'stockavailability', 'Stock Availability', 'Availability',
  'InStock', 'instock', 'In Stock',
]

const URL_FIELDS = [
  'Url', 'URL', 'url', 'ProductURL', 'Product URL', 'Link', 'link', 'MobileUrl',
]

const IMAGE_FIELDS = [
  'ImageUrl', 'imageurl', 'ImageURL', 'Image URL', 'Image', 'image', 'PrimaryImage',
]

const CATEGORY_FIELDS = [
  'Category', 'category', 'ProductCategory', 'Product Category',
]

// ============================================================================
// IMPACT CONNECTOR
// ============================================================================

export class ImpactConnector extends BaseConnector {
  readonly formatType: FeedFormatType = 'IMPACT'
  readonly name = 'Impact Affiliate Feed'

  /**
   * Detect if content looks like an Impact feed
   * Impact feeds commonly have CatalogItemId or Gtin fields
   */
  canHandle(content: string): boolean {
    const trimmed = content.trim().toLowerCase()

    // Check for Impact-specific field names
    const impactIndicators = [
      'catalogitemid',
      'stockavailability',
      'currentprice',
      'originalprice',
      'gtin',
    ]

    return impactIndicators.some(indicator => trimmed.includes(indicator))
  }

  getFieldMapping(): Record<string, string> {
    return {
      title: TITLE_FIELDS.join(' | '),
      price: PRICE_FIELDS.join(' | '),
      upc: UPC_FIELDS.join(' | '),
      sku: SKU_FIELDS.join(' | '),
      description: DESCRIPTION_FIELDS.join(' | '),
      brand: BRAND_FIELDS.join(' | '),
      inStock: STOCK_FIELDS.join(' | '),
      productUrl: URL_FIELDS.join(' | '),
      imageUrl: IMAGE_FIELDS.join(' | '),
      category: CATEGORY_FIELDS.join(' | '),
    }
  }

  /**
   * Override parse to handle Impact-specific content detection
   */
  async parse(content: string): ReturnType<BaseConnector['parse']> {
    const startTime = Date.now()
    const rows = this.parseImpactContent(content)

    const parsedRecords: import('./types').ParsedRecordResult[] = []
    const errorCodes: Record<string, number> = {}

    let indexableCount = 0
    let quarantineCount = 0
    let rejectCount = 0

    for (let i = 0; i < rows.length; i++) {
      try {
        const { record, errors, coercions } = this.mapRow(rows[i], i)

        const hasValidUPC = !!record.upc
        const hasRequiredFields = !!record.title && record.price > 0
        const isIndexable = hasValidUPC && hasRequiredFields

        if (!hasValidUPC) {
          errors.push({
            field: 'upc',
            code: 'MISSING_UPC',
            message: 'Missing or invalid GTIN/UPC - record will be quarantined',
            rawValue: rows[i]['Gtin'] || rows[i]['gtin'] || rows[i]['UPC'],
          })
        }

        if (!record.title) {
          errors.push({
            field: 'title',
            code: 'MISSING_TITLE',
            message: 'Missing product name',
          })
        }

        if (!record.price || record.price <= 0) {
          errors.push({
            field: 'price',
            code: 'INVALID_PRICE',
            message: 'Missing or invalid price',
            rawValue: rows[i]['CurrentPrice'] || rows[i]['Price'],
          })
        }

        for (const error of errors) {
          errorCodes[error.code] = (errorCodes[error.code] || 0) + 1
        }

        if (isIndexable) {
          indexableCount++
        } else if (hasRequiredFields && !hasValidUPC) {
          quarantineCount++
        } else {
          rejectCount++
        }

        parsedRecords.push({
          record,
          errors,
          coercions,
          isIndexable,
        })
      } catch (error) {
        rejectCount++
        errorCodes['MALFORMED_ROW'] = (errorCodes['MALFORMED_ROW'] || 0) + 1

        parsedRecords.push({
          record: {
            title: '',
            price: 0,
            inStock: false,
            rawRow: rows[i],
            rowIndex: i,
          },
          errors: [{
            field: '_row',
            code: 'MALFORMED_ROW',
            message: `Failed to parse row: ${error instanceof Error ? error.message : 'Unknown error'}`,
          }],
          coercions: [],
          isIndexable: false,
        })
      }
    }

    return {
      formatType: this.formatType,
      totalRows: rows.length,
      parsedRecords,
      indexableCount,
      quarantineCount,
      rejectCount,
      errorCodes,
      parseTimeMs: Date.now() - startTime,
    }
  }

  /**
   * Parse Impact content with format auto-detection
   */
  private parseImpactContent(content: string): Record<string, unknown>[] {
    const trimmed = content.trim()

    // XML
    if (trimmed.startsWith('<?xml') || trimmed.startsWith('<')) {
      const result = parseXML(content)
      // Impact XML can be nested under products/product or catalog/item
      return result
    }

    // JSON
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return parseJSON(content)
    }

    // CSV or TSV - detect delimiter
    const firstLine = trimmed.split('\n')[0] || ''
    const tabCount = (firstLine.match(/\t/g) || []).length
    const commaCount = (firstLine.match(/,/g) || []).length

    if (tabCount > commaCount) {
      // TSV - use csv-parse with tab delimiter
      const { parse: csvParse } = require('csv-parse/sync')
      return csvParse(content, {
        columns: true,
        skip_empty_lines: true,
        delimiter: '\t',
        relax_column_count: true,
        relax_quotes: true,
        trim: true,
      })
    }

    // Default to CSV
    return parseCSV(content)
  }

  protected mapRow(
    row: Record<string, unknown>,
    index: number
  ): { record: ParsedFeedRecord; errors: FieldError[]; coercions: FieldCoercion[] } {
    const errors: FieldError[] = []
    const coercions: FieldCoercion[] = []

    const rawUpc = extractString(row, UPC_FIELDS, coercions, 'upc')
    const upc = validateUPC(rawUpc) || undefined

    // Parse stock status with Impact-specific logic
    const stockText = extractString(row, STOCK_FIELDS, coercions, 'inStock')
    const inStock = this.parseImpactStockStatus(stockText)

    const record: ParsedFeedRecord = {
      upc,
      sku: extractString(row, SKU_FIELDS, coercions, 'sku'),
      title: extractString(row, TITLE_FIELDS, coercions, 'title') || '',
      description: extractString(row, DESCRIPTION_FIELDS, coercions, 'description'),
      brand: extractString(row, BRAND_FIELDS, coercions, 'brand'),
      price: extractNumber(row, PRICE_FIELDS, coercions, 'price') || 0,
      inStock,
      productUrl: extractString(row, URL_FIELDS, coercions, 'productUrl'),
      imageUrl: extractString(row, IMAGE_FIELDS, coercions, 'imageUrl'),
      rawRow: row,
      rowIndex: index,
    }

    return { record, errors, coercions }
  }

  /**
   * Parse Impact-specific stock availability values
   * Impact uses free-form text like "In Stock", "Out of Stock", numeric quantities, etc.
   */
  private parseImpactStockStatus(value: string | undefined): boolean {
    if (!value) return true // Default to in stock if not specified

    const normalized = value.toLowerCase().trim()

    // Explicit out of stock indicators
    const outOfStockPatterns = [
      'false', 'no', '0',
      'out of stock', 'outofstock', 'out-of-stock',
      'unavailable', 'sold out', 'soldout',
      'discontinued', 'backordered', 'backorder',
      'preorder', 'pre-order',
    ]

    if (outOfStockPatterns.includes(normalized)) {
      return false
    }

    // Explicit in stock indicators
    const inStockPatterns = [
      'true', 'yes', '1',
      'in stock', 'instock', 'in-stock',
      'available', 'ready to ship', 'ships today',
    ]

    if (inStockPatterns.includes(normalized)) {
      return true
    }

    // Check for numeric quantity
    const qtyMatch = normalized.match(/(\d+)\s*(in\s*stock|available|qty|units?)?/i)
    if (qtyMatch) {
      const qty = parseInt(qtyMatch[1], 10)
      return qty > 0
    }

    // Default to in stock
    return true
  }
}
