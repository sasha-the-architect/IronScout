import { describe, expect, it, vi } from 'vitest'
import { POST } from '../feed/refresh/route'
import { getSession } from '@/lib/auth'

class MockRetailerContextError extends Error {
  public readonly code: string
  public readonly statusCode: number

  constructor(code: string, message: string, statusCode: number) {
    super(message)
    this.code = code
    this.statusCode = statusCode
  }
}

vi.mock('@/lib/auth', () => ({
  getSession: vi.fn(),
  requireRetailerContext: vi.fn(),
  RetailerContextError: MockRetailerContextError,
}))

describe('merchant api/feed/refresh route', () => {
  it('returns 401 when session is missing', async () => {
    const mockedGetSession = vi.mocked(getSession)
    mockedGetSession.mockResolvedValue(null)

    const request = new Request('http://localhost/api/feed/refresh', {
      method: 'POST',
      body: JSON.stringify({ feedId: 'feed-1' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toEqual({ error: 'Unauthorized' })
  })
})
