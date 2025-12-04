import OpenAI from 'openai'
import { prisma } from '@ironscout/db'

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Embedding model configuration
const EMBEDDING_MODEL = 'text-embedding-3-small' // 1536 dimensions, $0.02/1M tokens
// const EMBEDDING_MODEL = 'text-embedding-3-large' // 3072 dimensions, $0.13/1M tokens

/**
 * Generate a rich text representation of a product for embedding
 */
export function buildProductText(product: {
  name: string
  description?: string | null
  brand?: string | null
  caliber?: string | null
  grainWeight?: number | null
  caseMaterial?: string | null
  purpose?: string | null
  category?: string | null
}): string {
  const parts: string[] = []
  
  // Product name is most important
  parts.push(product.name)
  
  // Add structured attributes
  if (product.brand) {
    parts.push(`Brand: ${product.brand}`)
  }
  
  if (product.caliber) {
    parts.push(`Caliber: ${product.caliber}`)
  }
  
  if (product.grainWeight) {
    parts.push(`Grain weight: ${product.grainWeight}gr`)
  }
  
  if (product.caseMaterial) {
    parts.push(`Case: ${product.caseMaterial}`)
  }
  
  if (product.purpose) {
    parts.push(`Use: ${product.purpose}`)
    
    // Add semantic enrichment based on purpose
    if (product.purpose === 'Defense') {
      parts.push('self-defense home protection carry concealed')
    } else if (product.purpose === 'Hunting') {
      parts.push('game hunting deer elk hog varmint')
    } else if (product.purpose === 'Target') {
      parts.push('target practice range training plinking competition')
    }
  }
  
  if (product.category) {
    parts.push(`Category: ${product.category}`)
  }
  
  // Description last (can be verbose)
  if (product.description) {
    parts.push(product.description)
  }
  
  return parts.join('\n')
}

/**
 * Generate embedding for a single text
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  })
  
  return response.data[0].embedding
}

/**
 * Generate embeddings for multiple texts (batched for efficiency)
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
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
  const product = await prisma.product.findUnique({
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
    SET embedding = ${JSON.stringify(embedding)}::vector
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
  
  console.log(`Found ${total} products without embeddings`)
  
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
            SET embedding = ${JSON.stringify(embeddings[j])}::vector
            WHERE id = ${batch[j].id}
          `
        } catch (err) {
          errors.push(`Failed to update ${batch[j].id}: ${err}`)
        }
      }
      
      processed += batch.length
      onProgress?.(processed, total)
      
      console.log(`Processed ${processed}/${total} products`)
      
    } catch (err) {
      errors.push(`Batch ${i} failed: ${err}`)
      console.error(`Batch ${i} failed:`, err)
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
    const caliberList = filters.calibers.map(c => `'${c}'`).join(',')
    conditions.push(`caliber IN (${caliberList})`)
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
  const results = await prisma.$queryRaw<Array<{
    id: string
    similarity: number
    filter_match: number
  }>>`
    SELECT 
      p.id,
      1 - (p.embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity,
      CASE 
        WHEN ${filters.calibers?.length ? 1 : 0} = 1 AND p.caliber = ANY(${filters.calibers || []}) THEN 1
        ELSE 0
      END +
      CASE 
        WHEN ${filters.purpose ? 1 : 0} = 1 AND p.purpose = ${filters.purpose || ''} THEN 1
        ELSE 0
      END as filter_match
    FROM products p
    ${filters.inStockOnly ? prisma.$queryRaw`
      INNER JOIN prices pr ON pr."productId" = p.id AND pr."inStock" = true
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
