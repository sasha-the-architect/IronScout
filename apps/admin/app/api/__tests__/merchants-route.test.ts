import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { NextRequest } from 'next/server'
import { GET } from '../merchants/[id]/route'
import { getAdminSession } from '@/lib/auth'
import { prisma } from '@ironscout/db'

vi.mock('@/lib/auth', () => ({
  getAdminSession: vi.fn(),
}))

vi.mock('@ironscout/db', () => ({
  prisma: {
    merchants: {
      findUnique: vi.fn(),
    },
  },
}))

const MerchantSchema = z.object({
  id: z.string(),
  businessName: z.string(),
  websiteUrl: z.string(),
  status: z.string(),
  tier: z.string(),
})

describe('admin api/merchants/[id] route', () => {
  const mockedGetAdminSession = vi.mocked(getAdminSession)
  const mockedFindUnique = vi.mocked(prisma.merchants.findUnique)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when session is missing', async () => {
    mockedGetAdminSession.mockResolvedValue(null)

    const request = new NextRequest('http://localhost/api/merchants/merchant-1')
    const response = await GET(request, { params: Promise.resolve({ id: 'merchant-1' }) })
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toEqual({ error: 'Unauthorized' })
  })

  it('returns 404 when merchant is not found', async () => {
    mockedGetAdminSession.mockResolvedValue({ userId: 'admin-1', email: 'admin@example.com' })
    mockedFindUnique.mockResolvedValue(null)

    const request = new NextRequest('http://localhost/api/merchants/missing')
    const response = await GET(request, { params: Promise.resolve({ id: 'missing' }) })
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body).toEqual({ error: 'Merchant not found' })
  })

  it('returns 500 on database error', async () => {
    mockedGetAdminSession.mockResolvedValue({ userId: 'admin-1', email: 'admin@example.com' })
    mockedFindUnique.mockRejectedValue(new Error('db failure'))

    const request = new NextRequest('http://localhost/api/merchants/merchant-2')
    const response = await GET(request, { params: Promise.resolve({ id: 'merchant-2' }) })
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({ error: 'Failed to fetch merchant' })
  })

  it('returns merchant payload when found', async () => {
    const merchant = {
      id: 'merchant-3',
      businessName: 'Acme Ammo',
      websiteUrl: 'https://acme.example',
      status: 'ACTIVE',
      tier: 'FOUNDING',
    }

    mockedGetAdminSession.mockResolvedValue({ userId: 'admin-1', email: 'admin@example.com' })
    mockedFindUnique.mockResolvedValue(merchant as any)

    const request = new NextRequest('http://localhost/api/merchants/merchant-3')
    const response = await GET(request, { params: Promise.resolve({ id: 'merchant-3' }) })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(MerchantSchema.parse(body)).toEqual(merchant)
  })
})
