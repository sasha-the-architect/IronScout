/**
 * Domain knowledge for ammunition
 * Used by the AI intent parser to understand user queries
 */

// Common platform-to-caliber mappings
export const PLATFORM_CALIBER_MAP: Record<string, string[]> = {
  // Rifles
  'ar15': ['.223 Remington', '5.56 NATO', '.223/5.56'],
  'ar-15': ['.223 Remington', '5.56 NATO', '.223/5.56'],
  'ar10': ['.308 Winchester', '7.62 NATO', '.308/7.62'],
  'ar-10': ['.308 Winchester', '7.62 NATO', '.308/7.62'],
  'ak47': ['7.62x39mm'],
  'ak-47': ['7.62x39mm'],
  'ak74': ['5.45x39mm'],
  'ak-74': ['5.45x39mm'],
  'mini-14': ['.223 Remington', '5.56 NATO'],
  'sks': ['7.62x39mm'],
  'm1 garand': ['.30-06 Springfield'],
  'm1a': ['.308 Winchester', '7.62 NATO'],
  'mosin nagant': ['7.62x54R'],
  
  // Handguns
  'glock 19': ['9mm Luger'],
  'glock 17': ['9mm Luger'],
  'glock 43': ['9mm Luger'],
  '1911': ['.45 ACP'],
  'beretta 92': ['9mm Luger'],
  'sig p365': ['9mm Luger'],
  'sig p320': ['9mm Luger'],
  'smith & wesson shield': ['9mm Luger', '.40 S&W'],
  'revolver': ['.38 Special', '.357 Magnum', '.44 Magnum'],
  
  // Shotguns
  'shotgun': ['12 Gauge', '20 Gauge'],
  'mossberg 500': ['12 Gauge', '20 Gauge'],
  'remington 870': ['12 Gauge', '20 Gauge'],
  'benelli m4': ['12 Gauge'],
}

// Purpose/use-case mappings with synonyms
export const PURPOSE_SYNONYMS: Record<string, string> = {
  // Target/Practice
  'target': 'Target',
  'practice': 'Target',
  'training': 'Target',
  'range': 'Target',
  'plinking': 'Target',
  'recreational': 'Target',
  'competition': 'Target',
  'match': 'Target',
  
  // Defense
  'defense': 'Defense',
  'self-defense': 'Defense',
  'self defense': 'Defense',
  'home defense': 'Defense',
  'protection': 'Defense',
  'carry': 'Defense',
  'ccw': 'Defense',
  'edc': 'Defense',
  'tactical': 'Defense',
  
  // Hunting
  'hunting': 'Hunting',
  'hunt': 'Hunting',
  'deer': 'Hunting',
  'elk': 'Hunting',
  'varmint': 'Hunting',
  'hog': 'Hunting',
  'predator': 'Hunting',
  'game': 'Hunting',
}

// Caliber aliases and normalizations
export const CALIBER_ALIASES: Record<string, string[]> = {
  '9mm': ['9mm Luger', '9mm', '9x19mm', '9mm Parabellum'],
  '9mm luger': ['9mm Luger', '9mm', '9x19mm'],
  '.223': ['.223 Remington', '.223/5.56', '5.56 NATO'],
  '5.56': ['5.56 NATO', '.223/5.56', '.223 Remington'],
  '.308': ['.308 Winchester', '.308/7.62', '7.62 NATO'],
  '7.62': ['7.62 NATO', '.308/7.62', '.308 Winchester', '7.62x39mm', '7.62x51mm'],
  '.45': ['.45 ACP', '.45 Auto'],
  '.45 acp': ['.45 ACP', '.45 Auto'],
  '.40': ['.40 S&W'],
  '.40 s&w': ['.40 S&W'],
  '.380': ['.380 ACP', '.380 Auto'],
  '12ga': ['12 Gauge'],
  '12 gauge': ['12 Gauge'],
  '20ga': ['20 Gauge'],
  '20 gauge': ['20 Gauge'],
  '.22': ['.22 LR', '.22 Long Rifle'],
  '.22lr': ['.22 LR', '.22 Long Rifle'],
  '.30-06': ['.30-06 Springfield'],
  '6.5 creedmoor': ['6.5 Creedmoor'],
  '.300 blackout': ['.300 AAC Blackout', '.300 BLK'],
  '.300 blk': ['.300 AAC Blackout', '.300 BLK'],
}

// Range preferences - maps to grain weight recommendations
export const RANGE_GRAIN_PREFERENCES: Record<string, { weight: 'light' | 'medium' | 'heavy', reason: string }> = {
  'long range': { weight: 'heavy', reason: 'Heavier bullets maintain velocity and resist wind better at distance' },
  'long-range': { weight: 'heavy', reason: 'Heavier bullets maintain velocity and resist wind better at distance' },
  'distance': { weight: 'heavy', reason: 'Heavier bullets maintain velocity and resist wind better at distance' },
  'precision': { weight: 'heavy', reason: 'Heavier match-grade bullets offer better accuracy' },
  'short range': { weight: 'light', reason: 'Lighter bullets have faster velocity for close targets' },
  'close range': { weight: 'light', reason: 'Lighter bullets have faster velocity for close targets' },
  'cqb': { weight: 'light', reason: 'Lighter bullets for faster target acquisition' },
}

// Grain weight ranges by caliber
export const CALIBER_GRAIN_RANGES: Record<string, { light: number[], medium: number[], heavy: number[] }> = {
  '9mm': { light: [115], medium: [124], heavy: [147] },
  '.223/5.56': { light: [55], medium: [62, 64], heavy: [69, 77] },
  '.308/7.62': { light: [147, 150], medium: [165, 168], heavy: [175, 180] },
  '.45 ACP': { light: [185], medium: [200], heavy: [230] },
  '.40 S&W': { light: [155], medium: [165], heavy: [180] },
}

// Quality indicators in product names
export const QUALITY_INDICATORS = {
  matchGrade: ['match', 'sierra', 'matchking', 'smk', 'gold medal', 'berger', 'lapua', 'hornady match', 'eld-m', 'nosler', 'bthp'],
  budget: ['steel case', 'steel-case', 'wolf', 'tula', 'barnaul', 'brown bear'],
  premium: ['brass', 'nickel', 'federal premium', 'hornady', 'speer gold dot', 'barnes'],
}

// Case material preferences by use
export const CASE_MATERIAL_BY_PURPOSE: Record<string, string[]> = {
  'Target': ['Brass', 'Steel'], // Steel OK for practice
  'Defense': ['Brass', 'Nickel'], // Reliability matters
  'Hunting': ['Brass'], // Quality matters
  'competition': ['Brass', 'Nickel'], // Consistency matters
}

/**
 * Get recommended grain weights for a caliber and purpose
 */
export function getRecommendedGrains(caliber: string, purpose: string, range?: string): number[] {
  const normalizedCaliber = Object.keys(CALIBER_GRAIN_RANGES).find(c => 
    caliber.toLowerCase().includes(c.toLowerCase()) ||
    c.toLowerCase().includes(caliber.toLowerCase())
  )
  
  if (!normalizedCaliber) return []
  
  const ranges = CALIBER_GRAIN_RANGES[normalizedCaliber]
  if (!ranges) return []
  
  // If long range specified, prefer heavy
  if (range && RANGE_GRAIN_PREFERENCES[range.toLowerCase()]?.weight === 'heavy') {
    return ranges.heavy
  }
  
  // By purpose
  switch (purpose) {
    case 'Defense':
      return [...ranges.medium, ...ranges.heavy] // JHP typically in medium-heavy
    case 'Hunting':
      return [...ranges.medium, ...ranges.heavy]
    case 'Target':
    default:
      return [...ranges.light, ...ranges.medium] // FMJ typically lighter, but match can be heavy
  }
}

/**
 * Extract caliber from platform mention
 */
export function getCalibrFromPlatform(platform: string): string[] {
  const normalized = platform.toLowerCase().trim()
  return PLATFORM_CALIBER_MAP[normalized] || []
}

/**
 * Normalize purpose from synonyms
 */
export function normalizePurpose(input: string): string | null {
  const normalized = input.toLowerCase().trim()
  return PURPOSE_SYNONYMS[normalized] || null
}

/**
 * Get all possible caliber variations
 */
export function getCaliberVariations(caliber: string): string[] {
  const normalized = caliber.toLowerCase().trim()
  return CALIBER_ALIASES[normalized] || [caliber]
}
