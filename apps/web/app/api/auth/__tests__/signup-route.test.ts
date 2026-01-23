import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { POST } from '../signup/route'

const SignupResponseSchema = z.object({
  message: z.string(),
  user: z.object({
    id: z.string(),
    email: z.string().email(),
    name: z.string().nullable(),
    tier: z.string(),
    image: z.string().nullable(),
    createdAt: z.string(),
  }),
  accessToken: z.string(),
  refreshToken: z.string(),
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('web api/auth/signup route', () => {
  it('returns 201 and forwards API payload on success', async () => {
    const apiPayload = {
      message: 'User created successfully',
      user: {
        id: 'user-1',
        email: 'user@example.com',
        name: null,
        tier: 'FREE',
        image: null,
        createdAt: new Date().toISOString(),
      },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    }

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(apiPayload), { status: 201 })
      )
    )

    const request = new Request('http://localhost/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email: 'user@example.com', password: 'password123' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(SignupResponseSchema.parse(body)).toEqual(apiPayload)
  })

  it('passes through API error status and body', async () => {
    const apiPayload = { error: 'Validation failed' }

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(apiPayload), { status: 400 })
      )
    )

    const request = new Request('http://localhost/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email: 'bad' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual(apiPayload)
  })

  it('returns 500 when upstream fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))

    const request = new Request('http://localhost/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email: 'user@example.com', password: 'password123' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({ error: 'An error occurred during signup' })
  })
})
