/**
 * Fix retailer data for local development
 *
 * This script:
 * 1. Sets all retailers to visibilityStatus = 'ELIGIBLE'
 * 2. Creates merchant_retailer links for retailers without them
 * 3. Sets listingStatus = 'LISTED' and status = 'ACTIVE' for the links
 *
 * Run with: pnpm exec tsx scripts/fix-retailer-data.js
 */

// Load environment variables from root .env
import 'dotenv/config';

import { prisma } from '../packages/db/index.js';

async function main() {
  console.log('Checking current state...\n');

  // Get retailers
  const retailers = await prisma.retailers.findMany({
    select: { id: true, name: true, website: true, visibilityStatus: true }
  });
  console.log(`Found ${retailers.length} retailers:`);
  retailers.forEach(r => {
    console.log(`  - ${r.name} (${r.visibilityStatus})`);
  });

  // Get merchants
  const merchants = await prisma.merchants.findMany({
    select: { id: true, businessName: true }
  });
  console.log(`\nFound ${merchants.length} merchants:`);
  merchants.forEach(m => {
    console.log(`  - ${m.businessName}`);
  });

  // Get existing merchant_retailer links
  const existingLinks = await prisma.merchant_retailers.findMany({
    select: { merchantId: true, retailerId: true, listingStatus: true, status: true }
  });
  console.log(`\nFound ${existingLinks.length} existing merchant_retailer links`);

  // Fix visibility status for all retailers
  console.log('\n--- Fixing retailer visibility ---');
  const updateResult = await prisma.retailers.updateMany({
    where: { visibilityStatus: { not: 'ELIGIBLE' } },
    data: { visibilityStatus: 'ELIGIBLE' }
  });
  console.log(`Updated ${updateResult.count} retailers to ELIGIBLE`);

  // If no merchants exist, create a test merchant
  let merchantId;
  if (merchants.length === 0) {
    console.log('\nNo merchants found. Creating test merchant...');
    const testMerchant = await prisma.merchants.create({
      data: {
        businessName: 'Test Merchant',
        contactFirstName: 'Test',
        contactLastName: 'User',
        websiteUrl: 'https://test.com',
        storeType: 'ONLINE_ONLY',
        tier: 'PREMIUM',
        status: 'ACTIVE',
        subscriptionStatus: 'ACTIVE',
      }
    });
    merchantId = testMerchant.id;
    console.log(`Created merchant: ${testMerchant.businessName} (${testMerchant.id})`);
  } else {
    merchantId = merchants[0].id;
  }

  // Create merchant_retailer links for retailers without them
  console.log('\n--- Creating merchant_retailer links ---');
  for (const retailer of retailers) {
    const existingLink = existingLinks.find(l => l.retailerId === retailer.id);

    if (!existingLink) {
      console.log(`Creating link for ${retailer.name}...`);
      await prisma.merchant_retailers.create({
        data: {
          merchantId,
          retailerId: retailer.id,
          listingStatus: 'LISTED',
          status: 'ACTIVE',
          listedAt: new Date(),
          listedBy: 'system',
        }
      });
    } else if (existingLink.listingStatus !== 'LISTED' || existingLink.status !== 'ACTIVE') {
      console.log(`Updating link for retailer ${retailer.id} to LISTED/ACTIVE...`);
      await prisma.merchant_retailers.updateMany({
        where: { retailerId: retailer.id },
        data: {
          listingStatus: 'LISTED',
          status: 'ACTIVE',
          listedAt: new Date(),
          listedBy: 'system',
        }
      });
    } else {
      console.log(`${retailer.name} already has valid link`);
    }
  }

  // Verify
  console.log('\n--- Verification ---');
  const finalLinks = await prisma.merchant_retailers.count({
    where: { listingStatus: 'LISTED', status: 'ACTIVE' }
  });
  console.log(`Active merchant_retailer links: ${finalLinks}`);

  const eligibleRetailers = await prisma.retailers.count({
    where: { visibilityStatus: 'ELIGIBLE' }
  });
  console.log(`Eligible retailers: ${eligibleRetailers}`);

  // Count prices with visible retailers
  const visiblePrices = await prisma.prices.count({
    where: {
      retailers: {
        visibilityStatus: 'ELIGIBLE',
        merchant_retailers: {
          some: {
            listingStatus: 'LISTED',
            status: 'ACTIVE',
          }
        }
      }
    }
  });
  console.log(`Prices with visible retailers: ${visiblePrices}`);

  console.log('\nDone! Retailer data has been fixed.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
