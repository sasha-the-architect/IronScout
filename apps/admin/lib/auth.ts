/**
 * Admin Portal Authentication
 * 
 * Reads the NextAuth JWT token from the shared cookie (set by main web app)
 * and verifies the user is in the ADMIN_EMAILS list.
 */

import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { prisma } from '@ironscout/db';
import { logger } from './logger';

// Admin emails list
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

// Cookie name varies by environment
const SESSION_COOKIE_NAME = process.env.NODE_ENV === 'production'
  ? '__Secure-authjs.session-token'
  : 'authjs.session-token';

export interface AdminSession {
  userId: string;
  email: string;
  name?: string;
  image?: string;
}

/**
 * Get the current admin session from the NextAuth JWT cookie
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  try {
    const cookieStore = await cookies();
    
    // Debug: Log all available cookies (names only for security)
    const allCookies = cookieStore.getAll();
    logger.debug('Available cookies', { 
      cookieNames: allCookies.map(c => c.name),
      expectedCookie: SESSION_COOKIE_NAME,
      nodeEnv: process.env.NODE_ENV,
    });
    
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!token) {
      logger.warn('No session cookie found', { 
        cookieName: SESSION_COOKIE_NAME,
        availableCookies: allCookies.map(c => c.name),
        hint: 'User may need to log in at main site first',
      });
      return null;
    }
    
    logger.debug('Session cookie found', { tokenLength: token.length });

    // Verify the JWT
    const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
    if (!secret) {
      logger.error('NEXTAUTH_SECRET not configured', {
        hasNextAuthSecret: !!process.env.NEXTAUTH_SECRET,
        hasAuthSecret: !!process.env.AUTH_SECRET,
      });
      return null;
    }
    
    logger.debug('Secret configured', { secretLength: secret.length });

    const secretKey = new TextEncoder().encode(secret);
    
    try {
      const { payload } = await jwtVerify(token, secretKey, {
        algorithms: ['HS256'],
      });

      const email = (payload.email as string)?.toLowerCase();
      const userId = payload.sub as string;

      if (!email || !userId) {
        logger.warn('JWT missing email or sub', { hasEmail: !!email, hasSub: !!userId });
        return null;
      }

      // Check if user is in admin list
      logger.debug('Checking admin access', { 
        email, 
        adminEmailsCount: ADMIN_EMAILS.length,
        adminEmails: ADMIN_EMAILS, // Safe to log since it's server-side
      });
      
      if (!ADMIN_EMAILS.includes(email)) {
        logger.warn('User not in admin list', { 
          email, 
          adminEmails: ADMIN_EMAILS,
          hint: 'Add email to ADMIN_EMAILS env var',
        });
        return null;
      }

      logger.debug('Admin session verified', { email, userId });

      return {
        userId,
        email,
        name: payload.name as string | undefined,
        image: payload.picture as string | undefined,
      };
    } catch (jwtError) {
      logger.warn('JWT verification failed', {
        errorType: jwtError instanceof Error ? jwtError.name : 'unknown',
        hint: 'Check that NEXTAUTH_SECRET matches between web and admin apps',
      }, jwtError);
      return null;
    }
  } catch (error) {
    logger.error('Error getting admin session', {}, error);
    return null;
  }
}

/**
 * Require admin session - redirects to login if not authenticated
 */
export async function requireAdminSession(): Promise<AdminSession> {
  const session = await getAdminSession();
  
  if (!session) {
    throw new Error('UNAUTHORIZED');
  }
  
  return session;
}

/**
 * Check if current user is an admin
 */
export async function isAdmin(): Promise<boolean> {
  const session = await getAdminSession();
  return session !== null;
}

/**
 * Log an admin action to the audit log
 */
export async function logAdminAction(
  adminUserId: string,
  action: string,
  {
    dealerId,
    resource,
    resourceId,
    oldValue,
    newValue,
    ipAddress,
    userAgent,
  }: {
    dealerId?: string;
    resource?: string;
    resourceId?: string;
    oldValue?: unknown;
    newValue?: unknown;
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<void> {
  logger.debug('Creating admin audit log', { adminUserId, action, dealerId, resource });

  try {
    await prisma.adminAuditLog.create({
      data: {
        adminUserId,
        dealerId,
        action,
        resource,
        resourceId,
        oldValue: oldValue ? JSON.parse(JSON.stringify(oldValue)) : null,
        newValue: newValue ? JSON.parse(JSON.stringify(newValue)) : null,
        ipAddress,
        userAgent,
      },
    });

    logger.info('Admin audit log created', { adminUserId, action });
  } catch (error) {
    logger.error('Failed to create admin audit log', { adminUserId, action }, error);
    throw error;
  }
}
