import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { logger } from '@/lib/logger';

const ADMIN_SITE_URL = process.env.NEXT_PUBLIC_ADMIN_URL || 'https://admin.ironscout.ai';

// Cookie name varies by environment
const SESSION_COOKIE_NAME = process.env.NODE_ENV === 'production'
  ? '__Secure-authjs.session-token'
  : 'authjs.session-token';

export async function GET() {
  const reqLogger = logger.child('logout');

  try {
    reqLogger.info('Admin logout request');

    // Clear the NextAuth session cookie
    const cookieStore = await cookies();

    // Delete the session cookie with proper domain for cross-subdomain clearing
    cookieStore.delete({
      name: SESSION_COOKIE_NAME,
      path: '/',
      domain: process.env.NODE_ENV === 'production' ? '.ironscout.ai' : undefined,
    });

    reqLogger.info('Admin logout successful, redirecting to admin site');

    return NextResponse.redirect(ADMIN_SITE_URL);
  } catch (error) {
    reqLogger.error('Admin logout failed', {}, error);
    // Still redirect even on error
    return NextResponse.redirect(ADMIN_SITE_URL);
  }
}

export async function POST() {
  // Support POST as well for form submissions
  return GET();
}
