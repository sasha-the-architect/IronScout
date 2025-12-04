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

// Comprehensive product data
const productCategories = {
  // AMMUNITION - Expanded
  ammunition: {
    calibers: [
      { name: '9mm', brands: ['Federal', 'Winchester', 'Hornady', 'Speer', 'Blazer', 'Remington', 'PMC', 'Fiocchi', 'Magtech', 'CCI'], types: ['FMJ', 'JHP', 'HST', 'V-Max', 'Silvertip'], grains: [115, 124, 147] },
      { name: '5.56 NATO', brands: ['Federal', 'Winchester', 'Hornady', 'IMI', 'PMC', 'Remington', 'Black Hills', 'Fiocchi'], types: ['FMJ', 'HP', 'BTHP', 'V-Max', 'TAP'], grains: [55, 62, 69, 77] },
      { name: '.223 Remington', brands: ['Federal', 'Winchester', 'Hornady', 'Nosler', 'PMC', 'Remington'], types: ['FMJ', 'HP', 'V-Max', 'Ballistic Tip'], grains: [55, 62, 69, 75] },
      { name: '7.62x39', brands: ['Wolf', 'Tula', 'Barnaul', 'Red Army Standard', 'Hornady', 'Federal'], types: ['FMJ', 'HP', 'SP'], grains: [123, 154] },
      { name: '.308 Winchester', brands: ['Federal', 'Winchester', 'Hornady', 'Nosler', 'Remington', 'Black Hills', 'IMI'], types: ['FMJ', 'BTHP', 'ELD', 'Ballistic Tip'], grains: [147, 150, 168, 175, 180] },
      { name: '.22 LR', brands: ['CCI', 'Federal', 'Winchester', 'Aguila', 'Remington', 'Eley', 'SK'], types: ['LRN', 'CPRN', 'HP', 'Subsonic', 'HV'], grains: [36, 38, 40, 42] },
      { name: '.45 ACP', brands: ['Federal', 'Winchester', 'Hornady', 'Speer', 'Remington', 'Blazer'], types: ['FMJ', 'JHP', 'HST', '+P'], grains: [185, 200, 230] },
      { name: '.40 S&W', brands: ['Federal', 'Winchester', 'Speer', 'Hornady', 'Remington'], types: ['FMJ', 'JHP', 'HST'], grains: [165, 180] },
      { name: '.380 ACP', brands: ['Federal', 'Hornady', 'Winchester', 'Remington', 'Fiocchi'], types: ['FMJ', 'JHP'], grains: [90, 95, 100] },
      { name: '.38 Special', brands: ['Federal', 'Winchester', 'Hornady', 'Remington', 'Magtech'], types: ['LRN', 'JHP', '+P'], grains: [125, 130, 158] },
      { name: '6.5 Creedmoor', brands: ['Hornady', 'Federal', 'Nosler', 'Berger', 'Winchester'], types: ['ELD', 'BTHP', 'Ballistic Tip'], grains: [120, 130, 140, 147] },
      { name: '300 Blackout', brands: ['Hornady', 'Federal', 'Winchester', 'Remington', 'Barnes'], types: ['FMJ', 'HP', 'Subsonic', 'TAC-TX'], grains: [110, 125, 147, 208, 220] },
      { name: '10mm Auto', brands: ['Federal', 'Hornady', 'Winchester', 'Underwood', 'Sig Sauer'], types: ['FMJ', 'JHP', 'XTP'], grains: [180, 200] },
      { name: '6.5 Grendel', brands: ['Hornady', 'Federal', 'Alexander Arms', 'Wolf'], types: ['FMJ', 'BTHP', 'ELD'], grains: [120, 123] },
      { name: '12 Gauge', brands: ['Federal', 'Winchester', 'Remington', 'Fiocchi', 'Estate'], types: ['00 Buck', 'Birdshot', 'Slug', 'Turkey'], loads: ['2-3/4"', '3"'] },
      { name: '20 Gauge', brands: ['Federal', 'Winchester', 'Remington', 'Fiocchi'], types: ['Birdshot', 'Slug', 'Buck'], loads: ['2-3/4"', '3"'] },
      { name: '.357 Magnum', brands: ['Federal', 'Hornady', 'Winchester', 'Remington'], types: ['JHP', 'JSP', 'FTX'], grains: [125, 158, 180] },
      { name: '5.7x28mm', brands: ['FN Herstal', 'Federal', 'Speer', 'Fiocchi'], types: ['FMJ', 'V-Max', 'TMJ'], grains: [40, 43] },
    ]
  },

  // OPTICS & SIGHTS
  optics: {
    riflescopes: [
      { brand: 'Vortex', models: ['Diamondback', 'Viper', 'Razor', 'Strike Eagle', 'Crossfire'], magnifications: ['3-9x40', '4-12x44', '1-6x24', '1-8x24', '6-24x50'], price: [150, 800] },
      { brand: 'Leupold', models: ['VX-3', 'VX-5', 'Mark 5', 'Freedom'], magnifications: ['3-9x40', '4-12x44', '1-6x24', '3-18x44'], price: [200, 2000] },
      { brand: 'Bushnell', models: ['Elite', 'Banner', 'Trophy', 'AR Optics'], magnifications: ['3-9x40', '4-12x40', '1-4x24', '2-7x36'], price: [100, 600] },
      { brand: 'Nikon', models: ['Prostaff', 'Monarch', 'Black'], magnifications: ['3-9x40', '4-12x40', '1-4x24'], price: [150, 700] },
      { brand: 'Primary Arms', models: ['SLx', 'GLx', 'Classic'], magnifications: ['1-6x24', '1-8x24', '3-18x50'], price: [200, 800] },
    ],
    redDots: [
      { brand: 'Holosun', models: ['HS403', 'HS503', 'HS510', 'HE509', 'HE407'], price: [150, 350] },
      { brand: 'Sig Sauer', models: ['Romeo5', 'Romeo7', 'Romeo MSR', 'Romeo Zero'], price: [120, 400] },
      { brand: 'Vortex', models: ['Crossfire', 'Sparc', 'Strikefire', 'Venom', 'Viper'], price: [150, 350] },
      { brand: 'Aimpoint', models: ['PRO', 'ACO', 'Comp M5', 'Micro T2'], price: [300, 800] },
      { brand: 'Trijicon', models: ['MRO', 'RMR', 'SRO'], price: [400, 700] },
    ],
    magnifiers: [
      { brand: 'Vortex', models: ['Micro 3X', 'VMX-3T'], price: [200, 300] },
      { brand: 'Holosun', models: ['HM3X'], price: [150, 200] },
      { brand: 'Sig Sauer', models: ['Juliet3', 'Juliet4'], price: [150, 250] },
      { brand: 'Aimpoint', models: ['3X-C', '6X'], price: [350, 600] },
    ]
  },

  // FIREARM ACCESSORIES
  accessories: {
    magazines: [
      { platform: 'AR-15', brands: ['Magpul', 'Lancer', 'HexMag', 'Okay Industries', 'Troy'], capacities: [10, 20, 30, 40, 60], price: [10, 35] },
      { platform: 'AK-47', brands: ['Magpul', 'Tapco', 'ProMag', 'Bulgarian'], capacities: [10, 20, 30, 40], price: [12, 40] },
      { platform: 'Glock', brands: ['Glock OEM', 'Magpul', 'ETS', 'ProMag'], models: ['17', '19', '43'], capacities: [10, 15, 17, 33], price: [15, 35] },
      { platform: 'AR-10', brands: ['Magpul', 'Lancer', 'ASC'], capacities: [10, 20, 25], price: [18, 45] },
    ],
    grips: [
      { brand: 'Magpul', types: ['MOE', 'K2', 'K2+', 'SL'], platforms: ['AR-15', 'AK'], price: [15, 25] },
      { brand: 'BCM', types: ['Gunfighter Mod 0', 'Gunfighter Mod 1', 'Gunfighter Mod 3'], platforms: ['AR-15'], price: [18, 22] },
      { brand: 'Hogue', types: ['OverMolded', 'Rubber'], platforms: ['AR-15', 'AK', 'Pistol'], price: [12, 30] },
    ],
    stocks: [
      { brand: 'Magpul', types: ['CTR', 'MOE', 'STR', 'UBR', 'Zhukov'], platforms: ['AR-15', 'AK'], price: [40, 200] },
      { brand: 'BCM', types: ['Gunfighter', 'SOPMOD'], platforms: ['AR-15'], price: [50, 70] },
      { brand: 'B5 Systems', types: ['Bravo', 'SOPMOD', 'Precision'], platforms: ['AR-15'], price: [45, 90] },
    ],
    handguards: [
      { brand: 'Midwest Industries', types: ['Combat Rail', 'G4', 'SP Series'], lengths: [7, 9, 10, 12, 15], price: [150, 300] },
      { brand: 'BCM', types: ['QRF', 'MCMR', 'KMR'], lengths: [8, 10, 13, 15], price: [180, 250] },
      { brand: 'Aero Precision', types: ['Atlas', 'Quantum'], lengths: [9, 12, 15], price: [120, 180] },
    ],
    slings: [
      { brand: 'Vickers', types: ['Padded', 'Unpadded'], price: [40, 60] },
      { brand: 'Blue Force Gear', types: ['Vickers Sling', 'Standard Sling'], price: [45, 65] },
      { brand: 'Magpul', types: ['MS1', 'MS3', 'MS4'], price: [25, 45] },
    ]
  },

  // TACTICAL GEAR
  tactical: {
    holsters: [
      { brand: 'Safariland', types: ['ALS', 'GLS', 'Level II', 'Level III'], fits: ['Glock 17/19', 'Sig P320', 'M&P 9'], price: [40, 150] },
      { brand: 'Blackhawk', types: ['SERPA', 'T-Series', 'Omnivore'], fits: ['Universal', 'Glock', 'M&P'], price: [30, 70] },
      { brand: 'Blade-Tech', types: ['Classic', 'Signature', 'Total Eclipse'], fits: ['Glock', '1911', 'M&P'], price: [50, 90] },
      { brand: 'Alien Gear', types: ['Cloak Tuck', 'ShapeShift', 'Photon'], fits: ['Glock', 'Sig', 'Springfield'], price: [40, 80] },
    ],
    magazinePouches: [
      { brand: 'Esstac', types: ['Kywi', 'Daeodon'], platforms: ['Pistol', 'Rifle'], price: [15, 35] },
      { brand: 'Blue Force Gear', types: ['Ten-Speed', 'Helium Whisper'], platforms: ['Pistol', 'Rifle'], price: [20, 40] },
      { brand: 'HSGI', types: ['Taco', 'X2RP'], platforms: ['Pistol', 'Rifle'], price: [25, 45] },
    ],
    plateCarriers: [
      { brand: 'Crye Precision', models: ['JPC 2.0', 'AVS', 'SPC'], price: [250, 500] },
      { brand: 'Ferro Concepts', models: ['Slickster', 'FCPC'], price: [150, 300] },
      { brand: '5.11 Tactical', models: ['TacTec', 'Tactec Plate Carrier'], price: [120, 250] },
    ],
    belts: [
      { brand: 'Blue Alpha Gear', types: ['Low Profile EDC', 'Molle 1.75"', 'Double Belt Rig'], price: [50, 120] },
      { brand: 'Ronin Tactics', types: ['Task Force', 'Senshi'], price: [80, 130] },
      { brand: '5.11 Tactical', types: ['Maverick', 'Sierra Bravo'], price: [40, 80] },
    ]
  },

  // RANGE EQUIPMENT
  range: {
    hearing: [
      { brand: 'Howard Leight', models: ['Impact Sport', 'Impact Pro', 'Sync'], price: [40, 80] },
      { brand: 'Walker', models: ['Razor', 'Alpha Muffs', 'XCEL'], price: [35, 90] },
      { brand: '3M Peltor', models: ['Sport Tactical 100', 'Sport Tactical 500', 'ComTac'], price: [50, 400] },
      { brand: 'Pro Ears', models: ['Ultra Pro', 'Predator Gold', 'Stealth 28'], price: [80, 250] },
    ],
    eyewear: [
      { brand: 'Oakley', models: ['M Frame', 'Flak 2.0', 'Half Jacket'], price: [80, 150] },
      { brand: 'Wiley X', models: ['Saber', 'Valor', 'Saint'], price: [70, 120] },
      { brand: 'ESS', models: ['Crossbow', 'Rollbar', 'ICE'], price: [60, 100] },
      { brand: '5.11 Tactical', models: ['Burner', 'Climb'], price: [40, 70] },
    ],
    targets: [
      { brand: 'Champion', types: ['Paper Targets', 'Steel Spinner', 'Reactive'], price: [10, 80] },
      { brand: 'Caldwell', types: ['Resetting Target', 'AR500 Steel'], price: [30, 150] },
      { brand: 'Birchwood Casey', types: ['Shoot-N-C', 'World of Targets', 'Steel Target'], price: [8, 100] },
    ],
    bags: [
      { brand: 'Caldwell', types: ['Deadshot Bag', 'Tackdriver Bag', 'Stable Table'], price: [20, 80] },
      { brand: 'Champion', types: ['Shooting Bag Set', 'Prefilled Bag'], price: [15, 50] },
      { brand: 'Armageddon Gear', types: ['Game Changer', 'Fat Bag'], price: [80, 120] },
    ]
  },

  // CLEANING & MAINTENANCE
  cleaning: {
    kits: [
      { brand: 'Otis', types: ['Elite', 'Defender', 'Tactical'], calibers: ['Universal', 'Rifle', 'Pistol'], price: [30, 150] },
      { brand: 'Hoppes', types: ['Universal Kit', 'Rifle Kit', 'Pistol Kit'], price: [15, 50] },
      { brand: 'Real Avid', types: ['Gun Boss Pro', 'AR-15 Tool', 'AK-47 Tool'], price: [20, 80] },
    ],
    solvents: [
      { brand: 'Hoppes', types: ['No. 9', 'Elite', 'Bench Rest'], sizes: ['4oz', '8oz', '16oz'], price: [5, 20] },
      { brand: 'Break-Free', types: ['CLP', 'Powder Blast'], sizes: ['4oz', '12oz', '1 Gallon'], price: [8, 50] },
      { brand: 'Ballistol', types: ['Multi-Purpose', 'Aerosol'], sizes: ['4oz', '16oz'], price: [8, 25] },
    ],
    oils: [
      { brand: 'Mobil 1', types: ['Synthetic Oil'], sizes: ['4oz', '8oz'], price: [5, 15] },
      { brand: 'Slip 2000', types: ['EWL', 'EWG', '725'], sizes: ['4oz', '8oz'], price: [10, 25] },
      { brand: 'Lucas Oil', types: ['Extreme Duty Gun Oil'], sizes: ['2oz', '4oz', '8oz'], price: [6, 18] },
    ]
  },

  // STORAGE & CASES
  storage: {
    cases: [
      { brand: 'Pelican', models: ['1700', 'V700', '1750'], types: ['Rifle', 'Pistol'], price: [150, 400] },
      { brand: 'Plano', models: ['All Weather', 'Pro-Max', 'Field Locker'], types: ['Rifle', 'Pistol'], price: [40, 150] },
      { brand: 'MTM', models: ['Tactical', 'Survivor'], types: ['Ammo Can', 'Rifle Case'], price: [20, 100] },
    ],
    safes: [
      { brand: 'Stack-On', types: ['8-Gun', '18-Gun', '24-Gun', 'Pistol Safe'], price: [200, 800] },
      { brand: 'Barska', types: ['Biometric Safe', 'Quick Access'], price: [100, 300] },
      { brand: 'Fort Knox', types: ['Pistol Box', 'Personal Safe'], price: [250, 600] },
    ]
  }
}

async function seedComprehensiveProducts() {
  console.log('🎯 Starting comprehensive product seed...')
  console.log('⏳ This will take several minutes...\n')

  try {
    // Get all retailers for random assignment
    const retailers = await prisma.retailer.findMany()
    if (retailers.length === 0) {
      console.error('❌ No retailers found. Please run pnpm db:seed-retailers first.')
      return
    }

    let totalProducts = 0
    let totalPrices = 0

    // SEED AMMUNITION
    console.log('📦 Seeding ammunition products...')
    for (const caliber of productCategories.ammunition.calibers) {
      for (const brand of caliber.brands) {
        for (const type of caliber.types) {
          const grainOptions = caliber.grains || [null]
          for (const grain of grainOptions) {
            const grainText = grain ? `${grain}gr` : ''
            const name = `${brand} ${caliber.name} ${grainText} ${type}`.trim()
            const basePrice = caliber.name.includes('12 Gauge') || caliber.name.includes('20 Gauge')
              ? randomPrice(8, 25)
              : randomPrice(12, 50)

            const product = await prisma.product.create({
              data: {
                name,
                category: 'Ammunition',
                brand,
                description: `${caliber.name} ammunition by ${brand}. ${type} projectile${grain ? ` at ${grain} grains` : ''}. Premium quality for range and defensive use.`,
                imageUrl: null,
              }
            })
            totalProducts++

            // Add prices from 2-4 random retailers
            const productRetailers = randomItems(retailers, Math.floor(Math.random() * 3) + 2)
            for (const retailer of productRetailers) {
              const price = basePrice * (0.9 + Math.random() * 0.4) // ±20% variation
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
          }
        }
      }
    }
    console.log(`   ✅ Created ammunition products\n`)

    // SEED RIFLE SCOPES
    console.log('🔭 Seeding rifle scopes...')
    for (const scopeLine of productCategories.optics.riflescopes) {
      for (const model of scopeLine.models) {
        for (const mag of scopeLine.magnifications) {
          const name = `${scopeLine.brand} ${model} ${mag} Rifle Scope`
          const basePrice = randomPrice(scopeLine.price[0], scopeLine.price[1])

          const product = await prisma.product.create({
            data: {
            name,
            category:
              name,
              category: 'Optics',
              brand: scopeLine.brand,
              description: `${scopeLine.brand} ${model} rifle scope with ${mag} magnification. Premium glass and durable construction for precision shooting.`,
              imageUrl: null,
            }
          })
          totalProducts++

          const productRetailers = randomItems(retailers, Math.floor(Math.random() * 3) + 2)
          for (const retailer of productRetailers) {
            const price = basePrice * (0.9 + Math.random() * 0.3)
            await prisma.price.create({
              data: {
                productId: product.id,
                retailerId: retailer.id,
                price: Math.round(price * 100) / 100,
                url: `https://${retailer.website}/products/${product.id}`,
                inStock: Math.random() > 0.2,
                currency: 'USD',
              }
            })
            totalPrices++
          }
        }
      }
    }
    console.log(`   ✅ Created rifle scope products\n`)

    // SEED RED DOTS
    console.log('🔴 Seeding red dot sights...')
    for (const redDotLine of productCategories.optics.redDots) {
      for (const model of redDotLine.models) {
        const name = `${redDotLine.brand} ${model} Red Dot Sight`
        const basePrice = randomPrice(redDotLine.price[0], redDotLine.price[1])

        const product = await prisma.product.create({
          data: {
          name,
          category:
            name,
            category: 'Optics',
            brand: redDotLine.brand,
            description: `${redDotLine.brand} ${model} red dot sight. Fast target acquisition with exceptional battery life.`,
            imageUrl: null,
          }
        })
        totalProducts++

        const productRetailers = randomItems(retailers, Math.floor(Math.random() * 3) + 2)
        for (const retailer of productRetailers) {
          const price = basePrice * (0.9 + Math.random() * 0.3)
          await prisma.price.create({
            data: {
              productId: product.id,
              retailerId: retailer.id,
              price: Math.round(price * 100) / 100,
              url: `https://${retailer.website}/products/${product.id}`,
              inStock: Math.random() > 0.2,
              currency: 'USD',
            }
          })
          totalPrices++
        }
      }
    }
    console.log(`   ✅ Created red dot sight products\n`)

    // SEED MAGNIFIERS
    console.log('🔍 Seeding magnifiers...')
    for (const magLine of productCategories.optics.magnifiers) {
      for (const model of magLine.models) {
        const name = `${magLine.brand} ${model} Magnifier`
        const basePrice = randomPrice(magLine.price[0], magLine.price[1])

        const product = await prisma.product.create({
          data: {
          name,
          category:
            name,
            category: 'Optics',
            brand: magLine.brand,
            description: `${magLine.brand} ${model} flip-to-side magnifier. Pairs perfectly with red dot sights.`,
            imageUrl: null,
          }
        })
        totalProducts++

        const productRetailers = randomItems(retailers, Math.floor(Math.random() * 3) + 2)
        for (const retailer of productRetailers) {
          const price = basePrice * (0.9 + Math.random() * 0.25)
          await prisma.price.create({
            data: {
              productId: product.id,
              retailerId: retailer.id,
              price: Math.round(price * 100) / 100,
              url: `https://${retailer.website}/products/${product.id}`,
              inStock: Math.random() > 0.2,
              currency: 'USD',
            }
          })
          totalPrices++
        }
      }
    }
    console.log(`   ✅ Created magnifier products\n`)

    // SEED MAGAZINES
    console.log('📰 Seeding magazines...')
    for (const magType of productCategories.accessories.magazines) {
      for (const brand of magType.brands) {
        for (const capacity of magType.capacities) {
          const modelText = magType.models ? ` ${randomItems(magType.models, 1)[0]}` : ''
          const name = `${brand} ${magType.platform}${modelText} ${capacity}-Round Magazine`
          const basePrice = randomPrice(magType.price[0], magType.price[1])

          const product = await prisma.product.create({
            data: {
            name,
            category:
              name,
              category: 'Magazines',
              brand,
              description: `${brand} ${capacity}-round magazine for ${magType.platform}. Reliable feeding and durable construction.`,
              imageUrl: null,
            }
          })
          totalProducts++

          const productRetailers = randomItems(retailers, Math.floor(Math.random() * 4) + 2)
          for (const retailer of productRetailers) {
            const price = basePrice * (0.85 + Math.random() * 0.4)
            await prisma.price.create({
              data: {
                productId: product.id,
                retailerId: retailer.id,
                price: Math.round(price * 100) / 100,
                url: `https://${retailer.website}/products/${product.id}`,
                inStock: Math.random() > 0.15,
                currency: 'USD',
              }
            })
            totalPrices++
          }
        }
      }
    }
    console.log(`   ✅ Created magazine products\n`)

    // SEED GRIPS
    console.log('✋ Seeding grips...')
    for (const gripLine of productCategories.accessories.grips) {
      for (const type of gripLine.types) {
        for (const platform of gripLine.platforms) {
          const name = `${gripLine.brand} ${type} Grip - ${platform}`
          const basePrice = randomPrice(gripLine.price[0], gripLine.price[1])

          const product = await prisma.product.create({
            data: {
            name,
            category:
              name,
              category: 'Grips & Stocks',
              brand: gripLine.brand,
              description: `${gripLine.brand} ${type} grip for ${platform}. Enhanced ergonomics and control.`,
              imageUrl: null,
            }
          })
          totalProducts++

          const productRetailers = randomItems(retailers, Math.floor(Math.random() * 3) + 2)
          for (const retailer of productRetailers) {
            const price = basePrice * (0.9 + Math.random() * 0.3)
            await prisma.price.create({
              data: {
                productId: product.id,
                retailerId: retailer.id,
                price: Math.round(price * 100) / 100,
                url: `https://${retailer.website}/products/${product.id}`,
                inStock: Math.random() > 0.15,
                currency: 'USD',
              }
            })
            totalPrices++
          }
        }
      }
    }
    console.log(`   ✅ Created grip products\n`)

    // SEED STOCKS
    console.log('📐 Seeding stocks...')
    for (const stockLine of productCategories.accessories.stocks) {
      for (const type of stockLine.types) {
        for (const platform of stockLine.platforms) {
          const name = `${stockLine.brand} ${type} Stock - ${platform}`
          const basePrice = randomPrice(stockLine.price[0], stockLine.price[1])

          const product = await prisma.product.create({
            data: {
            name,
            category:
              name,
              category: 'Grips & Stocks',
              brand: stockLine.brand,
              description: `${stockLine.brand} ${type} stock for ${platform}. Adjustable and durable.`,
              imageUrl: null,
            }
          })
          totalProducts++

          const productRetailers = randomItems(retailers, Math.floor(Math.random() * 3) + 2)
          for (const retailer of productRetailers) {
            const price = basePrice * (0.9 + Math.random() * 0.3)
            await prisma.price.create({
              data: {
                productId: product.id,
                retailerId: retailer.id,
                price: Math.round(price * 100) / 100,
                url: `https://${retailer.website}/products/${product.id}`,
                inStock: Math.random() > 0.15,
                currency: 'USD',
              }
            })
            totalPrices++
          }
        }
      }
    }
    console.log(`   ✅ Created stock products\n`)

    // SEED HANDGUARDS
    console.log('🛡️ Seeding handguards...')
    for (const hgLine of productCategories.accessories.handguards) {
      for (const type of hgLine.types) {
        for (const length of hgLine.lengths) {
          const name = `${hgLine.brand} ${type} ${length}" Handguard`
          const basePrice = randomPrice(hgLine.price[0], hgLine.price[1])

          const product = await prisma.product.create({
            data: {
            name,
            category:
              name,
              category: 'Rails & Handguards',
              brand: hgLine.brand,
              description: `${hgLine.brand} ${type} ${length}" handguard. M-LOK compatible with full-length top rail.`,
              imageUrl: null,
            }
          })
          totalProducts++

          const productRetailers = randomItems(retailers, Math.floor(Math.random() * 3) + 2)
          for (const retailer of productRetailers) {
            const price = basePrice * (0.9 + Math.random() * 0.25)
            await prisma.price.create({
              data: {
                productId: product.id,
                retailerId: retailer.id,
                price: Math.round(price * 100) / 100,
                url: `https://${retailer.website}/products/${product.id}`,
                inStock: Math.random() > 0.2,
                currency: 'USD',
              }
            })
            totalPrices++
          }
        }
      }
    }
    console.log(`   ✅ Created handguard products\n`)

    // SEED SLINGS
    console.log('🎗️ Seeding slings...')
    for (const slingLine of productCategories.accessories.slings) {
      for (const type of slingLine.types) {
        const name = `${slingLine.brand} ${type}`
        const basePrice = randomPrice(slingLine.price[0], slingLine.price[1])

        const product = await prisma.product.create({
          data: {
          name,
          category:
            name,
            category: 'Slings',
            brand: slingLine.brand,
            description: `${slingLine.brand} ${type} rifle sling. Adjustable two-point design.`,
            imageUrl: null,
          }
        })
        totalProducts++

        const productRetailers = randomItems(retailers, Math.floor(Math.random() * 3) + 2)
        for (const retailer of productRetailers) {
          const price = basePrice * (0.9 + Math.random() * 0.3)
          await prisma.price.create({
            data: {
              productId: product.id,
              retailerId: retailer.id,
              price: Math.round(price * 100) / 100,
              url: `https://${retailer.website}/products/${product.id}`,
              inStock: Math.random() > 0.15,
              currency: 'USD',
            }
          })
          totalPrices++
        }
      }
    }
    console.log(`   ✅ Created sling products\n`)

    // SEED HOLSTERS
    console.log('🔫 Seeding holsters...')
    for (const holsterLine of productCategories.tactical.holsters) {
      for (const type of holsterLine.types) {
        for (const fit of holsterLine.fits) {
          const name = `${holsterLine.brand} ${type} Holster - ${fit}`
          const basePrice = randomPrice(holsterLine.price[0], holsterLine.price[1])

          const product = await prisma.product.create({
            data: {
            name,
            category:
              name,
              category: 'Holsters',
              brand: holsterLine.brand,
              description: `${holsterLine.brand} ${type} holster for ${fit}. Secure retention and quick draw.`,
              imageUrl: null,
            }
          })
          totalProducts++

          const productRetailers = randomItems(retailers, Math.floor(Math.random() * 3) + 2)
          for (const retailer of productRetailers) {
            const price = basePrice * (0.9 + Math.random() * 0.3)
            await prisma.price.create({
              data: {
                productId: product.id,
                retailerId: retailer.id,
                price: Math.round(price * 100) / 100,
                url: `https://${retailer.website}/products/${product.id}`,
                inStock: Math.random() > 0.2,
                currency: 'USD',
              }
            })
            totalPrices++
          }
        }
      }
    }
    console.log(`   ✅ Created holster products\n`)

    // SEED MAGAZINE POUCHES
    console.log('👝 Seeding magazine pouches...')
    for (const pouchLine of productCategories.tactical.magazinePouches) {
      for (const type of pouchLine.types) {
        for (const platform of pouchLine.platforms) {
          const name = `${pouchLine.brand} ${type} ${platform} Magazine Pouch`
          const basePrice = randomPrice(pouchLine.price[0], pouchLine.price[1])

          const product = await prisma.product.create({
            data: {
            name,
            category:
              name,
              category: 'Magazine Pouches',
              brand: pouchLine.brand,
              description: `${pouchLine.brand} ${type} magazine pouch for ${platform.toLowerCase()} magazines. Quick access and secure retention.`,
              imageUrl: null,
            }
          })
          totalProducts++

          const productRetailers = randomItems(retailers, Math.floor(Math.random() * 3) + 2)
          for (const retailer of productRetailers) {
            const price = basePrice * (0.9 + Math.random() * 0.3)
            await prisma.price.create({
              data: {
                productId: product.id,
                retailerId: retailer.id,
                price: Math.round(price * 100) / 100,
                url: `https://${retailer.website}/products/${product.id}`,
                inStock: Math.random() > 0.15,
                currency: 'USD',
              }
            })
            totalPrices++
          }
        }
      }
    }
    console.log(`   ✅ Created magazine pouch products\n`)

    // SEED PLATE CARRIERS
    console.log('🦺 Seeding plate carriers...')
    for (const pcLine of productCategories.tactical.plateCarriers) {
      for (const model of pcLine.models) {
        const name = `${pcLine.brand} ${model} Plate Carrier`
        const basePrice = randomPrice(pcLine.price[0], pcLine.price[1])

        const product = await prisma.product.create({
          data: {
          name,
          category:
            name,
            category: 'Plate Carriers',
            brand: pcLine.brand,
            description: `${pcLine.brand} ${model} plate carrier. Modular design with excellent load distribution.`,
            imageUrl: null,
          }
        })
        totalProducts++

        const productRetailers = randomItems(retailers, Math.floor(Math.random() * 3) + 2)
        for (const retailer of productRetailers) {
          const price = basePrice * (0.9 + Math.random() * 0.25)
          await prisma.price.create({
            data: {
              productId: product.id,
              retailerId: retailer.id,
              price: Math.round(price * 100) / 100,
              url: `https://${retailer.website}/products/${product.id}`,
              inStock: Math.random() > 0.25,
              currency: 'USD',
            }
          })
          totalPrices++
        }
      }
    }
    console.log(`   ✅ Created plate carrier products\n`)

    // SEED TACTICAL BELTS
    console.log('👔 Seeding tactical belts...')
    for (const beltLine of productCategories.tactical.belts) {
      for (const type of beltLine.types) {
        const name = `${beltLine.brand} ${type} Belt`
        const basePrice = randomPrice(beltLine.price[0], beltLine.price[1])

        const product = await prisma.product.create({
          data: {
          name,
          category:
            name,
            category: 'Belts',
            brand: beltLine.brand,
            description: `${beltLine.brand} ${type} tactical belt. Reinforced and adjustable.`,
            imageUrl: null,
          }
        })
        totalProducts++

        const productRetailers = randomItems(retailers, Math.floor(Math.random() * 3) + 2)
        for (const retailer of productRetailers) {
          const price = basePrice * (0.9 + Math.random() * 0.3)
          await prisma.price.create({
            data: {
              productId: product.id,
              retailerId: retailer.id,
              price: Math.round(price * 100) / 100,
              url: `https://${retailer.website}/products/${product.id}`,
              inStock: Math.random() > 0.2,
              currency: 'USD',
            }
          })
          totalPrices++
        }
      }
    }
    console.log(`   ✅ Created tactical belt products\n`)

    // SEED HEARING PROTECTION
    console.log('👂 Seeding hearing protection...')
    for (const hearingLine of productCategories.range.hearing) {
      for (const model of hearingLine.models) {
        const name = `${hearingLine.brand} ${model} Electronic Hearing Protection`
        const basePrice = randomPrice(hearingLine.price[0], hearingLine.price[1])

        const product = await prisma.product.create({
          data: {
          name,
          category:
            name,
            category: 'Hearing Protection',
            brand: hearingLine.brand,
            description: `${hearingLine.brand} ${model} electronic hearing protection. Amplifies ambient sounds while protecting from loud noises.`,
            imageUrl: null,
          }
        })
        totalProducts++

        const productRetailers = randomItems(retailers, Math.floor(Math.random() * 3) + 2)
        for (const retailer of productRetailers) {
          const price = basePrice * (0.9 + Math.random() * 0.3)
          await prisma.price.create({
            data: {
              productId: product.id,
              retailerId: retailer.id,
              price: Math.round(price * 100) / 100,
              url: `https://${retailer.website}/products/${product.id}`,
              inStock: Math.random() > 0.15,
              currency: 'USD',
            }
          })
          totalPrices++
        }
      }
    }
    console.log(`   ✅ Created hearing protection products\n`)

    // SEED EYEWEAR
    console.log('👓 Seeding shooting eyewear...')
    for (const eyewearLine of productCategories.range.eyewear) {
      for (const model of eyewearLine.models) {
        const name = `${eyewearLine.brand} ${model} Shooting Glasses`
        const basePrice = randomPrice(eyewearLine.price[0], eyewearLine.price[1])

        const product = await prisma.product.create({
          data: {
          name,
          category:
            name,
            category: 'Eye Protection',
            brand: eyewearLine.brand,
            description: `${eyewearLine.brand} ${model} ballistic shooting glasses. Impact-resistant lenses with UV protection.`,
            imageUrl: null,
          }
        })
        totalProducts++

        const productRetailers = randomItems(retailers, Math.floor(Math.random() * 3) + 2)
        for (const retailer of productRetailers) {
          const price = basePrice * (0.9 + Math.random() * 0.3)
          await prisma.price.create({
            data: {
              productId: product.id,
              retailerId: retailer.id,
              price: Math.round(price * 100) / 100,
              url: `https://${retailer.website}/products/${product.id}`,
              inStock: Math.random() > 0.15,
              currency: 'USD',
            }
          })
          totalPrices++
        }
      }
    }
    console.log(`   ✅ Created eyewear products\n`)

    // SEED TARGETS
    console.log('🎯 Seeding targets...')
    for (const targetLine of productCategories.range.targets) {
      for (const type of targetLine.types) {
        const name = `${targetLine.brand} ${type}`
        const basePrice = randomPrice(targetLine.price[0], targetLine.price[1])

        const product = await prisma.product.create({
          data: {
          name,
          category:
            name,
            category: 'Targets',
            brand: targetLine.brand,
            description: `${targetLine.brand} ${type.toLowerCase()}. Perfect for range training and practice.`,
            imageUrl: null,
          }
        })
        totalProducts++

        const productRetailers = randomItems(retailers, Math.floor(Math.random() * 3) + 2)
        for (const retailer of productRetailers) {
          const price = basePrice * (0.85 + Math.random() * 0.4)
          await prisma.price.create({
            data: {
              productId: product.id,
              retailerId: retailer.id,
              price: Math.round(price * 100) / 100,
              url: `https://${retailer.website}/products/${product.id}`,
              inStock: Math.random() > 0.15,
              currency: 'USD',
            }
          })
          totalPrices++
        }
      }
    }
    console.log(`   ✅ Created target products\n`)

    // SEED SHOOTING BAGS
    console.log('💼 Seeding shooting bags...')
    for (const bagLine of productCategories.range.bags) {
      for (const type of bagLine.types) {
        const name = `${bagLine.brand} ${type}`
        const basePrice = randomPrice(bagLine.price[0], bagLine.price[1])

        const product = await prisma.product.create({
          data: {
          name,
          category:
            name,
            category: 'Shooting Rests',
            brand: bagLine.brand,
            description: `${bagLine.brand} ${type.toLowerCase()}. Stable shooting platform for benchrest accuracy.`,
            imageUrl: null,
          }
        })
        totalProducts++

        const productRetailers = randomItems(retailers, Math.floor(Math.random() * 3) + 2)
        for (const retailer of productRetailers) {
          const price = basePrice * (0.9 + Math.random() * 0.3)
          await prisma.price.create({
            data: {
              productId: product.id,
              retailerId: retailer.id,
              price: Math.round(price * 100) / 100,
              url: `https://${retailer.website}/products/${product.id}`,
              inStock: Math.random() > 0.2,
              currency: 'USD',
            }
          })
          totalPrices++
        }
      }
    }
    console.log(`   ✅ Created shooting bag products\n`)

    // SEED CLEANING KITS
    console.log('🧹 Seeding cleaning kits...')
    for (const kitLine of productCategories.cleaning.kits) {
      for (const type of kitLine.types) {
        for (const caliber of kitLine.calibers) {
          const name = `${kitLine.brand} ${type} Cleaning Kit - ${caliber}`
          const basePrice = randomPrice(kitLine.price[0], kitLine.price[1])

          const product = await prisma.product.create({
            data: {
            name,
            category:
              name,
              category: 'Cleaning Kits',
              brand: kitLine.brand,
              description: `${kitLine.brand} ${type} cleaning kit for ${caliber.toLowerCase()} firearms. Complete maintenance solution.`,
              imageUrl: null,
            }
          })
          totalProducts++

          const productRetailers = randomItems(retailers, Math.floor(Math.random() * 3) + 2)
          for (const retailer of productRetailers) {
            const price = basePrice * (0.9 + Math.random() * 0.3)
            await prisma.price.create({
              data: {
                productId: product.id,
                retailerId: retailer.id,
                price: Math.round(price * 100) / 100,
                url: `https://${retailer.website}/products/${product.id}`,
                inStock: Math.random() > 0.15,
                currency: 'USD',
              }
            })
            totalPrices++
          }
        }
      }
    }
    console.log(`   ✅ Created cleaning kit products\n`)

    // SEED SOLVENTS
    console.log('🧪 Seeding cleaning solvents...')
    for (const solventLine of productCategories.cleaning.solvents) {
      for (const type of solventLine.types) {
        for (const size of solventLine.sizes) {
          const name = `${solventLine.brand} ${type} Gun Cleaner - ${size}`
          const basePrice = randomPrice(solventLine.price[0], solventLine.price[1])

          const product = await prisma.product.create({
            data: {
            name,
            category:
              name,
              category: 'Cleaning Supplies',
              brand: solventLine.brand,
              description: `${solventLine.brand} ${type} gun cleaning solvent. ${size} bottle for thorough cleaning.`,
              imageUrl: null,
            }
          })
          totalProducts++

          const productRetailers = randomItems(retailers, Math.floor(Math.random() * 3) + 2)
          for (const retailer of productRetailers) {
            const price = basePrice * (0.85 + Math.random() * 0.4)
            await prisma.price.create({
              data: {
                productId: product.id,
                retailerId: retailer.id,
                price: Math.round(price * 100) / 100,
                url: `https://${retailer.website}/products/${product.id}`,
                inStock: Math.random() > 0.1,
                currency: 'USD',
              }
            })
            totalPrices++
          }
        }
      }
    }
    console.log(`   ✅ Created cleaning solvent products\n`)

    // SEED OILS
    console.log('🛢️ Seeding gun oils...')
    for (const oilLine of productCategories.cleaning.oils) {
      for (const type of oilLine.types) {
        for (const size of oilLine.sizes) {
          const name = `${oilLine.brand} ${type} Gun Oil - ${size}`
          const basePrice = randomPrice(oilLine.price[0], oilLine.price[1])

          const product = await prisma.product.create({
            data: {
            name,
            category:
              name,
              category: 'Cleaning Supplies',
              brand: oilLine.brand,
              description: `${oilLine.brand} ${type} gun oil. ${size} bottle for lubrication and protection.`,
              imageUrl: null,
            }
          })
          totalProducts++

          const productRetailers = randomItems(retailers, Math.floor(Math.random() * 3) + 2)
          for (const retailer of productRetailers) {
            const price = basePrice * (0.85 + Math.random() * 0.4)
            await prisma.price.create({
              data: {
                productId: product.id,
                retailerId: retailer.id,
                price: Math.round(price * 100) / 100,
                url: `https://${retailer.website}/products/${product.id}`,
                inStock: Math.random() > 0.1,
                currency: 'USD',
            }
          })
          totalPrices++
        }
      }
      }
    }
    console.log(`   ✅ Created gun oil products\n`)

    // SEED CASES
    console.log('💼 Seeding gun cases...')
    for (const caseLine of productCategories.storage.cases) {
      for (const model of caseLine.models) {
        for (const type of caseLine.types) {
          const name = `${caseLine.brand} ${model} ${type} Case`
          const basePrice = randomPrice(caseLine.price[0], caseLine.price[1])

          const product = await prisma.product.create({
            data: {
            name,
            category:
              name,
              category: 'Cases',
              brand: caseLine.brand,
              description: `${caseLine.brand} ${model} ${type.toLowerCase()} case. Waterproof and crushproof protection.`,
              imageUrl: null,
            }
          })
          totalProducts++

          const productRetailers = randomItems(retailers, Math.floor(Math.random() * 3) + 2)
          for (const retailer of productRetailers) {
            const price = basePrice * (0.9 + Math.random() * 0.3)
            await prisma.price.create({
              data: {
                productId: product.id,
                retailerId: retailer.id,
                price: Math.round(price * 100) / 100,
                url: `https://${retailer.website}/products/${product.id}`,
                inStock: Math.random() > 0.2,
                currency: 'USD',
              }
            })
            totalPrices++
          }
        }
      }
    }
    console.log(`   ✅ Created gun case products\n`)

    // SEED SAFES
    console.log('🔒 Seeding gun safes...')
    for (const safeLine of productCategories.storage.safes) {
      for (const type of safeLine.types) {
        const name = `${safeLine.brand} ${type}`
        const basePrice = randomPrice(safeLine.price[0], safeLine.price[1])

        const product = await prisma.product.create({
          data: {
          name,
          category:
            name,
            category: 'Safes',
            brand: safeLine.brand,
            description: `${safeLine.brand} ${type.toLowerCase()}. Secure storage with quick access.`,
            imageUrl: null,
          }
        })
        totalProducts++

        const productRetailers = randomItems(retailers, Math.floor(Math.random() * 3) + 2)
        for (const retailer of productRetailers) {
          const price = basePrice * (0.9 + Math.random() * 0.25)
          await prisma.price.create({
            data: {
              productId: product.id,
              retailerId: retailer.id,
              price: Math.round(price * 100) / 100,
              url: `https://${retailer.website}/products/${product.id}`,
              inStock: Math.random() > 0.25,
              currency: 'USD',
            }
          })
          totalPrices++
        }
      }
    }
    console.log(`   ✅ Created gun safe products\n`)

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
