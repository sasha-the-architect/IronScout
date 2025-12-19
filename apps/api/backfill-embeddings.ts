/**
 * Script to backfill embeddings for all products
 *
 * Usage:
 *   npx tsx backfill-embeddings.ts
 *
 * Environment variables:
 *   OPENAI_API_KEY - Required for generating embeddings
 *   DATABASE_URL - PostgreSQL connection string
 */

// Load environment variables first, before any other imports
import 'dotenv/config'

import { backfillProductEmbeddings } from './src/services/ai-search/embedding-service'

async function main() {
  console.log('🚀 Starting embedding backfill...')
  console.log('')
  
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY environment variable is required')
    process.exit(1)
  }
  
  const startTime = Date.now()
  
  try {
    const result = await backfillProductEmbeddings({
      batchSize: 50,
      onProgress: (processed, total) => {
        const percent = Math.round((processed / total) * 100)
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
        console.log(`📊 Progress: ${processed}/${total} (${percent}%) - ${elapsed}s elapsed`)
      }
    })
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    
    console.log('')
    console.log('✅ Backfill complete!')
    console.log(`   Processed: ${result.processed} products`)
    console.log(`   Errors: ${result.errors.length}`)
    console.log(`   Duration: ${duration}s`)
    
    if (result.errors.length > 0) {
      console.log('')
      console.log('⚠️ Errors:')
      result.errors.slice(0, 10).forEach(e => console.log(`   - ${e}`))
      if (result.errors.length > 10) {
        console.log(`   ... and ${result.errors.length - 10} more`)
      }
    }
    
  } catch (error) {
    console.error('❌ Backfill failed:', error)
    process.exit(1)
  }
  
  process.exit(0)
}

main()
