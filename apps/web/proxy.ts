/**
 * Next.js Proxy
 *
 * Adds structured request logging with timestamps and log levels.
 * Runs on every request before the route handler.
 *
 * Note: proxy.ts runs on Node.js runtime (not Edge), so we can use
 * @ironscout/logger directly for consistent structured logging.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createLogger } from '@ironscout/logger'

const log = createLogger('web:proxy')

export default function proxy(request: NextRequest) {
  const start = Date.now()
  const { pathname, search } = request.nextUrl
  const method = request.method

  // Skip logging for static assets and internal Next.js routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.match(/\.(ico|png|jpg|jpeg|svg|css|js|woff|woff2)$/)
  ) {
    return NextResponse.next()
  }

  // Log incoming request at debug level
  log.debug('Incoming request', {
    method,
    path: pathname,
    query: search || undefined,
    userAgent: request.headers.get('user-agent')?.slice(0, 100),
  })

  // Create response
  const response = NextResponse.next()

  // Log request completion
  const durationMs = Date.now() - start
  log.info(`${method} ${pathname}`, {
    durationMs,
    query: search || undefined,
  })

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
