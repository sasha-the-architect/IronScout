/**
 * Investigate orphaned prices - prices with sourceProductId but no matching source_product
 */
import 'dotenv/config';
import { prisma } from '../packages/db/index.js';

async function investigate() {
  console.log('=== Prices Table Investigation ===\n');

  // Total prices
  const totalPrices = await prisma.prices.count();
  console.log('Total prices:', totalPrices);

  // Prices with sourceProductId
  const withSourceProductId = await prisma.prices.count({
    where: { sourceProductId: { not: null } }
  });
  console.log('Prices with sourceProductId:', withSourceProductId);

  // Prices with productId (canonical)
  const withProductId = await prisma.prices.count({
    where: { productId: { not: null } }
  });
  console.log('Prices with productId (canonical):', withProductId);

  // Find orphaned prices (sourceProductId set but source_product doesn't exist)
  console.log('\n=== Checking for Orphaned Source Products ===\n');

  const orphanedSourceProducts = await prisma.$queryRaw`
    SELECT COUNT(*) as count
    FROM prices p
    LEFT JOIN source_products sp ON p."sourceProductId" = sp.id
    WHERE p."sourceProductId" IS NOT NULL
      AND sp.id IS NULL
  `;
  console.log('Orphaned prices (sourceProductId but no source_product):', orphanedSourceProducts[0].count);

  if (orphanedSourceProducts[0].count > 0n) {
    // Get samples
    const samples = await prisma.$queryRaw`
      SELECT
        p.id as price_id,
        p."sourceProductId",
        p."retailerId",
        p.price,
        p.url,
        p."createdAt",
        p."ingestionRunType",
        r.name as retailer_name
      FROM prices p
      LEFT JOIN source_products sp ON p."sourceProductId" = sp.id
      LEFT JOIN retailers r ON p."retailerId" = r.id
      WHERE p."sourceProductId" IS NOT NULL
        AND sp.id IS NULL
      LIMIT 10
    `;

    console.log('\nSample orphaned prices:');
    for (const p of samples) {
      console.log('  - Price:', String(p.price_id).slice(0, 12) + '...');
      console.log('    sourceProductId:', p.sourceProductId);
      console.log('    retailer:', p.retailer_name);
      console.log('    price:', p.price);
      console.log('    url:', String(p.url).slice(0, 60) + '...');
      console.log('    ingestionType:', p.ingestionRunType);
      console.log('    createdAt:', p.createdAt);
      console.log('');
    }

    // By retailer
    const byRetailer = await prisma.$queryRaw`
      SELECT
        r.name as retailer_name,
        COUNT(*) as count
      FROM prices p
      LEFT JOIN source_products sp ON p."sourceProductId" = sp.id
      LEFT JOIN retailers r ON p."retailerId" = r.id
      WHERE p."sourceProductId" IS NOT NULL
        AND sp.id IS NULL
      GROUP BY r.name
      ORDER BY count DESC
      LIMIT 10
    `;
    console.log('Orphaned by retailer:');
    for (const row of byRetailer) {
      console.log('  ', row.retailer_name, ':', row.count);
    }

    // By date
    const byDate = await prisma.$queryRaw`
      SELECT
        DATE(p."createdAt") as date,
        COUNT(*) as count
      FROM prices p
      LEFT JOIN source_products sp ON p."sourceProductId" = sp.id
      WHERE p."sourceProductId" IS NOT NULL
        AND sp.id IS NULL
      GROUP BY DATE(p."createdAt")
      ORDER BY date DESC
      LIMIT 10
    `;
    console.log('\nOrphaned by date (most recent first):');
    for (const row of byDate) {
      console.log('  ', row.date, ':', row.count);
    }
  }

  // Also check: source_products without any prices
  console.log('\n=== Source Products Health Check ===\n');

  const totalSourceProducts = await prisma.source_products.count();
  console.log('Total source_products:', totalSourceProducts);

  const sourceProductsWithPrices = await prisma.$queryRaw`
    SELECT COUNT(DISTINCT "sourceProductId") as count
    FROM prices
    WHERE "sourceProductId" IS NOT NULL
  `;
  console.log('Source products with prices:', sourceProductsWithPrices[0].count);

  const orphanedSourceProductRecords = await prisma.$queryRaw`
    SELECT COUNT(*) as count
    FROM source_products sp
    LEFT JOIN prices p ON sp.id = p."sourceProductId"
    WHERE p.id IS NULL
  `;
  console.log('Source products without any prices:', orphanedSourceProductRecords[0].count);
}

investigate().catch(console.error);
