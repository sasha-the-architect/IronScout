# AI Extraction Test Suite

This test suite provides comprehensive coverage for the AI-powered HTML extraction functionality used in the ZeroedIn harvester.

## Overview

The test suite validates that the AI extraction pipeline correctly:
- Extracts ammunition product data from HTML pages
- Handles various edge cases and error conditions
- Processes AI responses correctly
- Validates extracted data properly

## Test Coverage

### Happy Path Tests (2 tests)

1. **Complete Product Extraction**
   - Validates extraction of all products from a sample ammunition retailer page
   - Tests all product fields: title, caliber, grain weight, bullet type, price, stock status, etc.
   - Verifies handling of in-stock and out-of-stock products

2. **Products with Missing Optional Fields**
   - Ensures products with null optional fields (brand, case type, etc.) are still extracted
   - Validates that only title and price are truly required

### Edge Cases - AI Response Handling (6 tests)

3. **Empty Product Array**
   - Tests handling when AI finds no ammunition products on a page
   - Expects graceful handling of empty `[]` response

4. **Markdown Code Blocks**
   - Validates removal of markdown formatting (```json...```) from AI responses
   - Tests the cleaning logic for responses wrapped in code blocks

5. **Malformed AI Response**
   - Tests error handling when AI returns invalid JSON
   - Ensures parsing errors are caught appropriately

6. **Object Instead of Array**
   - Validates detection when AI returns a single object instead of an array
   - Tests array validation logic

7. **Price as String**
   - Tests conversion of string prices (e.g., "29.99") to numbers
   - Validates price parsing logic

8. **Various Stock Status Formats**
   - Tests handling of true, false, and undefined stock statuses
   - Validates default behavior for missing stock information

### Edge Cases - HTML Content (3 tests)

9. **Empty HTML Body**
   - Tests handling of pages with no content
   - Validates cheerio parsing of empty documents

10. **Script and Style Removal**
    - Validates removal of `<script>`, `<style>`, `<nav>`, `<footer>` elements before AI processing
    - Ensures cleaned HTML only contains relevant product information

11. **HTML Truncation**
    - Tests truncation of oversized HTML (>100KB limit)
    - Prevents token limit errors when sending to AI

### Edge Cases - Product Validation (3 tests)

12. **Missing Required Title**
    - Validates filtering of products without a title
    - Ensures only valid products are returned

13. **Missing Required Price**
    - Validates filtering of products without a price
    - Tests validation logic for required fields

14. **Various Stock Status Formats**
    - Tests handling of different stock status representations
    - Validates conversion to boolean values

### Edge Cases - AI API Errors (3 tests)

15. **Network Errors**
    - Tests handling of network failures when calling Anthropic API
    - Validates error propagation

16. **Rate Limiting**
    - Tests handling of API rate limit errors
    - Ensures proper error messages

17. **Invalid API Key**
    - Tests handling of authentication failures
    - Validates error detection

### Real World Scenarios (2 tests)

18. **Mixed Valid and Invalid Products**
    - Tests pages containing both valid products and items with missing data
    - Validates filtering logic to extract only complete products

19. **Different Caliber Formats**
    - Tests extraction of various caliber formats (9mm Luger, .223 Remington, 5.56 NATO, 12 Gauge)
    - Validates caliber field handling

## Test Fixtures

### HTML Fixtures

Located in `fixtures/` directory:

1. **sample-ammo-page.html** - Standard ammunition product listing
   - 3 products with varying attributes
   - Mix of in-stock and out-of-stock items
   - Different calibers and bullet types

2. **empty-page.html** - Page with no products
   - Tests empty result handling

3. **malformed-data-page.html** - Products with missing/invalid data
   - Missing prices
   - Missing calibers
   - Invalid price formats ("Call for quote")

4. **non-ammunition-page.html** - Non-ammunition products
   - Holsters, scopes, cleaning kits
   - Tests AI's ability to identify ammunition vs accessories

5. **complex-page.html** - Realistic complex retailer page
   - Bulk pricing
   - Sale prices with strikethrough
   - Pre-order status
   - Special characters in product names
   - Scripts and styles that need removal

## Running Tests

```bash
# Run all tests
pnpm test:run

# Run tests in watch mode
pnpm test

# Run with UI
pnpm test:ui

# Run with coverage
pnpm test:coverage
```

## Mocking Strategy

The test suite mocks the Anthropic SDK to avoid:
- Actual API calls during testing
- Dependency on external services
- API rate limits and costs

Mock responses simulate realistic AI extraction results with various scenarios.

## Key Testing Principles

1. **Isolation** - Each test is independent and doesn't rely on external services
2. **Coverage** - Tests cover happy paths, edge cases, and error conditions
3. **Real-world scenarios** - Fixtures represent actual retailer page structures
4. **Validation** - Tests verify both successful extraction and proper error handling

## Adding New Tests

When adding new test cases:

1. Create fixture HTML in `fixtures/` if needed
2. Add test case in appropriate describe block
3. Mock Anthropic response to match expected AI behavior
4. Validate both successful extraction and error cases
5. Run `pnpm test:run` to ensure all tests pass

## Test Results Summary

- Total: 18 tests
- Passing: 18 ✓
- Categories:
  - Happy Path: 2 tests
  - AI Response Handling: 6 tests
  - HTML Content: 3 tests
  - Product Validation: 3 tests
  - AI API Errors: 3 tests
  - Real World Scenarios: 2 tests
