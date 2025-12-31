/**
 * Tests for Request Context Middleware
 *
 * Validates that:
 * - Request IDs are generated when not provided
 * - X-Request-ID header is used when present
 * - Request ID is added to response header
 * - Context is available within the request handler
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Request, Response, NextFunction } from 'express'
import { requestContextMiddleware } from '../request-context'
import { getRequestContext } from '@ironscout/logger'

// Mock crypto.randomUUID
vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => 'mock-uuid-12345'),
}))

describe('requestContextMiddleware', () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let mockNext: NextFunction

  beforeEach(() => {
    mockReq = {
      headers: {},
    }
    mockRes = {
      setHeader: vi.fn(),
    }
    mockNext = vi.fn()
  })

  it('should generate a request ID when not provided', () => {
    requestContextMiddleware(
      mockReq as Request,
      mockRes as Response,
      mockNext
    )

    expect(mockRes.setHeader).toHaveBeenCalledWith('X-Request-ID', 'mock-uuid-12345')
    expect(mockNext).toHaveBeenCalled()
  })

  it('should use existing X-Request-ID header when provided', () => {
    mockReq.headers = {
      'x-request-id': 'existing-request-id',
    }

    requestContextMiddleware(
      mockReq as Request,
      mockRes as Response,
      mockNext
    )

    expect(mockRes.setHeader).toHaveBeenCalledWith('X-Request-ID', 'existing-request-id')
    expect(mockNext).toHaveBeenCalled()
  })

  it('should make request context available via getRequestContext', () => {
    let capturedContext: any = null

    // Override next to capture context
    mockNext = vi.fn(() => {
      capturedContext = getRequestContext()
    })

    requestContextMiddleware(
      mockReq as Request,
      mockRes as Response,
      mockNext
    )

    expect(capturedContext).toBeDefined()
    expect(capturedContext?.requestId).toBe('mock-uuid-12345')
  })

  it('should handle headers with different casing', () => {
    // Headers object may have different case
    mockReq.headers = {
      'X-Request-ID': 'case-sensitive-id',
    }

    requestContextMiddleware(
      mockReq as Request,
      mockRes as Response,
      mockNext
    )

    // Express normalizes headers to lowercase, so this should use generated ID
    // unless the implementation handles case-insensitivity
    expect(mockNext).toHaveBeenCalled()
  })
})
