// Load environment variables first, before any other imports
import 'dotenv/config'

import express, { Express } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { prisma } from '@ironscout/db'

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

const app: Express = express()
const PORT = process.env.PORT || 8000

app.use(helmet())

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
app.use(express.json())

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

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

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack)
  res.status(500).json({ error: 'Something went wrong!' })
})

const server = app.listen(PORT, () => {
  console.log(`🚀 API server running on port ${PORT}`)
})

// Track if shutdown is in progress
let isShuttingDown = false

// Graceful shutdown
const shutdown = async (signal: string) => {
  if (isShuttingDown) {
    console.log('[Shutdown] Already in progress, please wait...')
    return
  }
  isShuttingDown = true

  console.log(`\n[Shutdown] Received ${signal}, starting graceful shutdown...`)
  const shutdownStart = Date.now()

  try {
    // 1. Stop accepting new connections
    console.log('[Shutdown] Closing HTTP server...')
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err)
        else resolve()
      })
    })
    console.log('[Shutdown] HTTP server closed')

    // 2. Disconnect from database
    console.log('[Shutdown] Disconnecting from database...')
    await prisma.$disconnect()
    console.log('[Shutdown] Database disconnected')

    const duration = ((Date.now() - shutdownStart) / 1000).toFixed(1)
    console.log(`[Shutdown] Graceful shutdown complete in ${duration}s`)
    process.exit(0)
  } catch (error) {
    console.error('[Shutdown] Error during shutdown:', error)
    process.exit(1)
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

export default app
