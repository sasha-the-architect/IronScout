/**
 * Product Resolver BullMQ Worker (Spec v1.2)
 *
 * Processes RESOLVE_SOURCE_PRODUCT jobs from the product-resolve queue.
 *
 * Per Spec v1.2 §0.3:
 * - JobId format: RESOLVE_SOURCE_PRODUCT_<sourceProductId>
 * - Retry: system errors only, max 3 attempts
 * - Debounce: 10-30s per sourceProductId (handled by jobId deduplication)
 *
 * @see context/specs/product-resolver-12.md
 */

import { Worker, Job } from 'bullmq'
import { prisma, isAutoEmbeddingEnabled } from '@ironscout/db'
import type { SourceKind } from '@ironscout/db/generated/prisma'
import { redisConnection } from '../config/redis'
import {
  QUEUE_NAMES,
  ProductResolveJobData,
  productResolveQueue,
  enqueueEmbeddingGenerate,
} from '../config/queues'
import { resolveSourceProduct, RESOLVER_VERSION } from './resolver'
import { brandAliasCache } from './brand-alias-cache'
import { logger } from '../config/logger'
import { logResolverResult, logResolverError, closeResolverLogger } from '../config/run-file-logger'
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
export async function startProductResolverWorker(options?: {
  concurrency?: number
  maxStalledCount?: number
}): Promise<Worker<ProductResolveJobData>> {
  const concurrency = options?.concurrency ?? 5
  const maxStalledCount = options?.maxStalledCount ?? 3

  // Initialize brand alias cache before starting worker
  await brandAliasCache.initialize(prisma)
  log.info('BRAND_ALIAS_CACHE_INITIALIZED', {
    event_name: 'BRAND_ALIAS_CACHE_INITIALIZED',
    metrics: brandAliasCache.getMetrics(),
  })

  log.info('RESOLVER_WORKER_START', {
    event_name: 'RESOLVER_WORKER_START',
    concurrency,
    maxStalledCount,
    queueName: QUEUE_NAMES.PRODUCT_RESOLVE,
    resolverVersion: RESOLVER_VERSION,
  })

  productResolverWorker = new Worker<ProductResolveJobData>(
    QUEUE_NAMES.PRODUCT_RESOLVE,
    async (job: Job<ProductResolveJobData>) => {
      return processResolveJob(job)
    },
    {
      connection: redisConnection,
      concurrency,
      maxStalledCount,
    }
  )

  // Event handlers for observability
  productResolverWorker.on('completed', (job: Job<ProductResolveJobData>) => {
    processedCount++
    lastProcessedAt = new Date()
    log.debug('RESOLVER_JOB_COMPLETED', {
      event_name: 'RESOLVER_JOB_COMPLETED',
      jobId: job.id,
      sourceProductId: job.data.sourceProductId,
      trigger: job.data.trigger,
      processedCount,
    })
  })

  productResolverWorker.on('failed', (job: Job<ProductResolveJobData> | undefined, error: Error) => {
    errorCount++
    log.error('RESOLVER_JOB_FAILED', {
      event_name: 'RESOLVER_JOB_FAILED',
      jobId: job?.id,
      sourceProductId: job?.data?.sourceProductId,
      trigger: job?.data?.trigger,
      errorMessage: error.message,
      errorName: error.name,
      errorCount,
      attemptsMade: job?.attemptsMade,
    }, error)
  })

  productResolverWorker.on('error', (error: Error) => {
    log.error('RESOLVER_WORKER_ERROR', {
      event_name: 'RESOLVER_WORKER_ERROR',
      errorMessage: error.message,
      errorName: error.name,
    }, error)
  })

  productResolverWorker.on('stalled', (jobId: string) => {
    log.error('RESOLVER_JOB_STALLED', {
      event_name: 'RESOLVER_JOB_STALLED',
      jobId,
      reason: 'Job processing took too long or worker crashed',
    })
  })

  return productResolverWorker
}

/**
 * Stop the Product Resolver worker gracefully
 */
export async function stopProductResolverWorker(): Promise<void> {
  if (productResolverWorker) {
    log.info('RESOLVER_WORKER_STOPPING', {
      event_name: 'RESOLVER_WORKER_STOPPING',
      processedCount,
      errorCount,
      lastProcessedAt: lastProcessedAt?.toISOString(),
    })
    await productResolverWorker.close()
    productResolverWorker = null

    // Stop brand alias cache refresh timer and Redis subscriber
    await brandAliasCache.stop()

    // Close the daily rolling file logger
    await closeResolverLogger()

    log.info('RESOLVER_WORKER_STOPPED', {
      event_name: 'RESOLVER_WORKER_STOPPED',
      finalProcessedCount: processedCount,
      finalErrorCount: errorCount,
    })
  }
}

/**
 * Process a single RESOLVE_SOURCE_PRODUCT job
 * Per Spec v1.2 §0.3: Execute resolver and persist result
 *
 * Performance optimizations:
 * - sourceKind is returned by resolver (avoids duplicate DB fetch)
 * - Persistence is skipped when result.skipped=true (SKIP_SAME_INPUT, MANUAL_LOCKED)
 */
async function processResolveJob(
  job: Job<ProductResolveJobData>
): Promise<ResolverResult> {
  const { sourceProductId, trigger, resolverVersion } = job.data
  const startTime = Date.now()

  log.info('RESOLVER_JOB_START', {
    event_name: 'RESOLVER_JOB_START',
    jobId: job.id,
    sourceProductId,
    trigger,
    jobResolverVersion: resolverVersion,
    currentResolverVersion: RESOLVER_VERSION,
    attemptsMade: job.attemptsMade,
    timestamp: job.timestamp,
  })

  // Version check - warn if job was enqueued with different version
  if (resolverVersion !== RESOLVER_VERSION) {
    log.warn('RESOLVER_VERSION_MISMATCH', {
      event_name: 'RESOLVER_VERSION_MISMATCH',
      sourceProductId,
      jobVersion: resolverVersion,
      currentVersion: RESOLVER_VERSION,
      reason: 'Job was enqueued with different resolver version - algorithm may have changed',
    })
  }

  // Transition request status to PROCESSING
  const requestUpdate = await prisma.product_resolve_requests.updateMany({
    where: {
      sourceProductId,
      status: 'PENDING',
    },
    data: {
      status: 'PROCESSING',
      lastAttemptAt: new Date(),
    },
  })

  log.debug('RESOLVER_REQUEST_PROCESSING', {
    event_name: 'RESOLVER_REQUEST_PROCESSING',
    sourceProductId,
    rowsUpdated: requestUpdate.count,
  })

  try {
    // Execute resolver algorithm
    log.debug('RESOLVER_ALGORITHM_START', {
      event_name: 'RESOLVER_ALGORITHM_START',
      sourceProductId,
      trigger,
    })

    const result = await resolveSourceProduct(sourceProductId, trigger, job.data.affiliateFeedRunId)

    // Get sourceKind from result (resolver already fetched it, avoids duplicate DB query)
    const sourceKind: SourceKindLabel = result.sourceKind ?? 'UNKNOWN'

    // Record request metric (now using sourceKind from result)
    recordRequest(sourceKind)

    log.debug('RESOLVER_ALGORITHM_COMPLETE', {
      event_name: 'RESOLVER_ALGORITHM_COMPLETE',
      sourceProductId,
      matchType: result.matchType,
      status: result.status,
      reasonCode: result.reasonCode,
      confidence: result.confidence,
      productId: result.productId,
      isRelink: result.isRelink,
      relinkBlocked: result.relinkBlocked,
      createdProduct: !!result.createdProduct,
      skipped: result.skipped,
      rulesFired: result.evidence?.rulesFired,
    })

    // Skip persistence when result is unchanged (SKIP_SAME_INPUT, MANUAL_LOCKED)
    // This avoids 2 writes per job when inputHash hasn't changed
    // Also skip when source product doesn't exist (SOURCE_NOT_FOUND) to avoid FK violation
    const isSourceNotFound = result.evidence?.systemError?.code === 'SOURCE_NOT_FOUND'
    const skipPersistence = result.skipped || isSourceNotFound

    if (skipPersistence) {
      log.debug('RESOLVER_PERSISTENCE_SKIPPED', {
        event_name: 'RESOLVER_PERSISTENCE_SKIPPED',
        sourceProductId,
        reason: isSourceNotFound
          ? 'Source product not found - cannot persist'
          : 'Result unchanged - skipping persistence',
        matchType: result.matchType,
        reasonCode: result.reasonCode,
      })
    } else {
      // Persist result to product_links
      const persistStart = Date.now()
      await persistResolverResult(sourceProductId, result)
      const persistDuration = Date.now() - persistStart

      log.debug('RESOLVER_RESULT_PERSISTED', {
        event_name: 'RESOLVER_RESULT_PERSISTED',
        sourceProductId,
        productId: result.productId,
        matchType: result.matchType,
        persistDurationMs: persistDuration,
      })

      // Update source_products.normalizedHash if applicable
      if (result.evidence?.inputHash) {
        await prisma.source_products.update({
          where: { id: sourceProductId },
          data: { normalizedHash: result.evidence.inputHash },
        })
        log.debug('RESOLVER_HASH_UPDATED', {
          event_name: 'RESOLVER_HASH_UPDATED',
          sourceProductId,
          inputHash: result.evidence.inputHash.slice(0, 16) + '...',
        })
      }
    }

    // Record decision metrics
    const durationMs = Date.now() - startTime
    recordResolverJob({
      sourceKind,
      status: result.status,
      reasonCode: result.status === 'ERROR' ? (result.reasonCode as ReasonCodeLabel) : undefined,
      durationMs,
    })

    // Transition request status to COMPLETED
    await prisma.product_resolve_requests.updateMany({
      where: {
        sourceProductId,
        status: 'PROCESSING',
      },
      data: {
        status: 'COMPLETED',
        resultProductId: result.productId,
        errorMessage: null,
      },
    })

    log.info('RESOLVER_JOB_COMPLETE', {
      event_name: 'RESOLVER_JOB_COMPLETE',
      jobId: job.id,
      sourceProductId,
      trigger,
      sourceKind,
      matchType: result.matchType,
      status: result.status,
      reasonCode: result.reasonCode,
      productId: result.productId,
      confidence: Number(result.confidence.toFixed(4)),
      isRelink: result.isRelink,
      relinkBlocked: result.relinkBlocked,
      createdProduct: !!result.createdProduct,
      skipped: result.skipped,
      durationMs,
    })

    // Log to per-run file (or daily fallback for RECONCILE/MANUAL)
    logResolverResult({
      sourceProductId,
      matchType: result.matchType,
      status: result.status,
      reasonCode: result.reasonCode,
      confidence: Number(result.confidence.toFixed(4)),
      productId: result.productId,
      durationMs,
      trigger,
      skipped: result.skipped,
      createdProduct: !!result.createdProduct,
      affiliateFeedRunId: job.data.affiliateFeedRunId,
    })

    // Enqueue embedding generation if enabled and resolution was successful
    // Only generate embeddings for MATCHED or CREATED (not skipped or ERROR)
    if (
      result.productId &&
      (result.status === 'MATCHED' || result.status === 'CREATED') &&
      !result.skipped
    ) {
      try {
        const autoEmbeddingEnabled = await isAutoEmbeddingEnabled()
        if (autoEmbeddingEnabled) {
          const enqueued = await enqueueEmbeddingGenerate(result.productId, 'RESOLVE', {
            resolverVersion: RESOLVER_VERSION,
            affiliateFeedRunId: job.data.affiliateFeedRunId,
          })
          if (enqueued) {
            log.debug('EMBEDDING_JOB_ENQUEUED', {
              event_name: 'EMBEDDING_JOB_ENQUEUED',
              productId: result.productId,
              sourceProductId,
              trigger: 'RESOLVE',
            })
          }
        }
      } catch (embeddingErr) {
        // Log but don't fail the resolver job for embedding errors
        log.warn('EMBEDDING_ENQUEUE_FAILED', {
          event_name: 'EMBEDDING_ENQUEUE_FAILED',
          productId: result.productId,
          sourceProductId,
          error: embeddingErr instanceof Error ? embeddingErr.message : String(embeddingErr),
        })
      }
    }

    return result
  } catch (error: any) {
    // Record failure metrics for system errors
    // Note: sourceKind is unknown at this point since resolver failed
    const durationMs = Date.now() - startTime
    recordResolverJob({
      sourceKind: 'UNKNOWN',
      status: 'ERROR',
      reasonCode: 'SYSTEM_ERROR',
      durationMs,
    })

    // Determine if this is the final attempt (BullMQ attempts: 3 means 3 total)
    const isFinalAttempt = job.attemptsMade >= 2 // 0-indexed, so 2 = 3rd attempt

    if (isFinalAttempt) {
      // Final attempt failed - mark request as FAILED
      await prisma.product_resolve_requests.updateMany({
        where: {
          sourceProductId,
          status: 'PROCESSING',
        },
        data: {
          status: 'FAILED',
          errorMessage: error.message?.slice(0, 1000) ?? 'Unknown error',
        },
      })
    }
    // If not final attempt, leave as PROCESSING so sweeper can recover if needed

    log.error('RESOLVER_JOB_ERROR', {
      event_name: 'RESOLVER_JOB_ERROR',
      jobId: job.id,
      sourceProductId,
      trigger,
      sourceKind: 'UNKNOWN', // Not available when resolver fails
      errorMessage: error.message,
      errorName: error.name,
      errorCode: error.code,
      durationMs,
      attemptsMade: job.attemptsMade,
      isFinalAttempt,
      willRetry: !isFinalAttempt,
    }, error)

    // Log error to per-run file (or daily fallback)
    logResolverError(sourceProductId, 'RESOLVER_ERROR', {
      trigger,
      durationMs,
      attemptsMade: job.attemptsMade,
      isFinalAttempt,
    }, error, job.data.affiliateFeedRunId)

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
  const maxEvidenceSize = 500 * 1024
  const { evidence, wasTruncated, originalSize, finalSize } = truncateEvidence(result.evidence, maxEvidenceSize)

  if (wasTruncated) {
    log.warn('RESOLVER_EVIDENCE_TRUNCATED', {
      event_name: 'RESOLVER_EVIDENCE_TRUNCATED',
      sourceProductId,
      originalSize,
      finalSize,
      maxSize: maxEvidenceSize,
      reductionPercent: ((originalSize - finalSize) / originalSize * 100).toFixed(1),
    })
  }

  log.debug('RESOLVER_PERSIST_START', {
    event_name: 'RESOLVER_PERSIST_START',
    sourceProductId,
    productId: result.productId,
    matchType: result.matchType,
    status: result.status,
    evidenceSize: finalSize,
  })

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
function truncateEvidence(
  evidence: any,
  maxSize: number
): { evidence: any; wasTruncated: boolean; originalSize: number; finalSize: number } {
  const json = JSON.stringify(evidence)
  const originalSize = json.length

  if (json.length <= maxSize) {
    return {
      evidence,
      wasTruncated: false,
      originalSize,
      finalSize: originalSize,
    }
  }

  // Progressively remove fields to reduce size
  const truncated = { ...evidence, truncated: true }
  const truncationSteps: string[] = []

  // First, truncate candidates to top 5
  if (truncated.candidates?.length > 5) {
    const originalCandidates = truncated.candidates.length
    truncated.candidates = truncated.candidates.slice(0, 5)
    truncationSteps.push(`candidates: ${originalCandidates} -> 5`)
  }

  // If still too large, remove candidates entirely
  let truncatedJson = JSON.stringify(truncated)
  if (truncatedJson.length > maxSize && truncated.candidates) {
    truncationSteps.push('candidates: removed entirely')
    delete truncated.candidates
    truncatedJson = JSON.stringify(truncated)
  }

  // If still too large, truncate normalization errors
  if (truncatedJson.length > maxSize && truncated.normalizationErrors) {
    const originalErrors = truncated.normalizationErrors.length
    truncated.normalizationErrors = truncated.normalizationErrors.slice(0, 3)
    truncationSteps.push(`normalizationErrors: ${originalErrors} -> 3`)
    truncatedJson = JSON.stringify(truncated)
  }

  // If still too large, remove inputNormalized title (longest field)
  if (truncatedJson.length > maxSize && truncated.inputNormalized?.title) {
    const originalTitleLen = truncated.inputNormalized.title.length
    truncated.inputNormalized.title = truncated.inputNormalized.title.slice(0, 100) + '...'
    truncationSteps.push(`inputNormalized.title: ${originalTitleLen} -> 100`)
    truncatedJson = JSON.stringify(truncated)
  }

  // Add truncation metadata
  truncated.truncationSteps = truncationSteps

  return {
    evidence: truncated,
    wasTruncated: true,
    originalSize,
    finalSize: truncatedJson.length,
  }
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

// ═══════════════════════════════════════════════════════════════════════════════
// STUCK PROCESSING SWEEPER
// ═══════════════════════════════════════════════════════════════════════════════

// Sweeper configuration
const SWEEPER_INTERVAL_MS = 60_000 // Run every 60 seconds
const PROCESSING_TIMEOUT_MS = 5 * 60_000 // 5 minutes stuck = timeout
const MAX_ATTEMPTS = 3

let sweeperInterval: ReturnType<typeof setInterval> | null = null
let sweeperRunning = false

/**
 * Start the stuck PROCESSING sweeper
 * Runs periodically to detect and recover stuck requests
 */
export function startProcessingSweeper(): void {
  if (sweeperInterval) {
    log.warn('SWEEPER_ALREADY_RUNNING', {
      event_name: 'SWEEPER_ALREADY_RUNNING',
    })
    return
  }

  log.info('SWEEPER_START', {
    event_name: 'SWEEPER_START',
    intervalMs: SWEEPER_INTERVAL_MS,
    timeoutMs: PROCESSING_TIMEOUT_MS,
    maxAttempts: MAX_ATTEMPTS,
  })

  sweeperInterval = setInterval(async () => {
    if (sweeperRunning) {
      log.debug('SWEEPER_SKIP_IN_PROGRESS', {
        event_name: 'SWEEPER_SKIP_IN_PROGRESS',
      })
      return
    }

    sweeperRunning = true
    try {
      await sweepStuckProcessing()
    } catch (err) {
      log.error('SWEEPER_ERROR', {
        event_name: 'SWEEPER_ERROR',
        error: err instanceof Error ? err.message : String(err),
      }, err)
    } finally {
      sweeperRunning = false
    }
  }, SWEEPER_INTERVAL_MS)
}

/**
 * Stop the stuck PROCESSING sweeper
 */
export function stopProcessingSweeper(): void {
  if (sweeperInterval) {
    clearInterval(sweeperInterval)
    sweeperInterval = null
    log.info('SWEEPER_STOP', {
      event_name: 'SWEEPER_STOP',
    })
  }
}

/**
 * Sweep stuck PROCESSING requests
 *
 * Finds requests that have been PROCESSING for too long and:
 * - Transitions to FAILED if max attempts reached
 * - Transitions to PENDING and re-enqueues if retries remain
 */
async function sweepStuckProcessing(): Promise<void> {
  const timeoutThreshold = new Date(Date.now() - PROCESSING_TIMEOUT_MS)

  // Find stuck PROCESSING requests
  const stuckRequests = await prisma.product_resolve_requests.findMany({
    where: {
      status: 'PROCESSING',
      updatedAt: { lt: timeoutThreshold },
    },
    select: {
      id: true,
      idempotencyKey: true,
      sourceProductId: true,
      attempts: true,
      lastAttemptAt: true,
    },
    take: 100, // Batch limit
  })

  if (stuckRequests.length === 0) {
    return
  }

  log.info('SWEEPER_FOUND_STUCK', {
    event_name: 'SWEEPER_FOUND_STUCK',
    count: stuckRequests.length,
    timeoutThreshold: timeoutThreshold.toISOString(),
  })

  let retriedCount = 0
  let failedCount = 0

  for (const request of stuckRequests) {
    const newAttempts = request.attempts + 1

    if (newAttempts >= MAX_ATTEMPTS) {
      // Max attempts reached - mark as FAILED
      await prisma.product_resolve_requests.update({
        where: { id: request.id },
        data: {
          status: 'FAILED',
          attempts: newAttempts,
          errorMessage: `Exceeded max attempts (${MAX_ATTEMPTS}) - stuck in PROCESSING`,
        },
      })
      failedCount++

      log.error('SWEEPER_REQUEST_FAILED', {
        event_name: 'SWEEPER_REQUEST_FAILED',
        requestId: request.id,
        sourceProductId: request.sourceProductId,
        attempts: newAttempts,
        maxAttempts: MAX_ATTEMPTS,
      })
    } else {
      // Retry - transition back to PENDING and re-enqueue
      await prisma.product_resolve_requests.update({
        where: { id: request.id },
        data: {
          status: 'PENDING',
          attempts: newAttempts,
        },
      })

      // Re-enqueue to BullMQ
      const jobId = `RESOLVE_SOURCE_PRODUCT_${request.sourceProductId}`
      await productResolveQueue.add(
        'RESOLVE_SOURCE_PRODUCT',
        {
          sourceProductId: request.sourceProductId,
          trigger: 'RECONCILE' as const, // Retry is a reconciliation
          resolverVersion: RESOLVER_VERSION,
        },
        {
          jobId,
          delay: 5_000, // 5s delay for retry
        }
      )
      retriedCount++

      log.info('SWEEPER_REQUEST_RETRY', {
        event_name: 'SWEEPER_REQUEST_RETRY',
        requestId: request.id,
        sourceProductId: request.sourceProductId,
        attempts: newAttempts,
        maxAttempts: MAX_ATTEMPTS,
      })
    }
  }

  log.info('SWEEPER_COMPLETE', {
    event_name: 'SWEEPER_COMPLETE',
    totalStuck: stuckRequests.length,
    retried: retriedCount,
    failed: failedCount,
  })
}
