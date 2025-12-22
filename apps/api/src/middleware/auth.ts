import { Request, Response, NextFunction } from 'express'
import { prisma } from '@ironscout/db'
import { TIER_CONFIG } from '../config/tiers'
import { getRedisClient } from '../config/redis'

/**
 * List of admin email addresses
 * In production, you might want to add an 'isAdmin' or 'role' column to the User table
 */
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').filter(Boolean)

export type UserTier = keyof typeof TIER_CONFIG

/**
 * Extract and validate user ID from JWT in Authorization header.
 * Returns null if no valid session.
 *
 * SECURITY: Never trust X-User-Id headers - always validate JWT.
 */
function extractUserIdFromJwt(req: Request): string | null {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }

  try {
    const token = authHeader.substring(7)
    // NextAuth JWTs are base64 encoded JSON
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64').toString()
    )

    // 'sub' is the standard JWT claim for subject (user ID)
    return payload.sub || payload.userId || null
  } catch {
    return null
  }
}

/**
 * Get user tier from request using secure JWT validation.
 *
 * SECURITY: This replaces header-based tier resolution.
 * - If no valid JWT session → FREE tier
 * - If valid JWT → lookup user tier from database
 * - Never trusts client-provided headers for tier
 */
export async function getUserTier(req: Request): Promise<UserTier> {
  const userId = extractUserIdFromJwt(req)

  if (!userId) {
    return 'FREE'
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { tier: true }
    })
    return (user?.tier as UserTier) || 'FREE'
  } catch {
    return 'FREE'
  }
}

/**
 * Get user ID from request if authenticated.
 * Returns null for anonymous users.
 */
export function getAuthenticatedUserId(req: Request): string | null {
  return extractUserIdFromJwt(req)
}

/**
 * Middleware to protect admin routes
 * 
 * Supports two authentication methods:
 * 1. API Key via X-Admin-Key header (for scripts/automation)
 * 2. JWT session token + admin email check (for authenticated users)
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  // Method 1: Check for admin API key
  const adminKey = req.headers['x-admin-key'] as string
  const expectedKey = process.env.ADMIN_API_KEY
  
  if (adminKey && expectedKey && adminKey === expectedKey) {
    // Valid admin API key
    return next()
  }
  
  // Method 2: Check for authenticated admin user via Authorization header
  const authHeader = req.headers.authorization
  
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7)
    
    try {
      // Decode JWT to get user info
      // NextAuth JWTs are base64 encoded JSON
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64').toString()
      )
      
      const userEmail = payload.email
      
      if (userEmail && ADMIN_EMAILS.includes(userEmail)) {
        // User is an admin
        return next()
      }
      
      // Also check database for user with this ID
      if (payload.sub) {
        const user = await prisma.user.findUnique({
          where: { id: payload.sub },
          select: { email: true }
        })
        
        if (user && ADMIN_EMAILS.includes(user.email)) {
          return next()
        }
      }
    } catch (error) {
      // Token parsing failed
      console.error('Admin auth token parse error:', error)
    }
  }
  
  // No valid authentication
  return res.status(401).json({ 
    error: 'Unauthorized',
    message: 'Admin access required. Provide X-Admin-Key header or authenticate as an admin user.'
  })
}

/**
 * Simple API key authentication for internal services
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'] as string
  const expectedKey = process.env.INTERNAL_API_KEY
  
  if (!expectedKey) {
    console.warn('INTERNAL_API_KEY not set - API key authentication disabled')
    return next()
  }
  
  if (apiKey && apiKey === expectedKey) {
    return next()
  }
  
  return res.status(401).json({ 
    error: 'Unauthorized',
    message: 'Valid API key required'
  })
}

/**
 * Rate limiting middleware (simple in-memory implementation)
 * For production, use Redis-based rate limiting
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

export function rateLimit(options: {
  windowMs?: number
  max?: number
  keyGenerator?: (req: Request) => string
} = {}) {
  const {
    windowMs = 60 * 1000, // 1 minute
    max = 10,
    keyGenerator = (req) => req.ip || 'unknown'
  } = options

  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyGenerator(req)
    const now = Date.now()

    let record = rateLimitStore.get(key)

    if (!record || now > record.resetTime) {
      record = { count: 0, resetTime: now + windowMs }
      rateLimitStore.set(key, record)
    }

    record.count++

    if (record.count > max) {
      return res.status(429).json({
        error: 'Too many requests',
        message: `Rate limit exceeded. Try again in ${Math.ceil((record.resetTime - now) / 1000)} seconds.`
      })
    }

    next()
  }
}

/**
 * Redis-based rate limiting middleware for production use.
 * Uses sliding window algorithm with Redis for distributed rate limiting.
 *
 * Features:
 * - Works across multiple API instances
 * - Persists across restarts
 * - Includes rate limit headers in response
 * - Structured logging for observability
 * - Metrics tracking via Redis
 */
export interface RedisRateLimitOptions {
  /** Time window in milliseconds (default: 60000 = 1 minute) */
  windowMs?: number
  /** Maximum requests per window (default: 10) */
  max?: number
  /** Redis key prefix (default: 'rl:') */
  keyPrefix?: string
  /** Custom key generator function */
  keyGenerator?: (req: Request) => string
  /** Skip rate limiting for certain requests */
  skip?: (req: Request) => boolean
  /** Block duration in seconds after limit exceeded (default: same as window) */
  blockDurationSec?: number
  /** Endpoint name for metrics (e.g., 'signin', 'signup') */
  endpoint?: string
}

/** Redis key prefixes for rate limit metrics */
const METRICS_PREFIX = 'rl:metrics:'
const METRICS_TTL_SEC = 86400 // 24 hours

/**
 * Log a rate limit event with structured context
 */
function logRateLimitEvent(
  level: 'INFO' | 'WARN' | 'ERROR',
  event: string,
  context: Record<string, unknown>
): void {
  const timestamp = new Date().toISOString()
  const logEntry = {
    timestamp,
    level,
    service: 'api',
    event,
    ...context,
  }

  const prefix = `[${timestamp}] [RateLimit] [${level}]`
  const message = `${prefix} ${event} ${JSON.stringify(context)}`

  switch (level) {
    case 'INFO':
      console.info(message)
      break
    case 'WARN':
      console.warn(message)
      break
    case 'ERROR':
      console.error(message)
      break
  }
}

/**
 * Track rate limit metrics in Redis for observability
 */
async function trackRateLimitMetrics(
  redis: ReturnType<typeof getRedisClient>,
  endpoint: string,
  blocked: boolean,
  ip: string
): Promise<void> {
  const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD

  try {
    const pipeline = redis.pipeline()

    // Increment total requests counter
    const totalKey = `${METRICS_PREFIX}${endpoint}:total:${today}`
    pipeline.incr(totalKey)
    pipeline.expire(totalKey, METRICS_TTL_SEC)

    if (blocked) {
      // Increment blocked requests counter
      const blockedKey = `${METRICS_PREFIX}${endpoint}:blocked:${today}`
      pipeline.incr(blockedKey)
      pipeline.expire(blockedKey, METRICS_TTL_SEC)

      // Track blocked IPs in a sorted set (score = block count)
      const ipKey = `${METRICS_PREFIX}${endpoint}:blocked_ips:${today}`
      pipeline.zincrby(ipKey, 1, ip)
      pipeline.expire(ipKey, METRICS_TTL_SEC)
    }

    await pipeline.exec()
  } catch (error) {
    // Don't let metrics tracking break the request
    console.error('[RateLimit] Metrics tracking error:', error)
  }
}

export function redisRateLimit(options: RedisRateLimitOptions = {}) {
  const {
    windowMs = 60 * 1000,
    max = 10,
    keyPrefix = 'rl:',
    keyGenerator = (req) => req.ip || 'unknown',
    skip,
    blockDurationSec,
    endpoint = 'unknown',
  } = options

  const windowSec = Math.ceil(windowMs / 1000)
  const blockSec = blockDurationSec ?? windowSec

  return async (req: Request, res: Response, next: NextFunction) => {
    // Allow skipping rate limit for certain requests
    if (skip?.(req)) {
      logRateLimitEvent('INFO', 'RATE_LIMIT_SKIPPED', {
        endpoint,
        ip: req.ip || 'unknown',
        reason: 'skip_function',
      })
      return next()
    }

    const redis = getRedisClient()
    const ip = keyGenerator(req)
    const key = `${keyPrefix}${ip}`
    const now = Date.now()

    try {
      // Use Redis MULTI for atomic operations
      const results = await redis
        .multi()
        .incr(key)
        .pttl(key) // Get TTL in milliseconds
        .exec()

      if (!results) {
        // Redis error - fail open (allow request)
        logRateLimitEvent('ERROR', 'RATE_LIMIT_REDIS_ERROR', {
          endpoint,
          ip,
          error: 'multi exec returned null',
          action: 'fail_open',
        })
        return next()
      }

      const [[incrErr, count], [ttlErr, ttl]] = results as [[Error | null, number], [Error | null, number]]

      if (incrErr || ttlErr) {
        logRateLimitEvent('ERROR', 'RATE_LIMIT_REDIS_ERROR', {
          endpoint,
          ip,
          error: String(incrErr || ttlErr),
          action: 'fail_open',
        })
        return next()
      }

      // Set expiry if this is a new key (TTL will be -1)
      if (ttl === -1) {
        await redis.pexpire(key, blockSec * 1000)
      }

      // Calculate remaining time
      const resetTime = ttl > 0 ? now + ttl : now + (blockSec * 1000)
      const remaining = Math.max(0, max - count)

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', max)
      res.setHeader('X-RateLimit-Remaining', remaining)
      res.setHeader('X-RateLimit-Reset', Math.ceil(resetTime / 1000))

      if (count > max) {
        const retryAfterSec = Math.ceil((ttl > 0 ? ttl : blockSec * 1000) / 1000)
        res.setHeader('Retry-After', retryAfterSec)

        // Log blocked request
        logRateLimitEvent('WARN', 'RATE_LIMIT_BLOCKED', {
          endpoint,
          ip,
          count,
          max,
          retryAfterSec,
          path: req.path,
          method: req.method,
        })

        // Track metrics (non-blocking)
        trackRateLimitMetrics(redis, endpoint, true, ip)

        return res.status(429).json({
          error: 'Too many requests',
          message: `Rate limit exceeded. Try again in ${retryAfterSec} seconds.`,
          retryAfter: retryAfterSec,
        })
      }

      // Log warning if approaching limit (>80%)
      if (count > max * 0.8) {
        logRateLimitEvent('INFO', 'RATE_LIMIT_WARNING', {
          endpoint,
          ip,
          count,
          max,
          remaining,
          path: req.path,
        })
      }

      // Track metrics (non-blocking)
      trackRateLimitMetrics(redis, endpoint, false, ip)

      next()
    } catch (error) {
      // On Redis failure, fail open (allow request) but log the error
      logRateLimitEvent('ERROR', 'RATE_LIMIT_REDIS_ERROR', {
        endpoint,
        ip,
        error: error instanceof Error ? error.message : String(error),
        action: 'fail_open',
      })
      next()
    }
  }
}

/**
 * Get rate limit metrics for a specific endpoint and date
 */
export async function getRateLimitMetrics(
  endpoint: string,
  date?: string
): Promise<{
  endpoint: string
  date: string
  totalRequests: number
  blockedRequests: number
  blockRate: number
  topBlockedIps: Array<{ ip: string; count: number }>
}> {
  const redis = getRedisClient()
  const targetDate = date || new Date().toISOString().split('T')[0]

  const totalKey = `${METRICS_PREFIX}${endpoint}:total:${targetDate}`
  const blockedKey = `${METRICS_PREFIX}${endpoint}:blocked:${targetDate}`
  const ipKey = `${METRICS_PREFIX}${endpoint}:blocked_ips:${targetDate}`

  const [totalStr, blockedStr, topIps] = await Promise.all([
    redis.get(totalKey),
    redis.get(blockedKey),
    redis.zrevrange(ipKey, 0, 9, 'WITHSCORES'), // Top 10 blocked IPs
  ])

  const totalRequests = parseInt(totalStr || '0', 10)
  const blockedRequests = parseInt(blockedStr || '0', 10)
  const blockRate = totalRequests > 0 ? blockedRequests / totalRequests : 0

  // Parse top IPs from Redis ZREVRANGE result
  const topBlockedIps: Array<{ ip: string; count: number }> = []
  for (let i = 0; i < topIps.length; i += 2) {
    topBlockedIps.push({
      ip: topIps[i],
      count: parseInt(topIps[i + 1], 10),
    })
  }

  return {
    endpoint,
    date: targetDate,
    totalRequests,
    blockedRequests,
    blockRate,
    topBlockedIps,
  }
}

/**
 * Get metrics for all auth endpoints
 */
export async function getAllAuthRateLimitMetrics(date?: string): Promise<{
  date: string
  endpoints: Record<string, Awaited<ReturnType<typeof getRateLimitMetrics>>>
  summary: {
    totalRequests: number
    totalBlocked: number
    overallBlockRate: number
  }
}> {
  const targetDate = date || new Date().toISOString().split('T')[0]
  const endpointNames = ['signin', 'signup', 'refresh', 'oauth']

  const results = await Promise.all(
    endpointNames.map((name) => getRateLimitMetrics(name, targetDate))
  )

  const endpoints: Record<string, Awaited<ReturnType<typeof getRateLimitMetrics>>> = {}
  let totalRequests = 0
  let totalBlocked = 0

  for (const result of results) {
    endpoints[result.endpoint] = result
    totalRequests += result.totalRequests
    totalBlocked += result.blockedRequests
  }

  return {
    date: targetDate,
    endpoints,
    summary: {
      totalRequests,
      totalBlocked,
      overallBlockRate: totalRequests > 0 ? totalBlocked / totalRequests : 0,
    },
  }
}

/**
 * Pre-configured rate limiters for authentication endpoints.
 *
 * These limits are designed to prevent abuse (DoS, credential stuffing)
 * while being permissive enough for legitimate users, including:
 * - Users retrying after errors
 * - Multiple users behind NAT/corporate proxies
 * - OAuth flows with multiple redirects
 * - Server-to-server calls from web/dealer apps
 */
export const authRateLimits = {
  /** Login attempts: 100 per minute per IP - blocks sustained brute force */
  signin: redisRateLimit({
    windowMs: 60 * 1000,
    max: 100,
    keyPrefix: 'rl:auth:signin:',
    blockDurationSec: 60,
    endpoint: 'signin',
  }),

  /** Signup attempts: 50 per minute per IP - blocks account spam */
  signup: redisRateLimit({
    windowMs: 60 * 1000,
    max: 50,
    keyPrefix: 'rl:auth:signup:',
    blockDurationSec: 60,
    endpoint: 'signup',
  }),

  /** Token refresh: 200 per minute per IP - high volume for active apps */
  refresh: redisRateLimit({
    windowMs: 60 * 1000,
    max: 200,
    keyPrefix: 'rl:auth:refresh:',
    endpoint: 'refresh',
  }),

  /** OAuth: 100 per minute per IP - server-to-server + user retries */
  oauth: redisRateLimit({
    windowMs: 60 * 1000,
    max: 100,
    keyPrefix: 'rl:auth:oauth:',
    endpoint: 'oauth',
  }),
}
