#!/usr/bin/env node
/**
 * Bull Board - BullMQ Queue Monitoring Dashboard
 *
 * A standalone Express server providing a web UI for monitoring all BullMQ queues.
 * Protected by HTTP Basic Auth - DO NOT EXPOSE PUBLICLY.
 *
 * Usage:
 *   pnpm --filter harvester bullboard:dev   # Development
 *   pnpm --filter harvester bullboard       # Production (after build)
 *
 * Environment Variables:
 *   BULLBOARD_PORT       - Server port (default: 3939)
 *   BULLBOARD_USERNAME   - Basic auth username (required)
 *   BULLBOARD_PASSWORD   - Basic auth password (required)
 *   BULLBOARD_BASE_PATH  - Base path for dashboard (default: /admin/queues)
 *
 * Security:
 *   - Always run behind a firewall or VPN
 *   - Never expose to the public internet
 *   - Use strong credentials
 *   - Consider IP allowlisting in production
 */

import 'dotenv/config'

import express, { Request, Response, NextFunction } from 'express'
import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { ExpressAdapter } from '@bull-board/express'

import { rootLogger } from '../config/logger'
import {
  crawlQueue,
  fetchQueue,
  extractQueue,
  normalizeQueue,
  writeQueue,
  alertQueue,
  dealerFeedIngestQueue,
  dealerSkuMatchQueue,
  dealerBenchmarkQueue,
  dealerInsightQueue,
  affiliateFeedQueue,
  affiliateFeedSchedulerQueue,
} from '../config/queues'

const log = rootLogger.child('bullboard')

// =============================================================================
// Configuration
// =============================================================================

const config = {
  port: parseInt(process.env.BULLBOARD_PORT || '3939', 10),
  username: process.env.BULLBOARD_USERNAME,
  password: process.env.BULLBOARD_PASSWORD,
  basePath: process.env.BULLBOARD_BASE_PATH || '/admin/queues',
}

// Validate required credentials
if (!config.username || !config.password) {
  log.fatal('BULLBOARD_USERNAME and BULLBOARD_PASSWORD environment variables are required')
  console.error('\n[FATAL] Bull Board requires authentication credentials.')
  console.error('Set the following environment variables:')
  console.error('  BULLBOARD_USERNAME=<admin-username>')
  console.error('  BULLBOARD_PASSWORD=<strong-password>\n')
  process.exit(1)
}

// =============================================================================
// Basic Auth Middleware
// =============================================================================

function basicAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Bull Board Admin"')
    res.status(401).send('Authentication required')
    return
  }

  const base64Credentials = authHeader.slice(6)
  const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8')
  const [username, password] = credentials.split(':')

  if (username === config.username && password === config.password) {
    next()
    return
  }

  log.warn('Failed authentication attempt', { username, ip: req.ip })
  res.setHeader('WWW-Authenticate', 'Basic realm="Bull Board Admin"')
  res.status(401).send('Invalid credentials')
}

// =============================================================================
// Bull Board Setup
// =============================================================================

const serverAdapter = new ExpressAdapter()
serverAdapter.setBasePath(config.basePath)

// Register all queues with Bull Board
createBullBoard({
  queues: [
    // Core pipeline queues
    new BullMQAdapter(crawlQueue),
    new BullMQAdapter(fetchQueue),
    new BullMQAdapter(extractQueue),
    new BullMQAdapter(normalizeQueue),
    new BullMQAdapter(writeQueue),
    new BullMQAdapter(alertQueue),
    // Dealer portal queues
    new BullMQAdapter(dealerFeedIngestQueue),
    new BullMQAdapter(dealerSkuMatchQueue),
    new BullMQAdapter(dealerBenchmarkQueue),
    new BullMQAdapter(dealerInsightQueue),
    // Affiliate feed queues
    new BullMQAdapter(affiliateFeedQueue),
    new BullMQAdapter(affiliateFeedSchedulerQueue),
  ],
  serverAdapter,
})

// =============================================================================
// Express Server
// =============================================================================

const app = express()

// Health check endpoint (unauthenticated)
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'bullboard' })
})

// Apply basic auth to all Bull Board routes
app.use(config.basePath, basicAuthMiddleware, serverAdapter.getRouter())

// Redirect root to dashboard
app.get('/', (_req: Request, res: Response) => {
  res.redirect(config.basePath)
})

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' })
})

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  log.error('Server error', {}, err)
  res.status(500).json({ error: 'Internal server error' })
})

// =============================================================================
// Start Server
// =============================================================================

const server = app.listen(config.port, () => {
  log.info('Bull Board server started', {
    port: config.port,
    basePath: config.basePath,
    url: `http://localhost:${config.port}${config.basePath}`,
  })

  console.log('\n' + '='.repeat(60))
  console.log(' Bull Board - BullMQ Queue Monitor')
  console.log('='.repeat(60))
  console.log(`\n  URL:  http://localhost:${config.port}${config.basePath}`)
  console.log(`  Auth: Basic (credentials from env vars)`)
  console.log('\n  Queues monitored:')
  console.log('    - crawl, fetch, extract, normalize, write, alert')
  console.log('    - dealer-feed-ingest, dealer-sku-match, dealer-benchmark, dealer-insight')
  console.log('    - affiliate-feed, affiliate-feed-scheduler')
  console.log('\n  [!] DO NOT EXPOSE THIS SERVER TO THE PUBLIC INTERNET')
  console.log('='.repeat(60) + '\n')
})

// =============================================================================
// Graceful Shutdown
// =============================================================================

const shutdown = async (signal: string) => {
  log.info('Shutting down Bull Board server', { signal })

  server.close(() => {
    log.info('Bull Board server closed')
    process.exit(0)
  })

  // Force exit after 10 seconds
  setTimeout(() => {
    log.warn('Forced shutdown after timeout')
    process.exit(1)
  }, 10000)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
