import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Helper to generate realistic price variations
function generatePriceHistory(basePrice: number, days: number = 90): Array<{ date: Date, price: number }> {
  const history: Array<{ date: Date, price: number }> = []
  const now = new Date()

  let currentPrice = basePrice

  // Generate price points going backwards in time
  for (let i = days; i >= 0; i -= 3) { // Every 3 days
    const date = new Date(now)
    date.setDate(date.getDate() - i)

    // Random walk with some trends
    const changePercent = (Math.random() - 0.48) * 0.08 // Slightly upward bias
    currentPrice = currentPrice * (1 + changePercent)

    // Occasional sales (10% chance)
    if (Math.random() < 0.1) {
      currentPrice = currentPrice * 0.85 // 15% off sale
    }

    // Keep within reasonable bounds (±25% of base)
    currentPrice = Math.max(basePrice * 0.75, Math.min(basePrice * 1.25, currentPrice))

    history.push({
      date,
      price: Math.round(currentPrice * 100) / 100 // Round to 2 decimals
    })
  }

  return history
}

// Helper to add some recent price drops for alert testing
function addRecentPriceDrop(history: Array<{ date: Date, price: number }>) {
  if (history.length > 5) {
    // Drop the last few prices by 10-20%
    for (let i = history.length - 3; i < history.length; i++) {
      history[i].price = Math.round(history[i].price * 0.85 * 100) / 100
    }
  }
  return history
}

async function seedPriceHistory() {
  console.log('📊 Starting price history seed...')
  console.log('⏳ This may take a few minutes...\n')

  try {
    // Get all products with their current prices
    const products = await prisma.product.findMany({
      include: {
        prices: {
          include: {
            retailer: true
          }
        }
      }
    })

    console.log(`Found ${products.length} products to seed price history for...`)

    // First, delete existing price records to start fresh
    console.log('🗑️  Clearing existing price data...')
    await prisma.price.deleteMany({})

    let totalPricesCreated = 0
    let productsProcessed = 0

    // For each product
    for (const product of products) {
      if (product.prices.length === 0) continue

      // Get unique retailers for this product
      const retailerPrices = new Map<string, number>()
      for (const price of product.prices) {
        if (!retailerPrices.has(price.retailerId)) {
          retailerPrices.set(price.retailerId, Number(price.price))
        }
      }

      // Generate history for each retailer
      for (const [retailerId, basePrice] of retailerPrices.entries()) {
        // Decide if this should have a recent price drop (25% chance)
        const hasPriceDrop = Math.random() < 0.25

        let priceHistory = generatePriceHistory(basePrice, 90)

        if (hasPriceDrop) {
          priceHistory = addRecentPriceDrop(priceHistory)
        }

        // Create price records
        for (const pricePoint of priceHistory) {
          await prisma.price.create({
            data: {
              productId: product.id,
              retailerId: retailerId,
              price: pricePoint.price,
              url: `https://example.com/products/${product.id}`,
              inStock: Math.random() > 0.05, // 95% in stock
              currency: 'USD',
              createdAt: pricePoint.date
            }
          })
          totalPricesCreated++
        }
      }

      productsProcessed++

      // Progress indicator
      if (productsProcessed % 5 === 0) {
        console.log(`   Processed ${productsProcessed}/${products.length} products (${totalPricesCreated} prices)...`)
      }
    }

    console.log(`\n✅ Created ${totalPricesCreated} historical price records`)

    // Get statistics
    const stats = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT "productId") as count FROM prices
    `
    const productsWithPrices = Number(stats[0].count)

    const avgPricesPerProduct = await prisma.$queryRaw<Array<{ avg: string }>>`
      SELECT AVG(price_count) as avg FROM (
        SELECT COUNT(*) as price_count
        FROM prices
        GROUP BY "productId", "retailerId"
      ) AS counts
    `
    const avgPrices = Math.round(Number(avgPricesPerProduct[0].avg))

    console.log('\n📊 Statistics:')
    console.log(`   Products with prices: ${productsWithPrices}`)
    console.log(`   Total price records: ${totalPricesCreated}`)
    console.log(`   Average prices per product/retailer: ${avgPrices}`)
    console.log(`   Date range: 90 days (${new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toLocaleDateString()} - ${new Date().toLocaleDateString()})`)

    // Find products with recent price drops
    const recentDrops = await prisma.$queryRaw<Array<{
      product_name: string
      retailer_name: string
      old_price: number
      new_price: number
      drop_percent: number
    }>>`
      WITH latest_prices AS (
        SELECT
          p."productId",
          p."retailerId",
          p.price,
          p."createdAt",
          LAG(p.price) OVER (PARTITION BY p."productId", p."retailerId" ORDER BY p."createdAt") as prev_price
        FROM prices p
      ),
      price_changes AS (
        SELECT
          prod.name as product_name,
          r.name as retailer_name,
          lp.prev_price as old_price,
          lp.price as new_price,
          ((lp.prev_price - lp.price) / lp.prev_price * 100) as drop_percent
        FROM latest_prices lp
        JOIN products prod ON lp."productId" = prod.id
        JOIN retailers r ON lp."retailerId" = r.id
        WHERE lp.prev_price IS NOT NULL
          AND lp.price < lp.prev_price
          AND ((lp.prev_price - lp.price) / lp.prev_price * 100) > 10
          AND lp."createdAt" > NOW() - INTERVAL '7 days'
      )
      SELECT * FROM price_changes
      ORDER BY drop_percent DESC
      LIMIT 10
    `

    if (recentDrops.length > 0) {
      console.log('\n🔔 Recent Price Drops (for testing alerts):')
      recentDrops.forEach(drop => {
        console.log(`   ${drop.product_name}`)
        console.log(`   → ${drop.retailer_name}: $${Number(drop.old_price).toFixed(2)} → $${Number(drop.new_price).toFixed(2)} (-${Number(drop.drop_percent).toFixed(1)}%)`)
      })
    }

    console.log('\n🎉 Price history seed completed successfully!')

  } catch (error) {
    console.error('❌ Error seeding price history:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

seedPriceHistory()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
