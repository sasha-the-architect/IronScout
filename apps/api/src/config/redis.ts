import Redis from 'ioredis'
import { logger } from './logger'

const log = logger.child('redis')

const redisHost = process.env.REDIS_HOST || 'localhost'
const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10)
const redisPassword = process.env.REDIS_PASSWORD || undefined

export const redisConnection = {
  host: redisHost,
  port: redisPort,
  password: redisPassword,
  maxRetriesPerRequest: null,
}

let redisClient: Redis | null = null

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(redisConnection)

    redisClient.on('error', (err) => {
      log.error('Connection error', { message: err.message })
    })

    redisClient.on('connect', () => {
      log.info('Connected successfully')
    })
  }
  return redisClient
}

export function createRedisClient(): Redis {
  return new Redis(redisConnection)
}
