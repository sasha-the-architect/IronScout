import { describe, it, expect } from 'vitest'
import {
  normalizeCaliberString,
  extractGrainWeight,
  extractRoundCount,
  deriveShotgunLoadType,
} from '../ammo-utils'

describe('extractGrainWeight', () => {
  it('extracts integer grain weight', () => {
    expect(extractGrainWeight('Federal 9mm 115gr FMJ')).toBe(115)
    expect(extractGrainWeight('Winchester 55 grain FMJ')).toBe(55)
  })

  it('extracts decimal grain weight', () => {
    expect(extractGrainWeight('Hornady .17 HMR 15.5gr V-MAX')).toBe(15.5)
    expect(extractGrainWeight('CCI 17.5 grain polymer tip')).toBe(17.5)
  })

  it('rejects grain outside valid range', () => {
    expect(extractGrainWeight('Test 10gr tiny')).toBeNull() // too small
    expect(extractGrainWeight('Test 900gr huge')).toBeNull() // too large
  })

  it('does not extract shotgun oz as grain', () => {
    // "1oz" should not be parsed as grain
    expect(extractGrainWeight('Federal 12ga 1oz slug')).toBeNull()
  })
})

describe('normalizeCaliberString', () => {
  it('normalizes 5.56mm NATO', () => {
    const result = normalizeCaliberString('Winchester USA 5.56mm NATO 55gr M193 FMJ')
    expect(result).toBe('5.56 NATO')
  })

  it('normalizes 5.56 without NATO suffix', () => {
    const result = normalizeCaliberString('Lake City M855 Green Tip 5.56 - 62 Grain Penetrator')
    expect(result).toBe('5.56 NATO')
  })

  it('normalizes 5.56x45mm', () => {
    const result = normalizeCaliberString('5.56x45mm')
    expect(result).toBe('5.56 NATO')
  })

  it('normalizes .357 SIG', () => {
    const result = normalizeCaliberString('Federal .357 SIG 125gr FMJ')
    expect(result).toBe('.357 SIG')
  })

  it('normalizes 7.62x39mm', () => {
    const result = normalizeCaliberString('7.62x39mm 123gr FMJ')
    expect(result).toBe('7.62x39mm')
  })
})

describe('extractRoundCount', () => {
  it('extracts standard round patterns', () => {
    expect(extractRoundCount('Federal 9mm 115gr FMJ - 50 Rounds')).toBe(50)
    expect(extractRoundCount('Winchester 100rd Value Pack')).toBe(100)
    expect(extractRoundCount('Hornady 20-count box')).toBe(20)
  })

  it('extracts box/pack shorthand patterns', () => {
    expect(extractRoundCount('PMC Bronze .45 ACP 230gr 50/box')).toBe(50)
    expect(extractRoundCount('Federal 9mm pk of 50')).toBe(50)
    expect(extractRoundCount('CCI .22LR pack of 100')).toBe(100)
    expect(extractRoundCount('Blazer 9mm 50pk')).toBe(50)
    expect(extractRoundCount('Speer Gold Dot 20-pk')).toBe(20)
    expect(extractRoundCount('Winchester 25-pack')).toBe(25)
  })

  it('extracts qty patterns', () => {
    expect(extractRoundCount('Federal 9mm FMJ qty 50')).toBe(50)
    expect(extractRoundCount('Hornady .308 qty: 20')).toBe(20)
  })

  it('extracts parenthetical count at end', () => {
    expect(extractRoundCount('Federal American Eagle 9mm 115gr FMJ (50)')).toBe(50)
    expect(extractRoundCount('Winchester .223 55gr (20)')).toBe(20)
  })

  it('does not false-match caliber dimensions', () => {
    // "7.62x39" should NOT extract 39 as round count
    expect(extractRoundCount('Federal 7.62x39mm 123gr SP')).toBeNull()
    // "5.56x45" should NOT extract 45 as round count
    expect(extractRoundCount('Winchester 5.56x45mm M855')).toBeNull()
    // "x50" notation intentionally not supported (too many false positives with model names)
    expect(extractRoundCount('Acme X50 Premium Ammo')).toBeNull()
  })

  it('extracts bulk/case patterns', () => {
    expect(extractRoundCount('Blazer Brass 9mm Bulk 1000')).toBe(1000)
    expect(extractRoundCount('Federal 9mm case of 500')).toBe(500)
  })

  it('rejects counts outside valid range', () => {
    expect(extractRoundCount('Test ammo 3 rounds')).toBeNull() // too small
    expect(extractRoundCount('Test ammo 15000 rounds')).toBeNull() // too large
  })
})

describe('deriveShotgunLoadType', () => {
  it('returns slug weight when present', () => {
    expect(deriveShotgunLoadType('Federal 12ga 1oz slug')).toBe('1oz Slug')
  })

  it('returns slug when weight is missing', () => {
    expect(deriveShotgunLoadType('Hornady 12 Gauge Slug - 25 Round Box')).toBe('Slug')
  })
})
