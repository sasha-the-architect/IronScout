/**
 * Fix Orphaned Affiliate Feeds
 *
 * Identifies and fixes feeds that were incorrectly marked as SUCCEEDED
 * when they had rows read but 0 products upserted.
 *
 * The bug: runs with rowsRead > 0 and productsUpserted === 0 were marked
 * as SUCCEEDED and their content hash was saved, causing subsequent runs
 * to skip reprocessing.
 *
 * This script:
 * 1. Finds runs marked SUCCEEDED with rowsRead > 0 and productsUpserted === 0
 * 2. Updates those runs to FAILED status with appropriate failure codes
 * 3. Clears the content hash on affected feeds so they'll reprocess
 *
 * Usage:
 *   pnpm exec tsx scripts/fix-orphaned-affiliate-feeds.js --dry-run   # Preview changes
 *   pnpm exec tsx scripts/fix-orphaned-affiliate-feeds.js --fix       # Apply changes
 */

// Load environment variables from root .env
import 'dotenv/config';

import { prisma } from '../packages/db/index.js';

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run') || !args.includes('--fix')

  console.log(`\n🔍 Scanning for orphaned affiliate feed runs...`)
  console.log(`Mode: ${dryRun ? 'DRY RUN (preview only)' : '⚠️  FIX MODE (will modify data)'}\n`)

  // Find runs that were marked SUCCEEDED but had no products upserted
  const orphanedRuns = await prisma.affiliate_feed_runs.findMany({
    where: {
      status: 'SUCCEEDED',
      rowsRead: { gt: 0 },
      OR: [
        { productsUpserted: 0 },
        { productsUpserted: null },
      ],
      // Exclude skipped runs (unchanged content is fine)
      skippedReason: null,
    },
    include: {
      affiliate_feeds: {
        include: {
          sources: {
            include: {
              retailers: true,
            },
          },
        },
      },
    },
    orderBy: { startedAt: 'desc' },
  })

  if (orphanedRuns.length === 0) {
    console.log('✅ No orphaned runs found. All feeds appear healthy.\n')
    return
  }

  console.log(`Found ${orphanedRuns.length} orphaned run(s):\n`)

  // Group by feed for better reporting
  const feedMap = new Map()
  for (const run of orphanedRuns) {
    const feedId = run.feedId
    if (!feedMap.has(feedId)) {
      feedMap.set(feedId, {
        feed: run.affiliate_feeds,
        runs: [],
      })
    }
    feedMap.get(feedId).runs.push(run)
  }

  // Report findings
  for (const [feedId, { feed, runs }] of feedMap) {
    const sourceName = feed?.sources?.name || 'Unknown Source'
    const retailerName = feed?.sources?.retailers?.name || 'Unknown Retailer'
    const latestRun = runs[0]

    console.log(`📋 Feed: ${sourceName}`)
    console.log(`   Retailer: ${retailerName}`)
    console.log(`   Feed ID: ${feedId}`)
    console.log(`   Orphaned Runs: ${runs.length}`)
    console.log(`   Latest Run: ${latestRun.startedAt?.toISOString()}`)
    console.log(`   - rowsRead: ${latestRun.rowsRead}`)
    console.log(`   - rowsParsed: ${latestRun.rowsParsed}`)
    console.log(`   - productsUpserted: ${latestRun.productsUpserted}`)
    console.log(`   - errorCount: ${latestRun.errorCount}`)
    console.log(`   Has Content Hash: ${feed.lastContentHash ? 'Yes (will be cleared)' : 'No'}`)
    console.log('')
  }

  if (dryRun) {
    console.log('━'.repeat(60))
    console.log('This is a DRY RUN. No changes were made.')
    console.log('Run with --fix to apply changes.')
    console.log('━'.repeat(60))
    return
  }

  // Apply fixes
  console.log('━'.repeat(60))
  console.log('Applying fixes...\n')

  let runsFixed = 0
  let feedsCleared = 0

  for (const [feedId, { feed, runs }] of feedMap) {
    const sourceName = feed.sources?.name || feedId

    // Update runs to FAILED status
    for (const run of runs) {
      const failureCode = run.rowsParsed === 0 ? 'VALIDATION_FAILURE' : 'UPSERT_FAILURE'
      const failureMessage = run.rowsParsed === 0
        ? `All ${run.rowsRead} rows failed validation (check CSV column names)`
        : `All ${run.rowsParsed} validated products failed to upsert`

      await prisma.affiliate_feed_runs.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          failureKind: 'PROCESSING_ERROR',
          failureCode,
          failureMessage,
        },
      })
      runsFixed++
      console.log(`   ✓ Run ${run.id.slice(0, 8)}... marked as FAILED (${failureCode})`)
    }

    // Clear content hash on feed if it has one
    if (feed.lastContentHash) {
      await prisma.affiliate_feeds.update({
        where: { id: feedId },
        data: {
          lastContentHash: null,
          lastRemoteMtime: null,
          lastRemoteSize: null,
        },
      })
      feedsCleared++
      console.log(`   ✓ Cleared content hash for ${sourceName}`)
    }
    console.log('')
  }

  console.log('━'.repeat(60))
  console.log(`✅ Fix complete!`)
  console.log(`   Runs marked as FAILED: ${runsFixed}`)
  console.log(`   Feeds with hash cleared: ${feedsCleared}`)
  console.log('')
  console.log('Next steps:')
  console.log('1. Trigger manual runs for affected feeds via admin UI')
  console.log('2. Or wait for scheduled runs to pick up the cleared feeds')
  console.log('━'.repeat(60))
}

main()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
