import Redis from 'ioredis'
import { logger } from './logger'

const log = logger.redis

const redisHost = process.env.REDIS_HOST || 'localhost'
const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10)
const redisPassword = process.env.REDIS_PASSWORD || undefined

export const redisConnection = {
  host: redisHost,
  port: redisPort,
  password: redisPassword,
  maxRetriesPerRequest: null,
  // Keepalive to prevent idle connection drops (ECONNRESET)
  keepAlive: 30000,
  // Queue commands while reconnecting
  enableOfflineQueue: true,
  // Reconnection settings for dropped connections
  retryStrategy(times: number) {
    const delay = Math.min(times * 500, 30000)
    log.info('Reconnecting', { attempt: times, delayMs: delay })
    return delay
  },
}

export const createRedisClient = () => {
  return new Redis(redisConnection)
}

/**
 * Warm up Redis connection with retries
 * Similar to database warmup - ensures Redis is available before starting workers
 */
export async function warmupRedis(maxAttempts = 5): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      log.info('Connection attempt', { attempt, maxAttempts, host: redisHost, port: redisPort })
      const client = new Redis({
        host: redisHost,
        port: redisPort,
        password: redisPassword,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null, // Disable retries for warmup check
        connectTimeout: 5000,
      })

      await client.ping()
      await client.quit()
      log.info('Connection established successfully')
      return true
    } catch (error) {
      const err = error as Error
      log.error('Connection failed', { error: err.message })

      if (attempt < maxAttempts) {
        const delayMs = Math.min(2000 * Math.pow(2, attempt - 1), 30000)
        log.info('Retrying', { delayMs })
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    }
  }

  log.error('Failed to establish connection after all attempts', { maxAttempts })
  return false
}
