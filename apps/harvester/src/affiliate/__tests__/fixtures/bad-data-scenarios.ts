/**
 * Bad Data Scenarios - Test Fixtures for Affiliate Feed Parser
 *
 * Comprehensive test cases covering all potential bad data scenarios.
 * Organized by category matching the QA test case document.
 *
 * Each fixture includes:
 * - id: Test case number
 * - name: Short descriptive name
 * - description: What the test validates
 * - csv: The CSV content to parse (or setup instructions for non-CSV tests)
 * - expectedError: Expected error code or null if should parse successfully
 * - expectedProducts: Number of products expected to parse (0 for failures)
 */

import { ERROR_CODES } from '../../types'

// Standard valid CSV header for most tests
const VALID_HEADER = 'Name,URL,Price,StockAvailability,SKU,ImageUrl,Description,Brand,Category'

// Standard valid row template
const validRow = (overrides: Record<string, string> = {}) => {
  const defaults = {
    name: 'Test Ammo 9mm 115gr FMJ',
    url: 'https://example.com/product/123',
    price: '19.99',
    stock: 'In Stock',
    sku: 'TEST-SKU-001',
    image: 'https://example.com/images/123.jpg',
    description: 'Quality ammunition for target practice',
    brand: 'Federal',
    category: 'Handgun Ammunition',
  }
  const merged = { ...defaults, ...overrides }
  return `${merged.name},${merged.url},${merged.price},${merged.stock},${merged.sku},${merged.image},${merged.description},${merged.brand},${merged.category}`
}

export interface BadDataFixture {
  id: number
  name: string
  description: string
  csv: string | Buffer | (() => string | Buffer)
  expectedError?: string | null
  expectedProducts?: number
  expectedErrorCount?: number
  setup?: string // Additional setup instructions for complex scenarios
}

// =============================================================================
// FILE-LEVEL ISSUES (1-12)
// =============================================================================

export const fileLevelFixtures: BadDataFixture[] = [
  {
    id: 1,
    name: 'empty_file',
    description: 'File exists but contains 0 bytes',
    csv: '',
    // Parser returns empty result for empty file - no error, just 0 products
    expectedError: null,
    expectedProducts: 0,
  },
  {
    id: 2,
    name: 'headers_only',
    description: 'Headers present but no data rows',
    csv: VALID_HEADER,
    expectedError: null,
    expectedProducts: 0,
  },
  {
    id: 3,
    name: 'whitespace_only',
    description: 'File contains only spaces and newlines',
    csv: '   \n\n   \n  \t  \n',
    // Parser handles whitespace gracefully - returns empty result
    expectedError: null,
    expectedProducts: 0,
  },
  {
    id: 4,
    name: 'truncated_file',
    description: 'File cut off mid-row (incomplete download)',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,19.99,In Stock,SKU-001,https://example.com/i.jpg,Desc`,
    // Missing last two fields - should still parse with relax_column_count
    expectedError: null,
    expectedProducts: 1,
  },
  {
    id: 5,
    name: 'truncated_mid_field',
    description: 'File truncated in middle of quoted field',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,19.99,In Stock,SKU-001,https://example.com/i.jpg,"Incomplete description`,
    // Parser returns error for unclosed quote
    expectedError: ERROR_CODES.PARSE_FAILED,
    expectedProducts: 0,
  },
  {
    id: 6,
    name: 'corrupted_gzip',
    description: 'GZIP file that fails to decompress',
    csv: Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0xff, 0xff, 0xff]),
    setup: 'Test at fetcher level - decompress should fail. Parser receives already decompressed content.',
    expectedError: null, // Parser doesn't see compression - tested at fetcher level
    expectedProducts: 0,
  },
  {
    id: 7,
    name: 'wrong_compression_gzip_expected',
    description: 'File configured as GZIP but is actually uncompressed CSV',
    csv: `${VALID_HEADER}\n${validRow()}`,
    setup: 'Test at fetcher level - compression mismatch. Parser receives already decompressed content.',
    expectedError: null, // Parser doesn't handle compression
    expectedProducts: 1,
  },
  {
    id: 8,
    name: 'wrong_compression_none_expected',
    description: 'File configured as uncompressed but is actually GZIP',
    csv: () => {
      // This would need to be actual gzip content in real test
      return 'GZIP_BINARY_CONTENT_PLACEHOLDER'
    },
    setup: 'Test at fetcher level - compression mismatch. Parser receives raw bytes.',
    // Parser will see garbage and fail to parse meaningful data
    expectedError: null,
    expectedProducts: 0,
  },
  {
    id: 9,
    name: 'bom_utf8',
    description: 'UTF-8 BOM prefix (handled by parser BOM stripping)',
    csv: '\uFEFF' + VALID_HEADER + '\n' + validRow(),
    // Parser strips UTF-8 BOM before parsing, so headers match correctly
    expectedError: null,
    expectedProducts: 1, // BOM is stripped, parses successfully
  },
  {
    id: 10,
    name: 'mixed_line_endings',
    description: 'File with inconsistent CRLF/LF/CR line endings',
    csv: `${VALID_HEADER}\r\n${validRow({ sku: 'SKU-001' })}\n${validRow({ sku: 'SKU-002' })}\r${validRow({ sku: 'SKU-003' })}`,
    // CR alone (\r) is not recognized as line ending by csv-parse
    // Row 2 and 3 get concatenated, causing SKU-002 row to have extra garbage
    // Only first row (SKU-001) parses correctly
    expectedError: null,
    expectedProducts: 1,
  },
  {
    id: 11,
    name: 'encoding_latin1_as_utf8',
    description: 'File is Latin-1 but parsed as UTF-8',
    csv: () => {
      // Latin-1 encoded string with special characters
      // "Tête" with Latin-1 encoding of ê (0xEA)
      return Buffer.from([0x54, 0xea, 0x74, 0x65]).toString('latin1')
    },
    setup: 'Create file with Latin-1 encoding, parse as UTF-8',
    expectedError: null, // May produce garbled text but should not crash
    expectedProducts: 0, // Depends on how mangled the data becomes
  },
  {
    id: 12,
    name: 'file_exceeds_max_size',
    description: 'File larger than configured maxFileSizeBytes',
    csv: VALID_HEADER + '\n' + Array(100000).fill(validRow()).join('\n'),
    setup: 'Configure maxFileSizeBytes to smaller value, test at fetcher level',
    expectedError: ERROR_CODES.FILE_TOO_LARGE,
    expectedProducts: 0,
  },
]

// =============================================================================
// CSV/DELIMITER ISSUES (13-23)
// =============================================================================

export const csvDelimiterFixtures: BadDataFixture[] = [
  {
    id: 13,
    name: 'wrong_delimiter_tab',
    description: 'Tab-delimited file parsed as comma-delimited',
    csv: 'Name\tURL\tPrice\tStockAvailability\tSKU\nTest Product\thttps://example.com/p/1\t19.99\tIn Stock\tSKU-001',
    expectedError: null, // Will parse as single column
    expectedProducts: 0, // Missing required fields
    expectedErrorCount: 1,
  },
  {
    id: 14,
    name: 'unescaped_delimiter_in_value',
    description: 'Commas inside unquoted fields',
    csv: `${VALID_HEADER}\nTest, Product with comma,https://example.com/p/1,19.99,In Stock,SKU-001,https://example.com/i.jpg,Description,Brand,Category`,
    expectedError: null,
    expectedProducts: 0, // Row will be malformed
    expectedErrorCount: 1,
  },
  {
    id: 15,
    name: 'unbalanced_quotes',
    description: 'Opening quote without closing quote',
    csv: `${VALID_HEADER}\n"Test Product,https://example.com/p/1,19.99,In Stock,SKU-001`,
    expectedError: ERROR_CODES.PARSE_FAILED,
    expectedProducts: 0,
  },
  {
    id: 16,
    name: 'newlines_in_quoted_field',
    description: 'Multi-line field values inside quotes',
    csv: `${VALID_HEADER}\n"Test Product\nwith newline",https://example.com/p/1,19.99,In Stock,SKU-001,https://example.com/i.jpg,"Description\nwith\nmultiple lines",Brand,Category`,
    expectedError: null,
    expectedProducts: 1,
  },
  {
    id: 17,
    name: 'missing_headers_row',
    description: 'Data starts immediately with no column names',
    csv: 'Test Product,https://example.com/p/1,19.99,In Stock,SKU-001,https://example.com/i.jpg,Description,Brand,Category',
    expectedError: null, // csv-parse with columns:true will treat first row as headers
    expectedProducts: 0, // Second row would be data, but there isn't one
  },
  {
    id: 18,
    name: 'duplicate_column_headers',
    description: 'Same column name appears twice',
    csv: 'Name,URL,Price,Price,StockAvailability,SKU\nTest Product,https://example.com/p/1,19.99,29.99,In Stock,SKU-001',
    expectedError: null, // Parser may use last value or first
    expectedProducts: 1,
  },
  {
    id: 19,
    name: 'extra_columns_in_data',
    description: 'Row has more fields than headers',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,19.99,In Stock,SKU-001,https://example.com/i.jpg,Description,Brand,Category,Extra1,Extra2`,
    expectedError: null, // relax_column_count handles this
    expectedProducts: 1,
  },
  {
    id: 20,
    name: 'missing_columns_in_data',
    description: 'Row has fewer fields than headers',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,19.99`,
    // relax_column_count allows this - missing fields become undefined
    // Name, URL, Price are all present so validation passes
    expectedError: null,
    expectedProducts: 1,
  },
  {
    id: 21,
    name: 'header_case_mismatch',
    description: 'Headers in different case than expected',
    csv: 'NAME,URL,PRICE,STOCKAVAILABILITY,SKU\nTest Product,https://example.com/p/1,19.99,In Stock,SKU-001',
    expectedError: null,
    expectedProducts: 1,
  },
  {
    id: 22,
    name: 'header_with_whitespace',
    description: 'Headers with leading/trailing whitespace',
    csv: ' Name , URL , Price , StockAvailability , SKU \nTest Product,https://example.com/p/1,19.99,In Stock,SKU-001',
    expectedError: null, // Parser should trim
    expectedProducts: 1,
  },
  {
    id: 23,
    name: 'completely_different_headers',
    description: 'Schema changed - completely different column names',
    csv: 'ProductTitle,WebLink,Cost,Available,ItemCode\nTest Product,https://example.com/p/1,19.99,Yes,SKU-001',
    // Parser's getValue() doesn't recognize these alternate column names
    // Row parses but with empty required fields, causing validation failure
    expectedError: null,
    expectedProducts: 0,
    expectedErrorCount: 1,
  },
]

// =============================================================================
// REQUIRED FIELD VALIDATION (24-29)
// =============================================================================

export const requiredFieldFixtures: BadDataFixture[] = [
  {
    id: 24,
    name: 'missing_product_name',
    description: 'Empty or null product name',
    csv: `${VALID_HEADER}\n,https://example.com/p/1,19.99,In Stock,SKU-001,https://example.com/i.jpg,Description,Brand,Category`,
    expectedError: null,
    expectedProducts: 0,
    expectedErrorCount: 1,
  },
  {
    id: 25,
    name: 'missing_price',
    description: 'No price value provided',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,,In Stock,SKU-001,https://example.com/i.jpg,Description,Brand,Category`,
    expectedError: null,
    expectedProducts: 0,
    expectedErrorCount: 1,
  },
  {
    id: 26,
    name: 'missing_url',
    description: 'No product URL provided',
    csv: `${VALID_HEADER}\nTest Product,,19.99,In Stock,SKU-001,https://example.com/i.jpg,Description,Brand,Category`,
    expectedError: null,
    expectedProducts: 0,
    expectedErrorCount: 1,
  },
  {
    id: 27,
    name: 'missing_all_identifiers',
    description: 'No SKU, UPC, or Item ID - will use URL hash fallback',
    csv: `Name,URL,Price,StockAvailability\nTest Product,https://example.com/p/1,19.99,In Stock`,
    expectedError: null,
    expectedProducts: 1, // Should succeed with URL hash fallback
  },
  {
    id: 28,
    name: 'all_required_fields_missing',
    description: 'Row with all empty values',
    csv: `${VALID_HEADER}\n,,,,,,,,`,
    expectedError: null,
    expectedProducts: 0,
    expectedErrorCount: 1,
  },
  {
    id: 29,
    name: 'whitespace_only_required_fields',
    description: 'Required fields contain only spaces',
    csv: `${VALID_HEADER}\n   ,   ,   ,In Stock,SKU-001,,,Brand,Category`,
    expectedError: null,
    expectedProducts: 0,
    expectedErrorCount: 1,
  },
]

// =============================================================================
// PRICE FIELD ISSUES (30-41)
// =============================================================================

export const priceFieldFixtures: BadDataFixture[] = [
  {
    id: 30,
    name: 'negative_price',
    description: 'Price value is negative',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,-19.99,In Stock,SKU-001,https://example.com/i.jpg,Description,Brand,Category`,
    expectedError: null,
    expectedProducts: 0,
    expectedErrorCount: 1,
  },
  {
    id: 31,
    name: 'zero_price',
    description: 'Price is exactly $0.00',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,0,In Stock,SKU-001,https://example.com/i.jpg,Description,Brand,Category`,
    expectedError: null,
    expectedProducts: 0,
    expectedErrorCount: 1,
  },
  {
    id: 32,
    name: 'price_with_currency_symbol',
    description: 'Price includes dollar sign: "$19.99"',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,$19.99,In Stock,SKU-001,https://example.com/i.jpg,Description,Brand,Category`,
    expectedError: null,
    expectedProducts: 1, // Parser should strip currency symbol
  },
  {
    id: 33,
    name: 'price_with_thousand_separator',
    description: 'Price with comma separator: "1,299.99"',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,"1,299.99",In Stock,SKU-001,https://example.com/i.jpg,Description,Brand,Category`,
    expectedError: null,
    expectedProducts: 1, // Parser should handle
  },
  {
    id: 34,
    name: 'european_decimal_format',
    description: 'European format: "19,99" instead of "19.99"',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,"19,99",In Stock,SKU-001,https://example.com/i.jpg,Description,Brand,Category`,
    // normalizePrice strips non-numeric except . and -, so "19,99" becomes "1999" = $1999.00
    expectedError: null,
    expectedProducts: 1,
  },
  {
    id: 35,
    name: 'price_as_text',
    description: 'Non-numeric price: "call for price"',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,call for price,In Stock,SKU-001,https://example.com/i.jpg,Description,Brand,Category`,
    expectedError: null,
    expectedProducts: 0,
    expectedErrorCount: 1,
  },
  {
    id: 36,
    name: 'price_with_extra_text',
    description: 'Price with text: "19.99 per box"',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,19.99 per box,In Stock,SKU-001,https://example.com/i.jpg,Description,Brand,Category`,
    expectedError: null,
    expectedProducts: 1, // Parser extracts numeric portion
  },
  {
    id: 37,
    name: 'extreme_high_price',
    description: 'Unrealistically high price: $999,999.99',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,999999.99,In Stock,SKU-001,https://example.com/i.jpg,Description,Brand,Category`,
    expectedError: null,
    expectedProducts: 1, // Parses but should flag for review
  },
  {
    id: 38,
    name: 'extreme_low_price',
    description: 'Unrealistically low price: $0.001',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,0.001,In Stock,SKU-001,https://example.com/i.jpg,Description,Brand,Category`,
    // normalizePrice rounds to 2 decimals: 0.001 -> 0.00, which fails price > 0 validation
    expectedError: null,
    expectedProducts: 0,
    expectedErrorCount: 1,
  },
  {
    id: 39,
    name: 'price_excessive_decimals',
    description: 'Too many decimal places: "19.999"',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,19.999,In Stock,SKU-001,https://example.com/i.jpg,Description,Brand,Category`,
    expectedError: null,
    expectedProducts: 1, // Should round to 20.00
  },
  {
    id: 40,
    name: 'multiple_prices_in_field',
    description: 'Price range: "19.99/29.99"',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,19.99/29.99,In Stock,SKU-001,https://example.com/i.jpg,Description,Brand,Category`,
    expectedError: null,
    expectedProducts: 1, // Parser takes first numeric value
  },
  {
    id: 41,
    name: 'scientific_notation',
    description: 'Price in scientific notation: "1.99E1"',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,1.99E1,In Stock,SKU-001,https://example.com/i.jpg,Description,Brand,Category`,
    expectedError: null,
    expectedProducts: 1, // parseFloat handles this = 19.9
  },
]

// =============================================================================
// URL FIELD ISSUES (42-52)
// =============================================================================

export const urlFieldFixtures: BadDataFixture[] = [
  {
    id: 42,
    name: 'invalid_url_format',
    description: 'Not a valid URL structure',
    csv: `${VALID_HEADER}\nTest Product,not-a-url,19.99,In Stock,SKU-001,https://example.com/i.jpg,Description,Brand,Category`,
    // normalizeProductUrl prepends https:// making it "https://not-a-url"
    // Stricter URL validation rejects URLs without a dot in hostname
    expectedError: null,
    expectedProducts: 0, // Invalid URL rejected by stricter validation
    expectedErrorCount: 1,
  },
  {
    id: 43,
    name: 'relative_url',
    description: 'Relative URL without domain: "/products/123"',
    csv: `${VALID_HEADER}\nTest Product,/products/123,19.99,In Stock,SKU-001,https://example.com/i.jpg,Description,Brand,Category`,
    // normalizeProductUrl prepends https:// making it "https:///products/123"
    // Stricter URL validation rejects URLs with empty hostname
    expectedError: null,
    expectedProducts: 0, // Empty hostname rejected by stricter validation
    expectedErrorCount: 1,
  },
  {
    id: 44,
    name: 'url_with_spaces',
    description: 'URL contains unencoded spaces',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/product with spaces,19.99,In Stock,SKU-001,https://example.com/i.jpg,Description,Brand,Category`,
    // new URL() in Node accepts URLs with spaces (encodes them to %20)
    expectedError: null,
    expectedProducts: 1, // URL parses successfully (spaces get encoded)
  },
  {
    id: 45,
    name: 'url_with_special_chars',
    description: 'URL with unencoded special characters',
    csv: `${VALID_HEADER}\nTest Product,"https://example.com/search?q=ammo&size=9mm",19.99,In Stock,SKU-001,https://example.com/i.jpg,Description,Brand,Category`,
    expectedError: null,
    expectedProducts: 1, // Valid URL with query params
  },
  {
    id: 46,
    name: 'http_instead_of_https',
    description: 'Insecure HTTP URL',
    csv: `${VALID_HEADER}\nTest Product,http://example.com/p/1,19.99,In Stock,SKU-001,https://example.com/i.jpg,Description,Brand,Category`,
    expectedError: null,
    expectedProducts: 1, // HTTP is valid, just not preferred
  },
  {
    id: 47,
    name: 'url_wrong_domain',
    description: 'URL domain does not match retailer',
    csv: `${VALID_HEADER}\nTest Product,https://competitor.com/p/1,19.99,In Stock,SKU-001,https://example.com/i.jpg,Description,Brand,Category`,
    expectedError: null,
    expectedProducts: 1, // Parser accepts, processor should validate
    setup: 'Processor should verify URL domain matches retailer',
  },
  {
    id: 48,
    name: 'url_with_embedded_tracking',
    description: 'URL already has affiliate tracking params',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1?irclickid=abc123&utm_source=impact,19.99,In Stock,SKU-001,https://example.com/i.jpg,Description,Brand,Category`,
    expectedError: null,
    expectedProducts: 1, // Parser strips tracking params for identity
  },
  {
    id: 49,
    name: 'url_404_page',
    description: 'Product page no longer exists (needs runtime check)',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/deleted-product,19.99,In Stock,SKU-001,https://example.com/i.jpg,Description,Brand,Category`,
    expectedError: null,
    expectedProducts: 1, // Parser accepts, validation is external
    setup: 'Runtime URL validation would catch this',
  },
  {
    id: 50,
    name: 'url_to_category_page',
    description: 'URL points to category not product',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/category/ammunition,19.99,In Stock,SKU-001,https://example.com/i.jpg,Description,Brand,Category`,
    expectedError: null,
    expectedProducts: 1, // Parser accepts, semantics unknown
  },
  {
    id: 51,
    name: 'localhost_url',
    description: 'Internal/localhost URL',
    csv: `${VALID_HEADER}\nTest Product,http://localhost:3000/product/123,19.99,In Stock,SKU-001,https://example.com/i.jpg,Description,Brand,Category`,
    // Stricter URL validation rejects localhost/internal URLs
    expectedError: null,
    expectedProducts: 0, // Localhost URL rejected by stricter validation
    expectedErrorCount: 1,
  },
  {
    id: 52,
    name: 'url_with_credentials',
    description: 'URL containing embedded credentials',
    csv: `${VALID_HEADER}\nTest Product,https://user:pass@example.com/p/1,19.99,In Stock,SKU-001,https://example.com/i.jpg,Description,Brand,Category`,
    expectedError: null,
    expectedProducts: 1, // Valid URL format, security concern
  },
]

// =============================================================================
// QUANTITY/AVAILABILITY ISSUES (53-56)
// =============================================================================

export const availabilityFixtures: BadDataFixture[] = [
  {
    id: 53,
    name: 'negative_quantity',
    description: 'Stock count is negative',
    csv: `Name,URL,Price,StockAvailability,Quantity,SKU\nTest Product,https://example.com/p/1,19.99,In Stock,-5,SKU-001`,
    expectedError: null,
    expectedProducts: 1, // Quantity field not used for validation
  },
  {
    id: 54,
    name: 'non_numeric_quantity',
    description: 'Quantity as text: "in stock"',
    csv: `Name,URL,Price,StockAvailability,Quantity,SKU\nTest Product,https://example.com/p/1,19.99,In Stock,plenty,SKU-001`,
    expectedError: null,
    expectedProducts: 1,
  },
  {
    id: 55,
    name: 'quantity_availability_mismatch',
    description: 'qty=100 but availability="out of stock"',
    csv: `Name,URL,Price,StockAvailability,Quantity,SKU\nTest Product,https://example.com/p/1,19.99,Out of Stock,100,SKU-001`,
    expectedError: null,
    expectedProducts: 1, // Parser uses StockAvailability field
  },
  {
    id: 56,
    name: 'extreme_quantity',
    description: 'Unrealistically high stock: 999999999',
    csv: `Name,URL,Price,StockAvailability,Quantity,SKU\nTest Product,https://example.com/p/1,19.99,In Stock,999999999,SKU-001`,
    expectedError: null,
    expectedProducts: 1,
  },
]

// =============================================================================
// PRODUCT IDENTIFIER ISSUES (57-64)
// =============================================================================

export const identifierFixtures: BadDataFixture[] = [
  {
    id: 57,
    name: 'duplicate_skus_same_file',
    description: 'Same SKU appears multiple times in file',
    csv: `${VALID_HEADER}
Test Product 1,https://example.com/p/1,19.99,In Stock,DUPE-SKU,https://example.com/i.jpg,Description,Brand,Category
Test Product 2,https://example.com/p/2,29.99,In Stock,DUPE-SKU,https://example.com/i.jpg,Description,Brand,Category`,
    expectedError: null,
    expectedProducts: 2, // Both parse, processor handles deduplication
  },
  {
    id: 58,
    name: 'sku_format_changed',
    description: 'SKU format inconsistent: "ABC-123" vs "ABC123"',
    csv: `${VALID_HEADER}
Test Product 1,https://example.com/p/1,19.99,In Stock,ABC-123,https://example.com/i.jpg,Description,Brand,Category
Test Product 2,https://example.com/p/2,29.99,In Stock,ABC123,https://example.com/i.jpg,Description,Brand,Category`,
    expectedError: null,
    expectedProducts: 2, // Normalization should handle
  },
  {
    id: 59,
    name: 'sku_with_special_chars',
    description: 'SKU contains tabs, newlines, or control chars',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,19.99,In Stock,"SKU\t001",https://example.com/i.jpg,Description,Brand,Category`,
    expectedError: null,
    expectedProducts: 1, // Normalization strips special chars
  },
  {
    id: 60,
    name: 'extremely_long_sku',
    description: 'SKU over 500 characters',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,19.99,In Stock,${'A'.repeat(501)},https://example.com/i.jpg,Description,Brand,Category`,
    expectedError: null,
    expectedProducts: 1, // Should truncate or reject
  },
  {
    id: 61,
    name: 'empty_string_vs_null_sku',
    description: 'SKU is empty string vs missing',
    csv: `${VALID_HEADER}\nTest Product 1,https://example.com/p/1,19.99,In Stock,,https://example.com/i.jpg,Description,Brand,Category`,
    expectedError: null,
    expectedProducts: 1, // Falls back to URL hash
  },
  {
    id: 62,
    name: 'whitespace_only_sku',
    description: 'SKU contains only whitespace',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,19.99,In Stock,   ,https://example.com/i.jpg,Description,Brand,Category`,
    expectedError: null,
    expectedProducts: 1, // Treated as empty after trim
  },
  {
    id: 63,
    name: 'invalid_upc_checksum',
    description: 'UPC barcode fails checksum validation',
    csv: `Name,URL,Price,StockAvailability,SKU,GTIN\nTest Product,https://example.com/p/1,19.99,In Stock,SKU-001,123456789012`,
    expectedError: null,
    expectedProducts: 1, // UPC not validated for checksum in v1
  },
  {
    id: 64,
    name: 'upc_wrong_length',
    description: 'UPC has wrong digit count (11 instead of 12)',
    csv: `Name,URL,Price,StockAvailability,SKU,GTIN\nTest Product,https://example.com/p/1,19.99,In Stock,SKU-001,12345678901`,
    expectedError: null,
    expectedProducts: 1, // UPC normalizer accepts various lengths
  },
]

// =============================================================================
// CATEGORY/CLASSIFICATION ISSUES (65-68)
// =============================================================================

export const categoryFixtures: BadDataFixture[] = [
  {
    id: 65,
    name: 'unknown_category',
    description: 'Category does not map to our taxonomy',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,19.99,In Stock,SKU-001,https://example.com/i.jpg,Description,Brand,Unknown Category XYZ`,
    expectedError: null,
    expectedProducts: 1, // Category stored as-is
  },
  {
    id: 66,
    name: 'malformed_category_hierarchy',
    description: 'Category hierarchy has empty level: "Ammo > > Rifle"',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,19.99,In Stock,SKU-001,https://example.com/i.jpg,Description,Brand,"Ammo > > Rifle"`,
    expectedError: null,
    expectedProducts: 1,
  },
  {
    id: 67,
    name: 'category_as_id',
    description: 'Category is numeric ID instead of name',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,19.99,In Stock,SKU-001,https://example.com/i.jpg,Description,Brand,12345`,
    expectedError: null,
    expectedProducts: 1,
  },
  {
    id: 68,
    name: 'inconsistent_categorization',
    description: 'Same product in different categories',
    csv: `${VALID_HEADER}
9mm Ammo,https://example.com/p/1,19.99,In Stock,SKU-001,https://example.com/i.jpg,Description,Brand,Rifle Ammo
9mm Ammo,https://example.com/p/1,19.99,In Stock,SKU-001,https://example.com/i.jpg,Description,Brand,Handgun Ammo`,
    expectedError: null,
    expectedProducts: 2, // Both rows parse
  },
]

// =============================================================================
// IMAGE URL ISSUES (69-74)
// =============================================================================

export const imageUrlFixtures: BadDataFixture[] = [
  {
    id: 69,
    name: 'image_url_404',
    description: 'Image URL returns 404 (runtime check)',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,19.99,In Stock,SKU-001,https://example.com/deleted-image.jpg,Description,Brand,Category`,
    expectedError: null,
    expectedProducts: 1,
    setup: 'Runtime image validation would catch this',
  },
  {
    id: 70,
    name: 'image_url_returns_html',
    description: 'Image URL returns HTML page instead of image',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,19.99,In Stock,SKU-001,https://example.com/login-required,Description,Brand,Category`,
    expectedError: null,
    expectedProducts: 1,
  },
  {
    id: 71,
    name: 'placeholder_image',
    description: 'Image URL is generic placeholder',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,19.99,In Stock,SKU-001,https://example.com/no-image.png,Description,Brand,Category`,
    expectedError: null,
    expectedProducts: 1,
  },
  {
    id: 72,
    name: 'extremely_large_image',
    description: 'Image dimensions unreasonably large',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,19.99,In Stock,SKU-001,https://example.com/giant-10000x10000.jpg,Description,Brand,Category`,
    expectedError: null,
    expectedProducts: 1,
  },
  {
    id: 73,
    name: 'wrong_image_format',
    description: 'Unexpected image format (.webp)',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,19.99,In Stock,SKU-001,https://example.com/image.webp,Description,Brand,Category`,
    expectedError: null,
    expectedProducts: 1,
  },
  {
    id: 74,
    name: 'data_uri_image',
    description: 'Base64 data URI instead of URL',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,19.99,In Stock,SKU-001,data:image/png;base64abc123,Description,Brand,Category`,
    expectedError: null,
    expectedProducts: 1, // Stored as-is
  },
]

// =============================================================================
// DESCRIPTION/TEXT FIELD ISSUES (75-84)
// =============================================================================

export const textFieldFixtures: BadDataFixture[] = [
  {
    id: 75,
    name: 'html_in_text_field',
    description: 'HTML tags in description',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,19.99,In Stock,SKU-001,https://example.com/i.jpg,"<p>Product <b>description</b></p>",Brand,Category`,
    expectedError: null,
    expectedProducts: 1,
  },
  {
    id: 76,
    name: 'encoded_html_entities',
    description: 'HTML entities not decoded',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,19.99,In Stock,SKU-001,https://example.com/i.jpg,"9mm &amp; .45 ACP &lt;available&gt;",Brand,Category`,
    expectedError: null,
    expectedProducts: 1,
  },
  {
    id: 77,
    name: 'script_injection',
    description: 'XSS attempt in description',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,19.99,In Stock,SKU-001,https://example.com/i.jpg,"<script>alert('xss')</script>",Brand,Category`,
    expectedError: null,
    expectedProducts: 1, // Stored as-is, sanitized on display
  },
  {
    id: 78,
    name: 'sql_injection_pattern',
    description: 'SQL injection attempt',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,19.99,In Stock,SKU-001,https://example.com/i.jpg,"'; DROP TABLE products;--",Brand,Category`,
    expectedError: null,
    expectedProducts: 1, // Parameterized queries prevent injection
  },
  {
    id: 79,
    name: 'extremely_long_description',
    description: 'Description over 100KB',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,19.99,In Stock,SKU-001,https://example.com/i.jpg,"${'A'.repeat(102400)}",Brand,Category`,
    expectedError: null,
    expectedProducts: 1, // Should truncate
  },
  {
    id: 80,
    name: 'non_printable_characters',
    description: 'Control characters in text',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,19.99,In Stock,SKU-001,https://example.com/i.jpg,"Description\x00\x01\x02with control chars",Brand,Category`,
    expectedError: null,
    expectedProducts: 1, // Should strip
  },
  {
    id: 81,
    name: 'emoji_in_text',
    description: 'Emoji causing encoding issues',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,19.99,In Stock,SKU-001,https://example.com/i.jpg,"Great ammo! 🔫💥",Brand,Category`,
    expectedError: null,
    expectedProducts: 1,
  },
  {
    id: 82,
    name: 'all_caps_text',
    description: 'All caps description',
    csv: `${VALID_HEADER}\nTEST PRODUCT ALL CAPS,https://example.com/p/1,19.99,In Stock,SKU-001,https://example.com/i.jpg,"THIS IS A GREAT PRODUCT!!!",BRAND,CATEGORY`,
    expectedError: null,
    expectedProducts: 1,
  },
  {
    id: 83,
    name: 'placeholder_text',
    description: 'Lorem ipsum placeholder',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,19.99,In Stock,SKU-001,https://example.com/i.jpg,"Lorem ipsum dolor sit amet",Brand,Category`,
    expectedError: null,
    expectedProducts: 1,
  },
  {
    id: 84,
    name: 'description_is_title',
    description: 'Description just repeats the title',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,19.99,In Stock,SKU-001,https://example.com/i.jpg,Test Product,Brand,Category`,
    expectedError: null,
    expectedProducts: 1,
  },
]

// =============================================================================
// DATE/TIME ISSUES (85-90)
// =============================================================================

export const dateTimeFixtures: BadDataFixture[] = [
  {
    id: 85,
    name: 'invalid_date_format',
    description: 'Invalid date: "13/25/2024"',
    csv: `Name,URL,Price,StockAvailability,SKU,LastUpdated\nTest Product,https://example.com/p/1,19.99,In Stock,SKU-001,13/25/2024`,
    expectedError: null,
    expectedProducts: 1, // Date field optional
  },
  {
    id: 86,
    name: 'ambiguous_date_format',
    description: 'Ambiguous date: "01/02/2024" (Jan 2 or Feb 1?)',
    csv: `Name,URL,Price,StockAvailability,SKU,LastUpdated\nTest Product,https://example.com/p/1,19.99,In Stock,SKU-001,01/02/2024`,
    expectedError: null,
    expectedProducts: 1,
  },
  {
    id: 87,
    name: 'future_date',
    description: 'Date far in future: year 2099',
    csv: `Name,URL,Price,StockAvailability,SKU,LastUpdated\nTest Product,https://example.com/p/1,19.99,In Stock,SKU-001,2099-12-31`,
    expectedError: null,
    expectedProducts: 1,
  },
  {
    id: 88,
    name: 'epoch_date',
    description: 'Unix epoch default: 1970-01-01',
    csv: `Name,URL,Price,StockAvailability,SKU,LastUpdated\nTest Product,https://example.com/p/1,19.99,In Stock,SKU-001,1970-01-01`,
    expectedError: null,
    expectedProducts: 1,
  },
  {
    id: 89,
    name: 'timezone_inconsistency',
    description: 'Mix of timezone formats',
    csv: `Name,URL,Price,StockAvailability,SKU,LastUpdated\nProduct 1,https://example.com/p/1,19.99,In Stock,SKU-001,2024-01-15T10:00:00Z
Product 2,https://example.com/p/2,29.99,In Stock,SKU-002,2024-01-15T10:00:00-05:00`,
    expectedError: null,
    expectedProducts: 2,
  },
  {
    id: 90,
    name: 'unix_timestamp_vs_string',
    description: 'Date as Unix timestamp instead of string',
    csv: `Name,URL,Price,StockAvailability,SKU,LastUpdated\nTest Product,https://example.com/p/1,19.99,In Stock,SKU-001,1704067200`,
    expectedError: null,
    expectedProducts: 1,
  },
]

// =============================================================================
// BRAND/MANUFACTURER ISSUES (91-95)
// =============================================================================

export const brandFixtures: BadDataFixture[] = [
  {
    id: 91,
    name: 'inconsistent_brand_naming',
    description: 'Same brand, different formats',
    csv: `${VALID_HEADER}
Product 1,https://example.com/p/1,19.99,In Stock,SKU-001,https://example.com/i.jpg,Description,Federal,Category
Product 2,https://example.com/p/2,29.99,In Stock,SKU-002,https://example.com/i.jpg,Description,Federal Premium,Category
Product 3,https://example.com/p/3,39.99,In Stock,SKU-003,https://example.com/i.jpg,Description,FEDERAL,Category`,
    expectedError: null,
    expectedProducts: 3,
  },
  {
    id: 92,
    name: 'brand_misspelling',
    description: 'Common brand misspelled',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,19.99,In Stock,SKU-001,https://example.com/i.jpg,Description,Horandy,Category`,
    expectedError: null,
    expectedProducts: 1, // Stored as-is
  },
  {
    id: 93,
    name: 'brand_in_wrong_field',
    description: 'Brand name embedded in title instead of brand field',
    csv: `${VALID_HEADER}\nFederal 9mm Ammo,https://example.com/p/1,19.99,In Stock,SKU-001,https://example.com/i.jpg,Description,,Category`,
    expectedError: null,
    expectedProducts: 1,
  },
  {
    id: 94,
    name: 'unknown_brand',
    description: 'Brand not in known list',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,19.99,In Stock,SKU-001,https://example.com/i.jpg,Description,Unknown Brand XYZ,Category`,
    expectedError: null,
    expectedProducts: 1,
  },
  {
    id: 95,
    name: 'placeholder_brand',
    description: 'Brand is "N/A" or "Generic"',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,19.99,In Stock,SKU-001,https://example.com/i.jpg,Description,N/A,Category`,
    expectedError: null,
    expectedProducts: 1,
  },
]

// =============================================================================
// AMMUNITION-SPECIFIC ISSUES (96-104)
// =============================================================================

export const ammoSpecificFixtures: BadDataFixture[] = [
  {
    id: 96,
    name: 'invalid_caliber_format',
    description: 'Inconsistent caliber formats',
    csv: `${VALID_HEADER}
9mm Ammo,https://example.com/p/1,19.99,In Stock,SKU-001,https://example.com/i.jpg,"9 mm ammo",Brand,9mm
9mm Ammo,https://example.com/p/2,19.99,In Stock,SKU-002,https://example.com/i.jpg,".9mm ammo",Brand,.9mm`,
    expectedError: null,
    expectedProducts: 2,
  },
  {
    id: 97,
    name: 'caliber_category_mismatch',
    description: '9mm in Rifle Ammo category',
    csv: `${VALID_HEADER}\n9mm Ammo,https://example.com/p/1,19.99,In Stock,SKU-001,https://example.com/i.jpg,Description,Brand,Rifle Ammo`,
    expectedError: null,
    expectedProducts: 1,
  },
  {
    id: 98,
    name: 'invalid_grain_weight',
    description: 'Negative or zero grain weight',
    csv: `Name,URL,Price,StockAvailability,SKU,GrainWeight\nTest Product,https://example.com/p/1,19.99,In Stock,SKU-001,-115`,
    expectedError: null,
    expectedProducts: 1,
  },
  {
    id: 99,
    name: 'round_count_price_mismatch',
    description: '$500 for 20 rounds of 9mm (unrealistic)',
    csv: `Name,URL,Price,StockAvailability,SKU,RoundCount\n9mm Ammo 20rd Box,https://example.com/p/1,500.00,In Stock,SKU-001,20`,
    expectedError: null,
    expectedProducts: 1, // Parser accepts, business logic validation needed
  },
  {
    id: 100,
    name: 'inconsistent_units',
    description: 'Mix of rounds, boxes, cases in same feed',
    csv: `Name,URL,Price,StockAvailability,SKU,UnitType
9mm 50rd Box,https://example.com/p/1,19.99,In Stock,SKU-001,box
9mm 500rd Case,https://example.com/p/2,199.99,In Stock,SKU-002,case
9mm Single Round,https://example.com/p/3,0.50,In Stock,SKU-003,round`,
    expectedError: null,
    expectedProducts: 3,
  },
  {
    id: 101,
    name: 'invalid_primer_type',
    description: 'Unknown primer designation',
    csv: `Name,URL,Price,StockAvailability,SKU,PrimerType\nTest Product,https://example.com/p/1,19.99,In Stock,SKU-001,UNKNOWN_PRIMER`,
    expectedError: null,
    expectedProducts: 1,
  },
  {
    id: 102,
    name: 'unknown_bullet_type',
    description: 'Unrecognized bullet type code',
    csv: `Name,URL,Price,StockAvailability,SKU,BulletType\nTest Product,https://example.com/p/1,19.99,In Stock,SKU-001,XYZ123`,
    expectedError: null,
    expectedProducts: 1,
  },
  {
    id: 103,
    name: 'unrealistic_muzzle_velocity',
    description: 'Muzzle velocity of 50,000 fps',
    csv: `Name,URL,Price,StockAvailability,SKU,MuzzleVelocity\nTest Product,https://example.com/p/1,19.99,In Stock,SKU-001,50000`,
    expectedError: null,
    expectedProducts: 1,
  },
  {
    id: 104,
    name: 'invalid_case_material',
    description: 'Unknown case material type',
    csv: `Name,URL,Price,StockAvailability,SKU,CaseMaterial\nTest Product,https://example.com/p/1,19.99,In Stock,SKU-001,Unobtanium`,
    expectedError: null,
    expectedProducts: 1,
  },
]

// =============================================================================
// BUSINESS LOGIC ISSUES (105-111)
// =============================================================================

export const businessLogicFixtures: BadDataFixture[] = [
  {
    id: 105,
    name: 'in_stock_zero_price',
    description: 'Product in stock but price is $0',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,0,In Stock,SKU-001,https://example.com/i.jpg,Description,Brand,Category`,
    expectedError: null,
    expectedProducts: 0, // Zero price fails validation
    expectedErrorCount: 1,
  },
  {
    id: 106,
    name: 'discontinued_product',
    description: 'Discontinued product still in feed',
    csv: `${VALID_HEADER}\nDiscontinued Product,https://example.com/p/1,19.99,Discontinued,SKU-001,https://example.com/i.jpg,Description,Brand,Category`,
    expectedError: null,
    expectedProducts: 1, // inStock will be false
  },
  {
    id: 107,
    name: 'non_ammunition_product',
    description: 'Non-ammo product in ammunition feed',
    csv: `${VALID_HEADER}\nGun Cleaning Kit,https://example.com/p/1,29.99,In Stock,SKU-001,https://example.com/i.jpg,Cleaning supplies,Brand,Accessories`,
    expectedError: null,
    expectedProducts: 1, // Parser accepts, filtering is separate
  },
  {
    id: 108,
    name: 'competitor_exclusive',
    description: 'Product that should not be sold by this retailer',
    csv: `${VALID_HEADER}\nExclusive Brand Ammo,https://example.com/p/1,19.99,In Stock,SKU-001,https://example.com/i.jpg,Description,Exclusive Brand,Category`,
    expectedError: null,
    expectedProducts: 1,
    setup: 'Business rules would filter this',
  },
  {
    id: 109,
    name: 'price_below_cost',
    description: 'Price unrealistically low (below likely cost)',
    csv: `${VALID_HEADER}\n1000rd 9mm Case,https://example.com/p/1,0.99,In Stock,SKU-001,https://example.com/i.jpg,Description,Brand,Category`,
    expectedError: null,
    expectedProducts: 1,
  },
  {
    id: 110,
    name: 'original_price_lower_than_current',
    description: 'Original price less than sale price',
    csv: `Name,URL,Price,OriginalPrice,StockAvailability,SKU\nTest Product,https://example.com/p/1,29.99,19.99,In Stock,SKU-001`,
    expectedError: null,
    expectedProducts: 1, // Data quality issue but not parse error
  },
  {
    id: 111,
    name: 'extreme_price_change',
    description: '500% price increase from previous run',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,99.99,In Stock,SKU-001,https://example.com/i.jpg,Description,Brand,Category`,
    expectedError: null,
    expectedProducts: 1,
    setup: 'Previous price was $19.99 - processor should flag',
  },
]

// =============================================================================
// FEED CONSISTENCY ISSUES (112-117)
// =============================================================================

export const feedConsistencyFixtures: BadDataFixture[] = [
  {
    id: 112,
    name: 'products_disappear',
    description: 'Products present yesterday, gone today',
    csv: `${VALID_HEADER}\n${validRow({ sku: 'SKU-002' })}`,
    setup: 'Previous run had SKU-001 and SKU-002, this run only has SKU-002',
    expectedError: null,
    expectedProducts: 1,
  },
  {
    id: 113,
    name: 'products_reappear',
    description: 'Previously removed products return',
    csv: `${VALID_HEADER}\n${validRow({ sku: 'SKU-001' })}\n${validRow({ sku: 'SKU-003' })}`,
    setup: 'SKU-001 was missing last run, now returns. SKU-003 is new.',
    expectedError: null,
    expectedProducts: 2,
  },
  {
    id: 114,
    name: 'mass_product_disappearance',
    description: '90%+ products gone (likely feed error)',
    csv: `${VALID_HEADER}\n${validRow()}`,
    setup: 'Previous run had 1000 products, this run has 100 - circuit breaker should trigger',
    expectedError: null,
    expectedProducts: 1,
  },
  {
    id: 115,
    name: 'schema_changed',
    description: 'New columns added, old columns removed between runs',
    csv: `Name,URL,Price,StockAvailability,SKU,NewColumn\nTest Product,https://example.com/p/1,19.99,In Stock,SKU-001,new_value`,
    setup: 'Previous schema had different columns',
    expectedError: null,
    expectedProducts: 1,
  },
  {
    id: 116,
    name: 'product_count_spike',
    description: '10x more products than previous run',
    csv: () => {
      let csv = VALID_HEADER
      for (let i = 1; i <= 10000; i++) {
        csv += `\nProduct ${i},https://example.com/p/${i},19.99,In Stock,SKU-${i.toString().padStart(5, '0')},https://example.com/i.jpg,Desc,Brand,Category`
      }
      return csv
    },
    setup: 'Previous run had 1000 products',
    expectedError: null,
    expectedProducts: 10000,
  },
  {
    id: 117,
    name: 'all_prices_same',
    description: 'Every product has identical price (likely default)',
    csv: `${VALID_HEADER}
Product 1,https://example.com/p/1,9.99,In Stock,SKU-001,https://example.com/i.jpg,Desc,Brand,Category
Product 2,https://example.com/p/2,9.99,In Stock,SKU-002,https://example.com/i.jpg,Desc,Brand,Category
Product 3,https://example.com/p/3,9.99,In Stock,SKU-003,https://example.com/i.jpg,Desc,Brand,Category`,
    expectedError: null,
    expectedProducts: 3,
    setup: 'Business logic should flag suspicious uniformity',
  },
]

// =============================================================================
// DUPLICATE/CONFLICT DETECTION (118-122)
// =============================================================================

export const duplicateConflictFixtures: BadDataFixture[] = [
  {
    id: 118,
    name: 'same_product_different_prices',
    description: 'Same SKU with different prices in same file',
    csv: `${VALID_HEADER}
Test Product,https://example.com/p/1,19.99,In Stock,SAME-SKU,https://example.com/i.jpg,Desc,Brand,Category
Test Product,https://example.com/p/1,29.99,In Stock,SAME-SKU,https://example.com/i.jpg,Desc,Brand,Category`,
    expectedError: null,
    expectedProducts: 2, // Both parse, processor handles
  },
  {
    id: 119,
    name: 'same_url_different_skus',
    description: 'Same URL mapped to different SKUs',
    csv: `${VALID_HEADER}
Product 1,https://example.com/same-url,19.99,In Stock,SKU-001,https://example.com/i.jpg,Desc,Brand,Category
Product 2,https://example.com/same-url,29.99,In Stock,SKU-002,https://example.com/i.jpg,Desc,Brand,Category`,
    expectedError: null,
    expectedProducts: 2,
  },
  {
    id: 120,
    name: 'same_sku_different_urls',
    description: 'Same SKU points to different URLs',
    csv: `${VALID_HEADER}
Product 1,https://example.com/p/1,19.99,In Stock,SAME-SKU,https://example.com/i.jpg,Desc,Brand,Category
Product 1,https://example.com/p/2,19.99,In Stock,SAME-SKU,https://example.com/i.jpg,Desc,Brand,Category`,
    expectedError: null,
    expectedProducts: 2,
  },
  {
    id: 121,
    name: 'near_duplicate_titles',
    description: 'Titles differ only by whitespace',
    csv: `${VALID_HEADER}
9mm Ammo,https://example.com/p/1,19.99,In Stock,SKU-001,https://example.com/i.jpg,Desc,Brand,Category
9mm Ammo ,https://example.com/p/2,19.99,In Stock,SKU-002,https://example.com/i.jpg,Desc,Brand,Category
9mm  Ammo,https://example.com/p/3,19.99,In Stock,SKU-003,https://example.com/i.jpg,Desc,Brand,Category`,
    expectedError: null,
    expectedProducts: 3, // Normalization should collapse whitespace
  },
  {
    id: 122,
    name: 'case_variant_duplicates',
    description: 'Same SKU in different cases',
    csv: `${VALID_HEADER}
Product 1,https://example.com/p/1,19.99,In Stock,abc-123,https://example.com/i.jpg,Desc,Brand,Category
Product 2,https://example.com/p/2,29.99,In Stock,ABC-123,https://example.com/i.jpg,Desc,Brand,Category`,
    expectedError: null,
    expectedProducts: 2, // SKU normalization should uppercase
  },
]

// =============================================================================
// CHARACTER SET/ENCODING EDGE CASES (123-127)
// =============================================================================

export const encodingEdgeCaseFixtures: BadDataFixture[] = [
  {
    id: 123,
    name: 'null_bytes',
    description: 'NULL bytes in data',
    csv: `${VALID_HEADER}\nTest\x00Product,https://example.com/p/1,19.99,In Stock,SKU-001,https://example.com/i.jpg,Description,Brand,Category`,
    expectedError: null,
    expectedProducts: 1, // Should strip null bytes
  },
  {
    id: 124,
    name: 'surrogate_pairs',
    description: 'Unpaired UTF-16 surrogates',
    csv: `${VALID_HEADER}\nTest Product \uD800,https://example.com/p/1,19.99,In Stock,SKU-001,https://example.com/i.jpg,Description,Brand,Category`,
    expectedError: null,
    expectedProducts: 1,
  },
  {
    id: 125,
    name: 'rtl_text',
    description: 'Right-to-left text (Arabic/Hebrew)',
    csv: `${VALID_HEADER}\nمنتج اختبار,https://example.com/p/1,19.99,In Stock,SKU-001,https://example.com/i.jpg,وصف المنتج,Brand,Category`,
    expectedError: null,
    expectedProducts: 1,
  },
  {
    id: 126,
    name: 'zero_width_characters',
    description: 'Invisible characters in SKU',
    csv: `${VALID_HEADER}\nTest Product,https://example.com/p/1,19.99,In Stock,SKU\u200B001,https://example.com/i.jpg,Description,Brand,Category`,
    expectedError: null,
    expectedProducts: 1, // Zero-width space in SKU
  },
  {
    id: 127,
    name: 'homoglyph_attack',
    description: 'Cyrillic "а" instead of Latin "a"',
    csv: `${VALID_HEADER}\nTest Product,https://exаmple.com/p/1,19.99,In Stock,SKU-001,https://example.com/i.jpg,Description,Brand,Category`,
    expectedError: null,
    expectedProducts: 1, // URL contains Cyrillic 'а'
  },
]

// =============================================================================
// FEED METADATA ISSUES (128-130)
// =============================================================================

export const feedMetadataFixtures: BadDataFixture[] = [
  {
    id: 128,
    name: 'file_unchanged',
    description: 'File has same mtime/hash as previous run',
    csv: `${VALID_HEADER}\n${validRow()}`,
    setup: 'Test at fetcher level - hash comparison happens before parser. Parser just sees normal CSV.',
    expectedError: null,
    expectedProducts: 1, // Parser parses normally - skip logic is in fetcher
  },
  {
    id: 129,
    name: 'file_mtime_future',
    description: 'File modified time is in the future',
    csv: `${VALID_HEADER}\n${validRow()}`,
    setup: 'Server returns mtime of 2099-12-31',
    expectedError: null,
    expectedProducts: 1,
  },
  {
    id: 130,
    name: 'content_hash_collision',
    description: 'Different content produces same hash (theoretical)',
    csv: `${VALID_HEADER}\n${validRow()}`,
    setup: 'Theoretical - SHA256 collision extremely unlikely',
    expectedError: null,
    expectedProducts: 1,
  },
]

// =============================================================================
// COMBINED EXPORT
// =============================================================================

export const allBadDataFixtures: BadDataFixture[] = [
  ...fileLevelFixtures,
  ...csvDelimiterFixtures,
  ...requiredFieldFixtures,
  ...priceFieldFixtures,
  ...urlFieldFixtures,
  ...availabilityFixtures,
  ...identifierFixtures,
  ...categoryFixtures,
  ...imageUrlFixtures,
  ...textFieldFixtures,
  ...dateTimeFixtures,
  ...brandFixtures,
  ...ammoSpecificFixtures,
  ...businessLogicFixtures,
  ...feedConsistencyFixtures,
  ...duplicateConflictFixtures,
  ...encodingEdgeCaseFixtures,
  ...feedMetadataFixtures,
]

// Helper to get fixture by ID
export function getFixtureById(id: number): BadDataFixture | undefined {
  return allBadDataFixtures.find(f => f.id === id)
}

// Helper to get fixtures by category
export function getFixturesByCategory(category: string): BadDataFixture[] {
  const categories: Record<string, BadDataFixture[]> = {
    'file-level': fileLevelFixtures,
    'csv-delimiter': csvDelimiterFixtures,
    'required-field': requiredFieldFixtures,
    'price-field': priceFieldFixtures,
    'url-field': urlFieldFixtures,
    'availability': availabilityFixtures,
    'identifier': identifierFixtures,
    'category': categoryFixtures,
    'image-url': imageUrlFixtures,
    'text-field': textFieldFixtures,
    'date-time': dateTimeFixtures,
    'brand': brandFixtures,
    'ammo-specific': ammoSpecificFixtures,
    'business-logic': businessLogicFixtures,
    'feed-consistency': feedConsistencyFixtures,
    'duplicate-conflict': duplicateConflictFixtures,
    'encoding-edge-case': encodingEdgeCaseFixtures,
    'feed-metadata': feedMetadataFixtures,
  }
  return categories[category] || []
}
