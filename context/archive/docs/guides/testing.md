# Testing Guide

This document describes the testing strategy, tools, and conventions for the IronScout platform.

## Overview

- **Framework**: Vitest (fast, TypeScript-native)
- **Coverage**: v8 provider
- **Approach**: Unit tests, integration tests, fixture-based testing
- **CI Hook**: Pre-push git hook runs test suite

---

## Running Tests

### Quick Commands

```bash
# Run all tests (watch mode)
pnpm --filter harvester test

# Run tests once (CI mode)
pnpm --filter harvester test:run

# Run with coverage
pnpm --filter harvester test:coverage

# Run with UI
pnpm --filter harvester test:ui
```

### From App Directory

```bash
cd apps/harvester
pnpm test           # Watch mode
pnpm test:run       # Single run
pnpm test:coverage  # With coverage report
```

---

## Test Structure

### Directory Layout

```
apps/harvester/src/
├── dealer/
│   ├── __tests__/
│   │   └── feed-ingest.test.ts      # Worker tests
│   └── connectors/
│       └── __tests__/
│           ├── fixtures/             # Test data files
│           │   ├── csv/
│           │   ├── json/
│           │   └── xml/
│           ├── test-utils.ts         # Shared helpers
│           ├── base-connector.test.ts
│           ├── ammoseek-connector.test.ts
│           ├── gunengine-connector.test.ts
│           ├── generic-connector.test.ts
│           └── robustness.test.ts    # Edge case coverage
└── extractor/
    └── __tests__/
        └── ai-extraction.test.ts
```

### Test File Naming

- Unit tests: `*.test.ts`
- Integration tests: `*.integration.test.ts`
- Fixtures: `fixtures/<format>/<name>.<ext>`

---

## Test Categories

### 1. Feed Connector Tests

**Files**: `apps/harvester/src/dealer/connectors/__tests__/`

Test the feed parsing layer that handles CSV, JSON, and XML from dealers.

| File | Tests | Coverage |
|------|-------|----------|
| `base-connector.test.ts` | 111 | Core parsing, field coercion, UPC validation |
| `ammoseek-connector.test.ts` | 57 | AmmoSeek V1 format specifics |
| `gunengine-connector.test.ts` | 58 | GunEngine V2 format specifics |
| `generic-connector.test.ts` | 42 | Fallback generic parsing |
| `robustness.test.ts` | 76 | Edge cases, error handling, stress tests |

**Key Concepts Tested**:

- **Two-lane ingestion**: Records are classified as:
  - **Indexable**: Has valid UPC + title + price
  - **Quarantine**: Has title + price but missing/invalid UPC
  - **Reject**: Missing required fields (title or valid price)

- **Field coercion**: Type conversion with tracking
  - `"$18.99"` → `18.99` (price)
  - `"in_stock"` → `true` (boolean)
  - `"115 grains"` → `115` (grain weight)

- **UPC validation**: 8-14 digit validation, prefix stripping
  - Valid: `12345678` (UPC-E), `123456789012` (UPC-A), `1234567890123` (EAN-13)
  - Invalid UPCs become `null` → triggers `MISSING_UPC` error

### 2. Worker Tests

**Files**: `apps/harvester/src/dealer/__tests__/`

Test the BullMQ workers that process feeds.

| File | Tests | Coverage |
|------|-------|----------|
| `feed-ingest.test.ts` | 56 | Feed download, parsing, error handling |

### 3. Extraction Tests

**Files**: `apps/harvester/src/extractor/__tests__/`

Test AI-powered extraction from unstructured content.

| File | Tests | Coverage |
|------|-------|----------|
| `ai-extraction.test.ts` | 18 | LLM extraction, fallback logic |

---

## Writing Tests

### Test File Template

```typescript
import { describe, it, expect } from 'vitest'
import { SomeConnector } from '../some-connector'
import { loadJsonFixture, assertValidParseResult } from './test-utils'

describe('SomeConnector', () => {
  const connector = new SomeConnector()

  describe('canHandle', () => {
    it('accepts valid format', () => {
      const json = '{"products": [...]}'
      expect(connector.canHandle(json)).toBe(true)
    })

    it('rejects invalid format', () => {
      const csv = 'upc,title\n123,Test'
      expect(connector.canHandle(csv)).toBe(false)
    })
  })

  describe('parse', () => {
    it('parses valid feed', async () => {
      const json = loadJsonFixture('some-valid.json')
      const result = await connector.parse(json)

      assertValidParseResult(result)
      expect(result.indexableCount).toBe(5)
    })
  })
})
```

### Using Test Utilities

```typescript
import {
  // Fixture loading
  loadCsvFixture,
  loadJsonFixture,
  loadXmlFixture,

  // Assertions
  assertValidParseResult,
  assertIndexableRecord,
  assertQuarantinedRecord,
  assertRejectedRecord,

  // Error helpers
  hasErrorCode,
  getErrorCodes,
  countErrorCode,

  // Coercion helpers
  hasCoercion,
  getCoercion,

  // Factories
  createValidRecord,
  createCsvRow,
  createJsonFeed,
  createXmlFeed,

  // Edge case data
  INVALID_UPCS,
  VALID_UPCS,
  PRICE_EDGE_CASES,
  BOOLEAN_EDGE_CASES,

  // Stress test data
  generateLargeFeed,
  generateFeedWithSpecialCharacters,
} from './test-utils'
```

### Adding Fixtures

Place test data in `fixtures/<format>/`:

```json
// fixtures/json/my-test-cases.json
{
  "products": [
    {
      "upc": "012345678901",
      "title": "Test Product",
      "price": 18.99,
      "link": "https://example.com/product"
    }
  ]
}
```

Load in tests:

```typescript
const json = loadJsonFixture('my-test-cases.json')
const result = await connector.parse(json)
```

---

## Error Codes

Standard error codes used in test assertions:

```typescript
import { ERROR_CODES } from '../types'

// Field validation errors
ERROR_CODES.MISSING_UPC        // UPC not provided or invalid
ERROR_CODES.MISSING_TITLE      // Title/product name missing
ERROR_CODES.INVALID_PRICE      // Price <= 0 or unparseable
ERROR_CODES.MISSING_URL        // Product URL missing

// Format errors
ERROR_CODES.PARSE_ERROR        // Feed format parsing failed
ERROR_CODES.EMPTY_FEED         // No records in feed
```

### Testing Error Codes

```typescript
it('records MISSING_UPC error for invalid UPC', async () => {
  const json = JSON.stringify({
    products: [{ upc: '123', title: 'Test', price: 18.99, link: 'http://test.com' }]
  })
  const result = await connector.parse(json)

  expect(hasErrorCode(result.parsedRecords[0], ERROR_CODES.MISSING_UPC)).toBe(true)
  expect(result.quarantineCount).toBe(1)
})

it('aggregates error codes in result', async () => {
  // Feed with 3 invalid UPCs
  const result = await connector.parse(feedWithBadUpcs)

  expect(result.errorCodes[ERROR_CODES.MISSING_UPC]).toBe(3)
})
```

---

## Coverage Targets

| Area | Target | Current |
|------|--------|---------|
| Feed Connectors | 90% | ~95% |
| Workers | 80% | ~85% |
| Extractors | 70% | ~75% |

### Viewing Coverage

```bash
pnpm --filter harvester test:coverage
```

Opens HTML report showing:
- Line coverage
- Branch coverage
- Function coverage
- Uncovered lines highlighted

---

## Edge Cases to Test

### Input Validation

- Empty feeds (whitespace, empty arrays)
- Missing required fields
- Invalid field values (negative prices, malformed UPCs)
- Mixed valid/invalid records in single feed

### Format Handling

- CSV with various delimiters
- JSON with different root structures (`products`, `offers`, `items`)
- XML with namespaces
- Truncated/malformed content

### Data Coercion

- Price formats: `$18.99`, `18.99 USD`, `1,234.56`
- Boolean formats: `true`, `"1"`, `"yes"`, `"in stock"`
- Stock status: `in_stock`, `available`, `limited`, `out_of_stock`

### Unicode & Special Characters

- Emoji in titles
- International characters (accents, non-Latin)
- HTML entities in descriptions
- Newlines and tabs

### Large Feeds

- 10,000+ record feeds
- Deep nesting
- Long field values

---

## Pre-Push Hook

A git pre-push hook runs tests before pushing:

**File**: `.git/hooks/pre-push`

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "Running pre-push checks..."
pnpm --filter harvester test:run
echo "Pre-push checks passed!"
```

### Troubleshooting Hook Issues

**Hook not running:**
```bash
# Check if executable (Unix)
chmod +x .git/hooks/pre-push

# Check line endings (should be LF, not CRLF)
file .git/hooks/pre-push
# Fix if needed:
sed -i 's/\r$//' .git/hooks/pre-push
```

**Bypassing hook (emergency only):**
```bash
git push --no-verify
```

---

## Test Patterns

### Async Test Pattern

```typescript
it('handles async operation', async () => {
  const result = await connector.parse(feed)
  expect(result.totalRows).toBe(10)
})
```

### Error Testing Pattern

```typescript
it('throws on malformed JSON', async () => {
  await expect(connector.parse('{"broken')).rejects.toThrow()
})
```

### Parameterized Tests

```typescript
const stockFormats = [
  { input: 'in_stock', expected: true },
  { input: 'out_of_stock', expected: false },
  { input: 'available', expected: true },
]

stockFormats.forEach(({ input, expected }) => {
  it(`parses stock_status "${input}" as ${expected}`, async () => {
    const json = JSON.stringify({ offers: [{ stock_status: input, ...validFields }] })
    const result = await connector.parse(json)
    expect(result.parsedRecords[0].record.inStock).toBe(expected)
  })
})
```

### Fixture-Based Tests

```typescript
describe('edge cases from fixture', () => {
  it('handles all stock status formats', async () => {
    const json = loadJsonFixture('gunengine-edge-cases.json')
    const result = await connector.parse(json)

    expect(result.parsedRecords[0].record.inStock).toBe(true)  // in_stock
    expect(result.parsedRecords[1].record.inStock).toBe(true)  // instock
    expect(result.parsedRecords[4].record.inStock).toBe(false) // out_of_stock
  })
})
```

---

## Adding Tests for New Features

1. **Create fixture** if testing data parsing
2. **Add test file** in `__tests__/` directory
3. **Import utilities** from `test-utils.ts`
4. **Write tests** covering:
   - Happy path
   - Edge cases
   - Error conditions
5. **Run tests** to verify passing
6. **Check coverage** for gaps

---

## CI Integration

Tests run in CI via:
- Pre-push git hook (local)
- GitHub Actions (planned)
- Render deploy checks (planned)

---

*Last updated: December 16, 2025*
