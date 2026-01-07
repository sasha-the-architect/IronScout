/**
 * Bad Data Scenarios - Parser Tests
 *
 * Tests the affiliate feed parser against all 130 bad data scenarios.
 * These tests verify the parser handles malformed, invalid, and edge-case
 * data appropriately - either parsing successfully with normalization,
 * or failing gracefully with appropriate error codes.
 */

import { describe, it, expect } from 'vitest'
import { parseFeed } from '../parser'
import { ERROR_CODES } from '../types'
import {
  allBadDataFixtures,
  fileLevelFixtures,
  csvDelimiterFixtures,
  requiredFieldFixtures,
  priceFieldFixtures,
  urlFieldFixtures,
  availabilityFixtures,
  identifierFixtures,
  categoryFixtures,
  imageUrlFixtures,
  textFieldFixtures,
  dateTimeFixtures,
  brandFixtures,
  ammoSpecificFixtures,
  businessLogicFixtures,
  feedConsistencyFixtures,
  duplicateConflictFixtures,
  encodingEdgeCaseFixtures,
  feedMetadataFixtures,
  type BadDataFixture,
} from './fixtures/bad-data-scenarios'

const MAX_ROWS = 500000 // Default max rows

/**
 * Helper to get CSV content from fixture (handles string, Buffer, or function)
 */
function getCsvContent(fixture: BadDataFixture): string {
  if (typeof fixture.csv === 'function') {
    const result = fixture.csv()
    return typeof result === 'string' ? result : result.toString('utf-8')
  }
  if (Buffer.isBuffer(fixture.csv)) {
    return fixture.csv.toString('utf-8')
  }
  return fixture.csv
}

/**
 * Run a single fixture through the parser and verify expectations
 */
async function runFixture(fixture: BadDataFixture) {
  const content = getCsvContent(fixture)

  // Skip fixtures that require setup at a different level (fetcher, processor)
  if (fixture.setup?.includes('fetcher level') || fixture.setup?.includes('processor')) {
    return { skipped: true, reason: fixture.setup }
  }

  const result = await parseFeed(content, 'CSV', MAX_ROWS)

  return {
    skipped: false,
    result,
    fixture,
  }
}

// =============================================================================
// FILE-LEVEL ISSUES (1-12)
// =============================================================================

describe('File-Level Issues', () => {
  describe.each(fileLevelFixtures)('$id: $name', (fixture) => {
    it(fixture.description, async () => {
      const { skipped, reason, result } = await runFixture(fixture)

      if (skipped) {
        console.log(`  ⏭️  Skipped: ${reason}`)
        return
      }

      // After skipped check, result is guaranteed to be defined
      if (!result) throw new Error('Result should be defined when not skipped')

      if (fixture.expectedError) {
        expect(result.errors.length).toBeGreaterThan(0)
        if (fixture.expectedError !== ERROR_CODES.PARSE_FAILED) {
          // Check for specific error code
          expect(result.errors.some(e => e.code === fixture.expectedError)).toBe(true)
        }
      }

      if (fixture.expectedProducts !== undefined) {
        expect(result.products.length).toBe(fixture.expectedProducts)
      }

      if (fixture.expectedErrorCount !== undefined) {
        expect(result.errors.length).toBe(fixture.expectedErrorCount)
      }
    })
  })
})

// =============================================================================
// CSV/DELIMITER ISSUES (13-23)
// =============================================================================

describe('CSV/Delimiter Issues', () => {
  describe.each(csvDelimiterFixtures)('$id: $name', (fixture) => {
    it(fixture.description, async () => {
      const { skipped, reason, result } = await runFixture(fixture)

      if (skipped) {
        console.log(`  ⏭️  Skipped: ${reason}`)
        return
      }

      if (!result) throw new Error('Result should be defined when not skipped')

      if (fixture.expectedProducts !== undefined) {
        expect(result.products.length).toBe(fixture.expectedProducts)
      }

      if (fixture.expectedError) {
        expect(result.errors.length).toBeGreaterThan(0)
      }
    })
  })
})

// =============================================================================
// REQUIRED FIELD VALIDATION (24-29)
// =============================================================================

describe('Required Field Validation', () => {
  describe.each(requiredFieldFixtures)('$id: $name', (fixture) => {
    it(fixture.description, async () => {
      const { skipped, result } = await runFixture(fixture)
      if (skipped || !result) return

      if (fixture.expectedProducts !== undefined) {
        expect(result.products.length).toBe(fixture.expectedProducts)
      }

      if (fixture.expectedErrorCount !== undefined) {
        expect(result.errors.length).toBeGreaterThanOrEqual(fixture.expectedErrorCount)
      }
    })
  })
})

// =============================================================================
// PRICE FIELD ISSUES (30-41)
// =============================================================================

describe('Price Field Issues', () => {
  describe.each(priceFieldFixtures)('$id: $name', (fixture) => {
    it(fixture.description, async () => {
      const { skipped, result } = await runFixture(fixture)
      if (skipped || !result) return

      if (fixture.expectedProducts !== undefined) {
        expect(result.products.length).toBe(fixture.expectedProducts)
      }

      // For valid parses, check price normalization
      if (result.products.length > 0) {
        result.products.forEach(product => {
          expect(typeof product.price).toBe('number')
          // Price should be non-negative after normalization
          expect(product.price).toBeGreaterThanOrEqual(0)
        })
      }
    })
  })
})

// =============================================================================
// URL FIELD ISSUES (42-52)
// =============================================================================

describe('URL Field Issues', () => {
  describe.each(urlFieldFixtures)('$id: $name', (fixture) => {
    it(fixture.description, async () => {
      const { skipped, result } = await runFixture(fixture)
      if (skipped || !result) return

      if (fixture.expectedProducts !== undefined) {
        expect(result.products.length).toBe(fixture.expectedProducts)
      }

      // For valid parses, check URL format
      if (result.products.length > 0) {
        result.products.forEach(product => {
          expect(product.url).toBeTruthy()
          // URL should start with http:// or https://
          expect(product.url.match(/^https?:\/\//)).toBeTruthy()
        })
      }
    })
  })
})

// =============================================================================
// QUANTITY/AVAILABILITY ISSUES (53-56)
// =============================================================================

describe('Quantity/Availability Issues', () => {
  describe.each(availabilityFixtures)('$id: $name', (fixture) => {
    it(fixture.description, async () => {
      const { skipped, result } = await runFixture(fixture)
      if (skipped || !result) return

      if (fixture.expectedProducts !== undefined) {
        expect(result.products.length).toBe(fixture.expectedProducts)
      }

      // Check inStock is boolean
      result.products.forEach(product => {
        expect(typeof product.inStock).toBe('boolean')
      })
    })
  })
})

// =============================================================================
// PRODUCT IDENTIFIER ISSUES (57-64)
// =============================================================================

describe('Product Identifier Issues', () => {
  describe.each(identifierFixtures)('$id: $name', (fixture) => {
    it(fixture.description, async () => {
      const { skipped, result } = await runFixture(fixture)
      if (skipped || !result) return

      if (fixture.expectedProducts !== undefined) {
        expect(result.products.length).toBe(fixture.expectedProducts)
      }
    })
  })
})

// =============================================================================
// CATEGORY/CLASSIFICATION ISSUES (65-68)
// =============================================================================

describe('Category/Classification Issues', () => {
  describe.each(categoryFixtures)('$id: $name', (fixture) => {
    it(fixture.description, async () => {
      const { skipped, result } = await runFixture(fixture)
      if (skipped || !result) return

      if (fixture.expectedProducts !== undefined) {
        expect(result.products.length).toBe(fixture.expectedProducts)
      }
    })
  })
})

// =============================================================================
// IMAGE URL ISSUES (69-74)
// =============================================================================

describe('Image URL Issues', () => {
  describe.each(imageUrlFixtures)('$id: $name', (fixture) => {
    it(fixture.description, async () => {
      const { skipped, result } = await runFixture(fixture)
      if (skipped || !result) return

      if (fixture.expectedProducts !== undefined) {
        expect(result.products.length).toBe(fixture.expectedProducts)
      }
    })
  })
})

// =============================================================================
// DESCRIPTION/TEXT FIELD ISSUES (75-84)
// =============================================================================

describe('Text Field Issues', () => {
  describe.each(textFieldFixtures)('$id: $name', (fixture) => {
    it(fixture.description, async () => {
      const { skipped, result } = await runFixture(fixture)
      if (skipped || !result) return

      if (fixture.expectedProducts !== undefined) {
        expect(result.products.length).toBe(fixture.expectedProducts)
      }
    })
  })
})

// =============================================================================
// DATE/TIME ISSUES (85-90)
// =============================================================================

describe('Date/Time Issues', () => {
  describe.each(dateTimeFixtures)('$id: $name', (fixture) => {
    it(fixture.description, async () => {
      const { skipped, result } = await runFixture(fixture)
      if (skipped || !result) return

      if (fixture.expectedProducts !== undefined) {
        expect(result.products.length).toBe(fixture.expectedProducts)
      }
    })
  })
})

// =============================================================================
// BRAND/MANUFACTURER ISSUES (91-95)
// =============================================================================

describe('Brand/Manufacturer Issues', () => {
  describe.each(brandFixtures)('$id: $name', (fixture) => {
    it(fixture.description, async () => {
      const { skipped, result } = await runFixture(fixture)
      if (skipped || !result) return

      if (fixture.expectedProducts !== undefined) {
        expect(result.products.length).toBe(fixture.expectedProducts)
      }
    })
  })
})

// =============================================================================
// AMMUNITION-SPECIFIC ISSUES (96-104)
// =============================================================================

describe('Ammunition-Specific Issues', () => {
  describe.each(ammoSpecificFixtures)('$id: $name', (fixture) => {
    it(fixture.description, async () => {
      const { skipped, result } = await runFixture(fixture)
      if (skipped || !result) return

      if (fixture.expectedProducts !== undefined) {
        expect(result.products.length).toBe(fixture.expectedProducts)
      }
    })
  })
})

// =============================================================================
// BUSINESS LOGIC ISSUES (105-111)
// =============================================================================

describe('Business Logic Issues', () => {
  describe.each(businessLogicFixtures)('$id: $name', (fixture) => {
    it(fixture.description, async () => {
      const { skipped, reason, result } = await runFixture(fixture)

      if (skipped) {
        console.log(`  ⏭️  Skipped: ${reason}`)
        return
      }

      if (!result) throw new Error('Result should be defined when not skipped')

      if (fixture.expectedProducts !== undefined) {
        expect(result.products.length).toBe(fixture.expectedProducts)
      }

      if (fixture.expectedErrorCount !== undefined) {
        expect(result.errors.length).toBeGreaterThanOrEqual(fixture.expectedErrorCount)
      }
    })
  })
})

// =============================================================================
// FEED CONSISTENCY ISSUES (112-117)
// =============================================================================

describe('Feed Consistency Issues', () => {
  describe.each(feedConsistencyFixtures)('$id: $name', (fixture) => {
    it(fixture.description, async () => {
      const { skipped, result } = await runFixture(fixture)

      if (skipped) return
      if (!result) throw new Error('Result should be defined when not skipped')

      if (fixture.expectedProducts !== undefined) {
        expect(result.products.length).toBe(fixture.expectedProducts)
      }
    })
  })
})

// =============================================================================
// DUPLICATE/CONFLICT DETECTION (118-122)
// =============================================================================

describe('Duplicate/Conflict Detection', () => {
  describe.each(duplicateConflictFixtures)('$id: $name', (fixture) => {
    it(fixture.description, async () => {
      const { skipped, result } = await runFixture(fixture)
      if (skipped || !result) return

      if (fixture.expectedProducts !== undefined) {
        expect(result.products.length).toBe(fixture.expectedProducts)
      }
    })
  })
})

// =============================================================================
// CHARACTER SET/ENCODING EDGE CASES (123-127)
// =============================================================================

describe('Encoding Edge Cases', () => {
  describe.each(encodingEdgeCaseFixtures)('$id: $name', (fixture) => {
    it(fixture.description, async () => {
      const { skipped, result } = await runFixture(fixture)
      if (skipped || !result) return

      if (fixture.expectedProducts !== undefined) {
        expect(result.products.length).toBe(fixture.expectedProducts)
      }
    })
  })
})

// =============================================================================
// FEED METADATA ISSUES (128-130)
// =============================================================================

describe('Feed Metadata Issues', () => {
  describe.each(feedMetadataFixtures)('$id: $name', (fixture) => {
    it(fixture.description, async () => {
      const { skipped, reason, result } = await runFixture(fixture)

      if (skipped) {
        console.log(`  ⏭️  Skipped: ${reason}`)
        return
      }

      if (!result) throw new Error('Result should be defined when not skipped')

      if (fixture.expectedProducts !== undefined) {
        expect(result.products.length).toBe(fixture.expectedProducts)
      }
    })
  })
})

// =============================================================================
// SUMMARY TEST
// =============================================================================

describe('Bad Data Scenarios Summary', () => {
  it('should have 130 test fixtures defined', () => {
    expect(allBadDataFixtures.length).toBe(130)
  })

  it('should have unique IDs for all fixtures', () => {
    const ids = allBadDataFixtures.map(f => f.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it('should have sequential IDs from 1 to 130', () => {
    const ids = allBadDataFixtures.map(f => f.id).sort((a, b) => a - b)
    for (let i = 0; i < 130; i++) {
      expect(ids[i]).toBe(i + 1)
    }
  })
})
