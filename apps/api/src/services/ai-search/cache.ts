/**
 * AI Search Caching Layer
 *
 * Caches expensive AI operations (intent parsing, embeddings) to achieve
 * subsecond search latency for repeated queries.
 *
 * Cache strategy:
 * - Intent parsing: 1 hour TTL (queries don't change interpretation often)
 * - Query embeddings: 24 hours TTL (embeddings are deterministic)
 * - Uses Redis for distributed caching across API instances
 */

import { getRedisClient } from '../../config/redis'
import { loggers } from '../../config/logger'
import { SearchIntent } from './intent-parser'

const log = loggers.ai

// Cache TTLs in seconds
const INTENT_CACHE_TTL = 60 * 60        // 1 hour
const EMBEDDING_CACHE_TTL = 60 * 60 * 24 // 24 hours

// Cache key prefixes
const INTENT_PREFIX = 'search:intent:'
const EMBEDDING_PREFIX = 'search:embed:'

/**
 * Generate cache key for intent parsing
 */
function getIntentCacheKey(query: string, userTier: 'FREE' | 'PREMIUM'): string {
  // Normalize query for consistent caching
  const normalizedQuery = query.toLowerCase().trim()
  return `${INTENT_PREFIX}${userTier}:${normalizedQuery}`
}

/**
 * Generate cache key for query embedding
 */
function getEmbeddingCacheKey(text: string): string {
  // Normalize for consistent caching
  const normalizedText = text.toLowerCase().trim()
  return `${EMBEDDING_PREFIX}${normalizedText}`
}

/**
 * Cache a parsed intent
 */
export async function cacheIntent(
  query: string,
  userTier: 'FREE' | 'PREMIUM',
  intent: SearchIntent
): Promise<void> {
  try {
    const redis = getRedisClient()
    const key = getIntentCacheKey(query, userTier)
    await redis.setex(key, INTENT_CACHE_TTL, JSON.stringify(intent))
    log.debug('CACHE_INTENT_SET', { query, userTier, key })
  } catch (error) {
    // Don't fail on cache errors, just log
    log.warn('CACHE_INTENT_SET_ERROR', {
      query,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Get cached intent if available
 */
export async function getCachedIntent(
  query: string,
  userTier: 'FREE' | 'PREMIUM'
): Promise<SearchIntent | null> {
  try {
    const redis = getRedisClient()
    const key = getIntentCacheKey(query, userTier)
    const cached = await redis.get(key)

    if (cached) {
      log.debug('CACHE_INTENT_HIT', { query, userTier, key })
      return JSON.parse(cached) as SearchIntent
    }

    log.debug('CACHE_INTENT_MISS', { query, userTier, key })
    return null
  } catch (error) {
    log.warn('CACHE_INTENT_GET_ERROR', {
      query,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

/**
 * Cache a query embedding
 */
export async function cacheEmbedding(
  text: string,
  embedding: number[]
): Promise<void> {
  try {
    const redis = getRedisClient()
    const key = getEmbeddingCacheKey(text)
    // Store as comma-separated string to save space
    await redis.setex(key, EMBEDDING_CACHE_TTL, embedding.join(','))
    log.debug('CACHE_EMBEDDING_SET', { textLength: text.length, key })
  } catch (error) {
    log.warn('CACHE_EMBEDDING_SET_ERROR', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Get cached embedding if available
 */
export async function getCachedEmbedding(text: string): Promise<number[] | null> {
  try {
    const redis = getRedisClient()
    const key = getEmbeddingCacheKey(text)
    const cached = await redis.get(key)

    if (cached) {
      log.debug('CACHE_EMBEDDING_HIT', { textLength: text.length, key })
      return cached.split(',').map(Number)
    }

    log.debug('CACHE_EMBEDDING_MISS', { textLength: text.length, key })
    return null
  } catch (error) {
    log.warn('CACHE_EMBEDDING_GET_ERROR', {
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

/**
 * Clear all search caches (for testing/debugging)
 */
export async function clearSearchCaches(): Promise<void> {
  try {
    const redis = getRedisClient()
    const intentKeys = await redis.keys(`${INTENT_PREFIX}*`)
    const embeddingKeys = await redis.keys(`${EMBEDDING_PREFIX}*`)

    if (intentKeys.length > 0) {
      await redis.del(...intentKeys)
    }
    if (embeddingKeys.length > 0) {
      await redis.del(...embeddingKeys)
    }

    log.info('CACHE_CLEARED', {
      intentKeys: intentKeys.length,
      embeddingKeys: embeddingKeys.length,
    })
  } catch (error) {
    log.error('CACHE_CLEAR_ERROR', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Get cache stats for monitoring
 */
export async function getCacheStats(): Promise<{
  intentCount: number
  embeddingCount: number
}> {
  try {
    const redis = getRedisClient()
    const intentKeys = await redis.keys(`${INTENT_PREFIX}*`)
    const embeddingKeys = await redis.keys(`${EMBEDDING_PREFIX}*`)

    return {
      intentCount: intentKeys.length,
      embeddingCount: embeddingKeys.length,
    }
  } catch (error) {
    log.error('CACHE_STATS_ERROR', {
      error: error instanceof Error ? error.message : String(error),
    })
    return { intentCount: 0, embeddingCount: 0 }
  }
}
