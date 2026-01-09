/**
 * Scale Test Data Generator
 *
 * Generates realistic retailer catalog data at various scales:
 * - Hobbyist: Under 300 SKUs (local/hobbyist retailer)
 * - Serious: 300-1,500 SKUs (serious online ammo seller)
 * - National: 1,500-5,000 SKUs (scaled national operation)
 * - TopTier: 5,000+ SKUs (top-tier ammo-first business)
 *
 * The generator creates realistic ammunition data with:
 * - Varied calibers, brands, and bullet types
 * - Realistic pricing with market variations
 * - Mix of in-stock and out-of-stock items
 * - Various data quality issues (missing UPCs, invalid prices, etc.)
 */

import type { ParsedFeedRecord } from '../connectors/types'

// ============================================================================
// CATALOG SIZE TIERS
// ============================================================================

export type MerchantTier = 'hobbyist' | 'serious' | 'national' | 'top-tier'

export const TIER_CONFIG = {
  hobbyist: {
    minSkus: 50,
    maxSkus: 299,
    defaultSkus: 150,
    description: 'Under 300 SKUs - local/hobbyist retailer',
    expectedParseTimeMs: 500, // sub-second
    expectedMemoryMb: 50,
  },
  serious: {
    minSkus: 300,
    maxSkus: 1499,
    defaultSkus: 800,
    description: '300-1,500 SKUs - serious online ammo seller',
    expectedParseTimeMs: 2000, // 2 seconds
    expectedMemoryMb: 100,
  },
  national: {
    minSkus: 1500,
    maxSkus: 4999,
    defaultSkus: 3000,
    description: '1,500-5,000 SKUs - scaled national operation',
    expectedParseTimeMs: 10000, // 10 seconds
    expectedMemoryMb: 250,
  },
  'top-tier': {
    minSkus: 5000,
    maxSkus: 50000,
    defaultSkus: 10000,
    description: '5,000+ SKUs - top-tier ammo-first business',
    expectedParseTimeMs: 60000, // 60 seconds
    expectedMemoryMb: 500,
  },
} as const

// ============================================================================
// AMMUNITION DATA CONSTANTS
// ============================================================================

export const CALIBERS = [
  // Handgun - most common
  { name: '9mm Luger', alias: ['9mm', '9x19mm', '9mm Parabellum'], grainRange: [115, 147], popularity: 0.25 },
  { name: '.45 ACP', alias: ['45 Auto', '.45 Auto'], grainRange: [185, 230], popularity: 0.12 },
  { name: '.40 S&W', alias: ['40 SW', '.40 Smith & Wesson'], grainRange: [155, 180], popularity: 0.08 },
  { name: '.380 ACP', alias: ['380 Auto', '.380 Auto'], grainRange: [90, 100], popularity: 0.07 },
  { name: '.38 Special', alias: ['38 Spl', '.38 Spl'], grainRange: [110, 158], popularity: 0.05 },
  { name: '.357 Magnum', alias: ['357 Mag', '.357 Mag'], grainRange: [125, 180], popularity: 0.04 },
  { name: '10mm Auto', alias: ['10mm'], grainRange: [155, 200], popularity: 0.03 },

  // Rifle - common
  { name: '5.56x45mm NATO', alias: ['5.56', '.223/5.56', '5.56 NATO'], grainRange: [55, 77], popularity: 0.10 },
  { name: '.223 Remington', alias: ['.223 Rem', '.223'], grainRange: [55, 77], popularity: 0.08 },
  { name: '.308 Winchester', alias: ['308 Win', '.308 Win'], grainRange: [147, 180], popularity: 0.06 },
  { name: '7.62x39mm', alias: ['7.62x39', '7.62 Soviet'], grainRange: [122, 154], popularity: 0.05 },
  { name: '.300 Blackout', alias: ['.300 BLK', '300 AAC'], grainRange: [110, 220], popularity: 0.04 },
  { name: '6.5 Creedmoor', alias: ['6.5 CM', '6.5mm Creedmoor'], grainRange: [120, 147], popularity: 0.03 },

  // Shotgun
  { name: '12 Gauge', alias: ['12 GA', '12ga'], grainRange: [1, 1], popularity: 0.06 }, // Uses oz for shot
  { name: '20 Gauge', alias: ['20 GA', '20ga'], grainRange: [1, 1], popularity: 0.02 },

  // Rimfire
  { name: '.22 LR', alias: ['22 LR', '.22 Long Rifle'], grainRange: [32, 40], popularity: 0.08 },
  { name: '.22 WMR', alias: ['22 Mag', '.22 Magnum'], grainRange: [30, 50], popularity: 0.01 },

  // Less common
  { name: '.30-06 Springfield', alias: ['.30-06', '30-06'], grainRange: [150, 180], popularity: 0.02 },
  { name: '.270 Winchester', alias: ['.270 Win', '270 Win'], grainRange: [130, 150], popularity: 0.01 },
  { name: '.243 Winchester', alias: ['.243 Win', '243 Win'], grainRange: [55, 100], popularity: 0.01 },
]

export const BRANDS = [
  { name: 'Federal', aliases: ['Federal Premium', 'Federal American Eagle'], popularity: 0.15 },
  { name: 'Hornady', aliases: ['Hornady Critical Duty', 'Hornady Critical Defense'], popularity: 0.12 },
  { name: 'Winchester', aliases: ['Winchester USA', 'Winchester Ranger'], popularity: 0.12 },
  { name: 'Remington', aliases: ['Remington UMC'], popularity: 0.10 },
  { name: 'CCI', aliases: ['CCI Blazer', 'Blazer Brass'], popularity: 0.08 },
  { name: 'PMC', aliases: ['PMC Bronze', 'PMC X-TAC'], popularity: 0.06 },
  { name: 'Speer', aliases: ['Speer Gold Dot', 'Speer Lawman'], popularity: 0.06 },
  { name: 'Fiocchi', aliases: [], popularity: 0.05 },
  { name: 'Aguila', aliases: [], popularity: 0.04 },
  { name: 'Sellier & Bellot', aliases: ['S&B', 'Sellier Bellot'], popularity: 0.04 },
  { name: 'Magtech', aliases: [], popularity: 0.04 },
  { name: 'Norma', aliases: ['Norma MHP', 'Norma Range & Training'], popularity: 0.03 },
  { name: 'Underwood', aliases: ['Underwood Ammo'], popularity: 0.02 },
  { name: 'Sig Sauer', aliases: ['SIG', 'SIG V-Crown'], popularity: 0.03 },
  { name: 'Barnes', aliases: ['Barnes VOR-TX'], popularity: 0.02 },
  { name: 'Nosler', aliases: ['Nosler Defense'], popularity: 0.02 },
  { name: 'Buffalo Bore', aliases: [], popularity: 0.01 },
  { name: 'Black Hills', aliases: ['Black Hills Ammunition'], popularity: 0.01 },
]

export const BULLET_TYPES = [
  { name: 'FMJ', fullName: 'Full Metal Jacket', popularity: 0.35, purpose: 'range' },
  { name: 'JHP', fullName: 'Jacketed Hollow Point', popularity: 0.20, purpose: 'defense' },
  { name: 'HP', fullName: 'Hollow Point', popularity: 0.10, purpose: 'defense' },
  { name: 'TMJ', fullName: 'Total Metal Jacket', popularity: 0.05, purpose: 'range' },
  { name: 'BTHP', fullName: 'Boat Tail Hollow Point', popularity: 0.05, purpose: 'precision' },
  { name: 'SP', fullName: 'Soft Point', popularity: 0.05, purpose: 'hunting' },
  { name: 'FTX', fullName: 'Flex Tip Expanding', popularity: 0.03, purpose: 'defense' },
  { name: 'HST', fullName: 'HST', popularity: 0.03, purpose: 'defense' },
  { name: 'V-MAX', fullName: 'V-Max', popularity: 0.03, purpose: 'varmint' },
  { name: 'XTP', fullName: 'eXtreme Terminal Performance', popularity: 0.02, purpose: 'defense' },
  { name: 'HPBT', fullName: 'Hollow Point Boat Tail', popularity: 0.02, purpose: 'precision' },
  { name: 'Lead', fullName: 'Lead Round Nose', popularity: 0.02, purpose: 'range' },
  { name: 'Frangible', fullName: 'Frangible', popularity: 0.01, purpose: 'training' },
  { name: 'AP', fullName: 'Armor Piercing', popularity: 0.01, purpose: 'specialty' },
  { name: 'Tracer', fullName: 'Tracer', popularity: 0.01, purpose: 'specialty' },
  { name: 'Subsonic', fullName: 'Subsonic', popularity: 0.02, purpose: 'suppressed' },
]

export const CASE_TYPES = [
  { name: 'Brass', popularity: 0.70 },
  { name: 'Steel', popularity: 0.15 },
  { name: 'Aluminum', popularity: 0.10 },
  { name: 'Nickel', popularity: 0.05 },
]

export const PACK_SIZES = [20, 25, 50, 100, 200, 250, 500, 1000]

// ============================================================================
// DATA QUALITY SIMULATION
// ============================================================================

export interface DataQualityConfig {
  /** Percentage of records missing UPC (0-1) */
  missingUpcRate: number
  /** Percentage of records with invalid UPC (0-1) */
  invalidUpcRate: number
  /** Percentage of records missing price (0-1) */
  missingPriceRate: number
  /** Percentage of records with invalid price (0-1) */
  invalidPriceRate: number
  /** Percentage of records missing title (0-1) */
  missingTitleRate: number
  /** Percentage of records with price requiring coercion (0-1) */
  priceCoercionRate: number
  /** Percentage of records with boolean coercion needed (0-1) */
  booleanCoercionRate: number
  /** Percentage of records with special characters (0-1) */
  specialCharRate: number
  /** Percentage of out-of-stock items (0-1) */
  outOfStockRate: number
}

export const QUALITY_PROFILES: Record<string, DataQualityConfig> = {
  // Professional feed with minimal issues
  excellent: {
    missingUpcRate: 0.01,
    invalidUpcRate: 0.005,
    missingPriceRate: 0.001,
    invalidPriceRate: 0.002,
    missingTitleRate: 0.001,
    priceCoercionRate: 0.05,
    booleanCoercionRate: 0.10,
    specialCharRate: 0.02,
    outOfStockRate: 0.15,
  },
  // Typical retailer feed
  good: {
    missingUpcRate: 0.05,
    invalidUpcRate: 0.02,
    missingPriceRate: 0.01,
    invalidPriceRate: 0.01,
    missingTitleRate: 0.005,
    priceCoercionRate: 0.15,
    booleanCoercionRate: 0.25,
    specialCharRate: 0.05,
    outOfStockRate: 0.20,
  },
  // Feed with some issues
  fair: {
    missingUpcRate: 0.15,
    invalidUpcRate: 0.05,
    missingPriceRate: 0.03,
    invalidPriceRate: 0.03,
    missingTitleRate: 0.02,
    priceCoercionRate: 0.30,
    booleanCoercionRate: 0.40,
    specialCharRate: 0.10,
    outOfStockRate: 0.30,
  },
  // Problematic feed
  poor: {
    missingUpcRate: 0.30,
    invalidUpcRate: 0.10,
    missingPriceRate: 0.05,
    invalidPriceRate: 0.05,
    missingTitleRate: 0.03,
    priceCoercionRate: 0.50,
    booleanCoercionRate: 0.60,
    specialCharRate: 0.15,
    outOfStockRate: 0.40,
  },
}

// ============================================================================
// RANDOM HELPERS
// ============================================================================

function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
}

function weightedRandom<T extends { popularity: number }>(items: T[], random: () => number): T {
  const totalWeight = items.reduce((sum, item) => sum + item.popularity, 0)
  let r = random() * totalWeight

  for (const item of items) {
    r -= item.popularity
    if (r <= 0) return item
  }

  return items[items.length - 1]
}

function randomInt(min: number, max: number, random: () => number): number {
  return Math.floor(random() * (max - min + 1)) + min
}

function randomElement<T>(arr: T[], random: () => number): T {
  return arr[Math.floor(random() * arr.length)]
}

// ============================================================================
// PRODUCT GENERATORS
// ============================================================================

export interface GeneratedProduct {
  upc?: string
  sku: string
  title: string
  description: string
  brand: string
  caliber: string
  grainWeight?: number
  bulletType: string
  caseType: string
  roundCount: number
  price: number | string // May be string for coercion testing
  inStock: boolean | string // May be string for coercion testing
  quantity?: number
  productUrl: string
  imageUrl: string
  // For testing validation
  _expectedValid: boolean
  _expectedQuarantine: boolean
  _expectedReject: boolean
}

function generateUpc(index: number, random: () => number): string {
  // Generate realistic UPC-A (12 digits) or EAN-13 (13 digits)
  const useEan = random() > 0.7
  const baseNum = 100000000000 + index
  const upc = String(baseNum).padStart(useEan ? 13 : 12, '0')
  return upc.slice(0, useEan ? 13 : 12)
}

function generateSku(brand: string, caliber: string, index: number): string {
  const brandCode = brand.substring(0, 3).toUpperCase()
  const calCode = caliber.replace(/[^a-zA-Z0-9]/g, '').substring(0, 4).toUpperCase()
  return `${brandCode}-${calCode}-${String(index).padStart(6, '0')}`
}

function generatePrice(caliber: string, packSize: number, bulletType: string, random: () => number): number {
  // Base price per round varies by caliber
  const basePrices: Record<string, number> = {
    '9mm Luger': 0.25,
    '.45 ACP': 0.45,
    '.40 S&W': 0.35,
    '.380 ACP': 0.35,
    '.38 Special': 0.40,
    '.357 Magnum': 0.55,
    '10mm Auto': 0.50,
    '5.56x45mm NATO': 0.45,
    '.223 Remington': 0.40,
    '.308 Winchester': 0.90,
    '7.62x39mm': 0.35,
    '.300 Blackout': 0.80,
    '6.5 Creedmoor': 1.20,
    '12 Gauge': 0.50,
    '20 Gauge': 0.55,
    '.22 LR': 0.08,
    '.22 WMR': 0.25,
    '.30-06 Springfield': 1.10,
    '.270 Winchester': 1.30,
    '.243 Winchester': 1.20,
  }

  let basePrice = basePrices[caliber] || 0.40

  // Adjust for bullet type
  const premiumTypes = ['JHP', 'HP', 'FTX', 'HST', 'XTP', 'BTHP', 'HPBT']
  if (premiumTypes.includes(bulletType)) {
    basePrice *= 1.5 + random() * 0.5
  }

  // Calculate total with market variation
  const variation = 0.85 + random() * 0.30 // +/- 15%
  const totalPrice = basePrice * packSize * variation

  // Round to common price points
  return Math.round(totalPrice * 100) / 100
}

function generateTitle(
  brand: string,
  caliber: string,
  grain: number | undefined,
  bulletType: string,
  packSize: number
): string {
  const grainStr = grain ? ` ${grain}gr` : ''
  return `${brand} ${caliber}${grainStr} ${bulletType} - ${packSize} Rounds`
}

function generateDescription(
  brand: string,
  caliber: string,
  grain: number | undefined,
  bulletType: string,
  caseType: string,
  packSize: number
): string {
  const purpose = BULLET_TYPES.find(b => b.name === bulletType)?.purpose || 'general'
  const purposeText = {
    range: 'Perfect for target practice and training',
    defense: 'Designed for personal defense applications',
    hunting: 'Optimized for hunting and game harvesting',
    precision: 'Match-grade accuracy for competitive shooting',
    varmint: 'Ideal for varmint and small game hunting',
    training: 'Safe for use in indoor ranges and training facilities',
    specialty: 'Specialized ammunition for specific applications',
    suppressed: 'Optimized for use with suppressors',
    general: 'Quality ammunition for various applications',
  }

  return `${brand} ${caliber} ammunition featuring ${bulletType} bullets. ` +
    `${purposeText[purpose as keyof typeof purposeText]}. ` +
    `${caseType} casing, ${packSize} rounds per box.` +
    (grain ? ` Bullet weight: ${grain} grains.` : '')
}

// ============================================================================
// MAIN GENERATOR
// ============================================================================

export interface GeneratorOptions {
  tier: MerchantTier
  count?: number
  quality?: keyof typeof QUALITY_PROFILES
  seed?: number
  format?: 'json' | 'csv' | 'xml'
}

export interface GeneratedFeed {
  content: string
  format: 'json' | 'csv' | 'xml'
  products: GeneratedProduct[]
  stats: {
    total: number
    expectedIndexable: number
    expectedQuarantine: number
    expectedReject: number
    tier: MerchantTier
    quality: string
  }
}

export function generateRetailerFeed(options: GeneratorOptions): GeneratedFeed {
  const { tier, quality = 'good', seed = Date.now(), format = 'json' } = options
  const config = TIER_CONFIG[tier]
  const qualityConfig = QUALITY_PROFILES[quality]

  const count = options.count ?? config.defaultSkus
  const random = seededRandom(seed)

  const products: GeneratedProduct[] = []
  let expectedIndexable = 0
  let expectedQuarantine = 0
  let expectedReject = 0

  for (let i = 0; i < count; i++) {
    const caliber = weightedRandom(CALIBERS, random)
    const brand = weightedRandom(BRANDS, random)
    const bulletType = weightedRandom(BULLET_TYPES, random)
    const caseType = weightedRandom(CASE_TYPES, random)
    const packSize = randomElement(PACK_SIZES, random)
    const grain = caliber.name.includes('Gauge') ? undefined : randomInt(caliber.grainRange[0], caliber.grainRange[1], random)

    // Determine data quality issues for this record
    const hasMissingUpc = random() < qualityConfig.missingUpcRate
    const hasInvalidUpc = !hasMissingUpc && random() < qualityConfig.invalidUpcRate
    const hasMissingPrice = random() < qualityConfig.missingPriceRate
    const hasInvalidPrice = !hasMissingPrice && random() < qualityConfig.invalidPriceRate
    const hasMissingTitle = random() < qualityConfig.missingTitleRate
    const needsPriceCoercion = !hasMissingPrice && !hasInvalidPrice && random() < qualityConfig.priceCoercionRate
    const needsBooleanCoercion = random() < qualityConfig.booleanCoercionRate
    const hasSpecialChars = random() < qualityConfig.specialCharRate
    const outOfStock = random() < qualityConfig.outOfStockRate

    // Generate base product
    const baseTitle = generateTitle(brand.name, caliber.name, grain, bulletType.name, packSize)
    const title = hasMissingTitle ? '' : (hasSpecialChars ? addSpecialChars(baseTitle, random) : baseTitle)

    const basePrice = generatePrice(caliber.name, packSize, bulletType.name, random)
    let price: number | string = hasMissingPrice ? 0 : (hasInvalidPrice ? -1 : basePrice)
    if (needsPriceCoercion && !hasMissingPrice && !hasInvalidPrice) {
      price = formatPriceForCoercion(basePrice, random)
    }

    let upc: string | undefined = undefined
    if (!hasMissingUpc) {
      upc = hasInvalidUpc ? generateInvalidUpc(random) : generateUpc(i, random)
    }

    let inStock: boolean | string = !outOfStock
    if (needsBooleanCoercion) {
      inStock = formatBooleanForCoercion(!outOfStock, random)
    }

    // Determine expected classification
    const hasValidUpc = !!(upc && !hasInvalidUpc)
    const hasValidPrice = !hasMissingPrice && !hasInvalidPrice && basePrice > 0
    const hasValidTitle = !hasMissingTitle

    const _expectedValid: boolean = hasValidUpc && hasValidPrice && hasValidTitle
    const _expectedQuarantine: boolean = !hasValidUpc && hasValidPrice && hasValidTitle
    const _expectedReject: boolean = !hasValidPrice || !hasValidTitle

    if (_expectedValid) expectedIndexable++
    else if (_expectedQuarantine) expectedQuarantine++
    else expectedReject++

    products.push({
      upc,
      sku: generateSku(brand.name, caliber.name, i),
      title,
      description: generateDescription(brand.name, caliber.name, grain, bulletType.name, caseType.name, packSize),
      brand: brand.name,
      caliber: caliber.name,
      grainWeight: grain,
      bulletType: bulletType.name,
      caseType: caseType.name,
      roundCount: packSize,
      price,
      inStock,
      quantity: outOfStock ? 0 : randomInt(1, 1000, random),
      productUrl: `https://example.com/products/${i}`,
      imageUrl: `https://example.com/images/${i}.jpg`,
      _expectedValid,
      _expectedQuarantine,
      _expectedReject,
    })
  }

  // Convert to requested format
  const content = formatFeed(products, format)

  return {
    content,
    format,
    products,
    stats: {
      total: count,
      expectedIndexable,
      expectedQuarantine,
      expectedReject,
      tier,
      quality,
    },
  }
}

// ============================================================================
// FORMAT HELPERS
// ============================================================================

function addSpecialChars(text: string, random: () => number): string {
  const specialChars = ['®', '™', '&', '"', "'", '<', '>', 'é', 'ñ', '—']
  const char = randomElement(specialChars, random)
  const insertPos = Math.floor(random() * text.length)
  return text.slice(0, insertPos) + char + text.slice(insertPos)
}

function formatPriceForCoercion(price: number, random: () => number): string {
  const formats = [
    `$${price.toFixed(2)}`,
    `${price.toFixed(2)} USD`,
    `$ ${price.toFixed(2)}`,
    `  $${price.toFixed(2)}  `,
    price >= 1000 ? `${Math.floor(price / 1000)},${String(price % 1000).padStart(3, '0')}.${String(Math.round((price % 1) * 100)).padStart(2, '0')}` : `${price.toFixed(2)}`,
  ]
  return randomElement(formats, random)
}

function formatBooleanForCoercion(value: boolean, random: () => number): string {
  const trueFormats = ['yes', 'true', '1', 'in stock', 'available', 'YES', 'True', 'In Stock']
  const falseFormats = ['no', 'false', '0', 'out of stock', 'unavailable', 'NO', 'False', 'Out of Stock']
  return randomElement(value ? trueFormats : falseFormats, random)
}

function generateInvalidUpc(random: () => number): string {
  const types = [
    '123', // Too short
    '12345', // Still too short
    '123456789012345', // Too long
    'ABCDEFGHIJKL', // Non-numeric
    'ABC12345DEF', // Mixed
  ]
  return randomElement(types, random)
}

function formatFeed(products: GeneratedProduct[], format: 'json' | 'csv' | 'xml'): string {
  switch (format) {
    case 'json':
      return formatAsJson(products)
    case 'csv':
      return formatAsCsv(products)
    case 'xml':
      return formatAsXml(products)
  }
}

function formatAsJson(products: GeneratedProduct[]): string {
  const cleanProducts = products.map(p => ({
    upc: p.upc,
    sku: p.sku,
    title: p.title,
    description: p.description,
    brand: p.brand,
    caliber: p.caliber,
    grain: p.grainWeight,
    bullet_type: p.bulletType,
    case_type: p.caseType,
    round_count: p.roundCount,
    price: p.price,
    in_stock: p.inStock,
    quantity: p.quantity,
    url: p.productUrl,
    image_url: p.imageUrl,
  }))

  return JSON.stringify({ products: cleanProducts }, null, 0) // No indent for size efficiency
}

function formatAsCsv(products: GeneratedProduct[]): string {
  const headers = [
    'upc', 'sku', 'title', 'description', 'brand', 'caliber', 'grain',
    'bullet_type', 'case_type', 'round_count', 'price', 'in_stock', 'quantity', 'url', 'image_url'
  ]

  const rows = products.map(p => {
    const values = [
      p.upc || '',
      p.sku,
      escapeCsvValue(p.title),
      escapeCsvValue(p.description),
      p.brand,
      p.caliber,
      p.grainWeight?.toString() || '',
      p.bulletType,
      p.caseType,
      p.roundCount.toString(),
      String(p.price),
      String(p.inStock),
      p.quantity?.toString() || '',
      p.productUrl,
      p.imageUrl,
    ]
    return values.join(',')
  })

  return [headers.join(','), ...rows].join('\n')
}

function escapeCsvValue(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function formatAsXml(products: GeneratedProduct[]): string {
  const xmlProducts = products.map(p => {
    const fields = [
      p.upc ? `    <upc>${escapeXml(p.upc)}</upc>` : '',
      `    <sku>${escapeXml(p.sku)}</sku>`,
      `    <title>${escapeXml(p.title)}</title>`,
      `    <description>${escapeXml(p.description)}</description>`,
      `    <brand>${escapeXml(p.brand)}</brand>`,
      `    <caliber>${escapeXml(p.caliber)}</caliber>`,
      p.grainWeight ? `    <grain>${p.grainWeight}</grain>` : '',
      `    <bullet_type>${escapeXml(p.bulletType)}</bullet_type>`,
      `    <case_type>${escapeXml(p.caseType)}</case_type>`,
      `    <round_count>${p.roundCount}</round_count>`,
      `    <price>${p.price}</price>`,
      `    <in_stock>${p.inStock}</in_stock>`,
      p.quantity !== undefined ? `    <quantity>${p.quantity}</quantity>` : '',
      `    <url>${escapeXml(p.productUrl)}</url>`,
      `    <image_url>${escapeXml(p.imageUrl)}</image_url>`,
    ].filter(Boolean).join('\n')

    return `  <product>\n${fields}\n  </product>`
  }).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>\n<products>\n${xmlProducts}\n</products>`
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// ============================================================================
// PERFORMANCE UTILITIES
// ============================================================================

export interface PerformanceMetrics {
  parseTimeMs: number
  memoryUsedMb: number
  throughputPerSecond: number
  peakMemoryMb?: number
}

export function measurePerformance(
  fn: () => void | Promise<void>
): Promise<PerformanceMetrics> {
  return new Promise(async (resolve) => {
    // Force garbage collection if available
    if (global.gc) {
      global.gc()
    }

    const memoryBefore = process.memoryUsage().heapUsed
    const startTime = performance.now()

    await fn()

    const endTime = performance.now()
    const memoryAfter = process.memoryUsage().heapUsed

    const parseTimeMs = endTime - startTime
    const memoryUsedMb = (memoryAfter - memoryBefore) / 1024 / 1024

    resolve({
      parseTimeMs,
      memoryUsedMb: Math.max(0, memoryUsedMb), // Can be negative due to GC
      throughputPerSecond: 0, // Will be calculated by caller
    })
  })
}

export function formatMetrics(metrics: PerformanceMetrics, itemCount: number): string {
  const throughput = itemCount / (metrics.parseTimeMs / 1000)
  return [
    `Time: ${metrics.parseTimeMs.toFixed(2)}ms`,
    `Memory: ${metrics.memoryUsedMb.toFixed(2)}MB`,
    `Throughput: ${throughput.toFixed(0)} items/sec`,
  ].join(' | ')
}
