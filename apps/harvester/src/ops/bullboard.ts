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
import { flushLogs } from '@ironscout/logger'
import {
  crawlQueue,
  fetchQueue,
  extractQueue,
  normalizeQueue,
  writeQueue,
  alertQueue,
  retailerFeedIngestQueue,
  affiliateFeedQueue,
  affiliateFeedSchedulerQueue,
  productResolveQueue,
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
  log.fatal('Bull Board requires authentication credentials', {
    required: ['BULLBOARD_USERNAME', 'BULLBOARD_PASSWORD'],
    hint: 'Set these environment variables before starting',
  })
  flushLogs().finally(() => process.exit(1))
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
    // Retailer portal queues
    new BullMQAdapter(retailerFeedIngestQueue),
    // Affiliate feed queues
    new BullMQAdapter(affiliateFeedQueue),
    new BullMQAdapter(affiliateFeedSchedulerQueue),
    // Product Resolver queue
    new BullMQAdapter(productResolveQueue),
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
    queues: [
      'crawl', 'fetch', 'extract', 'normalize', 'write', 'alert',
      'retailer-feed-ingest',
      'affiliate-feed', 'affiliate-feed-scheduler',
      'product-resolve',
    ],
    warning: 'DO NOT EXPOSE TO PUBLIC INTERNET',
  })
})

// =============================================================================
// Graceful Shutdown
// =============================================================================

const shutdown = async (signal: string) => {
  log.info('Shutting down Bull Board server', { signal })

  server.close(() => {
    log.info('Bull Board server closed')
    flushLogs().finally(() => process.exit(0))
  })

  // Force exit after 10 seconds
  setTimeout(() => {
    log.warn('Forced shutdown after timeout')
    flushLogs().finally(() => process.exit(1))
  }, 10000)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
