import { Worker, Job } from 'bullmq'
import { prisma } from '@ironscout/db'
import axios from 'axios'
import { redisConnection } from '../config/redis'
import { extractQueue, normalizeQueue, FetchJobData } from '../config/queues'
import { computeContentHash } from '../utils/hash'
import { ImpactParser, AvantLinkParser, ShareASaleParser } from '../parsers'

// Fetcher worker - retrieves content from URLs
interface PaginationConfig {
  type: 'none' | 'query_param' | 'path'
  maxPages?: number
  param?: string // e.g., "page" or "offset"
  startValue?: number
  increment?: number
}

export const fetcherWorker = new Worker<FetchJobData>(
  'fetch',
  async (job: Job<FetchJobData>) => {
    const { sourceId, executionId, url, type } = job.data

    console.log(`[Fetcher] Fetching ${url}`)

    try {
      // Get source to check pagination config
      const source = await prisma.source.findUnique({
        where: { id: sourceId },
      })

      if (!source) {
        throw new Error(`Source ${sourceId} not found`)
      }

      const paginationConfig = source.paginationConfig as PaginationConfig | null

      await prisma.executionLog.create({
        data: {
          executionId,
          level: 'INFO',
          event: 'FETCH_START',
          message: `Fetching ${url}${paginationConfig?.type !== 'none' ? ' (with pagination)' : ''}`,
        },
      })

      // Collect all content from all pages
      const allContent: any[] = []
      let currentPage = paginationConfig?.startValue || 1
      const maxPages = paginationConfig?.maxPages || 100
      const increment = paginationConfig?.increment || 1
      let pagesFetched = 0

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

        console.log(`[Fetcher] Fetching page ${pageNum + 1}: ${pageUrl}`)

        let pageContent: string

        if (type === 'JS_RENDERED') {
          // For JS-rendered pages, we'd use Puppeteer
          // For now, we'll use a simple fetch
          // TODO: Implement Puppeteer for JS-rendered pages
          const response = await axios.get(pageUrl, {
            headers: {
              'User-Agent': 'IronScout.ai Price Crawler/1.0',
            },
            timeout: 30000,
          })
          // Convert to string if axios parsed JSON
          pageContent = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
        } else {
          // Standard HTTP fetch
          const response = await axios.get(pageUrl, {
            headers: {
              'User-Agent': 'IronScout.ai Price Crawler/1.0',
            },
            timeout: 30000,
          })
          // Convert to string if axios parsed JSON
          pageContent = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
        }

        pagesFetched++

        // For JSON/RSS, parse and check if empty
        if (type === 'JSON' || type === 'RSS') {
          try {
            const parsed = typeof pageContent === 'string' ? JSON.parse(pageContent) : pageContent
            const items = Array.isArray(parsed) ? parsed : parsed.products || parsed.items || []

            if (items.length === 0) {
              console.log(`[Fetcher] No more items found on page ${pageNum + 1}, stopping pagination`)
              break
            }

            allContent.push(...items)
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

      console.log(`[Fetcher] Fetched ${pagesFetched} page(s), total items: ${allContent.length}`)

      // Serialize content based on type
      let content: string
      if (type === 'JSON' && allContent.length > 0 && typeof allContent[0] !== 'string') {
        content = JSON.stringify(allContent)
      } else if (type === 'HTML') {
        content = allContent.join('\n')
      } else {
        content = JSON.stringify(allContent)
      }

      await prisma.executionLog.create({
        data: {
          executionId,
          level: 'INFO',
          event: 'FETCH_OK',
          message: `Successfully fetched ${pagesFetched} page(s) (${content.length} bytes total)`,
          metadata: {
            contentLength: content.length,
            pagesFetched,
            itemsCollected: allContent.length
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
        let parser
        switch (source.affiliateNetwork) {
          case 'IMPACT':
            parser = new ImpactParser()
            break
          case 'AVANTLINK':
            parser = new AvantLinkParser()
            break
          case 'SHAREASALE':
            parser = new ShareASaleParser()
            break
          default:
            throw new Error(`Unsupported affiliate network: ${source.affiliateNetwork}`)
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
  console.log(`[Fetcher] Job ${job.id} completed`)
})

fetcherWorker.on('failed', (job, err) => {
  console.error(`[Fetcher] Job ${job?.id} failed:`, err.message)
})
