// Note: dotenv should be loaded by the consuming app (harvester, api, etc.)
// before importing this module. We don't load it here to avoid path issues
// and conflicts with shell environment variables.
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/prisma/client.js'

const globalForPrisma = globalThis

// Track client creation for debugging
let clientCreationCount = 0

function createPrismaClient() {
  clientCreationCount++
  const clientId = clientCreationCount
  console.log(`[Prisma] Creating client #${clientId} (pid: ${process.pid})`)

  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    console.error('[Prisma] DATABASE_URL is not set!')
    console.error('[Prisma] Make sure your app loads dotenv before importing @ironscout/db')
    throw new Error('DATABASE_URL environment variable is not set')
  }

  // Log connection info (masked password) for debugging
  const maskedUrl = connectionString.replace(/:[^:@]+@/, ':***@')
  console.log('[Prisma] Connecting to:', maskedUrl)

  const pool = new Pool({
    connectionString,
    // Connection pool settings for reliability
    max: 5,                        // Reduced max connections
    min: 1,                        // Keep at least 1 connection alive
    idleTimeoutMillis: 60000,      // Close idle connections after 60s
    connectionTimeoutMillis: 15000, // Fail connection attempt after 15s
    allowExitOnIdle: false,        // Keep pool alive
    // TCP keepalive to prevent connection drops
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  })

  // Helper to log pool status
  const logPoolStatus = (context) => {
    console.log(`[Prisma Pool] Status (${context}): total=${pool.totalCount} idle=${pool.idleCount} waiting=${pool.waitingCount}`)
  }

  // Handle pool errors gracefully (prevents crash on transient failures)
  pool.on('error', (err) => {
    console.error('[PostgreSQL Pool] Unexpected error on idle client:')
    logPoolStatus('on error')
    console.error('[PostgreSQL Pool] Host:', pool.options.host || 'from connection string')
    console.error('[PostgreSQL Pool] Error message:', err.message)
    console.error('[PostgreSQL Pool] Error code:', err.code)
    console.error('[PostgreSQL Pool] Error stack:', err.stack)
    if (err.cause) {
      console.error('[PostgreSQL Pool] Error cause:', err.cause)
    }
    // Log full error object for AggregateError
    if (err.errors) {
      console.error('[PostgreSQL Pool] Aggregate errors:')
      err.errors.forEach((e, i) => {
        console.error(`  [PostgreSQL ${i}] ${e.message} (code: ${e.code})`)
        if (e.address) console.error(`      Address: ${e.address}:${e.port}`)
        if (e.syscall) console.error(`      Syscall: ${e.syscall}`)
      })
    }
    // Don't crash - pool will attempt to reconnect on next query
  })

  // Pool event logging (enable with PRISMA_POOL_DEBUG=true for debugging connection issues)
  if (process.env.PRISMA_POOL_DEBUG === 'true') {
    pool.on('connect', () => logPoolStatus('after connect'))
    pool.on('acquire', () => logPoolStatus('after acquire'))
    pool.on('release', () => logPoolStatus('after release'))
    pool.on('remove', () => logPoolStatus('after remove'))
  }

  const adapter = new PrismaPg(pool)

  const client = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

  return client
}

const existingClient = globalForPrisma.prisma
if (existingClient) {
  console.log(`[Prisma] Reusing existing client (pid: ${process.pid})`)
}
export const prisma = existingClient ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
  console.log(`[Prisma] Stored client in globalThis (pid: ${process.pid})`)
}

// Re-export commonly used types from the generated client
// Note: Using named exports instead of `export *` to avoid Turbopack CommonJS warning
export { PrismaClient, Prisma } from './generated/prisma/client.js'

// Re-export system settings utilities
export * from './system-settings.js'

// Re-export validation utilities
export * from './validation.js'

// Re-export visibility predicates (A1 semantics)
export * from './visibility.js'

// Re-export embedding text builder (shared between API and harvester)
export * from './embedding-text.js'

// Re-export schema validation utilities (for startup checks)
export * from './schema-validation.js'
