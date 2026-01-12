/**
 * Request Context Middleware
 *
 * Provides request correlation via AsyncLocalStorage.
 * All log entries within a request will include the requestId, traceId, and spanId.
 *
 * Headers (propagated from upstream or generated):
 * - X-Request-ID: Unique identifier for this specific request
 * - X-Trace-ID: Trace identifier that spans multiple services
 * - X-Span-ID: Identifier for this operation within the trace
 *
 * Usage:
 * - Incoming headers are used if present (for distributed tracing)
 * - Otherwise, new IDs are generated
 * - IDs are added to response headers for downstream correlation
 */

import { Request, Response, NextFunction } from 'express'
import { randomUUID } from 'crypto'
import { withRequestContext, generateTraceId, generateSpanId } from '@ironscout/logger'

/**
 * Middleware that wraps each request in a request context
 * providing automatic ID correlation for all log entries
 */
export function requestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Use existing IDs from headers or generate new ones
  const requestId = (req.headers['x-request-id'] as string) || randomUUID()
  const traceId = (req.headers['x-trace-id'] as string) || generateTraceId()
  const spanId = generateSpanId() // Always generate new span for this operation

  // Set response headers for tracing
  res.setHeader('X-Request-ID', requestId)
  res.setHeader('X-Trace-ID', traceId)
  res.setHeader('X-Span-ID', spanId)

  // Run the rest of the middleware chain within the request context
  // This makes all IDs available to loggers via AsyncLocalStorage
  withRequestContext({ requestId, traceId, spanId }, () => {
    next()
  })
}
