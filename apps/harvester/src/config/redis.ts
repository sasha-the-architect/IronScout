import Redis from 'ioredis'
import { logger } from './logger'

const log = logger.redis

const redisHost = process.env.REDIS_HOST || 'localhost'
const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10)
const redisPassword = process.env.REDIS_PASSWORD || undefined

// Circuit breaker state for reducing log spam during prolonged outages
let consecutiveFailures = 0
let lastCircuitBreakerLog = 0

export const redisConnection = {
  host: redisHost,
  port: redisPort,
  password: redisPassword,
  maxRetriesPerRequest: null,
  // Keepalive to prevent idle connection drops (ECONNRESET)
  // Sends TCP keepalive probes every 10 seconds
  keepAlive: 10000,
  // Connection timeout for initial connect
  connectTimeout: 10000,
  // Command timeout - detect dead connections faster
  commandTimeout: 30000,
  // Queue commands while reconnecting
  enableOfflineQueue: true,
  // Lazy connect - don't connect until first command
  lazyConnect: false,
  // Reconnection settings for dropped connections
  retryStrategy(times: number) {
    consecutiveFailures = times

    // Circuit breaker: after 20 attempts, reduce logging frequency
    if (times > 20) {
      const now = Date.now()
      // Log once per minute during prolonged outage
      if (now - lastCircuitBreakerLog > 60000) {
        lastCircuitBreakerLog = now
        log.error('Redis circuit breaker: prolonged outage', {
          attempts: times,
          host: redisHost,
          port: redisPort,
        })
      }
      return 30000 // Cap at 30s, keep trying
    }

    const delay = Math.min(times * 500, 30000)
    log.info('Reconnecting', { attempt: times, delayMs: delay })
    return delay
  },
  // Log reconnection events
  reconnectOnError(err: Error) {
    const targetErrors = [
      'READONLY',
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'EHOSTUNREACH',
      'ENETUNREACH',
      'ENOTFOUND',
    ]
    if (targetErrors.some(e => err.message.includes(e))) {
      // Only log if not in circuit breaker mode
      if (consecutiveFailures <= 20) {
        log.warn('Reconnecting due to error', { error: err.message })
      }
      return true
    }
    return false
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
