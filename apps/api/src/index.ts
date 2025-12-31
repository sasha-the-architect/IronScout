// Load environment variables first, before any other imports
import 'dotenv/config'

import express, { Express, Request, Response, NextFunction } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { prisma, isMaintenanceMode } from '@ironscout/db'
import { loggers } from './config/logger'

const log = loggers.server

import { requestContextMiddleware } from './middleware/request-context'
import { productsRouter } from './routes/products'
import { adsRouter } from './routes/ads'
import { alertsRouter } from './routes/alerts'
import { paymentsRouter } from './routes/payments'
import { dataRouter } from './routes/data'
import { sourcesRouter } from './routes/sources'
import { executionsRouter } from './routes/executions'
import { logsRouter } from './routes/logs'
import { harvesterRouter } from './routes/harvester'
import reportsRouter from './routes/reports'
import { searchRouter } from './routes/search'
import { authRouter } from './routes/auth'
import { dashboardRouter } from './routes/dashboard'
import { watchlistRouter } from './routes/watchlist'
import { savedItemsRouter } from './routes/saved-items'
import { adminRouter } from './routes/admin'
import { usersRouter } from './routes/users'

const app: Express = express()
const PORT = process.env.PORT || 8000

app.use(helmet())

// Request context middleware - provides requestId correlation for logging
// Must be early in the chain to capture all request processing
app.use(requestContextMiddleware)

// CORS configuration to support multiple domains
const allowedOrigins = [
  'http://localhost:3000',
  'https://ironscout-web.onrender.com',
  'https://www.ironscout.ai',
  'https://ironscout.ai',
  process.env.FRONTEND_URL
].filter(Boolean)

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true)

    if (allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true
}))

// Store raw body for Stripe webhook signature verification
// Must be before express.json() middleware
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }))

// JSON body parsing for all other routes
app.use(express.json())

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Maintenance mode middleware - allows health check and admin routes through
const maintenanceMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  // Always allow health check and admin routes
  if (req.path === '/health' || req.path.startsWith('/api/admin')) {
    return next()
  }

  try {
    const inMaintenance = await isMaintenanceMode()
    if (inMaintenance) {
      log.info('Request blocked due to maintenance mode', { path: req.path })
      return res.status(503).json({
        error: 'Service temporarily unavailable for maintenance',
        code: 'MAINTENANCE_MODE'
      })
    }
  } catch (error) {
    // Per ADR-009: Fail closed on eligibility or trust ambiguity
    // If we can't check maintenance mode, block the request
    log.error('Failed to check maintenance mode, blocking request (fail-closed)', {}, error as Error)
    return res.status(503).json({
      error: 'Service temporarily unavailable',
      code: 'MAINTENANCE_CHECK_FAILED'
    })
  }

  next()
}

app.use(maintenanceMiddleware)

app.use('/api/products', productsRouter)
app.use('/api/ads', adsRouter)
app.use('/api/alerts', alertsRouter)
app.use('/api/payments', paymentsRouter)
app.use('/api/data', dataRouter)
app.use('/api/sources', sourcesRouter)
app.use('/api/executions', executionsRouter)
app.use('/api/logs', logsRouter)
app.use('/api/harvester', harvesterRouter)
app.use('/api/reports', reportsRouter)
app.use('/api/search', searchRouter)
app.use('/api/auth', authRouter)
app.use('/api/dashboard', dashboardRouter)
app.use('/api/watchlist', watchlistRouter)
app.use('/api/saved-items', savedItemsRouter)
app.use('/api/admin', adminRouter)
app.use('/api/users', usersRouter)

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  log.error('Unhandled error', { path: req.path, method: req.method }, err)
  res.status(500).json({ error: 'Something went wrong!' })
})

const server = app.listen(PORT, () => {
  log.info('API server started', { port: PORT })
})

// Track if shutdown is in progress
let isShuttingDown = false

// Graceful shutdown
const shutdown = async (signal: string) => {
  if (isShuttingDown) {
    log.warn('Shutdown already in progress')
    return
  }
  isShuttingDown = true

  const shutdownStart = Date.now()
  log.info('Starting graceful shutdown', { signal })

  try {
    // 1. Stop accepting new connections
    log.info('Closing HTTP server')
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err)
        else resolve()
      })
    })
    log.info('HTTP server closed')

    // 2. Disconnect from database
    log.info('Disconnecting from database')
    await prisma.$disconnect()

    const durationMs = Date.now() - shutdownStart
    log.info('Graceful shutdown complete', { durationMs })
    process.exit(0)
  } catch (error) {
    log.error('Error during shutdown', {}, error)
    process.exit(1)
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

export default app
