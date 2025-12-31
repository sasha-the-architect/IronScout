import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { loggers } from './lib/logger';

export default function proxy(request: NextRequest) {
  // Debug: Log all cookies received by proxy
  const cookies = request.cookies.getAll();
  loggers.auth.debug('Proxy request', {
    url: request.url,
    cookies: cookies.map(c => c.name)
  });

  const sessionCookie = request.cookies.get('__Secure-authjs.session-token');
  loggers.auth.debug('Session cookie check', { sessionCookiePresent: !!sessionCookie });

  // Allow the request to continue - auth check happens in layout
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except static files
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
