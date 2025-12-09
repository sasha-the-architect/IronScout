/**
 * Dealer Portal Test Data Seed
 * 
 * This seed creates comprehensive test data for the dealer portal to test:
 * - Authentication (dealers with various statuses/tiers)
 * - Feed management (feeds with different types/statuses)
 * - Feed runs (with various outcomes)
 * - SKU management (with different mapping states)
 * - Canonical SKUs (master product catalog)
 * - Pricing insights (all insight types)
 * - Analytics (click events, pixel events)
 * - Benchmarks (market pricing data)
 * - Admin features (pending approvals, suspensions)
 * - Notification preferences
 * 
 * Run with: npx ts-node seed-dealer-portal-test.ts
 */

import { PrismaClient, Prisma } from '@prisma/client'

const prisma = new PrismaClient()

// =============================================
// TEST PASSWORDS (pre-computed bcrypt hashes)
// These are actual valid bcrypt hashes that will work with bcrypt.compare()
// =============================================
// password123 -> this hash
const DEALER_PASSWORD_HASH = '$2a$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW'
// admin123 -> this hash  
const ADMIN_PASSWORD_HASH = '$2a$10$TkIhkAq.yXpPsU8zvJHXr.Uy8VqXrMVLzLf8rSCp5ye8sYBvKBKWK'

// =============================================
// CANONICAL SKU DATA (Master Product Catalog)
// =============================================
const canonicalSkus = [
  // 9mm
  { caliber: '9mm Luger', grain: 115, brand: 'Federal', packSize: 50, caseType: 'Brass', bulletType: 'FMJ', name: 'Federal American Eagle 9mm 115gr FMJ', upc: '029465088446' },
  { caliber: '9mm Luger', grain: 124, brand: 'Speer', packSize: 50, caseType: 'Brass', bulletType: 'JHP', name: 'Speer Gold Dot 9mm 124gr +P JHP', upc: '076683535443' },
  { caliber: '9mm Luger', grain: 147, brand: 'Federal', packSize: 50, caseType: 'Brass', bulletType: 'JHP', name: 'Federal HST 9mm 147gr JHP', upc: '029465094560' },
  { caliber: '9mm Luger', grain: 115, brand: 'Winchester', packSize: 100, caseType: 'Brass', bulletType: 'FMJ', name: 'Winchester USA 9mm 115gr FMJ Value Pack', upc: '020892213456' },
  { caliber: '9mm Luger', grain: 115, brand: 'Blazer Brass', packSize: 50, caseType: 'Brass', bulletType: 'FMJ', name: 'Blazer Brass 9mm 115gr FMJ', upc: '076683052018' },
  
  // 5.56 / .223
  { caliber: '5.56 NATO', grain: 55, brand: 'Federal', packSize: 20, caseType: 'Brass', bulletType: 'FMJ', name: 'Federal American Eagle 5.56 55gr FMJ', upc: '029465088156' },
  { caliber: '5.56 NATO', grain: 62, brand: 'Winchester', packSize: 20, caseType: 'Brass', bulletType: 'FMJ', name: 'Winchester M855 5.56 62gr Green Tip', upc: '020892223349' },
  { caliber: '.223 Remington', grain: 55, brand: 'Hornady', packSize: 20, caseType: 'Brass', bulletType: 'V-MAX', name: 'Hornady Varmint Express .223 55gr V-MAX', upc: '090255380293' },
  { caliber: '5.56 NATO', grain: 77, brand: 'Black Hills', packSize: 50, caseType: 'Brass', bulletType: 'OTM', name: 'Black Hills 5.56 77gr OTM MK262', upc: '612710771123' },
  
  // .45 ACP
  { caliber: '.45 ACP', grain: 230, brand: 'Federal', packSize: 50, caseType: 'Brass', bulletType: 'FMJ', name: 'Federal American Eagle .45 ACP 230gr FMJ', upc: '029465088729' },
  { caliber: '.45 ACP', grain: 230, brand: 'Speer', packSize: 50, caseType: 'Brass', bulletType: 'JHP', name: 'Speer Gold Dot .45 ACP 230gr JHP', upc: '076683536129' },
  { caliber: '.45 ACP', grain: 185, brand: 'Hornady', packSize: 20, caseType: 'Brass', bulletType: 'XTP', name: 'Hornady Critical Defense .45 ACP 185gr FTX', upc: '090255900354' },
  
  // .308 / 7.62
  { caliber: '.308 Winchester', grain: 150, brand: 'Federal', packSize: 20, caseType: 'Brass', bulletType: 'SP', name: 'Federal Power-Shok .308 150gr SP', upc: '029465084714' },
  { caliber: '.308 Winchester', grain: 168, brand: 'Hornady', packSize: 20, caseType: 'Brass', bulletType: 'BTHP', name: 'Hornady Match .308 168gr BTHP', upc: '090255380903' },
  { caliber: '7.62x39', grain: 123, brand: 'Wolf', packSize: 20, caseType: 'Steel', bulletType: 'FMJ', name: 'Wolf Performance 7.62x39 123gr FMJ', upc: '645611300301' },
  
  // .22 LR
  { caliber: '.22 LR', grain: 40, brand: 'CCI', packSize: 100, caseType: 'Brass', bulletType: 'LRN', name: 'CCI Mini-Mag .22 LR 40gr CPRN', upc: '076683000309' },
  { caliber: '.22 LR', grain: 36, brand: 'Federal', packSize: 525, caseType: 'Brass', bulletType: 'HP', name: 'Federal AutoMatch .22 LR 40gr LRN', upc: '029465057770' },
  
  // 12 Gauge
  { caliber: '12 Gauge', grain: 0, brand: 'Federal', packSize: 25, caseType: 'Plastic', bulletType: 'BUCKSHOT', name: 'Federal Power-Shok 12ga 00 Buck', upc: '029465009885' },
  { caliber: '12 Gauge', grain: 0, brand: 'Winchester', packSize: 5, caseType: 'Plastic', bulletType: 'SLUG', name: 'Winchester Super-X 12ga 1oz Rifled Slug', upc: '020892000322' },
  
  // 300 Blackout
  { caliber: '300 AAC Blackout', grain: 125, brand: 'Hornady', packSize: 20, caseType: 'Brass', bulletType: 'HP', name: 'Hornady BLACK 300 BLK 125gr HP', upc: '090255808407' },
  { caliber: '300 AAC Blackout', grain: 220, brand: 'Hornady', packSize: 20, caseType: 'Brass', bulletType: 'SUB-X', name: 'Hornady Subsonic 300 BLK 190gr Sub-X', upc: '090255808452' },
]

// =============================================
// DEALER TEST DATA
// =============================================
const dealers = [
  // Active dealers with full data
  {
    email: 'active@ammodeals.com',
    businessName: 'Ammo Deals Direct',
    contactName: 'John Smith',
    websiteUrl: 'https://ammodeals.com',
    phone: '555-0101',
    storeType: 'ONLINE_ONLY' as const,
    status: 'ACTIVE' as const,
    tier: 'FOUNDING' as const,
    emailVerified: true,
    pixelEnabled: true,
    shippingType: 'FLAT' as const,
    shippingFlat: 9.99,
    feedType: 'URL' as const,
    feedStatus: 'HEALTHY' as const,
    skuCount: 150,
    hasAnalytics: true,
    hasInsights: true,
  },
  {
    email: 'premium@bulletbarn.com',
    businessName: 'Bullet Barn',
    contactName: 'Sarah Johnson',
    websiteUrl: 'https://bulletbarn.com',
    phone: '555-0102',
    storeType: 'RETAIL_AND_ONLINE' as const,
    status: 'ACTIVE' as const,
    tier: 'PRO' as const,
    emailVerified: true,
    pixelEnabled: true,
    shippingType: 'PER_UNIT' as const,
    shippingPerUnit: 0.05,
    feedType: 'AUTH_URL' as const,
    feedStatus: 'HEALTHY' as const,
    skuCount: 250,
    hasAnalytics: true,
    hasInsights: true,
  },
  {
    email: 'basic@gunsupply.com',
    businessName: 'Gun Supply Co',
    contactName: 'Mike Wilson',
    websiteUrl: 'https://gunsupply.com',
    phone: '555-0103',
    storeType: 'ONLINE_ONLY' as const,
    status: 'ACTIVE' as const,
    tier: 'BASIC' as const,
    emailVerified: true,
    pixelEnabled: false,
    shippingType: 'CALCULATED' as const,
    feedType: 'FTP' as const,
    feedStatus: 'WARNING' as const,
    skuCount: 80,
    hasAnalytics: false,
    hasInsights: true,
  },
  
  // Pending approval dealers
  {
    email: 'pending1@newdealer.com',
    businessName: 'New Ammo Shop',
    contactName: 'Bob Anderson',
    websiteUrl: 'https://newammoshop.com',
    phone: '555-0201',
    storeType: 'ONLINE_ONLY' as const,
    status: 'PENDING' as const,
    tier: 'FOUNDING' as const,
    emailVerified: true,
    pixelEnabled: false,
    shippingType: 'UNKNOWN' as const,
    feedType: null,
    feedStatus: null,
    skuCount: 0,
    hasAnalytics: false,
    hasInsights: false,
  },
  {
    email: 'pending2@freshstart.com',
    businessName: 'Fresh Start Firearms',
    contactName: 'Lisa Chen',
    websiteUrl: 'https://freshstartfirearms.com',
    phone: '555-0202',
    storeType: 'RETAIL_AND_ONLINE' as const,
    status: 'PENDING' as const,
    tier: 'FOUNDING' as const,
    emailVerified: false, // Still needs to verify email
    pixelEnabled: false,
    shippingType: 'UNKNOWN' as const,
    feedType: null,
    feedStatus: null,
    skuCount: 0,
    hasAnalytics: false,
    hasInsights: false,
  },
  
  // Suspended dealer
  {
    email: 'suspended@badactor.com',
    businessName: 'Sketchy Ammo LLC',
    contactName: 'Rick Problems',
    websiteUrl: 'https://sketchyammo.com',
    phone: '555-0301',
    storeType: 'ONLINE_ONLY' as const,
    status: 'SUSPENDED' as const,
    tier: 'BASIC' as const,
    emailVerified: true,
    pixelEnabled: false,
    shippingType: 'FREE' as const,
    feedType: 'URL' as const,
    feedStatus: 'FAILED' as const,
    skuCount: 25,
    hasAnalytics: false,
    hasInsights: false,
  },
  
  // Dealer with failed feed
  {
    email: 'feedissues@rangegear.com',
    businessName: 'Range Gear Outlet',
    contactName: 'Tom Davis',
    websiteUrl: 'https://rangegear.com',
    phone: '555-0401',
    storeType: 'ONLINE_ONLY' as const,
    status: 'ACTIVE' as const,
    tier: 'FOUNDING' as const,
    emailVerified: true,
    pixelEnabled: true,
    shippingType: 'FLAT' as const,
    shippingFlat: 12.99,
    feedType: 'SFTP' as const,
    feedStatus: 'FAILED' as const,
    skuCount: 45,
    hasAnalytics: true,
    hasInsights: false,
  },
  
  // Enterprise tier dealer
  {
    email: 'enterprise@bigammo.com',
    businessName: 'Big Ammo Warehouse',
    contactName: 'Corporate Contact',
    websiteUrl: 'https://bigammo.com',
    phone: '555-0501',
    storeType: 'RETAIL_AND_ONLINE' as const,
    status: 'ACTIVE' as const,
    tier: 'ENTERPRISE' as const,
    emailVerified: true,
    pixelEnabled: true,
    shippingType: 'FREE' as const,
    feedType: 'AUTH_URL' as const,
    feedStatus: 'HEALTHY' as const,
    skuCount: 500,
    hasAnalytics: true,
    hasInsights: true,
  },
]

// =============================================
// ADMIN USER DATA
// =============================================
const adminUser = {
  email: 'admin@ironscout.ai',
  name: 'IronScout Admin',
  password: ADMIN_PASSWORD_HASH,
}

// =============================================
// HELPER FUNCTIONS
// =============================================
function randomPrice(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomDate(daysBack: number): Date {
  const date = new Date()
  date.setDate(date.getDate() - Math.floor(Math.random() * daysBack))
  return date
}

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function generatePixelApiKey(): string {
  return `px_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`
}

// =============================================
// MAIN SEED FUNCTION
// =============================================
async function seedDealerPortalTest() {
  console.log('🚀 Starting Dealer Portal Test Data Seed...\n')

  try {
    // =============================================
    // 1. CLEAR EXISTING DEALER DATA
    // =============================================
    console.log('🗑️  Clearing existing dealer portal data...')
    
    await prisma.clickEvent.deleteMany({})
    await prisma.pixelEvent.deleteMany({})
    await prisma.dealerInsight.deleteMany({})
    await prisma.pricingSnapshot.deleteMany({})
    await prisma.benchmark.deleteMany({})
    await prisma.dealerSku.deleteMany({})
    await prisma.dealerFeedRun.deleteMany({})
    await prisma.dealerFeed.deleteMany({})
    await prisma.dealerNotificationPref.deleteMany({})
    await prisma.adminAuditLog.deleteMany({})
    await prisma.dealer.deleteMany({})
    await prisma.canonicalSku.deleteMany({})
    
    console.log('✅ Cleared existing data\n')

    // =============================================
    // 2. CREATE ADMIN USER (if not exists)
    // =============================================
    console.log('👤 Creating admin user...')
    
    const admin = await prisma.user.upsert({
      where: { email: adminUser.email },
      update: {},
      create: {
        email: adminUser.email,
        name: adminUser.name,
        password: adminUser.password,
        emailVerified: new Date(),
        tier: 'PREMIUM',
      },
    })
    
    console.log(`✅ Admin user ready: ${admin.email}\n`)

    // =============================================
    // 3. CREATE CANONICAL SKUS
    // =============================================
    console.log('📦 Creating canonical SKUs...')
    
    const createdCanonicalSkus = await Promise.all(
      canonicalSkus.map(sku => 
        prisma.canonicalSku.create({
          data: {
            upc: sku.upc,
            caliber: sku.caliber,
            grain: sku.grain,
            caseType: sku.caseType,
            bulletType: sku.bulletType,
            brand: sku.brand,
            packSize: sku.packSize,
            name: sku.name,
          },
        })
      )
    )
    
    console.log(`✅ Created ${createdCanonicalSkus.length} canonical SKUs\n`)

    // =============================================
    // 4. CREATE BENCHMARKS FOR CANONICAL SKUS
    // =============================================
    console.log('📊 Creating benchmarks...')
    
    const benchmarks = await Promise.all(
      createdCanonicalSkus.map(sku => {
        const basePrice = randomPrice(15, 45)
        const minPrice = basePrice * 0.85
        const maxPrice = basePrice * 1.25
        
        return prisma.benchmark.create({
          data: {
            canonicalSkuId: sku.id,
            medianPrice: basePrice,
            minPrice: minPrice,
            maxPrice: maxPrice,
            avgPrice: basePrice * 1.02,
            sellerCount: randomInt(3, 15),
            source: 'INTERNAL',
            confidence: randomElement(['HIGH', 'MEDIUM', 'NONE']),
            dataPoints: randomInt(10, 100),
          },
        })
      })
    )
    
    console.log(`✅ Created ${benchmarks.length} benchmarks\n`)

    // =============================================
    // 5. CREATE DEALERS WITH ALL RELATED DATA
    // =============================================
    console.log('🏪 Creating dealers and related data...\n')
    
    for (const dealerData of dealers) {
      console.log(`  Creating dealer: ${dealerData.businessName}...`)
      
      // Create dealer
      const dealer = await prisma.dealer.create({
        data: {
          email: dealerData.email,
          passwordHash: DEALER_PASSWORD_HASH,
          emailVerified: dealerData.emailVerified,
          verifyToken: dealerData.emailVerified ? null : `verify_${Math.random().toString(36).substring(7)}`,
          businessName: dealerData.businessName,
          contactName: dealerData.contactName,
          websiteUrl: dealerData.websiteUrl,
          phone: dealerData.phone,
          storeType: dealerData.storeType,
          status: dealerData.status,
          tier: dealerData.tier,
          pixelApiKey: dealerData.pixelEnabled ? generatePixelApiKey() : null,
          pixelEnabled: dealerData.pixelEnabled,
          shippingType: dealerData.shippingType,
          shippingFlat: dealerData.shippingFlat ? new Prisma.Decimal(dealerData.shippingFlat) : null,
          shippingPerUnit: dealerData.shippingPerUnit ? new Prisma.Decimal(dealerData.shippingPerUnit) : null,
        },
      })

      // Create notification preferences
      await prisma.dealerNotificationPref.create({
        data: {
          dealerId: dealer.id,
          fatalFeedErrors: true,
          nonFatalFeedIssues: dealerData.tier !== 'BASIC',
          successfulUpdates: dealerData.tier === 'ENTERPRISE',
          weeklyPulse: true,
          insightAlerts: true,
        },
      })

      // Create feed if dealer has one
      let feed = null
      if (dealerData.feedType) {
        feed = await prisma.dealerFeed.create({
          data: {
            dealerId: dealer.id,
            name: `${dealerData.businessName} Product Feed`,
            feedType: dealerData.feedType,
            url: dealerData.feedType === 'URL' || dealerData.feedType === 'AUTH_URL' 
              ? `https://${dealerData.websiteUrl.replace('https://', '')}/feed/products.csv`
              : `ftp://${dealerData.websiteUrl.replace('https://', '')}/exports/`,
            username: dealerData.feedType !== 'URL' ? 'feeduser' : null,
            password: dealerData.feedType !== 'URL' ? 'encrypted_password' : null,
            scheduleMinutes: dealerData.tier === 'ENTERPRISE' ? 30 : 60,
            status: dealerData.feedStatus!,
            lastSuccessAt: dealerData.feedStatus === 'HEALTHY' ? randomDate(2) : null,
            lastFailureAt: dealerData.feedStatus === 'FAILED' ? randomDate(1) : null,
            lastError: dealerData.feedStatus === 'FAILED' ? 'Connection timeout after 30s' : null,
          },
        })

        // Create feed runs
        const runStatuses = dealerData.feedStatus === 'HEALTHY' 
          ? ['SUCCESS', 'SUCCESS', 'SUCCESS', 'WARNING', 'SUCCESS']
          : dealerData.feedStatus === 'WARNING'
          ? ['SUCCESS', 'WARNING', 'WARNING', 'SUCCESS', 'WARNING']
          : ['FAILURE', 'FAILURE', 'SUCCESS', 'FAILURE', 'FAILURE']

        for (let i = 0; i < runStatuses.length; i++) {
          const runDate = new Date()
          runDate.setHours(runDate.getHours() - (i * 4))
          
          await prisma.dealerFeedRun.create({
            data: {
              dealerId: dealer.id,
              feedId: feed.id,
              status: runStatuses[i] as 'RUNNING' | 'SUCCESS' | 'WARNING' | 'FAILURE',
              rowCount: dealerData.skuCount + randomInt(-10, 10),
              processedCount: runStatuses[i] !== 'FAILURE' ? dealerData.skuCount : randomInt(0, 20),
              matchedCount: runStatuses[i] !== 'FAILURE' ? Math.floor(dealerData.skuCount * 0.7) : 0,
              failedCount: runStatuses[i] === 'FAILURE' ? randomInt(10, 50) : randomInt(0, 5),
              duration: runStatuses[i] !== 'FAILURE' ? randomInt(5000, 30000) : randomInt(30000, 60000),
              startedAt: runDate,
              completedAt: new Date(runDate.getTime() + randomInt(5000, 60000)),
              errors: runStatuses[i] === 'FAILURE' 
                ? [{ code: 'CONN_TIMEOUT', message: 'Connection timeout' }]
                : runStatuses[i] === 'WARNING'
                ? [{ code: 'PARSE_WARN', message: '3 rows had missing UPC' }]
                : null,
            },
          })
        }
      }

      // Create dealer SKUs
      if (dealerData.skuCount > 0 && feed) {
        const skusToCreate = Math.min(dealerData.skuCount, 50) // Limit for test data
        
        for (let i = 0; i < skusToCreate; i++) {
          const canonicalSku = i < createdCanonicalSkus.length 
            ? createdCanonicalSkus[i] 
            : null
          
          const isMapped = canonicalSku && Math.random() > 0.3
          const confidence = isMapped 
            ? randomElement(['HIGH', 'MEDIUM', 'LOW']) as 'HIGH' | 'MEDIUM' | 'LOW'
            : 'NONE' as const
          
          const basePrice = canonicalSku 
            ? Number(benchmarks.find(b => b.canonicalSkuId === canonicalSku.id)?.medianPrice || 25)
            : randomPrice(15, 50)
          
          // Add price variation
          const priceVariation = (Math.random() - 0.5) * 0.4 // ±20%
          const dealerPrice = basePrice * (1 + priceVariation)

          await prisma.dealerSku.create({
            data: {
              dealerId: dealer.id,
              feedId: feed.id,
              rawTitle: canonicalSku?.name || `Test Ammo Product ${i + 1}`,
              rawDescription: canonicalSku 
                ? `High quality ${canonicalSku.caliber} ammunition from ${canonicalSku.brand}`
                : 'Test product description',
              rawPrice: new Prisma.Decimal(dealerPrice.toFixed(2)),
              rawUpc: canonicalSku?.upc || (Math.random() > 0.5 ? `TEST${String(i).padStart(10, '0')}` : null),
              rawSku: `SKU-${dealer.businessName.substring(0, 3).toUpperCase()}-${String(i + 1).padStart(4, '0')}`,
              rawCaliber: canonicalSku?.caliber || randomElement(['9mm', '5.56', '.45', '.22']),
              rawGrain: canonicalSku?.grain?.toString() || randomElement(['115', '124', '147', '55', '62']),
              rawCase: canonicalSku?.caseType || 'Brass',
              rawBulletType: canonicalSku?.bulletType || 'FMJ',
              rawBrand: canonicalSku?.brand || randomElement(['Federal', 'Winchester', 'Hornady']),
              rawPackSize: canonicalSku?.packSize || randomElement([20, 50, 100]),
              rawInStock: Math.random() > 0.15,
              rawUrl: `${dealerData.websiteUrl}/products/${canonicalSku?.upc || `test-${i}`}`,
              rawImageUrl: `${dealerData.websiteUrl}/images/products/${canonicalSku?.upc || `test-${i}`}.jpg`,
              canonicalSkuId: isMapped ? canonicalSku!.id : null,
              mappingConfidence: confidence,
              needsReview: confidence === 'LOW' || (!isMapped && Math.random() > 0.5),
              mappedAt: isMapped ? randomDate(30) : null,
              mappedBy: isMapped ? 'auto' : null,
              parsedCaliber: canonicalSku?.caliber,
              parsedGrain: canonicalSku?.grain,
              parsedPackSize: canonicalSku?.packSize,
              parsedBulletType: canonicalSku?.bulletType,
              parsedBrand: canonicalSku?.brand,
              parseConfidence: isMapped ? new Prisma.Decimal(0.85 + Math.random() * 0.15) : null,
              dealerSkuHash: `${dealer.id}-${canonicalSku?.upc || `test-${i}`}`,
              isActive: true,
            },
          })
        }
      }

      // Create insights
      if (dealerData.hasInsights && dealerData.skuCount > 0) {
        const dealerSkus = await prisma.dealerSku.findMany({
          where: { dealerId: dealer.id, canonicalSkuId: { not: null } },
          take: 10,
        })

        const insightTypes = ['OVERPRICED', 'UNDERPRICED', 'STOCK_OPPORTUNITY', 'ATTRIBUTE_GAP'] as const
        
        for (let i = 0; i < Math.min(dealerSkus.length, 8); i++) {
          const sku = dealerSkus[i]
          const type = insightTypes[i % insightTypes.length]
          const benchmark = benchmarks.find(b => b.canonicalSkuId === sku.canonicalSkuId)
          
          if (!benchmark) continue
          
          const dealerPrice = Number(sku.rawPrice)
          const marketMedian = Number(benchmark.medianPrice)
          const priceDelta = dealerPrice - marketMedian
          const deltaPercent = (priceDelta / marketMedian) * 100

          await prisma.dealerInsight.create({
            data: {
              dealerId: dealer.id,
              dealerSkuId: sku.id,
              canonicalSkuId: sku.canonicalSkuId,
              type,
              confidence: Math.abs(deltaPercent) > 15 ? 'HIGH' : 'MEDIUM',
              title: type === 'OVERPRICED' 
                ? `${sku.rawTitle} is priced above market`
                : type === 'UNDERPRICED'
                ? `${sku.rawTitle} has room for price increase`
                : type === 'STOCK_OPPORTUNITY'
                ? `High demand detected for ${sku.rawTitle}`
                : `Missing attributes for ${sku.rawTitle}`,
              message: type === 'OVERPRICED'
                ? `Your price of $${dealerPrice.toFixed(2)} is ${Math.abs(deltaPercent).toFixed(1)}% above the market median of $${marketMedian.toFixed(2)}. Consider adjusting to stay competitive.`
                : type === 'UNDERPRICED'
                ? `Your price of $${dealerPrice.toFixed(2)} is ${Math.abs(deltaPercent).toFixed(1)}% below the market median of $${marketMedian.toFixed(2)}. You may have room to increase margins.`
                : type === 'STOCK_OPPORTUNITY'
                ? `This product is out of stock at ${randomInt(3, 8)} other dealers. Restocking could capture additional sales.`
                : `This product is missing UPC and grain weight data, preventing accurate benchmark comparisons.`,
              dealerPrice: new Prisma.Decimal(dealerPrice),
              marketMedian: new Prisma.Decimal(marketMedian),
              marketMin: benchmark.minPrice,
              marketMax: benchmark.maxPrice,
              sellerCount: benchmark.sellerCount,
              priceDelta: new Prisma.Decimal(priceDelta),
              deltaPercent: new Prisma.Decimal(deltaPercent),
              isActive: true,
              dismissedAt: null,
              dismissedUntil: null,
            },
          })
        }
      }

      // Create analytics data (click events and pixel events)
      if (dealerData.hasAnalytics) {
        const dealerSkus = await prisma.dealerSku.findMany({
          where: { dealerId: dealer.id },
          take: 20,
        })

        // Create click events (last 30 days)
        for (let day = 0; day < 30; day++) {
          const clicksPerDay = randomInt(5, 50)
          
          for (let c = 0; c < clicksPerDay; c++) {
            const clickDate = new Date()
            clickDate.setDate(clickDate.getDate() - day)
            clickDate.setHours(randomInt(0, 23), randomInt(0, 59), randomInt(0, 59))
            
            const sku = dealerSkus.length > 0 ? randomElement(dealerSkus) : null

            await prisma.clickEvent.create({
              data: {
                dealerId: dealer.id,
                dealerSkuId: sku?.id,
                canonicalSkuId: sku?.canonicalSkuId,
                sessionId: `session_${Math.random().toString(36).substring(7)}`,
                userAgent: randomElement([
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
                ]),
                ipHash: `hash_${Math.random().toString(36).substring(7)}`,
                referrer: randomElement(['https://google.com', 'https://ironscout.ai', null, null]),
                createdAt: clickDate,
              },
            })
          }
        }

        // Create pixel events (conversions) - only if pixel is enabled
        if (dealerData.pixelEnabled) {
          for (let day = 0; day < 30; day++) {
            const ordersPerDay = randomInt(0, 5)
            
            for (let o = 0; o < ordersPerDay; o++) {
              const orderDate = new Date()
              orderDate.setDate(orderDate.getDate() - day)
              orderDate.setHours(randomInt(0, 23), randomInt(0, 59), randomInt(0, 59))

              await prisma.pixelEvent.create({
                data: {
                  dealerId: dealer.id,
                  orderId: `ORDER-${Date.now()}-${randomInt(1000, 9999)}`,
                  orderValue: new Prisma.Decimal(randomPrice(50, 500)),
                  orderCurrency: 'USD',
                  skuList: dealerSkus.slice(0, randomInt(1, 4)).map(sku => ({
                    sku: sku.rawSku,
                    qty: randomInt(1, 5),
                    price: Number(sku.rawPrice),
                  })),
                  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                  ipHash: `hash_${Math.random().toString(36).substring(7)}`,
                  referrer: 'https://ironscout.ai/search',
                  createdAt: orderDate,
                },
              })
            }
          }
        }
      }

      console.log(`  ✅ Created dealer: ${dealerData.businessName}`)
    }

    // =============================================
    // 6. CREATE ADMIN AUDIT LOGS
    // =============================================
    console.log('\n📝 Creating admin audit logs...')
    
    const activeDealer = await prisma.dealer.findFirst({ where: { status: 'ACTIVE' } })
    const suspendedDealer = await prisma.dealer.findFirst({ where: { status: 'SUSPENDED' } })
    
    if (activeDealer && suspendedDealer) {
      await prisma.adminAuditLog.createMany({
        data: [
          {
            adminUserId: admin.id,
            dealerId: activeDealer.id,
            action: 'approve',
            resource: 'dealer',
            resourceId: activeDealer.id,
            oldValue: { status: 'PENDING' },
            newValue: { status: 'ACTIVE' },
            ipAddress: '192.168.1.1',
            createdAt: randomDate(10),
          },
          {
            adminUserId: admin.id,
            dealerId: suspendedDealer.id,
            action: 'suspend',
            resource: 'dealer',
            resourceId: suspendedDealer.id,
            oldValue: { status: 'ACTIVE' },
            newValue: { status: 'SUSPENDED' },
            ipAddress: '192.168.1.1',
            createdAt: randomDate(5),
          },
        ],
      })
    }
    
    console.log('✅ Created admin audit logs\n')

    // =============================================
    // SUMMARY
    // =============================================
    const summary = await Promise.all([
      prisma.dealer.count(),
      prisma.dealerFeed.count(),
      prisma.dealerFeedRun.count(),
      prisma.dealerSku.count(),
      prisma.canonicalSku.count(),
      prisma.benchmark.count(),
      prisma.dealerInsight.count(),
      prisma.clickEvent.count(),
      prisma.pixelEvent.count(),
      prisma.dealerNotificationPref.count(),
      prisma.adminAuditLog.count(),
    ])

    console.log('═══════════════════════════════════════════════════')
    console.log('🎉 DEALER PORTAL TEST DATA SEED COMPLETED!')
    console.log('═══════════════════════════════════════════════════\n')
    console.log('📊 Summary:')
    console.log(`   Dealers:              ${summary[0]}`)
    console.log(`   Dealer Feeds:         ${summary[1]}`)
    console.log(`   Feed Runs:            ${summary[2]}`)
    console.log(`   Dealer SKUs:          ${summary[3]}`)
    console.log(`   Canonical SKUs:       ${summary[4]}`)
    console.log(`   Benchmarks:           ${summary[5]}`)
    console.log(`   Insights:             ${summary[6]}`)
    console.log(`   Click Events:         ${summary[7]}`)
    console.log(`   Pixel Events:         ${summary[8]}`)
    console.log(`   Notification Prefs:   ${summary[9]}`)
    console.log(`   Audit Logs:           ${summary[10]}`)
    console.log('')
    console.log('═══════════════════════════════════════════════════')
    console.log('🔑 TEST CREDENTIALS:')
    console.log('═══════════════════════════════════════════════════')
    console.log('')
    console.log('ADMIN:')
    console.log(`   Email:    ${adminUser.email}`)
    console.log('   Password: admin123')
    console.log('')
    console.log('DEALERS (all use password: password123):')
    dealers.forEach(d => {
      console.log(`   ${d.status.padEnd(10)} | ${d.tier.padEnd(10)} | ${d.email}`)
    })
    console.log('')
    console.log('═══════════════════════════════════════════════════\n')

  } catch (error) {
    console.error('❌ Error seeding dealer portal test data:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Run seed
seedDealerPortalTest()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
