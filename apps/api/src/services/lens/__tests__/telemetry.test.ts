import { describe, it, expect } from 'vitest'
import { buildLensEvalEvent } from '../telemetry'
import { selectLens } from '../selector'
import type { AggregatedProduct, LensSignals } from '../types'
import type { SignalExtractionResult } from '../signal-extractor'

function createProduct(overrides: Partial<AggregatedProduct> = {}): AggregatedProduct {
  return {
    productId: 'p1',
    bulletType: null,
    grain: null,
    casing: null,
    packSize: 50,
    canonicalConfidence: 0.85,
    price: 12.5,
    availability: 'IN_STOCK',
    pricePerRound: 0.25,
    _originalProduct: {},
    _visibleOfferCount: 2,
    ...overrides,
  }
}

describe('lens telemetry', () => {
  it('emits offer summary and trace fields for audit trail', () => {
    const signals: LensSignals = {
      usage_hint: { value: 'RANGE', confidence: 0.9 },
    }
    const selection = selectLens(signals, null, 'intent-v2.1.0')

    const extraction: SignalExtractionResult = {
      signals,
      intent: {
        originalQuery: '9mm range ammo',
        confidence: 0.9,
      },
      status: 'OK',
      extractorModelId: 'intent-v2.1.0',
      latencyMs: 5,
    }

    const orderedProducts = [
      createProduct({ productId: 'p1', price: 12.5, pricePerRound: 0.25, _visibleOfferCount: 2 }),
      createProduct({ productId: 'p2', price: 15.0, pricePerRound: 0.30, _visibleOfferCount: 1 }),
    ]

    const asOf = new Date('2026-01-21T15:04:05Z')
    const event = buildLensEvalEvent({
      requestId: 'req-1',
      traceId: 'trace-123',
      query: '9mm range ammo',
      extractionResult: extraction,
      selectionResult: selection,
      userOverrideId: null,
      candidateCount: orderedProducts.length,
      eligibleCount: orderedProducts.length,
      filteredByReason: {},
      orderedProducts,
      config: {
        priceLookbackDays: 7,
        asOfTime: asOf,
      },
      timing: {
        intentMs: 5,
        offersMs: 10,
        rankMs: 3,
        totalMs: 18,
      },
      status: 'OK',
    })

    expect(event.traceId).toBe('trace-123')
    expect(event.config.priceLookbackDays).toBe(7)
    expect(event.config.eligibilityConfigVersion).toBe(selection.lens.version)
    expect(event.results.offerSummary?.length).toBe(2)
    expect(event.results.offerSummary?.[0]?.priceMeta.windowDays).toBe(7)
    expect(event.results.offerSummary?.[0]?.priceMeta.sampleCount).toBe(2)
    expect(event.results.offerSummary?.[0]?.priceMeta.asOf).toBe(asOf.toISOString())
  })
})
