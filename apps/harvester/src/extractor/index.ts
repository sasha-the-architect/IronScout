import { Worker, Job } from 'bullmq'
import { prisma } from '@ironscout/db'
import * as cheerio from 'cheerio'
import { redisConnection } from '../config/redis'
import { logger } from '../config/logger'
import { normalizeQueue, ExtractJobData } from '../config/queues'

const log = logger.extractor

// ============================================================================
// PAYLOAD LIMITS - Prevent Redis/BullMQ overflow
// ============================================================================

/** Maximum items per normalize job to prevent Redis payload overflow */
const NORMALIZE_CHUNK_SIZE = 1000

/** Maximum payload size in bytes for a single BullMQ job (5MB safety margin) */
const MAX_JOB_PAYLOAD_BYTES = 5 * 1024 * 1024

/**
 * Estimate payload size in bytes (accurate for UTF-8)
 */
function estimatePayloadBytes(items: unknown[]): number {
  // Use Buffer.byteLength for accurate UTF-8 byte count
  const sample = JSON.stringify(items.slice(0, 10))
  const avgItemBytes = Buffer.byteLength(sample, 'utf8') / Math.min(items.length, 10)
  return Math.ceil(avgItemBytes * items.length)
}

// Extractor worker - parses content and extracts product data
export const extractorWorker = new Worker<ExtractJobData>(
  'extract',
  async (job: Job<ExtractJobData>) => {
    const { executionId, sourceId, content, sourceType, contentHash } = job.data
    const stageStart = Date.now()
    // Use Buffer.byteLength for accurate UTF-8 byte counting
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content)
    const contentBytes = Buffer.byteLength(contentStr, 'utf8')

    // Create run-scoped logger with correlation IDs
    const runLog = log.child({ executionId, sourceId, jobId: job.id })

    runLog.debug('EXTRACT_JOB_RECEIVED', {
      sourceType,
      contentBytes,
      contentHashPrefix: contentHash?.slice(0, 16),
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts?.attempts ?? 3,
      contentIsString: typeof content === 'string',
      timestamp: new Date().toISOString(),
    })

    try {
      // Get source name for logging context
      runLog.debug('EXTRACT_LOADING_SOURCE', { phase: 'init' })
      const sourceLoadStart = Date.now()
      const source = await prisma.sources.findUnique({
        where: { id: sourceId },
        select: { name: true, retailers: { select: { name: true } } },
      })
      const sourceName = source?.name
      const retailerName = source?.retailers?.name
      const sourceLoadDurationMs = Date.now() - sourceLoadStart

      runLog.debug('EXTRACT_SOURCE_LOADED', {
        phase: 'init',
        sourceName,
        retailerName,
        sourceLoadDurationMs,
        sourceExists: !!source,
      })

      runLog.info('EXTRACT_START', {
        phase: 'extract',
        sourceName,
        retailerName,
        sourceType,
        contentBytes,
        extractionStrategy: sourceType === 'RSS' ? 'xml_parser' : sourceType === 'JSON' ? 'json_parser' : 'html_scraper',
      })

      await prisma.execution_logs.create({
        data: {
          executionId,
          level: 'INFO',
          event: 'EXTRACT_START',
          message: `Starting extraction for ${sourceType} content`,
          metadata: {
            sourceId,
            sourceType,
            contentBytes,
          },
        },
      })

      let rawItems: any[] = []

      const extractionStart = Date.now()
      runLog.debug('EXTRACT_STRATEGY_SELECTED', {
        phase: 'extract',
        sourceType,
        strategy: sourceType === 'RSS' ? 'xml_rss_items' : sourceType === 'JSON' ? 'json_array' : 'html_selectors',
      })

      switch (sourceType) {
        case 'RSS':
          rawItems = await extractFromRSS(content, runLog)
          break
        case 'JSON':
          rawItems = await extractFromJSON(content, runLog)
          break
        case 'HTML':
        case 'JS_RENDERED':
          rawItems = await extractFromHTML(content, sourceId, runLog)
          break
        default:
          runLog.error('EXTRACT_UNSUPPORTED_TYPE', {
            phase: 'extract',
            sourceType,
            reason: 'No extraction handler for this source type',
          })
          throw new Error(`Unsupported source type: ${sourceType}`)
      }

      const extractionDurationMs = Date.now() - extractionStart
      runLog.debug('EXTRACT_ITEMS_EXTRACTED', {
        phase: 'extract',
        itemCount: rawItems.length,
        extractionDurationMs,
        avgMsPerItem: rawItems.length > 0 ? (extractionDurationMs / rawItems.length).toFixed(2) : null,
      })

      const extractDurationMs = Date.now() - stageStart

      await prisma.execution_logs.create({
        data: {
          executionId,
          level: 'INFO',
          event: 'EXTRACT_OK',
          message: `Extracted ${rawItems.length} items from ${sourceType}`,
          metadata: {
            // Timing
            durationMs: extractDurationMs,
            // Counters
            itemsExtracted: rawItems.length,
            contentBytes,
            // Context
            sourceId,
            sourceType,
          },
        },
      })

      // Update execution with items found
      await prisma.executions.update({
        where: { id: executionId },
        data: { itemsFound: rawItems.length },
      })

      // Check payload size and chunk if needed to prevent Redis overflow
      const estimatedBytes = estimatePayloadBytes(rawItems)
      const needsChunking = rawItems.length > NORMALIZE_CHUNK_SIZE || estimatedBytes > MAX_JOB_PAYLOAD_BYTES

      if (needsChunking) {
        // Chunk into smaller jobs
        const chunkCount = Math.ceil(rawItems.length / NORMALIZE_CHUNK_SIZE)
        runLog.info('EXTRACT_CHUNKING_NORMALIZE', {
          phase: 'routing',
          totalItems: rawItems.length,
          estimatedBytes,
          chunkCount,
          chunkSize: NORMALIZE_CHUNK_SIZE,
          reason: rawItems.length > NORMALIZE_CHUNK_SIZE
            ? 'item_count_exceeds_chunk_size'
            : 'payload_size_exceeds_limit',
          maxJobPayloadBytes: MAX_JOB_PAYLOAD_BYTES,
        })

        for (let i = 0; i < rawItems.length; i += NORMALIZE_CHUNK_SIZE) {
          const chunkIndex = Math.floor(i / NORMALIZE_CHUNK_SIZE)
          const chunk = rawItems.slice(i, i + NORMALIZE_CHUNK_SIZE)
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
            message: `Queued ${chunkCount} normalize chunks for ${rawItems.length} items`,
            metadata: { chunkCount, totalItems: rawItems.length, estimatedBytes },
          },
        })
      } else {
        // Single job for small payloads
        await normalizeQueue.add('normalize', {
          executionId,
          sourceId,
          rawItems,
          contentHash, // Pass hash to be stored after successful write
        }, {
          jobId: `normalize--${executionId}`, // Idempotent: one normalize per execution
        })

        await prisma.execution_logs.create({
          data: {
            executionId,
            level: 'INFO',
            event: 'NORMALIZE_QUEUED',
            message: 'Normalize job queued',
          },
        })
      }

      return { success: true, itemCount: rawItems.length }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      await prisma.execution_logs.create({
        data: {
          executionId,
          level: 'ERROR',
          event: 'EXTRACT_FAIL',
          message: `Extraction failed: ${errorMessage}`,
        },
      })

      await prisma.executions.update({
        where: { id: executionId },
        data: {
          status: 'FAILED',
          errorMessage: `Extract failed: ${errorMessage}`,
          completedAt: new Date(),
        },
      })

      throw error
    }
  },
  {
    connection: redisConnection,
    concurrency: 3,
  }
)

// Extract from RSS feed
async function extractFromRSS(content: string, runLog: typeof log): Promise<any[]> {
  const parseStart = Date.now()
  const $ = cheerio.load(content, { xmlMode: true })
  const parseDurationMs = Date.now() - parseStart

  runLog.debug('EXTRACT_RSS_PARSED', {
    phase: 'extract',
    format: 'rss',
    parseDurationMs,
    contentLength: content.length,
  })

  const items: any[] = []
  let itemsWithTitle = 0
  let itemsWithLink = 0

  $('item').each((_, element) => {
    const $item = $(element)
    const title = $item.find('title').text().trim()
    const link = $item.find('link').text().trim()

    if (title) itemsWithTitle++
    if (link) itemsWithLink++

    items.push({
      title,
      description: $item.find('description').text().trim(),
      link,
      pubDate: $item.find('pubDate').text().trim(),
    })
  })

  runLog.debug('EXTRACT_RSS_COMPLETE', {
    phase: 'extract',
    format: 'rss',
    totalItems: items.length,
    itemsWithTitle,
    itemsWithLink,
    extractionQuality: items.length > 0 ? ((itemsWithTitle / items.length) * 100).toFixed(1) + '%' : 'N/A',
  })

  return items
}

// Extract from JSON response
async function extractFromJSON(content: string | any, runLog: typeof log): Promise<any[]> {
  const parseStart = Date.now()

  try {
    // Handle case where axios already parsed the JSON
    const needsParsing = typeof content === 'string'
    const data = needsParsing ? JSON.parse(content) : content
    const parseDurationMs = Date.now() - parseStart

    runLog.debug('EXTRACT_JSON_PARSED', {
      phase: 'extract',
      format: 'json',
      parseDurationMs,
      needsParsing,
      contentLength: typeof content === 'string' ? content.length : JSON.stringify(content).length,
    })

    // Determine structure
    const isArray = Array.isArray(data)
    const hasProductsKey = !isArray && data.products !== undefined
    const extractionPath = isArray ? 'root_array' : hasProductsKey ? 'products_key' : 'single_object'

    const result = isArray ? data : data.products || [data]

    runLog.debug('EXTRACT_JSON_COMPLETE', {
      phase: 'extract',
      format: 'json',
      extractionPath,
      totalItems: result.length,
      dataType: typeof data,
      topLevelKeys: !isArray ? Object.keys(data).slice(0, 10) : null,
    })

    return result
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    runLog.error('EXTRACT_JSON_FAILED', {
      phase: 'extract',
      format: 'json',
      reason: 'JSON parsing failed',
      errorMessage: errorMsg,
      contentPreview: typeof content === 'string' ? content.slice(0, 100) : null,
    })
    throw new Error('Invalid JSON content')
  }
}

// Extract from HTML - Site-specific adapters
async function extractFromHTML(content: string, sourceId: string, runLog: typeof log): Promise<any[]> {
  const parseStart = Date.now()
  const $ = cheerio.load(content)
  const parseDurationMs = Date.now() - parseStart

  runLog.debug('EXTRACT_HTML_PARSED', {
    phase: 'extract',
    format: 'html',
    parseDurationMs,
    contentLength: content.length,
    sourceId,
  })

  const items: any[] = []

  // This is a generic extractor - in production, you'd have site-specific adapters
  // For now, we'll look for common product patterns

  // Track selector effectiveness
  const selectorStats = {
    '.product': 0,
    '.product-card': 0,
    '[data-product]': 0,
  }

  // Example: Look for product cards with common class names
  const selectors = ['.product', '.product-card', '[data-product]']

  for (const selector of selectors) {
    const count = $(selector).length
    selectorStats[selector as keyof typeof selectorStats] = count
  }

  runLog.debug('EXTRACT_HTML_SELECTORS', {
    phase: 'extract',
    format: 'html',
    selectorStats,
    totalElements: Object.values(selectorStats).reduce((a, b) => a + b, 0),
  })

  let itemsWithName = 0
  let itemsWithPrice = 0
  let itemsWithImage = 0
  let itemsWithLink = 0

  $('.product, .product-card, [data-product]').each((_, element) => {
    const $el = $(element)

    const name = $el.find('.product-name, .title, h2, h3').first().text().trim()
    const priceText = $el.find('.price, .product-price, [data-price]').first().text().trim()
    const image = $el.find('img').first().attr('src')
    const link = $el.find('a').first().attr('href')

    if (name) itemsWithName++
    if (priceText) itemsWithPrice++
    if (image) itemsWithImage++
    if (link) itemsWithLink++

    if (name && priceText) {
      items.push({
        name,
        priceText,
        imageUrl: image,
        url: link,
      })
    }
  })

  runLog.debug('EXTRACT_HTML_COMPLETE', {
    phase: 'extract',
    format: 'html',
    totalItems: items.length,
    itemsWithName,
    itemsWithPrice,
    itemsWithImage,
    itemsWithLink,
    rejectedItems: itemsWithName - items.length,
    rejectionReason: itemsWithName > items.length ? 'missing_required_fields' : null,
  })

  return items
}

extractorWorker.on('completed', (job) => {
  log.info('EXTRACT_JOB_COMPLETED', {
    jobId: job.id,
    executionId: job.data?.executionId,
    sourceId: job.data?.sourceId,
    returnValue: job.returnvalue,
    attemptsMade: job.attemptsMade,
    processingDurationMs: job.processedOn ? Date.now() - job.processedOn : null,
    totalDurationMs: job.finishedOn && job.timestamp ? job.finishedOn - job.timestamp : null,
  })
})

extractorWorker.on('failed', (job, err) => {
  log.error('EXTRACT_JOB_FAILED', {
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
