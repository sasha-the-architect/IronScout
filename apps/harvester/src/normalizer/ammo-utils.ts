import crypto from 'crypto'

/**
 * Ammunition Normalization Utilities
 *
 * Provides deterministic parsing and normalization of ammunition product data
 * to ensure proper consolidation across different retailers.
 */

// ============================================================================
// CALIBER NORMALIZATION
// ============================================================================

interface CaliberPattern {
  pattern: RegExp
  normalized: string
  aliases?: string[]
}

const CALIBER_PATTERNS: CaliberPattern[] = [
  // Pistol calibers
  { pattern: /\b9\s?mm|9x19|9\s?luger\b/i, normalized: '9mm' },
  { pattern: /(?:^|\s|\W)\.?\s?45\s?acp\b|45\s?acp\b/i, normalized: '.45 ACP' },
  { pattern: /(?:^|\s|\W)\.?\s?40\s?s&w\b|40\s?s&w\b/i, normalized: '.40 S&W' },
  { pattern: /(?:^|\s|\W)\.?\s?38\s?special\b|38\s?spl\b/i, normalized: '.38 Special' },
  { pattern: /(?:^|\s|\W)\.?\s?357\s?mag\b|357\s?magnum\b/i, normalized: '.357 Magnum' },
  { pattern: /(?:^|\s|\W)\.?\s?357\s?sig\b|357\s?sig\b/i, normalized: '.357 SIG' },
  { pattern: /\b10\s?mm|10mm\s?auto\b/i, normalized: '10mm Auto' },
  { pattern: /(?:^|\s|\W)\.?\s?380\s?acp\b|380\s?auto\b/i, normalized: '.380 ACP' },
  { pattern: /(?:^|\s|\W)\.?\s?32\s?acp\b|32\s?auto\b/i, normalized: '.32 ACP' },
  { pattern: /(?:^|\s|\W)\.?\s?25\s?acp\b|25\s?auto\b/i, normalized: '.25 ACP' },

  // Rimfire calibers
  { pattern: /(?:^|\s|\W)\.?\s?22\s?lr\b|22\s?long\s?rifle\b/i, normalized: '.22 LR' },
  { pattern: /(?:^|\s|\W)\.?\s?22\s?wmr\b|22\s?win(?:chester)?\s?mag(?:num)?\b|22\s?magnum\b/i, normalized: '.22 WMR' },
  { pattern: /(?:^|\s|\W)\.?\s?22\s?short\b/i, normalized: '.22 Short' },
  { pattern: /(?:^|\s|\W)\.?\s?17\s?hmr\b|17\s?hornady\s?mag(?:num)?\b/i, normalized: '.17 HMR' },
  { pattern: /(?:^|\s|\W)\.?\s?17\s?wsm\b|17\s?win(?:chester)?\s?super\s?mag\b/i, normalized: '.17 WSM' },
  { pattern: /(?:^|\s|\W)\.?\s?22\s?hornet\b/i, normalized: '.22 Hornet' },

  // Rifle calibers - 5.56/.223
  { pattern: /\b5\.56(?:\s?mm)?(?:\s?nato)?\b|5\.56x45(?:mm)?\b/i, normalized: '5.56 NATO' },
  { pattern: /(?:^|\s|\W)\.?\s?223\s?rem(?:ington)?\b/i, normalized: '.223 Remington' },

  // Rifle calibers - 7.62
  { pattern: /\b7\.62x39(?:mm)?\b/i, normalized: '7.62x39mm' },
  { pattern: /\b7\.62\s?nato|7\.62x51|(?:^|\s|\W)\.?\s?308\s?win(?:chester)?\b/i, normalized: '.308 Winchester' },
  { pattern: /\b7\.62x54r\b/i, normalized: '7.62x54R' },

  // Rifle calibers - .30
  { pattern: /(?:^|\s|\W)\.?\s?30-06\b|30-06\s?springfield\b/i, normalized: '.30-06 Springfield' },
  { pattern: /(?:^|\s|\W)\.?\s?30\s?carbine\b|30\s?carbine\b/i, normalized: '.30 Carbine' },

  // .300 variants (need context from name)
  { pattern: /(?:^|\s|\W)\.?\s?300\s?(?:aac\s*)?blk\b|300\s?(?:aac\s*)?blackout\b/i, normalized: '.300 Blackout' },
  { pattern: /(?:^|\s|\W)\.?\s?300\s?win\s?mag\b|300\s?winchester\s?mag\b/i, normalized: '.300 Winchester Magnum' },
  { pattern: /(?:^|\s|\W)\.?\s?300\s?wby\b|300\s?weatherby\b/i, normalized: '.300 Weatherby' },

  // Other rifle calibers
  { pattern: /\b6\.5\s?creedmoor|6\.5\s?cm\b/i, normalized: '6.5 Creedmoor' },
  { pattern: /\b6\.5\s?grendel\b/i, normalized: '6.5 Grendel' },
  { pattern: /(?:^|\s|\W)\.?\s?270\s?win(?:chester)?\b/i, normalized: '.270 Winchester' },
  { pattern: /(?:^|\s|\W)\.?\s?243\s?win(?:chester)?\b/i, normalized: '.243 Winchester' },
  { pattern: /(?:^|\s|\W)\.?\s?50\s?bmg\b|50\s?bmg\b/i, normalized: '.50 BMG' },

  // Shotgun gauges
  { pattern: /\b12\s?ga|12\s?gauge\b/i, normalized: '12 Gauge' },
  { pattern: /\b20\s?ga|20\s?gauge\b/i, normalized: '20 Gauge' },
  { pattern: /\b16\s?ga|16\s?gauge\b/i, normalized: '16 Gauge' },
  { pattern: /\b28\s?ga|28\s?gauge\b/i, normalized: '28 Gauge' },
  { pattern: /\b\.410\s?bore|410\s?bore\b/i, normalized: '.410 Bore' },
]

export function extractCaliber(productName: string): string | null {
  return normalizeCaliberString(productName)
}

export function normalizeCaliberString(value: string): string | null {
  if (!value) return null
  const name = value.toLowerCase()

  for (const { pattern, normalized } of CALIBER_PATTERNS) {
    if (pattern.test(name)) {
      return normalized
    }
  }

  return null
}

// ============================================================================
// GRAIN WEIGHT EXTRACTION
// ============================================================================

export function extractGrainWeight(productName: string): number | null {
  // Match patterns like "115gr", "124 gr", "55 grain", "62gn", "15.5gr"
  const patterns = [
    /(\d{2,3}(?:\.\d+)?)\s?gr(?:ain)?(?:s)?\b/i,
    /(\d{2,3}(?:\.\d+)?)\s?gn\b/i,  // "gn" variant (common in some feeds)
    /(\d{2,3}(?:\.\d+)?)-?grain/i,
    /(\d{2,3}(?:\.\d+)?)\s?grn\b/i, // "grn" variant
  ]

  for (const pattern of patterns) {
    const match = productName.match(pattern)
    if (match) {
      const grain = parseFloat(match[1])
      // Sanity check: typical ammo grains range from 15 to 800
      // (lowered min for .17 HMR which uses 15.5-20gr bullets)
      if (grain >= 15 && grain <= 800) {
        return grain
      }
    }
  }

  return null
}

// ============================================================================
// CASE MATERIAL DETECTION
// ============================================================================

export type CaseMaterial = 'Brass' | 'Steel' | 'Aluminum' | 'Nickel-Plated' | 'Polymer-Coated' | null

export function extractCaseMaterial(productName: string): CaseMaterial {
  const name = productName.toLowerCase()

  // Check for specific materials in order of specificity
  if (/nickel\s?plated|nickel-plated|ni-?plated/i.test(name)) {
    return 'Nickel-Plated'
  }

  if (/polymer\s?coat|poly-?coat/i.test(name)) {
    return 'Polymer-Coated'
  }

  if (/\bbrass\b/i.test(name)) {
    return 'Brass'
  }

  if (/\bsteel\b/i.test(name)) {
    return 'Steel'
  }

  if (/\baluminum|aluminium\b/i.test(name)) {
    return 'Aluminum'
  }

  return null
}

// ============================================================================
// PURPOSE CLASSIFICATION
// ============================================================================

export type AmmoPurpose = 'Target' | 'Defense' | 'Hunting' | 'Precision' | 'Training' | null

interface BulletTypeClassification {
  patterns: RegExp[]
  purpose: AmmoPurpose
  description: string
}

const BULLET_TYPE_CLASSIFICATIONS: BulletTypeClassification[] = [
  {
    patterns: [/\bfmj\b|full\s?metal\s?jacket/i],
    purpose: 'Target',
    description: 'Full Metal Jacket - range/training ammunition'
  },
  {
    patterns: [/\bjhp\b|jacketed\s?hollow\s?point|hollow\s?point/i],
    purpose: 'Defense',
    description: 'Jacketed Hollow Point - defensive ammunition'
  },
  {
    patterns: [/\bsp\b|soft\s?point/i],
    purpose: 'Hunting',
    description: 'Soft Point - hunting ammunition'
  },
  {
    patterns: [/\botm\b|open\s?tip\s?match|match\s?grade/i],
    purpose: 'Precision',
    description: 'Open Tip Match - precision/competition'
  },
  {
    patterns: [/\bvmax\b|v-max|ballistic\s?tip|polymer\s?tip/i],
    purpose: 'Hunting',
    description: 'Polymer tip - hunting/varmint'
  },
  {
    patterns: [/\blead\s?round\s?nose|lrn\b/i],
    purpose: 'Training',
    description: 'Lead Round Nose - training/practice'
  },
  {
    patterns: [/\btotal\s?metal\s?jacket|tmj\b/i],
    purpose: 'Training',
    description: 'Total Metal Jacket - indoor range safe'
  },
]

export function classifyPurpose(productName: string): AmmoPurpose {
  const name = productName.toLowerCase()

  for (const { patterns, purpose } of BULLET_TYPE_CLASSIFICATIONS) {
    for (const pattern of patterns) {
      if (pattern.test(name)) {
        return purpose
      }
    }
  }

  return null
}

// ============================================================================
// PRODUCT ID GENERATION
// ============================================================================

/**
 * Generate a canonical product ID for deduplication
 *
 * Priority:
 * 1. If UPC exists, use UPC as the product ID
 * 2. Otherwise, generate a deterministic hash from normalized attributes
 */
export function generateProductId(product: {
  upc?: string | null
  name: string
  caliber?: string | null
  grainWeight?: number | null
  brand?: string | null
}): string {
  // If UPC exists, use it as the canonical ID
  if (product.upc) {
    return normalizeUPC(product.upc)
  }

  // Otherwise, generate a hash from normalized attributes
  // This creates a deterministic ID for products without UPC
  const components = [
    product.brand?.toLowerCase().trim() || 'unknown',
    product.caliber?.toLowerCase().trim() || '',
    product.grainWeight?.toString() || '',
    normalizeProductName(product.name),
  ]

  const hashInput = components.filter(Boolean).join('_')
  const hash = crypto.createHash('sha256').update(hashInput).digest('hex')

  // Return a shorter, more readable ID
  return hash.substring(0, 16)
}

/**
 * Normalize UPC to a consistent format
 */
function normalizeUPC(upc: string): string {
  // Remove any non-digit characters
  const digits = upc.replace(/\D/g, '')

  // Pad UPC-A (12 digits) or UPC-E (6 or 8 digits)
  if (digits.length === 11) {
    return '0' + digits // Pad 11-digit UPC to 12
  }

  return digits
}

/**
 * Clean and normalize product name for hashing
 */
function normalizeProductName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove special chars
    .replace(/\s+/g, '_')    // Replace spaces with underscore
    .trim()
}

// ============================================================================
// ROUND COUNT EXTRACTION
// ============================================================================

export function extractRoundCount(productName: string): number | null {
  // Match patterns like "50 rounds", "100rd", "500 count", "20-count"
  // Also handles bulk/case patterns like "case of 500", "bulk 1000"
  const patterns = [
    // Standard patterns
    /(\d+)\s?(?:rounds?|rds?|count|ct)\b/i,
    /(\d+)-(?:round|rd|count|ct)\b/i,
    /box\s?of\s?(\d+)/i,
    // Bulk/case patterns
    /case\s?of\s?(\d+)/i,
    /(\d+)\s?(?:per\s?case|\/case)\b/i,
    /bulk\s?(\d+)/i,
    /(\d+)\s?(?:rd|round)s?\s?(?:bulk|case)\b/i,
    // Value pack patterns
    /value\s?pack\s?(?:of\s?)?(\d+)/i,
    /(\d+)\s?(?:rd|round)s?\s?value\s?pack/i,
    // Range pack patterns
    /range\s?pack\s?(?:of\s?)?(\d+)/i,
    /(\d+)\s?(?:rd|round)s?\s?range\s?pack/i,
    // Box/pack shorthand patterns
    /(\d+)\/box\b/i,                        // "20/box"
    /(?:pk|pack)\s?of\s?(\d+)/i,            // "pk of 20", "pack of 20"
    /(\d+)\s?-?\s?pk\b/i,                   // "20pk", "20-pk", "20 pk"
    /(\d+)\s?-?\s?pack\b/i,                 // "20-pack", "20 pack"
    /qty[:\s]*(\d+)/i,                      // "qty 20", "qty: 20"
    /\((\d+)\)\s*$/,                        // "(50)" at end of title
  ]

  for (const pattern of patterns) {
    const match = productName.match(pattern)
    if (match) {
      const count = parseInt(match[1], 10)
      // Sanity check: typical sizes range from 5 to 10000 (bulk cases)
      if (count >= 5 && count <= 10000) {
        return count
      }
    }
  }

  // Common defaults by caliber if not explicitly stated
  // This could be enhanced based on caliber
  return null
}

// ============================================================================
// SHOTGUN SIGNAL EXTRACTION
// ============================================================================

function parseMixedNumber(input: string): number | null {
  const normalized = input
    .replace(/\u00BC/g, '1/4')
    .replace(/\u00BD/g, '1/2')
    .replace(/\u00BE/g, '3/4')
    .trim()

  const mixed = normalized.match(/^(\d+)\s*[- ]\s*(\d+)\/(\d+)$/)
  if (mixed) {
    const whole = Number.parseInt(mixed[1], 10)
    const numerator = Number.parseInt(mixed[2], 10)
    const denominator = Number.parseInt(mixed[3], 10)
    if (Number.isFinite(whole) && Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0) {
      return whole + (numerator / denominator)
    }
  }

  const fraction = normalized.match(/^(\d+)\/(\d+)$/)
  if (fraction) {
    const numerator = Number.parseInt(fraction[1], 10)
    const denominator = Number.parseInt(fraction[2], 10)
    if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0) {
      return numerator / denominator
    }
  }

  const decimal = Number.parseFloat(normalized)
  if (Number.isFinite(decimal)) {
    return decimal
  }

  return null
}

function formatDecimal(value: number, maxDecimals: number): string {
  const fixed = value.toFixed(maxDecimals)
  return fixed.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1')
}

function formatOunces(value: number): string {
  return `${formatDecimal(value, 3)}oz`
}

function formatInches(value: number): string {
  return `${formatDecimal(value, 3)}in`
}

export function extractShotSize(productName: string): string | null {
  const name = productName.toLowerCase()

  const buckMatch = name.match(/(?:^|\s)(?:#|no\.?\s*)?(0{1,3}|[1-9](?:\.5)?)\s*(?:buck(?:shot)?)\b/i)
  if (buckMatch) {
    return `${buckMatch[1]} Buck`
  }

  const shotMatch = name.match(/(?:^|\s)(?:#|no\.?\s*)?([1-9](?:\.5)?)\s*(?:shot|birdshot)\b/i)
  if (shotMatch) {
    return `${shotMatch[1]} Shot`
  }

  return null
}

export function extractSlugWeight(productName: string): string | null {
  if (!/slug/i.test(productName)) return null
  const match = productName.match(/(\d+(?:\.\d+)?|\d+\s*[- ]\s*\d+\/\d+)\s?oz\b/i)
  if (!match) return null

  const parsed = parseMixedNumber(match[1])
  if (parsed == null) return null
  return formatOunces(parsed)
}

function extractShotWeight(productName: string): string | null {
  if (/slug/i.test(productName) || !/buck|shot/i.test(productName)) return null
  const match = productName.match(/(\d+(?:\.\d+)?|\d+\s*[- ]\s*\d+\/\d+)\s?oz\b/i)
  if (!match) return null

  const parsed = parseMixedNumber(match[1])
  if (parsed == null) return null
  return formatOunces(parsed)
}

export function extractShellLength(productName: string): string | null {
  const match = productName.match(/(\d+(?:\.\d+)?|\d+\s*[- ]\s*\d+\/\d+)\s*(?:in(?:ch)?|")/i)
  if (!match) return null

  const parsed = parseMixedNumber(match[1])
  if (parsed == null) return null
  return formatInches(parsed)
}

export function deriveShotgunLoadType(
  productName: string,
  shotSize?: string | null,
  slugWeight?: string | null
): string | null {
  const resolvedShotSize = shotSize ?? extractShotSize(productName)
  if (resolvedShotSize) return resolvedShotSize

  const resolvedSlugWeight = slugWeight ?? extractSlugWeight(productName)
  if (resolvedSlugWeight) return `${resolvedSlugWeight} Slug`

  if (/\bslug\b/i.test(productName)) {
    return 'Slug'
  }

  const shotWeight = extractShotWeight(productName)
  if (shotWeight) {
    return /buck/i.test(productName) ? `${shotWeight} Buck` : `${shotWeight} Shot`
  }

  return null
}

// ============================================================================
// COMPREHENSIVE NORMALIZATION
// ============================================================================

export interface NormalizedAmmo {
  productId: string
  name: string
  caliber: string | null
  grainWeight: number | null
  caseMaterial: CaseMaterial
  purpose: AmmoPurpose
  roundCount: number | null
  upc: string | null
  brand: string | null
}

export function normalizeAmmoProduct(product: {
  name: string
  upc?: string | null
  brand?: string | null
}): NormalizedAmmo {
  const caliber = extractCaliber(product.name)
  const grainWeight = extractGrainWeight(product.name)
  const caseMaterial = extractCaseMaterial(product.name)
  const purpose = classifyPurpose(product.name)
  const roundCount = extractRoundCount(product.name)
  const upc = product.upc || null
  const brand = product.brand || null

  const productId = generateProductId({
    upc,
    name: product.name,
    caliber,
    grainWeight,
    brand,
  })

  return {
    productId,
    name: product.name,
    caliber,
    grainWeight,
    caseMaterial,
    purpose,
    roundCount,
    upc,
    brand,
  }
}
