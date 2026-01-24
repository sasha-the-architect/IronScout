import OpenAI from 'openai'
import { prisma, buildProductText } from '@ironscout/db'
import { loggers } from '../../config/logger'
import { getCachedEmbedding, cacheEmbedding } from './cache'

// Re-export buildProductText for backward compatibility
export { buildProductText } from '@ironscout/db'

const log = loggers.ai

// Initialize OpenAI client only if API key is configured
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const openai = OPENAI_API_KEY
  ? new OpenAI({ apiKey: OPENAI_API_KEY })
  : null

// Embedding model configuration
const EMBEDDING_MODEL = 'text-embedding-3-small' // 1536 dimensions, $0.02/1M tokens
// const EMBEDDING_MODEL = 'text-embedding-3-large' // 3072 dimensions, $0.13/1M tokens

/**
 * Check if embedding service is available
 */
export function isEmbeddingServiceAvailable(): boolean {
  return openai !== null
}

/**
 * Generate embedding for a single text
 * Uses caching to avoid repeated API calls for the same text
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!openai) {
    throw new Error('OpenAI client not initialized (OPENAI_API_KEY not set)')
  }

  // Check cache first
  const cachedEmbedding = await getCachedEmbedding(text)
  if (cachedEmbedding) {
    log.debug('EMBEDDING_CACHE_HIT', { textLength: text.length })
    return cachedEmbedding
  }

  // Generate new embedding
  const startTime = Date.now()
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  })
  const duration = Date.now() - startTime

  const embedding = response.data[0].embedding

  log.debug('EMBEDDING_GENERATED', { textLength: text.length, durationMs: duration })

  // Cache for future requests
  await cacheEmbedding(text, embedding)

  return embedding
}

/**
 * Generate embeddings for multiple texts (batched for efficiency)
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (!openai) {
    throw new Error('OpenAI client not initialized (OPENAI_API_KEY not set)')
  }

  // OpenAI allows up to 2048 inputs per request
  const batchSize = 100
  const embeddings: number[][] = []

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)

    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
    })
    
    embeddings.push(...response.data.map(d => d.embedding))
    
    // Small delay to avoid rate limits
    if (i + batchSize < texts.length) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  
  return embeddings
}

/**
 * Update embedding for a single product
 */
export async function updateProductEmbedding(productId: string): Promise<void> {
  const product = await prisma.products.findUnique({
    where: { id: productId },
  })
  
  if (!product) {
    throw new Error(`Product not found: ${productId}`)
  }
  
  const text = buildProductText(product)
  const embedding = await generateEmbedding(text)
  
  // Use raw SQL since Prisma doesn't support vector type natively
  await prisma.$executeRaw`
    UPDATE products
    SET embedding = ${JSON.stringify(embedding)}::vector,
        "lastEmbeddedAt" = NOW(),
        "updatedAt" = NOW()
    WHERE id = ${productId}
  `
}

/**
 * Batch update embeddings for all products without embeddings
 */
export async function backfillProductEmbeddings(options: {
  batchSize?: number
  onProgress?: (processed: number, total: number) => void
} = {}): Promise<{ processed: number; errors: string[] }> {
  const { batchSize = 50, onProgress } = options
  const errors: string[] = []
  
  // Get products without embeddings
  const products = await prisma.$queryRaw<Array<{
    id: string
    name: string
    description: string | null
    brand: string | null
    caliber: string | null
    grainWeight: number | null
    caseMaterial: string | null
    purpose: string | null
    category: string | null
  }>>`
    SELECT id, name, description, brand, caliber, "grainWeight", "caseMaterial", purpose, category
    FROM products
    WHERE embedding IS NULL
  `
  
  const total = products.length
  let processed = 0

  log.info('Found products without embeddings', { total })
  
  // Process in batches
  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize)
    
    try {
      // Generate texts
      const texts = batch.map(p => buildProductText(p))
      
      // Generate embeddings
      const embeddings = await generateEmbeddings(texts)
      
      // Update database
      for (let j = 0; j < batch.length; j++) {
        try {
          await prisma.$executeRaw`
            UPDATE products
            SET embedding = ${JSON.stringify(embeddings[j])}::vector,
                "lastEmbeddedAt" = NOW(),
                "updatedAt" = NOW()
            WHERE id = ${batch[j].id}
          `
        } catch (err) {
          errors.push(`Failed to update ${batch[j].id}: ${err}`)
        }
      }
      
      processed += batch.length
      onProgress?.(processed, total)

      log.info('Processed products', { processed, total })

    } catch (err) {
      errors.push(`Batch ${i} failed: ${err}`)
      log.error('Batch failed', { batchIndex: i, error: err }, err as Error)
    }
    
    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  
  return { processed, errors }
}

/**
 * Semantic search using vector similarity
 */
export async function vectorSearch(
  queryText: string,
  options: {
    limit?: number
    minSimilarity?: number
    whereClause?: string
  } = {}
): Promise<Array<{ id: string; similarity: number }>> {
  const { limit = 20, minSimilarity = 0.3, whereClause = '' } = options
  
  // Generate embedding for query
  const queryEmbedding = await generateEmbedding(queryText)
  
  // Perform similarity search
  const results = await prisma.$queryRaw<Array<{ id: string; similarity: number }>>`
    SELECT 
      id,
      1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
    FROM products
    WHERE embedding IS NOT NULL
    ${whereClause ? prisma.$queryRaw`AND ${whereClause}` : prisma.$queryRaw``}
    ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector
    LIMIT ${limit}
  `
  
  // Filter by minimum similarity
  return results.filter(r => r.similarity >= minSimilarity)
}

/**
 * Hybrid search: combines vector similarity with traditional filters
 */
export async function hybridSearch(
  queryText: string,
  filters: {
    calibers?: string[]
    purpose?: string
    brands?: string[]
    inStockOnly?: boolean
  },
  options: {
    limit?: number
    vectorWeight?: number // 0-1, how much to weight vector vs filter match
  } = {}
): Promise<Array<{ id: string; score: number; vectorSimilarity: number }>> {
  const { limit = 20, vectorWeight = 0.6 } = options
  
  // Generate embedding for query
  const queryEmbedding = await generateEmbedding(queryText)
  
  // Build filter conditions
  const conditions: string[] = ['embedding IS NOT NULL']
  
  if (filters.calibers?.length) {
    // Use caliberNorm for filtering (normalized form, always populated by resolver)
    const caliberPatterns = filters.calibers.map(c => `'%${c}%'`).join(',')
    conditions.push(`"caliberNorm" ILIKE ANY(ARRAY[${caliberPatterns}])`)
  }
  
  if (filters.purpose) {
    conditions.push(`purpose = '${filters.purpose}'`)
  }
  
  if (filters.brands?.length) {
    const brandList = filters.brands.map(b => `'${b}'`).join(',')
    conditions.push(`brand IN (${brandList})`)
  }
  
  const whereClause = conditions.join(' AND ')
  
  // Query with both vector similarity and filter matching
  // Per Spec v1.2 §0.0: Join through product_links for in-stock filtering
  const results = await prisma.$queryRaw<Array<{
    id: string
    similarity: number
    filter_match: number
  }>>`
    SELECT
      p.id,
      1 - (p.embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity,
      CASE
        WHEN ${filters.calibers?.length ? 1 : 0} = 1 AND
          p."caliberNorm" ILIKE ANY(${filters.calibers?.map(c => `%${c}%`) || []})
        THEN 1
        ELSE 0
      END +
      CASE
        WHEN ${filters.purpose ? 1 : 0} = 1 AND p.purpose = ${filters.purpose || ''} THEN 1
        ELSE 0
      END as filter_match
    FROM products p
    ${filters.inStockOnly ? prisma.$queryRaw`
      INNER JOIN product_links pl ON pl."productId" = p.id AND pl.status IN ('MATCHED', 'CREATED')
      INNER JOIN prices pr ON pr."sourceProductId" = pl."sourceProductId" AND pr."inStock" = true
    ` : prisma.$queryRaw``}
    WHERE ${prisma.$queryRaw`${whereClause}`}
    ORDER BY
      (${vectorWeight} * (1 - (p.embedding <=> ${JSON.stringify(queryEmbedding)}::vector))) +
      (${1 - vectorWeight} * filter_match / 2.0) DESC
    LIMIT ${limit}
  `
  
  return results.map(r => ({
    id: r.id,
    score: vectorWeight * r.similarity + (1 - vectorWeight) * (r.filter_match / 2),
    vectorSimilarity: r.similarity,
  }))
}
