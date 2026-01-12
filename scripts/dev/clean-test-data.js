#!/usr/bin/env tsx
/**
 * Clean Test Data Script
 *
 * Removes all merchants, retailers, sources, products, and related data
 * for testing workflow from scratch.
 *
 * WARNING: This is destructive! Only use in development/test environments.
 *
 * Usage: pnpm exec tsx --env-file=.env scripts/dev/clean-test-data.js --confirm
 */

import { prisma } from '@ironscout/db';

async function cleanTestData() {
  console.log('Starting test data cleanup...\n');

  // Safety check - require explicit confirmation
  const args = process.argv.slice(2);
  if (!args.includes('--confirm')) {
    console.log('This will DELETE all merchants, retailers, sources, products, and related data!');
    console.log('   Run with --confirm to proceed.\n');
    console.log('   Usage: pnpm exec tsx --env-file=.env scripts/dev/clean-test-data.js --confirm\n');
    process.exit(1);
  }

  try {
    // Order matters due to foreign key constraints
    // Delete child tables first, then parents

    // 1. Affiliate feed pipeline (deepest children first)
    console.log('Cleaning affiliate feed run errors...');
    const runErrors = await prisma.affiliate_feed_run_errors.deleteMany({});
    console.log(`  Deleted ${runErrors.count} affiliate_feed_run_errors`);

    console.log('Cleaning source product seen records...');
    const spSeen = await prisma.source_product_seen.deleteMany({});
    console.log(`  Deleted ${spSeen.count} source_product_seen`);

    console.log('Cleaning affiliate feed runs...');
    const feedRuns = await prisma.affiliate_feed_runs.deleteMany({});
    console.log(`  Deleted ${feedRuns.count} affiliate_feed_runs`);

    console.log('Cleaning source product presence...');
    const spPresence = await prisma.source_product_presence.deleteMany({});
    console.log(`  Deleted ${spPresence.count} source_product_presence`);

    console.log('Cleaning source products...');
    const sourceProducts = await prisma.source_products.deleteMany({});
    console.log(`  Deleted ${sourceProducts.count} source_products`);

    console.log('Cleaning executions...');
    const executions = await prisma.executions.deleteMany({});
    console.log(`  Deleted ${executions.count} executions`);

    console.log('Cleaning affiliate feeds...');
    const affiliateFeeds = await prisma.affiliate_feeds.deleteMany({});
    console.log(`  Deleted ${affiliateFeeds.count} affiliate_feeds`);

    // 2. Retailer feed pipeline
    console.log('Cleaning retailer feed test runs...');
    const testRuns = await prisma.retailer_feed_test_runs.deleteMany({});
    console.log(`  Deleted ${testRuns.count} retailer_feed_test_runs`);

    console.log('Cleaning retailer feed runs...');
    const retailerFeedRuns = await prisma.retailer_feed_runs.deleteMany({});
    console.log(`  Deleted ${retailerFeedRuns.count} retailer_feed_runs`);

    console.log('Cleaning feed corrections...');
    const feedCorrections = await prisma.feed_corrections.deleteMany({});
    console.log(`  Deleted ${feedCorrections.count} feed_corrections`);

    console.log('Cleaning quarantined records...');
    const quarantined = await prisma.quarantined_records.deleteMany({});
    console.log(`  Deleted ${quarantined.count} quarantined_records`);

    console.log('Cleaning retailer SKUs...');
    const retailerSkus = await prisma.retailer_skus.deleteMany({});
    console.log(`  Deleted ${retailerSkus.count} retailer_skus`);

    console.log('Cleaning retailer feeds...');
    const retailerFeeds = await prisma.retailer_feeds.deleteMany({});
    console.log(`  Deleted ${retailerFeeds.count} retailer_feeds`);

    // 3. Pricing data (before deleting sources/retailers/products)
    console.log('Cleaning prices...');
    const prices = await prisma.prices.deleteMany({});
    console.log(`  Deleted ${prices.count} prices`);

    // NOTE: pricing_snapshots removed (benchmark subsystem deleted for v1)

    console.log('Cleaning price corrections...');
    const priceCorrections = await prisma.price_corrections.deleteMany({});
    console.log(`  Deleted ${priceCorrections.count} price_corrections`);

    // 4. Sources (depends on retailers)
    console.log('Cleaning sources...');
    const sources = await prisma.sources.deleteMany({});
    console.log(`  Deleted ${sources.count} sources`);

    // 5. Product-related (alerts, watchlist items cascade from products)
    console.log('Cleaning product reports...');
    const reports = await prisma.product_reports.deleteMany({});
    console.log(`  Deleted ${reports.count} product_reports`);

    console.log('Cleaning benchmarks...');
    const benchmarks = await prisma.benchmarks.deleteMany({});
    console.log(`  Deleted ${benchmarks.count} benchmarks`);

    console.log('Cleaning alerts...');
    const alerts = await prisma.alerts.deleteMany({});
    console.log(`  Deleted ${alerts.count} alerts`);

    console.log('Cleaning watchlist items...');
    const watchlistItems = await prisma.watchlist_items.deleteMany({});
    console.log(`  Deleted ${watchlistItems.count} watchlist_items`);

    console.log('Cleaning products...');
    const products = await prisma.products.deleteMany({});
    console.log(`  Deleted ${products.count} products`);

    // 6. Merchant-retailer relationships
    console.log('Cleaning merchant user retailers...');
    const murLinks = await prisma.merchant_user_retailers.deleteMany({});
    console.log(`  Deleted ${murLinks.count} merchant_user_retailers`);

    console.log('Cleaning merchant retailers...');
    const mrLinks = await prisma.merchant_retailers.deleteMany({});
    console.log(`  Deleted ${mrLinks.count} merchant_retailers`);

    // 7. Retailers (now safe after sources and feeds deleted)
    console.log('Cleaning retailers...');
    const retailers = await prisma.retailers.deleteMany({});
    console.log(`  Deleted ${retailers.count} retailers`);

    // 8. Merchant-related (cascade handles most children)
    console.log('Cleaning merchant insights...');
    const insights = await prisma.merchant_insights.deleteMany({});
    console.log(`  Deleted ${insights.count} merchant_insights`);

    console.log('Cleaning merchant contacts...');
    const contacts = await prisma.merchant_contacts.deleteMany({});
    console.log(`  Deleted ${contacts.count} merchant_contacts`);

    console.log('Cleaning merchant invites...');
    const invites = await prisma.merchant_invites.deleteMany({});
    console.log(`  Deleted ${invites.count} merchant_invites`);

    console.log('Cleaning merchant notification prefs...');
    const notifPrefs = await prisma.merchant_notification_prefs.deleteMany({});
    console.log(`  Deleted ${notifPrefs.count} merchant_notification_prefs`);

    console.log('Cleaning merchant users...');
    const merchantUsers = await prisma.merchant_users.deleteMany({});
    console.log(`  Deleted ${merchantUsers.count} merchant_users`);

    console.log('Cleaning click events...');
    const clicks = await prisma.click_events.deleteMany({});
    console.log(`  Deleted ${clicks.count} click_events`);

    console.log('Cleaning pixel events...');
    const pixels = await prisma.pixel_events.deleteMany({});
    console.log(`  Deleted ${pixels.count} pixel_events`);

    console.log('Cleaning merchants...');
    const merchants = await prisma.merchants.deleteMany({});
    console.log(`  Deleted ${merchants.count} merchants`);

    // Summary
    console.log('\n✅ Test data cleanup complete!\n');
    console.log('Summary:');
    console.log(`  - ${merchants.count} merchants deleted`);
    console.log(`  - ${retailers.count} retailers deleted`);
    console.log(`  - ${sources.count} sources deleted`);
    console.log(`  - ${products.count} products deleted`);
    console.log(`  - ${affiliateFeeds.count} affiliate feeds deleted`);
    console.log(`  - ${prices.count} prices deleted`);

  } catch (error) {
    console.error('\n❌ Error during cleanup:', error);
    process.exit(1);
  }
}

cleanTestData();
