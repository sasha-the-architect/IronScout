import { Worker, Job } from 'bullmq'
import { prisma } from '@ironscout/db'
import axios from 'axios'
import { gunzipSync } from 'zlib'
import { redisConnection } from '../config/redis'
import { logger } from '../config/logger'
import { extractQueue, normalizeQueue, FetchJobData } from '../config/queues'
import { computeContentHash } from '../utils/hash'
import { ImpactParser } from '../parsers' // v1 only supports IMPACT

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
 * Throws if result would exceed maxSize
 */
function safeJsonStringify(data: unknown, maxSize: number = MAX_TOTAL_CONTENT_SIZE): string {
  const result = JSON.stringify(data)
  if (result.length > maxSize) {
    throw new Error(`JSON stringify result exceeds max size (${result.length} > ${maxSize} bytes)`)
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

    try {
      // Get source to check pagination config
      const source = await prisma.source.findUnique({
        where: { id: sourceId },
        include: { retailer: { select: { name: true } } },
      })

      if (!source) {
        throw new Error(`Source ${sourceId} not found`)
      }

      const sourceName = source.name
      const retailerName = source.retailer?.name

      log.info('Fetching URL', { sourceId, sourceName, retailerName, executionId, url, type })

      const paginationConfig = source.paginationConfig as PaginationConfig | null

      await prisma.executionLog.create({
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

        log.debug('Fetching page', { pageNum: pageNum + 1, pageUrl })

        let pageContent: string

        // Standard HTTP fetch with limits
        const response = await axios.get(pageUrl, axiosConfig)

        // Handle response data based on type
        if (expectGzip || Buffer.isBuffer(response.data)) {
          // Decompress if gzip
          pageContent = decompressIfGzip(response.data)
        } else if (typeof response.data === 'string') {
          // Check for gzip magic bytes in string (can happen with some servers)
          pageContent = decompressIfGzip(response.data)
        } else {
          // Convert to string if axios parsed JSON, with size limit
          pageContent = safeJsonStringify(response.data, MAX_CONTENT_LENGTH_PER_PAGE)
        }

        // Track total content size
        totalContentSize += pageContent.length
        if (totalContentSize > MAX_TOTAL_CONTENT_SIZE) {
          log.warn('Total content size limit exceeded, stopping', { totalContentSize, limit: MAX_TOTAL_CONTENT_SIZE })
          await prisma.executionLog.create({
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
            const items = Array.isArray(parsed) ? parsed : parsed.products || parsed.items || []

            if (items.length === 0) {
              log.debug('No more items found, stopping pagination', { pageNum: pageNum + 1 })
              break
            }

            allContent.push(...items)

            // Check items limit
            if (allContent.length >= MAX_ITEMS_COLLECTED) {
              log.warn('Max items limit reached, stopping', { itemCount: allContent.length, limit: MAX_ITEMS_COLLECTED })
              await prisma.executionLog.create({
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

      log.info('Fetch complete', { sourceId, sourceName, retailerName, executionId, pagesFetched, itemCount: allContent.length, totalContentSize })

      // Serialize content based on type with size limits
      let content: string
      if (type === 'JSON' && allContent.length > 0 && typeof allContent[0] !== 'string') {
        content = safeJsonStringify(allContent)
      } else if (type === 'HTML') {
        content = allContent.join('\n')
        if (content.length > MAX_TOTAL_CONTENT_SIZE) {
          throw new Error(`HTML content exceeds max size (${content.length} > ${MAX_TOTAL_CONTENT_SIZE} bytes)`)
        }
      } else {
        content = safeJsonStringify(allContent)
      }

      const fetchDurationMs = Date.now() - stageStart

      await prisma.executionLog.create({
        data: {
          executionId,
          level: 'INFO',
          event: 'FETCH_OK',
          message: `Fetched ${pagesFetched} page(s), ${allContent.length} items (${content.length} bytes)`,
          metadata: {
            // Timing
            durationMs: fetchDurationMs,
            // Counters
            pagesFetched,
            itemsCollected: allContent.length,
            contentBytes: content.length,
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
        await prisma.executionLog.create({
          data: {
            executionId,
            level: 'INFO',
            event: 'FEED_UNCHANGED',
            message: 'Feed content unchanged (hash match), skipping processing',
            metadata: { contentHash },
          },
        })

        // Mark execution as complete with no items processed
        await prisma.execution.update({
          where: { id: executionId },
          data: {
            status: 'SUCCESS',
            itemsFound: 0,
            itemsUpserted: 0,
            completedAt: new Date(),
            duration: Date.now() - new Date(job.timestamp).getTime(),
          },
        })

        await prisma.executionLog.create({
          data: {
            executionId,
            level: 'INFO',
            event: 'EXEC_DONE',
            message: 'Execution completed (feed unchanged)',
          },
        })

        return { success: true, contentLength: content.length, skipped: true }
      }

      // Hash differs or is null - continue with processing
      await prisma.executionLog.create({
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
        await prisma.executionLog.create({
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

        await prisma.executionLog.create({
          data: {
            executionId,
            level: 'INFO',
            event: 'PARSE_OK',
            message: `Parsed ${parsedItems.length} items from ${source.affiliateNetwork} feed`,
            metadata: { itemCount: parsedItems.length },
          },
        })

        // Update execution with items found
        await prisma.execution.update({
          where: { id: executionId },
          data: { itemsFound: parsedItems.length },
        })

        // Queue directly to normalizer (skip extractor for feeds)
        await normalizeQueue.add('normalize', {
          executionId,
          sourceId,
          rawItems: parsedItems,
          contentHash,
        }, {
          jobId: `normalize:${executionId}`, // Idempotent: one normalize per execution
        })

        await prisma.executionLog.create({
          data: {
            executionId,
            level: 'INFO',
            event: 'NORMALIZE_QUEUED',
            message: 'Normalize job queued (feed path)',
          },
        })
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

        await prisma.executionLog.create({
          data: {
            executionId,
            level: 'INFO',
            event: 'EXTRACT_QUEUED',
            message: 'Extract job queued (scraper path)',
          },
        })
      }

      return { success: true, contentLength: content.length }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      await prisma.executionLog.create({
        data: {
          executionId,
          level: 'ERROR',
          event: 'FETCH_FAIL',
          message: `Failed to fetch ${url}: ${errorMessage}`,
        },
      })

      // Update execution status
      await prisma.execution.update({
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
  log.info('Job completed', { jobId: job.id })
})

fetcherWorker.on('failed', (job, err) => {
  log.error('Job failed', { jobId: job?.id, error: err.message })
})
