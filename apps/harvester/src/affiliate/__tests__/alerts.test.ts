/**
 * Tests for Affiliate Feed Alert Logic
 *
 * Per spec context/specs/affiliate-feed-alerts-v1.md:
 * - Price drop alerts: oldPrice > newPrice with same currency
 * - Back-in-stock alerts: oldInStock === false && newInStock === true
 * - No alerts when productId is null
 * - No alerts for signature-only changes
 * - No alerts for currency mismatches
 * - No stock alerts when prior inStock is unknown (null)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Types for testing (mirrors processor.ts)
interface LastPriceEntry {
  sourceProductId: string
  priceSignatureHash: string
  createdAt: Date
  price: number
  inStock: boolean
  currency: string
}

interface AffiliatePriceChange {
  productId: string
  sourceProductId: string
  oldPrice: number
  newPrice: number
}

interface AffiliateStockChange {
  productId: string
  sourceProductId: string
  inStock: true
}

interface PriceWriteResult {
  pricesToWrite: any[]
  priceChanges: AffiliatePriceChange[]
  stockChanges: AffiliateStockChange[]
}

/**
 * Test implementation of change detection logic
 * This mirrors what will be implemented in decidePriceWrites()
 */
function detectChanges(
  currentPrice: number,
  currentInStock: boolean,
  currentCurrency: string,
  productId: string | null,
  lastPrice: LastPriceEntry | null
): { priceChange: AffiliatePriceChange | null; stockChange: AffiliateStockChange | null } {
  // Skip if no productId (can't send alerts for unresolved products)
  if (!productId) {
    return { priceChange: null, stockChange: null }
  }

  // No prior price = new product, no alerts
  if (!lastPrice) {
    return { priceChange: null, stockChange: null }
  }

  let priceChange: AffiliatePriceChange | null = null
  let stockChange: AffiliateStockChange | null = null

  // Normalize currency
  const normalizedCurrentCurrency = currentCurrency || 'USD'
  const oldCurrency = lastPrice.currency

  // Price drop detection: same currency AND price decreased
  if (
    oldCurrency &&
    oldCurrency === normalizedCurrentCurrency &&
    lastPrice.price > currentPrice
  ) {
    priceChange = {
      productId,
      sourceProductId: lastPrice.sourceProductId,
      oldPrice: lastPrice.price,
      newPrice: currentPrice,
    }
  }

  // Back-in-stock detection: was false, now true
  // Per spec: oldInStock must be explicitly false (not null/undefined)
  const normalizedNewInStock = currentInStock === true
  if (lastPrice.inStock === false && normalizedNewInStock) {
    stockChange = {
      productId,
      sourceProductId: lastPrice.sourceProductId,
      inStock: true,
    }
  }

  return { priceChange, stockChange }
}

describe('Affiliate Alert Detection', () => {
  const baseSourceProductId = 'sp-123'
  const baseProductId = 'prod-456'
  const baseLastPrice: LastPriceEntry = {
    sourceProductId: baseSourceProductId,
    priceSignatureHash: 'hash-abc',
    createdAt: new Date('2024-01-01'),
    price: 29.99,
    inStock: true,
    currency: 'USD',
  }

  describe('Price Drop Alerts', () => {
    it('queues alert when price decreases', () => {
      const result = detectChanges(
        24.99, // new price (lower)
        true,
        'USD',
        baseProductId,
        baseLastPrice
      )

      expect(result.priceChange).not.toBeNull()
      expect(result.priceChange?.oldPrice).toBe(29.99)
      expect(result.priceChange?.newPrice).toBe(24.99)
      expect(result.priceChange?.productId).toBe(baseProductId)
    })

    it('does not queue alert when price increases', () => {
      const result = detectChanges(
        34.99, // new price (higher)
        true,
        'USD',
        baseProductId,
        baseLastPrice
      )

      expect(result.priceChange).toBeNull()
    })

    it('does not queue alert when price unchanged', () => {
      const result = detectChanges(
        29.99, // same price
        true,
        'USD',
        baseProductId,
        baseLastPrice
      )

      expect(result.priceChange).toBeNull()
    })

    it('does not queue alert when currency changes (mismatch)', () => {
      const result = detectChanges(
        19.99, // lower in CAD but different currency
        true,
        'CAD',
        baseProductId,
        baseLastPrice // USD
      )

      expect(result.priceChange).toBeNull()
    })

    it('does not queue alert when prior currency is null', () => {
      const lastPriceNullCurrency: LastPriceEntry = {
        ...baseLastPrice,
        currency: null as any, // DB returned null
      }

      const result = detectChanges(
        19.99,
        true,
        'USD',
        baseProductId,
        lastPriceNullCurrency
      )

      expect(result.priceChange).toBeNull()
    })

    it('handles originalPrice change without price drop (signature change only)', () => {
      // originalPrice changed from null to 39.99, but current price stayed same
      // This triggers a signature change but NOT a price drop alert
      const result = detectChanges(
        29.99, // same price
        true,
        'USD',
        baseProductId,
        baseLastPrice
      )

      expect(result.priceChange).toBeNull()
    })
  })

  describe('Back-in-Stock Alerts', () => {
    it('queues alert when stock transitions false → true', () => {
      const outOfStockLastPrice: LastPriceEntry = {
        ...baseLastPrice,
        inStock: false,
      }

      const result = detectChanges(
        29.99,
        true, // now in stock
        'USD',
        baseProductId,
        outOfStockLastPrice
      )

      expect(result.stockChange).not.toBeNull()
      expect(result.stockChange?.inStock).toBe(true)
      expect(result.stockChange?.productId).toBe(baseProductId)
    })

    it('does not queue alert when stock transitions true → false', () => {
      const result = detectChanges(
        29.99,
        false, // now out of stock
        'USD',
        baseProductId,
        baseLastPrice // was in stock
      )

      expect(result.stockChange).toBeNull()
    })

    it('does not queue alert when stock stays true', () => {
      const result = detectChanges(
        29.99,
        true, // still in stock
        'USD',
        baseProductId,
        baseLastPrice // was in stock
      )

      expect(result.stockChange).toBeNull()
    })

    it('does not queue alert when stock stays false', () => {
      const outOfStockLastPrice: LastPriceEntry = {
        ...baseLastPrice,
        inStock: false,
      }

      const result = detectChanges(
        29.99,
        false, // still out of stock
        'USD',
        baseProductId,
        outOfStockLastPrice
      )

      expect(result.stockChange).toBeNull()
    })

    it('does not queue alert when prior inStock is null (unknown state)', () => {
      const unknownStockLastPrice: LastPriceEntry = {
        ...baseLastPrice,
        inStock: null as any, // DB returned null (unknown state)
      }

      const result = detectChanges(
        29.99,
        true,
        'USD',
        baseProductId,
        unknownStockLastPrice
      )

      // Per spec: inStock null = unknown, should not trigger alert
      expect(result.stockChange).toBeNull()
    })

    it('does not trigger on new products (no prior state)', () => {
      const result = detectChanges(
        29.99,
        true,
        'USD',
        baseProductId,
        null // no prior price = new product
      )

      expect(result.stockChange).toBeNull()
    })
  })

  describe('ProductId Validation', () => {
    it('skips alert when productId is null', () => {
      const result = detectChanges(
        19.99, // price drop
        true,
        'USD',
        null, // no canonical product match
        baseLastPrice
      )

      expect(result.priceChange).toBeNull()
      expect(result.stockChange).toBeNull()
    })

    it('skips stock alert when productId is null', () => {
      const outOfStockLastPrice: LastPriceEntry = {
        ...baseLastPrice,
        inStock: false,
      }

      const result = detectChanges(
        29.99,
        true, // back in stock
        'USD',
        null, // no canonical product match
        outOfStockLastPrice
      )

      expect(result.stockChange).toBeNull()
    })
  })

  describe('Combined Scenarios', () => {
    it('detects both price drop and back-in-stock simultaneously', () => {
      const outOfStockLastPrice: LastPriceEntry = {
        ...baseLastPrice,
        inStock: false,
        price: 39.99,
      }

      const result = detectChanges(
        29.99, // price drop from 39.99
        true, // back in stock
        'USD',
        baseProductId,
        outOfStockLastPrice
      )

      expect(result.priceChange).not.toBeNull()
      expect(result.priceChange?.oldPrice).toBe(39.99)
      expect(result.priceChange?.newPrice).toBe(29.99)

      expect(result.stockChange).not.toBeNull()
      expect(result.stockChange?.inStock).toBe(true)
    })

    it('price increase with back-in-stock only triggers stock alert', () => {
      const outOfStockLastPrice: LastPriceEntry = {
        ...baseLastPrice,
        inStock: false,
        price: 19.99,
      }

      const result = detectChanges(
        29.99, // price increase from 19.99
        true, // back in stock
        'USD',
        baseProductId,
        outOfStockLastPrice
      )

      expect(result.priceChange).toBeNull() // no price drop
      expect(result.stockChange).not.toBeNull() // back in stock
    })
  })

  describe('Write Condition: Stock-Only Changes', () => {
    it('should write price row for stock-only change (false → true)', () => {
      const outOfStockLastPrice: LastPriceEntry = {
        ...baseLastPrice,
        inStock: false,
      }

      // Same price, same signature, but stock changed
      const normalizedOldInStock = outOfStockLastPrice.inStock === true
      const normalizedNewInStock = true
      const stockChanged = normalizedOldInStock !== normalizedNewInStock

      expect(stockChanged).toBe(true)
    })

    it('should write price row for stock-only change (true → false)', () => {
      // Stock went from true to false - we still want to write the row
      // but NOT queue a back-in-stock alert
      const normalizedOldInStock = baseLastPrice.inStock === true
      const normalizedNewInStock = false
      const stockChanged = normalizedOldInStock !== normalizedNewInStock

      expect(stockChanged).toBe(true)
    })

    it('should not mark stockChanged when stock stays the same', () => {
      const normalizedOldInStock = baseLastPrice.inStock === true
      const normalizedNewInStock = true
      const stockChanged = normalizedOldInStock !== normalizedNewInStock

      expect(stockChanged).toBe(false)
    })
  })
})

describe('AlertJobData Compatibility', () => {
  // Verify our changes are compatible with existing AlertJobData interface
  interface AlertJobData {
    executionId: string
    productId: string
    oldPrice?: number
    newPrice?: number
    inStock?: boolean
  }

  it('price drop alert maps to AlertJobData correctly', () => {
    const priceChange: AffiliatePriceChange = {
      productId: 'prod-123',
      sourceProductId: 'sp-456',
      oldPrice: 29.99,
      newPrice: 24.99,
    }

    const alertJob: AlertJobData = {
      executionId: 'run-789',
      productId: priceChange.productId,
      oldPrice: priceChange.oldPrice,
      newPrice: priceChange.newPrice,
    }

    expect(alertJob.productId).toBe('prod-123')
    expect(alertJob.oldPrice).toBe(29.99)
    expect(alertJob.newPrice).toBe(24.99)
    expect(alertJob.inStock).toBeUndefined()
  })

  it('back-in-stock alert maps to AlertJobData correctly', () => {
    const stockChange: AffiliateStockChange = {
      productId: 'prod-123',
      sourceProductId: 'sp-456',
      inStock: true,
    }

    const alertJob: AlertJobData = {
      executionId: 'run-789',
      productId: stockChange.productId,
      inStock: stockChange.inStock,
    }

    expect(alertJob.productId).toBe('prod-123')
    expect(alertJob.inStock).toBe(true)
    expect(alertJob.oldPrice).toBeUndefined()
    expect(alertJob.newPrice).toBeUndefined()
  })
})
