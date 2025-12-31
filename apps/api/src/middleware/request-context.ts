/**
 * Request Context Middleware
 *
 * Provides request correlation via AsyncLocalStorage.
 * All log entries within a request will include the requestId.
 *
 * Usage:
 * - X-Request-ID header is used if present (for distributed tracing)
 * - Otherwise, a new UUID is generated
 * - The requestId is also added to the response header
 */

import { Request, Response, NextFunction } from 'express'
import { randomUUID } from 'crypto'
import { withRequestContext } from '@ironscout/logger'

/**
 * Middleware that wraps each request in a request context
 * providing automatic requestId correlation for all log entries
 */
export function requestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Use existing request ID from header or generate new one
  const requestId = (req.headers['x-request-id'] as string) || randomUUID()

  // Set response header for tracing
  res.setHeader('X-Request-ID', requestId)

  // Run the rest of the middleware chain within the request context
  // This makes requestId available to all loggers via AsyncLocalStorage
  withRequestContext({ requestId }, () => {
    next()
  })
}
