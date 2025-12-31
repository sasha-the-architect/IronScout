import { Worker, Job } from 'bullmq'
import { prisma } from '@ironscout/db'
import * as cheerio from 'cheerio'
import { redisConnection } from '../config/redis'
import { logger } from '../config/logger'
import { normalizeQueue, ExtractJobData } from '../config/queues'

const log = logger.extractor

// Extractor worker - parses content and extracts product data
export const extractorWorker = new Worker<ExtractJobData>(
  'extract',
  async (job: Job<ExtractJobData>) => {
    const { executionId, sourceId, content, sourceType, contentHash } = job.data
    const stageStart = Date.now()
    const contentBytes = typeof content === 'string' ? content.length : JSON.stringify(content).length

    try {
      // Get source name for logging context
      const source = await prisma.source.findUnique({
        where: { id: sourceId },
        select: { name: true, retailer: { select: { name: true } } },
      })
      const sourceName = source?.name
      const retailerName = source?.retailer?.name

      log.info('Extracting data', { executionId, sourceId, sourceName, retailerName, sourceType, contentBytes })

      await prisma.executionLog.create({
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

      switch (sourceType) {
        case 'RSS':
          rawItems = await extractFromRSS(content)
          break
        case 'JSON':
          rawItems = await extractFromJSON(content)
          break
        case 'HTML':
        case 'JS_RENDERED':
          rawItems = await extractFromHTML(content, sourceId)
          break
        default:
          throw new Error(`Unsupported source type: ${sourceType}`)
      }

      const extractDurationMs = Date.now() - stageStart

      await prisma.executionLog.create({
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
      await prisma.execution.update({
        where: { id: executionId },
        data: { itemsFound: rawItems.length },
      })

      // Queue normalization job with idempotent jobId
      await normalizeQueue.add('normalize', {
        executionId,
        sourceId,
        rawItems,
        contentHash, // Pass hash to be stored after successful write
      }, {
        jobId: `normalize:${executionId}`, // Idempotent: one normalize per execution
      })

      await prisma.executionLog.create({
        data: {
          executionId,
          level: 'INFO',
          event: 'NORMALIZE_QUEUED',
          message: 'Normalize job queued',
        },
      })

      return { success: true, itemCount: rawItems.length }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      await prisma.executionLog.create({
        data: {
          executionId,
          level: 'ERROR',
          event: 'EXTRACT_FAIL',
          message: `Extraction failed: ${errorMessage}`,
        },
      })

      await prisma.execution.update({
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
async function extractFromRSS(content: string): Promise<any[]> {
  const $ = cheerio.load(content, { xmlMode: true })
  const items: any[] = []

  $('item').each((_, element) => {
    const $item = $(element)
    items.push({
      title: $item.find('title').text().trim(),
      description: $item.find('description').text().trim(),
      link: $item.find('link').text().trim(),
      pubDate: $item.find('pubDate').text().trim(),
    })
  })

  return items
}

// Extract from JSON response
async function extractFromJSON(content: string | any): Promise<any[]> {
  try {
    // Handle case where axios already parsed the JSON
    const data = typeof content === 'string' ? JSON.parse(content) : content
    // Assume the JSON has a products array
    return Array.isArray(data) ? data : data.products || [data]
  } catch (error) {
    throw new Error('Invalid JSON content')
  }
}

// Extract from HTML - Site-specific adapters
async function extractFromHTML(content: string, sourceId: string): Promise<any[]> {
  const $ = cheerio.load(content)
  const items: any[] = []

  // This is a generic extractor - in production, you'd have site-specific adapters
  // For now, we'll look for common product patterns

  // Example: Look for product cards with common class names
  $('.product, .product-card, [data-product]').each((_, element) => {
    const $el = $(element)

    const name = $el.find('.product-name, .title, h2, h3').first().text().trim()
    const priceText = $el.find('.price, .product-price, [data-price]').first().text().trim()
    const image = $el.find('img').first().attr('src')
    const link = $el.find('a').first().attr('href')

    if (name && priceText) {
      items.push({
        name,
        priceText,
        imageUrl: image,
        url: link,
      })
    }
  })

  return items
}

extractorWorker.on('completed', (job) => {
  log.info('Job completed', { jobId: job.id })
})

extractorWorker.on('failed', (job, err) => {
  log.error('Job failed', { jobId: job?.id, error: err.message })
})
