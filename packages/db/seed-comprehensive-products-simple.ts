import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Helper to generate random price in range
function randomPrice(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100
}

// Helper to pick random items from array
function randomItems<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => 0.5 - Math.random())
  return shuffled.slice(0, count)
}

// Product data by category
const productData = [
  // AMMUNITION - Expanded with multiple brands and variants
  ...Array.from({ length: 50 }, (_, i) => ({
    name: `Federal Premium 9mm 115gr FMJ ${i % 5 === 0 ? 'Training' : 'Range'} Pack`,
    category: 'Ammunition',
    brand: ['Federal', 'Winchester', 'Hornady', 'Speer', 'Blazer'][i % 5],
    description: '9mm ammunition for range and training use.',
    basePrice: randomPrice(15, 35)
  })),
  ...Array.from({ length: 40 }, (_, i) => ({
    name: `${['Federal', 'Winchester', 'Hornady', 'IMI'][i % 4]} 5.56 NATO ${[55, 62, 77][i % 3]}gr ${['FMJ', 'HP', 'BTHP'][i % 3]}`,
    category: 'Ammunition',
    brand: ['Federal', 'Winchester', 'Hornady', 'IMI'][i % 4],
    description: '5.56 NATO ammunition for AR-15 platforms.',
    basePrice: randomPrice(18, 45)
  })),
  ...Array.from({ length: 30 }, (_, i) => ({
    name: `${['Federal', 'Winchester', 'Hornady'][i % 3]} .308 Win ${[150, 168, 175][i % 3]}gr ${['FMJ', 'BTHP', 'ELD'][i % 3]}`,
    category: 'Ammunition',
    brand: ['Federal', 'Winchester', 'Hornady'][i % 3],
    description: '.308 Winchester ammunition for precision shooting.',
    basePrice: randomPrice(25, 60)
  })),
  ...Array.from({ length: 40 }, (_, i) => ({
    name: `${['CCI', 'Federal', 'Winchester', 'Aguila'][i % 4]} .22 LR ${[36, 40][i % 2]}gr ${['LRN', 'CPRN', 'HP'][i % 3]}`,
    category: 'Ammunition',
    brand: ['CCI', 'Federal', 'Winchester', 'Aguila'][i % 4],
    description: '.22 LR ammunition for training and plinking.',
    basePrice: randomPrice(8, 20)
  })),
  ...Array.from({ length: 30 }, (_, i) => ({
    name: `${['Federal', 'Winchester', 'Hornady'][i % 3]} .45 ACP ${[185, 230][i % 2]}gr ${['FMJ', 'JHP'][i % 2]}`,
    category: 'Ammunition',
    brand: ['Federal', 'Winchester', 'Hornady'][i % 3],
    description: '.45 ACP ammunition for 1911 and modern pistols.',
    basePrice: randomPrice(28, 55)
  })),
  ...Array.from({ length: 25 }, (_, i) => ({
    name: `${['Federal', 'Winchester', 'Remington'][i % 3]} 12 Gauge ${['00 Buck', 'Birdshot #7.5', 'Slug'][i % 3]} 2-3/4"`,
    category: 'Ammunition',
    brand: ['Federal', 'Winchester', 'Remington'][i % 3],
    description: '12 gauge shotgun ammunition.',
    basePrice: randomPrice(10, 30)
  })),

  // OPTICS - Rifle Scopes, Red Dots, Magnifiers
  ...Array.from({ length: 30 }, (_, i) => ({
    name: `${['Vortex', 'Leupold', 'Bushnell'][i % 3]} ${['Diamondback', 'Viper', 'Strike Eagle'][i % 3]} ${['3-9x40', '4-12x44', '1-6x24'][i % 3]} Rifle Scope`,
    category: 'Optics',
    brand: ['Vortex', 'Leupold', 'Bushnell'][i % 3],
    description: 'Premium rifle scope with clear glass and durable construction.',
    basePrice: randomPrice(200, 800)
  })),
  ...Array.from({ length: 25 }, (_, i) => ({
    name: `${['Holosun', 'Sig Sauer', 'Vortex', 'Aimpoint', 'Trijicon'][i % 5]} ${['HS503', 'Romeo5', 'Sparc', 'PRO', 'MRO'][i % 5]} Red Dot Sight`,
    category: 'Optics',
    brand: ['Holosun', 'Sig Sauer', 'Vortex', 'Aimpoint', 'Trijicon'][i % 5],
    description: 'Red dot sight for fast target acquisition.',
    basePrice: randomPrice(150, 600)
  })),
  ...Array.from({ length: 15 }, (_, i) => ({
    name: `${['Vortex', 'Holosun', 'Sig Sauer'][i % 3]} ${['Micro 3X', 'HM3X', 'Juliet3'][i % 3]} Magnifier`,
    category: 'Optics',
    brand: ['Vortex', 'Holosun', 'Sig Sauer'][i % 3],
    description: 'Flip-to-side magnifier for red dot sights.',
    basePrice: randomPrice(150, 300)
  })),

  // MAGAZINES
  ...Array.from({ length: 40 }, (_, i) => ({
    name: `${['Magpul', 'Lancer', 'HexMag'][i % 3]} AR-15 ${[10, 20, 30, 40][i % 4]}-Round PMAG Magazine`,
    category: 'Magazines',
    brand: ['Magpul', 'Lancer', 'HexMag'][i % 3],
    description: 'Reliable AR-15 magazine with anti-tilt follower.',
    basePrice: randomPrice(12, 25)
  })),
  ...Array.from({ length: 30 }, (_, i) => ({
    name: `${['Glock OEM', 'Magpul', 'ETS'][i % 3]} Glock ${['17', '19', '43'][i % 3]} ${[10, 15, 17, 33][i % 4]}-Round Magazine`,
    category: 'Magazines',
    brand: ['Glock OEM', 'Magpul', 'ETS'][i % 3],
    description: 'Factory-quality Glock magazine.',
    basePrice: randomPrice(18, 35)
  })),

  // GRIPS & STOCKS
  ...Array.from({ length: 20 }, (_, i) => ({
    name: `${['Magpul', 'BCM', 'Hogue'][i % 3]} ${['MOE', 'K2', 'Gunfighter Mod 0'][i % 3]} AR-15 Grip`,
    category: 'Grips & Stocks',
    brand: ['Magpul', 'BCM', 'Hogue'][i % 3],
    description: 'Ergonomic pistol grip for AR-15 platform.',
    basePrice: randomPrice(15, 28)
  })),
  ...Array.from({ length: 20 }, (_, i) => ({
    name: `${['Magpul', 'BCM', 'B5 Systems'][i % 3]} ${['CTR', 'MOE', 'Gunfighter'][i % 3]} Collapsible Stock`,
    category: 'Grips & Stocks',
    brand: ['Magpul', 'BCM', 'B5 Systems'][i % 3],
    description: 'Adjustable carbine stock for AR-15.',
    basePrice: randomPrice(50, 90)
  })),

  // RAILS & HANDGUARDS
  ...Array.from({ length: 25 }, (_, i) => ({
    name: `${['Midwest Industries', 'BCM', 'Aero Precision'][i % 3]} ${[7, 9, 10, 12, 15][i % 5]}" M-LOK Handguard`,
    category: 'Rails & Handguards',
    brand: ['Midwest Industries', 'BCM', 'Aero Precision'][i % 3],
    description: 'Free-float M-LOK handguard for AR-15.',
    basePrice: randomPrice(150, 280)
  })),

  // HOLSTERS
  ...Array.from({ length: 30 }, (_, i) => ({
    name: `${['Safariland', 'Blackhawk', 'Blade-Tech', 'Alien Gear'][i % 4]} ${['ALS', 'SERPA', 'Classic', 'Cloak Tuck'][i % 4]} Holster - ${['Glock 17/19', 'Sig P320', 'M&P 9'][i % 3]}`,
    category: 'Holsters',
    brand: ['Safariland', 'Blackhawk', 'Blade-Tech', 'Alien Gear'][i % 4],
    description: 'Secure retention holster for concealed or duty carry.',
    basePrice: randomPrice(40, 120)
  })),

  // MAGAZINE POUCHES
  ...Array.from({ length: 20 }, (_, i) => ({
    name: `${['Esstac', 'Blue Force Gear', 'HSGI'][i % 3]} ${['Kywi', 'Ten-Speed', 'Taco'][i % 3]} ${['Rifle', 'Pistol'][i % 2]} Magazine Pouch`,
    category: 'Magazine Pouches',
    brand: ['Esstac', 'Blue Force Gear', 'HSGI'][i % 3],
    description: 'Quick-access magazine pouch with retention.',
    basePrice: randomPrice(20, 45)
  })),

  // PLATE CARRIERS & BELTS
  ...Array.from({ length: 15 }, (_, i) => ({
    name: `${['Crye Precision', 'Ferro Concepts', '5.11 Tactical'][i % 3]} ${['JPC 2.0', 'Slickster', 'TacTec'][i % 3]} Plate Carrier`,
    category: 'Plate Carriers',
    brand: ['Crye Precision', 'Ferro Concepts', '5.11 Tactical'][i % 3],
    description: 'Modular plate carrier for tactical operations.',
    basePrice: randomPrice(180, 450)
  })),
  ...Array.from({ length: 15 }, (_, i) => ({
    name: `${['Blue Alpha Gear', 'Ronin Tactics', '5.11 Tactical'][i % 3]} ${['Low Profile EDC', 'Task Force', 'Maverick'][i % 3]} Belt`,
    category: 'Belts',
    brand: ['Blue Alpha Gear', 'Ronin Tactics', '5.11 Tactical'][i % 3],
    description: 'Tactical duty belt with reinforced construction.',
    basePrice: randomPrice(60, 130)
  })),

  // HEARING & EYE PROTECTION
  ...Array.from({ length: 20 }, (_, i) => ({
    name: `${['Howard Leight', 'Walker', '3M Peltor', 'Pro Ears'][i % 4]} ${['Impact Sport', 'Razor', 'Sport Tactical 100', 'Ultra Pro'][i % 4]} Electronic Hearing Protection`,
    category: 'Hearing Protection',
    brand: ['Howard Leight', 'Walker', '3M Peltor', 'Pro Ears'][i % 4],
    description: 'Electronic hearing protection with sound amplification.',
    basePrice: randomPrice(45, 250)
  })),
  ...Array.from({ length: 20 }, (_, i) => ({
    name: `${['Oakley', 'Wiley X', 'ESS', '5.11 Tactical'][i % 4]} ${['M Frame', 'Saber', 'Crossbow', 'Burner'][i % 4]} Shooting Glasses`,
    category: 'Eye Protection',
    brand: ['Oakley', 'Wiley X', 'ESS', '5.11 Tactical'][i % 4],
    description: 'Ballistic-rated shooting glasses with UV protection.',
    basePrice: randomPrice(50, 140)
  })),

  // TARGETS & SHOOTING RESTS
  ...Array.from({ length: 15 }, (_, i) => ({
    name: `${['Champion', 'Caldwell', 'Birchwood Casey'][i % 3]} ${['Paper Targets', 'AR500 Steel', 'Reactive'][i % 3]} Target Set`,
    category: 'Targets',
    brand: ['Champion', 'Caldwell', 'Birchwood Casey'][i % 3],
    description: 'Training targets for range practice.',
    basePrice: randomPrice(15, 120)
  })),
  ...Array.from({ length: 12 }, (_, i) => ({
    name: `${['Caldwell', 'Champion', 'Armageddon Gear'][i % 3]} ${['Deadshot Bag', 'Prefilled Bag', 'Game Changer'][i % 3]}`,
    category: 'Shooting Rests',
    brand: ['Caldwell', 'Champion', 'Armageddon Gear'][i % 3],
    description: 'Shooting rest bag for stable shooting.',
    basePrice: randomPrice(25, 110)
  })),

  // CLEANING SUPPLIES
  ...Array.from({ length: 20 }, (_, i) => ({
    name: `${['Otis', 'Hoppes', 'Real Avid'][i % 3]} ${['Elite', 'Universal', 'Gun Boss Pro'][i % 3]} Cleaning Kit`,
    category: 'Cleaning Kits',
    brand: ['Otis', 'Hoppes', 'Real Avid'][i % 3],
    description: 'Complete firearm cleaning kit.',
    basePrice: randomPrice(25, 120)
  })),
  ...Array.from({ length: 20 }, (_, i) => ({
    name: `${['Hoppes', 'Break-Free', 'Ballistol'][i % 3]} ${['No. 9', 'CLP', 'Multi-Purpose'][i % 3]} Gun Cleaner - ${['4oz', '8oz', '16oz'][i % 3]}`,
    category: 'Cleaning Supplies',
    brand: ['Hoppes', 'Break-Free', 'Ballistol'][i % 3],
    description: 'Gun cleaning solvent and lubricant.',
    basePrice: randomPrice(8, 30)
  })),

  // CASES & SAFES
  ...Array.from({ length: 20 }, (_, i) => ({
    name: `${['Pelican', 'Plano', 'MTM'][i % 3]} ${['1700', 'All Weather', 'Tactical'][i % 3]} ${['Rifle', 'Pistol'][i % 2]} Case`,
    category: 'Cases',
    brand: ['Pelican', 'Plano', 'MTM'][i % 3],
    description: 'Waterproof and crushproof gun case.',
    basePrice: randomPrice(60, 350)
  })),
  ...Array.from({ length: 15 }, (_, i) => ({
    name: `${['Stack-On', 'Barska', 'Fort Knox'][i % 3]} ${['8-Gun', 'Biometric', 'Personal'][i % 3]} Safe`,
    category: 'Safes',
    brand: ['Stack-On', 'Barska', 'Fort Knox'][i % 3],
    description: 'Secure gun storage safe.',
    basePrice: randomPrice(150, 700)
  })),

  // SLINGS
  ...Array.from({ length: 15 }, (_, i) => ({
    name: `${['Vickers', 'Blue Force Gear', 'Magpul'][i % 3]} ${['Padded Sling', 'Vickers Sling', 'MS1'][i % 3]}`,
    category: 'Slings',
    brand: ['Vickers', 'Blue Force Gear', 'Magpul'][i % 3],
    description: 'Adjustable two-point rifle sling.',
    basePrice: randomPrice(30, 65)
  })),
]

async function seedComprehensiveProducts() {
  console.log('🎯 Starting comprehensive product seed...')
  console.log(`⏳ Seeding ${productData.length} products...\n`)

  try {
    // Get all retailers for random assignment
    const retailers = await prisma.retailer.findMany()
    if (retailers.length === 0) {
      console.error('❌ No retailers found. Please run pnpm db:seed-retailers first.')
      return
    }

    console.log(`Found ${retailers.length} retailers\n`)

    let totalProducts = 0
    let totalPrices = 0
    let lastCategory = ''

    for (const productInfo of productData) {
      // Log category changes
      if (productInfo.category !== lastCategory) {
        if (lastCategory) console.log('') // Empty line between categories
        console.log(`📦 Seeding ${productInfo.category}...`)
        lastCategory = productInfo.category
      }

      const product = await prisma.product.create({
        data: {
          name: productInfo.name,
          category: productInfo.category,
          brand: productInfo.brand,
          description: productInfo.description,
          imageUrl: null,
        }
      })
      totalProducts++

      // Add prices from 2-4 random retailers
      const productRetailers = randomItems(retailers, Math.floor(Math.random() * 3) + 2)
      for (const retailer of productRetailers) {
        const price = productInfo.basePrice * (0.85 + Math.random() * 0.35) // ±15-20% variation
        await prisma.price.create({
          data: {
            productId: product.id,
            retailerId: retailer.id,
            price: Math.round(price * 100) / 100,
            url: `https://${retailer.website}/products/${product.id}`,
            inStock: Math.random() > 0.15, // 85% in stock
            currency: 'USD',
          }
        })
        totalPrices++
      }

      // Progress indicator
      if (totalProducts % 50 === 0) {
        console.log(`   Processed ${totalProducts}/${productData.length} products (${totalPrices} prices)...`)
      }
    }

    console.log('\n🎉 Comprehensive product seed completed!')
    console.log('\n📊 Final Statistics:')
    console.log(`   Total Products: ${totalProducts}`)
    console.log(`   Total Prices: ${totalPrices}`)
    console.log(`   Average Prices per Product: ${Math.round(totalPrices / totalProducts * 10) / 10}`)

    // Get category breakdown
    const categoryStats = await prisma.product.groupBy({
      by: ['category'],
      _count: true,
    })

    console.log('\n📦 Products by Category:')
    categoryStats.sort((a, b) => b._count - a._count).forEach(stat => {
      console.log(`   ${stat.category}: ${stat._count}`)
    })

  } catch (error) {
    console.error('❌ Error seeding products:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

seedComprehensiveProducts()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
