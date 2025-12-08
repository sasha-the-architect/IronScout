import Anthropic from '@anthropic-ai/sdk'
import {
  PLATFORM_CALIBER_MAP,
  PURPOSE_SYNONYMS,
  CALIBER_ALIASES,
  RANGE_GRAIN_PREFERENCES,
  getRecommendedGrains,
  getCalibrFromPlatform,
  normalizePurpose,
  getCaliberVariations,
} from './ammo-knowledge'

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

/**
 * Structured search intent extracted from natural language query
 * 
 * FREE tier: Basic fields only (calibers, purpose, grainWeights, etc.)
 * PREMIUM tier: Full intent including premiumIntent fields
 */
export interface SearchIntent {
  // =============================================
  // Basic Fields (FREE + PREMIUM)
  // =============================================
  
  // Direct filters (map to Prisma where clause)
  calibers?: string[]           // e.g., [".223 Remington", "5.56 NATO"]
  purpose?: string              // e.g., "Target", "Defense", "Hunting"
  grainWeights?: number[]       // e.g., [69, 77] for heavy .223
  caseMaterials?: string[]      // e.g., ["Brass"]
  brands?: string[]             // e.g., ["Federal", "Hornady"]
  
  // Price constraints
  minPrice?: number
  maxPrice?: number
  
  // Availability
  inStockOnly?: boolean
  
  // Quality/ranking hints
  qualityLevel?: 'budget' | 'standard' | 'premium' | 'match-grade'
  rangePreference?: 'short' | 'medium' | 'long'
  
  // Original query for fallback text search
  originalQuery: string
  
  // Extracted keywords for supplemental text search
  keywords?: string[]
  
  // Confidence score (0-1)
  confidence: number
  
  // Basic explanation (shown to FREE users)
  purposeDetected?: string      // e.g., "Home Defense"
  
  // =============================================
  // Premium Fields (PREMIUM only)
  // =============================================
  
  premiumIntent?: PremiumSearchIntent
}

/**
 * Premium-only intent fields
 * Deep semantic analysis of user's actual needs
 */
export interface PremiumSearchIntent {
  // Environment context
  environment?: 'indoor' | 'outdoor' | 'both'
  
  // Firearm context
  barrelLength?: 'short' | 'standard' | 'long'  // <4", 4-6", >6"
  suppressorUse?: boolean
  
  // Safety constraints (affects ranking significantly)
  safetyConstraints?: SafetyConstraint[]
  
  // Priority focus (affects Best Value calculation)
  priorityFocus?: 'performance' | 'value' | 'balanced'
  
  // Bullet type preferences (derived from purpose + context)
  preferredBulletTypes?: string[]  // e.g., ['JHP', 'BJHP'] for defense
  
  // Detailed AI explanation (shown to PREMIUM users)
  explanation: string
  
  // Reasoning breakdown (for transparency)
  reasoning?: {
    environmentReason?: string
    barrelReason?: string
    safetyReason?: string
    bulletTypeReason?: string
  }
  
  // Ranking adjustments
  rankingBoosts?: {
    shortBarrelOptimized?: number   // 0-1 boost factor
    lowFlash?: number
    controlledExpansion?: number
    suppressorSafe?: number
    matchGrade?: number
  }
}

/**
 * Safety constraints that affect ammo recommendations
 */
export type SafetyConstraint = 
  | 'low-overpenetration'   // Home defense, apartments
  | 'low-flash'             // Indoor, low-light
  | 'low-recoil'            // Follow-up shots, smaller shooters
  | 'barrier-blind'         // Duty use, car doors
  | 'frangible'             // Training, steel targets

/**
 * Parse options including user tier
 */
export interface ParseOptions {
  userTier?: 'FREE' | 'PREMIUM'
}

/**
 * Parse a natural language search query into structured intent
 * 
 * @param query - User's search query
 * @param options - Parse options including user tier
 */
export async function parseSearchIntent(
  query: string, 
  options: ParseOptions = {}
): Promise<SearchIntent> {
  const { userTier = 'FREE' } = options
  
  // First, try quick local parsing for simple queries
  const quickParse = tryQuickParse(query)
  if (quickParse && quickParse.confidence > 0.8 && userTier === 'FREE') {
    return quickParse
  }
  
  // For complex queries or Premium users, use Claude
  try {
    const intent = await parseWithClaude(query, userTier)
    return intent
  } catch (error) {
    console.error('Claude parsing failed, falling back to local parse:', error)
    return quickParse || {
      originalQuery: query,
      keywords: query.split(/\s+/).filter(w => w.length > 2),
      confidence: 0.3,
    }
  }
}

/**
 * Quick local parsing for simple queries
 * Handles common patterns without API calls
 */
function tryQuickParse(query: string): SearchIntent | null {
  const lowerQuery = query.toLowerCase()
  const intent: SearchIntent = {
    originalQuery: query,
    confidence: 0,
  }
  
  let matchCount = 0
  
  // Check for platform mentions (AR15, Glock, etc.)
  for (const [platform, calibers] of Object.entries(PLATFORM_CALIBER_MAP)) {
    if (lowerQuery.includes(platform.toLowerCase())) {
      intent.calibers = calibers
      matchCount++
      break
    }
  }
  
  // Check for direct caliber mentions
  if (!intent.calibers) {
    for (const [alias, variations] of Object.entries(CALIBER_ALIASES)) {
      if (lowerQuery.includes(alias.toLowerCase())) {
        intent.calibers = variations
        matchCount++
        break
      }
    }
  }
  
  // Check for purpose
  for (const [synonym, purpose] of Object.entries(PURPOSE_SYNONYMS)) {
    if (lowerQuery.includes(synonym.toLowerCase())) {
      intent.purpose = purpose
      intent.purposeDetected = purpose
      matchCount++
      break
    }
  }
  
  // Check for range preference
  for (const [rangeKey, pref] of Object.entries(RANGE_GRAIN_PREFERENCES)) {
    if (lowerQuery.includes(rangeKey.toLowerCase())) {
      intent.rangePreference = pref.weight === 'heavy' ? 'long' : 'short'
      matchCount++
      break
    }
  }
  
  // Check for in-stock requirement
  if (lowerQuery.includes('in stock') || lowerQuery.includes('available')) {
    intent.inStockOnly = true
    matchCount++
  }
  
  // Check for quality indicators
  if (lowerQuery.includes('match') || lowerQuery.includes('precision') || lowerQuery.includes('competition')) {
    intent.qualityLevel = 'match-grade'
    matchCount++
  } else if (lowerQuery.includes('cheap') || lowerQuery.includes('budget') || lowerQuery.includes('affordable')) {
    intent.qualityLevel = 'budget'
    matchCount++
  } else if (lowerQuery.includes('best') || lowerQuery.includes('premium') || lowerQuery.includes('quality')) {
    intent.qualityLevel = 'premium'
    matchCount++
  }
  
  // Check for case material
  if (lowerQuery.includes('brass')) {
    intent.caseMaterials = ['Brass']
    matchCount++
  } else if (lowerQuery.includes('steel')) {
    intent.caseMaterials = ['Steel']
    matchCount++
  }
  
  // Calculate confidence based on matches
  intent.confidence = Math.min(matchCount / 3, 1) // 3+ matches = high confidence
  
  // If we have caliber + purpose, that's usually enough
  if (intent.calibers && intent.purpose) {
    intent.confidence = Math.max(intent.confidence, 0.85)
  }
  
  // Calculate grain weight recommendations if we have caliber + purpose/range
  if (intent.calibers && (intent.purpose || intent.rangePreference)) {
    const recommendedGrains = getRecommendedGrains(
      intent.calibers[0],
      intent.purpose || 'Target',
      intent.rangePreference
    )
    if (recommendedGrains.length > 0) {
      intent.grainWeights = recommendedGrains
    }
  }
  
  return matchCount > 0 ? intent : null
}

/**
 * Use Claude to parse complex natural language queries
 * Premium users get deeper analysis
 */
async function parseWithClaude(query: string, userTier: 'FREE' | 'PREMIUM'): Promise<SearchIntent> {
  const isPremium = userTier === 'PREMIUM'
  
  const systemPrompt = isPremium 
    ? getPremiumSystemPrompt() 
    : getFreeSystemPrompt()

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: isPremium ? 1000 : 500,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Parse this search query: "${query}"`
      }
    ]
  })

  // Extract text from response
  const textContent = response.content.find(block => block.type === 'text')
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Claude')
  }
  
  // Parse JSON response
  const parsed = JSON.parse(textContent.text)
  
  // Build the intent object
  const intent: SearchIntent = {
    calibers: parsed.calibers,
    purpose: parsed.purpose,
    purposeDetected: parsed.purpose,
    grainWeights: parsed.grainWeights,
    caseMaterials: parsed.caseMaterials,
    brands: parsed.brands,
    minPrice: parsed.minPrice,
    maxPrice: parsed.maxPrice,
    inStockOnly: parsed.inStockOnly,
    qualityLevel: parsed.qualityLevel,
    rangePreference: parsed.rangePreference,
    keywords: parsed.keywords,
    confidence: parsed.confidence || 0.7,
    originalQuery: query,
  }
  
  // Add premium fields if available
  if (isPremium && parsed.premiumIntent) {
    intent.premiumIntent = {
      environment: parsed.premiumIntent.environment,
      barrelLength: parsed.premiumIntent.barrelLength,
      suppressorUse: parsed.premiumIntent.suppressorUse,
      safetyConstraints: parsed.premiumIntent.safetyConstraints,
      priorityFocus: parsed.premiumIntent.priorityFocus,
      preferredBulletTypes: parsed.premiumIntent.preferredBulletTypes,
      explanation: parsed.premiumIntent.explanation || generateExplanation(intent, parsed.premiumIntent),
      reasoning: parsed.premiumIntent.reasoning,
      rankingBoosts: calculateRankingBoosts(parsed.premiumIntent),
    }
  }
  
  return intent
}

/**
 * FREE tier Claude prompt - basic parsing only
 */
function getFreeSystemPrompt(): string {
  return `You are an expert in ammunition and firearms. Parse the user's search query into structured filters for an ammo shopping search engine.

Return a JSON object with these fields (include only relevant ones):
- calibers: array of caliber strings (e.g., [".223 Remington", "5.56 NATO"])
- purpose: one of "Target", "Defense", "Hunting"  
- grainWeights: array of recommended grain weights as numbers
- caseMaterials: array like ["Brass", "Steel", "Nickel"]
- brands: array of brand names if mentioned
- minPrice: number if price floor mentioned
- maxPrice: number if price ceiling mentioned
- inStockOnly: true if they want only in-stock items
- qualityLevel: one of "budget", "standard", "premium", "match-grade"
- rangePreference: one of "short", "medium", "long" based on shooting distance
- keywords: important search keywords not captured above
- confidence: 0-1 how confident you are in the parse

Important domain knowledge:
- AR-15 uses .223 Remington / 5.56 NATO
- AR-10 uses .308 Winchester / 7.62 NATO  
- AK-47 uses 7.62x39mm
- "Long range" typically uses heavier grain bullets
- "Match" or "competition" implies high-quality ammo
- "FMJ" = Full Metal Jacket, typically for target practice
- "JHP/HP" = Hollow Point, typically for defense

Respond ONLY with valid JSON, no markdown.`
}

/**
 * PREMIUM tier Claude prompt - deep semantic analysis
 */
function getPremiumSystemPrompt(): string {
  return `You are an expert ammunition consultant helping shooters find the perfect ammo for their specific needs. Parse the user's search query with deep semantic understanding.

Return a JSON object with:

BASIC FIELDS:
- calibers: array of caliber strings
- purpose: "Target", "Defense", "Hunting", "Competition", "Duty"
- grainWeights: recommended grain weights for their purpose
- caseMaterials: ["Brass", "Steel", "Nickel", "Aluminum"]
- brands: brand names if mentioned
- minPrice/maxPrice: price range if mentioned
- inStockOnly: boolean
- qualityLevel: "budget", "standard", "premium", "match-grade"
- rangePreference: "short", "medium", "long"
- keywords: additional search terms
- confidence: 0-1

PREMIUM INTENT (in premiumIntent object):
- environment: "indoor", "outdoor", "both" - infer from context
- barrelLength: "short" (<4"), "standard" (4-6"), "long" (>6") - infer from firearm mentions
- suppressorUse: boolean - true if suppressor/silencer/can mentioned
- safetyConstraints: array of applicable constraints:
  * "low-overpenetration" - home defense, apartments, urban
  * "low-flash" - indoor, low-light, home defense
  * "low-recoil" - follow-up shots, smaller shooters, competition
  * "barrier-blind" - duty use, law enforcement
  * "frangible" - indoor ranges, steel targets
- priorityFocus: "performance", "value", "balanced"
- preferredBulletTypes: array of bullet types for this use case
  * Defense: ["JHP", "BJHP", "HST", "GDHP", "XTP"]
  * Target: ["FMJ", "TMJ"]
  * Hunting: ["SP", "JSP", "VMAX"]
  * Match: ["BTHP", "SMK"]
- explanation: 2-3 sentence explanation of your recommendations written for the user
  Example: "These hollow point loads are optimized for short-barrel reliability and reduced muzzle flash—ideal for indoor home defense. The bonded construction ensures controlled expansion without excessive penetration through interior walls."
- reasoning: object with optional fields explaining each decision:
  * environmentReason: why you chose indoor/outdoor
  * barrelReason: why you inferred barrel length
  * safetyReason: why these safety constraints
  * bulletTypeReason: why these bullet types

CRITICAL DOMAIN KNOWLEDGE:

Defensive Ammunition:
- JHP (Jacketed Hollow Point) expands on impact, reduces overpenetration
- +P loads have higher velocity but more recoil
- Short-barrel optimized ammo (Critical Defense, HST Micro) expands reliably at lower velocities
- Low-flash powder reduces muzzle flash in low light

Home Defense Considerations:
- Indoor = low-flash, controlled expansion important
- Overpenetration risk with FMJ or rifle rounds through walls
- 9mm 124gr and 147gr JHP are most popular for home defense

Suppressor Use:
- Subsonic ammo (<1125 fps) avoids supersonic crack
- 9mm 147gr, .45 ACP 230gr, .300 BLK 190gr+ are typically subsonic
- Ensure ammo is marked suppressor-safe or uses clean-burning powder

Barrel Length Effects:
- Short barrels (<4") = lower velocity = some JHPs may not expand
- Critical Defense, HST, Gold Dot designed for short barrels
- Velocity-sensitive ammo may underperform in compact guns

Respond ONLY with valid JSON, no markdown or explanation outside JSON.`
}

/**
 * Calculate ranking boosts from premium intent
 */
function calculateRankingBoosts(premiumIntent: any): PremiumSearchIntent['rankingBoosts'] {
  const boosts: PremiumSearchIntent['rankingBoosts'] = {}
  
  // Short barrel optimization boost
  if (premiumIntent.barrelLength === 'short') {
    boosts.shortBarrelOptimized = 0.8
  }
  
  // Low flash boost for indoor use
  if (premiumIntent.environment === 'indoor' || 
      premiumIntent.safetyConstraints?.includes('low-flash')) {
    boosts.lowFlash = 0.7
  }
  
  // Controlled expansion for overpenetration concern
  if (premiumIntent.safetyConstraints?.includes('low-overpenetration')) {
    boosts.controlledExpansion = 0.8
  }
  
  // Suppressor compatibility
  if (premiumIntent.suppressorUse) {
    boosts.suppressorSafe = 0.9
  }
  
  // Match grade for competition/precision
  if (premiumIntent.priorityFocus === 'performance') {
    boosts.matchGrade = 0.6
  }
  
  return Object.keys(boosts).length > 0 ? boosts : undefined
}

/**
 * Generate explanation if Claude didn't provide one
 */
function generateExplanation(intent: SearchIntent, premiumIntent: any): string {
  const parts: string[] = []
  
  // Purpose-based intro
  if (intent.purpose === 'Defense') {
    parts.push('For defensive use')
  } else if (intent.purpose === 'Target') {
    parts.push('For target practice')
  } else if (intent.purpose === 'Hunting') {
    parts.push('For hunting')
  }
  
  // Environment context
  if (premiumIntent.environment === 'indoor') {
    parts.push('in indoor or low-light conditions')
  }
  
  // Barrel context
  if (premiumIntent.barrelLength === 'short') {
    parts.push('with a compact firearm')
  }
  
  // Combine and add recommendation
  let explanation = parts.join(' ')
  
  if (premiumIntent.preferredBulletTypes?.includes('JHP')) {
    explanation += ', hollow point ammunition offers reliable expansion and reduced overpenetration risk.'
  } else if (premiumIntent.preferredBulletTypes?.includes('FMJ')) {
    explanation += ', full metal jacket ammunition provides consistent performance and value.'
  }
  
  return explanation || 'Showing results optimized for your search criteria.'
}

/**
 * Batch parse multiple queries
 */
export async function batchParseIntents(
  queries: string[], 
  options: ParseOptions = {}
): Promise<SearchIntent[]> {
  return Promise.all(queries.map(q => parseSearchIntent(q, options)))
}
