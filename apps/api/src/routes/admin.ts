/**
 * Admin Routes - Operations and monitoring endpoints
 *
 * All endpoints require admin authentication via:
 * - X-Admin-Key header (for scripts/automation)
 * - Bearer token with admin email (for authenticated users)
 *
 * Endpoints:
 * - GET /api/admin/rate-limits - Get rate limit metrics for all auth endpoints
 * - GET /api/admin/rate-limits/:endpoint - Get metrics for specific endpoint
 * - DELETE /api/admin/rate-limits/:ip - Clear rate limit for specific IP
 */

import { Router, Request, Response } from 'express'
import { z } from 'zod'
import {
  requireAdmin,
  getAllAuthRateLimitMetrics,
  getRateLimitMetrics,
} from '../middleware/auth'
import { getRedisClient } from '../config/redis'
import { loggers } from '../config/logger'

const log = loggers.admin

const router: any = Router()

// Apply admin auth to all routes
router.use(requireAdmin)

// ============================================================================
// RATE LIMIT METRICS
// ============================================================================

/**
 * GET /api/admin/rate-limits
 * Get metrics for all auth rate-limited endpoints
 */
router.get('/rate-limits', async (req: Request, res: Response) => {
  try {
    const date = req.query.date as string | undefined
    const metrics = await getAllAuthRateLimitMetrics(date)

    return res.json(metrics)
  } catch (error) {
    log.error('Error fetching rate limit metrics', { error }, error as Error)
    return res.status(500).json({
      error: 'Failed to fetch rate limit metrics',
    })
  }
})

/**
 * GET /api/admin/rate-limits/:endpoint
 * Get metrics for a specific endpoint
 */
router.get('/rate-limits/:endpoint', async (req: Request, res: Response) => {
  try {
    const { endpoint } = req.params
    const date = req.query.date as string | undefined

    const validEndpoints = ['signin', 'signup', 'refresh', 'oauth']
    if (!validEndpoints.includes(endpoint)) {
      return res.status(400).json({
        error: 'Invalid endpoint',
        validEndpoints,
      })
    }

    const metrics = await getRateLimitMetrics(endpoint, date)
    return res.json(metrics)
  } catch (error) {
    log.error('Error fetching endpoint metrics', { error }, error as Error)
    return res.status(500).json({
      error: 'Failed to fetch endpoint metrics',
    })
  }
})

/**
 * DELETE /api/admin/rate-limits/:ip
 * Clear rate limit for a specific IP address (unblock)
 */
const clearRateLimitSchema = z.object({
  endpoints: z.array(z.enum(['signin', 'signup', 'refresh', 'oauth'])).optional(),
})

router.delete('/rate-limits/:ip', async (req: Request, res: Response) => {
  try {
    const { ip } = req.params
    const parsed = clearRateLimitSchema.safeParse(req.body)

    const endpoints = parsed.success && parsed.data.endpoints
      ? parsed.data.endpoints
      : ['signin', 'signup', 'refresh', 'oauth']

    const redis = getRedisClient()
    const keysToDelete: string[] = []

    for (const endpoint of endpoints) {
      keysToDelete.push(`rl:auth:${endpoint}:${ip}`)
    }

    if (keysToDelete.length > 0) {
      await redis.del(...keysToDelete)
    }

    log.info('Cleared rate limits', { ip, endpoints, keysDeleted: keysToDelete.length })

    return res.json({
      message: 'Rate limits cleared',
      ip,
      endpoints,
      keysDeleted: keysToDelete.length,
    })
  } catch (error) {
    log.error('Error clearing rate limit', { error }, error as Error)
    return res.status(500).json({
      error: 'Failed to clear rate limit',
    })
  }
})

/**
 * GET /api/admin/rate-limits/status/:ip
 * Check current rate limit status for a specific IP
 */
router.get('/rate-limits/status/:ip', async (req: Request, res: Response) => {
  try {
    const { ip } = req.params
    const redis = getRedisClient()

    const endpoints = ['signin', 'signup', 'refresh', 'oauth']
    const status: Record<string, { count: number; ttlMs: number; blocked: boolean }> = {}

    const limits: Record<string, number> = {
      signin: 5,
      signup: 3,
      refresh: 30,
      oauth: 10,
    }

    for (const endpoint of endpoints) {
      const key = `rl:auth:${endpoint}:${ip}`
      const [countStr, ttl] = await Promise.all([
        redis.get(key),
        redis.pttl(key),
      ])

      const count = parseInt(countStr || '0', 10)
      const max = limits[endpoint]

      status[endpoint] = {
        count,
        ttlMs: ttl > 0 ? ttl : 0,
        blocked: count > max,
      }
    }

    return res.json({
      ip,
      status,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    log.error('Error checking rate limit status', { error }, error as Error)
    return res.status(500).json({
      error: 'Failed to check rate limit status',
    })
  }
})

export { router as adminRouter }
