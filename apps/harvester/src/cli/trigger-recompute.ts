#!/usr/bin/env node
/**
 * CLI to manually trigger a current price recompute
 *
 * Usage:
 *   pnpm --filter harvester tsx src/cli/trigger-recompute.ts
 *   pnpm --filter harvester tsx src/cli/trigger-recompute.ts --scope RETAILER --scopeId abc123
 */

import 'dotenv/config'
import { enqueueCurrentPriceRecompute } from '../config/queues'

async function main() {
  const args = process.argv.slice(2)

  // Parse args
  let scope: 'FULL' | 'PRODUCT' | 'RETAILER' | 'SOURCE' = 'FULL'
  let scopeId: string | undefined

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--scope' && args[i + 1]) {
      scope = args[i + 1].toUpperCase() as typeof scope
      i++
    } else if (args[i] === '--scopeId' && args[i + 1]) {
      scopeId = args[i + 1]
      i++
    }
  }

  console.log(`Triggering ${scope} recompute...`, scopeId ? `(scopeId: ${scopeId})` : '')

  try {
    const correlationId = await enqueueCurrentPriceRecompute({
      scope,
      scopeId: scope !== 'FULL' ? scopeId : undefined,
      trigger: 'MANUAL',
      triggeredBy: 'cli',
    })

    console.log(`✓ Recompute job enqueued`)
    console.log(`  Correlation ID: ${correlationId}`)
    console.log(`  Check Bull Board or harvester logs for progress`)

    // Give time for the job to be added before exiting
    await new Promise(resolve => setTimeout(resolve, 1000))
    process.exit(0)
  } catch (error) {
    console.error('✗ Failed to enqueue recompute:', error)
    process.exit(1)
  }
}

main()
