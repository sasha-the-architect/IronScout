import { Worker, Job } from 'bullmq'
import { prisma } from '@ironscout/db'
import axios from 'axios'
import { gunzipSync } from 'zlib'
import { redisConnection } from '../config/redis'
import { logger } from '../config/logger'
import { extractQueue, normalizeQueue, FetchJobData } from '../config/queues'
import { computeContentHash } from '../utils/hash'
import { safeExtractArray } from '../utils/arrays'
import { ImpactParser } from '../parsers' // v1 only supports IMPACT

// Re-export for backwards compatibility
export { safeExtractArray } from '../utils/arrays'

const log = logger.fetcher

// ============================================================================
// FETCHER LIMITS - Prevent memory exhaustion from bad sources
// ============================================================================

/** Maximum response size per page (10MB) */
const MAX_CONTENT_LENGTH_PER_PAGE = 10 * 1024 * 1024

/** Maximum total content size across all pages (50MB) */
const MAX_TOTAL_CONTENT_SIZE = 50 * 1024 * 1024

/** Hard maximum pages regardless of source config */
const HARD_MAX_PAGES = 100

/** Maximum items to collect before stopping pagination */
const MAX_ITEMS_COLLECTED = 50000

/** Request timeout in milliseconds */
const REQUEST_TIMEOUT = 30000

/** Maximum items per normalize job to prevent Redis payload overflow */
const NORMALIZE_CHUNK_SIZE = 1000

/** Maximum payload size in bytes for a single BullMQ job (5MB safety margin) */
const MAX_JOB_PAYLOAD_BYTES = 5 * 1024 * 1024

/**
 * Estimate payload size in bytes (accurate for UTF-8)
 */
function estimatePayloadBytes(items: unknown[]): number {
  if (items.length === 0) return 0
  // Use Buffer.byteLength for accurate UTF-8 byte count
  const sample = JSON.stringify(items.slice(0, 10))
  const avgItemBytes = Buffer.byteLength(sample, 'utf8') / Math.min(items.length, 10)
  return Math.ceil(avgItemBytes * items.length)
}

// ============================================================================
// TYPES
// ============================================================================

// Fetcher worker - retrieves content from URLs
interface PaginationConfig {
  type: 'none' | 'query_param' | 'path'
  maxPages?: number
  param?: string // e.g., "page" or "offset"
  startValue?: number
  increment?: number
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Safely stringify JSON with size limit
 * Uses Buffer.byteLength for accurate UTF-8 byte counting
 * Throws if result would exceed maxSize
 */
function safeJsonStringify(data: unknown, maxSize: number = MAX_TOTAL_CONTENT_SIZE): string {
  const result = JSON.stringify(data)
  const byteSize = Buffer.byteLength(result, 'utf8')
  if (byteSize > maxSize) {
    throw new Error(`JSON stringify result exceeds max size (${byteSize} > ${maxSize} bytes)`)
  }
  return result
}

/**
 * Decompress gzip content if needed
 * Detects gzip magic bytes (1f 8b) and decompresses
 * Returns original content if not gzip compressed
 */
function decompressIfGzip(data: Buffer | string): string {
  // If it's a string, check if it looks like gzip
  if (typeof data === 'string') {
    // Check for gzip magic bytes in binary string
    if (data.charCodeAt(0) === 0x1f && data.charCodeAt(1) === 0x8b) {
      const buffer = Buffer.from(data, 'binary')
      return gunzipSync(buffer).toString('utf-8')
    }
    return data
  }

  // If it's a buffer, check for gzip magic bytes
  if (Buffer.isBuffer(data) && data.length >= 2) {
    if (data[0] === 0x1f && data[1] === 0x8b) {
      return gunzipSync(data).toString('utf-8')
    }
    return data.toString('utf-8')
  }

  return String(data)
}

/**
 * Check if URL suggests gzip content
 */
function isGzipUrl(url: string): boolean {
  const lowerUrl = url.toLowerCase()
  return lowerUrl.endsWith('.gz') || lowerUrl.endsWith('.gzip') || lowerUrl.includes('.gz?')
}

export const fetcherWorker = new Worker<FetchJobData>(
  'fetch',
  async (job: Job<FetchJobData>) => {
    const { sourceId, executionId, url, type } = job.data
    const stageStart = Date.now()

    // Create run-scoped logger with correlation IDs
    const runLog = log.child({ executionId, sourceId, jobId: job.id })

    runLog.debug('FETCH_JOB_RECEIVED', {
      url: url?.slice(0, 100),
      type,
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts?.attempts ?? 3,
      timestamp: new Date().toISOString(),
    })

    try {
      // Get source to check pagination config
      runLog.debug('FETCH_LOADING_SOURCE', { phase: 'init' })
      const sourceLoadStart = Date.now()
      const source = await prisma.sources.findUnique({
        where: { id: sourceId },
        include: { retailers: { select: { name: true } } },
      })

      if (!source) {
        runLog.error('FETCH_SOURCE_NOT_FOUND', {
          phase: 'init',
          reason: 'Source record does not exist in database',
        })
        throw new Error(`Source ${sourceId} not found`)
      }

      const sourceName = source.name
      const retailerName = source.retailers?.name
      const sourceLoadDurationMs = Date.now() - sourceLoadStart

      runLog.debug('FETCH_SOURCE_LOADED', {
        phase: 'init',
        sourceName,
        retailerName,
        sourceLoadDurationMs,
        affiliateNetwork: source.affiliateNetwork,
        hasPaginationConfig: !!source.paginationConfig,
        sourceType: source.type,
        feedHashExists: !!source.feedHash,
      })

      runLog.info('FETCH_START', {
        sourceName,
        retailerName,
        url: url?.slice(0, 200),
        type,
        phase: 'fetch',
      })

      const paginationConfig = source.paginationConfig as PaginationConfig | null

      await prisma.execution_logs.create({
        data: {
          executionId,
          level: 'INFO',
          event: 'FETCH_START',
          message: `Fetching ${url}${paginationConfig?.type !== 'none' ? ' (with pagination)' : ''}`,
          metadata: {
            sourceId,
            url,
            type,
            hasPagination: paginationConfig?.type !== 'none',
            maxPages: paginationConfig?.maxPages || HARD_MAX_PAGES,
          },
        },
      })

      // Collect all content from all pages
      const allContent: any[] = []
      let currentPage = paginationConfig?.startValue || 1
      // Enforce hard max pages limit
      const configuredMaxPages = paginationConfig?.maxPages || HARD_MAX_PAGES
      const maxPages = Math.min(configuredMaxPages, HARD_MAX_PAGES)
      const increment = paginationConfig?.increment || 1
      let pagesFetched = 0
      let totalContentSize = 0

      // Check if URL is likely gzip compressed
      const expectGzip = isGzipUrl(url)

      runLog.debug('FETCH_CONFIG', {
        phase: 'config',
        expectGzip,
        gzipDetectionMethod: expectGzip ? 'url_extension' : 'none',
        maxPages,
        configuredMaxPages,
        hardMaxPages: HARD_MAX_PAGES,
        maxContentPerPage: MAX_CONTENT_LENGTH_PER_PAGE,
        maxTotalContent: MAX_TOTAL_CONTENT_SIZE,
        maxItemsCollected: MAX_ITEMS_COLLECTED,
        timeout: REQUEST_TIMEOUT,
        paginationType: paginationConfig?.type || 'none',
        paginationParam: paginationConfig?.param,
        paginationStartValue: currentPage,
        paginationIncrement: increment,
      })

      // Axios config with size limits
      const axiosConfig: Record<string, unknown> = {
        headers: {
          'User-Agent': 'IronScout.ai Price Crawler/1.0',
          'Accept-Encoding': 'gzip, deflate', // Accept compressed responses
        },
        timeout: REQUEST_TIMEOUT,
        maxContentLength: MAX_CONTENT_LENGTH_PER_PAGE,
        maxBodyLength: MAX_CONTENT_LENGTH_PER_PAGE,
        // For gzip files, get raw buffer to decompress manually
        ...(expectGzip && { responseType: 'arraybuffer' }),
      }

      // Loop through pages
      for (let pageNum = 0; pageNum < maxPages; pageNum++) {
        let pageUrl = url

        // Apply pagination if configured
        if (paginationConfig && paginationConfig.type !== 'none') {
          if (paginationConfig.type === 'query_param' && paginationConfig.param) {
            const separator = url.includes('?') ? '&' : '?'
            pageUrl = `${url}${separator}${paginationConfig.param}=${currentPage}`
          } else if (paginationConfig.type === 'path') {
            pageUrl = `${url}/${currentPage}`
          }
        }

        const pageRequestStart = Date.now()
        runLog.debug('FETCH_PAGE_REQUEST', {
          phase: 'pagination',
          pageNum: pageNum + 1,
          maxPages,
          pageUrl: pageUrl.slice(0, 200),
          paginationApplied: paginationConfig?.type !== 'none',
          currentPageValue: currentPage,
        })

        let pageContent: string

        // Standard HTTP fetch with limits
        const response = await axios.get(pageUrl, axiosConfig)
        const pageRequestDurationMs = Date.now() - pageRequestStart

        // Log HTTP response details
        const responseSize = Buffer.isBuffer(response.data)
          ? response.data.length
          : typeof response.data === 'string'
            ? Buffer.byteLength(response.data, 'utf8')
            : JSON.stringify(response.data).length

        runLog.debug('FETCH_PAGE_RESPONSE', {
          phase: 'pagination',
          pageNum: pageNum + 1,
          httpStatus: response.status,
          httpStatusText: response.statusText,
          contentType: response.headers['content-type'],
          contentEncoding: response.headers['content-encoding'],
          contentLength: response.headers['content-length'],
          actualResponseBytes: responseSize,
          responseDataType: Buffer.isBuffer(response.data) ? 'buffer' : typeof response.data,
          requestDurationMs: pageRequestDurationMs,
        })

        // Handle response data based on type
        let decompressionApplied = false
        if (expectGzip || Buffer.isBuffer(response.data)) {
          // Decompress if gzip
          pageContent = decompressIfGzip(response.data)
          decompressionApplied = true
        } else if (typeof response.data === 'string') {
          // Check for gzip magic bytes in string (can happen with some servers)
          const originalLength = response.data.length
          pageContent = decompressIfGzip(response.data)
          decompressionApplied = pageContent.length !== originalLength
        } else {
          // Convert to string if axios parsed JSON, with size limit
          pageContent = safeJsonStringify(response.data, MAX_CONTENT_LENGTH_PER_PAGE)
        }

        const pageContentBytes = Buffer.byteLength(pageContent, 'utf8')
        runLog.debug('FETCH_PAGE_PROCESSED', {
          phase: 'pagination',
          pageNum: pageNum + 1,
          decompressionApplied,
          compressionRatio: decompressionApplied && responseSize > 0 ? (pageContentBytes / responseSize).toFixed(2) : null,
          processedContentBytes: pageContentBytes,
        })

        // Track total content size in bytes (accurate for UTF-8)
        totalContentSize += Buffer.byteLength(pageContent, 'utf8')
        if (totalContentSize > MAX_TOTAL_CONTENT_SIZE) {
          runLog.warn('FETCH_SIZE_LIMIT_EXCEEDED', {
            phase: 'pagination',
            pageNum: pageNum + 1,
            totalContentSize,
            limit: MAX_TOTAL_CONTENT_SIZE,
            reason: 'Total accumulated content size exceeds maximum allowed',
            action: 'stopping_pagination',
          })
          await prisma.execution_logs.create({
            data: {
              executionId,
              level: 'WARN',
              event: 'FETCH_SIZE_LIMIT',
              message: `Total content size limit exceeded after ${pagesFetched} pages`,
              metadata: { totalContentSize, limit: MAX_TOTAL_CONTENT_SIZE },
            },
          })
          break
        }

        pagesFetched++

        // For JSON/RSS, parse and check if empty
        if (type === 'JSON' || type === 'RSS') {
          try {
            const parsed = typeof pageContent === 'string' ? JSON.parse(pageContent) : pageContent
            // Use safe extraction to handle non-iterable objects
            const items = safeExtractArray(parsed)

            if (items.length === 0) {
              runLog.debug('FETCH_PAGINATION_EMPTY', {
                phase: 'pagination',
                pageNum: pageNum + 1,
                reason: 'Page returned zero items',
                action: 'stopping_pagination',
              })
              break
            }

            allContent.push(...items)

            // Check items limit
            if (allContent.length >= MAX_ITEMS_COLLECTED) {
              runLog.warn('FETCH_ITEMS_LIMIT_REACHED', {
                phase: 'pagination',
                pageNum: pageNum + 1,
                itemCount: allContent.length,
                limit: MAX_ITEMS_COLLECTED,
                reason: 'Maximum items collection limit reached',
                action: 'stopping_pagination',
              })
              await prisma.execution_logs.create({
                data: {
                  executionId,
                  level: 'WARN',
                  event: 'FETCH_ITEMS_LIMIT',
                  message: `Max items limit reached after ${pagesFetched} pages`,
                  metadata: { itemCount: allContent.length, limit: MAX_ITEMS_COLLECTED },
                },
              })
              break
            }
          } catch (e) {
            // If parsing fails, treat as single page
            allContent.push(pageContent)
            break
          }
        } else {
          // For HTML, concatenate all pages
          allContent.push(pageContent)
        }

        // If no pagination configured, stop after first page
        if (!paginationConfig || paginationConfig.type === 'none') {
          break
        }

        currentPage += increment
      }

      runLog.info('FETCH_COMPLETE', {
        phase: 'fetch',
        sourceName,
        retailerName,
        pagesFetched,
        itemCount: allContent.length,
        totalContentSize,
        fetchDurationMs: Date.now() - stageStart,
        avgBytesPerPage: pagesFetched > 0 ? Math.round(totalContentSize / pagesFetched) : 0,
        avgItemsPerPage: pagesFetched > 0 ? Math.round(allContent.length / pagesFetched) : 0,
      })

      // Serialize content based on type with size limits
      let content: string
      if (type === 'JSON' && allContent.length > 0 && typeof allContent[0] !== 'string') {
        content = safeJsonStringify(allContent)
      } else if (type === 'HTML') {
        content = allContent.join('\n')
        const htmlBytes = Buffer.byteLength(content, 'utf8')
        if (htmlBytes > MAX_TOTAL_CONTENT_SIZE) {
          throw new Error(`HTML content exceeds max size (${htmlBytes} > ${MAX_TOTAL_CONTENT_SIZE} bytes)`)
        }
      } else {
        content = safeJsonStringify(allContent)
      }

      const fetchDurationMs = Date.now() - stageStart
      const contentBytes = Buffer.byteLength(content, 'utf8')

      await prisma.execution_logs.create({
        data: {
          executionId,
          level: 'INFO',
          event: 'FETCH_OK',
          message: `Fetched ${pagesFetched} page(s), ${allContent.length} items (${contentBytes} bytes)`,
          metadata: {
            // Timing
            durationMs: fetchDurationMs,
            // Counters
            pagesFetched,
            itemsCollected: allContent.length,
            contentBytes,
            // Context
            sourceId,
            type,
          },
        },
      })

      // Hash-based caching for affiliate feeds
      // Compute content hash and compare with stored hash to skip unchanged feeds
      const contentHash = computeContentHash(content)

      if (source.feedHash === contentHash) {
        await prisma.execution_logs.create({
          data: {
            executionId,
            level: 'INFO',
            event: 'FEED_UNCHANGED',
            message: 'Feed content unchanged (hash match), skipping processing',
            metadata: { contentHash },
          },
        })

        // Mark execution as complete with no items processed
        await prisma.executions.update({
          where: { id: executionId },
          data: {
            status: 'SUCCESS',
            itemsFound: 0,
            itemsUpserted: 0,
            completedAt: new Date(),
            duration: Date.now() - new Date(job.timestamp).getTime(),
          },
        })

        await prisma.execution_logs.create({
          data: {
            executionId,
            level: 'INFO',
            event: 'EXEC_DONE',
            message: 'Execution completed (feed unchanged)',
          },
        })

        return { success: true, contentLength: Buffer.byteLength(content, 'utf8'), skipped: true }
      }

      // Hash differs or is null - continue with processing
      await prisma.execution_logs.create({
        data: {
          executionId,
          level: 'INFO',
          event: 'FEED_CHANGED',
          message: source.feedHash
            ? 'Feed content changed, proceeding with processing'
            : 'No previous hash found, proceeding with processing',
          metadata: {
            oldHash: source.feedHash,
            newHash: contentHash
          },
        },
      })

      // Pipeline routing: FEED types go through parsers, others go through extractors
      const isFeedType = type === 'JSON' && source.affiliateNetwork !== null

      if (isFeedType && source.affiliateNetwork) {
        // Route to parser layer for affiliate feeds
        await prisma.execution_logs.create({
          data: {
            executionId,
            level: 'INFO',
            event: 'PARSE_START',
            message: `Routing to ${source.affiliateNetwork} parser`,
            metadata: { network: source.affiliateNetwork },
          },
        })

        // Select appropriate parser based on affiliate network
        // v1 only supports IMPACT network
        let parser
        switch (source.affiliateNetwork) {
          case 'IMPACT':
            parser = new ImpactParser()
            break
          default:
            throw new Error(`Unsupported affiliate network: ${source.affiliateNetwork}. Only IMPACT is supported in v1.`)
        }

        // Parse the feed content
        const parsedItems = await parser.parse(content)

        await prisma.execution_logs.create({
          data: {
            executionId,
            level: 'INFO',
            event: 'PARSE_OK',
            message: `Parsed ${parsedItems.length} items from ${source.affiliateNetwork} feed`,
            metadata: { itemCount: parsedItems.length },
          },
        })

        // Update execution with items found
        await prisma.executions.update({
          where: { id: executionId },
          data: { itemsFound: parsedItems.length },
        })

        // Check payload size and chunk if needed to prevent Redis overflow
        const estimatedBytes = estimatePayloadBytes(parsedItems)
        const needsChunking = parsedItems.length > NORMALIZE_CHUNK_SIZE || estimatedBytes > MAX_JOB_PAYLOAD_BYTES

        if (needsChunking) {
          // Chunk into smaller jobs
          const chunkCount = Math.ceil(parsedItems.length / NORMALIZE_CHUNK_SIZE)
          runLog.info('FETCH_CHUNKING_NORMALIZE', {
            phase: 'routing',
            routePath: 'feed',
            totalItems: parsedItems.length,
            estimatedBytes,
            chunkCount,
            chunkSize: NORMALIZE_CHUNK_SIZE,
            reason: parsedItems.length > NORMALIZE_CHUNK_SIZE
              ? 'item_count_exceeds_chunk_size'
              : 'payload_size_exceeds_limit',
            maxJobPayloadBytes: MAX_JOB_PAYLOAD_BYTES,
          })

          for (let i = 0; i < parsedItems.length; i += NORMALIZE_CHUNK_SIZE) {
            const chunkIndex = Math.floor(i / NORMALIZE_CHUNK_SIZE)
            const chunk = parsedItems.slice(i, i + NORMALIZE_CHUNK_SIZE)
            const isLastChunk = chunkIndex === chunkCount - 1

            await normalizeQueue.add('normalize', {
              executionId,
              sourceId,
              rawItems: chunk,
              // Only pass contentHash on last chunk to update after all chunks processed
              contentHash: isLastChunk ? contentHash : undefined,
              chunkInfo: { index: chunkIndex, total: chunkCount, isLast: isLastChunk },
            }, {
              jobId: `normalize--${executionId}--${chunkIndex}`, // Unique per chunk
            })
          }

          await prisma.execution_logs.create({
            data: {
              executionId,
              level: 'INFO',
              event: 'NORMALIZE_QUEUED',
              message: `Queued ${chunkCount} normalize chunks for ${parsedItems.length} items (feed path)`,
              metadata: { chunkCount, totalItems: parsedItems.length, estimatedBytes },
            },
          })
        } else {
          // Single job for small payloads
          await normalizeQueue.add('normalize', {
            executionId,
            sourceId,
            rawItems: parsedItems,
            contentHash,
          }, {
            jobId: `normalize--${executionId}`, // Idempotent: one normalize per execution
          })

          await prisma.execution_logs.create({
            data: {
              executionId,
              level: 'INFO',
              event: 'NORMALIZE_QUEUED',
              message: 'Normalize job queued (feed path)',
            },
          })
        }
      } else {
        // Route to extractor for scrapers
        await extractQueue.add('extract', {
          executionId,
          sourceId,
          content,
          sourceType: type,
          contentHash,
        }, {
          jobId: `extract:${executionId}`, // Idempotent: one extract per execution
        })

        await prisma.execution_logs.create({
          data: {
            executionId,
            level: 'INFO',
            event: 'EXTRACT_QUEUED',
            message: 'Extract job queued (scraper path)',
          },
        })
      }

      return { success: true, contentLength: Buffer.byteLength(content, 'utf8') }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      await prisma.execution_logs.create({
        data: {
          executionId,
          level: 'ERROR',
          event: 'FETCH_FAIL',
          message: `Failed to fetch ${url}: ${errorMessage}`,
        },
      })

      // Update execution status
      await prisma.executions.update({
        where: { id: executionId },
        data: {
          status: 'FAILED',
          errorMessage: `Fetch failed: ${errorMessage}`,
          completedAt: new Date(),
        },
      })

      throw error
    }
  },
  {
    connection: redisConnection,
    concurrency: 5, // Process up to 5 fetches concurrently
  }
)

fetcherWorker.on('completed', (job) => {
  log.info('FETCH_JOB_COMPLETED', {
    jobId: job.id,
    executionId: job.data?.executionId,
    sourceId: job.data?.sourceId,
    returnValue: job.returnvalue,
    attemptsMade: job.attemptsMade,
    processingDurationMs: job.processedOn ? Date.now() - job.processedOn : null,
    totalDurationMs: job.finishedOn && job.timestamp ? job.finishedOn - job.timestamp : null,
  })
})

fetcherWorker.on('failed', (job, err) => {
  log.error('FETCH_JOB_FAILED', {
    jobId: job?.id,
    executionId: job?.data?.executionId,
    sourceId: job?.data?.sourceId,
    errorName: err.name,
    errorMessage: err.message,
    errorStack: err.stack?.slice(0, 500),
    attemptsMade: job?.attemptsMade,
    maxAttempts: job?.opts?.attempts ?? 3,
    willRetry: (job?.attemptsMade ?? 0) < (job?.opts?.attempts ?? 3),
  }, err)
})
