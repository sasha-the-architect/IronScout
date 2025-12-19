// Load environment variables first, before any other imports
import 'dotenv/config'

import { prisma } from '@ironscout/db'

async function updateSources() {
  console.log('Updating sources to crawl ALL calibers...\\n')

  // Check current sources
  const currentSources = await prisma.source.findMany({
    select: { id: true, name: true, url: true, type: true, enabled: true }
  })

  console.log('Current sources:')
  currentSources.forEach(s => {
    console.log(`  - ${s.name}: ${s.url}`)
  })

  // Delete old 9mm-specific sources
  await prisma.source.deleteMany({
    where: {
      name: {
        in: ['Lucky Gunner - 9mm', 'Brownells - 9mm', 'Natchez - 9mm']
      }
    }
  })

  console.log('\\nDeleted old 9mm-specific sources')

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

  console.log('\\nCreating new sources for all calibers...')
  for (const source of newSources) {
    const created = await prisma.source.create({
      data: source
    })
    console.log(`  ✅ Created: ${created.name}`)
  }

  // Show final sources
  const finalSources = await prisma.source.findMany({
    select: { name: true, url: true, type: true, enabled: true }
  })

  console.log('\\nFinal sources:')
  finalSources.forEach(s => {
    console.log(`  - ${s.name}: ${s.url} (${s.type})`)
  })

  await prisma.$disconnect()
}

updateSources().catch(console.error)
