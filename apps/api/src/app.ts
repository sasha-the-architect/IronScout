/**
 * Express App Configuration (without server startup)
 *
 * This file exports the configured Express app for use in:
 * - Integration tests (via supertest)
 * - Index.ts (actual server startup)
 *
 * The server.listen() call is in index.ts, not here.
 */

// Load environment variables first - this MUST be the first import
import './env.js'

import express, { Express, Request, Response, NextFunction } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { prisma, isMaintenanceMode } from '@ironscout/db'
import { loggers } from './config/logger'

const log = loggers.server

import { requestContextMiddleware } from './middleware/request-context'
import { requestLoggerMiddleware, errorLoggerMiddleware } from './middleware/request-logger'
import { validateAllLensDefinitions } from './services/lens'
import { productsRouter } from './routes/products'
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
import { gunLockerRouter } from './routes/gun-locker'
import { priceCheckRouter } from './routes/price-check'
import { adminRouter } from './routes/admin'
import { usersRouter } from './routes/users'

// ============================================================================
// Deploy-Time Validation
// ============================================================================

// Per search-lens-v1.md §Governance: "Lens definitions must reference only
// fields in 'Expected Field Types'. Unknown fields fail deploy-time validation."
// This runs at module load time and throws if lens definitions are invalid.
// NOTE: Validation runs unconditionally (regardless of ENABLE_LENS_V1) to ensure
// definitions are always valid and safe to enable at any time.
try {
  validateAllLensDefinitions()
  log.info('Lens definitions validated successfully')
} catch (error) {
  log.error('Lens definition validation failed - server will not start', {}, error as Error)
  throw error
}

// ============================================================================
// Express App Configuration
// ============================================================================

export const app: Express = express()

app.use(helmet())

// Request context middleware - provides requestId correlation for logging
// Must be early in the chain to capture all request processing
app.use(requestContextMiddleware)

// Request logger middleware - logs one entry per request at response finish
// Must come after requestContextMiddleware to have access to requestId
app.use(requestLoggerMiddleware)

// CORS configuration to support multiple domains
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3002', // Admin app
  'http://localhost:3003', // Merchant app
  'https://ironscout-web.onrender.com',
  'https://ironscout-admin.onrender.com',
  'https://ironscout-merchant.onrender.com',
  'https://www.ironscout.ai',
  'https://ironscout.ai',
  process.env.FRONTEND_URL,
  process.env.ADMIN_URL,
  process.env.MERCHANT_URL,
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
app.use('/api/gun-locker', gunLockerRouter)
app.use('/api/price-check', priceCheckRouter)
app.use('/api/admin', adminRouter)
app.use('/api/users', usersRouter)

// Error logger middleware - logs errors with classification
app.use(errorLoggerMiddleware)

// Final error handler - sends response to client
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Error is already logged by errorLoggerMiddleware
  const statusCode = err.statusCode || err.status || 500
  res.status(statusCode).json({
    error: statusCode >= 500 ? 'Something went wrong!' : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  })
})

// Export prisma for graceful shutdown
export { prisma }
