/**
 * Script to backfill embeddings for all products
 *
 * Usage:
 *   npx tsx backfill-embeddings.ts
 *
 * Environment variables:
 *   OPENAI_API_KEY - Required for generating embeddings
 *   DATABASE_URL - PostgreSQL connection string
 *   LOG_FORMAT - Set to 'pretty' for colored output (default in dev)
 */

// Load environment variables first, before any other imports
import 'dotenv/config'

import { createLogger } from '@ironscout/logger'
import { backfillProductEmbeddings } from './src/services/ai-search/embedding-service'

const log = createLogger('api:backfill-embeddings')

async function main() {
  log.info('Starting embedding backfill')

  if (!process.env.OPENAI_API_KEY) {
    log.fatal('OPENAI_API_KEY environment variable is required')
    process.exit(1)
  }

  const startTime = Date.now()

  try {
    const result = await backfillProductEmbeddings({
      batchSize: 50,
      onProgress: (processed, total) => {
        const percent = Math.round((processed / total) * 100)
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
        log.info('Progress update', { processed, total, percent, elapsedSeconds: elapsed })
      }
    })

    const duration = ((Date.now() - startTime) / 1000).toFixed(1)

    log.info('Backfill complete', {
      processed: result.processed,
      errors: result.errors.length,
      durationSeconds: duration,
    })

    if (result.errors.length > 0) {
      log.warn('Some errors occurred during backfill', {
        errorCount: result.errors.length,
        sampleErrors: result.errors.slice(0, 10),
      })
    }

  } catch (error) {
    log.fatal('Backfill failed', {}, error)
    process.exit(1)
  }

  process.exit(0)
}

main()
