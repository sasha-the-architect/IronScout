/**
 * Migration script to update sources to crawl all calibers
 *
 * Usage:
 *   npx tsx update-sources-all-calibers.ts
 *
 * Environment variables:
 *   DATABASE_URL - PostgreSQL connection string
 *   LOG_FORMAT - Set to 'pretty' for colored output (default in dev)
 */

// Load environment variables first, before any other imports
import 'dotenv/config'

import { prisma } from '@ironscout/db'
import { createLogger } from '@ironscout/logger'

const log = createLogger('harvester:update-sources')

async function updateSources() {
  log.info('Starting source migration to all calibers')

  // Check current sources
  const currentSources = await prisma.source.findMany({
    select: { id: true, name: true, url: true, type: true, enabled: true }
  })

  log.info('Current sources', {
    count: currentSources.length,
    sources: currentSources.map(s => ({ name: s.name, url: s.url })),
  })

  // Delete old 9mm-specific sources
  const deleted = await prisma.source.deleteMany({
    where: {
      name: {
        in: ['Lucky Gunner - 9mm', 'Brownells - 9mm', 'Natchez - 9mm']
      }
    }
  })

  log.info('Deleted old caliber-specific sources', { deletedCount: deleted.count })

  // Create new sources for all ammunition (not caliber-specific)
  const newSources = [
    {
      name: 'Lucky Gunner - All Ammo',
      url: 'https://www.luckygunner.com/handgun/ammo',
      type: 'JS_RENDERED' as const,
      enabled: true,
      interval: 3600000 // 1 hour
    },
    {
      name: 'Brownells - All Ammo',
      url: 'https://www.brownells.com/ammunition/index.htm',
      type: 'JS_RENDERED' as const,
      enabled: true,
      interval: 3600000
    },
    {
      name: 'Natchez - All Ammo',
      url: 'https://www.natchezss.com/ammunition.html',
      type: 'JS_RENDERED' as const,
      enabled: true,
      interval: 3600000
    }
  ]

  log.info('Creating new all-caliber sources')
  for (const source of newSources) {
    const created = await prisma.source.create({
      data: source
    })
    log.info('Created source', { name: created.name, url: created.url })
  }

  // Show final sources
  const finalSources = await prisma.source.findMany({
    select: { name: true, url: true, type: true, enabled: true }
  })

  log.info('Migration complete', {
    totalSources: finalSources.length,
    sources: finalSources.map(s => ({ name: s.name, type: s.type })),
  })

  await prisma.$disconnect()
}

updateSources().catch((error) => {
  log.fatal('Migration failed', {}, error)
  process.exit(1)
})
