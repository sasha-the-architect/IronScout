/**
 * Product Resolver BullMQ Worker (Spec v1.2)
 *
 * Processes RESOLVE_SOURCE_PRODUCT jobs from the product-resolve queue.
 *
 * Per Spec v1.2 §0.3:
 * - JobId format: RESOLVE_SOURCE_PRODUCT:<sourceProductId>
 * - Retry: system errors only, max 3 attempts
 * - Debounce: 10-30s per sourceProductId (handled by jobId deduplication)
 *
 * @see context/specs/product-resolver-12.md
 */

import { Worker, Job } from 'bullmq'
import { prisma } from '@ironscout/db'
import type { SourceKind } from '@ironscout/db/generated/prisma'
import { redisConnection } from '../config/redis'
import {
  QUEUE_NAMES,
  ProductResolveJobData,
} from '../config/queues'
import { resolveSourceProduct, RESOLVER_VERSION } from './resolver'
import { logger } from '../config/logger'
import type { ResolverResult } from './types'
import {
  recordRequest,
  recordResolverJob,
  type SourceKindLabel,
  type ReasonCodeLabel,
} from './metrics'

const log = logger.resolver

// Legacy metrics for backward compatibility (deprecated, use metrics.ts)
let processedCount = 0
let errorCount = 0
let lastProcessedAt: Date | null = null

/**
 * Product Resolver Worker instance
 * Created lazily by startProductResolverWorker()
 */
export let productResolverWorker: Worker<ProductResolveJobData> | null = null

/**
 * Start the Product Resolver worker
 * Per Spec v1.2: Should be called once during harvester startup
 */
export function startProductResolverWorker(options?: {
  concurrency?: number
  maxStalledCount?: number
}): Worker<ProductResolveJobData> {
  const concurrency = options?.concurrency ?? 5

  log.info(`[ResolverWorker] Starting with concurrency=${concurrency}`)

  productResolverWorker = new Worker<ProductResolveJobData>(
    QUEUE_NAMES.PRODUCT_RESOLVE,
    async (job: Job<ProductResolveJobData>) => {
      return processResolveJob(job)
    },
    {
      connection: redisConnection,
      concurrency,
      maxStalledCount: options?.maxStalledCount ?? 3,
    }
  )

  // Event handlers for observability
  productResolverWorker.on('completed', (job: Job<ProductResolveJobData>) => {
    processedCount++
    lastProcessedAt = new Date()
    log.debug(`[ResolverWorker] Completed job ${job.id}`)
  })

  productResolverWorker.on('failed', (job: Job<ProductResolveJobData> | undefined, error: Error) => {
    errorCount++
    log.error(`[ResolverWorker] Failed job ${job?.id}: ${error.message}`)
  })

  productResolverWorker.on('error', (error: Error) => {
    log.error(`[ResolverWorker] Worker error: ${error.message}`)
  })

  productResolverWorker.on('stalled', (jobId: string) => {
    log.warn(`[ResolverWorker] Stalled job: ${jobId}`)
  })

  return productResolverWorker
}

/**
 * Stop the Product Resolver worker gracefully
 */
export async function stopProductResolverWorker(): Promise<void> {
  if (productResolverWorker) {
    log.info('[ResolverWorker] Stopping worker...')
    await productResolverWorker.close()
    productResolverWorker = null
    log.info('[ResolverWorker] Worker stopped')
  }
}

/**
 * Process a single RESOLVE_SOURCE_PRODUCT job
 * Per Spec v1.2 §0.3: Execute resolver and persist result
 */
async function processResolveJob(
  job: Job<ProductResolveJobData>
): Promise<ResolverResult> {
  const { sourceProductId, trigger, resolverVersion } = job.data
  const startTime = Date.now()

  log.info(`[ResolverWorker] Processing ${sourceProductId} (trigger: ${trigger}, version: ${resolverVersion})`)

  // Load source to get sourceKind for metrics (bounded label)
  const sourceProduct = await prisma.source_products.findUnique({
    where: { id: sourceProductId },
    select: {
      sources: {
        select: { sourceKind: true },
      },
    },
  })
  const sourceKind: SourceKindLabel = sourceProduct?.sources?.sourceKind ?? 'UNKNOWN'

  // Record request metric at job start
  recordRequest(sourceKind)

  // Version check - warn if job was enqueued with different version
  if (resolverVersion !== RESOLVER_VERSION) {
    log.warn(
      `[ResolverWorker] Version mismatch: job=${resolverVersion}, current=${RESOLVER_VERSION}`
    )
  }

  try {
    // Execute resolver algorithm
    const result = await resolveSourceProduct(sourceProductId, trigger)

    // Persist result to product_links
    await persistResolverResult(sourceProductId, result)

    // Update source_products.normalizedHash if applicable
    if (result.evidence?.inputHash) {
      await prisma.source_products.update({
        where: { id: sourceProductId },
        data: { normalizedHash: result.evidence.inputHash },
      })
    }

    // Record decision metrics
    const durationMs = Date.now() - startTime
    recordResolverJob({
      sourceKind,
      status: result.status,
      reasonCode: result.status === 'ERROR' ? (result.reasonCode as ReasonCodeLabel) : undefined,
      durationMs,
    })

    log.info(
      `[ResolverWorker] Resolved ${sourceProductId}: ` +
      `matchType=${result.matchType}, status=${result.status}, ` +
      `productId=${result.productId || 'NULL'}, confidence=${result.confidence.toFixed(4)}, ` +
      `durationMs=${durationMs}`
    )

    return result
  } catch (error: any) {
    // Record failure metrics for system errors
    const durationMs = Date.now() - startTime
    recordResolverJob({
      sourceKind,
      status: 'ERROR',
      reasonCode: 'SYSTEM_ERROR',
      durationMs,
    })

    log.error(`[ResolverWorker] Error processing ${sourceProductId}: ${error.message}`)

    // For system errors, rethrow to trigger BullMQ retry
    // For business logic errors (captured in result), we don't retry
    throw error
  }
}

/**
 * Persist resolver result to product_links table
 * Per Spec v1.2 §2: Upsert with full evidence
 */
async function persistResolverResult(
  sourceProductId: string,
  result: ResolverResult
): Promise<void> {
  const now = new Date()

  // Truncate evidence if needed (per spec: max 500KB)
  const evidence = truncateEvidence(result.evidence, 500 * 1024)

  await prisma.product_links.upsert({
    where: { sourceProductId },
    create: {
      sourceProductId,
      productId: result.productId,
      matchType: result.matchType,
      status: result.status,
      reasonCode: result.reasonCode,
      confidence: result.confidence,
      resolverVersion: result.resolverVersion,
      evidence: evidence as any,
      resolvedAt: now,
    },
    update: {
      productId: result.productId,
      matchType: result.matchType,
      status: result.status,
      reasonCode: result.reasonCode,
      confidence: result.confidence,
      resolverVersion: result.resolverVersion,
      evidence: evidence as any,
      resolvedAt: now,
    },
  })
}

/**
 * Truncate evidence to fit within size limit
 * Per Spec v1.2 §2: maxEvidenceSize = 500KB
 */
function truncateEvidence(evidence: any, maxSize: number): any {
  const json = JSON.stringify(evidence)

  if (json.length <= maxSize) {
    return evidence
  }

  // Progressively remove fields to reduce size
  const truncated = { ...evidence, truncated: true }

  // First, truncate candidates to top 5
  if (truncated.candidates?.length > 5) {
    truncated.candidates = truncated.candidates.slice(0, 5)
  }

  // If still too large, remove candidates entirely
  let truncatedJson = JSON.stringify(truncated)
  if (truncatedJson.length > maxSize && truncated.candidates) {
    delete truncated.candidates
    truncatedJson = JSON.stringify(truncated)
  }

  // If still too large, truncate normalization errors
  if (truncatedJson.length > maxSize && truncated.normalizationErrors) {
    truncated.normalizationErrors = truncated.normalizationErrors.slice(0, 3)
    truncatedJson = JSON.stringify(truncated)
  }

  // If still too large, remove inputNormalized title (longest field)
  if (truncatedJson.length > maxSize && truncated.inputNormalized?.title) {
    truncated.inputNormalized.title = truncated.inputNormalized.title.slice(0, 100) + '...'
  }

  return truncated
}

/**
 * Get worker metrics for observability (Appendix B)
 */
export function getResolverWorkerMetrics(): {
  processedCount: number
  errorCount: number
  lastProcessedAt: Date | null
  isRunning: boolean
} {
  return {
    processedCount,
    errorCount,
    lastProcessedAt,
    isRunning: productResolverWorker !== null,
  }
}

/**
 * Reset worker metrics (for testing)
 */
export function resetResolverWorkerMetrics(): void {
  processedCount = 0
  errorCount = 0
  lastProcessedAt = null
}
