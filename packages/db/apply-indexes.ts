import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const prisma = new PrismaClient()

async function applyIndexes() {
  console.log('🔧 Starting index creation...')
  console.log('⏳ This will take 10-30 minutes (uses CONCURRENTLY for zero downtime)\n')

  try {
    // Enable pg_trgm extension first
    console.log('📦 Enabling pg_trgm extension...')
    try {
      await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS pg_trgm`
      console.log('   ✅ Extension enabled\n')
    } catch (error: any) {
      if (error.message?.includes('already exists')) {
        console.log('   ⏭️  Extension already exists\n')
      } else {
        console.error('   ⚠️  Warning: Could not enable pg_trgm extension:', error.message)
        console.log('   ℹ️  GIN text search indexes will be skipped\n')
      }
    }

    // Read the SQL file
    const sqlFile = path.join(__dirname, 'migrations', 'add-performance-indexes.sql')
    const sql = fs.readFileSync(sqlFile, 'utf-8')

    // Split into individual commands (filter out comments and empty lines)
    const commands = sql
      .split(';')
      .map(cmd => cmd.trim())
      .filter(cmd => {
        return cmd.length > 0 &&
               !cmd.startsWith('--') &&
               !cmd.startsWith('/*') &&
               cmd !== ''
      })

    console.log(`Found ${commands.length} commands to execute\n`)

    let successCount = 0
    let skipCount = 0
    let errorCount = 0

    for (let i = 0; i < commands.length; i++) {
      const command = commands[i]

      // Skip comment blocks
      if (command.includes('/*') || command.includes('*/')) {
        continue
      }

      // Skip ANALYZE commands for now (run at end)
      if (command.toUpperCase().startsWith('ANALYZE')) {
        continue
      }

      // Extract index name for logging
      const indexNameMatch = command.match(/idx_\w+/)
      const indexName = indexNameMatch ? indexNameMatch[0] : 'unknown'

      try {
        console.log(`[${i + 1}/${commands.length}] Creating ${indexName}...`)

        await prisma.$executeRawUnsafe(command)
        console.log(`   ✅ Success`)
        successCount++

      } catch (error: any) {
        // Check if index already exists
        if (error.message?.includes('already exists')) {
          console.log(`   ⏭️  Already exists, skipping`)
          skipCount++
        } else {
          // Show first 100 chars of error for debugging
          const errorMsg = error.message?.substring(0, 100) || 'Unknown error'
          console.error(`   ❌ Error: ${errorMsg}`)
          errorCount++

          // Log full command that failed for debugging (first 200 chars)
          if (command.length > 0) {
            console.error(`   Command: ${command.substring(0, 200)}...`)
          }
        }
      }
    }

    console.log('\n📊 Running ANALYZE on tables...')
    await prisma.$executeRaw`ANALYZE products`
    await prisma.$executeRaw`ANALYZE prices`
    await prisma.$executeRaw`ANALYZE retailers`
    await prisma.$executeRaw`ANALYZE alerts`
    await prisma.$executeRaw`ANALYZE users`
    await prisma.$executeRaw`ANALYZE sources`
    await prisma.$executeRaw`ANALYZE executions`
    await prisma.$executeRaw`ANALYZE execution_logs`
    await prisma.$executeRaw`ANALYZE subscriptions`
    await prisma.$executeRaw`ANALYZE advertisements`

    console.log('\n✅ Index creation completed!')
    console.log(`\n📈 Summary:`)
    console.log(`   Success: ${successCount}`)
    console.log(`   Skipped (already exists): ${skipCount}`)
    console.log(`   Errors: ${errorCount}`)

    console.log('\n🎉 Done! Run product searches to see improved performance.')
    console.log('\n💡 To view index statistics, connect to your database and run:')
    console.log('   SELECT tablename, indexname, pg_size_pretty(pg_relation_size(indexrelid))')
    console.log('   FROM pg_stat_user_indexes WHERE indexname LIKE \'idx_%\';')

  } catch (error) {
    console.error('❌ Error applying indexes:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

applyIndexes()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
