/**
 * Admin Portal Authentication
 *
 * Uses NextAuth for OAuth-based authentication.
 * Verifies the user is in the ADMIN_EMAILS list.
 */

import { auth } from '@/lib/auth-config';
import { prisma } from '@ironscout/db';
import { logger } from './logger';

// Admin emails list
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

export interface AdminSession {
  userId: string;
  email: string;
  name?: string;
  image?: string;
}

/**
 * Get the current admin session from NextAuth
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  try {
    const session = await auth();

    if (!session || !session.user) {
      logger.debug('No session found');
      return null;
    }

    const email = session.user.email?.toLowerCase();
    const userId = session.user.id;

    if (!email || !userId) {
      logger.warn('Session missing email or id', { hasEmail: !!email, hasId: !!userId });
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
      name: session.user.name || undefined,
      image: session.user.image || undefined,
    };
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
