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
 */
export interface SearchIntent {
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
  
  // Explanation for debugging/display
  explanation?: string
}

/**
 * Parse a natural language search query into structured intent
 */
export async function parseSearchIntent(query: string): Promise<SearchIntent> {
  // First, try quick local parsing for simple queries
  const quickParse = tryQuickParse(query)
  if (quickParse && quickParse.confidence > 0.8) {
    return quickParse
  }
  
  // For complex queries, use Claude
  try {
    const intent = await parseWithClaude(query)
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
 */
async function parseWithClaude(query: string): Promise<SearchIntent> {
  const systemPrompt = `You are an expert in ammunition and firearms. Parse the user's search query into structured filters for an ammo shopping search engine.

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
- explanation: brief explanation of your interpretation

Important domain knowledge:
- AR-15 uses .223 Remington / 5.56 NATO
- AR-10 uses .308 Winchester / 7.62 NATO  
- AK-47 uses 7.62x39mm
- "Long range" target shooting typically uses heavier grain bullets (77gr for .223, 175gr for .308)
- "Match" or "competition" implies high-quality, consistent ammo
- "FMJ" = Full Metal Jacket, typically for target practice
- "JHP/HP" = Jacketed Hollow Point, typically for defense
- "Brass case" is generally preferred over steel for reliability

Respond ONLY with valid JSON, no markdown or explanation outside the JSON.`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
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
  
  return {
    ...parsed,
    originalQuery: query,
  }
}

/**
 * Batch parse multiple queries (for autocomplete suggestions, etc.)
 */
export async function batchParseIntents(queries: string[]): Promise<SearchIntent[]> {
  return Promise.all(queries.map(q => parseSearchIntent(q)))
}
