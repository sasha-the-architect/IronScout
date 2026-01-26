/**
 * ADR-015: Loadout ignores ignored affiliate runs.
 *
 * These tests assert the ignored-run filter is present in all loadout
 * aggregate queries that read prices.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@ironscout/db', () => ({
  prisma: {
    watchlist_items: {
      findMany: vi.fn(),
    },
    retailers: {
      count: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}))

vi.mock('../config/redis', () => ({
  getRedisClient: () => ({
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue('OK'),
  }),
}))

vi.mock('../ai-search/price-resolver', () => ({
  batchGetPricesViaProductLinks: vi.fn().mockResolvedValue(new Map()),
}))

vi.mock('../gun-locker', () => ({
  getGuns: vi.fn().mockResolvedValue([]),
}))

vi.mock('../firearm-ammo-preference', () => ({
  getPreferencesForFirearm: vi.fn().mockResolvedValue([]),
}))

import { prisma } from '@ironscout/db'
import { getLoadoutData } from '../loadout'

const mockPrisma = prisma as any

const getQueryText = (call: any[]): string => {
  const strings = call[0]
  if (Array.isArray(strings)) {
    return strings.join('')
  }
  if (strings?.raw && Array.isArray(strings.raw)) {
    return strings.raw.join('')
  }
  return ''
}

const expectIgnoredRunFilter = (query: string) => {
  expect(query).toContain('affiliate_feed_runs')
  expect(query).toContain('"affiliateFeedRunId"')
  expect(query).toContain('"ignoredAt"')
}

describe('loadout ADR-015 compliance', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockPrisma.watchlist_items.findMany.mockResolvedValue([
      {
        id: 'item-1',
        products: {
          id: 'product-1',
          name: 'Test Ammo',
          caliber: '9mm',
          brand: 'Test Brand',
          grainWeight: 115,
          bulletType: 'FMJ',
          roundCount: 50,
          imageUrl: null,
        },
      },
    ])

    mockPrisma.retailers.count.mockResolvedValue(1)
    mockPrisma.$queryRaw.mockResolvedValue([])
  })

  it('excludes prices from ignored runs in 90-day lowest calculation', async () => {
    await getLoadoutData('user-123')

    const queries = mockPrisma.$queryRaw.mock.calls.map(getQueryText)
    const lowestQuery = queries.find((q) => q.includes('MIN(pr.price)'))

    expect(lowestQuery).toBeTruthy()
    expectIgnoredRunFilter(lowestQuery!)
  })

  it('excludes prices from ignored runs in in-stock count', async () => {
    await getLoadoutData('user-123')

    const queries = mockPrisma.$queryRaw.mock.calls.map(getQueryText)
    const inStockQuery = queries.find(
      (q) => q.includes('COUNT(DISTINCT p.id)') && !q.includes('GROUP BY p.caliber')
    )

    expect(inStockQuery).toBeTruthy()
    expectIgnoredRunFilter(inStockQuery!)
  })

  it('excludes prices from ignored runs in top calibers', async () => {
    await getLoadoutData('user-123')

    const queries = mockPrisma.$queryRaw.mock.calls.map(getQueryText)
    const topCalibersQuery = queries.find((q) => q.includes('GROUP BY p.caliber'))

    expect(topCalibersQuery).toBeTruthy()
    expectIgnoredRunFilter(topCalibersQuery!)
  })
})
