import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding test crawl source...')

  // Create a test RSS feed source
  const source = await prisma.source.upsert({
    where: {
      url: 'https://fakestoreapi.com/products',
    },
    create: {
      name: 'Fake Store API (Test)',
      url: 'https://fakestoreapi.com/products',
      type: 'JSON',
      enabled: true,
      interval: 3600, // 1 hour
    },
    update: {
      enabled: true,
    },
  })

  console.log(`✓ Created test source: ${source.name}`)
  console.log(`  URL: ${source.url}`)
  console.log(`  Type: ${source.type}`)
  console.log(`  Enabled: ${source.enabled}`)
  console.log('')
  console.log('Test source ready! You can now:')
  console.log('1. Start harvester workers: cd apps/harvester && pnpm worker')
  console.log('2. Start API server: cd apps/api && pnpm dev')
  console.log('3. Trigger crawl via admin UI or: cd apps/harvester && pnpm dev run')
}

main()
  .catch((e) => {
    console.error('Error seeding test source:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
