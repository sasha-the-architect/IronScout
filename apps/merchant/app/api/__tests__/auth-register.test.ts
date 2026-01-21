import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { POST } from '../auth/register/route'
import { registerMerchant } from '@/lib/auth'
import {
  notifyNewMerchantSignup,
  sendMerchantVerificationEmail,
} from '@ironscout/notifications'

vi.mock('@/lib/auth', () => ({
  registerMerchant: vi.fn(),
}))

vi.mock('@ironscout/notifications', () => ({
  notifyNewMerchantSignup: vi.fn(),
  sendMerchantVerificationEmail: vi.fn(),
}))

const RegisterResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  emailSent: z.boolean(),
})

describe('merchant api/auth/register route', () => {
  const mockedRegisterMerchant = vi.mocked(registerMerchant)
  const mockedNotifySignup = vi.mocked(notifyNewMerchantSignup)
  const mockedSendVerification = vi.mocked(sendMerchantVerificationEmail)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 for invalid payloads', async () => {
    const request = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toHaveProperty('error')
  })

  it('returns 200 and success payload when registration succeeds', async () => {
    mockedRegisterMerchant.mockResolvedValue({
      success: true,
      merchant: { id: 'merchant-1', businessName: 'Acme Ammo' },
      merchantUser: { id: 'user-1', email: 'owner@acme.example', verifyToken: 'verify-token' },
    })

    mockedSendVerification.mockResolvedValue({ success: true, messageId: 'email-1' })
    mockedNotifySignup.mockResolvedValue({
      email: { success: true },
      slack: { success: true },
    })

    const request = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: 'owner@acme.example',
        password: 'password123',
        businessName: 'Acme Ammo',
        contactFirstName: 'Ava',
        contactLastName: 'Smith',
        websiteUrl: 'https://acme.example',
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(RegisterResponseSchema.parse(body)).toMatchObject({
      success: true,
      emailSent: true,
    })
  })

  it('returns 500 when registration throws', async () => {
    mockedRegisterMerchant.mockRejectedValue(new Error('db error'))

    const request = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: 'owner@acme.example',
        password: 'password123',
        businessName: 'Acme Ammo',
        contactFirstName: 'Ava',
        contactLastName: 'Smith',
        websiteUrl: 'https://acme.example',
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({ error: 'An unexpected error occurred' })
  })
})
