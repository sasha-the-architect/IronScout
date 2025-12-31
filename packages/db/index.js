// Note: dotenv should be loaded by the consuming app (harvester, api, etc.)
// before importing this module. We don't load it here to avoid path issues
// and conflicts with shell environment variables.
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/prisma/client.js'

const globalForPrisma = globalThis

function createPrismaClient() {
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
    max: 10,                       // Maximum connections in pool
    min: 0,                        // Don't eagerly create connections (avoids startup failures)
    idleTimeoutMillis: 30000,      // Close idle connections after 30s
    connectionTimeoutMillis: 10000, // Fail connection attempt after 10s
    allowExitOnIdle: false,        // Keep pool alive
  })

  // Handle pool errors gracefully (prevents crash on transient failures)
  pool.on('error', (err) => {
    console.error('[Prisma Pool] Unexpected error on idle client:', err.message)
    // Don't crash - pool will attempt to reconnect on next query
  })

  const adapter = new PrismaPg(pool)

  const client = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

  return client
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

// Re-export all types from the generated client
export * from './generated/prisma/client.js'

// Re-export system settings utilities
export * from './system-settings.js'
