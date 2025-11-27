import Redis from 'ioredis'

const redisHost = process.env.REDIS_HOST || 'localhost'
const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10)
const redisPassword = process.env.REDIS_PASSWORD || undefined

export const redisConnection = {
  host: redisHost,
  port: redisPort,
  password: redisPassword,
  maxRetriesPerRequest: null,
}

export const createRedisClient = () => {
  return new Redis(redisConnection)
}
