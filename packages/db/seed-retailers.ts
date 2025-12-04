import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Real ammunition retailers
const retailers = [
  { name: 'BH Armory', website: 'bharmory.com' },
  { name: 'Sentry Ammo', website: 'sentryammo.com' },
  { name: 'Ammo Joy', website: 'ammojoy.com' },
  { name: 'GunPlace.com', website: 'gunplace.com' },
  { name: 'Locked Loaded', website: 'lockedloaded.com' },
  { name: 'Armed in Michigan', website: 'armedinmichigan.com' },
  { name: 'Ammunition Direct', website: 'ammunitiondirect.com' },
  { name: 'MidwayUSA', website: 'midwayusa.com' },
  { name: 'USA Gun Store', website: 'usagunstore.com' },
  { name: 'Lucky Gunner', website: 'luckygunner.com' },
  { name: 'Outdoor Limited', website: 'outdoorlimited.com' },
  { name: 'Sportsman\'s Warehouse', website: 'sportsmans.com' },
  { name: 'Palmetto State Armory', website: 'palmettostatearmory.com' },
  { name: 'Sportsman Fulfillment', website: 'sportsmanfulfillment.com' },
  { name: 'Ammo City Supply', website: 'ammocitysupply.com' },
  { name: 'Sportsmans Outdoors Superstore', website: 'sportsmansoutdoors.com' },
  { name: 'BH Ammo', website: 'bhammo.com' },
  { name: 'The Armories', website: 'thearmories.com' },
  { name: 'Dack Outdoors', website: 'dackoutdoors.com' },
  { name: 'Shooting Surplus', website: 'shootingsurplus.com' },
  { name: 'Mile High Shooting', website: 'milehighshooting.com' },
  { name: 'Target Sports USA', website: 'targetsportsusa.com' },
  { name: 'Firearms Depot', website: 'firearmsdepot.com' },
  { name: 'Classic Firearms', website: 'classicfirearms.com' },
  { name: 'United Patriot Supply', website: 'unitedpatriotsupply.com' },
  { name: 'Tactical Surplus USA', website: 'tacticalsurplususa.com' },
  { name: 'Ammo Supply Warehouse', website: 'ammosupplywarehouse.com' },
]

async function seedRetailers() {
  console.log('🏪 Starting retailer seed...')

  try {
    let created = 0
    let updated = 0

    for (const retailer of retailers) {
      const result = await prisma.retailer.upsert({
        where: { website: retailer.website },
        update: {
          name: retailer.name,
          tier: 'STANDARD',
          updatedAt: new Date()
        },
        create: {
          name: retailer.name,
          website: retailer.website,
          tier: 'STANDARD',
          logoUrl: null
        }
      })

      // Check if it was created or updated
      const existing = await prisma.retailer.findFirst({
        where: { website: retailer.website }
      })

      if (existing) {
        if (existing.createdAt.getTime() === existing.updatedAt.getTime()) {
          created++
        } else {
          updated++
        }
      }
    }

    console.log(`✅ Processed ${retailers.length} retailers`)
    console.log(`   Created: ${created}`)
    console.log(`   Updated: ${updated}`)

    // Show all retailers
    console.log('\n📊 All Retailers:')
    const allRetailers = await prisma.retailer.findMany({
      orderBy: { name: 'asc' }
    })

    allRetailers.forEach((retailer, index) => {
      console.log(`   ${index + 1}. ${retailer.name} (${retailer.website})`)
    })

    console.log(`\n🎉 Seed completed successfully!`)
    console.log(`   Total retailers in database: ${allRetailers.length}`)

  } catch (error) {
    console.error('❌ Error seeding retailers:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

seedRetailers()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
