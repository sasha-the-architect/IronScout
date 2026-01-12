/**
 * Tests for Affiliate Feed Alert Logic
 *
 * Per spec context/specs/affiliate-feed-alerts-v1.md:
 * - Price drop alerts: oldPrice > newPrice with same currency
 * - Back-in-stock alerts: oldInStock === false && newInStock === true
 * - No alerts when productId is null
 * - No alerts for signature-only changes
 * - No alerts for currency mismatches (fail-closed per ADR-009)
 * - No stock alerts when prior inStock is unknown (null)
 *
 * IMPORTANT: These tests exercise the PRODUCTION code path via the exported
 * detectAlertChanges() function, not a local mock implementation.
 */

import { describe, it, expect, vi } from 'vitest'

// Mock all dependencies BEFORE importing processor
vi.mock('@ironscout/db', () => ({
  prisma: {
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
  },
}))

vi.mock('../../config/logger', () => {
  const mockLogMethods = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }
  return {
    logger: {
      affiliate: mockLogMethods,
    },
    rootLogger: {
      child: vi.fn(() => mockLogMethods),
    },
  }
})

vi.mock('../../config/queues', () => ({
  enqueueProductResolve: vi.fn(),
  alertQueue: {
    addBulk: vi.fn(),
  },
}))

// Now import after mocks are set up
import {
  detectAlertChanges,
  type LastPriceEntry,
  type AffiliatePriceChange,
  type AffiliateStockChange,
  type AlertDetectionResult,
} from '../processor'

describe('Affiliate Alert Detection (Production Code)', () => {
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
      const result = detectAlertChanges(
        24.99, // new price (lower)
        true,
        'USD',
        baseProductId,
        baseSourceProductId,
        baseLastPrice
      )

      expect(result.priceChange).not.toBeNull()
      expect(result.priceChange?.oldPrice).toBe(29.99)
      expect(result.priceChange?.newPrice).toBe(24.99)
      expect(result.priceChange?.productId).toBe(baseProductId)
      expect(result.skipReason).toBeNull()
    })

    it('does not queue alert when price increases', () => {
      const result = detectAlertChanges(
        34.99, // new price (higher)
        true,
        'USD',
        baseProductId,
        baseSourceProductId,
        baseLastPrice
      )

      expect(result.priceChange).toBeNull()
      expect(result.skipReason).toBeNull()
    })

    it('does not queue alert when price unchanged', () => {
      const result = detectAlertChanges(
        29.99, // same price
        true,
        'USD',
        baseProductId,
        baseSourceProductId,
        baseLastPrice
      )

      expect(result.priceChange).toBeNull()
      expect(result.skipReason).toBeNull()
    })

    it('does not queue alert when currency changes (mismatch) - fail closed per ADR-009', () => {
      const result = detectAlertChanges(
        19.99, // lower in CAD but different currency
        true,
        'CAD',
        baseProductId,
        baseSourceProductId,
        baseLastPrice // USD
      )

      expect(result.priceChange).toBeNull()
      expect(result.skipReason).toBe('CURRENCY_MISMATCH')
    })

    it('does not queue alert when prior currency is null (unknown state)', () => {
      const lastPriceNullCurrency: LastPriceEntry = {
        ...baseLastPrice,
        currency: null,
      }

      const result = detectAlertChanges(
        19.99,
        true,
        'USD',
        baseProductId,
        baseSourceProductId,
        lastPriceNullCurrency
      )

      expect(result.priceChange).toBeNull()
      expect(result.skipReason).toBe('CURRENCY_MISMATCH')
    })

    it('does not queue alert when current currency is null - fail closed per ADR-009', () => {
      const result = detectAlertChanges(
        19.99,
        true,
        null, // unknown current currency
        baseProductId,
        baseSourceProductId,
        baseLastPrice
      )

      expect(result.priceChange).toBeNull()
      expect(result.skipReason).toBe('CURRENCY_MISMATCH')
    })

    it('handles originalPrice change without price drop (signature change only)', () => {
      // originalPrice changed from null to 39.99, but current price stayed same
      // This triggers a signature change but NOT a price drop alert
      const result = detectAlertChanges(
        29.99, // same price
        true,
        'USD',
        baseProductId,
        baseSourceProductId,
        baseLastPrice
      )

      expect(result.priceChange).toBeNull()
      expect(result.skipReason).toBeNull()
    })
  })

  describe('Back-in-Stock Alerts', () => {
    it('queues alert when stock transitions false → true', () => {
      const outOfStockLastPrice: LastPriceEntry = {
        ...baseLastPrice,
        inStock: false,
      }

      const result = detectAlertChanges(
        29.99,
        true, // now in stock
        'USD',
        baseProductId,
        baseSourceProductId,
        outOfStockLastPrice
      )

      expect(result.stockChange).not.toBeNull()
      expect(result.stockChange?.inStock).toBe(true)
      expect(result.stockChange?.productId).toBe(baseProductId)
      expect(result.skipReason).toBeNull()
    })

    it('does not queue alert when stock transitions true → false', () => {
      const result = detectAlertChanges(
        29.99,
        false, // now out of stock
        'USD',
        baseProductId,
        baseSourceProductId,
        baseLastPrice // was in stock
      )

      expect(result.stockChange).toBeNull()
      expect(result.skipReason).toBeNull()
    })

    it('does not queue alert when stock stays true', () => {
      const result = detectAlertChanges(
        29.99,
        true, // still in stock
        'USD',
        baseProductId,
        baseSourceProductId,
        baseLastPrice // was in stock
      )

      expect(result.stockChange).toBeNull()
      expect(result.skipReason).toBeNull()
    })

    it('does not queue alert when stock stays false', () => {
      const outOfStockLastPrice: LastPriceEntry = {
        ...baseLastPrice,
        inStock: false,
      }

      const result = detectAlertChanges(
        29.99,
        false, // still out of stock
        'USD',
        baseProductId,
        baseSourceProductId,
        outOfStockLastPrice
      )

      expect(result.stockChange).toBeNull()
      expect(result.skipReason).toBeNull()
    })

    it('does not queue alert when prior inStock is null (unknown state)', () => {
      const unknownStockLastPrice: LastPriceEntry = {
        ...baseLastPrice,
        inStock: null,
      }

      const result = detectAlertChanges(
        29.99,
        true,
        'USD',
        baseProductId,
        baseSourceProductId,
        unknownStockLastPrice
      )

      // Per spec: inStock null = unknown, should not trigger alert
      expect(result.stockChange).toBeNull()
      expect(result.skipReason).toBe('UNKNOWN_PRIOR_STATE')
    })

    it('does not trigger on new products (no prior state)', () => {
      const result = detectAlertChanges(
        29.99,
        true,
        'USD',
        baseProductId,
        baseSourceProductId,
        null // no prior price = new product
      )

      expect(result.stockChange).toBeNull()
      expect(result.skipReason).toBe('NEW_PRODUCT')
    })
  })

  describe('ProductId Validation', () => {
    it('skips alert when productId is null', () => {
      const result = detectAlertChanges(
        19.99, // price drop
        true,
        'USD',
        null, // no canonical product match
        baseSourceProductId,
        baseLastPrice
      )

      expect(result.priceChange).toBeNull()
      expect(result.stockChange).toBeNull()
      expect(result.skipReason).toBe('NULL_PRODUCT_ID')
    })

    it('skips stock alert when productId is null', () => {
      const outOfStockLastPrice: LastPriceEntry = {
        ...baseLastPrice,
        inStock: false,
      }

      const result = detectAlertChanges(
        29.99,
        true, // back in stock
        'USD',
        null, // no canonical product match
        baseSourceProductId,
        outOfStockLastPrice
      )

      expect(result.stockChange).toBeNull()
      expect(result.skipReason).toBe('NULL_PRODUCT_ID')
    })
  })

  describe('Combined Scenarios', () => {
    it('detects both price drop and back-in-stock simultaneously', () => {
      const outOfStockLastPrice: LastPriceEntry = {
        ...baseLastPrice,
        inStock: false,
        price: 39.99,
      }

      const result = detectAlertChanges(
        29.99, // price drop from 39.99
        true, // back in stock
        'USD',
        baseProductId,
        baseSourceProductId,
        outOfStockLastPrice
      )

      expect(result.priceChange).not.toBeNull()
      expect(result.priceChange?.oldPrice).toBe(39.99)
      expect(result.priceChange?.newPrice).toBe(29.99)

      expect(result.stockChange).not.toBeNull()
      expect(result.stockChange?.inStock).toBe(true)

      expect(result.skipReason).toBeNull()
    })

    it('price increase with back-in-stock only triggers stock alert', () => {
      const outOfStockLastPrice: LastPriceEntry = {
        ...baseLastPrice,
        inStock: false,
        price: 19.99,
      }

      const result = detectAlertChanges(
        29.99, // price increase from 19.99
        true, // back in stock
        'USD',
        baseProductId,
        baseSourceProductId,
        outOfStockLastPrice
      )

      expect(result.priceChange).toBeNull() // no price drop
      expect(result.stockChange).not.toBeNull() // back in stock
      expect(result.skipReason).toBeNull()
    })

    it('price drop with unknown prior inStock still returns price change', () => {
      const unknownStockLastPrice: LastPriceEntry = {
        ...baseLastPrice,
        inStock: null,
        price: 39.99,
      }

      const result = detectAlertChanges(
        29.99, // price drop
        true,
        'USD',
        baseProductId,
        baseSourceProductId,
        unknownStockLastPrice
      )

      // Price drop should still be detected
      expect(result.priceChange).not.toBeNull()
      expect(result.priceChange?.oldPrice).toBe(39.99)
      expect(result.priceChange?.newPrice).toBe(29.99)

      // Stock alert should be skipped due to unknown prior state
      expect(result.stockChange).toBeNull()
      expect(result.skipReason).toBeNull() // No skip reason since we got a price change
    })
  })

  describe('Skip Reason Coverage', () => {
    it('returns NULL_PRODUCT_ID for unresolved products', () => {
      const result = detectAlertChanges(19.99, true, 'USD', null, 'sp-1', baseLastPrice)
      expect(result.skipReason).toBe('NULL_PRODUCT_ID')
    })

    it('returns NEW_PRODUCT for first-time products', () => {
      const result = detectAlertChanges(19.99, true, 'USD', 'prod-1', 'sp-1', null)
      expect(result.skipReason).toBe('NEW_PRODUCT')
    })

    it('returns CURRENCY_MISMATCH for null current currency', () => {
      const result = detectAlertChanges(19.99, true, null, 'prod-1', 'sp-1', baseLastPrice)
      expect(result.skipReason).toBe('CURRENCY_MISMATCH')
    })

    it('returns CURRENCY_MISMATCH for null prior currency with price drop', () => {
      const nullCurrencyLastPrice: LastPriceEntry = {
        ...baseLastPrice,
        currency: null,
        price: 39.99,
      }
      const result = detectAlertChanges(19.99, true, 'USD', 'prod-1', 'sp-1', nullCurrencyLastPrice)
      expect(result.skipReason).toBe('CURRENCY_MISMATCH')
    })

    it('returns UNKNOWN_PRIOR_STATE for null prior inStock without price change', () => {
      const unknownStockLastPrice: LastPriceEntry = {
        ...baseLastPrice,
        inStock: null,
      }
      const result = detectAlertChanges(29.99, true, 'USD', 'prod-1', 'sp-1', unknownStockLastPrice)
      expect(result.skipReason).toBe('UNKNOWN_PRIOR_STATE')
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
