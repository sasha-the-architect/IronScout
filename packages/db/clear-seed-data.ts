import { PrismaClient } from '@prisma/client'
import * as readline from 'readline'

const prisma = new PrismaClient()

// Create readline interface for user confirmation
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

function question(query: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(query, resolve)
  })
}

async function clearSeedData() {
  console.log('🗑️  Database Cleanup Script')
  console.log('=' .repeat(50))
  console.log('\nThis will delete the following data:')
  console.log('  - All price history records')
  console.log('  - All products')
  console.log('  - All retailers')
  console.log('  - All advertisements')
  console.log('\n⚠️  WARNING: This action cannot be undone!')
  console.log('=' .repeat(50))

  try {
    // Get current counts
    const counts = await Promise.all([
      prisma.price.count(),
      prisma.product.count(),
      prisma.retailer.count(),
      prisma.advertisement.count(),
    ])

    console.log('\n📊 Current Database Stats:')
    console.log(`   Prices: ${counts[0]}`)
    console.log(`   Products: ${counts[1]}`)
    console.log(`   Retailers: ${counts[2]}`)
    console.log(`   Advertisements: ${counts[3]}`)

    const answer = await question('\nAre you sure you want to delete all this data? (yes/no): ')

    if (answer.toLowerCase() !== 'yes') {
      console.log('\n❌ Cleanup cancelled.')
      return
    }

    console.log('\n🗑️  Starting cleanup...\n')

    // Delete in order to respect foreign key constraints
    console.log('   Deleting prices...')
    const pricesDeleted = await prisma.price.deleteMany({})
    console.log(`   ✅ Deleted ${pricesDeleted.count} prices`)

    console.log('   Deleting advertisements...')
    const adsDeleted = await prisma.advertisement.deleteMany({})
    console.log(`   ✅ Deleted ${adsDeleted.count} advertisements`)

    console.log('   Deleting products...')
    const productsDeleted = await prisma.product.deleteMany({})
    console.log(`   ✅ Deleted ${productsDeleted.count} products`)

    console.log('   Deleting retailers...')
    const retailersDeleted = await prisma.retailer.deleteMany({})
    console.log(`   ✅ Deleted ${retailersDeleted.count} retailers`)

    console.log('\n🎉 Database cleanup completed successfully!')
    console.log('\n📊 Final Database Stats:')
    const finalCounts = await Promise.all([
      prisma.price.count(),
      prisma.product.count(),
      prisma.retailer.count(),
      prisma.advertisement.count(),
    ])
    console.log(`   Prices: ${finalCounts[0]}`)
    console.log(`   Products: ${finalCounts[1]}`)
    console.log(`   Retailers: ${finalCounts[2]}`)
    console.log(`   Advertisements: ${finalCounts[3]}`)

  } catch (error) {
    console.error('❌ Error during cleanup:', error)
    throw error
  } finally {
    rl.close()
    await prisma.$disconnect()
  }
}

clearSeedData()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
