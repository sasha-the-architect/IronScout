/**
 * Embedding Generation BullMQ Worker
 *
 * Processes GENERATE_EMBEDDING jobs from the embedding-generate queue.
 * Generates vector embeddings for products using OpenAI's embedding API.
 *
 * Triggered:
 * - After successful product resolution (when AUTO_EMBEDDING_ENABLED)
 * - Manually via admin UI
 * - Bulk backfill operations
 */

import { Worker, Job } from 'bullmq'
import OpenAI from 'openai'
import { prisma, buildProductText } from '@ironscout/db'
import { redisConnection } from '../config/redis'
import { QUEUE_NAMES, EmbeddingGenerateJobData } from '../config/queues'
import { logger } from '../config/logger'

const log = logger.embedding

// Embedding model configuration (match API embedding-service.ts)
const EMBEDDING_MODEL = 'text-embedding-3-small' // 1536 dimensions, $0.02/1M tokens

// Initialize OpenAI client only if API key is configured
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null

// Metrics
let processedCount = 0
let errorCount = 0
let skippedCount = 0
let lastProcessedAt: Date | null = null

/**
 * Embedding Worker instance
 * Created lazily by startEmbeddingWorker()
 */
export let embeddingWorker: Worker<EmbeddingGenerateJobData> | null = null

/**
 * Generate embedding for text using OpenAI
 */
async function generateEmbedding(text: string): Promise<number[]> {
  if (!openai) {
    throw new Error('OpenAI client not initialized (OPENAI_API_KEY not set)')
  }

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  })

  return response.data[0].embedding
}

/**
 * Process a single embedding generation job
 */
async function processEmbeddingJob(job: Job<EmbeddingGenerateJobData>): Promise<void> {
  const { productId, trigger, resolverVersion, affiliateFeedRunId } = job.data
  const startTime = Date.now()

  log.debug('EMBEDDING_JOB_START', {
    event_name: 'EMBEDDING_JOB_START',
    jobId: job.id,
    productId,
    trigger,
    resolverVersion,
    affiliateFeedRunId,
  })

  // Check if OpenAI is configured
  if (!openai) {
    log.warn('EMBEDDING_SKIPPED_NO_API_KEY', {
      event_name: 'EMBEDDING_SKIPPED_NO_API_KEY',
      jobId: job.id,
      productId,
    })
    skippedCount++
    return
  }

  // Fetch product from database
  const product = await prisma.products.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      description: true,
      brand: true,
      caliber: true,
      grainWeight: true,
      caseMaterial: true,
      purpose: true,
      category: true,
    },
  })

  if (!product) {
    log.warn('EMBEDDING_SKIPPED_PRODUCT_NOT_FOUND', {
      event_name: 'EMBEDDING_SKIPPED_PRODUCT_NOT_FOUND',
      jobId: job.id,
      productId,
    })
    skippedCount++
    return
  }

  // Build product text for embedding
  const text = buildProductText(product)

  // Generate embedding via OpenAI
  const embedding = await generateEmbedding(text)

  // Update product with embedding using raw SQL (Prisma doesn't support vector type natively)
  await prisma.$executeRaw`
    UPDATE products
    SET embedding = ${JSON.stringify(embedding)}::vector,
        "lastEmbeddedAt" = NOW(),
        "updatedAt" = NOW()
    WHERE id = ${productId}
  `

  const durationMs = Date.now() - startTime

  log.info('EMBEDDING_JOB_COMPLETED', {
    event_name: 'EMBEDDING_JOB_COMPLETED',
    jobId: job.id,
    productId,
    trigger,
    durationMs,
    embeddingDimensions: embedding.length,
  })
}

/**
 * Start the Embedding Generation worker
 */
export async function startEmbeddingWorker(options?: {
  concurrency?: number
}): Promise<Worker<EmbeddingGenerateJobData>> {
  // Lower concurrency for OpenAI API rate limits
  const concurrency = options?.concurrency ?? 3

  if (!OPENAI_API_KEY) {
    log.warn('EMBEDDING_WORKER_NO_API_KEY', {
      event_name: 'EMBEDDING_WORKER_NO_API_KEY',
      message: 'OPENAI_API_KEY not set - embedding worker will skip all jobs',
    })
  }

  log.info('EMBEDDING_WORKER_START', {
    event_name: 'EMBEDDING_WORKER_START',
    concurrency,
    queueName: QUEUE_NAMES.EMBEDDING_GENERATE,
    openaiConfigured: !!OPENAI_API_KEY,
  })

  embeddingWorker = new Worker<EmbeddingGenerateJobData>(
    QUEUE_NAMES.EMBEDDING_GENERATE,
    async (job: Job<EmbeddingGenerateJobData>) => {
      return processEmbeddingJob(job)
    },
    {
      connection: redisConnection,
      concurrency,
    }
  )

  // Event handlers for observability
  embeddingWorker.on('completed', (job: Job<EmbeddingGenerateJobData>) => {
    processedCount++
    lastProcessedAt = new Date()
  })

  embeddingWorker.on('failed', (job: Job<EmbeddingGenerateJobData> | undefined, error: Error) => {
    errorCount++
    log.error(
      'EMBEDDING_JOB_FAILED',
      {
        event_name: 'EMBEDDING_JOB_FAILED',
        jobId: job?.id,
        productId: job?.data?.productId,
        trigger: job?.data?.trigger,
        errorMessage: error.message,
        errorCount,
      },
      error
    )
  })

  embeddingWorker.on('error', (error: Error) => {
    log.error(
      'EMBEDDING_WORKER_ERROR',
      {
        event_name: 'EMBEDDING_WORKER_ERROR',
        errorMessage: error.message,
      },
      error
    )
  })

  return embeddingWorker
}

/**
 * Stop the Embedding worker gracefully
 */
export async function stopEmbeddingWorker(): Promise<void> {
  if (embeddingWorker) {
    log.info('EMBEDDING_WORKER_STOPPING', {
      event_name: 'EMBEDDING_WORKER_STOPPING',
      processedCount,
      errorCount,
      skippedCount,
    })
    await embeddingWorker.close()
    embeddingWorker = null
  }
}

/**
 * Get worker metrics
 */
export function getEmbeddingWorkerMetrics() {
  return {
    processedCount,
    errorCount,
    skippedCount,
    lastProcessedAt,
    openaiConfigured: !!OPENAI_API_KEY,
  }
}
