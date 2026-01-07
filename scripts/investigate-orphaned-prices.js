/**
 * Investigate orphaned prices - prices with productId but no matching product
 */
import 'dotenv/config';
import { prisma } from '../packages/db/index.js';

async function investigate() {
  console.log('Investigating orphaned prices with productId but no product...\n');

  // Count prices with productId set
  const pricesWithProductId = await prisma.prices.count({
    where: { productId: { not: null } }
  });
  console.log('Total prices with productId:', pricesWithProductId);

  // Find orphaned prices (productId set but product doesn't exist)
  const orphanedPrices = await prisma.$queryRaw`
    SELECT
      p.id,
      p."productId",
      p."sourceProductId",
      p."retailerId",
      p.price,
      p.url,
      p."createdAt",
      p."ingestionRunType"
    FROM prices p
    LEFT JOIN products prod ON p."productId" = prod.id
    WHERE p."productId" IS NOT NULL
      AND prod.id IS NULL
    LIMIT 20
  `;

  console.log('\nOrphaned prices (productId but no product):', orphanedPrices.length);

  if (orphanedPrices.length > 0) {
    console.log('\nSample orphaned prices:');
    for (const p of orphanedPrices.slice(0, 5)) {
      console.log('  - Price ID:', String(p.id).slice(0, 12) + '...');
      console.log('    productId:', p.productId);
      console.log('    sourceProductId:', p.sourceProductId ? String(p.sourceProductId).slice(0, 12) + '...' : 'null');
      console.log('    retailerId:', p.retailerId ? String(p.retailerId).slice(0, 12) + '...' : 'null');
      console.log('    price:', p.price);
      console.log('    ingestionRunType:', p.ingestionRunType);
      console.log('    createdAt:', p.createdAt);
      console.log('');
    }
  }

  // Get total count of orphaned
  const orphanedCount = await prisma.$queryRaw`
    SELECT COUNT(*) as count
    FROM prices p
    LEFT JOIN products prod ON p."productId" = prod.id
    WHERE p."productId" IS NOT NULL
      AND prod.id IS NULL
  `;
  console.log('Total orphaned prices:', orphanedCount[0].count);

  // Check if there's a pattern - which ingestion types created these?
  const byIngestionType = await prisma.$queryRaw`
    SELECT
      p."ingestionRunType",
      COUNT(*) as count
    FROM prices p
    LEFT JOIN products prod ON p."productId" = prod.id
    WHERE p."productId" IS NOT NULL
      AND prod.id IS NULL
    GROUP BY p."ingestionRunType"
  `;
  console.log('\nOrphaned by ingestion type:');
  for (const row of byIngestionType) {
    console.log('  ', row.ingestionRunType || 'NULL', ':', row.count);
  }

  // Check when these were created
  const byDate = await prisma.$queryRaw`
    SELECT
      DATE(p."createdAt") as date,
      COUNT(*) as count
    FROM prices p
    LEFT JOIN products prod ON p."productId" = prod.id
    WHERE p."productId" IS NOT NULL
      AND prod.id IS NULL
    GROUP BY DATE(p."createdAt")
    ORDER BY date DESC
    LIMIT 10
  `;
  console.log('\nOrphaned by date (most recent first):');
  for (const row of byDate) {
    console.log('  ', row.date, ':', row.count);
  }

  // Check the schema - is productId supposed to have a FK constraint?
  console.log('\n--- Schema Investigation ---');

  // Check if there are products that were deleted
  const recentlyDeletedCheck = await prisma.$queryRaw`
    SELECT DISTINCT p."productId"
    FROM prices p
    LEFT JOIN products prod ON p."productId" = prod.id
    WHERE p."productId" IS NOT NULL
      AND prod.id IS NULL
    LIMIT 5
  `;
  console.log('\nSample missing productIds:', recentlyDeletedCheck.map(r => r.productId));

  // Check if any of these productIds ever existed (look for pattern)
  if (recentlyDeletedCheck.length > 0) {
    const sampleId = recentlyDeletedCheck[0].productId;
    console.log('\nChecking if', sampleId, 'looks like a valid CUID...');
    console.log('Length:', sampleId?.length, '(CUIDs are typically 25 chars)');
    console.log('Starts with "c":', sampleId?.startsWith('c'));
  }
}

investigate().catch(console.error);
