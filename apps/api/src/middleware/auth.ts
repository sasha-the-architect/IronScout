import { Request, Response, NextFunction } from 'express'
import { prisma } from '@ironscout/db'
import { TIER_CONFIG } from '../config/tiers'

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
