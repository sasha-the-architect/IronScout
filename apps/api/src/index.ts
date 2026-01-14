/**
 * API Server Entry Point
 *
 * Starts the Express server and handles graceful shutdown.
 * The Express app configuration is in app.ts for testability.
 */

import { app, prisma } from './app.js'
import { loggers } from './config/logger'

const log = loggers.server
const PORT = process.env.PORT || 8000

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
