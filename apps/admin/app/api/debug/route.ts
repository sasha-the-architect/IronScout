/**
 * Debug endpoint for diagnosing authentication issues
 * Only enabled when ADMIN_DEBUG=true
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const SESSION_COOKIE_NAME = process.env.NODE_ENV === 'production'
  ? '__Secure-authjs.session-token'
  : 'authjs.session-token';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

export async function GET() {
  // Only allow in debug mode
  if (process.env.ADMIN_DEBUG !== 'true') {
    return NextResponse.json({ error: 'Debug mode not enabled' }, { status: 403 });
  }

  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

  return NextResponse.json({
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      hasNextAuthSecret: !!process.env.NEXTAUTH_SECRET,
      hasAuthSecret: !!process.env.AUTH_SECRET,
      secretLength: (process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || '').length,
      adminEmailsConfigured: ADMIN_EMAILS.length > 0,
      adminEmailsCount: ADMIN_EMAILS.length,
      adminEmails: ADMIN_EMAILS,
    },
    cookies: {
      expectedCookieName: SESSION_COOKIE_NAME,
      availableCookieNames: allCookies.map(c => c.name),
      hasSessionCookie: !!sessionCookie,
      sessionCookieLength: sessionCookie?.value?.length || 0,
    },
    hints: [
      !sessionCookie && 'No session cookie found - user needs to log in at main site first',
      !(process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET) && 'NEXTAUTH_SECRET not configured',
      ADMIN_EMAILS.length === 0 && 'ADMIN_EMAILS not configured',
    ].filter(Boolean),
  });
}
