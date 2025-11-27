import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Starting database seed...')

  // Clear existing data
  await prisma.price.deleteMany()
  await prisma.product.deleteMany()
  await prisma.retailer.deleteMany()
  console.log('Cleared existing data')

  // Create retailers
  const retailers = await Promise.all([
    // Premium retailers
    prisma.retailer.create({
      data: {
        name: 'Premium Electronics Plus',
        website: 'https://premiumelectronics.example.com',
        logoUrl: 'https://images.unsplash.com/photo-1520975916090-3105956dac38?w=100&h=50&fit=crop',
        tier: 'PREMIUM',
      },
    }),
    prisma.retailer.create({
      data: {
        name: 'Elite Tech Store',
        website: 'https://elitetech.example.com',
        logoUrl: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=100&h=50&fit=crop',
        tier: 'PREMIUM',
      },
    }),
    prisma.retailer.create({
      data: {
        name: 'Premium Home & Living',
        website: 'https://premiumhome.example.com',
        logoUrl: 'https://images.unsplash.com/photo-1560393464-5c69a73c5770?w=100&h=50&fit=crop',
        tier: 'PREMIUM',
      },
    }),
    // Standard retailers
    prisma.retailer.create({
      data: {
        name: 'Budget Electronics',
        website: 'https://budgetelectronics.example.com',
        logoUrl: 'https://images.unsplash.com/photo-1567581935884-3349723552ca?w=100&h=50&fit=crop',
        tier: 'STANDARD',
      },
    }),
    prisma.retailer.create({
      data: {
        name: 'Value Tech Mart',
        website: 'https://valuetechmart.example.com',
        logoUrl: 'https://images.unsplash.com/photo-1580828343064-fde4fc206bc6?w=100&h=50&fit=crop',
        tier: 'STANDARD',
      },
    }),
    prisma.retailer.create({
      data: {
        name: 'Everyday Essentials',
        website: 'https://everydayessentials.example.com',
        logoUrl: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=100&h=50&fit=crop',
        tier: 'STANDARD',
      },
    }),
    prisma.retailer.create({
      data: {
        name: 'Sports Gear Outlet',
        website: 'https://sportsgear.example.com',
        logoUrl: 'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=100&h=50&fit=crop',
        tier: 'STANDARD',
      },
    }),
  ])

  console.log(`Created ${retailers.length} retailers`)

  // Create products with prices
  const products = [
    // Electronics
    {
      name: 'Wireless Noise-Cancelling Headphones',
      description: 'Premium over-ear headphones with active noise cancellation and 30-hour battery life',
      category: 'Electronics',
      brand: 'AudioTech Pro',
      imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&h=400&fit=crop',
      prices: [
        { retailerId: retailers[0].id, price: 299.99, inStock: true },
        { retailerId: retailers[1].id, price: 289.99, inStock: true },
        { retailerId: retailers[3].id, price: 279.99, inStock: true },
        { retailerId: retailers[4].id, price: 275.00, inStock: false },
      ],
    },
    {
      name: 'Smart Watch Series 5',
      description: 'Fitness tracking, heart rate monitor, GPS, water resistant up to 50m',
      category: 'Electronics',
      brand: 'TechTime',
      imageUrl: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&h=400&fit=crop',
      prices: [
        { retailerId: retailers[0].id, price: 399.99, inStock: true },
        { retailerId: retailers[1].id, price: 389.99, inStock: true },
        { retailerId: retailers[3].id, price: 369.99, inStock: true },
      ],
    },
    {
      name: 'Wireless Gaming Mouse',
      description: 'High-precision optical sensor, 16000 DPI, customizable RGB lighting',
      category: 'Electronics',
      brand: 'GameMaster',
      imageUrl: 'https://images.unsplash.com/photo-1527814050087-3793815479db?w=600&h=400&fit=crop',
      prices: [
        { retailerId: retailers[0].id, price: 79.99, inStock: true },
        { retailerId: retailers[4].id, price: 69.99, inStock: true },
      ],
    },
    {
      name: '4K Webcam with Auto-Focus',
      description: 'Ultra HD video calling, built-in dual microphones, low-light correction',
      category: 'Electronics',
      brand: 'VisionStream',
      imageUrl: 'https://images.unsplash.com/photo-1625948515291-69613efd103f?w=600&h=400&fit=crop',
      prices: [
        { retailerId: retailers[1].id, price: 129.99, inStock: true },
        { retailerId: retailers[3].id, price: 119.99, inStock: false },
        { retailerId: retailers[4].id, price: 115.00, inStock: true },
      ],
    },
    {
      name: 'Portable Bluetooth Speaker',
      description: 'Waterproof, 360-degree sound, 12-hour battery, includes carrying case',
      category: 'Electronics',
      brand: 'SoundWave',
      imageUrl: 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=600&h=400&fit=crop',
      prices: [
        { retailerId: retailers[0].id, price: 149.99, inStock: true },
        { retailerId: retailers[3].id, price: 139.99, inStock: true },
        { retailerId: retailers[4].id, price: 129.99, inStock: true },
      ],
    },
    // Home & Garden
    {
      name: 'Robot Vacuum Cleaner',
      description: 'Smart mapping, app control, automatic charging, works on all floor types',
      category: 'Home',
      brand: 'CleanBot',
      imageUrl: 'https://images.unsplash.com/photo-1558317374-067fb5f30001?w=600&h=400&fit=crop',
      prices: [
        { retailerId: retailers[2].id, price: 349.99, inStock: true },
        { retailerId: retailers[5].id, price: 329.99, inStock: true },
      ],
    },
    {
      name: 'Smart Air Purifier',
      description: 'HEPA filter, removes 99.97% of particles, quiet operation, air quality sensor',
      category: 'Home',
      brand: 'PureAir',
      imageUrl: 'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=600&h=400&fit=crop',
      prices: [
        { retailerId: retailers[2].id, price: 199.99, inStock: true },
        { retailerId: retailers[5].id, price: 189.99, inStock: false },
      ],
    },
    {
      name: 'Stainless Steel Cookware Set',
      description: '10-piece professional-grade cookware with non-stick coating',
      category: 'Home',
      brand: 'ChefPro',
      imageUrl: 'https://images.unsplash.com/photo-1584990347449-1082bf8d3e50?w=600&h=400&fit=crop',
      prices: [
        { retailerId: retailers[2].id, price: 249.99, inStock: true },
        { retailerId: retailers[5].id, price: 229.99, inStock: true },
      ],
    },
    {
      name: 'Electric Standing Desk',
      description: 'Height-adjustable, memory presets, cable management, sturdy steel frame',
      category: 'Home',
      brand: 'ErgoWork',
      imageUrl: 'https://images.unsplash.com/photo-1595515106969-1ce29566ff1c?w=600&h=400&fit=crop',
      prices: [
        { retailerId: retailers[2].id, price: 499.99, inStock: true },
        { retailerId: retailers[5].id, price: 479.99, inStock: true },
      ],
    },
    // Fashion
    {
      name: 'Leather Crossbody Bag',
      description: 'Genuine leather, adjustable strap, multiple compartments, classic design',
      category: 'Fashion',
      brand: 'StyleCraft',
      imageUrl: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=600&h=400&fit=crop',
      prices: [
        { retailerId: retailers[5].id, price: 89.99, inStock: true },
      ],
    },
    {
      name: 'Aviator Sunglasses',
      description: 'UV400 protection, polarized lenses, metal frame, includes case',
      category: 'Fashion',
      brand: 'SunStyle',
      imageUrl: 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=600&h=400&fit=crop',
      prices: [
        { retailerId: retailers[5].id, price: 129.99, inStock: true },
      ],
    },
    {
      name: 'Wool Blend Winter Coat',
      description: 'Water-resistant, insulated, multiple pockets, available in multiple colors',
      category: 'Fashion',
      brand: 'WarmStyle',
      imageUrl: 'https://images.unsplash.com/photo-1539533018447-63fcce2678e3?w=600&h=400&fit=crop',
      prices: [
        { retailerId: retailers[5].id, price: 179.99, inStock: false },
      ],
    },
    // Sports & Outdoors
    {
      name: 'Yoga Mat with Carrying Strap',
      description: 'Non-slip, eco-friendly TPE material, 6mm thick, lightweight',
      category: 'Sports',
      brand: 'FitFlow',
      imageUrl: 'https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?w=600&h=400&fit=crop',
      prices: [
        { retailerId: retailers[6].id, price: 39.99, inStock: true },
      ],
    },
    {
      name: 'Adjustable Dumbbell Set',
      description: 'Space-saving design, 5-52.5 lbs per dumbbell, includes stand',
      category: 'Sports',
      brand: 'IronFit',
      imageUrl: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=600&h=400&fit=crop',
      prices: [
        { retailerId: retailers[6].id, price: 299.99, inStock: true },
      ],
    },
    {
      name: 'Camping Tent - 4 Person',
      description: 'Waterproof, easy setup, ventilated, includes carrying bag',
      category: 'Sports',
      brand: 'OutdoorPro',
      imageUrl: 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=600&h=400&fit=crop',
      prices: [
        { retailerId: retailers[6].id, price: 159.99, inStock: true },
      ],
    },
    {
      name: 'Mountain Bike 29"',
      description: '21-speed, aluminum frame, disc brakes, front suspension',
      category: 'Sports',
      brand: 'TrailMaster',
      imageUrl: 'https://images.unsplash.com/photo-1576435728678-68d0fbf94e91?w=600&h=400&fit=crop',
      prices: [
        { retailerId: retailers[6].id, price: 599.99, inStock: true },
      ],
    },
    // More Electronics
    {
      name: 'USB-C Hub Adapter',
      description: '7-in-1, HDMI 4K output, USB 3.0 ports, SD card reader, aluminum body',
      category: 'Electronics',
      brand: 'ConnectPro',
      imageUrl: 'https://images.unsplash.com/photo-1625948515291-69613efd103f?w=600&h=400&fit=crop',
      prices: [
        { retailerId: retailers[1].id, price: 49.99, inStock: true },
        { retailerId: retailers[4].id, price: 39.99, inStock: true },
      ],
    },
    {
      name: 'Wireless Keyboard and Mouse Combo',
      description: 'Ergonomic design, 2.4GHz connection, long battery life, whisper-quiet keys',
      category: 'Electronics',
      brand: 'KeyMaster',
      imageUrl: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=600&h=400&fit=crop',
      prices: [
        { retailerId: retailers[0].id, price: 69.99, inStock: true },
        { retailerId: retailers[3].id, price: 59.99, inStock: true },
        { retailerId: retailers[4].id, price: 54.99, inStock: true },
      ],
    },
    {
      name: 'External SSD 1TB',
      description: 'USB 3.2, up to 1050MB/s read speed, compact design, shock-resistant',
      category: 'Electronics',
      brand: 'DataVault',
      imageUrl: 'https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?w=600&h=400&fit=crop',
      prices: [
        { retailerId: retailers[0].id, price: 129.99, inStock: true },
        { retailerId: retailers[1].id, price: 119.99, inStock: true },
        { retailerId: retailers[4].id, price: 109.99, inStock: false },
      ],
    },
    {
      name: 'LED Desk Lamp',
      description: 'Adjustable brightness, color temperature control, USB charging port, eye-care',
      category: 'Home',
      brand: 'BrightLife',
      imageUrl: 'https://images.unsplash.com/photo-1540932239986-30128078f3c5?w=600&h=400&fit=crop',
      prices: [
        { retailerId: retailers[2].id, price: 59.99, inStock: true },
        { retailerId: retailers[5].id, price: 49.99, inStock: true },
      ],
    },
    {
      name: 'Coffee Maker with Grinder',
      description: 'Built-in burr grinder, programmable, thermal carafe, 12-cup capacity',
      category: 'Home',
      brand: 'BrewPro',
      imageUrl: 'https://images.unsplash.com/photo-1517668808822-9ebb02f2a0e6?w=600&h=400&fit=crop',
      prices: [
        { retailerId: retailers[2].id, price: 199.99, inStock: true },
        { retailerId: retailers[5].id, price: 189.99, inStock: true },
      ],
    },
  ]

  for (const productData of products) {
    const { prices, ...productInfo } = productData

    const product = await prisma.product.create({
      data: productInfo,
    })

    await Promise.all(
      prices.map((priceData) =>
        prisma.price.create({
          data: {
            productId: product.id,
            retailerId: priceData.retailerId,
            price: priceData.price,
            currency: 'USD',
            url: `https://${retailers.find(r => r.id === priceData.retailerId)?.website}/products/${product.id}`,
            inStock: priceData.inStock,
          },
        })
      )
    )
  }

  console.log(`Created ${products.length} products with prices`)
  console.log('Database seeding completed successfully!')
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
